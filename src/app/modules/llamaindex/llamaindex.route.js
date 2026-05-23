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
  queryIndex
);

// Phase 4: SSE Streaming Query
router.post(
  '/query-stream',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexStream
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
  queryClassifyAndRoute
);

// Context-aware chat (DefaultContextGenerator)
router.post(
  '/context-chat',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryContextAwareChat
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
  semanticCacheQuery
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

export const llamaindexRoutes = router;
