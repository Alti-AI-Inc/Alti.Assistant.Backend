import { logger } from '../../../shared/logger.js';

/**
 * Document Chunking Service.
 *
 * Strategies:
 * 1. Recursive Character Splitting (default) — splits on paragraph, then sentence, then word boundaries
 * 2. Semantic Splitting — groups related sentences (requires embeddings, slower)
 * 3. Fixed Token Splitting — raw token-count windows
 *
 * All strategies produce chunks with overlap for context continuity.
 */

/**
 * Splits text using recursive boundary detection.
 * Tries paragraph breaks first, then sentences, then words.
 * @param {string} text
 * @param {object} options - { chunkSize, chunkOverlap, separators }
 * @returns {string[]}
 */
function recursiveCharacterSplit(text, options = {}) {
  const {
    chunkSize = 512,
    chunkOverlap = 64,
    separators = ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' '],
  } = options;

  if (text.length <= chunkSize) return [text.trim()].filter(Boolean);

  const chunks = [];

  function splitRecursive(inputText, sepIndex) {
    if (inputText.length <= chunkSize || sepIndex >= separators.length) {
      // Hard split at chunkSize if no separator works
      const parts = [];
      for (let i = 0; i < inputText.length; i += chunkSize - chunkOverlap) {
        parts.push(inputText.slice(i, i + chunkSize).trim());
      }
      return parts.filter(Boolean);
    }

    const sep = separators[sepIndex];
    const parts = inputText.split(sep);

    let currentChunk = '';
    const result = [];

    for (const part of parts) {
      const candidate = currentChunk ? currentChunk + sep + part : part;

      if (candidate.length <= chunkSize) {
        currentChunk = candidate;
      } else {
        if (currentChunk) {
          result.push(currentChunk.trim());
        }

        // If single part exceeds chunkSize, recurse with next separator
        if (part.length > chunkSize) {
          result.push(...splitRecursive(part, sepIndex + 1));
          currentChunk = '';
        } else {
          currentChunk = part;
        }
      }
    }

    if (currentChunk.trim()) {
      result.push(currentChunk.trim());
    }

    return result;
  }

  const rawChunks = splitRecursive(text, 0);

  // Apply overlap: prepend the tail of the previous chunk to the current
  if (chunkOverlap > 0 && rawChunks.length > 1) {
    for (let i = 1; i < rawChunks.length; i++) {
      const prevTail = rawChunks[i - 1].slice(-chunkOverlap);
      // Only prepend if it doesn't already start with the overlap
      if (!rawChunks[i].startsWith(prevTail)) {
        rawChunks[i] = prevTail + ' ' + rawChunks[i];
      }
    }
  }

  return rawChunks.filter(c => c.trim().length > 10); // Drop trivially small chunks
}

/**
 * Cleans and normalizes text for embedding.
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n')               // Normalize line endings
    .replace(/\t/g, ' ')                   // Tabs to spaces
    .replace(/ {3,}/g, '  ')               // Collapse long spaces
    .replace(/\n{3,}/g, '\n\n')            // Collapse blank lines
    .replace(/[^\S\n]+$/gm, '')            // Trim trailing whitespace per line
    .trim();
}

export const ChunkerService = {
  /**
   * Split a document into chunks optimized for embedding and retrieval.
   * @param {string} text - Raw document text
   * @param {object} options - { chunkSize, chunkOverlap, strategy, metadata }
   * @returns {{ chunks: Array<{ content: string, index: number, charStart: number, charEnd: number, metadata?: object }> }}
   */
  chunkDocument(text, options = {}) {
    const {
      chunkSize = 512,
      chunkOverlap = 64,
      strategy = 'recursive',
      metadata = {},
    } = options;

    const cleaned = cleanText(text);

    let rawChunks;
    switch (strategy) {
      case 'recursive':
      default:
        rawChunks = recursiveCharacterSplit(cleaned, { chunkSize, chunkOverlap });
        break;
      case 'paragraph':
        rawChunks = cleaned.split(/\n\n+/).filter(p => p.trim().length > 10);
        break;
      case 'sentence':
        rawChunks = cleaned.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
        break;
    }

    let charOffset = 0;
    const chunks = rawChunks.map((content, index) => {
      const charStart = cleaned.indexOf(content, charOffset);
      const charEnd = charStart + content.length;
      charOffset = charStart > -1 ? charStart + 1 : charOffset;

      return {
        content,
        index,
        charStart: Math.max(charStart, 0),
        charEnd,
        charCount: content.length,
        wordCount: content.split(/\s+/).length,
        ...metadata,
      };
    });

    logger.info(`[Chunker] Split ${cleaned.length} chars into ${chunks.length} chunks (strategy: ${strategy}, chunkSize: ${chunkSize})`);

    return {
      chunks,
      totalChunks: chunks.length,
      originalLength: cleaned.length,
      strategy,
      chunkSize,
      chunkOverlap,
    };
  },

  /**
   * Estimate token count (rough: 1 token ≈ 4 chars for English).
   * @param {string} text
   * @returns {number}
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  },

  /**
   * Clean and normalize text.
   * @param {string} text
   * @returns {string}
   */
  cleanText,
};

export default ChunkerService;
