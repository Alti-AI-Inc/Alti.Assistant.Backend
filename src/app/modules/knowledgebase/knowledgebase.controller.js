import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { RAGSystem } from 'rag-system-pgvector'
import { knowledgebaseService } from './knowledgebase.service.js';
import path from 'path';

/**
 * Upload file to knowledge base
 */
const uploadFile = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  // if (isGuest) {
  //   return sendResponse(res, {
  //     statusCode: httpStatus.UNAUTHORIZED,
  //     success: false,
  //     message: 'File upload is only available for authenticated users',
  //   });
  // }

  const userId = req.user?.userId || req.user?._id;

  // if (!userId) {
  //   return sendResponse(res, {
  //     statusCode: httpStatus.UNAUTHORIZED,
  //     success: false,
  //     message: 'User authentication required',
  //   });
  // }

  if (!req.files || req.files.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'No file provided',
    });
  }

  // Get the first uploaded file
  const uploadedFile = req.files[0];

  // Extract file extension from filename
  const fileExtension = path.extname(uploadedFile.originalname).toLowerCase().substring(1); // Remove the dot and convert to lowercase

  try {
    // For now, just return success message
    // You can add the actual processing logic later
    logger.info(`File upload attempted by user: ${userId}, file: ${uploadedFile.originalname}, type: ${fileExtension}, size: ${uploadedFile.size} bytes`);
    await knowledgebaseService.processUploadedFile(uploadedFile, userId);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Upload successful',
      data: {
        fileName: uploadedFile.originalname,
        fileType: fileExtension,
        fileSize: uploadedFile.size,
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("File upload error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while uploading the file',
    });
  }
});

/**
 * Get user's uploaded files
 */
const getUserFiles = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Access to files is only available for authenticated users',
    });
  }

  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    // Placeholder for getting user files
    // You can implement the actual logic later
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Files retrieved successfully',
      data: {
        files: [],
        totalCount: 0,
      },
    });
  } catch (error) {
    logger.error("Get user files error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving files',
    });
  }
});

export const knowledgebaseController = {
  uploadFile,
  getUserFiles,
};