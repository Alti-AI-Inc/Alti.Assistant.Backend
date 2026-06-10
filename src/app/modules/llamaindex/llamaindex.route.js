import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
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
  optimizePromptCtrl,
  queryIngestionStatus
} from './llamaindex.controller.js';
import { telemetryCollector, withTelemetry } from './llamaindex.telemetry.js';
import { queryRouterService } from './llamaindex.queryRouter.js';
import { metadataAgentService } from './llamaindex.metadataAgent.js';
import DocumentMetadata from './llamaindex.metadata.model.js';
import { relationshipGraphService } from './llamaindex.relationshipGraph.js';
import DocumentRelationship from './llamaindex.relationship.model.js';
import { graphRetrieverService } from './llamaindex.graphRetriever.js';
import { contextPrunerService } from './llamaindex.contextPruner.js';
import { queryMemoryService } from './llamaindex.queryMemory.js';
import { executeAgenticRAG } from './langgraph/ragAgentGraph.js';
import mongoose from 'mongoose';
import { logger } from '../../../shared/logger.js';

/**
 * Disables buffering for Mongoose commands to ensure operations fail fast
 * in case of disconnected or offline MongoDB environments.
 * This prevents commands from being queued indefinitely.
 */
mongoose.set('bufferCommands', false);

/**
 * Express router for LlamaIndex related API routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * Directory path for storing uploaded RAG system documents.
 * @type {string}
 */
const uploadDir = path.resolve('uploads/ragsystem');

// Ensure the folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Google Cloud Storage (GCS) storage engine for Multer.
 * Configured to store files in the 'ragsystem/documents' folder within the GCS bucket.
 * @type {GCSStorageEngine}
 */
const storage = new GCSStorageEngine({ folder: 'ragsystem/documents' });

/**
 * Multer file filter function to restrict allowed file types for uploads.
 * @param {import('express').Request} req - The Express request object.
 * @param {Express.Multer.File} file - The file object being uploaded.
 * @param {function(Error | null, boolean): void} cb - The callback function to indicate if the file should be accepted.
 * @returns {void}
 */
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

/**
 * Multer instance configured for file uploads.
 * Uses GCSStorageEngine for storage, applies a file type filter,
 * and sets a maximum file size limit of 100 GB.
 * @type {multer.Multer}
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 * 1024, // 100 GB = 100 * 1024 * 1024 * 1024 bytes
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Document Indexing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/index-doc:
 *   post:
 *     summary: Upload and index a document.
 *     description: Uploads a single document file and initiates its indexing process into the RAG system.
 *                  Supports various text and document formats.
 *     tags:
 *       - Document Management
 *       - Indexing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: The document file to upload (e.g., PDF, TXT, MD, HTML, CSV, DOCX).
 *         required: true
 *     responses:
 *       200:
 *         description: Document uploaded and indexing initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document uploaded and indexing started."
 *                 docId:
 *                   type: string
 *                   example: "654321abcdef"
 *       400:
 *         description: Bad Request - No file provided or unsupported file type.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No file uploaded or unsupported file type."
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to upload or index the document.
 */
router.post(
  '/index-doc',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  upload.single('file'),
  uploadAndIndexDocument
);

/**
 * @swagger
 * /api/llamaindex/documents/ingest/status/{workflowId}:
 *   get:
 *     summary: Get real-time ingestion status.
 *     description: Retrieves the real-time tracking status of a durable Temporal ingestion workflow
 *                  for a specific document.
 *     tags:
 *       - Document Management
 *       - Indexing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the Temporal workflow for document ingestion.
 *     responses:
 *       200:
 *         description: Ingestion status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workflowId:
 *                   type: string
 *                   example: "my-ingestion-workflow-123"
 *                 status:
 *                   type: string
 *                   enum: [RUNNING, COMPLETED, FAILED, PENDING]
 *                   example: "RUNNING"
 *                 progress:
 *                   type: number
 *                   format: float
 *                   example: 0.75
 *                 message:
 *                   type: string
 *                   example: "Processing document chunks."
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       404:
 *         description: Not Found - Workflow ID does not exist.
 *       500:
 *         description: Internal Server Error - Failed to retrieve ingestion status.
 */
router.get(
  '/documents/ingest/status/:workflowId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIngestionStatus
);

// ─────────────────────────────────────────────────────────────────────────────
// Query Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/query:
 *   post:
 *     summary: Perform a standard RAG query.
 *     description: Submits a query to the RAG system and retrieves a relevant answer based on indexed documents.
 *                  This endpoint includes telemetry for monitoring query performance.
 *     tags:
 *       - Query
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string.
 *                 example: "What is the capital of France?"
 *     responses:
 *       200:
 *         description: Query processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "The capital of France is Paris."
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       docId:
 *                         type: string
 *                       pageNumber:
 *                         type: number
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to process the query.
 */
router.post(
  '/query',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  withTelemetry('query', queryIndex)
);

/**
 * @swagger
 * /api/llamaindex/query-stream:
 *   post:
 *     summary: Perform a streaming RAG query (SSE).
 *     description: Submits a query and receives the answer as a Server-Sent Event (SSE) stream,
 *                  allowing for real-time, token-by-token response generation.
 *                  This endpoint includes telemetry for monitoring query performance.
 *     tags:
 *       - Query
 *       - Streaming
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string.
 *                 example: "Explain the concept of quantum entanglement in simple terms."
 *     responses:
 *       200:
 *         description: SSE stream initiated for query response.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: "data: {\"token\": \"The\"}\n\ndata: {\"token\": \" capital\"}\n\n..."
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to initiate the streaming query.
 */
router.post(
  '/query-stream',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  withTelemetry('query-stream', queryIndexStream)
);

/**
 * @swagger
 * /api/llamaindex/query-advanced:
 *   post:
 *     summary: Perform an advanced RAG query with routing or subquestion engines.
 *     description: Submits a query that can be routed to different engines (e.g., router, subquestion, vector)
 *                  based on the specified mode or automatically.
 *     tags:
 *       - Query
 *       - Advanced
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string.
 *                 example: "What are the key differences between supervised and unsupervised learning, and provide examples of each?"
 *               mode:
 *                 type: string
 *                 enum: [auto, router, subquestion, vector]
 *                 description: The query processing mode.
 *                              'auto' lets the system decide, 'router' uses a query router,
 *                              'subquestion' breaks down complex queries, 'vector' uses direct vector search.
 *                 example: "subquestion"
 *     responses:
 *       200:
 *         description: Advanced query processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "Supervised learning uses labeled data to train models, like predicting house prices. Unsupervised learning finds patterns in unlabeled data, such as clustering customers."
 *                 engineUsed:
 *                   type: string
 *                   example: "subquestion"
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       docId:
 *                         type: string
 *                       pageNumber:
 *                         type: number
 *       400:
 *         description: Bad Request - Query parameter is missing or invalid mode.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to process the advanced query.
 */
router.post(
  '/query-advanced',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexAdvanced
);

// ─────────────────────────────────────────────────────────────────────────────
// Document Management (Phase 4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/documents:
 *   get:
 *     summary: Get a list of all indexed documents.
 *     description: Retrieves a list of all documents currently indexed in the RAG system for the authenticated user.
 *     tags:
 *       - Document Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of documents retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 documents:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       docId:
 *                         type: string
 *                         example: "654321abcdef"
 *                       filename:
 *                         type: string
 *                         example: "report.pdf"
 *                       uploadDate:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-10-27T10:00:00Z"
 *                       status:
 *                         type: string
 *                         example: "indexed"
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve documents.
 */
router.get(
  '/documents',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  getDocuments
);

/**
 * @swagger
 * /api/llamaindex/documents/{docId}:
 *   delete:
 *     summary: Remove a specific indexed document.
 *     description: Deletes a single document from the RAG system using its document ID.
 *     tags:
 *       - Document Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the document to remove.
 *     responses:
 *       200:
 *         description: Document removed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document removed successfully."
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       404:
 *         description: Not Found - Document with the specified ID does not exist.
 *       500:
 *         description: Internal Server Error - Failed to remove the document.
 */
router.delete(
  '/documents/:docId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  removeDocument
);

/**
 * @swagger
 * /api/llamaindex/documents:
 *   delete:
 *     summary: Clear all indexed documents for the user.
 *     description: Deletes all documents currently indexed in the RAG system for the authenticated user.
 *                  This action is irreversible.
 *     tags:
 *       - Document Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All documents cleared successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "All documents cleared successfully."
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to clear documents.
 */
router.delete(
  '/documents',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  clearDocuments
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6: Agent, Chat Engine, Analytics, and Chat Summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/query-agent:
 *   post:
 *     summary: Query using a ReAct Agent with tool calling.
 *     description: Submits a query to a ReAct Agent that can utilize various tools
 *                  (e.g., document search, calculator, datetime, text statistics) to answer complex questions.
 *     tags:
 *       - Query
 *       - Agent
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string for the agent.
 *                 example: "What is the current date and time, and how many words are in the document 'report.pdf'?"
 *     responses:
 *       200:
 *         description: Agent query processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "The current date and time is YYYY-MM-DD HH:MM:SS. The document 'report.pdf' contains X words."
 *                 agentSteps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tool:
 *                         type: string
 *                       input:
 *                         type: string
 *                       output:
 *                         type: string
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to process the agent query.
 */
router.post(
  '/query-agent',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexAgent
);

/**
 * @swagger
 * /api/llamaindex/query-chat:
 *   post:
 *     summary: Query using a CondenseQuestionChatEngine.
 *     description: Engages in a conversational chat using a CondenseQuestionChatEngine,
 *                  which can maintain chat history and summarize previous turns for context.
 *     tags:
 *       - Query
 *       - Chat
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's chat message.
 *                 example: "Tell me about the main features of the new product."
 *               chatHistory:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *                 description: Optional array of previous chat messages to provide context.
 *                 example:
 *                   - role: user
 *                     content: "Hi, what's up?"
 *                   - role: assistant
 *                     content: "I'm doing well, how can I help you today?"
 *     responses:
 *       200:
 *         description: Chat engine query processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "The new product features enhanced performance, a redesigned user interface, and improved security protocols."
 *                 chatHistory:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                       content:
 *                         type: string
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to process the chat query.
 */
router.post(
  '/query-chat',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexChatEngine
);

/**
 * @swagger
 * /api/llamaindex/analytics:
 *   get:
 *     summary: Get corpus analytics and insights.
 *     description: Retrieves an analytics dashboard providing insights into the indexed document corpus,
 *                  such as document count, average length, keyword distribution, etc.
 *     tags:
 *       - Analytics
 *       - Document Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Corpus analytics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalDocuments:
 *                   type: number
 *                   example: 150
 *                 totalChunks:
 *                   type: number
 *                   example: 1500
 *                 averageChunkSize:
 *                   type: number
 *                   example: 512
 *                 topKeywords:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["AI", "Machine Learning", "Data Science"]
 *                 documentTypes:
 *                   type: object
 *                   additionalProperties:
 *                     type: number
 *                   example:
 *                     pdf: 70
 *                     txt: 50
 *                     docx: 30
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve corpus analytics.
 */
router.get(
  '/analytics',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  corpusAnalytics
);

/**
 * @swagger
 * /api/llamaindex/chat-summary:
 *   get:
 *     summary: Get chat history summarization.
 *     description: Retrieves a summary of the user's chat history, providing a concise overview of past conversations.
 *     tags:
 *       - Chat
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chat summary retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: string
 *                   example: "User discussed product features, then inquired about pricing and delivery options. Key topics included performance, UI, and security."
 *                 lastActive:
 *                   type: string
 *                   format: date-time
 *                   example: "2023-10-27T11:30:00Z"
 *                 totalConversations:
 *                   type: number
 *                   example: 10
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve chat summary.
 */
router.get(
  '/chat-summary',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  chatSummary
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: Self-Correcting, Hybrid, Observability, Keywords
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/query-selfcorrect:
 *   post:
 *     summary: Perform a self-correcting query.
 *     description: Submits a query to a pipeline that automatically re-queries or refines its approach
 *                  if initial retrieval or generation yields low evaluation scores.
 *     tags:
 *       - Query
 *       - Advanced
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string.
 *                 example: "What are the environmental impacts of cryptocurrency mining?"
 *     responses:
 *       200:
 *         description: Self-correcting query processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "Cryptocurrency mining, particularly for Bitcoin, consumes significant amounts of electricity, often from fossil fuel sources, leading to high carbon emissions. It also generates considerable electronic waste due to specialized hardware."
 *                 iterations:
 *                   type: number
 *                   example: 2
 *                 finalScore:
 *                   type: number
 *                   format: float
 *                   example: 0.85
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to process the self-correcting query.
 */
router.post(
  '/query-selfcorrect',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexSelfCorrecting
);

/**
 * @swagger
 * /api/llamaindex/query-hybrid:
 *   post:
 *     summary: Perform a hybrid search query.
 *     description: Submits a query that utilizes a hybrid search approach, combining vector similarity search
 *                  with keyword-based search (e.g., via Reciprocal Rank Fusion) for improved retrieval relevance.
 *     tags:
 *       - Query
 *       - Advanced
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string.
 *                 example: "documents about renewable energy policies in Europe"
 *     responses:
 *       200:
 *         description: Hybrid search query processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "Several documents discuss renewable energy policies in Europe, focusing on directives like RED II, national targets, and funding mechanisms for solar, wind, and hydro power."
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       docId:
 *                         type: string
 *                       score:
 *                         type: number
 *                         format: float
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to process the hybrid query.
 */
router.post(
  '/query-hybrid',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexHybrid
);

/**
 * @swagger
 * /api/llamaindex/observability:
 *   get:
 *     summary: Get pipeline observability dashboard.
 *     description: Retrieves data for a pipeline observability dashboard, including CallbackManager event logs,
 *                  performance statistics, and component usage metrics.
 *     tags:
 *       - Analytics
 *       - Observability
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Observability data retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalQueries:
 *                   type: number
 *                   example: 1200
 *                 averageLatencyMs:
 *                   type: number
 *                   example: 350
 *                 errorRate:
 *                   type: number
 *                   format: float
 *                   example: 0.02
 *                 topEngines:
 *                   type: object
 *                   additionalProperties:
 *                     type: number
 *                   example:
 *                     vector: 600
 *                     agent: 300
 *                     hybrid: 200
 *                 recentEvents:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       eventType:
 *                         type: string
 *                       details:
 *                         type: string
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve observability data.
 */
router.get(
  '/observability',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  pipelineObservability
);

/**
 * @swagger
 * /api/llamaindex/keywords:
 *   get:
 *     summary: Extract document keywords.
 *     description: Retrieves keywords extracted from indexed documents using various techniques
 *                  like RAKE, simple tokenization, and LLM-based profiling.
 *     tags:
 *       - Document Management
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: docId
 *         schema:
 *           type: string
 *         description: Optional. The ID of a specific document to extract keywords from. If not provided,
 *                      may return overall corpus keywords or a sample.
 *     responses:
 *       200:
 *         description: Keywords extracted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 docId:
 *                   type: string
 *                   example: "654321abcdef"
 *                   nullable: true
 *                 keywords:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["renewable energy", "solar panels", "carbon footprint", "policy frameworks"]
 *                 method:
 *                   type: string
 *                   example: "RAKE+LLM"
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       404:
 *         description: Not Found - Document with the specified ID does not exist.
 *       500:
 *         description: Internal Server Error - Failed to extract keywords.
 */
router.get(
  '/keywords',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  documentKeywords
);
// ─────────────────────────────────────────────────────────────────────────────
// Phase 8: Full-Spectrum, ObjectAgent, SimpleChat, Compare, Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/query-fullspectrum:
 *   post:
 *     summary: Perform a full-spectrum retrieval query.
 *     description: Submits a query that leverages multiple retriever types (e.g., vector, keyword, knowledge graph)
 *                  combined with advanced fusion techniques like Reciprocal Rank Fusion (RRF) and Maximal Marginal Relevance (MMR)
 *                  for comprehensive and diverse results.
 *     tags:
 *       - Query
 *       - Advanced
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string.
 *                 example: "What are the latest advancements in AI ethics and their implications for policy?"
 *     responses:
 *       200:
 *         description: Full-spectrum query processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "Recent advancements in AI ethics focus on fairness, transparency, and accountability, leading to discussions on regulatory frameworks like the EU AI Act and the development of ethical AI guidelines by major tech companies."
 *                 retrievalStrategy:
 *                   type: string
 *                   example: "Full-Spectrum (RRF+MMR)"
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       docId:
 *                         type: string
 *                       score:
 *                         type: number
 *                         format: float
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to process the full-spectrum query.
 */
router.post(
  '/query-fullspectrum',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexFullSpectrum
);

/**
 * @swagger
 * /api/llamaindex/query-objectagent:
 *   post:
 *     summary: Query using an ObjectIndex agent.
 *     description: Submits a query to an ObjectIndex agent that can interact with structured data objects
 *                  (e.g., tables, graphs) using SimpleToolNodeMapping to retrieve specific information.
 *     tags:
 *       - Query
 *       - Agent
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string for the object agent.
 *                 example: "What is the revenue for Q3 2023 from the 'Sales Report' document?"
 *     responses:
 *       200:
 *         description: ObjectIndex agent query processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "The revenue for Q3 2023 from the Sales Report is $15 million."
 *                 toolUsed:
 *                   type: string
 *                   example: "TableQueryTool"
 *                 dataExtracted:
 *                   type: object
 *                   example:
 *                     quarter: "Q3 2023"
 *                     revenue: 15000000
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to process the object agent query.
 */
router.post(
  '/query-objectagent',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryIndexObjectAgent
);

/**
 * @swagger
 * /api/llamaindex/simple-chat:
 *   post:
 *     summary: Engage in a simple chat without an index.
 *     description: Provides a basic chat interface that does not require an underlying document index.
 *                  Useful for general conversational AI tasks.
 *     tags:
 *       - Chat
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's chat message.
 *                 example: "Tell me a fun fact about space."
 *     responses:
 *       200:
 *         description: Simple chat response generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: string
 *                   example: "Did you know that there are more stars in the universe than grains of sand on all the beaches on Earth?"
 *       400:
 *         description: Bad Request - Message parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to generate chat response.
 */
router.post(
  '/simple-chat',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  querySimpleChat
);

/**
 * @swagger
 * /api/llamaindex/compare-documents:
 *   post:
 *     summary: Compare two or more documents.
 *     description: Compares the content, themes, or key information across multiple indexed documents.
 *     tags:
 *       - Document Management
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - docIds
 *             properties:
 *               docIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 2
 *                 description: An array of at least two document IDs to compare.
 *                 example: ["doc123", "doc456"]
 *               comparisonType:
 *                 type: string
 *                 enum: [summary, key_differences, common_themes]
 *                 description: The type of comparison to perform.
 *                 example: "key_differences"
 *     responses:
 *       200:
 *         description: Document comparison performed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 comparisonResult:
 *                   type: string
 *                   example: "Document A focuses on market expansion strategies, while Document B details product development timelines. Both mention budget constraints but with different emphasis."
 *                 details:
 *                   type: object
 *                   additionalProperties: true
 *       400:
 *         description: Bad Request - Missing docIds or less than two docIds provided.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to compare documents.
 */
router.post(
  '/compare-documents',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  compareDocumentsCtrl
);

/**
 * @swagger
 * /api/llamaindex/export-corpus:
 *   get:
 *     summary: Export a snapshot of the document corpus.
 *     description: Exports a snapshot of the entire indexed document corpus, potentially including metadata
 *                  and document content (or links to content), in a specified format.
 *     tags:
 *       - Document Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, zip]
 *           default: json
 *         description: The desired export format for the corpus snapshot.
 *     responses:
 *       200:
 *         description: Corpus snapshot exported successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Corpus snapshot exported successfully."
 *                 downloadUrl:
 *                   type: string
 *                   format: url
 *                   example: "https://example.com/downloads/corpus_snapshot_20231027.json"
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to export the corpus snapshot.
 */
router.get(
  '/export-corpus',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  exportCorpusSnapshotCtrl
);
// ─────────────────────────────────────────────────────────────────────────────
// Phase 9: Classifier, ContextChat, Diagnostics, Health, Batch, Stream
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/query-classify:
 *   post:
 *     summary: Intelligent query classifier and router.
 *     description: Submits a query to an intelligent classifier that automatically routes it to the most
 *                  appropriate query engine (e.g., vector, agent, chat) based on query intent.
 *                  This endpoint includes telemetry for monitoring query performance.
 *     tags:
 *       - Query
 *       - Advanced
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string.
 *                 example: "Summarize the financial performance of the company in 2022 from the annual report."
 *     responses:
 *       200:
 *         description: Query classified and routed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "In 2022, the company reported a net profit of $X million, with revenue growth of Y% driven by Z."
 *                 routedToEngine:
 *                   type: string
 *                   example: "agent"
 *                 confidence:
 *                   type: number
 *                   format: float
 *                   example: 0.92
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to classify and route the query.
 */
router.post(
  '/query-classify',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  withTelemetry('query-classify', queryClassifyAndRoute)
);

/**
 * @swagger
 * /api/llamaindex/context-chat:
 *   post:
 *     summary: Perform a context-aware chat.
 *     description: Engages in a chat where the system maintains and utilizes conversational context
 *                  through a DefaultContextGenerator for more coherent and relevant responses.
 *                  This endpoint includes telemetry for monitoring query performance.
 *     tags:
 *       - Chat
 *       - Advanced
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's chat message.
 *                 example: "What are the benefits of using this new feature?"
 *               chatHistory:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *                 description: Optional array of previous chat messages to provide context.
 *     responses:
 *       200:
 *         description: Context-aware chat response generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: string
 *                   example: "The new feature offers improved efficiency, reduced operational costs, and enhanced user experience, as we discussed earlier regarding its integration capabilities."
 *                 contextUsed:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["previous message about integration", "document snippet on feature benefits"]
 *       400:
 *         description: Bad Request - Message parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to generate context-aware chat response.
 */
router.post(
  '/context-chat',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  withTelemetry('context-chat', queryContextAwareChat)
);

/**
 * @swagger
 * /api/llamaindex/diagnostics:
 *   get:
 *     summary: Get index diagnostics.
 *     description: Retrieves diagnostic information about the current state of the document index,
 *                  including node introspection and index structure details.
 *     tags:
 *       - Diagnostics
 *       - Indexing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Index diagnostics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 indexType:
 *                   type: string
 *                   example: "VectorStoreIndex"
 *                 totalNodes:
 *                   type: number
 *                   example: 5000
 *                 vectorStoreInfo:
 *                   type: object
 *                   properties:
 *                     provider:
 *                       type: string
 *                       example: "Pinecone"
 *                     dimension:
 *                       type: number
 *                       example: 1536
 *                 embeddingModel:
 *                   type: string
 *                   example: "text-embedding-ada-002"
 *                 healthStatus:
 *                   type: string
 *                   example: "healthy"
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve index diagnostics.
 */
router.get(
  '/diagnostics',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  indexDiagnostics
);

/**
 * @swagger
 * /api/llamaindex/health-check:
 *   get:
 *     summary: Perform a pipeline health check.
 *     description: Executes a 10-point self-test to verify the operational health of the entire RAG pipeline,
 *                  checking connectivity, component status, and basic functionality.
 *     tags:
 *       - Diagnostics
 *       - Observability
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pipeline health check completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "healthy"
 *                 checks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       passed:
 *                         type: boolean
 *                       message:
 *                         type: string
 *                   example:
 *                     - name: "Database Connection"
 *                       passed: true
 *                       message: "Connected to MongoDB."
 *                     - name: "LLM API Access"
 *                       passed: true
 *                       message: "OpenAI API reachable."
 *                     - name: "Vector Store Connectivity"
 *                       passed: true
 *                       message: "Pinecone index accessible."
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Health check failed or encountered an error.
 */
router.get(
  '/health-check',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  pipelineHealthCheck
);

/**
 * @swagger
 * /api/llamaindex/batch-process:
 *   post:
 *     summary: Initiate batch document processing.
 *     description: Submits a request to process multiple documents in a batch,
 *                  e.g., for re-indexing, metadata extraction, or other bulk operations.
 *     tags:
 *       - Document Management
 *       - Indexing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - docIds
 *               - operation
 *             properties:
 *               docIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of document IDs to process.
 *                 example: ["doc1", "doc2", "doc3"]
 *               operation:
 *                 type: string
 *                 enum: [reindex, extract_metadata, analyze_text]
 *                 description: The batch operation to perform on the documents.
 *                 example: "reindex"
 *     responses:
 *       200:
 *         description: Batch processing initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Batch processing for 3 documents initiated with operation 'reindex'."
 *                 batchId:
 *                   type: string
 *                   example: "batch_abc123"
 *       400:
 *         description: Bad Request - Missing docIds or invalid operation.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to initiate batch processing.
 */
router.post(
  '/batch-process',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  batchProcess
);

/**
 * @swagger
 * /api/llamaindex/query-enhanced-stream:
 *   post:
 *     summary: Perform an enhanced streaming query.
 *     description: Submits a query and receives an enhanced Server-Sent Event (SSE) stream,
 *                  potentially including intermediate steps, sources, and metadata alongside the token-by-token response.
 *     tags:
 *       - Query
 *       - Streaming
 *       - Advanced
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string.
 *                 example: "Explain the concept of zero-knowledge proofs and their applications."
 *     responses:
 *       200:
 *         description: Enhanced SSE stream initiated for query response.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: "data: {\"type\": \"token\", \"content\": \"Zero-knowledge\"}\n\ndata: {\"type\": \"source\", \"docId\": \"zkp_paper.pdf\"}\n\n..."
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to initiate the enhanced streaming query.
 */
router.post(
  '/query-enhanced-stream',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryEnhancedStream
);
// ─────────────────────────────────────────────────────────────────────────────
// Phase 10: Image Indexing, Introspection, Text Analysis, Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/index-image:
 *   post:
 *     summary: Index a multi-modal image document.
 *     description: Uploads an image document and indexes its content using multi-modal capabilities
 *                  (e.g., Gemini Vision) to extract text, objects, and concepts for retrieval.
 *     tags:
 *       - Document Management
 *       - Indexing
 *       - Multi-modal
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: formData
 *         name: image
 *         type: file
 *         description: The image file to upload (e.g., JPG, PNG).
 *         required: true
 *     responses:
 *       200:
 *         description: Image document uploaded and indexing initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Image document uploaded and indexing started."
 *                 docId:
 *                   type: string
 *                   example: "img_12345"
 *       400:
 *         description: Bad Request - No image provided or unsupported file type.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to upload or index the image document.
 */
router.post(
  '/index-image',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  upload.single('image'),
  indexImageDocumentCtrl
);

/**
 * @swagger
 * /api/llamaindex/introspection:
 *   get:
 *     summary: Get complete pipeline introspection.
 *     description: Retrieves a comprehensive introspection report of the entire RAG pipeline,
 *                  detailing all 184 classes, their configurations, and interconnections.
 *     tags:
 *       - Diagnostics
 *       - Observability
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pipeline introspection data retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pipelineVersion:
 *                   type: string
 *                   example: "1.0.0"
 *                 components:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       type:
 *                         type: string
 *                       config:
 *                         type: object
 *                       dependencies:
 *                         type: array
 *                         items:
 *                           type: string
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve introspection data.
 */
router.get(
  '/introspection',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  pipelineIntrospection
);

/**
 * @swagger
 * /api/llamaindex/text-analysis/{docId}:
 *   get:
 *     summary: Perform advanced text analysis on a document.
 *     description: Retrieves advanced text analysis results for a specific indexed document,
 *                  including readability scores, sentiment, entity recognition, and topic modeling.
 *     tags:
 *       - Document Management
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the document for which to perform text analysis.
 *     responses:
 *       200:
 *         description: Text analysis performed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 docId:
 *                   type: string
 *                   example: "654321abcdef"
 *                 readabilityScore:
 *                   type: number
 *                   format: float
 *                   example: 65.2
 *                 sentiment:
 *                   type: object
 *                   properties:
 *                     overall:
 *                       type: string
 *                       example: "neutral"
 *                     score:
 *                       type: number
 *                       format: float
 *                       example: 0.15
 *                 entities:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       text:
 *                         type: string
 *                       type:
 *                         type: string
 *                   example:
 *                     - text: "OpenAI"
 *                       type: "ORGANIZATION"
 *                     - text: "GPT-4"
 *                       type: "PRODUCT"
 *                 topics:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Artificial Intelligence", "Natural Language Processing"]
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       404:
 *         description: Not Found - Document with the specified ID does not exist.
 *       500:
 *         description: Internal Server Error - Failed to perform text analysis.
 */
router.get(
  '/text-analysis/:docId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  textAnalysis
);

/**
 * @swagger
 * /api/llamaindex/validate:
 *   get:
 *     summary: Validate pipeline configuration.
 *     description: Executes a 12-point check to validate the current pipeline configuration,
 *                  ensuring all components are correctly set up and compatible.
 *     tags:
 *       - Diagnostics
 *       - Configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pipeline configuration validation completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "valid"
 *                 checks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       passed:
 *                         type: boolean
 *                       message:
 *                         type: string
 *                   example:
 *                     - name: "LLM Provider Config"
 *                       passed: true
 *                       message: "OpenAI API key present and valid."
 *                     - name: "Embedding Model Match"
 *                       passed: true
 *                       message: "Embedding model compatible with vector store."
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Configuration validation failed or encountered an error.
 */
router.get(
  '/validate',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validatePipeline
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Configuration, Prompts, Schema Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/config:
 *   get:
 *     summary: Get full configuration registry.
 *     description: Retrieves the complete configuration registry, including all 18 constants and 11 enums
 *                  used across the LlamaIndex backend.
 *     tags:
 *       - Configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration registry retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 constants:
 *                   type: object
 *                   example:
 *                     DEFAULT_CHUNK_SIZE: 1024
 *                     MAX_RETRIEVAL_NODES: 5
 *                 enums:
 *                   type: object
 *                   example:
 *                     USER_ROLE: ["USER", "ADMIN"]
 *                     QUERY_MODE: ["auto", "vector", "agent"]
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve configuration registry.
 */
router.get(
  '/config',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  configRegistry
);

/**
 * @swagger
 * /api/llamaindex/prompts:
 *   get:
 *     summary: Get prompt library.
 *     description: Retrieves the library of all 22 built-in prompts used by the LlamaIndex system,
 *                  including their templates and descriptions.
 *     tags:
 *       - Configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Prompt library retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 prompts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "DEFAULT_TEXT_QA_PROMPT"
 *                       template:
 *                         type: string
 *                         example: "Context information is below.\n---------------------\n{context_str}\n---------------------\nGiven the context information and not prior knowledge, answer the query.\nQuery: {query_str}\nAnswer: "
 *                       description:
 *                         type: string
 *                         example: "Standard prompt for question answering with provided context."
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve prompt library.
 */
router.get(
  '/prompts',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  promptLibrary
);

/**
 * @swagger
 * /api/llamaindex/validate-schema:
 *   post:
 *     summary: Validate data against Zod schemas.
 *     description: Validates incoming data against one of the 7 predefined Zod schemas used in the system,
 *                  ensuring data integrity and correctness.
 *     tags:
 *       - Configuration
 *       - Validation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - schemaName
 *               - data
 *             properties:
 *               schemaName:
 *                 type: string
 *                 description: The name of the Zod schema to validate against.
 *                 example: "DocumentUploadSchema"
 *               data:
 *                 type: object
 *                 description: The data object to be validated.
 *                 example:
 *                   filename: "test.pdf"
 *                   size: 1024
 *                   mimetype: "application/pdf"
 *     responses:
 *       200:
 *         description: Data validated successfully against the schema.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Data is valid."
 *                 validatedData:
 *                   type: object
 *                   description: The validated and parsed data.
 *       400:
 *         description: Bad Request - Invalid schema name or data failed validation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Validation failed: 'filename' is required."
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to perform schema validation.
 */
router.post(
  '/validate-schema',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  schemaValidation
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12: Semantic Cache, Adaptive Chunking, Doc Graph, Benchmark
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/query-cached:
 *   post:
 *     summary: Perform a semantic query with caching.
 *     description: Submits a query that first attempts to retrieve an answer from a semantic cache
 *                  (similarity-based deduplication) before falling back to full RAG if no cache hit.
 *                  This endpoint includes telemetry for monitoring query performance.
 *     tags:
 *       - Query
 *       - Performance
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string.
 *                 example: "What are the benefits of cloud computing?"
 *     responses:
 *       200:
 *         description: Cached query processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "Cloud computing offers scalability, cost savings, increased flexibility, and enhanced collaboration."
 *                 cacheHit:
 *                   type: boolean
 *                   example: true
 *                 source:
 *                   type: string
 *                   example: "cache"
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to process the cached query.
 */
router.post(
  '/query-cached',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  withTelemetry('query-cached', semanticCacheQuery)
);

/**
 * @swagger
 * /api/llamaindex/chunking-strategy:
 *   get:
 *     summary: Get adaptive chunking strategy recommendation.
 *     description: Retrieves recommendations for optimal document chunking strategies based on corpus characteristics,
 *                  query patterns, and retrieval performance.
 *     tags:
 *       - Configuration
 *       - Optimization
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Adaptive chunking strategy recommended successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recommendedStrategy:
 *                   type: string
 *                   example: "SentenceWindowRetriever"
 *                 chunkSize:
 *                   type: number
 *                   example: 256
 *                 overlap:
 *                   type: number
 *                   example: 20
 *                 reasoning:
 *                   type: string
 *                   example: "Corpus contains many short, factual sentences, benefiting from precise sentence-level retrieval."
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to recommend chunking strategy.
 */
router.get(
  '/chunking-strategy',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  adaptiveChunking
);

/**
 * @swagger
 * /api/llamaindex/document-graph:
 *   get:
 *     summary: Get document relationship graph.
 *     description: Retrieves a representation of the document relationship graph, showing semantic connections
 *                  and dependencies between indexed documents.
 *     tags:
 *       - Document Management
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Document graph retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nodes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       label:
 *                         type: string
 *                       type:
 *                         type: string
 *                 edges:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       source:
 *                         type: string
 *                       target:
 *                         type: string
 *                       relationship:
 *                         type: string
 *                       weight:
 *                         type: number
 *                         format: float
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve document graph.
 */
router.get(
  '/document-graph',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  documentGraph
);

/**
 * @swagger
 * /api/llamaindex/benchmark-retrieval:
 *   post:
 *     summary: Run a multi-strategy retrieval benchmark.
 *     description: Executes a benchmark test comparing the performance of various retrieval strategies
 *                  (e.g., vector, hybrid, keyword) against a set of evaluation queries and ground truth.
 *     tags:
 *       - Diagnostics
 *       - Performance
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - evaluationSetId
 *             properties:
 *               evaluationSetId:
 *                 type: string
 *                 description: The ID of the evaluation dataset to use for benchmarking.
 *                 example: "qa_eval_set_1"
 *               strategies:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [vector, hybrid, fullspectrum, agent]
 *                 description: Optional. Specific retrieval strategies to benchmark. If not provided, all available strategies will be tested.
 *                 example: ["vector", "hybrid"]
 *     responses:
 *       200:
 *         description: Retrieval benchmark completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 benchmarkId:
 *                   type: string
 *                   example: "benchmark_run_20231027"
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       strategy:
 *                         type: string
 *                       precision:
 *                         type: number
 *                         format: float
 *                       recall:
 *                         type: number
 *                         format: float
 *                       f1Score:
 *                         type: number
 *                         format: float
 *                       latencyMs:
 *                         type: number
 *                       metrics:
 *                         type: object
 *       400:
 *         description: Bad Request - Missing evaluationSetId or invalid strategies.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to run retrieval benchmark.
 */
router.post(
  '/benchmark-retrieval',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  retrievalBenchmark
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 13: Decomposition, Extraction, Re-Ranking, Feedback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/query-decompose:
 *   post:
 *     summary: Perform a SubQuestion decomposition query.
 *     description: Submits a complex query that is automatically decomposed into smaller,
 *                  manageable sub-questions, each answered independently, and then synthesized into a final response.
 *     tags:
 *       - Query
 *       - Advanced
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The complex user query.
 *                 example: "What were the main causes of World War II, and how did it impact global politics and technology?"
 *     responses:
 *       200:
 *         description: Query decomposed and answered successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "World War II was primarily caused by the rise of fascism, economic instability, and unresolved issues from WWI. It profoundly impacted global politics by establishing the UN and Cold War, and accelerated technological advancements like radar and nuclear power."
 *                 subQuestions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       question:
 *                         type: string
 *                       answer:
 *                         type: string
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to decompose or answer the query.
 */
router.post(
  '/query-decompose',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryDecomposition
);

/**
 * @swagger
 * /api/llamaindex/extract-metadata:
 *   post:
 *     summary: Run a metadata extraction pipeline.
 *     description: Initiates a pipeline to extract structured metadata (e.g., author, date, topics, entities)
 *                  from a specified document or set of documents.
 *     tags:
 *       - Document Management
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - docId
 *             properties:
 *               docId:
 *                 type: string
 *                 description: The ID of the document from which to extract metadata.
 *                 example: "report_2023.pdf"
 *               fields:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional. Specific metadata fields to extract. If not provided, all available fields will be extracted.
 *                 example: ["author", "publication_date", "keywords"]
 *     responses:
 *       200:
 *         description: Metadata extraction initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Metadata extraction for document 'report_2023.pdf' initiated."
 *                 extractedMetadata:
 *                   type: object
 *                   example:
 *                     author: "John Doe"
 *                     publication_date: "2023-01-15"
 *                     keywords: ["annual report", "financials", "strategy"]
 *       400:
 *         description: Bad Request - Missing docId.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       404:
 *         description: Not Found - Document with the specified ID does not exist.
 *       500:
 *         description: Internal Server Error - Failed to extract metadata.
 */
router.post(
  '/extract-metadata',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  metadataExtraction
);

/**
 * @swagger
 * /api/llamaindex/query-rerank:
 *   post:
 *     summary: Perform a custom multi-signal re-ranking query.
 *     description: Submits a query and applies a custom re-ranking strategy to retrieval results,
 *                  considering multiple signals like semantic similarity, keyword match, freshness, and user feedback.
 *     tags:
 *       - Query
 *       - Advanced
 *       - Optimization
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string.
 *                 example: "Recent news about AI in healthcare."
 *               topK:
 *                 type: number
 *                 description: The number of top results to retrieve before re-ranking.
 *                 default: 10
 *               rerankAlgorithm:
 *                 type: string
 *                 enum: [cohere, cross_encoder, custom]
 *                 description: The re-ranking algorithm to use.
 *                 default: "cohere"
 *     responses:
 *       200:
 *         description: Query processed with re-ranking successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "Recent developments in AI healthcare include advancements in diagnostic tools, personalized treatment plans, and drug discovery, with a focus on ethical deployment and data privacy."
 *                 rerankedSources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       docId:
 *                         type: string
 *                       score:
 *                         type: number
 *                         format: float
 *                       rank:
 *                         type: number
 *       400:
 *         description: Bad Request - Query parameter is missing or invalid rerankAlgorithm.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to process the re-ranking query.
 */
router.post(
  '/query-rerank',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryReranking
);

/**
 * @swagger
 * /api/llamaindex/feedback:
 *   post:
 *     summary: Submit query feedback.
 *     description: Allows users to submit feedback on a query's response, including a rating and relevance score,
 *                  to help improve the RAG system's performance.
 *     tags:
 *       - Feedback
 *       - Analytics
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - queryId
 *               - rating
 *               - relevance
 *             properties:
 *               queryId:
 *                 type: string
 *                 description: The ID of the query for which feedback is being submitted.
 *                 example: "query_abc123"
 *               rating:
 *                 type: number
 *                 format: int32
 *                 minimum: 1
 *                 maximum: 5
 *                 description: A rating for the response (1-5 stars).
 *                 example: 4
 *               relevance:
 *                 type: number
 *                 format: float
 *                 minimum: 0
 *                 maximum: 1
 *                 description: A relevance score for the response (0.0-1.0).
 *                 example: 0.8
 *               comment:
 *                 type: string
 *                 description: Optional. Additional comments about the response.
 *                 example: "The answer was mostly accurate but missed one key detail."
 *     responses:
 *       200:
 *         description: Feedback submitted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Feedback submitted for query_abc123."
 *       400:
 *         description: Bad Request - Missing required fields or invalid values.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to submit feedback.
 */
router.post(
  '/feedback',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  submitFeedback
);

/**
 * @swagger
 * /api/llamaindex/feedback-analytics:
 *   get:
 *     summary: Get feedback analytics and optimization recommendations.
 *     description: Retrieves analytics based on user feedback, providing insights into query performance,
 *                  common issues, and recommendations for pipeline optimization.
 *     tags:
 *       - Feedback
 *       - Analytics
 *       - Optimization
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Feedback analytics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 averageRating:
 *                   type: number
 *                   format: float
 *                   example: 4.2
 *                 averageRelevance:
 *                   type: number
 *                   format: float
 *                   example: 0.85
 *                 totalFeedbackCount:
 *                   type: number
 *                   example: 150
 *                 topIssues:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       issue:
 *                         type: string
 *                       count:
 *                         type: number
 *                   example:
 *                     - issue: "Lack of specific details"
 *                       count: 25
 *                     - issue: "Outdated information"
 *                       count: 10
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Improve document freshness pipeline.", "Enhance sub-question decomposition for complex queries."]
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve feedback analytics.
 */
router.get(
  '/feedback-analytics',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  feedbackAnalytics
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 14: Automated Evaluation Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/evaluate-response:
 *   post:
 *     summary: Evaluate a RAG response automatically.
 *     description: Submits a query, its generated response, and optionally ground truth for automated evaluation
 *                  using metrics like faithfulness, answer relevance, and context relevance.
 *     tags:
 *       - Evaluation
 *       - Diagnostics
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *               - response
 *             properties:
 *               query:
 *                 type: string
 *                 description: The original query string.
 *                 example: "What is the capital of Canada?"
 *               response:
 *                 type: string
 *                 description: The generated response from the RAG system.
 *                 example: "The capital of Canada is Ottawa."
 *               groundTruth:
 *                 type: string
 *                 description: Optional. The expected correct answer for comparison.
 *                 example: "Ottawa"
 *               context:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional. The context (source chunks) used to generate the response.
 *                 example: ["Ottawa is the capital city of Canada.", "Canada is a North American country."]
 *     responses:
 *       200:
 *         description: Response evaluated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 evaluationId:
 *                   type: string
 *                   example: "eval_run_789"
 *                 metrics:
 *                   type: object
 *                   properties:
 *                     faithfulness:
 *                       type: number
 *                       format: float
 *                       example: 0.95
 *                     answerRelevance:
 *                       type: number
 *                       format: float
 *                       example: 0.98
 *                     contextRelevance:
 *                       type: number
 *                       format: float
 *                       example: 0.90
 *                     overallScore:
 *                       type: number
 *                       format: float
 *                       example: 0.94
 *       400:
 *         description: Bad Request - Missing required fields.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to evaluate the response.
 */
router.post(
  '/evaluate-response',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  evaluateResponseCtrl
);

/**
 * @swagger
 * /api/llamaindex/evaluation-history:
 *   get:
 *     summary: Get automated evaluation history.
 *     description: Retrieves a history of past automated evaluation runs, including metrics and details
 *                  for each evaluated query-response pair.
 *     tags:
 *       - Evaluation
 *       - Diagnostics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           format: int32
 *           default: 10
 *         description: The maximum number of evaluation records to retrieve.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: number
 *           format: int32
 *           default: 0
 *         description: The number of records to skip for pagination.
 *     responses:
 *       200:
 *         description: Evaluation history retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                   example: 50
 *                 history:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       evaluationId:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       query:
 *                         type: string
 *                       response:
 *                         type: string
 *                       metrics:
 *                         type: object
 *                         properties:
 *                           overallScore:
 *                             type: number
 *                             format: float
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve evaluation history.
 */
router.get(
  '/evaluation-history',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  evaluationHistoryCtrl
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 15: Event-Driven Live Sessions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/live-session/stream:
 *   post:
 *     summary: Initiate a live session stream.
 *     description: Starts an event-driven live session, allowing for real-time interaction and updates,
 *                  potentially using Server-Sent Events (SSE) or WebSockets.
 *     tags:
 *       - Live Session
 *       - Streaming
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: Optional. A unique ID for the session. If not provided, one will be generated.
 *                 example: "live_session_xyz"
 *               initialMessage:
 *                 type: string
 *                 description: Optional. An initial message to start the session.
 *                 example: "Hello, start a new session."
 *     responses:
 *       200:
 *         description: Live session stream initiated.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: "data: {\"event\": \"session_start\", \"sessionId\": \"live_session_xyz\"}\n\ndata: {\"event\": \"message\", \"content\": \"Welcome!\"}\n\n..."
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to initiate live session stream.
 */
router.post(
  '/live-session/stream',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  liveSessionStreamCtrl
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16: Advanced Storage Strategies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/index-doc-advanced:
 *   post:
 *     summary: Upload and index a document with advanced storage strategies.
 *     description: Uploads a document and indexes it using advanced storage strategies,
 *                  potentially involving different vector stores, knowledge graphs, or hierarchical indexing.
 *     tags:
 *       - Document Management
 *       - Indexing
 *       - Advanced
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: The document file to upload.
 *         required: true
 *       - in: formData
 *         name: strategy
 *         type: string
 *         enum: [vector, graph, hybrid]
 *         description: The advanced indexing strategy to use.
 *         default: vector
 *     responses:
 *       200:
 *         description: Document uploaded and advanced indexing initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document uploaded and advanced indexing started with 'graph' strategy."
 *                 docId:
 *                   type: string
 *                   example: "adv_doc_789"
 *       400:
 *         description: Bad Request - No file provided or unsupported file type/strategy.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to upload or index the document with advanced strategy.
 */
router.post(
  '/index-doc-advanced',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  upload.single('file'),
  indexDocAdvancedCtrl
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 17: Multi-Step Agent Workflows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/query-agent-workflow:
 *   post:
 *     summary: Execute a multi-step agent workflow query.
 *     description: Submits a query that triggers a complex, multi-step agent workflow,
 *                  involving sequential or parallel execution of various tools and sub-agents to achieve a goal.
 *     tags:
 *       - Query
 *       - Agent
 *       - Advanced
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string that initiates the agent workflow.
 *                 example: "Research the market trends for electric vehicles in Europe, summarize key findings, and identify top manufacturers."
 *               workflowConfig:
 *                 type: object
 *                 description: Optional. Configuration for the specific agent workflow to execute.
 *                 example:
 *                   steps: ["research", "summarize", "identify_manufacturers"]
 *                   tools: ["web_search", "document_analyzer"]
 *     responses:
 *       200:
 *         description: Agent workflow query processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   example: "The European EV market is rapidly growing, driven by regulatory support and consumer demand. Key trends include increased battery range and charging infrastructure. Top manufacturers include Volkswagen, Tesla, and Stellantis."
 *                 workflowStepsExecuted:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       step:
 *                         type: string
 *                       status:
 *                         type: string
 *                       output:
 *                         type: string
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to execute the agent workflow query.
 */
router.post(
  '/query-agent-workflow',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  queryAgentWorkflowCtrl
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 18: Prompt Optimization API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/optimize-prompt:
 *   post:
 *     summary: Optimize a given prompt.
 *     description: Submits a prompt for optimization, where the system suggests improvements
 *                  for clarity, effectiveness, and token efficiency based on best practices and LLM feedback.
 *     tags:
 *       - Configuration
 *       - Optimization
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The prompt string to be optimized.
 *                 example: "Give me info on AI."
 *               targetTask:
 *                 type: string
 *                 description: Optional. The specific task the prompt is intended for (e.g., "summarization", "Q&A").
 *                 example: "Q&A"
 *     responses:
 *       200:
 *         description: Prompt optimized successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 optimizedPrompt:
 *                   type: string
 *                   example: "Provide a concise summary of the key concepts and recent advancements in Artificial Intelligence, focusing on its applications in [specific domain, if applicable]."
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Add context for the AI topic.", "Specify desired output format.", "Consider adding constraints."]
 *                 scoreImprovement:
 *                   type: number
 *                   format: float
 *                   example: 0.25
 *       400:
 *         description: Bad Request - Prompt parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to optimize the prompt.
 */
router.post(
  '/optimize-prompt',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  optimizePromptCtrl
);

// PDF Export (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/export-session:
 *   get:
 *     summary: Export current session as a PDF.
 *     description: Generates and exports the current user session's chat history and relevant query results
 *                  into a downloadable PDF document.
 *     tags:
 *       - Chat
 *       - Document Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         schema:
 *           type: string
 *         description: Optional. The ID of the session to export. If not provided, the current active session will be used.
 *     responses:
 *       200:
 *         description: Session exported as PDF successfully.
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       404:
 *         description: Not Found - Session not found or no content to export.
 *       500:
 *         description: Internal Server Error - Failed to generate or export PDF.
 */
router.get(
  '/export-session',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  exportSessionPDF
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 19: Query Telemetry Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/telemetry:
 *   get:
 *     summary: Retrieve query telemetry analytics.
 *     description: Fetches analytics data related to query performance and usage,
 *                  scoped by user or globally, and within a specified time window.
 *     tags:
 *       - Analytics
 *       - Observability
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: window
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d, all]
 *           default: 24h
 *         description: The time window for which to retrieve analytics (e.g., 1 hour, 24 hours, 7 days).
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *           enum: [user, global]
 *           default: user
 *         description: The scope of the analytics (user-specific or global across all users).
 *     responses:
 *       200:
 *         description: Telemetry analytics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalQueries:
 *                   type: number
 *                   example: 500
 *                 averageLatencyMs:
 *                   type: number
 *                   example: 420
 *                 errorRate:
 *                   type: number
 *                   format: float
 *                   example: 0.01
 *                 topQueries:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["What is AI?", "Explain RAG."]
 *                 engineUsage:
 *                   type: object
 *                   additionalProperties:
 *                     type: number
 *                   example:
 *                     vector: 300
 *                     agent: 150
 *                     hybrid: 50
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve telemetry data.
 */
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

/**
 * @swagger
 * /api/llamaindex/query-routed:
 *   post:
 *     summary: Perform a query using the Smart Query Router.
 *     description: Submits a query to an intelligent router that dynamically selects the optimal RAG engine
 *                  (e.g., vector, hybrid, agentic graph) based on query characteristics, historical performance,
 *                  semantic graph traversal, and cross-session memory.
 *     tags:
 *       - Query
 *       - Advanced
 *       - Router
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's query string.
 *                 example: "What are the latest regulations on data privacy in the EU, and how do they affect cloud service providers?"
 *               isFollowUp:
 *                 type: boolean
 *                 description: Indicates if this is a follow-up query in a conversation.
 *                 default: false
 *               previousEngine:
 *                 type: string
 *                 description: The engine used for the previous query, if applicable.
 *                 example: "chat"
 *               useAgenticGraph:
 *                 type: boolean
 *                 description: If true, forces the query through the stateful self-correcting LangGraph agent loop.
 *                              If false, bypasses LangGraph and uses the legacy engine determined by the router.
 *                 default: true
 *     responses:
 *       200:
 *         description: Query successfully processed by the smart router.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 routing:
 *                   type: object
 *                   properties:
 *                     engine:
 *                       type: string
 *                       example: "agentic_graph"
 *                     profile:
 *                       type: string
 *                       example: "complex_multi_hop"
 *                     confidence:
 *                       type: number
 *                       format: float
 *                       example: 0.98
 *                 answer:
 *                   type: string
 *                   example: "The GDPR is the primary EU data privacy regulation, significantly impacting cloud providers by mandating strict data protection, consent requirements, and cross-border data transfer rules. Non-compliance can lead to substantial fines."
 *                 metrics:
 *                   type: object
 *                   properties:
 *                     latencyMs:
 *                       type: number
 *                       example: 1250
 *                 message:
 *                   type: string
 *                   example: "Query successfully processed using \"agentic_graph\" engine (complex_multi_hop profile, confidence: 0.98)"
 *       400:
 *         description: Bad Request - Query parameter is missing.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to process the routed query.
 */
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

      // Traverse semantic graph, prune non-coherent links (<0.25) and rerank relevant document networks
      let graphEnrichedQuery = query;
      try {
        graphEnrichedQuery = await contextPrunerService.pruneAndRerank(query, userId);
      } catch (prunerErr) {
        logger.warn(`[Router API] Semantic graph pruning bypassed: ${prunerErr.message}`);
      }

      // Inject cross-session memory context for persistent conversational recall
      let enrichedQuery = graphEnrichedQuery;
      try {
        enrichedQuery = await queryMemoryService.buildMemoryEnrichedQuery(userId, graphEnrichedQuery);
      } catch (memoryErr) {
        logger.warn(`[Router API] Cross-session memory lookup bypassed: ${memoryErr.message}`);
      }

      const startTime = Date.now();
      let answer = '';
      let success = true;
      let errorMsg = null;

      try {
        const useAgenticGraph = req.body.useAgenticGraph !== false;
        if (useAgenticGraph) {
          logger.info(`[Router API] Directing query through the stateful self-correcting LangGraph agent loop.`);
          answer = await executeAgenticRAG(enrichedQuery, userId);
        } else {
          logger.info(`[Router API] Bypassing LangGraph loop. Running legacy "${decision.engine}" engine.`);
          // NOTE: ragService is not imported, assuming it's available globally or via context.
          // This part of the code is kept as-is per instructions.
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

      // Persist this successful Q&A pair into cross-session memory
      if (success && answer) {
        const answerText = typeof answer === 'string' ? answer : JSON.stringify(answer);
        queryMemoryService.recordQuery(userId, query, answerText, decision.engine, decision.confidence);
      }

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

/**
 * @swagger
 * /api/llamaindex/router-analytics:
 *   get:
 *     summary: Get Smart Query Router analytics.
 *     description: Retrieves analytics and performance metrics for the Smart Query Router,
 *                  including routing decisions, engine performance, and optimization insights.
 *     tags:
 *       - Analytics
 *       - Router
 *       - Observability
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Router analytics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRoutes:
 *                       type: number
 *                       example: 1000
 *                     engineDistribution:
 *                       type: object
 *                       additionalProperties:
 *                         type: number
 *                       example:
 *                         vector: 400
 *                         hybrid: 300
 *                         agentic_graph: 200
 *                         cached: 100
 *                     averageLatencyByEngine:
 *                       type: object
 *                       additionalProperties:
 *                         type: number
 *                       example:
 *                         vector: 250
 *                         hybrid: 350
 *                         agentic_graph: 1200
 *                     topProfiles:
 *                       type: object
 *                       additionalProperties:
 *                         type: number
 *                       example:
 *                         simple_factual: 500
 *                         complex_multi_hop: 300
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to retrieve router analytics.
 */
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

/**
 * @swagger
 * /api/llamaindex/documents/{docId}/metadata:
 *   get:
 *     summary: Get semantic metadata for a specific document.
 *     description: Retrieves the semantic metadata profile for a given document ID,
 *                  which includes extracted entities, topics, and other structured information.
 *     tags:
 *       - Document Management
 *       - Metadata
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the document to retrieve metadata for.
 *     responses:
 *       200:
 *         description: Document metadata retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     docId:
 *                       type: string
 *                       example: "654321abcdef"
 *                     userId:
 *                       type: string
 *                       example: "user123"
 *                     title:
 *                       type: string
 *                       example: "Annual Financial Report 2023"
 *                     entities:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Company X", "CEO Jane Doe", "Market Trends"]
 *                     topics:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Finance", "Investment", "Business Strategy"]
 *                     summary:
 *                       type: string
 *                       example: "A concise summary of the document's content."
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       404:
 *         description: Not Found - Metadata profile for the document not found.
 *       500:
 *         description: Internal Server Error - Failed to retrieve document metadata.
 */
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

/**
 * @swagger
 * /api/llamaindex/documents/enrich-all:
 *   post:
 *     summary: Enrich all user documents with semantic metadata.
 *     description: Initiates a batch process to extract and enrich semantic metadata for all documents
 *                  belonging to the authenticated user.
 *     tags:
 *       - Document Management
 *       - Metadata
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Metadata enrichment process initiated successfully for all user documents.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Metadata enrichment initiated for all 50 user documents."
 *                 documentsProcessed:
 *                   type: number
 *                   example: 50
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to initiate metadata enrichment.
 */
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

/**
 * @swagger
 * /api/llamaindex/documents/relationship-graph/build:
 *   post:
 *     summary: Build the document relationship graph.
 *     description: Initiates the process to build or update the semantic relationship graph
 *                  between all documents belonging to the authenticated user.
 *     tags:
 *       - Document Management
 *       - Graph
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Document relationship graph building initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Relationship graph building initiated for user documents."
 *                 nodesProcessed:
 *                   type: number
 *                   example: 150
 *                 edgesCreated:
 *                   type: number
 *                   example: 300
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to build the relationship graph.
 */
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

/**
 * @swagger
 * /api/llamaindex/documents/relationship-graph/traverse:
 *   post:
 *     summary: Traverse the document relationship graph.
 *     description: Traverses the semantic relationship graph starting from specified documents
 *                  to discover related documents up to a certain depth.
 *     tags:
 *       - Document Management
 *       - Graph
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDocIds
 *             properties:
 *               startDocIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of document IDs to start the graph traversal from.
 *                 example: ["docA", "docB"]
 *               depth:
 *                 type: number
 *                 format: int32
 *                 minimum: 1
 *                 default: 1
 *                 description: The maximum depth to traverse the graph.
 *     responses:
 *       200:
 *         description: Graph traversal completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 traversedNodes:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["docA", "docB", "docC", "docD"]
 *                 relationshipsFound:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       source:
 *                         type: string
 *                       target:
 *                         type: string
 *                       relationship:
 *                         type: string
 *                       weight:
 *                         type: number
 *                         format: float
 *       400:
 *         description: Bad Request - Missing or invalid startDocIds.
 *       401:
 *         description: Unauthorized - User not authenticated.
 *       403:
 *         description: Forbidden - User does not have the required role (USER or ADMIN).
 *       500:
 *         description: Internal Server Error - Failed to traverse the relationship graph.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Session Query Memory routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/llamaindex/query-memory/summary:
 *   get:
 *     summary: Get a high-level summary of stored cross-session memory.
 *     description: Retrieves a summary of the user's persistent conversational memory,
 *                  including total entries, last access, and key topics discussed across sessions.
 *     tags:
 *       - Memory
 *       - Chat
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Memory summary retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalEntries:
 *                   type: number
 *                   example: 120
 *                 lastUpdated:
 *                   type: string
 *                   format: date-time
 *                   example: "2023-10-27T14:00:00Z"
 *                 keyTopics:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["product features", "technical support", "billing inquiries"]
 *       500:
 *         description: Internal Server Error - Failed to retrieve memory summary.
 */
router.get(
  '/query-memory/summary',
  optionalAuth(),
  async (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id || 'default_user';
      const summary = await queryMemoryService.getMemorySummary(userId);
      res.status(200).json(summary);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/llamaindex/query-memory/relevant:
 *   post:
 *     summary: Get top-N historically relevant prior Q&A pairs.
 *     description: Retrieves a list of the most historically relevant query-answer pairs from
 *                  the user's cross-session memory based on a new query, useful for contextualizing new conversations.
 *     tags:
 *       - Memory
 *       - Chat
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The current query for which to find relevant historical context.
 *                 example: "What did we discuss about the project timeline last week?"
 *               limit:
 *                 type: number
 *                 format: int32
 *                 default: 5
 *                 description: The maximum number of relevant history entries to return.
 *     responses:
 *       200:
 *         description: Relevant history retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: number
 *                   example: 3
 *                 history:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       query:
 *                         type: string
 *                       answer:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       relevanceScore:
 *                         type: number
 *                         format: float
 *       400:
 *         description: Bad Request - Query parameter is required.
 *       500:
 *         description: Internal Server Error - Failed to retrieve relevant history.
 */
router.post(
  '/query-memory/relevant',
  optionalAuth(),
  async (req, res) => {
    try {
      const { query, limit } = req.body;
      if (!query) return res.status(400).json({ success: false, message: 'query is required' });
      const userId = req.user?.userId || req.user?.id || 'default_user';
      const history = await queryMemoryService.getRelevantHistory(userId, query, limit || 5, 0.15);
      res.status(200).json({ success: true, count: history.length, history });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * Exports the Express router for LlamaIndex routes.
 * @type {express.Router}
 */
export const llamaindexRoutes = router;