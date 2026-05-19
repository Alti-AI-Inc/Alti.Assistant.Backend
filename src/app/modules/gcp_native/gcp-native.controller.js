import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import ApiError from '../../../errors/ApiError.js';
import { GcpNativeService } from './gcp-native.service.js';
import { GcpDocumentAiService } from './gcp-document-ai.service.js';
import { GcpVertexGroundingService } from './gcp-vertex-grounding.service.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';

const searchCatalog = catchAsync(async (req, res) => {
  const { query, license, language, sortBy, limit, page } = req.query;

  const result = await GcpNativeService.searchGcpCatalog(query, {
    license,
    language,
    sortBy,
    limit,
    page
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'GCP Repository Catalog queried successfully.',
    data: result
  });
});

const importSubmodule = catchAsync(async (req, res) => {
  const { repoName } = req.body;

  const result = await GcpNativeService.importGcpSubmodule(repoName);

  sendResponse(res, {
    statusCode: result.success ? httpStatus.OK : httpStatus.BAD_REQUEST,
    success: result.success,
    message: result.message,
    data: result
  });
});

/**
 * Handles Google Search Grounded Chat generation requests.
 */
const groundedChat = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } = await validatePromptRequest(req);

  const result = await GcpVertexGroundingService.groundedPromptResponse(
    sessionId,
    prompt,
    userId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Grounded response generated successfully.',
    data: result,
  });
});

/**
 * Handles Document AI file ingestion requests.
 */
const processDocumentFile = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please upload a document file to process.');
  }

  const { processorId, location } = req.body;
  const fileBuffer = req.file.buffer;
  const mimeType = req.file.mimetype;

  const result = await GcpDocumentAiService.processDocument(
    fileBuffer,
    mimeType,
    processorId,
    location
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Document processed successfully via GCP Document AI.',
    data: result,
  });
});

export const GcpNativeController = {
  searchCatalog,
  importSubmodule,
  groundedChat,
  processDocumentFile
};
