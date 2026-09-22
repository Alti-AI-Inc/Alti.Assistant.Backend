import crypto from 'crypto';
import fs from 'fs';
import * as mammothLib from 'mammoth';
import { EmbeddingService } from './embedding.service.js';
import { ChunkerService } from './chunker.service.js';
import { VectorStoreService } from './vectorstore.service.js';
import { llmChat, llmLightChat, llmStream } from '../../services/llm.client.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const DEFAULT_COLLECTION = 'default';

/**
 * RAG Pipeline Service — Full Retrieval-Augmented Generation.
 *
 * Pipeline: Ingest → Parse → Chunk → Embed → Store → Retrieve → Generate
 *
 * Stack:
 * - Embeddings: Cloudflare Workers AI (bge-base-en-v1.5, 768-dim, FREE)
 * - Vector DB:  pgvector in PostgreSQL (HNSW index, self-hosted)
 * - Chunking:   Recursive character splitting with overlap
 * - Generation: LLM gpt-oss-120b (heavy) / gpt-oss-20b (light)
 * - Parsing:    pdf-parse, mammoth, Exa content extraction
 */
export const RagService = {
  /**
   * Initialize the vector store tables. Call on first use or app boot.
   */
  async initialize() {
    await VectorStoreService.initialize(768);
    logger.info('[RAG] Initialized pgvector tables');
  },

  // ── Collections ──────────────────────────────────────────────────────────

  async createCollection({ name, description = '' }) {
    const id = `col-${crypto.randomUUID().slice(0, 8)}`;
    return VectorStoreService.createCollection({ id, name, description });
  },

  async listCollections() {
    return VectorStoreService.listCollections();
  },

  async deleteCollection(collectionId) {
    return VectorStoreService.deleteCollection(collectionId);
  },

  // ── Ingestion ────────────────────────────────────────────────────────────

  /**
   * Ingest raw text into the vector store.
   * @param {{ text: string, title: string, collectionId?: string, chunkSize?: number, chunkOverlap?: number, metadata?: object }} params
   * @returns {Promise<{ documentId, chunkCount, collectionId }>}
   */
  async ingestText({ text, title, collectionId = DEFAULT_COLLECTION, chunkSize = 512, chunkOverlap = 64, metadata = {} }) {
    // Ensure collection exists
    await VectorStoreService.createCollection({
      id: collectionId,
      name: collectionId,
      description: 'Auto-created collection',
    });

    const documentId = `doc-${crypto.randomUUID().slice(0, 12)}`;

    // Step 1: Chunk
    const { chunks } = ChunkerService.chunkDocument(text, { chunkSize, chunkOverlap });

    // Step 2: Embed all chunks
    const chunkTexts = chunks.map(c => c.content);
    const { embeddings } = await EmbeddingService.embedBatch(chunkTexts);

    // Step 3: Store document record
    await VectorStoreService.insertDocument({
      id: documentId,
      collectionId,
      title,
      source: 'text-input',
      sourceType: 'text',
      metadata,
    });

    // Step 4: Store chunks with embeddings
    const chunkRecords = chunks.map((chunk, i) => ({
      id: `${documentId}-chunk-${i}`,
      documentId,
      collectionId,
      content: chunk.content,
      chunkIndex: chunk.index,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
      wordCount: chunk.wordCount,
      embedding: embeddings[i],
      metadata: { ...metadata, chunkIndex: i },
    }));

    await VectorStoreService.insertChunks(chunkRecords);

    logger.info(`[RAG] Ingested "${title}" → ${chunks.length} chunks into collection "${collectionId}"`);

    return {
      documentId,
      title,
      collectionId,
      chunkCount: chunks.length,
      estimatedTokens: ChunkerService.estimateTokens(text),
    };
  },

  /**
   * Ingest from a URL using Exa content extraction.
   * @param {{ url: string, collectionId?: string, chunkSize?: number }} params
   */
  async ingestUrl({ url, collectionId = DEFAULT_COLLECTION, chunkSize = 512 }) {
    // Use Exa to extract clean content
    const axios = (await import('axios')).default;
    const exaKey = config.exa_api_key || process.env.EXA_API_KEY || process.env.EXA_KEY;

    const response = await axios.post(
      'https://api.exa.ai/contents',
      { urls: [url], text: true },
      {
        headers: {
          'x-api-key': exaKey,
          'Content-Type': 'application/json',
        },
      }
    );

    const pageContent = response.data?.results?.[0];
    if (!pageContent?.text) {
      throw new Error(`Failed to extract content from URL: ${url}`);
    }

    return this.ingestText({
      text: pageContent.text,
      title: pageContent.title || url,
      collectionId,
      chunkSize,
      metadata: { source: url, sourceType: 'url', author: pageContent.author },
    });
  },

  /**
   * Ingest an uploaded file (PDF, DOCX, TXT, MD).
   * @param {{ filePath: string, originalName: string, mimeType: string, collectionId?: string }} params
   */
  async ingestFile({ filePath, originalName, mimeType, collectionId = DEFAULT_COLLECTION }) {
    let text = '';
    const ext = originalName.split('.').pop().toLowerCase();

    switch (ext) {
      case 'pdf': {
        const { PDFParse } = await import('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await PDFParse(dataBuffer);
        text = pdfData.text;
        break;
      }
      case 'docx': {
        const mammoth = mammothLib.default || mammothLib;
        const result = await mammoth.extractRawText({ path: filePath });
        text = result.value;
        break;
      }
      case 'txt':
      case 'md':
      case 'csv':
      case 'json':
        text = fs.readFileSync(filePath, 'utf-8');
        break;
      default:
        throw new Error(`Unsupported file type: ${ext}. Supported: pdf, docx, txt, md, csv, json`);
    }

    if (!text || text.trim().length < 10) {
      throw new Error('File contained no extractable text');
    }

    return this.ingestText({
      text,
      title: originalName,
      collectionId,
      metadata: { source: originalName, sourceType: 'file', mimeType, fileExtension: ext },
    });
  },

  // ── Retrieval ────────────────────────────────────────────────────────────

  /**
   * Retrieve relevant chunks for a query (no generation).
   * @param {{ query: string, collectionId?: string, topK?: number, minScore?: number, hybrid?: boolean }} params
   * @returns {Promise<{ chunks: Array, query: string }>}
   */
  async retrieve({ query, collectionId, topK = 5, minScore = 0.3, hybrid = false }) {
    // Embed the query
    const { embedding } = await EmbeddingService.embedText(query);

    let chunks;
    if (hybrid) {
      chunks = await VectorStoreService.hybridSearch(embedding, query, {
        collectionId,
        topK,
      });
    } else {
      chunks = await VectorStoreService.search(embedding, {
        collectionId,
        topK,
        minScore,
      });
    }

    return { chunks, query, count: chunks.length, hybrid };
  },

  // ── Query (Retrieve + Generate) ─────────────────────────────────────────

  /**
   * Full RAG query: retrieve relevant chunks → generate grounded answer.
   * @param {{ query: string, collectionId?: string, topK?: number, hybrid?: boolean, model?: string, systemPrompt?: string }} params
   * @returns {Promise<{ answer: string, sources: Array, query: string, model: string }>}
   */
  async query({ query, collectionId, topK = 5, hybrid = true, model, systemPrompt }) {
    const startTime = Date.now();

    // Step 1: Retrieve
    const { chunks } = await this.retrieve({ query, collectionId, topK, hybrid });

    if (chunks.length === 0) {
      return {
        answer: 'No relevant documents found in the knowledge base for this query.',
        sources: [],
        query,
        model: 'none',
        retrievalDurationMs: Date.now() - startTime,
      };
    }

    // Step 2: Build context from retrieved chunks
    const contextParts = chunks.map((chunk, i) =>
      `[Source ${i + 1} — "${chunk.documentTitle}" (score: ${chunk.score})]:\n${chunk.content}`
    );
    const context = contextParts.join('\n\n---\n\n');

    // Step 3: Generate grounded answer
    const sysPrompt = systemPrompt || `You are a precise RAG assistant. Answer questions ONLY based on the provided source documents.

Rules:
1. Cite sources by number [Source N] for every claim
2. If the documents don't contain enough information, say so explicitly
3. Never fabricate information not in the sources
4. Be concise and directly answer the question`;

    const useHeavy = (model === 'gpt-oss-120b') || (!model && query.length > 200);
    const chatFn = useHeavy ? llmChat : llmLightChat;
    const selectedModel = model || (useHeavy ? 'gpt-oss-120b' : config.llm?.lightModel || 'gpt-oss-20b');

    const messages = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: `Documents:\n${context}\n\n---\n\nQuestion: ${query}` },
    ];

    const response = await chatFn(messages, {
      model: selectedModel,
      temperature: 0.0,
    });

    const answer = response.choices?.[0]?.message?.content || '';
    const totalDurationMs = Date.now() - startTime;

    logger.info(`[RAG] Query answered in ${totalDurationMs}ms (${chunks.length} chunks, model: ${selectedModel})`);

    return {
      answer,
      sources: chunks.map(c => ({
        documentTitle: c.documentTitle,
        documentSource: c.documentSource,
        score: c.score,
        excerpt: c.content.slice(0, 200),
      })),
      query,
      model: selectedModel,
      chunksUsed: chunks.length,
      retrievalDurationMs: Date.now() - startTime - totalDurationMs,
      totalDurationMs,
    };
  },

  /**
   * Streaming RAG query — streams the generation while providing sources upfront.
   * @param {{ query, collectionId, topK, hybrid }} params
   * @returns {Promise<{ sources: Array, stream: AsyncIterable }>}
   */
  async queryStream({ query, collectionId, topK = 5, hybrid = true }) {
    const { chunks } = await this.retrieve({ query, collectionId, topK, hybrid });

    const contextParts = chunks.map((chunk, i) =>
      `[Source ${i + 1} — "${chunk.documentTitle}" (score: ${chunk.score})]:\n${chunk.content}`
    );
    const context = contextParts.join('\n\n---\n\n');

    const messages = [
      {
        role: 'system',
        content: `You are a precise RAG assistant. Answer ONLY from the provided sources. Cite sources by number [Source N].`,
      },
      {
        role: 'user',
        content: `Documents:\n${context}\n\n---\n\nQuestion: ${query}`,
      },
    ];

    const stream = await llmStream(messages, {
      model: config.llm?.model || 'gpt-oss-120b',
      temperature: 0.0,
    });

    return {
      sources: chunks.map(c => ({
        documentTitle: c.documentTitle,
        score: c.score,
        excerpt: c.content.slice(0, 200),
      })),
      stream,
    };
  },

  // ── Document Management ──────────────────────────────────────────────────

  async listDocuments(collectionId) {
    return VectorStoreService.listDocuments(collectionId || DEFAULT_COLLECTION);
  },

  async getDocument(documentId) {
    return VectorStoreService.getDocument(documentId);
  },

  async deleteDocument(documentId) {
    return VectorStoreService.deleteDocument(documentId);
  },

  /** Embedding model info. */
  getEmbeddingModels() {
    return EmbeddingService.listModels();
  },
};

export default RagService;
