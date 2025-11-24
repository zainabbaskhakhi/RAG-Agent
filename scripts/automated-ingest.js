// scripts/automated-ingest.js
import { processIncomingEmails, watchInbox, cleanupTempFiles } from '../src/services/email.js';
import { readCSV } from '../src/utils/csvProcessor.js';
import { processAndUpsertCSV } from '../src/services/upsert.js';
import { testConnection } from '../src/config/supabase.js';

/**
 * Process a single CSV attachment
 */
async function processAttachment(attachment) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 Processing: ${attachment.filename}`);
  console.log(`   From: ${attachment.from}`);
  console.log(`   Date: ${attachment.date}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Read CSV
    const rows = await readCSV(attachment.filepath);

    if (rows.length === 0) {
      console.warn('⚠ CSV file is empty, skipping...');
      return null;
    }

    // Process with UID generation and upsert
    const result = await processAndUpsertCSV(rows, attachment.filename, {
      propertyNameColumn: 'Property Name',
      unitColumn: 'Unit',
    });

    return result;

  } catch (error) {
    console.error(`❌ Failed to process ${attachment.filename}:`, error.message);
    throw error;
  }
}

/**
 * Main function for one-time check
 */
async function checkOnce() {
  console.log('\n' + '='.repeat(70));
  console.log('Automated CSV Ingestion - One-Time Check');
  console.log('='.repeat(70) + '\n');

  // Test Supabase connection
  console.log('🔌 Testing Supabase connection...');
  const connected = await testConnection();

  if (!connected) {
    console.error('\n❌ Cannot proceed: Supabase connection failed');
    process.exit(1);
  }

  try {
    // Process emails
    const result = await processIncomingEmails({
      markAsRead: true,
      fromAddress: process.env.FILTER_FROM_EMAIL || null,
      subjectContains: process.env.FILTER_SUBJECT || null,
    });

    if (result.attachments.length === 0) {
      console.log('\n✅ No new CSV files to process');
      process.exit(0);
    }

    // Process each attachment
    const results = [];
    for (const attachment of result.attachments) {
      const processResult = await processAttachment(attachment);
      if (processResult) {
        results.push(processResult);
      }
    }

    // Clean up temp files
    const filepaths = result.attachments.map(a => a.filepath);
    await cleanupTempFiles(filepaths);

    console.log('\n' + '='.repeat(70));
    console.log('✅ Automated ingestion completed successfully!');
    console.log(`   Processed ${results.length} CSV files`);
    console.log('='.repeat(70) + '\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Automated ingestion failed:', error.message);
    process.exit(1);
  }
}

/**
 * Main function for continuous monitoring
 */
async function watchContinuously() {
  console.log('\n' + '='.repeat(70));
  console.log('Automated CSV Ingestion - Continuous Monitoring');
  console.log('='.repeat(70) + '\n');

  // Test Supabase connection
  console.log('🔌 Testing Supabase connection...');
  const connected = await testConnection();

  if (!connected) {
    console.error('\n❌ Cannot proceed: Supabase connection failed');
    process.exit(1);
  }

  const checkInterval = parseInt(process.env.EMAIL_CHECK_INTERVAL) || 60000;

  console.log(`⏱️  Check interval: ${checkInterval / 1000} seconds`);
  console.log(`📧 Monitoring inbox: ${process.env.EMAIL_USER}`);
  
  if (process.env.FILTER_FROM_EMAIL) {
    console.log(`🔍 Filter from: ${process.env.FILTER_FROM_EMAIL}`);
  }
  
  if (process.env.FILTER_SUBJECT) {
    console.log(`🔍 Filter subject: ${process.env.FILTER_SUBJECT}`);
  }

  // Set up inbox watcher
  const watcher = watchInbox(
    async (attachments) => {
      console.log(`\n🔔 New CSV files detected: ${attachments.length}`);

      // Process each attachment
      for (const attachment of attachments) {
        try {
          await processAttachment(attachment);
        } catch (error) {
          console.error(`Failed to process ${attachment.filename}:`, error.message);
        }
      }

      // Clean up temp files
      const filepaths = attachments.map(a => a.filepath);
      await cleanupTempFiles(filepaths);
    },
    {
      interval: checkInterval,
      fromAddress: process.env.FILTER_FROM_EMAIL || null,
      subjectContains: process.env.FILTER_SUBJECT || null,
    }
  );

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n📴 Shutting down inbox monitoring...');
    watcher.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\n📴 Shutting down inbox monitoring...');
    watcher.stop();
    process.exit(0);
  });
}

/**
 * Run the script
 */
const mode = process.argv[2] || 'once';

if (mode === 'watch') {
  watchContinuously();
} else {
  checkOnce();
}