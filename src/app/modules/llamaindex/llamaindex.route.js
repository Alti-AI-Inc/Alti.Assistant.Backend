import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import auth from '../../middlewares/auth/auth.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import { GCSStorageEngine } from '../../middlewares/uploder/uploder.js';
import {
  queryIndex,
  queryIndexStream,
  queryIndexAdvanced,
  queryIndexAgent,
  queryIndexChatEngine,
  queryIndexSelfCorrecting,
  queryIndexHybrid,
  queryIndexFullSpectrum,
  queryIndexObjectAgent,
  querySimpleChat,
  compareDocumentsCtrl,
  exportCorpusSnapshotCtrl,
  queryClassifyAndRoute,
  queryContextAwareChat,
  indexDiagnostics,
  pipelineHealthCheck,
  batchProcess,
  queryEnhancedStream,
  indexImageDocumentCtrl,
  pipelineIntrospection,
  textAnalysis,
  validatePipeline,
  configRegistry,
  promptLibrary,
  schemaValidation,
  semanticCacheQuery,
  adaptiveChunking,
  documentGraph,
  retrievalBenchmark,
  queryDecomposition,
  metadataExtraction,
  queryReranking,
  submitFeedback,
  feedbackAnalytics,
  corpusAnalytics,
  chatSummary,
  pipelineObservability,
  documentKeywords,
  uploadAndIndexDocument,
  exportSessionPDF,
  getDocuments,
  removeDocument,
  clearDocuments,
  evaluateResponseCtrl,
  evaluationHistoryCtrl,
  liveSessionStreamCtrl,
  indexDocAdvancedCtrl,
  queryAgentWorkflowCtrl,
  optimizePromptCtrl
} from './llamaindex.controller.js';
import { telemetryCollector, withTelemetry } from './llamaindex.telemetry.js';
import { queryRouterService } from './llamaindex.queryRouter.js';
import { metadataAgentService } from './llamaindex.metadataAgent.js';
import DocumentMetadata from './llamaindex.metadata.model.js';
import { relationshipGraphService } from './llamaindex.relationshipGraph.js';
import DocumentRelationship from './llamaindex.relationship.model.js';
import { graphRetrieverService } from './llamaindex.graphRetriever.js';

const router = express.Router();

const uploadDir = path.resolve('uploads/ragsystem');

// Ensure the folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = new GCSStorageEngine({ folder: 'ragsystem/documents' });
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/html',
    'text/csv',
    'text/javascript',
    'application/javascript',
    'text/x-python',
    'text/x-java-source',
    'text/x-c',
    'text/x-typescript',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1 * 1024 * 1024, // ⬅️ 1 MB = 1 * 1024 * 1024 bytes
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Document Indexing
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/index-doc',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  upload.single('file'),
  uploadAndIndexDocument
);

// ─────────────────────────────────────────────────────────────────────────────
// Query Endpoints
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/query',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  withTelemetry('query', queryIndex)
);

// Phase 4: SSE Streaming Query
router.post(
  '/query-stream',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  withTelemetry('query-stream', queryIndexStream)
);

// Phase 5: Advanced Query (Router + SubQuestion engines)
// Accepts { query: string, mode: 'auto'|'router'|'subquestion'|'vector' }
router.post(
  '/query-advanced',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexAdvanced
);

// ─────────────────────────────────────────────────────────────────────────────
// Document Management (Phase 4)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/documents',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  getDocuments
);

router.delete(
  '/documents/:docId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  removeDocument
);

router.delete(
  '/documents',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  clearDocuments
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6: Agent, Chat Engine, Analytics, and Chat Summary
// ─────────────────────────────────────────────────────────────────────────────

// ReAct Agent with tool calling (document search, calculator, datetime, text stats)
router.post(
  '/query-agent',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexAgent
);

// CondenseQuestionChatEngine with ChatSummaryMemoryBuffer
router.post(
  '/query-chat',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexChatEngine
);

// Corpus analytics and insights dashboard
router.get(
  '/analytics',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  corpusAnalytics
);

// Chat history summarization
router.get(
  '/chat-summary',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  chatSummary
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: Self-Correcting, Hybrid, Observability, Keywords
// ─────────────────────────────────────────────────────────────────────────────

// Self-correcting query pipeline (auto re-queries on low eval scores)
router.post(
  '/query-selfcorrect',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexSelfCorrecting
);

// Hybrid search (Vector + Keyword via Reciprocal Rank Fusion)
router.post(
  '/query-hybrid',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexHybrid
);

// Pipeline observability dashboard (CallbackManager event log + stats)
router.get(
  '/observability',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  pipelineObservability
);

// Document keyword extraction (RAKE + simple + LLM profile)
router.get(
  '/keywords',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  documentKeywords
);
// ─────────────────────────────────────────────────────────────────────────────
// Phase 8: Full-Spectrum, ObjectAgent, SimpleChat, Compare, Export
// ─────────────────────────────────────────────────────────────────────────────

// Full-spectrum retrieval (6 retriever types + RRF + MMR)
router.post(
  '/query-fullspectrum',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexFullSpectrum
);

// ObjectIndex agent with SimpleToolNodeMapping
router.post(
  '/query-objectagent',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexObjectAgent
);

// Simple chat (no index required)
router.post(
  '/simple-chat',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  querySimpleChat
);

// Document comparison
router.post(
  '/compare-documents',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  compareDocumentsCtrl
);

// Export corpus snapshot
router.get(
  '/export-corpus',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  exportCorpusSnapshotCtrl
);
// ─────────────────────────────────────────────────────────────────────────────
// Phase 9: Classifier, ContextChat, Diagnostics, Health, Batch, Stream
// ─────────────────────────────────────────────────────────────────────────────

// Intelligent query classifier (auto-routes to best engine)
router.post(
  '/query-classify',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  withTelemetry('query-classify', queryClassifyAndRoute)
);

// Context-aware chat (DefaultContextGenerator)
router.post(
  '/context-chat',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  withTelemetry('context-chat', queryContextAwareChat)
);

// Index diagnostics (node introspection)
router.get(
  '/diagnostics',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  indexDiagnostics
);

// Pipeline health check (10-point self-test)
router.get(
  '/health-check',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  pipelineHealthCheck
);

// Batch document processing
router.post(
  '/batch-process',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  batchProcess
);

// Enhanced streaming query
router.post(
  '/query-enhanced-stream',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryEnhancedStream
);
// ─────────────────────────────────────────────────────────────────────────────
// Phase 10: Image Indexing, Introspection, Text Analysis, Validation
// ─────────────────────────────────────────────────────────────────────────────

// Multi-modal image document indexing (Gemini Vision)
router.post(
  '/index-image',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  upload.single('image'),
  indexImageDocumentCtrl
);

// Complete pipeline introspection (all 184 classes)
router.get(
  '/introspection',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  pipelineIntrospection
);

// Advanced text analysis (per document)
router.get(
  '/text-analysis/:docId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  textAnalysis
);

// Pipeline configuration validation (12-point check)
router.get(
  '/validate',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validatePipeline
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Configuration, Prompts, Schema Validation
// ─────────────────────────────────────────────────────────────────────────────

// Full configuration registry (all 18 constants + 11 enums)
router.get(
  '/config',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  configRegistry
);

// Prompt library (all 22 built-in prompts)
router.get(
  '/prompts',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  promptLibrary
);

// Schema validation (all 7 Zod schemas)
router.post(
  '/validate-schema',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  schemaValidation
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12: Semantic Cache, Adaptive Chunking, Doc Graph, Benchmark
// ─────────────────────────────────────────────────────────────────────────────

// Semantic query caching (similarity-based dedup)
router.post(
  '/query-cached',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  withTelemetry('query-cached', semanticCacheQuery)
);

// Adaptive chunking strategy recommendation
router.get(
  '/chunking-strategy',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  adaptiveChunking
);

// Document relationship graph
router.get(
  '/document-graph',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  documentGraph
);

// Multi-strategy retrieval benchmark
router.post(
  '/benchmark-retrieval',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  retrievalBenchmark
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 13: Decomposition, Extraction, Re-Ranking, Feedback
// ─────────────────────────────────────────────────────────────────────────────

// SubQuestion decomposition query
router.post(
  '/query-decompose',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryDecomposition
);

// Metadata extraction pipeline
router.post(
  '/extract-metadata',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  metadataExtraction
);

// Custom multi-signal re-ranking query
router.post(
  '/query-rerank',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryReranking
);

// Submit query feedback (rating, relevance)
router.post(
  '/feedback',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  submitFeedback
);

// Feedback analytics & optimization recommendations
router.get(
  '/feedback-analytics',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  feedbackAnalytics
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 14: Automated Evaluation Pipeline
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/evaluate-response',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  evaluateResponseCtrl
);

router.get(
  '/evaluation-history',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  evaluationHistoryCtrl
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 15: Event-Driven Live Sessions
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/live-session/stream',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  liveSessionStreamCtrl
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16: Advanced Storage Strategies
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/index-doc-advanced',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  upload.single('file'),
  indexDocAdvancedCtrl
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 17: Multi-Step Agent Workflows
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/query-agent-workflow',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryAgentWorkflowCtrl
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 18: Prompt Optimization API
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/optimize-prompt',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  optimizePromptCtrl
);

// PDF Export (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/export-session',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  exportSessionPDF
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 19: Query Telemetry Pipeline
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/telemetry',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id || 'default_user';
      const window = req.query.window || '24h';
      const scope = req.query.scope || 'user'; // 'user' or 'global'
      const analytics = telemetryCollector.getAnalytics(
        scope === 'global' ? null : userId,
        window
      );
      res.status(200).json(analytics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 20: Smart Query Router
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/query-routed',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  async (req, res) => {
    try {
      const { query, isFollowUp, previousEngine } = req.body;
      if (!query) {
        return res.status(400).json({ error: 'query is required' });
      }

      const userId = req.user?.userId || req.user?.id || 'default_user';

      // Route the query to the optimal engine (async metadata matching)
      const decision = await queryRouterService.route(query, {
        userId,
        isFollowUp: isFollowUp || false,
        previousEngine: previousEngine || null,
      });

      // Traverse semantic graph and expand query to related document networks
      const enrichedQuery = await graphRetrieverService.getGraphEnrichedQueryContext(query, userId);

      const startTime = Date.now();
      let answer = '';
      let success = true;
      let errorMsg = null;

      try {
        switch (decision.engine) {
          case 'vector':
            answer = await ragService.queryDocument(enrichedQuery, userId);
            break;
          case 'hybrid':
            answer = await ragService.queryDocumentHybrid(enrichedQuery, userId);
            break;
          case 'fullspectrum':
            answer = await ragService.queryDocumentFullSpectrum(enrichedQuery, userId);
            break;
          case 'selfcorrect':
            answer = await ragService.queryDocumentSelfCorrecting(enrichedQuery, userId);
            break;
          case 'cached':
            // Keep original query for semantic cache precision
            answer = await ragService.querySemanticallyCached(query, userId);
            break;
          case 'objectagent':
            answer = await ragService.queryDocumentObjectAgent(enrichedQuery, userId);
            break;
          case 'chat':
            answer = await ragService.queryDocumentChatEngine(enrichedQuery, userId);
            break;
          default:
            answer = await ragService.queryDocument(enrichedQuery, userId);
        }
      } catch (err) {
        success = false;
        errorMsg = err.message;
      }

      const latencyMs = Date.now() - startTime;

      // Learn from outcome: latency, success rate, and cache hit metrics
      queryRouterService.recordOutcome(decision.engine, decision.profile, {
        latencyMs,
        qualityScore: success ? 0.95 : 0.0,
        success,
        cacheHit: decision.engine === 'cached',
      });

      if (!success) {
        return res.status(500).json({
          success: false,
          error: errorMsg,
          routing: decision,
        });
      }

      res.status(200).json({
        success: true,
        routing: decision,
        answer,
        metrics: {
          latencyMs,
        },
        message: `Query successfully processed using "${decision.engine}" engine (${decision.profile} profile, confidence: ${decision.confidence})`,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.get(
  '/router-analytics',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  (req, res) => {
    try {
      const analytics = queryRouterService.getAnalytics();
      res.status(200).json({ success: true, data: analytics });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Document Semantic Metadata Enrichment routes
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/documents/:docId/metadata',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  async (req, res) => {
    try {
      const { docId } = req.params;
      const userId = req.user?.userId || req.user?.id || 'default_user';
      const metadata = await DocumentMetadata.findOne({ userId, docId });
      if (!metadata) {
        return res.status(404).json({ success: false, message: 'Metadata profile not found.' });
      }
      res.status(200).json({ success: true, metadata });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.post(
  '/documents/enrich-all',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id || 'default_user';
      const result = await metadataAgentService.enrichAllUserDocuments(userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Document Relationship Graph routes
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/documents/relationship-graph/build',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id || 'default_user';
      const result = await relationshipGraphService.buildRelationshipGraph(userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.post(
  '/documents/relationship-graph/traverse',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  async (req, res) => {
    try {
      const { startDocIds, depth } = req.body;
      if (!startDocIds || !Array.isArray(startDocIds)) {
        return res.status(400).json({ success: false, message: 'startDocIds must be an array of document IDs' });
      }
      const userId = req.user?.userId || req.user?.id || 'default_user';
      const result = await relationshipGraphService.traverseGraph(userId, startDocIds, depth || 1);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

export const llamaindexRoutes = router;
