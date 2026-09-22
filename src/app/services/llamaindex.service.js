import fs from 'fs';
import path from 'path';
import { logger } from '../../shared/logger.js';
import { LlamaDocument } from '../modules/llamaindex/llamaindex.model.js';
import config from '../../../config/index.js';

let LlamaIndexModule = null;
let OpenAILlamaModule = null;
let LlamaCloudModule = null;

/**
 * Initializes LlamaIndex Settings
 */
async function loadModules() {
  if (LlamaIndexModule) return { LlamaIndexModule, LlamaCloudModule };

  try {
    LlamaIndexModule = await import('llamaindex');
    
    LlamaCloudModule = await import('@llamaindex/cloud');

    const { Settings, BaseEmbedding } = LlamaIndexModule;
    const { OpenAI } = LlamaIndexModule;

    // 1. Configure OpenAI as the global LLM
    Settings.llm = new OpenAI({
      apiKey: config.llm?.apiKey || process.env.LLM_API_KEY,
      model: 'gpt-oss-120b',
    });

    // 2. Configure Custom Together AI Embedding Model
    class TogetherEmbedding extends BaseEmbedding {
      constructor() {
        super();
        this.apiKey = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
        this.model = 'togethercomputer/m2-bert-80M-8k-retrieval';
      }

      async getTextEmbedding(text) {
        if (!this.apiKey) {
           return new Array(768).fill(0.01); // Mock fallback if keys missing
        }
        const res = await fetch(
          `https://api.together.xyz/v1/embeddings`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              model: this.model,
              input: text 
            }),
          }
        );
        const data = await res.json();
        return data.data[0].embedding; 
      }

      async getQueryEmbedding(query) {
        return this.getTextEmbedding(query);
      }
    }

    Settings.embedModel = new TogetherEmbedding();

  } catch (err) {
    logger.error(`[LlamaIndex] Failed to initialize modules: ${err.message}`);
  }
  return { LlamaIndexModule, LlamaCloudModule };
}

export const LlamaIndexService = {
  /**
   * Ingest a document (Text or PDF via LlamaParse)
   */
  async ingestDocument(collectionId, document) {
    const { LlamaIndexModule, LlamaCloudModule } = await loadModules();
    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    let content = document.content;
    let metadata = document.metadata || {};

    // Use LlamaParse if it's a file path and api key exists
    if (document.filePath && process.env.LLAMA_CLOUD_API_KEY && LlamaCloudModule) {
      try {
        const { LlamaParseReader } = LlamaCloudModule;
        const reader = new LlamaParseReader({ resultType: 'markdown' });
        const parsedDocs = await reader.loadData(document.filePath);
        content = parsedDocs.map(d => d.text).join('\\n');
        metadata.parsedVia = 'LlamaParse';
      } catch (err) {
        logger.warn(`[LlamaIndex] LlamaParse failed: ${err.message}`);
      }
    }

    // Persist to Mongoose
    const dbDoc = await LlamaDocument.create({
      collectionId,
      documentId: docId,
      content,
      metadata,
    });

    // Build vector index on disk
    if (LlamaIndexModule) {
      try {
        const { Document, VectorStoreIndex, storageContextFromDefaults } = LlamaIndexModule;
        const llamaDoc = new Document({ text: content, metadata });
        
        const storageDir = path.resolve(`./storage/llamaindex/${collectionId}`);
        if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
        
        const storageContext = await storageContextFromDefaults({ persistDir: storageDir });
        await VectorStoreIndex.fromDocuments([llamaDoc], { storageContext });
        
        dbDoc.indexed = true;
        await dbDoc.save();
        logger.info(`[LlamaIndex] Document ${docId} indexed to disk in ${collectionId}`);
      } catch (err) {
        logger.warn(`[LlamaIndex] Indexing failed: ${err.message}`);
      }
    }

    return { id: docId, collectionId, metadata, indexed: dbDoc.indexed };
  },

  /**
   * Query a collection
   */
  async query(collectionId, queryText, options = {}) {
    const { LlamaIndexModule } = await loadModules();
    const startTime = Date.now();
    let answer = 'No relevant documents found.';
    let sources = [];

    if (LlamaIndexModule) {
      try {
        const { VectorStoreIndex, storageContextFromDefaults } = LlamaIndexModule;
        const storageDir = path.resolve(`./storage/llamaindex/${collectionId}`);
        
        if (fs.existsSync(storageDir)) {
          const storageContext = await storageContextFromDefaults({ persistDir: storageDir });
          const index = await VectorStoreIndex.init({ storageContext });
          
          const queryEngine = index.asQueryEngine({ similarityTopK: options.topK || 5 });
          const response = await queryEngine.query({ query: queryText });
          
          answer = response.toString();
          sources = response.sourceNodes?.map(n => ({
            text: n.node.text?.slice(0, 200),
            score: n.score,
            metadata: n.node.metadata,
          })) || [];
          
          return { answer, sources, engine: 'llamaindex', durationMs: Date.now() - startTime };
        }
      } catch (err) {
        logger.warn(`[LlamaIndex] Query engine failed: ${err.message}`);
      }
    }

    return { answer, sources, engine: 'fallback', durationMs: Date.now() - startTime };
  },

  async listDocuments(collectionId) {
    const docs = await LlamaDocument.find({ collectionId }).select('documentId metadata indexed createdAt');
    return docs.map(d => ({ id: d.documentId, metadata: d.metadata, indexed: d.indexed, createdAt: d.createdAt }));
  },

  async deleteDocument(collectionId, docId) {
    const result = await LlamaDocument.deleteOne({ collectionId, documentId: docId });
    return { success: result.deletedCount > 0, deleted: docId };
  },

  async getCollectionStats(collectionId) {
    const count = await LlamaDocument.countDocuments({ collectionId });
    return { collectionId, documentCount: count };
  },
};

export default LlamaIndexService;
