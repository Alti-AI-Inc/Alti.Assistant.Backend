import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { knowledgeBankService } from './knowledge_bank.service.js';

/**
 * Upload file to knowledge bank
 */
const uploadFile = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!req.files || req.files.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'No file provided',
    });
  }

  // Get the first uploaded file
  const uploadedFile = req.files[0];

  try {
    logger.info(`[KnowledgeBank] File upload by user: ${userId}, file: ${uploadedFile.originalname}`);

    // Extract optional metadata from request body
    const options = {
      description: req.body.description,
      tags: req.body.tags ? JSON.parse(req.body.tags) : [],
      folderId: req.body.folderId || null,
      uploadSource: req.body.uploadSource || 'web',
      ipAddress: req.ip,
      metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {},
    };

    // Upload file
    const result = await knowledgeBankService.uploadFile(uploadedFile, userId, options, req);

    // Optionally trigger processing in background (async)
    if (req.body.processImmediately === 'true') {
      // Process file asynchronously without waiting
      knowledgeBankService.processUploadedFile(result.fileId, req)
        .then(() => logger.info(`[KnowledgeBank] File processed: ${result.fileId}`))
        .catch(err => logger.error(`[KnowledgeBank] Error processing file: ${result.fileId}`, err));
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'File uploaded successfully',
      data: result,
    });
  } catch (error) {
    logger.error('[KnowledgeBank] File upload error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while uploading the file',
    });
  }
});

/**
 * Get user's files from knowledge bank
 */
const getUserFiles = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    // Extract filters from query params
    const filters = {
      fileType: req.query.fileType,
      processingStatus: req.query.processingStatus,
      isProcessed: req.query.isProcessed === 'true' ? true : req.query.isProcessed === 'false' ? false : undefined,
      folderId: req.query.folderId === 'null' ? null : req.query.folderId,
      limit: parseInt(req.query.limit) || 100,
      skip: parseInt(req.query.skip) || 0,
    };

    const files = await knowledgeBankService.getUserFiles(userId, filters, req);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Files retrieved successfully',
      data: {
        files,
        totalCount: files.length,
        filters: {
          fileType: filters.fileType,
          processingStatus: filters.processingStatus,
          isProcessed: filters.isProcessed,
        },
      },
    });
  } catch (error) {
    logger.error('[KnowledgeBank] Get user files error:', error);

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
const getFileById = catchAsync(async (req, res) => {
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
    const file = await knowledgeBankService.getFileById(fileId, userId, req);

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
    logger.error('[KnowledgeBank] Get file error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving the file',
    });
  }
});

/**
 * Delete file from knowledge bank
 */
const deleteFile = catchAsync(async (req, res) => {
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
    const result = await knowledgeBankService.deleteFile(fileId, userId, req);

    if (!result) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'File not found or could not be deleted',
      });
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    logger.error('[KnowledgeBank] Delete file error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while deleting the file',
    });
  }
});

/**
 * Process file (add to RAG system)
 */
const processFile = catchAsync(async (req, res) => {
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
    // Verify file belongs to user
    const file = await knowledgeBankService.getFileById(fileId, userId, req);
    if (!file) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'File not found',
      });
    }

    // Check if already processed
    if (file.isProcessed) {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'File has already been processed',
        data: {
          documentId: file.documentId,
          processedAt: file.processedAt,
        },
      });
    }

    // Process file
    const result = await knowledgeBankService.processUploadedFile(fileId, req);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'File processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('[KnowledgeBank] Process file error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while processing the file',
    });
  }
});

/**
 * Get user's storage statistics
 */
const getUserStorageStats = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const stats = await knowledgeBankService.getUserStorageStats(userId, req);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Storage statistics retrieved successfully',
      data: stats,
    });
  } catch (error) {
    logger.error('[KnowledgeBank] Get storage stats error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving storage statistics',
    });
  }
});

/**
 * Create a new folder
 */
const createFolder = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const { name, parentFolderId, description, color, icon, tags } = req.body;

  if (!name || !name.trim()) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Folder name is required',
    });
  }

  try {
    const folderData = {
      name: name.trim(),
      parentFolderId: parentFolderId || null,
      description,
      color,
      icon,
      tags,
    };

    const folder = await knowledgeBankService.createFolder(userId, folderData, req);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Folder created successfully',
      data: folder,
    });
  } catch (error) {
    logger.error('[KnowledgeBank] Create folder error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while creating the folder',
    });
  }
});

/**
 * Get user's folders
 */
const getUserFolders = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const options = {
      parentFolderId: req.query.parentFolderId === 'root' ? null : req.query.parentFolderId,
    };

    const folders = await knowledgeBankService.getUserFolders(userId, options, req);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Folders retrieved successfully',
      data: {
        folders,
        totalCount: folders.length,
      },
    });
  } catch (error) {
    logger.error('[KnowledgeBank] Get folders error:', error);

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
const getFolderById = catchAsync(async (req, res) => {
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
    const folder = await knowledgeBankService.getFolderById(folderId, userId, req);

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
    logger.error('[KnowledgeBank] Get folder error:', error);

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
const updateFolder = catchAsync(async (req, res) => {
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
    const updateData = {
      name: req.body.name,
      description: req.body.description,
      color: req.body.color,
      icon: req.body.icon,
      tags: req.body.tags,
    };

    const folder = await knowledgeBankService.updateFolder(folderId, userId, updateData, req);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Folder updated successfully',
      data: folder,
    });
  } catch (error) {
    logger.error('[KnowledgeBank] Update folder error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while updating the folder',
    });
  }
});

/**
 * Delete folder
 */
const deleteFolder = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { folderId } = req.params;
  const recursive = req.query.recursive === 'true';

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
    const result = await knowledgeBankService.deleteFolder(folderId, userId, recursive, req);

    if (!result) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Folder not found or could not be deleted',
      });
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Folder deleted successfully',
    });
  } catch (error) {
    logger.error('[KnowledgeBank] Delete folder error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while deleting the folder',
    });
  }
});

/**
 * Get folder contents (files and subfolders)
 */
const getFolderContents = catchAsync(async (req, res) => {
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
    const folderIdValue = folderId === 'root' ? null : folderId;
    const contents = await knowledgeBankService.getFolderContents(folderIdValue, userId, req);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Folder contents retrieved successfully',
      data: contents,
    });
  } catch (error) {
    logger.error('[KnowledgeBank] Get folder contents error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving folder contents',
    });
  }
});

export const knowledgeBankController = {
  uploadFile,
  getUserFiles,
  getFileById,
  deleteFile,
  processFile,
  getUserStorageStats,
  createFolder,
  getUserFolders,
  getFolderById,
  updateFolder,
  deleteFolder,
  getFolderContents,
};
