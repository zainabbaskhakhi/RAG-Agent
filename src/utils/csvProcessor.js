// src/utils/csvProcessor.js
import fs from 'fs';
import { parse } from 'csv-parse';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { cleanText, extractTextFromRow, isValidText } from './textCleaner.js';
import { RAG_CONFIG } from '../config/openai.js';

/**
 * Read and parse CSV file
 */
export async function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    
    fs.createReadStream(filePath)
      .pipe(parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true, // Handle byte order mark
      }))
      .on('data', (row) => {
        records.push(row);
      })
      .on('end', () => {
        console.log(`✓ Parsed ${records.length} rows from CSV`);
        resolve(records);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

/**
 * Convert CSV rows to text documents
 */
export function rowsToDocuments(rows) {
  const documents = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = extractTextFromRow(row);
    const cleanedText = cleanText(text);

    if (isValidText(cleanedText)) {
      documents.push({
        pageContent: cleanedText,
        metadata: {
          row_index: i,
          ...row, // Include all original CSV columns as metadata
        },
      });
    } else {
      console.warn(`⚠ Skipping invalid row ${i}`);
    }
  }

  console.log(`✓ Created ${documents.length} valid documents from CSV`);
  return documents;
}

/**
 * Split documents into chunks
 */
export async function splitDocuments(documents) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: RAG_CONFIG.chunkSize,
    chunkOverlap: RAG_CONFIG.chunkOverlap,
    separators: ['\n\n', '\n', '. ', ' ', ''],
  });

  const chunks = [];
  
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const splits = await splitter.createDocuments(
      [doc.pageContent],
      [doc.metadata]
    );

    // Add chunk index to metadata
    splits.forEach((split, idx) => {
      chunks.push({
        ...split,
        metadata: {
          ...split.metadata,
          chunk_index: idx,
          parent_doc_index: i,
        },
      });
    });
  }

  console.log(`✓ Split into ${chunks.length} chunks`);
  return chunks;
}

/**
 * Process CSV file end-to-end
 */
export async function processCSV(filePath) {
  console.log(`\n📄 Processing CSV: ${filePath}`);
  
  // Read CSV
  const rows = await readCSV(filePath);
  
  // Convert to documents
  const documents = rowsToDocuments(rows);
  
  // Split into chunks
  const chunks = await splitDocuments(documents);
  
  return {
    rows,
    documents,
    chunks,
  };
}