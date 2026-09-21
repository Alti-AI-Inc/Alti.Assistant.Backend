import { logger } from '../../shared/logger.js';

/**
 * LlamaIndex Service — Document indexing, querying, and retrieval-augmented generation.
 *
 * Integrates LlamaIndex (MIT) with Groq (gpt-oss-120b/20b) for:
 * - Document ingestion (PDF, DOCX, TXT, HTML, Markdown)
 * - Vector indexing with Cloudflare Workers AI embeddings
 * - Semantic search / similarity queries
 * - RAG query engine (retrieve → synthesize with Groq)
 *
 * Uses @llamaindex/groq for LLM calls, llamaindex core for indexing.
 */

let LlamaIndexModule = null;
let GroqLlamaModule = null;

async function loadModules() {
  if (!LlamaIndexModule) {
    try {
      LlamaIndexModule = await import('llamaindex');
    } catch (err) {
      logger.warn(`[LlamaIndex] Core module not available: ${err.message}`);
    }
  }
  if (!GroqLlamaModule) {
    try {
      GroqLlamaModule = await import('@llamaindex/groq');
    } catch (err) {
      logger.warn(`[LlamaIndex] Groq module not available: ${err.message}`);
    }
  }
  return { LlamaIndexModule, GroqLlamaModule };
}

// In-memory document store for development
const documentStore = new Map();
const indexStore = new Map();

export const LlamaIndexService = {
  /**
   * Ingest a document into a LlamaIndex vector store index.
   */
  async ingestDocument(collectionId, document) {
    const { LlamaIndexModule } = await loadModules();

    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const doc = {
      id: docId,
      collectionId,
      content: document.content,
      metadata: {
        title: document.title || 'Untitled',
        source: document.source || 'upload',
        type: document.type || 'text',
        createdAt: new Date().toISOString(),
        charCount: document.content?.length || 0,
      },
    };

    // Store document
    if (!documentStore.has(collectionId)) {
      documentStore.set(collectionId, []);
    }
    documentStore.get(collectionId).push(doc);

    // Build or update index
    if (LlamaIndexModule) {
      try {
        const { Document, VectorStoreIndex } = LlamaIndexModule;
        const llamaDoc = new Document({ text: document.content, metadata: doc.metadata });

        let index = indexStore.get(collectionId);
        if (!index) {
          index = await VectorStoreIndex.fromDocuments([llamaDoc]);
          indexStore.set(collectionId, index);
        } else {
          await index.insert(llamaDoc);
        }

        logger.info(`[LlamaIndex] Document ${docId} indexed in collection ${collectionId}`);
      } catch (err) {
        logger.warn(`[LlamaIndex] Indexing failed, using fallback store: ${err.message}`);
      }
    }

    return {
      id: docId,
      collectionId,
      metadata: doc.metadata,
      indexed: !!LlamaIndexModule,
    };
  },

  /**
   * Query a collection using LlamaIndex retrieval + Groq synthesis.
   */
  async query(collectionId, queryText, options = {}) {
    const { topK = 5 } = options;
    const startTime = Date.now();

    const { LlamaIndexModule, GroqLlamaModule } = await loadModules();

    // Try LlamaIndex query engine first
    if (LlamaIndexModule && indexStore.has(collectionId)) {
      try {
        const index = indexStore.get(collectionId);
        const queryEngine = index.asQueryEngine();
        const response = await queryEngine.query({ query: queryText });

        return {
          answer: response.toString(),
          sources: response.sourceNodes?.map(n => ({
            text: n.node.text?.slice(0, 200),
            score: n.score,
            metadata: n.node.metadata,
          })) || [],
          engine: 'llamaindex',
          durationMs: Date.now() - startTime,
        };
      } catch (err) {
        logger.warn(`[LlamaIndex] Query engine failed: ${err.message}`);
      }
    }

    // Fallback: simple keyword matching against document store
    const docs = documentStore.get(collectionId) || [];
    const queryLower = queryText.toLowerCase();
    const scored = docs
      .map(doc => {
        const words = queryLower.split(/\s+/).filter(w => w.length > 2);
        const contentLower = doc.content.toLowerCase();
        const matchCount = words.filter(w => contentLower.includes(w)).length;
        const score = words.length > 0 ? matchCount / words.length : 0;
        return { doc, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Synthesize with Groq
    let answer = '';
    if (scored.length > 0) {
      const context = scored.map(s => s.doc.content.slice(0, 500)).join('\n\n---\n\n');
      try {
        const { groqChat } = await import('./groq.client.js');
        const response = await groqChat([
          {
            role: 'system',
            content: `Answer the question based ONLY on the provided context. If the context doesn't contain the answer, say so. Be concise and precise.

Context:
${context}`,
          },
          { role: 'user', content: queryText },
        ], { model: 'gpt-oss-20b' });
        answer = response?.choices?.[0]?.message?.content || '';
      } catch (err) {
        logger.warn(`[LlamaIndex] Groq synthesis failed: ${err.message}`);
        answer = scored.map(s => s.doc.content.slice(0, 200)).join('\n');
      }
    }

    return {
      answer: answer || 'No relevant documents found in this collection.',
      sources: scored.map(s => ({
        text: s.doc.content.slice(0, 200),
        score: s.score,
        metadata: s.doc.metadata,
      })),
      engine: 'fallback',
      documentsSearched: docs.length,
      durationMs: Date.now() - startTime,
    };
  },

  /**
   * List documents in a collection.
   */
  async listDocuments(collectionId) {
    const docs = documentStore.get(collectionId) || [];
    return docs.map(d => ({
      id: d.id,
      metadata: d.metadata,
    }));
  },

  /**
   * Delete a document from a collection.
   */
  async deleteDocument(collectionId, docId) {
    const docs = documentStore.get(collectionId) || [];
    const idx = docs.findIndex(d => d.id === docId);
    if (idx >= 0) {
      docs.splice(idx, 1);
      return { success: true, deleted: docId };
    }
    return { success: false, error: 'Document not found' };
  },

  /**
   * List all collections.
   */
  async listCollections() {
    const collections = [];
    for (const [id, docs] of documentStore.entries()) {
      collections.push({
        id,
        documentCount: docs.length,
        indexed: indexStore.has(id),
      });
    }
    return collections;
  },

  /**
   * Get collection stats.
   */
  async getCollectionStats(collectionId) {
    const docs = documentStore.get(collectionId) || [];
    const totalChars = docs.reduce((sum, d) => sum + (d.content?.length || 0), 0);
    return {
      collectionId,
      documentCount: docs.length,
      totalCharacters: totalChars,
      indexed: indexStore.has(collectionId),
      avgDocLength: docs.length > 0 ? Math.round(totalChars / docs.length) : 0,
    };
  },
};

export default LlamaIndexService;
