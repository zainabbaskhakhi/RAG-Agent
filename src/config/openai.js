// src/config/openai.js
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY environment variable');
}

// Initialize embeddings model
export const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  batchSize: 512, // Process embeddings in batches
});

// Initialize chat model
export const llm = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: process.env.LLM_MODEL || 'gpt-4o-mini',
  temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.1,
  maxTokens: parseInt(process.env.MAX_TOKENS) || 1000,
});

// Configuration constants
export const RAG_CONFIG = {
  chunkSize: parseInt(process.env.CHUNK_SIZE) || 1000,
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP) || 200,
  topK: parseInt(process.env.TOP_K_RESULTS) || 5,
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.7,
};