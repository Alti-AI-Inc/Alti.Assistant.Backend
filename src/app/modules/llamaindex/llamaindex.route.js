import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import auth from '../../middlewares/auth/auth.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
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
  corpusAnalytics,
  chatSummary,
  pipelineObservability,
  documentKeywords,
  uploadAndIndexDocument,
  exportSessionPDF,
  getDocuments,
  removeDocument,
  clearDocuments
} from './llamaindex.controller.js';

const router = express.Router();

const uploadDir = path.resolve('uploads/ragsystem');

// Ensure the folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${Date.now()}${ext}`);
  },
});
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

// PDF Export (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/export-session',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  exportSessionPDF
);

export const llamaindexRoutes = router;
