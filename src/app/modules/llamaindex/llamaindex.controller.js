import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { ragService } from './llamaindex.service.js';
import { metadataAgentService } from './llamaindex.metadataAgent.js';

export const uploadAndIndexDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.uploadAndIndexDocumentService(filePath, originalName, userId);

    // Asynchronously trigger deep semantic profiling
    metadataAgentService.enrichDocument(null, originalName, result.docId, userId).catch(() => {});

    // Optional: delete temp file
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
    }

    res.status(200).json({ message: 'Document indexed', result });
  } catch (error) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res
        .status(413)
        .json({ error: 'File too large. Maximum allowed size is 100GB.' });
    }
    res.status(500).json({ error: error.message });
  }
};

export const queryIndex = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const answer = await ragService.queryDocument(query, userId);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: SSE Streaming Query Endpoint
// Delivers token-by-token response via Server-Sent Events
// ─────────────────────────────────────────────────────────────────────────────
export const queryIndexStream = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required and must be a non-empty string.' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    const onChunk = (event) => {
      const payload = JSON.stringify(event);
      res.write(`data: ${payload}\n\n`);
    };

    await ragService.queryDocumentStream(query, userId, onChunk);

    res.end();
  } catch (error) {
    // If headers haven't been sent yet, respond with JSON error
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      // Otherwise send error as SSE event and close
      res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`);
      res.end();
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Document Management Controllers
// ─────────────────────────────────────────────────────────────────────────────
export const getDocuments = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.listDocuments(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const removeDocument = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { docId } = req.params;

    if (!docId) {
      return res.status(400).json({ error: 'Document ID is required.' });
    }

    const result = await ragService.deleteDocument(userId, docId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const clearDocuments = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.clearAllDocuments(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5: Advanced Query Endpoint (Router + SubQuestion engines)
// Supports modes: 'auto', 'router', 'subquestion', 'vector'
// ─────────────────────────────────────────────────────────────────────────────
export const queryIndexAdvanced = async (req, res) => {
  try {
    const { query, mode } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required and must be a non-empty string.' });
    }

    const validModes = ['auto', 'router', 'subquestion', 'vector'];
    const selectedMode = validModes.includes(mode) ? mode : 'auto';

    const answer = await ragService.queryDocumentAdvanced(query, userId, selectedMode);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6: ReAct Agent Endpoint (autonomous agent with tool calling)
// ─────────────────────────────────────────────────────────────────────────────
export const queryIndexAgent = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    const answer = await ragService.queryDocumentAgent(query, userId);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6: CondenseQuestionChatEngine Endpoint (native LlamaIndex chat)
// ─────────────────────────────────────────────────────────────────────────────
export const queryIndexChatEngine = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    const answer = await ragService.queryDocumentChatEngine(query, userId);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6: Corpus Analytics & Insights
// ─────────────────────────────────────────────────────────────────────────────
export const corpusAnalytics = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const analytics = await ragService.getCorpusAnalytics(userId);
    res.status(200).json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6: Chat History Summarization
// ─────────────────────────────────────────────────────────────────────────────
export const chatSummary = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const summary = await ragService.summarizeChatHistory(userId);
    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: Self-Correcting Query Pipeline
// ─────────────────────────────────────────────────────────────────────────────
export const queryIndexSelfCorrecting = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    const answer = await ragService.queryDocumentSelfCorrecting(query, userId);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: Hybrid Search (Vector + Keyword Fusion via RRF)
// ─────────────────────────────────────────────────────────────────────────────
export const queryIndexHybrid = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    const answer = await ragService.queryDocumentHybrid(query, userId);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: Pipeline Observability Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export const pipelineObservability = async (req, res) => {
  try {
    const data = ragService.getPipelineObservability();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: Document Keyword Extraction
// ─────────────────────────────────────────────────────────────────────────────
export const documentKeywords = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const keywords = await ragService.extractDocumentKeywords(userId);
    res.status(200).json(keywords);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8: Full-Spectrum Retrieval (6 Retriever Types + RRF + MMR)
// ─────────────────────────────────────────────────────────────────────────────
export const queryIndexFullSpectrum = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    const answer = await ragService.queryDocumentFullSpectrum(query, userId);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8: ObjectIndex Agent (SimpleToolNodeMapping)
// ─────────────────────────────────────────────────────────────────────────────
export const queryIndexObjectAgent = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    const answer = await ragService.queryDocumentObjectAgent(query, userId);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8: Simple Chat (no index required)
// ─────────────────────────────────────────────────────────────────────────────
export const querySimpleChat = async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const answer = await ragService.querySimpleChat(message, userId);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8: Document Comparison
// ─────────────────────────────────────────────────────────────────────────────
export const compareDocumentsCtrl = async (req, res) => {
  try {
    const { docId1, docId2 } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!docId1 || !docId2) {
      return res.status(400).json({ error: 'Both docId1 and docId2 are required.' });
    }

    const result = await ragService.compareDocuments(docId1, docId2, userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8: Export Corpus Snapshot
// ─────────────────────────────────────────────────────────────────────────────
export const exportCorpusSnapshotCtrl = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.exportCorpusSnapshot(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9: Intelligent Query Classifier (auto-routes to best engine)
// ─────────────────────────────────────────────────────────────────────────────
export const queryClassifyAndRoute = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    const answer = await ragService.classifyAndRoute(query, userId);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9: Context-Aware Chat (DefaultContextGenerator)
// ─────────────────────────────────────────────────────────────────────────────
export const queryContextAwareChat = async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const answer = await ragService.queryContextAwareChat(message, userId);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9: Index Diagnostics
// ─────────────────────────────────────────────────────────────────────────────
export const indexDiagnostics = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.getIndexDiagnostics(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9: Pipeline Health Check
// ─────────────────────────────────────────────────────────────────────────────
export const pipelineHealthCheck = async (req, res) => {
  try {
    const result = await ragService.runPipelineHealthCheck();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9: Batch Document Processing
// ─────────────────────────────────────────────────────────────────────────────
export const batchProcess = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.batchProcessDocuments(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9: Enhanced Streaming Query
// ─────────────────────────────────────────────────────────────────────────────
export const queryEnhancedStream = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await ragService.queryStreamingQuery(query, userId);

    if (result.stream && typeof result.stream[Symbol.asyncIterator] === 'function') {
      for await (const chunk of result.stream) {
        const text = chunk.response || chunk.toString();
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    } else {
      // Fallback: send entire response as single chunk
      res.write(`data: ${JSON.stringify({ content: result.stream?.toString() || '' })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true, telemetry: result.telemetry })}\n\n`);
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10: Multi-Modal Image Document Indexing
// ─────────────────────────────────────────────────────────────────────────────
export const indexImageDocumentCtrl = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required.' });
    }
    const result = await ragService.indexImageDocument(req.file.path, req.file.originalname, userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10: Complete Pipeline Introspection
// ─────────────────────────────────────────────────────────────────────────────
export const pipelineIntrospection = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.getCompletePipelineIntrospection(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10: Advanced Text Analysis
// ─────────────────────────────────────────────────────────────────────────────
export const textAnalysis = async (req, res) => {
  try {
    const { docId } = req.params;
    const userId = req.user?.userId || req.user?.id || 'default_user';

    if (!docId) {
      return res.status(400).json({ error: 'Document ID is required.' });
    }

    const result = await ragService.analyzeDocumentText(docId, userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10: Pipeline Configuration Validation
// ─────────────────────────────────────────────────────────────────────────────
export const validatePipeline = async (req, res) => {
  try {
    const result = ragService.validatePipelineConfiguration();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Configuration Registry
// ─────────────────────────────────────────────────────────────────────────────
export const configRegistry = async (req, res) => {
  try {
    const result = ragService.getConfigurationRegistry();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Prompt Library
// ─────────────────────────────────────────────────────────────────────────────
export const promptLibrary = async (req, res) => {
  try {
    const result = ragService.getPromptLibrary();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Schema Validation
// ─────────────────────────────────────────────────────────────────────────────
export const schemaValidation = async (req, res) => {
  try {
    const { data, schemaName } = req.body || {};
    const result = ragService.validateWithSchemas(data, schemaName);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12: Semantic Query Cache
// ─────────────────────────────────────────────────────────────────────────────
export const semanticCacheQuery = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';
    if (!query) return res.status(400).json({ error: 'Query is required.' });
    const result = await ragService.querySemanticallyCached(query, userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12: Adaptive Chunking Strategy
// ─────────────────────────────────────────────────────────────────────────────
export const adaptiveChunking = async (req, res) => {
  try {
    const { fileName } = req.query;
    if (!fileName) return res.status(400).json({ error: 'fileName query param is required.' });
    const result = ragService.getAdaptiveChunkingStrategy(fileName);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12: Document Relationship Graph
// ─────────────────────────────────────────────────────────────────────────────
export const documentGraph = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.buildDocumentRelationshipGraph(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12: Retrieval Strategy Benchmark
// ─────────────────────────────────────────────────────────────────────────────
export const retrievalBenchmark = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';
    if (!query) return res.status(400).json({ error: 'Query is required.' });
    const result = await ragService.benchmarkRetrievalStrategies(query, userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Phase 13: Query Decomposition
// ─────────────────────────────────────────────────────────────────────────────
export const queryDecomposition = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';
    if (!query) return res.status(400).json({ error: 'Query is required.' });
    const result = await ragService.queryWithDecomposition(query, userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 13: Metadata Extraction Pipeline
// ─────────────────────────────────────────────────────────────────────────────
export const metadataExtraction = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.runMetadataExtractionPipeline(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 13: Custom Re-Ranking Query
// ─────────────────────────────────────────────────────────────────────────────
export const queryReranking = async (req, res) => {
  try {
    const { query, topK, rerankTopK, keywordWeight, freshnessWeight, similarityWeight } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';
    if (!query) return res.status(400).json({ error: 'Query is required.' });
    const result = await ragService.queryWithReranking(query, userId, {
      topK, rerankTopK, keywordWeight, freshnessWeight, similarityWeight,
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 13: Submit Query Feedback
// ─────────────────────────────────────────────────────────────────────────────
export const submitFeedback = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.submitQueryFeedback(userId, req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 13: Feedback Analytics
// ─────────────────────────────────────────────────────────────────────────────
export const feedbackAnalytics = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.getQueryFeedbackAnalytics(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 14: Evaluate Arbitrary Response
// ─────────────────────────────────────────────────────────────────────────────
export const evaluateResponseCtrl = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { query, response, context } = req.body;
    if (!query || !response) {
      return res.status(400).json({ error: 'query and response are required in body.' });
    }
    const result = await ragService.evaluateArbitraryResponse(query, response, context, userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 14: Evaluation History
// ─────────────────────────────────────────────────────────────────────────────
export const evaluationHistoryCtrl = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.getEvaluationHistory(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 15: Event-Driven Live Sessions (SSE complete stream)
// ─────────────────────────────────────────────────────────────────────────────
export const liveSessionStreamCtrl = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'query is required.' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const onChunk = (chunk) => {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    };

    const result = await ragService.streamLiveSession(query, userId, onChunk);
    res.write(`data: ${JSON.stringify({ complete: true, payload: result })}\n\n`);
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16: Advanced Storage Strategy Uploader
// ─────────────────────────────────────────────────────────────────────────────
export const indexDocAdvancedCtrl = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const strategy = req.body.strategy || 'upsert';
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const result = await ragService.indexDocumentAdvanced(
      req.file.path,
      req.file.originalname,
      userId,
      strategy
    );

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 17: Multi-Step Agentic Workflow Tracing
// ─────────────────────────────────────────────────────────────────────────────
export const queryAgentWorkflowCtrl = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'query is required.' });
    }
    const result = await ragService.runAgentWorkflow(query, userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 18: Prompt Optimization and token budgeting
// ─────────────────────────────────────────────────────────────────────────────
export const optimizePromptCtrl = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const { promptText } = req.body;
    if (!promptText) {
      return res.status(400).json({ error: 'promptText is required.' });
    }
    const result = await ragService.optimizePrompt(promptText, userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Phase 3: PDF Export Controller (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
export const exportSessionPDF = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const persistDir = path.resolve(`storage/ragsystem/${userId}`);
    const historyPath = path.join(persistDir, 'chat_history.json');
    const profilePath = path.join(persistDir, 'document_profile.json');

    if (!existsSync(historyPath)) {
      return res.status(400).json({ error: 'No active chat history found to export.' });
    }

    const historyData = await fs.readFile(historyPath, 'utf-8');
    const chatHistory = JSON.parse(historyData);

    let docProfile = null;
    if (existsSync(profilePath)) {
      const profileData = await fs.readFile(profilePath, 'utf-8');
      docProfile = JSON.parse(profileData);
    }

    // Set Response Headers for PDF Download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Alti_RAG_Analysis_${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    // Styling Tokens
    const primaryColor = '#1E3A8A'; // Deep Navy
    const secondaryColor = '#0F766E'; // Teal
    const textColor = '#1F2937'; // Slate Dark
    const lightBg = '#F3F4F6'; // Cool Gray
    const accentBg = '#F0FDFA'; // Premium Light Mint
    const strokeColor = '#E5E7EB'; // Border light

    // 1. Premium Header Banner
    doc.rect(0, 0, 595.28, 80).fill(primaryColor);
    doc.fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .fontSize(22)
       .text('ALTI RAG ANALYSIS REPORT', 50, 25);
    doc.fontSize(10)
       .font('Helvetica')
       .text(`Session Report | User ID: ${userId} | Compiled: ${new Date().toLocaleDateString()}`, 50, 52);

    // Spacer
    doc.moveDown(4);

    // 2. Global Document Profiling summary if available
    if (docProfile) {
      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .fontSize(14)
         .text('Document Profile Overview');
      
      doc.moveDown(0.4);
      
      // Draw light box background for Profile
      doc.rect(50, doc.y, 495.28, 70).fill(lightBg);
      doc.fillColor(textColor)
         .font('Helvetica-Oblique')
         .fontSize(10)
         .text(docProfile.summary, 60, doc.y + 10, { width: 475.28 });
         
      doc.moveDown(5);
    }

    // 3. Dialogue Stream
    doc.fillColor(primaryColor)
       .font('Helvetica-Bold')
       .fontSize(14)
       .text('Conversation Dialogue History');
    doc.moveDown(0.8);

    for (const turn of chatHistory) {
      const isUser = turn.role === 'user';
      const senderName = isUser ? 'User Inquiry' : 'Alti real-time AI analyst';
      const boxColor = isUser ? lightBg : accentBg;
      const borderTheme = isUser ? strokeColor : '#A7F3D0';
      const containerPadding = 24;
      
      // Calculate content dimensions dynamically
      doc.font('Helvetica').fontSize(9.5);
      const textHeight = doc.heightOfString(turn.content, { width: 450 });
      const containerHeight = textHeight + containerPadding;

      // Check if container overflows current page margins, trigger manual page break if needed
      if (doc.y + containerHeight > 750) {
        doc.addPage();
      }

      const boxY = doc.y;
      
      // Draw styled box block
      doc.rect(50, boxY, 495.28, containerHeight).fill(boxColor);
      doc.rect(50, boxY, 495.28, containerHeight).stroke(borderTheme);

      // Render role label
      doc.fillColor(isUser ? primaryColor : secondaryColor)
         .font('Helvetica-Bold')
         .fontSize(9)
         .text(senderName.toUpperCase(), 62, boxY + 8);

      // Render content
      doc.fillColor(textColor)
         .font('Helvetica')
         .fontSize(9.5)
         .text(turn.content, 62, boxY + 20, { width: 470, align: 'justify' });

      doc.moveDown(2.5);
    }

    // Footer copyright banner
    doc.moveDown(3);
    doc.fontSize(8)
       .fillColor('#9CA3AF')
       .text('CONFIDENTIAL | Powered by Alti & LlamaIndex Cognitive RAG Platform © 2026', { align: 'center' });

    doc.end();

  } catch (err) {
    console.error('PDF Export Controller error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: `Failed to compile and export PDF report: ${err.message}` });
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Temporal Ingestion Status Progress Query
// ─────────────────────────────────────────────────────────────────────────────
export const queryIngestionStatus = async (req, res) => {
  try {
    const { workflowId } = req.params;
    if (!workflowId) {
      return res.status(400).json({ error: 'workflowId parameter is required.' });
    }

    const { temporalClientCoordinator } = await import('../workflow_automation/services/temporal/client.js');
    await temporalClientCoordinator.connect();

    if (temporalClientCoordinator.isMock) {
      return res.status(200).json({
        success: true,
        workflowId,
        isMock: true,
        status: 'COMPLETED',
        currentStep: 'committing',
        progressPercent: 100,
        details: 'Durable RAG ingestion successfully simulated in local sandbox.'
      });
    }

    const handle = temporalClientCoordinator.client.workflow.getHandle(workflowId);
    const description = await handle.describe();
    const status = description.status.name;
    
    let currentStep = 'pending';
    let progressPercent = 0;

    if (status === 'RUNNING') {
      currentStep = 'parsing';
      progressPercent = 30;
      const pendingActivities = description.pendingActivities || [];
      if (pendingActivities.length > 0) {
        const activeActivity = pendingActivities[0].activityType;
        if (activeActivity.includes('parse')) {
          currentStep = 'parsing';
          progressPercent = 40;
        } else if (activeActivity.includes('metadata')) {
          currentStep = 'metadata_extraction';
          progressPercent = 60;
        } else if (activeActivity.includes('embed')) {
          currentStep = 'embedding';
          progressPercent = 80;
        } else if (activeActivity.includes('commit')) {
          currentStep = 'committing';
          progressPercent = 90;
        }
      }
    } else if (status === 'COMPLETED') {
      currentStep = 'done';
      progressPercent = 100;
    } else if (status === 'FAILED' || status === 'TERMINATED') {
      currentStep = 'failed';
      progressPercent = 0;
    }

    res.status(200).json({
      success: true,
      workflowId,
      isMock: false,
      status,
      currentStep,
      progressPercent,
      details: `Temporal workflow is in "${status}" state.`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
