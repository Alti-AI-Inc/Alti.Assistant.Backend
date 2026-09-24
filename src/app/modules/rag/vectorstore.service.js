import pg from 'pg';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const { Pool } = pg;

/** pgvector connection pool — lazy initialized. */
let pool = null;

function getPool() {
  if (pool) return pool;
  pool = new Pool({
    host: config.postgres?.host || process.env.POSTGRES_HOST || 'localhost',
    port: config.postgres?.port || parseInt(process.env.POSTGRES_PORT || '5432'),
    database: config.postgres?.database || process.env.POSTGRES_DATABASE || 'rag_database',
    user: config.postgres?.user || process.env.POSTGRES_USER || 'postgres',
    password: config.postgres?.password || process.env.POSTGRES_PASSWORD,
    max: 100, // Optimized for high concurrency on OpenStack/Liberty Center One
    idleTimeoutMillis: 30000,
  });
  return pool;
}

/**
 * Initializes pgvector tables if they don't exist.
 * Safe to call multiple times (IF NOT EXISTS).
 */
async function ensureTables(dimensions = 768) {
  const db = getPool();
  await db.query('CREATE EXTENSION IF NOT EXISTS vector');

  await db.query(`
    CREATE TABLE IF NOT EXISTS rag_collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      embedding_model TEXT DEFAULT '@cf/baai/bge-base-en-v1.5',
      dimensions INTEGER DEFAULT ${dimensions},
      document_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS rag_documents (
      id TEXT PRIMARY KEY,
      collection_id TEXT REFERENCES rag_collections(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      source TEXT DEFAULT '',
      source_type TEXT DEFAULT 'text',
      content_hash TEXT,
      chunk_count INTEGER DEFAULT 0,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT REFERENCES rag_documents(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL,
      content TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      char_start INTEGER DEFAULT 0,
      char_end INTEGER DEFAULT 0,
      word_count INTEGER DEFAULT 0,
      embedding vector(${dimensions}),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Create HNSW index for fast cosine similarity search
  await db.query(`
    CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
    ON rag_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);

  // Index for filtering by collection
  await db.query(`
    CREATE INDEX IF NOT EXISTS rag_chunks_collection_idx
    ON rag_chunks(collection_id)
  `);

  logger.info('[VectorStore] pgvector tables and HNSW index ensured');
}

/**
 * Vector Store Service — pgvector-backed storage and retrieval.
 *
 * Features:
 * - HNSW index for sub-ms cosine similarity search
 * - Collection namespacing
 * - Hybrid search (vector + keyword)
 * - Metadata filtering
 */
export const VectorStoreService = {
  /**
   * Initialize tables (call on app boot or first use).
   * @param {number} dimensions
   */
  async initialize(dimensions = 768) {
    await ensureTables(dimensions);
  },

  // ── Collections ──────────────────────────────────────────────────────────

  async createCollection({ id, name, description = '', embeddingModel = '@cf/baai/bge-base-en-v1.5', dimensions = 768 }) {
    const db = getPool();
    await ensureTables(dimensions);

    await db.query(
      `INSERT INTO rag_collections (id, name, description, embedding_model, dimensions)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = $2, description = $3, updated_at = NOW()`,
      [id, name, description, embeddingModel, dimensions]
    );
    return { id, name, description, embeddingModel, dimensions };
  },

  async listCollections() {
    const db = getPool();
    const result = await db.query('SELECT * FROM rag_collections ORDER BY created_at DESC');
    return result.rows;
  },

  async getCollection(collectionId) {
    const db = getPool();
    const result = await db.query('SELECT * FROM rag_collections WHERE id = $1', [collectionId]);
    return result.rows[0] || null;
  },

  async deleteCollection(collectionId) {
    const db = getPool();
    await db.query('DELETE FROM rag_collections WHERE id = $1', [collectionId]);
    return { deleted: true, collectionId };
  },

  // ── Documents ────────────────────────────────────────────────────────────

  async insertDocument({ id, collectionId, title, source = '', sourceType = 'text', metadata = {} }) {
    const db = getPool();
    const contentHash = Buffer.from(title + source).toString('base64').slice(0, 32);

    await db.query(
      `INSERT INTO rag_documents (id, collection_id, title, source, source_type, content_hash, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET title = $3, metadata = $7`,
      [id, collectionId, title, source, sourceType, contentHash, JSON.stringify(metadata)]
    );
    return { id, collectionId, title };
  },

  async listDocuments(collectionId) {
    const db = getPool();
    const result = await db.query(
      'SELECT * FROM rag_documents WHERE collection_id = $1 ORDER BY created_at DESC',
      [collectionId]
    );
    return result.rows;
  },

  async getDocument(documentId) {
    const db = getPool();
    const result = await db.query('SELECT * FROM rag_documents WHERE id = $1', [documentId]);
    return result.rows[0] || null;
  },

  async deleteDocument(documentId) {
    const db = getPool();
    await db.query('DELETE FROM rag_documents WHERE id = $1', [documentId]);
    return { deleted: true, documentId };
  },

  // ── Chunks & Embeddings ──────────────────────────────────────────────────

  /**
   * Insert a batch of chunks with embeddings.
   * @param {Array<{ id, documentId, collectionId, content, chunkIndex, charStart, charEnd, wordCount, embedding, metadata }>} chunks
   */
  async insertChunks(chunks) {
    const db = getPool();

    // Use a transaction for atomic batch insert
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      for (const chunk of chunks) {
        const embeddingStr = `[${chunk.embedding.join(',')}]`;
        await client.query(
          `INSERT INTO rag_chunks (id, document_id, collection_id, content, chunk_index, char_start, char_end, word_count, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10)
           ON CONFLICT (id) DO UPDATE SET content = $4, embedding = $9::vector`,
          [
            chunk.id,
            chunk.documentId,
            chunk.collectionId,
            chunk.content,
            chunk.chunkIndex,
            chunk.charStart || 0,
            chunk.charEnd || 0,
            chunk.wordCount || 0,
            embeddingStr,
            JSON.stringify(chunk.metadata || {}),
          ]
        );
      }

      // Update document chunk count
      if (chunks.length > 0) {
        await client.query(
          'UPDATE rag_documents SET chunk_count = $1 WHERE id = $2',
          [chunks.length, chunks[0].documentId]
        );
        await client.query(
          `UPDATE rag_collections SET document_count = (
            SELECT COUNT(*) FROM rag_documents WHERE collection_id = $1
          ), updated_at = NOW() WHERE id = $1`,
          [chunks[0].collectionId]
        );
      }

      await client.query('COMMIT');
      logger.info(`[VectorStore] Inserted ${chunks.length} chunks for document ${chunks[0]?.documentId}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ── Search ───────────────────────────────────────────────────────────────

  /**
   * Cosine similarity vector search.
   * @param {number[]} queryEmbedding - The query's embedding vector
   * @param {object} options - { collectionId, topK, minScore, filter }
   * @returns {Promise<Array<{ id, content, score, documentId, metadata }>>}
   */
  async search(queryEmbedding, options = {}) {
    const { collectionId, topK = 5, minScore = 0.3 } = options;
    const db = getPool();

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    let query = `
      SELECT
        c.id,
        c.content,
        c.document_id,
        c.chunk_index,
        c.metadata,
        d.title AS document_title,
        d.source AS document_source,
        1 - (c.embedding <=> $1::vector) AS score
      FROM rag_chunks c
      JOIN rag_documents d ON c.document_id = d.id
    `;

    const params = [embeddingStr];

    if (collectionId) {
      query += ` WHERE c.collection_id = $2`;
      params.push(collectionId);
    }

    query += ` ORDER BY c.embedding <=> $1::vector LIMIT $${params.length + 1}`;
    params.push(topK);

    const result = await db.query(query, params);

    return result.rows
      .filter(row => row.score >= minScore)
      .map(row => ({
        id: row.id,
        content: row.content,
        score: parseFloat(row.score.toFixed(4)),
        documentId: row.document_id,
        documentTitle: row.document_title,
        documentSource: row.document_source,
        chunkIndex: row.chunk_index,
        metadata: row.metadata,
      }));
  },

  /**
   * Hybrid search: combines vector similarity + keyword matching.
   * @param {number[]} queryEmbedding
   * @param {string} keywordQuery
   * @param {object} options
   * @returns {Promise<Array>}
   */
  async hybridSearch(queryEmbedding, keywordQuery, options = {}) {
    const { collectionId, topK = 5, vectorWeight = 0.7 } = options;
    const db = getPool();

    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    const keywordWeight = 1 - vectorWeight;

    let query = `
      SELECT
        c.id,
        c.content,
        c.document_id,
        c.chunk_index,
        c.metadata,
        d.title AS document_title,
        d.source AS document_source,
        (
          $3::float * (1 - (c.embedding <=> $1::vector)) +
          $4::float * ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', $2))
        ) AS score
      FROM rag_chunks c
      JOIN rag_documents d ON c.document_id = d.id
    `;

    const params = [embeddingStr, keywordQuery, vectorWeight, keywordWeight];

    if (collectionId) {
      query += ` WHERE c.collection_id = $5`;
      params.push(collectionId);
    }

    query += ` ORDER BY score DESC LIMIT $${params.length + 1}`;
    params.push(topK);

    const result = await db.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      score: parseFloat(row.score.toFixed(4)),
      documentId: row.document_id,
      documentTitle: row.document_title,
      documentSource: row.document_source,
      chunkIndex: row.chunk_index,
      metadata: row.metadata,
    }));
  },

  /**
   * Get chunk count for a collection.
   */
  async getChunkCount(collectionId) {
    const db = getPool();
    const result = await db.query(
      'SELECT COUNT(*) AS count FROM rag_chunks WHERE collection_id = $1',
      [collectionId]
    );
    return parseInt(result.rows[0].count);
  },
};

export default VectorStoreService;
