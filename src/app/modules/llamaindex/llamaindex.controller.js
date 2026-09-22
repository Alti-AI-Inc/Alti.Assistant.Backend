import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { LlamaIndexService } from '../../services/llamaindex.service.js';

/**
 * POST /api/v1/llamaindex/collections/:collectionId/documents
 * Ingest a document into a collection.
 */
const ingestDocument = catchAsync(async (req, res) => {
  const { collectionId } = req.params;
  const { content, metadata, type } = req.body;

  if (!content) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Document content is required',
    });
  }

  const result = await LlamaIndexService.ingestDocument(collectionId, {
    content,
    metadata: metadata || {},
    type: type || 'text',
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Document ingested',
    data: result,
  });
});

/**
 * POST /api/v1/llamaindex/collections/:collectionId/query
 * Query a collection using RAG.
 */
const queryCollection = catchAsync(async (req, res) => {
  const { collectionId } = req.params;
  const { query, topK } = req.body;

  if (!query) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Query is required',
    });
  }

  const result = await LlamaIndexService.query(collectionId, query, {
    topK: topK || 5,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Query completed',
    data: result,
  });
});

/**
 * GET /api/v1/llamaindex/collections/:collectionId/documents
 * List documents in a collection.
 */
const listDocuments = catchAsync(async (req, res) => {
  const { collectionId } = req.params;

  const result = await LlamaIndexService.listDocuments(collectionId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Documents retrieved',
    data: result,
  });
});

/**
 * DELETE /api/v1/llamaindex/collections/:collectionId/documents/:documentId
 * Delete a document from a collection.
 */
const deleteDocument = catchAsync(async (req, res) => {
  const { collectionId, documentId } = req.params;

  const result = await LlamaIndexService.deleteDocument(collectionId, documentId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result ? 'Document deleted' : 'Document not found',
    data: { deleted: result },
  });
});

/**
 * GET /api/v1/llamaindex/collections/:collectionId/stats
 * Get collection statistics.
 */
const getCollectionStats = catchAsync(async (req, res) => {
  const { collectionId } = req.params;

  const result = await LlamaIndexService.getCollectionStats(collectionId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Collection stats',
    data: result,
  });
});

export const LlamaIndexController = {
  ingestDocument,
  queryCollection,
  listDocuments,
  deleteDocument,
  getCollectionStats,
};

export default LlamaIndexController;
