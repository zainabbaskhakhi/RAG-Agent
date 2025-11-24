// src/services/ingestion.js
import { supabase } from '../config/supabase.js';
import { embeddings } from '../config/openai.js';
import { processCSV } from '../utils/csvProcessor.js';
import path from 'path';

/**
 * Generate embeddings for chunks in batches
 */
async function generateEmbeddings(chunks, batchSize = 50) {
  const embeddings_list = [];
  
  console.log(`\n🔢 Generating embeddings for ${chunks.length} chunks...`);
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(chunk => chunk.pageContent);
    
    try {
      const batchEmbeddings = await embeddings.embedDocuments(texts);
      embeddings_list.push(...batchEmbeddings);
      
      console.log(`  ✓ Generated embeddings ${i + 1}-${Math.min(i + batchSize, chunks.length)} of ${chunks.length}`);
    } catch (error) {
      console.error(`  ✗ Error generating embeddings for batch ${i}:`, error.message);
      throw error;
    }
  }
  
  return embeddings_list;
}

/**
 * Insert documents into Supabase in batches
 */
async function insertDocuments(chunks, embeddings_list, source, batchSize = 100) {
  console.log(`\n💾 Inserting ${chunks.length} documents into Supabase...`);
  
  const documents = chunks.map((chunk, idx) => ({
    content: chunk.pageContent,
    embedding: embeddings_list[idx],
    metadata: chunk.metadata,
    source: source,
    chunk_index: idx,
  }));

  let inserted = 0;
  
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    
    try {
      const { data, error } = await supabase
        .from('units_vacancy')
        .insert(batch)
        .select();
      
      if (error) throw error;
      
      inserted += batch.length;
      console.log(`  ✓ Inserted documents ${i + 1}-${Math.min(i + batchSize, documents.length)} of ${documents.length}`);
    } catch (error) {
      console.error(`  ✗ Error inserting batch ${i}:`, error.message);
      throw error;
    }
  }
  
  console.log(`\n✅ Successfully inserted ${inserted} documents`);
  return inserted;
}

/**
 * Delete existing documents for a source
 */
async function deleteExistingDocuments(source) {
  console.log(`\n🗑️  Checking for existing documents with source: ${source}`);
  
  const { data, error } = await supabase
    .from('units_vacancy')
    .delete()
    .eq('source', source)
    .select();
  
  if (error) {
    console.error('Error deleting existing documents:', error.message);
    throw error;
  }
  
  if (data && data.length > 0) {
    console.log(`  ✓ Deleted ${data.length} existing documents`);
  } else {
    console.log(`  ✓ No existing documents found`);
  }
  
  return data?.length || 0;
}

/**
 * Track ingestion job
 */
async function createIngestionJob(fileName, totalChunks) {
  const { data, error } = await supabase
    .from('ingestion_jobs')
    .insert({
      file_name: fileName,
      status: 'processing',
      total_chunks: totalChunks,
      processed_chunks: 0,
    })
    .select()
    .single();
  
  if (error) {
    console.warn('Could not create ingestion job:', error.message);
    return null;
  }
  
  return data;
}

async function updateIngestionJob(jobId, status, processedChunks = 0, errorMessage = null) {
  if (!jobId) return;
  
  const updates = {
    status,
    processed_chunks: processedChunks,
  };
  
  if (status === 'completed' || status === 'failed') {
    updates.completed_at = new Date().toISOString();
  }
  
  if (errorMessage) {
    updates.error_message = errorMessage;
  }
  
  await supabase
    .from('ingestion_jobs')
    .update(updates)
    .eq('id', jobId);
}

/**
 * Main ingestion function
 */
export async function ingestCSV(filePath, options = {}) {
  const {
    clearExisting = true,
    trackJob = true,
  } = options;
  
  const fileName = path.basename(filePath);
  const source = options.source || fileName;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Starting ingestion for: ${fileName}`);
  console.log(`${'='.repeat(60)}`);
  
  let job = null;
  
  try {
    // Process CSV
    const { chunks } = await processCSV(filePath);
    
    if (chunks.length === 0) {
      throw new Error('No valid chunks created from CSV');
    }
    
    // Create ingestion job
    if (trackJob) {
      job = await createIngestionJob(fileName, chunks.length);
    }
    
    // Clear existing documents if requested
    if (clearExisting) {
      await deleteExistingDocuments(source);
    }
    
    // Generate embeddings
    const embeddings_list = await generateEmbeddings(chunks);
    
    // Insert documents
    const inserted = await insertDocuments(chunks, embeddings_list, source);
    
    // Update job status
    if (job) {
      await updateIngestionJob(job.id, 'completed', inserted);
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Ingestion completed successfully!`);
    console.log(`   Source: ${source}`);
    console.log(`   Documents: ${inserted}`);
    console.log(`${'='.repeat(60)}\n`);
    
    return {
      success: true,
      source,
      documentsInserted: inserted,
      totalChunks: chunks.length,
    };
    
  } catch (error) {
    console.error(`\n❌ Ingestion failed:`, error.message);
    
    if (job) {
      await updateIngestionJob(job.id, 'failed', 0, error.message);
    }
    
    throw error;
  }
}

/**
 * Get ingestion statistics
 */
export async function getIngestionStats() {
  try {
    const { count, error } = await supabase
      .from('units_vacancy')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    
    const { data: sources } = await supabase
      .from('units_vacancy')
      .select('source')
      .order('source');
    
    const uniqueSources = [...new Set(sources?.map(s => s.source) || [])];
    
    return {
      totalDocuments: count || 0,
      sources: uniqueSources,
    };
  } catch (error) {
    console.error('Error fetching ingestion stats:', error.message);
    return null;
  }
}