// src/services/email.js - OPTIMIZED VERSION
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

/**
 * Email configuration
 */
function getEmailConfig() {
  return {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    host: process.env.EMAIL_HOST || 'imap.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  };
}

/**
 * Connect to email inbox
 */
function connectToInbox() {
  return new Promise((resolve, reject) => {
    const config = getEmailConfig();
    
    if (!config.user || !config.password) {
      reject(new Error('Email credentials not configured. Set EMAIL_USER and EMAIL_PASSWORD in .env'));
      return;
    }

    const imap = new Imap(config);

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          reject(err);
        } else {
          resolve({ imap, box });
        }
      });
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.connect();
  });
}

/**
 * Search for unread emails with filters
 */
function searchEmails(imap, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      maxEmails = parseInt(process.env.MAX_EMAILS_PER_CHECK) || 50,
      fromAddress = null,
      subjectContains = null,
    } = options;

    // Build search criteria
    const searchCriteria = ['UNSEEN'];
    
    if (fromAddress) {
      searchCriteria.push(['FROM', fromAddress]);
    }
    
    if (subjectContains) {
      searchCriteria.push(['SUBJECT', subjectContains]);
    }

    imap.search(searchCriteria, (err, results) => {
      if (err) {
        reject(err);
      } else {
        // Limit to most recent N emails to prevent overload
        const limitedResults = results.slice(-maxEmails);
        resolve(limitedResults);
      }
    });
  });
}

/**
 * Fetch and parse email - Optimized version
 */

export function fetchEmail(imap, uid) {
  return new Promise((resolve, reject) => {
    const fetch = imap.fetch(uid, { bodies: '', struct: true });

    let emailBuffer = Buffer.alloc(0);

    fetch.on('message', (msg) => {
      msg.on('body', (stream) => {
        stream.on('data', (chunk) => {
          emailBuffer = Buffer.concat([emailBuffer, chunk]);
        });
      });

      msg.once('end', async () => {
        try {
          const parsed = await simpleParser(emailBuffer);

          // Filter CSV attachments
          const csvAttachments = parsed.attachments?.filter(
            att =>
              att.contentType === 'text/csv' ||
              att.filename?.toLowerCase().endsWith('.csv')
          );

          if (!csvAttachments || csvAttachments.length === 0) {
            resolve(null); // no CSV attachments
            return;
          }

          resolve({
            subject: parsed.subject,
            date: parsed.date,
            attachments: csvAttachments.map(att => ({
              filename: att.filename,
              content: att.content
            }))
          });
        } catch (err) {
          reject(err);
        }
      });
    });

    fetch.once('error', reject);
  });
}


/**
 * Process emails in parallel batches
 */
async function fetchEmailsBatch(imap, uids, batchSize = 10) {
  const results = [];
  
  for (let i = 0; i < uids.length; i += batchSize) {
    const batch = uids.slice(i, i + batchSize);
    
    console.log(`   Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uids.length / batchSize)} (${batch.length} emails)...`);
    
    // Process batch in parallel
    const batchPromises = batch.map(uid => 
      fetchEmail(imap, uid).catch(err => {
        console.warn(`   ⚠ Error fetching email ${uid}:`, err.message);
        return null;
      })
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(Boolean)); // Filter out nulls
  }
  
  return results;
}

/**
 * Save attachment to temp directory
 */
async function saveAttachment(attachment, emailDate) {
  const tempDir = path.join(process.cwd(), 'temp');
  
  // Ensure temp directory exists
  try {
    await mkdirAsync(tempDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  // Create unique filename with timestamp
  const timestamp = emailDate ? new Date(emailDate).getTime() : Date.now();
  const filename = attachment.filename || `attachment_${timestamp}.csv`;
  const uniqueFilename = `${timestamp}_${filename}`;
  const filepath = path.join(tempDir, uniqueFilename);

  await writeFileAsync(filepath, attachment.content);

  return filepath;
}

/**
 * Filter emails by criteria
 */
function filterEmail(parsed, options) {
  const { fromAddress, subjectContains } = options;

  // Filter by sender if specified
  if (fromAddress && !parsed.from?.text?.toLowerCase().includes(fromAddress.toLowerCase())) {
    return false;
  }

  // Filter by subject if specified
  if (subjectContains && !parsed.subject?.toLowerCase().includes(subjectContains.toLowerCase())) {
    return false;
  }

  // Must have attachments
  if (!parsed.attachments || parsed.attachments.length === 0) {
    return false;
  }

  // Must have CSV attachments
  const hasCSV = parsed.attachments.some(att => 
    att.filename?.toLowerCase().endsWith('.csv')
  );

  return hasCSV;
}

/**
 * Extract CSV attachments from emails
 */
async function extractAttachments(parsedEmails, options) {
  const attachments = [];
  
  console.log(`\n   📎 Extracting CSV attachments...`);

  for (const parsed of parsedEmails) {
    if (!parsed) continue;

    // Apply filters
    // if (!filterEmail(parsed, options)) {
    //   continue;
    // }

    // Extract CSV attachments
    for (const attachment of parsed.attachments) {
      if (attachment.filename?.toLowerCase().endsWith('.csv')) {
        try {
          const filepath = await saveAttachment(attachment, parsed.date);
          
          attachments.push({
            filename: attachment.filename,
            filepath: filepath,
            from: parsed.from?.text,
            subject: parsed.subject,
            date: parsed.date,
            size: attachment.size,
          });

          console.log(`      ✓ Saved: ${attachment.filename}`);
        } catch (error) {
          console.error(`      ✗ Failed to save ${attachment.filename}:`, error.message);
        }
      }
    }
  }

  return attachments;
}

/**
 * Mark emails as read in batch
 */
function markEmailsAsRead(imap, uids) {
  return new Promise((resolve, reject) => {
    if (uids.length === 0) {
      resolve();
      return;
    }

    imap.addFlags(uids, ['\\Seen'], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Process emails and extract CSV attachments - OPTIMIZED
 */
export async function processIncomingEmails(options = {}) {
  const {
    markAsRead = true,
    fromAddress = null,
    subjectContains = null,
    batchSize = 10, // Process 10 emails in parallel
    maxEmails = 50, // Limit to 50 most recent emails
  } = options;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📧 Checking inbox for CSV attachments...`);
  console.log(`${'='.repeat(60)}`);

  let imap = null;
  const startTime = Date.now();

  try {
    // Connect to inbox
    const { imap: imapConn, box } = await connectToInbox();
    imap = imapConn;

    console.log(`   ✓ Connected to inbox: ${box.messages.total} total messages`);

    // Search for unread emails
    const messageIds = await searchEmails(imap, {
      maxEmails,
      fromAddress,
      subjectContains,
    });

    if (messageIds.length === 0) {
      console.log('   ℹ No unread messages found');
      imap.end();
      return { attachments: [], processed: 0, duration: 0 };
    }

    console.log(`   ✓ Found ${messageIds.length} unread messages (limited to ${maxEmails} most recent)`);

    // Fetch emails in parallel batches
    const parsedEmails = await fetchEmailsBatch(imap, messageIds, batchSize);
    console.log(`   ✓ Fetched ${parsedEmails.length} emails with attachments`);

    // Extract CSV attachments
    const attachments = await extractAttachments(parsedEmails, {
      fromAddress,
      subjectContains,
    });

    // Mark as read if configured
    if (markAsRead && attachments.length > 0) {
      try {
        await markEmailsAsRead(imap, messageIds);
        console.log(`   ✓ Marked ${messageIds.length} emails as read`);
      } catch (error) {
        console.warn(`   ⚠ Could not mark emails as read:`, error.message);
      }
    }

    imap.end();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Email processing completed`);
    console.log(`   📎 CSV attachments found: ${attachments.length}`);
    console.log(`   ⏱️  Duration: ${duration}s`);
    console.log(`   📊 Speed: ${(messageIds.length / duration).toFixed(1)} emails/sec`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      attachments,
      processed: messageIds.length,
      duration: parseFloat(duration),
    };

  } catch (error) {
    console.error('\n❌ Email processing failed:', error.message);
    
    if (imap) {
      imap.end();
    }

    throw error;
  }
}

/**
 * Watch inbox for new emails (continuous monitoring)
 */
export function watchInbox(callback, options = {}) {
  const {
    interval = 60000, // Check every minute
    fromAddress = null,
    subjectContains = null,
    batchSize = 10,
    maxEmails = 50,
  } = options;

  console.log(`\n👀 Starting inbox monitoring...`);
  console.log(`   ⏱️  Check interval: ${interval / 1000}s`);
  console.log(`   📧 Max emails per check: ${maxEmails}`);
  console.log(`   🔄 Batch size: ${batchSize} (parallel processing)`);
  
  if (fromAddress) {
    console.log(`   🔍 Filter from: ${fromAddress}`);
  }
  
  if (subjectContains) {
    console.log(`   🔍 Filter subject: ${subjectContains}`);
  }

  const checkInbox = async () => {
    try {
      const result = await processIncomingEmails({
        markAsRead: true,
        fromAddress,
        subjectContains,
        batchSize,
        maxEmails,
      });

      if (result.attachments.length > 0) {
        await callback(result.attachments);
      }
    } catch (error) {
      console.error('Error in inbox check:', error.message);
    }
  };

  // Initial check
  checkInbox();

  // Set up interval
  const intervalId = setInterval(checkInbox, interval);

  return {
    stop: () => {
      clearInterval(intervalId);
      console.log('Inbox monitoring stopped');
    },
  };
}

/**
 * Clean up temp files
 */
export async function cleanupTempFiles(filepaths) {
  for (const filepath of filepaths) {
    try {
      fs.unlinkSync(filepath);
      console.log(`   🗑️  Cleaned up: ${path.basename(filepath)}`);
    } catch (error) {
      console.warn(`   ⚠ Could not delete ${path.basename(filepath)}:`, error.message);
    }
  }
}

/**
 * Get inbox statistics without processing
 */
export async function getInboxStats() {
  let imap = null;

  try {
    const { imap: imapConn, box } = await connectToInbox();
    imap = imapConn;

    const stats = {
      total: box.messages.total,
      unseen: box.messages.unseen,
      recent: box.messages.recent,
    };

    imap.end();

    return stats;

  } catch (error) {
    console.error('Error getting inbox stats:', error.message);
    if (imap) {
      imap.end();
    }
    return null;
  }
}