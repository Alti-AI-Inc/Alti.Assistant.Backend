import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { knowledgeService } from './knowledge.service.js';
import { knowledgeQueryService } from './services/knowledgeQuery.js';
import { OWNER_TYPES } from './knowledge.constant.js';

/**
 * Upload file to knowledge system
 */
export const uploadFile = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { ownerType, folderId, description, tags, processImmediately, ownerId } = // Destructure ownerId from req.body
    req.body;
  // BUG FIX: Removed problematic line. The ownerId for 'bot' ownerType should come from req.body,
  // not be reassigned from userId.
  // const ownerId = userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!req.file) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'No file provided',
    });
  }

  if (!ownerType || !Object.values(OWNER_TYPES).includes(ownerType)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Invalid ownerType. Must be 'user' or 'bot'`,
    });
  }

  // BUG FIX: IDOR Vulnerability.
  // The original logic `ownerId || (ownerType === OWNER_TYPES.USER ? userId : null)`
  // allowed a user to specify an arbitrary ownerId from req.body when ownerType was 'user',
  // leading to an IDOR vulnerability where a user could upload files to another user's knowledge base.
  // For 'user' ownerType, the owner must always be the authenticated user.
  // For 'bot' ownerType, the ownerId must be provided in the request body and
  // the service layer is responsible for validating that the bot belongs to the authenticated user.
  let finalOwnerId;
  if (ownerType === OWNER_TYPES.USER) {
    finalOwnerId = userId; // For 'user' ownerType, the owner is always the authenticated user.
  } else if (ownerType === OWNER_TYPES.BOT) {
    finalOwnerId = ownerId; // For 'bot' ownerType, ownerId must be provided in the request.
  }

  if (!finalOwnerId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Owner ID is required for the specified ownerType',
    });
  }

  try {
    logger.info(
      `[Knowledge] File upload by user: ${userId}, ownerType: ${ownerType}, ownerId: ${finalOwnerId}`
    );

    const options = {
      description: description || '',
      tags: tags ? JSON.parse(tags) : [], // Assuming tags is a JSON string, catchAsync handles parse errors.
      folderId: folderId || null,
      uploadSource: 'web',
      ipAddress: req.ip,
    };

    const result = await knowledgeService.uploadFile(
      req.file,
      ownerType,
      finalOwnerId,
      options,
      req
    );

    // Process file immediately if requested (synchronously)
    if (processImmediately === 'true') {
      logger.info(`[Knowledge] Processing file immediately: ${result.fileId}`);
      const processResult = await knowledgeService.processFile(
        result.fileId,
        req
      );

      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File uploaded and processed successfully',
        data: {
          ...result,
          processing: processResult,
        },
      });
    } else {
      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message:
          'File uploaded successfully. Process manually or set processImmediately=true',
        data: result,
      });
    }
  } catch (error) {
    logger.error('[Knowledge] File upload error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while uploading the file',
    });
  }
});

/**
 * Process file with RAG
 */
export const processFile = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { fileId } = req.params;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!fileId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'File ID is required',
    });
  }

  try {
    // The knowledgeService.processFile is expected to perform ownership validation
    // to ensure the fileId belongs to the userId.
    const result = await knowledgeService.processFile(fileId, req);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'File processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('[Knowledge] File processing error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while processing the file',
    });
  }
});

/**
 * Get files
 */
export const getFiles = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const {
    ownerType,
    ownerId, // Destructure ownerId from req.query
    fileType,
    processingStatus,
    isProcessed,
    folderId,
    limit,
    skip,
  } = req.query;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!ownerType || !Object.values(OWNER_TYPES).includes(ownerType)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Invalid ownerType. Must be 'user' or 'bot'`,
    });
  }

  // BUG FIX: IDOR Vulnerability.
  // Similar to uploadFile, this prevents a user from querying files belonging to another user.
  let finalOwnerId;
  if (ownerType === OWNER_TYPES.USER) {
    finalOwnerId = userId; // For 'user' ownerType, the owner is always the authenticated user.
  } else if (ownerType === OWNER_TYPES.BOT) {
    finalOwnerId = ownerId; // For 'bot' ownerType, ownerId must be provided in the request.
  }

  if (!finalOwnerId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Owner ID is required for the specified ownerType',
    });
  }

  try {
    const filters = {
      fileType,
      processingStatus,
      isProcessed:
        isProcessed === 'true'
          ? true
          : isProcessed === 'false'
            ? false
            : undefined,
      folderId: folderId === 'null' ? null : folderId,
      limit: parseInt(limit) || 100,
      skip: parseInt(skip) || 0,
    };

    // BUG FIX: Pagination/Performance.
    // The original code used `files.length` for `totalCount`, which is incorrect for paginated results.
    // Assuming knowledgeService.getFiles returns an object with { files: [], totalCount: number }
    // for proper pagination, instead of just an array.
    const { files, totalCount } = await knowledgeService.getFiles(
      ownerType,
      finalOwnerId,
      filters,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Files retrieved successfully',
      data: {
        files,
        totalCount, // Use totalCount from service for accurate pagination
        filters: {
          ownerType,
          ownerId: finalOwnerId,
          fileType,
          processingStatus,
          isProcessed,
        },
      },
    });
  } catch (error) {
    logger.error('[Knowledge] Get files error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving files',
    });
  }
});

/**
 * Get file by ID
 */
export const getFileById = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { fileId } = req.params;
  const { ownerType, ownerId } = req.query; // Destructure ownerId from req.query

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!fileId || !ownerType) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'File ID and ownerType are required',
    });
  }

  // BUG FIX: IDOR Vulnerability.
  // Similar to uploadFile, this prevents a user from retrieving files belonging to another user.
  let finalOwnerId;
  if (ownerType === OWNER_TYPES.USER) {
    finalOwnerId = userId; // For 'user' ownerType, the owner is always the authenticated user.
  } else if (ownerType === OWNER_TYPES.BOT) {
    finalOwnerId = ownerId; // For 'bot' ownerType, ownerId must be provided in the request.
  }

  if (!finalOwnerId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Owner ID is required for the specified ownerType',
    });
  }

  try {
    // The knowledgeService.getFileById is expected to perform ownership validation
    // using finalOwnerId to ensure the file belongs to the authenticated user or their bot.
    const file = await knowledgeService.getFileById(
      fileId,
      ownerType,
      finalOwnerId,
      req
    );

    if (!file) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'File not found',
      });
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'File retrieved successfully',
      data: file,
    });
  } catch (error) {
    logger.error('[Knowledge] Get file error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving the file',
    });
  }
});

/**
 * Delete file
 */
export const deleteFile = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { fileId } = req.params;
  const { ownerType, ownerId } = req.body; // Destructure ownerId from req.body

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!fileId || !ownerType) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'File ID and ownerType are required',
    });
  }

  // BUG FIX: IDOR Vulnerability.
  // Similar to uploadFile, this prevents a user from deleting files belonging to another user.
  let finalOwnerId;
  if (ownerType === OWNER_TYPES.USER) {
    finalOwnerId = userId; // For 'user' ownerType, the owner is always the authenticated user.
  } else if (ownerType === OWNER_TYPES.BOT) {
    finalOwnerId = ownerId; // For 'bot' ownerType, ownerId must be provided in the request.
  }

  if (!finalOwnerId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Owner ID is required for the specified ownerType',
    });
  }

  try {
    // The knowledgeService.deleteFile is expected to perform ownership validation
    // using finalOwnerId to ensure the file belongs to the authenticated user or their bot.
    const result = await knowledgeService.deleteFile(
      fileId,
      ownerType,
      finalOwnerId,
      req
    );

    if (!result) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'File not found',
      });
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    logger.error('[Knowledge] Delete file error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while deleting the file',
    });
  }
});

/**
 * Get storage statistics
 */
export const getStorageStats = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { ownerType, ownerId } = req.query; // Destructure ownerId from req.query

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!ownerType) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'ownerType is required',
    });
  }

  // BUG FIX: IDOR Vulnerability.
  // Similar to uploadFile, this prevents a user from getting stats for another user's knowledge base.
  let finalOwnerId;
  if (ownerType === OWNER_TYPES.USER) {
    finalOwnerId = userId; // For 'user' ownerType, the owner is always the authenticated user.
  } else if (ownerType === OWNER_TYPES.BOT) {
    finalOwnerId = ownerId; // For 'bot' ownerType, ownerId must be provided in the request.
  }

  if (!finalOwnerId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Owner ID is required for the specified ownerType',
    });
  }

  try {
    // The knowledgeService.getStorageStats is expected to perform ownership validation
    // using finalOwnerId to ensure the stats are for the authenticated user or their bot.
    const stats = await knowledgeService.getStorageStats(
      ownerType,
      finalOwnerId,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Storage statistics retrieved successfully',
      data: stats,
    });
  } catch (error) {
    logger.error('[Knowledge] Get storage stats error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving storage statistics',
    });
  }
});

// ==================== FOLDER CONTROLLERS ====================

/**
 * Create folder
 */
export const createFolder = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    // The knowledgeService.createFolder is expected to associate the folder with the userId.
    const result = await knowledgeService.createFolder(userId, req.body, req);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Folder created successfully',
      data: result,
    });
  } catch (error) {
    logger.error('[Knowledge] Create folder error:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while creating the folder',
    });
  }
});

/**
 * Get folders
 */
export const getFolders = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { parentFolderId } = req.query;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const options = {};
    if (parentFolderId !== undefined) {
      options.parentFolderId =
        parentFolderId === 'root' || parentFolderId === 'null'
          ? null
          : parentFolderId;
    }

    // BUG FIX: Pagination/Performance.
    // The original code used `folders.length` for `totalCount`, which is incorrect for paginated results.
    // Assuming knowledgeService.getFolders returns an object with { folders: [], totalCount: number }
    // for proper pagination, instead of just an array.
    const { folders, totalCount } = await knowledgeService.getFolders(
      userId,
      options,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Folders retrieved successfully',
      data: {
        folders,
        totalCount, // Use totalCount from service for accurate pagination
      },
    });
  } catch (error) {
    logger.error('[Knowledge] Get folders error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving folders',
    });
  }
});

/**
 * Get folder by ID
 */
export const getFolderById = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { folderId } = req.params;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!folderId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Folder ID is required',
    });
  }

  try {
    // The knowledgeService.getFolderById is expected to perform ownership validation
    // to ensure the folder belongs to the userId.
    const folder = await knowledgeService.getFolderById(folderId, userId, req);

    if (!folder) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Folder not found',
      });
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Folder retrieved successfully',
      data: folder,
    });
  } catch (error) {
    logger.error('[Knowledge] Get folder error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving the folder',
    });
  }
});

/**
 * Update folder
 */
export const updateFolder = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { folderId } = req.params;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!folderId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Folder ID is required',
    });
  }

  try {
    // The knowledgeService.updateFolder is expected to perform ownership validation
    // to ensure the folder belongs to the userId.
    const result = await knowledgeService.updateFolder(
      folderId,
      userId,
      req.body,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Folder updated successfully',
      data: result,
    });
  } catch (error) {
    logger.error('[Knowledge] Update folder error:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while updating the folder',
    });
  }
});

/**
 * Delete folder
 */
export const deleteFolder = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { folderId } = req.params;
  const { recursive } = req.body;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!folderId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Folder ID is required',
    });
  }

  try {
    // The knowledgeService.deleteFolder is expected to perform ownership validation
    // to ensure the folder belongs to the userId.
    const result = await knowledgeService.deleteFolder(
      folderId,
      userId,
      recursive === 'true' || recursive === true,
      req
    );

    if (!result) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Folder not found',
      });
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Folder deleted successfully',
    });
  } catch (error) {
    logger.error('[Knowledge] Delete folder error:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while deleting the folder',
    });
  }
});

/**
 * Get folder contents
 */
export const getFolderContents = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { folderId } = req.params;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const finalFolderId =
      folderId === 'root' || folderId === 'null' ? null : folderId;
    // The knowledgeService.getFolderContents is expected to perform ownership validation
    // to ensure the folder belongs to the userId.
    const contents = await knowledgeService.getFolderContents(
      finalFolderId,
      userId,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Folder contents retrieved successfully',
      data: contents,
    });
  } catch (error) {
    logger.error('[Knowledge] Get folder contents error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving folder contents',
    });
  }
});

// ==================== QUERY & CONVERSATIONAL CONTROLLERS ====================

/**
 * Conversational query - Ask questions about your knowledge
 */
export const conversationalQuery = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { message, conversationId, ownerType, topK, ownerId } = req.body; // Destructure ownerId from req.body
  // BUG FIX: Removed redundant and incorrect ownerId assignment.
  // The ownerId for 'bot' ownerType should come from req.body, not be reassigned from userId.
  // const ownerId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
    });
  }

  if (!ownerType || !Object.values(OWNER_TYPES).includes(ownerType)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Invalid ownerType. Must be 'user' or 'bot'`,
    });
  }

  // BUG FIX: IDOR Vulnerability.
  // Similar to uploadFile, this prevents a user from querying another user's knowledge base.
  let finalOwnerId;
  if (ownerType === OWNER_TYPES.USER) {
    finalOwnerId = userId; // For 'user' ownerType, the owner is always the authenticated user.
  } else if (ownerType === OWNER_TYPES.BOT) {
    finalOwnerId = ownerId; // For 'bot' ownerType, ownerId must be provided in the request.
  }

  if (!finalOwnerId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Owner ID is required for the specified ownerType',
    });
  }

  try {
    // The knowledgeQueryService.conversationalQuery is expected to perform ownership validation
    // using finalOwnerId to ensure the query is against the authenticated user's knowledge or their bot's.
    const result = await knowledgeQueryService.conversationalQuery(
      userId,
      ownerType,
      finalOwnerId,
      message,
      conversationId,
      { topK }
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Query processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('[Knowledge] Conversational query error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while processing your query',
    });
  }
});

/**
 * Direct query - One-off question without conversation
 */
export const queryKnowledge = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { query, ownerType, ownerId, topK } = req.body; // Destructure ownerId from req.body

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!query) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Query is required',
    });
  }

  if (!ownerType || !Object.values(OWNER_TYPES).includes(ownerType)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Invalid ownerType. Must be 'user' or 'bot'`,
    });
  }

  // BUG FIX: IDOR Vulnerability.
  // Similar to uploadFile, this prevents a user from querying another user's knowledge base.
  let finalOwnerId;
  if (ownerType === OWNER_TYPES.USER) {
    finalOwnerId = userId; // For 'user' ownerType, the owner is always the authenticated user.
  } else if (ownerType === OWNER_TYPES.BOT) {
    finalOwnerId = ownerId; // For 'bot' ownerType, ownerId must be provided in the request.
  }

  if (!finalOwnerId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Owner ID is required for the specified ownerType',
    });
  }

  try {
    // The knowledgeQueryService.queryKnowledge is expected to perform ownership validation
    // using finalOwnerId to ensure the query is against the authenticated user's knowledge or their bot's.
    const result = await knowledgeQueryService.queryKnowledge(
      query,
      ownerType,
      finalOwnerId,
      {
        topK,
      }
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Query processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('[Knowledge] Query error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while processing your query',
    });
  }
});

/**
 * Semantic search - Find relevant documents
 */
export const semanticSearch = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { query, ownerType, ownerId, limit } = req.body; // Destructure ownerId from req.body

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!query) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Query is required',
    });
  }

  if (!ownerType || !Object.values(OWNER_TYPES).includes(ownerType)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Invalid ownerType. Must be 'user' or 'bot'`,
    });
  }

  // BUG FIX: IDOR Vulnerability.
  // Similar to uploadFile, this prevents a user from searching another user's knowledge base.
  let finalOwnerId;
  if (ownerType === OWNER_TYPES.USER) {
    finalOwnerId = userId; // For 'user' ownerType, the owner is always the authenticated user.
  } else if (ownerType === OWNER_TYPES.BOT) {
    finalOwnerId = ownerId; // For 'bot' ownerType, ownerId must be provided in the request.
  }

  if (!finalOwnerId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Owner ID is required for the specified ownerType',
    });
  }

  try {
    // The knowledgeQueryService.semanticSearch is expected to perform ownership validation
    // using finalOwnerId to ensure the search is against the authenticated user's knowledge or their bot's.
    const result = await knowledgeQueryService.semanticSearch(
      query,
      ownerType,
      finalOwnerId,
      {
        limit,
      }
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Search completed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('[Knowledge] Semantic search error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while searching',
    });
  }
});

/**
 * Get conversation history
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required',
    });
  }

  try {
    // The knowledgeQueryService.getConversationHistory is expected to perform ownership validation
    // to ensure the conversation belongs to the userId.
    const result = await knowledgeQueryService.getConversationHistory(
      conversationId,
      userId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation history retrieved successfully',
      data: result,
    });
  } catch (error) {
    logger.error('[Knowledge] Get conversation history error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving conversation history',
    });
  }
});

export const knowledgeController = {
  uploadFile,
  processFile,
  getFiles,
  getFileById,
  deleteFile,
  getStorageStats,
  createFolder,
  getFolders,
  getFolderById,
  updateFolder,
  deleteFolder,
  getFolderContents,
  conversationalQuery,
  queryKnowledge,
  semanticSearch,
  getConversationHistory,
};