import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { ExaResearchService } from './exaResearch.service.js';

const getAuthenticatedUserId = (req) => {
  const userId = req.user?.id || req.user?._id || req.user?.userId;

  if (!userId) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Authenticated user ID is missing from the access token'
    );
  }

  return userId;
};

const createSearchRecord = catchAsync(async (req, res) => {
  const result = await ExaResearchService.createSearchRecord(
    req.params.spaceId,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Webset created — search is running',
    data: result,
  });
});

const getAllSearchRecords = catchAsync(async (req, res) => {
  const result = await ExaResearchService.getAllSearchRecords(
    req.params.spaceId,
    getAuthenticatedUserId(req),
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Search sessions retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getSingleSearchRecord = catchAsync(async (req, res) => {
  const result = await ExaResearchService.getSingleSearchRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Search result retrieved successfully',
    data: result,
  });
});

// Manually refreshes a record from Exa — fallback path for when the webhook
// hasn't delivered yet (or isn't configured, e.g. local dev without a public URL).
const syncSearchRecord = catchAsync(async (req, res) => {
  const result = await ExaResearchService.syncSearchRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Search result synced successfully',
    data: result,
  });
});

const updateSearchRecord = catchAsync(async (req, res) => {
  const result = await ExaResearchService.updateSearchRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Search result updated successfully',
    data: result,
  });
});

const deleteSearchRecord = catchAsync(async (req, res) => {
  const result = await ExaResearchService.deleteSearchRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Search result deleted successfully',
    data: result,
  });
});

const answer = catchAsync(async (req, res) => {
  const { query, ...options } = req.body;
  if (!query) throw new ApiError(httpStatus.BAD_REQUEST, 'Query is required for answer');
  const result = await ExaResearchService.answer(query, options);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Answer retrieved successfully',
    data: result,
  });
});

const createBatch = catchAsync(async (req, res) => {
  const result = await ExaResearchService.createBatch(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Batch research job created.',
    data: result,
  });
});

const getBatch = catchAsync(async (req, res) => {
  const result = await ExaResearchService.getBatch(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Batch research job retrieved.',
    data: result,
  });
});

const getTeamUsage = catchAsync(async (req, res) => {
  const result = await ExaResearchService.getTeamUsage();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Team usage retrieved.',
    data: result,
  });
});

const listTeamApiKeys = catchAsync(async (req, res) => {
  const result = await ExaResearchService.listTeamApiKeys();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Team API keys retrieved.',
    data: result,
  });
});

// ── Batch: list, cancel, delete ──────────────────────────────────────────────

const listBatches = catchAsync(async (req, res) => {
  const result = await ExaResearchService.listBatches({
    cursor: req.query.cursor,
    limit: req.query.limit ? parseInt(req.query.limit) : undefined,
  });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Batches listed.', data: result });
});

const cancelBatch = catchAsync(async (req, res) => {
  const result = await ExaResearchService.cancelBatch(req.params.id);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Batch cancelled.', data: result });
});

const deleteBatch = catchAsync(async (req, res) => {
  const result = await ExaResearchService.deleteBatch(req.params.id);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Batch deleted.', data: result });
});

// ── Websets sub-resources ────────────────────────────────────────────────────

const createWebsetSearch = catchAsync(async (req, res) => {
  const result = await ExaResearchService.createWebsetSearch(req.params.websetId, req.body);
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'Webset search created.', data: result });
});
const getWebsetSearch = catchAsync(async (req, res) => {
  const result = await ExaResearchService.getWebsetSearch(req.params.websetId, req.params.searchId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Webset search retrieved.', data: result });
});
const cancelWebsetSearch = catchAsync(async (req, res) => {
  const result = await ExaResearchService.cancelWebsetSearch(req.params.websetId, req.params.searchId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Webset search cancelled.', data: result });
});

const createWebsetEnrichment = catchAsync(async (req, res) => {
  const result = await ExaResearchService.createWebsetEnrichment(req.params.websetId, req.body);
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'Enrichment created.', data: result });
});
const getWebsetEnrichment = catchAsync(async (req, res) => {
  const result = await ExaResearchService.getWebsetEnrichment(req.params.websetId, req.params.enrichmentId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Enrichment retrieved.', data: result });
});
const updateWebsetEnrichment = catchAsync(async (req, res) => {
  const result = await ExaResearchService.updateWebsetEnrichment(req.params.websetId, req.params.enrichmentId, req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Enrichment updated.', data: result });
});
const deleteWebsetEnrichment = catchAsync(async (req, res) => {
  const result = await ExaResearchService.deleteWebsetEnrichment(req.params.websetId, req.params.enrichmentId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Enrichment deleted.', data: result });
});
const cancelWebsetEnrichment = catchAsync(async (req, res) => {
  const result = await ExaResearchService.cancelWebsetEnrichment(req.params.websetId, req.params.enrichmentId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Enrichment cancelled.', data: result });
});

const createWebsetImport = catchAsync(async (req, res) => {
  const result = await ExaResearchService.createWebsetImport(req.params.websetId, req.body);
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'Import created.', data: result });
});
const getWebsetImport = catchAsync(async (req, res) => {
  const result = await ExaResearchService.getWebsetImport(req.params.websetId, req.params.importId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Import retrieved.', data: result });
});
const updateWebsetImport = catchAsync(async (req, res) => {
  const result = await ExaResearchService.updateWebsetImport(req.params.websetId, req.params.importId, req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Import updated.', data: result });
});
const deleteWebsetImport = catchAsync(async (req, res) => {
  const result = await ExaResearchService.deleteWebsetImport(req.params.websetId, req.params.importId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Import deleted.', data: result });
});
const listWebsetImports = catchAsync(async (req, res) => {
  const result = await ExaResearchService.listWebsetImports(req.params.websetId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Imports listed.', data: result });
});

const getWebsetItem = catchAsync(async (req, res) => {
  const result = await ExaResearchService.getWebsetItem(req.params.websetId, req.params.itemId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Item retrieved.', data: result });
});
const deleteWebsetItem = catchAsync(async (req, res) => {
  const result = await ExaResearchService.deleteWebsetItem(req.params.websetId, req.params.itemId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Item deleted.', data: result });
});
const listWebsetItems = catchAsync(async (req, res) => {
  const result = await ExaResearchService.listWebsetItems(req.params.websetId, {
    cursor: req.query.cursor,
    limit: req.query.limit ? parseInt(req.query.limit) : undefined,
  });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Items listed.', data: result });
});

const cancelWebset = catchAsync(async (req, res) => {
  const result = await ExaResearchService.cancelWebset(req.params.websetId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Webset cancelled.', data: result });
});
const previewWebset = catchAsync(async (req, res) => {
  const result = await ExaResearchService.previewWebset(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Webset preview generated.', data: result });
});
const listWebsets = catchAsync(async (req, res) => {
  const result = await ExaResearchService.listWebsets({
    cursor: req.query.cursor,
    limit: req.query.limit ? parseInt(req.query.limit) : undefined,
  });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Websets listed.', data: result });
});
const updateWebset = catchAsync(async (req, res) => {
  const result = await ExaResearchService.updateWebset(req.params.websetId, req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Webset updated.', data: result });
});
const deleteWebset = catchAsync(async (req, res) => {
  const result = await ExaResearchService.deleteWebset(req.params.websetId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Webset deleted.', data: result });
});

export const ResearchController = {
  createSearchRecord,
  getAllSearchRecords,
  getSingleSearchRecord,
  syncSearchRecord,
  updateSearchRecord,
  deleteSearchRecord,
  answer,
  createBatch,
  getBatch,
  listBatches,
  cancelBatch,
  deleteBatch,
  getTeamUsage,
  listTeamApiKeys,
  createWebsetSearch,
  getWebsetSearch,
  cancelWebsetSearch,
  createWebsetEnrichment,
  getWebsetEnrichment,
  updateWebsetEnrichment,
  deleteWebsetEnrichment,
  cancelWebsetEnrichment,
  createWebsetImport,
  getWebsetImport,
  updateWebsetImport,
  deleteWebsetImport,
  listWebsetImports,
  getWebsetItem,
  deleteWebsetItem,
  listWebsetItems,
  cancelWebset,
  previewWebset,
  listWebsets,
  updateWebset,
  deleteWebset,
};