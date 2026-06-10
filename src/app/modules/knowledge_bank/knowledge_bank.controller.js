import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { knowledgeBankService } from './knowledge_bank.service.js';
import UserUsageModel from '../usage/userUsage.model.js';

/**
 * @typedef {object} FileUploadOptions
 * @property {string} [description] - A description for the uploaded file.
 * @property {string[]} [tags] - An array of tags associated with the file.
 * @property {string} [folderId] - The ID of the folder where the file should be stored.
 * @property {string} [uploadSource='web'] - The source of the upload (e.g., 'web', 'api').
 * @property {string} [ipAddress] - The IP address from which the upload originated.
 * @property {object} [metadata] - Additional metadata for the file, as a JSON string.
 * @property {string} [processImmediately] - If 'true', triggers immediate processing of the file.
 */

/**
 * @typedef {object} FileUploadResult
 * @property {string} fileId - The unique ID of the uploaded file.
 * @property {string} originalname - The original name of the file.
 * @property {string} mimetype - The MIME type of the file.
 * @property {number} size - The size of the file in bytes.
 * @property {string} userId - The ID of the user who uploaded the file.
 * @property {string} [folderId] - The ID of the folder where the file is stored.
 * @property {string} [description] - The description of the file.
 * @property {string[]} [tags] - Tags associated with the file.
 * @property {object} [metadata] - Additional metadata for the file.
 * @property {string} uploadSource - The source of the upload.
 * @property {Date} createdAt - The timestamp when the file was uploaded.
 * @property {Date} updatedAt - The timestamp when the file record was last updated.
 */

/**
 * @typedef {object} FileFilters
 * @property {string} [fileType] - Filter by file MIME type.
 * @property {string} [processingStatus] - Filter by processing status (e.g., 'pending', 'processing', 'completed', 'failed').
 * @property {boolean} [isProcessed] - Filter by whether the file has been processed.
 * @property {string|null} [folderId] - Filter by folder ID. Use 'null' for root folder.
 * @property {number} [limit=100] - The maximum number of files to return.
 * @property {number} [skip=0] - The number of files to skip for pagination.
 */

/**
 * @typedef {object} FolderData
 * @property {string} name - The name of the folder.
 * @property {string|null} [parentFolderId] - The ID of the parent folder. Null for root folders.
 * @property {string} [description] - A description for the folder.
 * @property {string} [color] - A color associated with the folder.
 * @property {string} [icon] - An icon associated with the folder.
 * @property {string[]} [tags] - An array of tags associated with the folder.
 */

/**
 * @typedef {object} Folder
 * @property {string} _id - The unique ID of the folder.
 * @property {string} name - The name of the folder.
 * @property {string} userId - The ID of the user who owns the folder.
 * @property {string|null} [parentFolderId] - The ID of the parent folder. Null for root folders.
 * @property {string} [description] - A description for the folder.
 * @property {string} [color] - A color associated with the folder.
 * @property {string} [icon] - An icon associated with the folder.
 * @property {string[]} [tags] - An array of tags associated with the folder.
 * @property {Date} createdAt - The timestamp when the folder was created.
 * @property {Date} updatedAt - The timestamp when the folder was last updated.
 */

/**
 * @typedef {object} FolderContents
 * @property {Array<object>} files - An array of file objects within the folder.
 * @property {Array<object>} folders - An array of subfolder objects within the folder.
 */

/**
 * @typedef {object} UserStorageStats
 * @property {number} totalStorageUsed - Total storage used by the user in bytes.
 * @property {number} fileCount - Total number of files uploaded by the user.
 * @property {number} folderCount - Total number of folders created by the user.
 * @property {object} fileTypeBreakdown - Breakdown of storage by file type.
 */

/**
 * @swagger
 * tags:
 *   name: Knowledge Bank
 *   description: API for managing user files and folders in the knowledge bank.
 */

/**
 * @swagger
 * /api/v1/knowledge-bank/upload:
 *   post:
 *     summary: Upload a file to the user's knowledge bank.
 *     description: Uploads a single file along with optional metadata, tags, and folder information.
 *                  Supports immediate processing of the file.
 *     tags: [Knowledge Bank]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file to upload.
 *               description:
 *                 type: string
 *                 description: A description for the uploaded file.
 *                 example: "My important document about project X."
 *               tags:
 *                 type: string
 *                 description: JSON string representing an array of tags (e.g., '["report", "finance"]').
 *                 example: '["report", "finance"]'
 *               folderId:
 *                 type: string
 *                 description: The ID of the folder to upload the file into.
 *                 example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *               uploadSource:
 *                 type: string
 *                 description: The source of the upload (e.g., 'web', 'api').
 *                 default: "web"
 *                 example: "web"
 *               metadata:
 *                 type: string
 *                 description: JSON string representing additional metadata (e.g., '{"author": "John Doe"}').
 *                 example: '{"author": "John Doe", "version": "1.0"}'
 *               processImmediately:
 *                 type: string
 *                 enum: ["true", "false"]
 *                 description: If 'true', the file will be processed immediately after upload.
 *                 default: "false"
 *                 example: "true"
 *     responses:
 *       200:
 *         description: File uploaded successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "File uploaded successfully"
 *                 data:
 *                   $ref: '#/components/schemas/FileUploadResult'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
    logger.info(
      `[KnowledgeBank] File upload by user: ${userId}, file: ${uploadedFile.originalname}`
    );

    // Extract optional metadata from request body
    /** @type {FileUploadOptions} */
    const options = {
      description: req.body.description,
      tags: [], // Initialize as empty array
      folderId: req.body.folderId || null,
      uploadSource: req.body.uploadSource || 'web',
      ipAddress: req.ip,
      metadata: {}, // Initialize as empty object
    };

    // Safely parse tags if provided. Malformed JSON should result in a BAD_REQUEST.
    if (req.body.tags) {
      try {
        options.tags = JSON.parse(req.body.tags);
      } catch (e) {
        logger.error(`[KnowledgeBank] Invalid JSON for tags in uploadFile: ${e.message}`);
        return sendResponse(res, {
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message: 'Invalid JSON format for tags',
        });
      }
    }

    // Safely parse metadata if provided. Malformed JSON should result in a BAD_REQUEST.
    if (req.body.metadata) {
      try {
        options.metadata = JSON.parse(req.body.metadata);
      } catch (e) {
        logger.error(`[KnowledgeBank] Invalid JSON for metadata in uploadFile: ${e.message}`);
        return sendResponse(res, {
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message: 'Invalid JSON format for metadata',
        });
      }
    }

    // Upload file
    const result = await knowledgeBankService.uploadFile(
      uploadedFile,
      userId,
      options,
      req
    );

    // Track storage usage
    const tenantId = req.currentTenantId ?? null;
    // Optimization: Ensure UserUsageModel has indexes on `userId` and `tenantId` for efficient updates.
    await UserUsageModel.updateStorage(
      userId,
      tenantId,
      uploadedFile.size
    ).catch((err) =>
      logger.error('[KnowledgeBank] Storage increment error:', err)
    );

    // Optionally trigger processing in background (async)
    if (req.body.processImmediately === 'true') {
      // Process file asynchronously without waiting
      knowledgeBankService
        .processUploadedFile(result.fileId, req)
        .then(() =>
          logger.info(`[KnowledgeBank] File processed: ${result.fileId}`)
        )
        .catch((err) =>
          logger.error(
            `[KnowledgeBank] Error processing file: ${result.fileId}`,
            err
          )
        );
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
 * @swagger
 * /api/v1/knowledge-bank/files:
 *   get:
 *     summary: Get user's files from the knowledge bank.
 *     description: Retrieves a list of files belonging to the authenticated user, with optional filtering and pagination.
 *     tags: [Knowledge Bank]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fileType
 *         schema:
 *           type: string
 *         description: Filter files by MIME type (e.g., 'application/pdf', 'image/jpeg').
 *         example: "application/pdf"
 *       - in: query
 *         name: processingStatus
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed]
 *         description: Filter files by their processing status.
 *         example: "completed"
 *       - in: query
 *         name: isProcessed
 *         schema:
 *           type: boolean
 *         description: Filter files by whether they have been processed ('true' or 'false').
 *         example: "true"
 *       - in: query
 *         name: folderId
 *         schema:
 *           type: string
 *         description: Filter files by folder ID. Use 'null' to retrieve files in the root directory.
 *         example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 100
 *         description: Maximum number of files to return.
 *         example: 50
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of files to skip for pagination.
 *         example: 0
 *     responses:
 *       200:
 *         description: Files retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Files retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     files:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/FileUploadResult' # Assuming FileUploadResult is the schema for a file
 *                     totalCount:
 *                       type: number
 *                       description: Total number of files matching the criteria.
 *                       example: 150
 *                     filters:
 *                       type: object
 *                       properties:
 *                         fileType:
 *                           type: string
 *                           nullable: true
 *                         processingStatus:
 *                           type: string
 *                           nullable: true
 *                         isProcessed:
 *                           type: boolean
 *                           nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
    /** @type {FileFilters} */
    const filters = {
      fileType: req.query.fileType,
      processingStatus: req.query.processingStatus,
      isProcessed:
        req.query.isProcessed === 'true'
          ? true
          : req.query.isProcessed === 'false'
            ? false
            : undefined,
      folderId: req.query.folderId === 'null' ? null : req.query.folderId,
      limit: parseInt(req.query.limit) || 100,
      skip: parseInt(req.query.skip) || 0,
    };

    // Optimization: For read operations that return data directly, the service method
    // `knowledgeBankService.getUserFiles` should use `.lean()` to return plain JavaScript objects
    // instead of Mongoose documents, reducing overhead.
    // Optimization: Ensure the underlying KnowledgeBank file model has indexes on `userId`,
    // `folderId`, `fileType`, `processingStatus`, and `isProcessed` for efficient filtering and sorting.
    const { data: files, total: totalCount } = await knowledgeBankService.getUserFiles(userId, filters, req);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Files retrieved successfully',
      data: {
        files,
        totalCount: totalCount, // Use totalCount from service for proper pagination
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
 * @swagger
 * /api/v1/knowledge-bank/files/{fileId}:
 *   get:
 *     summary: Get a specific file by ID.
 *     description: Retrieves details of a single file belonging to the authenticated user.
 *     tags: [Knowledge Bank]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the file to retrieve.
 *         example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *     responses:
 *       200:
 *         description: File retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "File retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/FileUploadResult'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
    // Optimization: For read operations that return data directly, the service method
    // `knowledgeBankService.getFileById` should use `.lean()` to return a plain JavaScript object.
    // Optimization: Ensure the underlying KnowledgeBank file model has a compound index on `{ fileId: 1, userId: 1 }`
    // or separate indexes on `fileId` and `userId` for fast lookups.
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
 * @swagger
 * /api/v1/knowledge-bank/files/{fileId}:
 *   delete:
 *     summary: Delete a file from the knowledge bank.
 *     description: Deletes a specific file belonging to the authenticated user.
 *                  This also decrements the user's storage usage.
 *     tags: [Knowledge Bank]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the file to delete.
 *         example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *     responses:
 *       200:
 *         description: File deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "File deleted successfully"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
    // Optimization: Ensure the underlying KnowledgeBank file model has a compound index on `{ fileId: 1, userId: 1 }`
    // or separate indexes on `fileId` and `userId` for efficient deletion.
    const result = await knowledgeBankService.deleteFile(fileId, userId, req);

    if (!result) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'File not found or could not be deleted',
      });
    }

    // Decrement storage usage
    const tenantId = req.currentTenantId ?? null;
    // Optimization: Ensure UserUsageModel has indexes on `userId` and `tenantId` for efficient updates.
    await UserUsageModel.updateStorage(
      userId,
      tenantId,
      -(result.fileSize || 0)
    ).catch((err) =>
      logger.error('[KnowledgeBank] Storage decrement error:', err)
    );

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
      message: error.message || 'An error occurred while deleting the file',
    });
  }
});

/**
 * @swagger
 * /api/v1/knowledge-bank/files/{fileId}/process:
 *   post:
 *     summary: Process a file for RAG system.
 *     description: Triggers the processing of an uploaded file, typically for integration into a Retrieval-Augmented Generation (RAG) system.
 *                  This operation is idempotent; attempting to process an already processed file will return a bad request.
 *     tags: [Knowledge Bank]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the file to process.
 *         example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *     responses:
 *       200:
 *         description: File processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "File processed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     documentId:
 *                       type: string
 *                       description: The ID of the document created in the RAG system.
 *                       example: "doc_12345"
 *                     status:
 *                       type: string
 *                       description: The new processing status of the file.
 *                       example: "completed"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       400:
 *         description: Bad Request (e.g., File ID is required, File has already been processed).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "File has already been processed"
 *                 data:
 *                   type: object
 *                   properties:
 *                     documentId:
 *                       type: string
 *                       example: "doc_12345"
 *                     processedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:00:00Z"
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
    // Optimization: For read operations that return data for checks, the service method
    // `knowledgeBankService.getFileById` should use `.lean()` to return a plain JavaScript object.
    // Optimization: Ensure the underlying KnowledgeBank file model has a compound index on `{ fileId: 1, userId: 1 }`
    // or separate indexes on `fileId` and `userId` for fast lookups.
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
 * @swagger
 * /api/v1/knowledge-bank/storage-stats:
 *   get:
 *     summary: Get user's storage statistics.
 *     description: Retrieves statistics about the authenticated user's storage usage, including total storage used, file count, and folder count.
 *     tags: [Knowledge Bank]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Storage statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Storage statistics retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/UserStorageStats'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
    // Optimization: For read operations that return data directly, the service method
    // `knowledgeBankService.getUserStorageStats` should use `.lean()` to return a plain JavaScript object.
    // Optimization: Ensure the underlying model used for storage stats has an index on `userId`.
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
 * @swagger
 * /api/v1/knowledge-bank/folders:
 *   post:
 *     summary: Create a new folder.
 *     description: Creates a new folder in the user's knowledge bank.
 *     tags: [Knowledge Bank]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the new folder.
 *                 example: "My New Project"
 *               parentFolderId:
 *                 type: string
 *                 nullable: true
 *                 description: The ID of the parent folder. If null, the folder is created at the root level.
 *                 example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *               description:
 *                 type: string
 *                 description: A description for the folder.
 *                 example: "Contains all documents for the Q4 project."
 *               color:
 *                 type: string
 *                 description: A color code for the folder (e.g., hex, CSS color name).
 *                 example: "#FF5733"
 *               icon:
 *                 type: string
 *                 description: An icon identifier for the folder.
 *                 example: "folder-icon-project"
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of tags associated with the folder.
 *                 example: ["project", "active"]
 *     responses:
 *       201:
 *         description: Folder created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Folder created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Folder'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
    /** @type {FolderData} */
    const folderData = {
      name: name.trim(),
      parentFolderId: parentFolderId || null,
      description,
      color,
      icon,
      tags,
    };

    // Optimization: Ensure the underlying Folder model has indexes on `userId` and `parentFolderId`
    // for efficient creation and lookup, especially if uniqueness constraints or hierarchical queries are involved.
    const folder = await knowledgeBankService.createFolder(
      userId,
      folderData,
      req
    );

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
 * @swagger
 * /api/v1/knowledge-bank/folders:
 *   get:
 *     summary: Get user's folders.
 *     description: Retrieves a list of folders belonging to the authenticated user, with optional filtering by parent folder.
 *     tags: [Knowledge Bank]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: parentFolderId
 *         schema:
 *           type: string
 *           nullable: true
 *         description: Filter folders by their parent folder ID. Use 'root' or omit for top-level folders.
 *         example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *     responses:
 *       200:
 *         description: Folders retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Folders retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     folders:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Folder'
 *                     totalCount:
 *                       type: number
 *                       description: Total number of folders matching the criteria.
 *                       example: 10
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
      parentFolderId:
        req.query.parentFolderId === 'root' ? null : req.query.parentFolderId,
    };

    // Optimization: For read operations that return data directly, the service method
    // `knowledgeBankService.getUserFolders` should use `.lean()` to return plain JavaScript objects.
    // Optimization: Ensure the underlying Folder model has a compound index on `{ userId: 1, parentFolderId: 1 }`
    // for efficient filtering and retrieval of folders.
    const { data: folders, total: totalCount } = await knowledgeBankService.getUserFolders(
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
        totalCount: totalCount, // Use totalCount from service for proper pagination
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
 * @swagger
 * /api/v1/knowledge-bank/folders/{folderId}:
 *   get:
 *     summary: Get a specific folder by ID.
 *     description: Retrieves details of a single folder belonging to the authenticated user.
 *     tags: [Knowledge Bank]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the folder to retrieve.
 *         example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *     responses:
 *       200:
 *         description: Folder retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Folder retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Folder'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
    // Optimization: For read operations that return data directly, the service method
    // `knowledgeBankService.getFolderById` should use `.lean()` to return a plain JavaScript object.
    // Optimization: Ensure the underlying Folder model has a compound index on `{ folderId: 1, userId: 1 }`
    // or separate indexes on `folderId` and `userId` for fast lookups.
    const folder = await knowledgeBankService.getFolderById(
      folderId,
      userId,
      req
    );

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
 * @swagger
 * /api/v1/knowledge-bank/folders/{folderId}:
 *   patch:
 *     summary: Update an existing folder.
 *     description: Updates the details of a specific folder belonging to the authenticated user.
 *     tags: [Knowledge Bank]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the folder to update.
 *         example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new name of the folder.
 *                 example: "Updated Project Documents"
 *               description:
 *                 type: string
 *                 description: An updated description for the folder.
 *                 example: "Revised documents for the Q4 project."
 *               color:
 *                 type: string
 *                 description: An updated color code for the folder.
 *                 example: "#3366FF"
 *               icon:
 *                 type: string
 *                 description: An updated icon identifier for the folder.
 *                 example: "folder-icon-revised"
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An updated array of tags associated with the folder.
 *                 example: ["project", "completed"]
 *     responses:
 *       200:
 *         description: Folder updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Folder updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Folder'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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

    // Optimization: Ensure the underlying Folder model has a compound index on `{ folderId: 1, userId: 1 }`
    // or separate indexes on `folderId` and `userId` for efficient updates.
    const folder = await knowledgeBankService.updateFolder(
      folderId,
      userId,
      updateData,
      req
    );

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
 * @swagger
 * /api/v1/knowledge-bank/folders/{folderId}:
 *   delete:
 *     summary: Delete a folder.
 *     description: Deletes a specific folder belonging to the authenticated user.
 *                  Optionally, it can recursively delete all its contents (subfolders and files).
 *     tags: [Knowledge Bank]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the folder to delete.
 *         example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *       - in: query
 *         name: recursive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If 'true', all contents (subfolders and files) within the folder will also be deleted.
 *                      If 'false' and the folder contains items, the deletion will fail.
 *         example: "true"
 *     responses:
 *       200:
 *         description: Folder deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Folder deleted successfully"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
    // Optimization: Ensure the underlying Folder model has a compound index on `{ folderId: 1, userId: 1 }`
    // or separate indexes on `folderId` and `userId` for efficient deletion.
    const result = await knowledgeBankService.deleteFolder(
      folderId,
      userId,
      recursive,
      req
    );

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
 * @swagger
 * /api/v1/knowledge-bank/folders/{folderId}/contents:
 *   get:
 *     summary: Get folder contents (files and subfolders).
 *     description: Retrieves a list of files and subfolders directly within a specified folder.
 *                  Use 'root' as folderId to get contents of the top-level directory.
 *     tags: [Knowledge Bank]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the folder whose contents to retrieve. Use 'root' for top-level contents.
 *         example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *     responses:
 *       200:
 *         description: Folder contents retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Folder contents retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/FolderContents'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
    // Optimization: For read operations that return data directly, the service method
    // `knowledgeBankService.getFolderContents` should use `.lean()` to return plain JavaScript objects.
    // Optimization: Ensure the underlying Folder and File models have compound indexes on
    // `{ parentFolderId: 1, userId: 1 }` and `{ folderId: 1, userId: 1 }` respectively, for efficient retrieval of contents.
    const contents = await knowledgeBankService.getFolderContents(
      folderIdValue,
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
    logger.error('[KnowledgeBank] Get folder contents error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving folder contents',
    });
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     FileUploadResult:
 *       type: object
 *       properties:
 *         fileId:
 *           type: string
 *           description: The unique ID of the uploaded file.
 *           example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *         originalname:
 *           type: string
 *           description: The original name of the file.
 *           example: "document.pdf"
 *         mimetype:
 *           type: string
 *           description: The MIME type of the file.
 *           example: "application/pdf"
 *         size:
 *           type: number
 *           description: The size of the file in bytes.
 *           example: 102400
 *         userId:
 *           type: string
 *           description: The ID of the user who uploaded the file.
 *           example: "user123"
 *         folderId:
 *           type: string
 *           nullable: true
 *           description: The ID of the folder where the file is stored.
 *           example: "folder456"
 *         description:
 *           type: string
 *           nullable: true
 *           description: The description of the file.
 *           example: "Important project brief"
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           description: Tags associated with the file.
 *           example: ["project", "brief"]
 *         metadata:
 *           type: object
 *           description: Additional metadata for the file.
 *           example: { "source": "email", "version": "2.0" }
 *         uploadSource:
 *           type: string
 *           description: The source of the upload.
 *           example: "web"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The timestamp when the file was uploaded.
 *           example: "2023-10-27T10:00:00Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: The timestamp when the file record was last updated.
 *           example: "2023-10-27T10:00:00Z"
 *         isProcessed:
 *           type: boolean
 *           description: Indicates if the file has been processed for RAG.
 *           example: false
 *         processingStatus:
 *           type: string
 *           description: Current processing status of the file.
 *           example: "pending"
 *         documentId:
 *           type: string
 *           nullable: true
 *           description: ID of the document in the RAG system, if processed.
 *           example: "rag_doc_789"
 *     Folder:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: The unique ID of the folder.
 *           example: "65e8a2b2c3d4e5f6a7b8c9d0"
 *         name:
 *           type: string
 *           description: The name of the folder.
 *           example: "Project X Documents"
 *         userId:
 *           type: string
 *           description: The ID of the user who owns the folder.
 *           example: "user123"
 *         parentFolderId:
 *           type: string
 *           nullable: true
 *           description: The ID of the parent folder. Null for root folders.
 *           example: "folderParent123"
 *         description:
 *           type: string
 *           nullable: true
 *           description: A description for the folder.
 *           example: "All documents related to Project X."
 *         color:
 *           type: string
 *           nullable: true
 *           description: A color associated with the folder.
 *           example: "#FF5733"
 *         icon:
 *           type: string
 *           nullable: true
 *           description: An icon identifier for the folder.
 *           example: "folder-icon-project"
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           description: An array of tags associated with the folder.
 *           example: ["work", "project"]
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The timestamp when the folder was created.
 *           example: "2023-10-27T10:00:00Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: The timestamp when the folder was last updated.
 *           example: "2023-10-27T10:00:00Z"
 *     FolderContents:
 *       type: object
 *       properties:
 *         files:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/FileUploadResult'
 *           description: List of files directly within the folder.
 *         folders:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Folder'
 *           description: List of subfolders directly within the folder.
 *     UserStorageStats:
 *       type: object
 *       properties:
 *         totalStorageUsed:
 *           type: number
 *           description: Total storage used by the user in bytes.
 *           example: 52428800
 *         fileCount:
 *           type: number
 *           description: Total number of files uploaded by the user.
 *           example: 150
 *         folderCount:
 *           type: number
 *           description: Total number of folders created by the user.
 *           example: 10
 *         fileTypeBreakdown:
 *           type: object
 *           description: Breakdown of storage by file type.
 *           example:
 *             application/pdf: 30000000
 *             image/jpeg: 15000000
 *             text/plain: 7428800
 *   responses:
 *     Unauthorized:
 *       description: Unauthorized - User authentication required or invalid token.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               statusCode:
 *                 type: number
 *                 example: 401
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "User authentication required"
 *     BadRequest:
 *       description: Bad Request - Invalid input or missing required parameters.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               statusCode:
 *                 type: number
 *                 example: 400
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "File ID is required"
 *     NotFound:
 *       description: Not Found - The requested resource was not found.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               statusCode:
 *                 type: number
 *                 example: 404
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "File not found"
 *     InternalServerError:
 *       description: Internal Server Error - An unexpected error occurred.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               statusCode:
 *                 type: number
 *                 example: 500
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "An error occurred while processing the request"
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * Knowledge Bank Controller.
 * @namespace knowledgeBankController
 * @description Provides controller functions for managing files and folders in the user's knowledge bank.
 * This includes operations like uploading, retrieving, deleting, and processing files,
 * as well as creating, listing, updating, and deleting folders.
 */
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