// src/services/retrieval.js
import { supabase } from '../config/supabase.js';
import { embeddings } from '../config/openai.js';
import { RAG_CONFIG } from '../config/openai.js';

/**
 * Retrieve relevant documents using vector similarity search
 */
export async function retrieveDocuments(query, options = {}) {
  const {
    topK = RAG_CONFIG.topK,
    similarityThreshold = RAG_CONFIG.similarityThreshold,
    source = null,
  } = options;

  console.log(`\n🔍 Retrieving documents for query: "${query}"`);

  try {
    // Generate embedding for the query
    const queryEmbedding = await embeddings.embedQuery(query);
    console.log(`  ✓ Generated query embedding`);

    // Search for similar documents using the Supabase function
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: similarityThreshold,
      match_count: topK,
    });

    if (error) throw error;

    // Filter by source if specified
    let results = data || [];
    if (source) {
      results = results.filter(doc => doc.source === source);
    }

    console.log(`  ✓ Found ${results.length} relevant documents`);

    // Format results
    const formattedResults = results.map((doc, idx) => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata,
      source: doc.source,
      similarity: doc.similarity,
      rank: idx + 1,
    }));

    return formattedResults;

  } catch (error) {
    console.error('Error retrieving documents:', error.message);
    throw error;
  }
}

/**
 * Build context string from retrieved documents
 */
export function buildContext(documents) {
  if (!documents || documents.length === 0) {
    return '';
  }

  const contextParts = documents.map((doc, idx) => {
    return `[Document ${idx + 1}] (Similarity: ${(doc.similarity * 100).toFixed(1)}%)\n${doc.content}`;
  });

  return contextParts.join('\n\n---\n\n');
}

/**
 * Extract sources from retrieved documents
 */
export function extractSources(documents) {
  if (!documents || documents.length === 0) {
    return [];
  }

  const sources = documents.map(doc => ({
    source: doc.source,
    similarity: doc.similarity,
    metadata: doc.metadata,
    content_preview: doc.content.substring(0, 150) + '...',
  }));

  // Remove duplicate sources
  const uniqueSources = [];
  const seenSources = new Set();

  for (const source of sources) {
    const key = `${source.source}_${JSON.stringify(source.metadata)}`;
    if (!seenSources.has(key)) {
      seenSources.add(key);
      uniqueSources.push(source);
    }
  }

  return uniqueSources;
}

/**
 * Retrieve and format documents for RAG
 */
export async function retrieveForRAG(query, options = {}) {
  try {
    // Retrieve documents
    const documents = await retrieveDocuments(query, options);

    // Check if any documents were found
    if (!documents || documents.length === 0) {
      return {
        hasResults: false,
        documents: [],
        context: '',
        sources: [],
      };
    }

    // Build context and extract sources
    const context = buildContext(documents);
    const sources = extractSources(documents);

    return {
      hasResults: true,
      documents,
      context,
      sources,
    };

  } catch (error) {
    console.error('Error in retrieveForRAG:', error.message);
    throw error;
  }
}

/**
 * Get document statistics
 */
export async function getDocumentStats(source = null) {
  try {
    let query = supabase
      .from('units_vacancy')
      .select('*', { count: 'exact', head: true });

    if (source) {
      query = query.eq('source', source);
    }

    const { count, error } = await query;

    if (error) throw error;

    return {
      totalDocuments: count || 0,
      source: source || 'all',
    };

  } catch (error) {
    console.error('Error fetching document stats:', error.message);
    return null;
  }
}