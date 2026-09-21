import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Cloudflare Workers AI Embedding Service.
 * Uses @cf/baai/bge-base-en-v1.5 (768-dim, MIT license, free tier).
 * Fallback: @cf/baai/bge-large-en-v1.5 (1024-dim) for higher accuracy.
 */

const CF_BASE = 'https://api.cloudflare.com/client/v4/accounts';
const DEFAULT_MODEL = '@cf/baai/bge-base-en-v1.5';
const EMBEDDING_DIM = 768;
const MAX_BATCH_SIZE = 100; // Cloudflare limit per request

/**
 * Calls Cloudflare Workers AI embedding endpoint.
 * @param {string[]} texts - Array of text strings to embed
 * @param {string} model - Cloudflare AI model identifier
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function callCfEmbedding(texts, model = DEFAULT_MODEL) {
  const accountId = config.cloudflare?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = config.cloudflare?.apiToken || process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error('[Embeddings] Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  const url = `${CF_BASE}/${accountId}/ai/run/${model}`;

  const response = await axios.post(
    url,
    { text: texts },
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  if (!response.data?.success) {
    const errMsg = response.data?.errors?.[0]?.message || 'Unknown Cloudflare AI error';
    throw new Error(`[Embeddings] Cloudflare Workers AI error: ${errMsg}`);
  }

  return response.data.result.data;
}

/**
 * Embedding Service — generates vector embeddings via Cloudflare Workers AI.
 *
 * Models:
 * - @cf/baai/bge-base-en-v1.5  (768-dim, fast, free tier)
 * - @cf/baai/bge-large-en-v1.5 (1024-dim, higher accuracy)
 * - @cf/baai/bge-small-en-v1.5 (384-dim, fastest, lowest memory)
 */
export const EmbeddingService = {
  /**
   * Embed a single text string.
   * @param {string} text
   * @param {object} options - { model }
   * @returns {Promise<{ embedding: number[], dimensions: number, model: string }>}
   */
  async embedText(text, options = {}) {
    const model = options.model || DEFAULT_MODEL;
    const startTime = Date.now();

    const embeddings = await callCfEmbedding([text], model);
    const durationMs = Date.now() - startTime;

    logger.info(`[Embeddings] Embedded 1 text (${text.length} chars) in ${durationMs}ms`);

    return {
      embedding: embeddings[0],
      dimensions: embeddings[0].length,
      model,
      durationMs,
    };
  },

  /**
   * Embed multiple texts in batches (auto-chunks at 100).
   * @param {string[]} texts
   * @param {object} options - { model, onProgress }
   * @returns {Promise<{ embeddings: number[][], dimensions: number, model: string, count: number }>}
   */
  async embedBatch(texts, options = {}) {
    const model = options.model || DEFAULT_MODEL;
    const startTime = Date.now();
    const allEmbeddings = [];

    // Split into batches of MAX_BATCH_SIZE
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);
      const batchEmbeddings = await callCfEmbedding(batch, model);
      allEmbeddings.push(...batchEmbeddings);

      if (options.onProgress) {
        options.onProgress({
          completed: Math.min(i + MAX_BATCH_SIZE, texts.length),
          total: texts.length,
        });
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info(`[Embeddings] Embedded ${texts.length} texts in ${durationMs}ms (${Math.ceil(texts.length / MAX_BATCH_SIZE)} batches)`);

    return {
      embeddings: allEmbeddings,
      dimensions: allEmbeddings[0]?.length || EMBEDDING_DIM,
      model,
      count: allEmbeddings.length,
      durationMs,
    };
  },

  /**
   * Compute cosine similarity between two embedding vectors.
   * @param {number[]} a
   * @param {number[]} b
   * @returns {number} Similarity score between -1 and 1
   */
  cosineSimilarity(a, b) {
    if (a.length !== b.length) throw new Error('Vectors must have same dimensions');
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  },

  /** Returns embedding dimensions for the given model. */
  getDimensions(model = DEFAULT_MODEL) {
    const dims = {
      '@cf/baai/bge-base-en-v1.5': 768,
      '@cf/baai/bge-large-en-v1.5': 1024,
      '@cf/baai/bge-small-en-v1.5': 384,
    };
    return dims[model] || EMBEDDING_DIM;
  },

  /** Available embedding models. */
  listModels() {
    return [
      { id: '@cf/baai/bge-base-en-v1.5', dimensions: 768, speed: 'fast', quality: 'high', license: 'MIT', tier: 'free' },
      { id: '@cf/baai/bge-large-en-v1.5', dimensions: 1024, speed: 'medium', quality: 'highest', license: 'MIT', tier: 'free' },
      { id: '@cf/baai/bge-small-en-v1.5', dimensions: 384, speed: 'fastest', quality: 'good', license: 'MIT', tier: 'free' },
    ];
  },
};

export default EmbeddingService;
