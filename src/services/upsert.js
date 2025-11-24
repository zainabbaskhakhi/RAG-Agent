// src/services/upsert.js
import { supabase } from '../config/supabase.js';
import { embeddings } from '../config/openai.js';
import { cleanText } from '../utils/textCleaner.js';
import { addUIDsToRows } from '../utils/uidGenerator.js';

/**
 * Upsert documents with UID-based conflict resolution
 * Updates existing documents if UID matches, inserts new ones otherwise
 */
export async function upsertDocumentsWithUID(chunks, embeddings_list, source) {
  console.log(`\n💾 Upserting ${chunks.length} documents into Supabase...`);

  const documents = chunks.map((chunk, idx) => {
    const uid = chunk.metadata?.UID || null;
    
    return {
      content: chunk.pageContent,
      embedding: embeddings_list[idx],
      metadata: chunk.metadata,
      source: source,
      chunk_index: idx,
      uid: uid, // Store UID for easy lookups
    };
  });

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const doc of documents) {
    try {
      if (doc.uid) {
        // Check if document with this UID exists
        const { data: existing, error: fetchError } = await supabase
          .from('units_vacancy')
          .select('id')
          .eq('metadata->>UID', doc.uid)
          .eq('source', source)
          .limit(1);

        if (fetchError) throw fetchError;

        if (existing && existing.length > 0) {
          // Update existing document
          const { error: updateError } = await supabase
            .from('units_vacancy')
            .update({
              content: doc.content,
              embedding: doc.embedding,
              metadata: doc.metadata,
              uid: doc.uid,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing[0].id);

          if (updateError) throw updateError;
          updated++;
        } else {
          // Insert new document
          const { error: insertError } = await supabase
            .from('units_vacancy')
            .insert(doc);

          if (insertError) throw insertError;
          inserted++;
        }
      } else {
        // No UID, just insert (fallback behavior)
        const { error: insertError } = await supabase
          .from('units_vacancy')
          .insert(doc);

        if (insertError) throw insertError;
        inserted++;
      }
    } catch (error) {
      console.error(`  ✗ Error upserting document with UID ${doc.uid}:`, error.message);
      failed++;
    }
  }

  console.log(`\n✅ Upsert Summary:`);
  console.log(`   ✓ Inserted: ${inserted}`);
  console.log(`   ✓ Updated: ${updated}`);
  console.log(`   ✗ Failed: ${failed}`);

  return { inserted, updated, failed };
}

/**
 * Process CSV with UID generation and upsert
 */
export async function processAndUpsertCSV(rows, source, options = {}) {
  const {
    propertyNameColumn = 'Property Name',
    unitColumn = 'Unit',
    chunkSize = 1000,
    chunkOverlap = 200,
  } = options;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Processing CSV with UID upsert: ${source}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Step 1: Add UIDs to rows
    console.log('\n📋 Step 1: Generating UIDs...');
    const rowsWithUIDs = addUIDsToRows(rows, {
      propertyNameColumn,
      unitColumn,
    });

    // Step 2: Convert to text documents
    console.log('\n📄 Step 2: Converting to documents...');
    const documents = rowsWithUIDs
      .filter(row => row.UID) // Only process rows with valid UIDs
      .map((row, idx) => {
        const textParts = Object.entries(row)
          .filter(([key]) => key !== 'UID') // Don't include UID in content
          .map(([key, value]) => `${key}: ${value}`)
          .join(' | ');

        const cleanedText = cleanText(textParts);

        return {
          pageContent: cleanedText,
          metadata: row, // All columns including UID
        };
      });

    console.log(`   ✓ Created ${documents.length} documents`);

    // Step 3: For simplicity, we'll treat each row as a single chunk
    // (No splitting since each row is a unit record)
    const chunks = documents.map((doc, idx) => ({
      ...doc,
      metadata: {
        ...doc.metadata,
        chunk_index: 0,
        parent_doc_index: idx,
      },
    }));

    // Step 4: Generate embeddings
    console.log('\n🔢 Step 3: Generating embeddings...');
    const texts = chunks.map(chunk => chunk.pageContent);
    const embeddings_list = await embeddings.embedDocuments(texts);
    console.log(`   ✓ Generated ${embeddings_list.length} embeddings`);

    // Step 5: Upsert to Supabase
    console.log('\n💾 Step 4: Upserting to Supabase...');
    const result = await upsertDocumentsWithUID(chunks, embeddings_list, source);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Processing completed successfully!`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      success: true,
      source,
      totalRows: rows.length,
      documentsWithUID: documents.length,
      inserted: result.inserted,
      updated: result.updated,
      failed: result.failed,
    };

  } catch (error) {
    console.error(`\n❌ Processing failed:`, error.message);
    throw error;
  }
}

/**
 * Delete documents by source
 */
export async function deleteDocumentsBySource(source) {
  console.log(`\n🗑️  Deleting documents with source: ${source}`);

  const { data, error } = await supabase
    .from('units_vacancy')
    .delete()
    .eq('source', source)
    .select();

  if (error) {
    console.error('Error deleting documents:', error.message);
    throw error;
  }

  const deletedCount = data?.length || 0;
  console.log(`   ✓ Deleted ${deletedCount} documents`);

  return deletedCount;
}

/**
 * Get upsert statistics
 */
export async function getUpsertStats(source = null) {
  try {
    let query = supabase
      .from('units_vacancy')
      .select('metadata, created_at, updated_at');

    if (source) {
      query = query.eq('source', source);
    }

    const { data, error } = await query;

    if (error) throw error;

    const stats = {
      totalDocuments: data.length,
      withUID: data.filter(d => d.metadata?.UID).length,
      recentlyUpdated: data.filter(d => {
        const updatedAt = new Date(d.updated_at);
        const createdAt = new Date(d.created_at);
        return updatedAt > createdAt;
      }).length,
    };

    return stats;
  } catch (error) {
    console.error('Error fetching upsert stats:', error.message);
    return null;
  }
}