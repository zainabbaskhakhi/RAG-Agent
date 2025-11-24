// src/utils/textCleaner.js

/**
 * Clean and normalize text for better embedding quality
 */
export function cleanText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let cleaned = text;

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();

  // Remove special characters that might cause issues (keep punctuation)
  cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  // Normalize line breaks
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Remove multiple consecutive line breaks
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
}

/**
 * Extract text from CSV row, handling nested objects
 */
export function extractTextFromRow(row, excludeKeys = ['id', 'embedding']) {
  const texts = [];

  for (const [key, value] of Object.entries(row)) {
    if (excludeKeys.includes(key.toLowerCase())) {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'object') {
      texts.push(JSON.stringify(value));
    } else {
      texts.push(`${key}: ${value}`);
    }
  }

  return texts.join(' | ');
}

/**
 * Validate text quality before embedding
 */
export function isValidText(text, minLength = 10) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const cleaned = text.trim();
  
  if (cleaned.length < minLength) {
    return false;
  }

  // Check if text has at least some alphanumeric content
  const alphanumericCount = (cleaned.match(/[a-zA-Z0-9]/g) || []).length;
  
  return alphanumericCount >= minLength / 2;
}