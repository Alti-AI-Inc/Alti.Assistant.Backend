import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { RagService } from './rag.service.js';
import { EmbeddingService } from './embedding.service.js';
import { logger } from '../../../shared/logger.js';

// ── Collections ────────────────────────────────────────────────────────────

const createCollection = catchAsync(async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return sendResponse(res, { success: false, statusCode: httpStatus.BAD_REQUEST, message: 'name is required' });
  }
  const result = await RagService.createCollection({ name, description });
  sendResponse(res, { success: true, statusCode: httpStatus.CREATED, message: 'Collection created', data: result });
});

const listCollections = catchAsync(async (req, res) => {
  const result = await RagService.listCollections();
  sendResponse(res, { success: true, statusCode: httpStatus.OK, message: 'Collections retrieved', data: result });
});

const deleteCollection = catchAsync(async (req, res) => {
  const result = await RagService.deleteCollection(req.params.collectionId);
  sendResponse(res, { success: true, statusCode: httpStatus.OK, message: 'Collection deleted', data: result });
});

// ── Ingestion ──────────────────────────────────────────────────────────────

const ingestText = catchAsync(async (req, res) => {
  const { text, title, collectionId, chunkSize, chunkOverlap, metadata } = req.body;
  if (!text || !title) {
    return sendResponse(res, { success: false, statusCode: httpStatus.BAD_REQUEST, message: 'text and title are required' });
  }
  const result = await RagService.ingestText({ text, title, collectionId, chunkSize, chunkOverlap, metadata });
  sendResponse(res, { success: true, statusCode: httpStatus.CREATED, message: `Ingested ${result.chunkCount} chunks`, data: result });
});

const ingestUrl = catchAsync(async (req, res) => {
  const { url, collectionId, chunkSize } = req.body;
  if (!url) {
    return sendResponse(res, { success: false, statusCode: httpStatus.BAD_REQUEST, message: 'url is required' });
  }
  const result = await RagService.ingestUrl({ url, collectionId, chunkSize });
  sendResponse(res, { success: true, statusCode: httpStatus.CREATED, message: `Ingested from URL: ${result.chunkCount} chunks`, data: result });
});

const ingestFile = catchAsync(async (req, res) => {
  if (!req.file) {
    return sendResponse(res, { success: false, statusCode: httpStatus.BAD_REQUEST, message: 'File upload is required' });
  }
  const result = await RagService.ingestFile({
    filePath: req.file.path,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    collectionId: req.body.collectionId,
  });
  sendResponse(res, { success: true, statusCode: httpStatus.CREATED, message: `File ingested: ${result.chunkCount} chunks`, data: result });
});

// ── Retrieval & Query ──────────────────────────────────────────────────────

const retrieve = catchAsync(async (req, res) => {
  const { query, collectionId, topK, minScore, hybrid } = req.body;
  if (!query) {
    return sendResponse(res, { success: false, statusCode: httpStatus.BAD_REQUEST, message: 'query is required' });
  }
  const result = await RagService.retrieve({ query, collectionId, topK, minScore, hybrid });
  sendResponse(res, { success: true, statusCode: httpStatus.OK, message: `Retrieved ${result.count} chunks`, data: result });
});

const queryRag = catchAsync(async (req, res) => {
  const { query, collectionId, topK, hybrid, model, systemPrompt } = req.body;
  if (!query) {
    return sendResponse(res, { success: false, statusCode: httpStatus.BAD_REQUEST, message: 'query is required' });
  }
  const result = await RagService.query({ query, collectionId, topK, hybrid, model, systemPrompt });
  sendResponse(res, { success: true, statusCode: httpStatus.OK, message: 'RAG answer generated', data: result });
});

const queryStream = catchAsync(async (req, res) => {
  const { query, collectionId, topK, hybrid } = req.body;
  if (!query) {
    return sendResponse(res, { success: false, statusCode: httpStatus.BAD_REQUEST, message: 'query is required' });
  }

  const { sources, stream } = await RagService.queryStream({ query, collectionId, topK, hybrid });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send sources first
  res.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`);

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        res.write(`data: ${JSON.stringify({ type: 'content', content: delta })}\n\n`);
      }
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (err) {
    logger.error(`[RAG Stream] Error: ${err.message}`);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
  }
  res.end();
});

// ── Embeddings ─────────────────────────────────────────────────────────────

const embed = catchAsync(async (req, res) => {
  const { text, texts, model } = req.body;
  if (!text && !texts) {
    return sendResponse(res, { success: false, statusCode: httpStatus.BAD_REQUEST, message: 'text or texts is required' });
  }

  if (texts && Array.isArray(texts)) {
    const result = await EmbeddingService.embedBatch(texts, { model });
    return sendResponse(res, { success: true, statusCode: httpStatus.OK, message: `Embedded ${result.count} texts`, data: result });
  }

  const result = await EmbeddingService.embedText(text, { model });
  sendResponse(res, { success: true, statusCode: httpStatus.OK, message: 'Embedding generated', data: result });
});

const embeddingModels = catchAsync(async (req, res) => {
  const models = EmbeddingService.listModels();
  sendResponse(res, { success: true, statusCode: httpStatus.OK, message: 'Embedding models', data: models });
});

// ── Documents ──────────────────────────────────────────────────────────────

const listDocuments = catchAsync(async (req, res) => {
  const result = await RagService.listDocuments(req.params.collectionId);
  sendResponse(res, { success: true, statusCode: httpStatus.OK, message: 'Documents retrieved', data: result });
});

const getDocument = catchAsync(async (req, res) => {
  const result = await RagService.getDocument(req.params.documentId);
  if (!result) {
    return sendResponse(res, { success: false, statusCode: httpStatus.NOT_FOUND, message: 'Document not found' });
  }
  sendResponse(res, { success: true, statusCode: httpStatus.OK, message: 'Document retrieved', data: result });
});

const deleteDocument = catchAsync(async (req, res) => {
  const result = await RagService.deleteDocument(req.params.documentId);
  sendResponse(res, { success: true, statusCode: httpStatus.OK, message: 'Document deleted', data: result });
});

// ── Initialize ─────────────────────────────────────────────────────────────

const initialize = catchAsync(async (req, res) => {
  await RagService.initialize();
  sendResponse(res, { success: true, statusCode: httpStatus.OK, message: 'RAG vector store initialized' });
});

export const RagController = {
  createCollection,
  listCollections,
  deleteCollection,
  ingestText,
  ingestUrl,
  ingestFile,
  retrieve,
  queryRag,
  queryStream,
  embed,
  embeddingModels,
  listDocuments,
  getDocument,
  deleteDocument,
  initialize,
};

export default RagController;
