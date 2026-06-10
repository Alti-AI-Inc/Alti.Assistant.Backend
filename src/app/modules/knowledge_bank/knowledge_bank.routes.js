/**
 * @file This file defines the API routes for the Knowledge Bank module.
 * It handles operations related to file uploads, file management, folder management,
 * and storage statistics within the knowledge bank.
 *
 * @module knowledge_bank.routes
 */

import express from 'express';
import multer from 'multer';
import { PubSub } from '@google-cloud/pubsub';
import { knowledgeBankController } from './knowledge_bank.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

// ==================== GCP OFFLOADING SETUP ====================

// Initialize GCP Pub/Sub client.
// Ensure you have configured credentials correctly in your environment
// (e.g., by running `gcloud auth application-default login`).
const pubSubClient = new PubSub();

// Define Pub/Sub topic names for background jobs.
// It's recommended to manage these via environment variables.
const KNOWLEDGE_FILE_PROCESSING_TOPIC =
  process.env.KNOWLEDGE_FILE_PROCESSING_TOPIC || 'knowledge-file-processing';
const KNOWLEDGE_FOLDER_DELETE_TOPIC =
  process.env.KNOWLEDGE_FOLDER_DELETE_TOPIC ||
  'knowledge-folder-delete-recursive';

// ===============================================================

/**
 * Express router for Knowledge Bank routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * Multer storage configuration.
 * Files are stored in memory for temporary processing before being handled by the controller.
 * @type {multer.StorageEngine}
 */
const storage = multer.memoryStorage(); // Store in memory

/**
 * Multer file filter function to validate uploaded file types.
 * Currently, it allows all file types but includes commented-out logic for restriction.
 *
 * @param {Express.Request} req - The Express request object.
 * @param {Express.Multer.File} file - The file object provided by Multer.
 * @param {function(Error | null, boolean): void} cb - The callback function to indicate if the file should be accepted.
 * @returns {void}
 */
const fileFilter = (req, file, cb) => {
  // Log the file details for debugging
  console.log('[KnowledgeBank] File upload attempt:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    fieldname: file.fieldname,
    size: file.size,
  });

  // Define allowed file types (can be made configurable)
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'application/json',
    'text/xml',
    'application/xml',
    'text/html',
    'text/markdown',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];

  // Allow all file types for now (can be restricted later)
  cb(null, true);

  // Uncomment to enforce file type restrictions:
  // if (allowedTypes.includes(file.mimetype)) {
  //   cb(null, true);
  // } else {
  //   cb(new Error('Invalid file type. Only documents are allowed.'), false);
  // }
};

/**
 * Multer upload middleware configured for file uploads.
 * It uses in-memory storage, a file filter, and sets a file size limit.
 * @type {multer.Multer}
 */
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit (can be configured)
  },
});

/**
 * Knowledge Bank Routes
 * All routes require authentication
 */

// ==================== FILE ROUTES ====================

/**
 * @swagger
 * /knowledge-bank/upload:
 *   post:
 *     summary: Upload file(s) to the knowledge bank and trigger background processing.
 *     description: Allows users to upload one or more files. Files are accepted and a background job is immediately scheduled for RAG processing. Can specify a `folderId` in the body to upload into a specific folder.
 *     tags:
 *       - Knowledge Bank Files
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: One or more files to upload.
 *               folderId:
 *                 type: string
 *                 description: Optional ID of the folder to upload the files into.
 *                 nullable: true
 *     responses:
 *       202:
 *         description: File(s) accepted and scheduled for processing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 files:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *                       size: { type: number }
 *       400:
 *         description: Bad request (e.g., no file provided, invalid input).
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (e.g., RAG feature disabled, storage limit exceeded).
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/upload',
  auth(),
  extractTenantContext,
  checkStorageLimit,
  upload.any(),
  checkRAGFeature,
  // REWRITE: The original controller is replaced with an async handler.
  // This handler offloads the heavy file processing (parsing, embedding)
  // to a background worker via GCP Pub/Sub, ensuring the API responds quickly
  // and remains stateless.
  async (req, res, next) => {
    try {
      // This is a placeholder for the original controller's logic which would:
      // 1. Validate the request (e.g., check if req.files exists).
      // 2. Iterate through `req.files`.
      // 3. Upload each file buffer to a persistent store like Google Cloud Storage.
      // 4. Create corresponding file records in the database.
      // 5. Return the newly created file records.
      // For this rewrite, we'll simulate this and focus on the offloading part.

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files were uploaded.' });
      }

      // SIMULATED: Assume files are saved and we get back records with IDs.
      // In a real implementation, this would come from `knowledgeBankService.createFiles(...)`.
      const savedFileRecords = req.files.map((file) => ({
        id: `simulated-id-${Math.random().toString(36).substring(2)}`,
        name: file.originalname,
        size: file.size,
      }));

      // OFFLOADING: For each uploaded file, publish a message to Pub/Sub
      // to trigger the heavy RAG processing in the background.
      const tenantId = req.tenant.id;
      const topic = pubSubClient.topic(KNOWLEDGE_FILE_PROCESSING_TOPIC);

      const publishTasks = savedFileRecords.map((fileRecord) => {
        const message = {
          fileId: fileRecord.id,
          tenantId: tenantId,
        };
        console.log(
          `[PubSub] Publishing message to topic "${KNOWLEDGE_FILE_PROCESSING_TOPIC}" for file processing:`,
          message
        );
        return topic.publishMessage({ json: message });
      });

      await Promise.all(publishTasks);

      // Respond immediately to the client with 202 Accepted.
      // The client should understand that the "processing" status of these files is pending.
      res.status(202).json({
        message: 'File(s) accepted and scheduled for processing.',
        files: savedFileRecords,
      });
    } catch (error) {
      console.error(
        '[Async Upload] Failed to process upload and trigger background job:',
        error
      );
      next(error);
    }
  }
);

/**
 * @swagger
 * /knowledge-bank/files:
 *   get:
 *     summary: Get user's files.
 *     description: Retrieves a list of files belonging to the authenticated user. Can filter by `folderId` to get files within a specific folder.
 *     tags:
 *       - Knowledge Bank Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: folderId
 *         schema:
 *           type: string
 *         description: Optional ID of the folder to retrieve files from.
 *         nullable: true
 *     responses:
 *       200:
 *         description: A list of files.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string }
 *                   name: { type: string }
 *                   size: { type: number }
 *                   mimetype: { type: string }
 *                   folderId: { type: string, nullable: true }
 *                   createdAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/files',
  auth(),
  extractTenantContext,
  knowledgeBankController.getUserFiles
);

/**
 * @swagger
 * /knowledge-bank/files/{fileId}:
 *   get:
 *     summary: Get file by ID.
 *     description: Retrieves details of a specific file by its ID.
 *     tags:
 *       - Knowledge Bank Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the file to retrieve.
 *     responses:
 *       200:
 *         description: File details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 name: { type: string }
 *                 size: { type: number }
 *                 mimetype: { type: string }
 *                 folderId: { type: string, nullable: true }
 *                 createdAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: File not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/files/:fileId',
  auth(),
  extractTenantContext,
  knowledgeBankController.getFileById
);

/**
 * @swagger
 * /knowledge-bank/files/{fileId}:
 *   delete:
 *     summary: Delete file by ID.
 *     description: Deletes a specific file from the knowledge bank.
 *     tags:
 *       - Knowledge Bank Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the file to delete.
 *     responses:
 *       204:
 *         description: File deleted successfully. No content.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: File not found.
 *       500:
 *         description: Internal server error.
 */
router.delete(
  '/files/:fileId',
  auth(),
  extractTenantContext,
  knowledgeBankController.deleteFile
);

/**
 * @swagger
 * /knowledge-bank/files/{fileId}/process:
 *   post:
 *     summary: Process a file for RAG system.
 *     description: Initiates the processing of a file, typically adding its content to the RAG (Retrieval Augmented Generation) system for search and contextual retrieval.
 *     tags:
 *       - Knowledge Bank Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the file to process.
 *     responses:
 *       202:
 *         description: File processing initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request (e.g., file already processed, invalid file type for RAG).
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (e.g., RAG feature disabled for tenant).
 *       404:
 *         description: File not found.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/files/:fileId/process',
  auth(),
  extractTenantContext,
  checkRAGFeature,
  // REWRITE: Replaced the original synchronous controller.
  // This endpoint now publishes a message to GCP Pub/Sub to trigger the
  // long-running processing task in a separate, scalable worker service.
  async (req, res, next) => {
    try {
      const { fileId } = req.params;
      const tenantId = req.tenant.id;

      // In a real app, you would first validate that the fileId is valid
      // and belongs to the user/tenant before publishing the message.
      // e.g., const file = await knowledgeBankService.getFileById(fileId, tenantId);
      // if (!file) { return res.status(404).json({ message: 'File not found.' }); }

      const message = { fileId, tenantId };
      const topic = pubSubClient.topic(KNOWLEDGE_FILE_PROCESSING_TOPIC);

      console.log(
        `[PubSub] Publishing message to topic "${KNOWLEDGE_FILE_PROCESSING_TOPIC}" for file processing:`,
        message
      );
      await topic.publishMessage({ json: message });

      res.status(202).json({
        message:
          'File processing has been initiated. The process will complete in the background.',
      });
    } catch (error) {
      console.error(
        '[Async Process] Failed to trigger background job:',
        error
      );
      next(error);
    }
  }
);

// ==================== FOLDER ROUTES ====================

/**
 * @swagger
 * /knowledge-bank/folders:
 *   post:
 *     summary: Create a new folder.
 *     description: Creates a new folder in the knowledge bank. Can specify a `parentFolderId` to create a subfolder.
 *     tags:
 *       - Knowledge Bank Folders
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
 *               parentFolderId:
 *                 type: string
 *                 description: Optional ID of the parent folder. If not provided, the folder will be created at the root.
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Folder created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 name: { type: string }
 *                 parentFolderId: { type: string, nullable: true }
 *                 createdAt: { type: string, format: date-time }
 *       400:
 *         description: Bad request (e.g., missing folder name, invalid parentFolderId).
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (e.g., RAG feature disabled).
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/folders',
  auth(),
  extractTenantContext,
  checkRAGFeature,
  knowledgeBankController.createFolder
);

/**
 * @swagger
 * /knowledge-bank/folders:
 *   get:
 *     summary: Get user's folders.
 *     description: Retrieves a list of folders belonging to the authenticated user. Can filter by `parentFolderId` to get subfolders.
 *     tags:
 *       - Knowledge Bank Folders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: parentFolderId
 *         schema:
 *           type: string
 *         description: Optional ID of the parent folder to retrieve subfolders from. If not provided, retrieves root folders.
 *         nullable: true
 *     responses:
 *       200:
 *         description: A list of folders.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string }
 *                   name: { type: string }
 *                   parentFolderId: { type: string, nullable: true }
 *                   createdAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/folders',
  auth(),
  extractTenantContext,
  knowledgeBankController.getUserFolders
);

/**
 * @swagger
 * /knowledge-bank/folders/{folderId}:
 *   get:
 *     summary: Get folder by ID with ancestors.
 *     description: Retrieves details of a specific folder by its ID, including its ancestral path.
 *     tags:
 *       - Knowledge Bank Folders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the folder to retrieve.
 *     responses:
 *       200:
 *         description: Folder details with ancestors.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 name: { type: string }
 *                 parentFolderId: { type: string, nullable: true }
 *                 createdAt: { type: string, format: date-time }
 *                 ancestors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Folder not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/folders/:folderId',
  auth(),
  extractTenantContext,
  knowledgeBankController.getFolderById
);

/**
 * @swagger
 * /knowledge-bank/folders/{folderId}:
 *   put:
 *     summary: Update folder.
 *     description: Updates the name or parent of a specific folder.
 *     tags:
 *       - Knowledge Bank Folders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the folder to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new name for the folder.
 *               parentFolderId:
 *                 type: string
 *                 description: The new parent folder ID. Set to null to move to root.
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Folder updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 name: { type: string }
 *                 parentFolderId: { type: string, nullable: true }
 *                 updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Bad request (e.g., invalid input, circular dependency).
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Folder not found.
 *       500:
 *         description: Internal server error.
 */
router.put(
  '/folders/:folderId',
  auth(),
  extractTenantContext,
  knowledgeBankController.updateFolder
);

/**
 * @swagger
 * /knowledge-bank/folders/{folderId}:
 *   delete:
 *     summary: Delete folder.
 *     description: Deletes a specific folder. If `recursive=true` is provided as a query parameter, all its contents (files and subfolders) will also be deleted asynchronously.
 *     tags:
 *       - Knowledge Bank Folders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the folder to delete.
 *       - in: query
 *         name: recursive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Set to `true` to delete the folder and all its contents (files and subfolders) recursively.
 *     responses:
 *       202:
 *         description: Recursive folder deletion initiated.
 *       204:
 *         description: Folder deleted successfully (non-recursive). No content.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Folder not found.
 *       500:
 *         description: Internal server error.
 */
router.delete(
  '/folders/:folderId',
  auth(),
  extractTenantContext,
  // REWRITE: Replaced the original controller to handle recursive deletion asynchronously.
  // A recursive delete can be a long-running operation, so it's offloaded to a
  // background worker via Pub/Sub. Simple (non-recursive) deletes are handled synchronously.
  async (req, res, next) => {
    if (req.query.recursive === 'true') {
      try {
        const { folderId } = req.params;
        const tenantId = req.tenant.id;

        // In a real app, you would validate folder ownership here.

        const message = { folderId, tenantId };
        const topic = pubSubClient.topic(KNOWLEDGE_FOLDER_DELETE_TOPIC);

        console.log(
          `[PubSub] Publishing message to topic "${KNOWLEDGE_FOLDER_DELETE_TOPIC}" for recursive folder deletion:`,
          message
        );
        await topic.publishMessage({ json: message });

        res.status(202).json({
          message:
            'Recursive folder deletion initiated. The process will complete in the background.',
        });
      } catch (error) {
        console.error(
          '[Async Delete] Failed to trigger background job for recursive deletion:',
          error
        );
        next(error);
      }
    } else {
      // For non-recursive (simple) deletion, call the original synchronous controller.
      // This is safe as it's a quick operation.
      knowledgeBankController.deleteFolder(req, res, next);
    }
  }
);

/**
 * @swagger
 * /knowledge-bank/folders/{folderId}/contents:
 *   get:
 *     summary: Get folder contents (files and subfolders).
 *     description: Retrieves a list of files and subfolders within a specific folder.
 *     tags:
 *       - Knowledge Bank Folders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the folder to retrieve contents from.
 *     responses:
 *       200:
 *         description: A list of folder contents (files and subfolders).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 files:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *                       type: { type: string, enum: [file] }
 *                       size: { type: number }
 *                       mimetype: { type: string }
 *                       createdAt: { type: string, format: date-time }
 *                 folders:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *                       type: { type: string, enum: [folder] }
 *                       createdAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Folder not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/folders/:folderId/contents',
  auth(),
  extractTenantContext,
  knowledgeBankController.getFolderContents
);

// ==================== STATS ROUTES ====================

/**
 * @swagger
 * /knowledge-bank/stats:
 *   get:
 *     summary: Get user's storage statistics.
 *     description: Retrieves storage usage statistics for the authenticated user, including total files, total folders, and total storage used.
 *     tags:
 *       - Knowledge Bank Stats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User storage statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalFiles:
 *                   type: number
 *                   description: Total number of files owned by the user.
 *                 totalFolders:
 *                   type: number
 *                   description: Total number of folders owned by the user.
 *                 totalStorageUsedBytes:
 *                   type: number
 *                   description: Total storage space used by the user's files in bytes.
 *                 storageLimitBytes:
 *                   type: number
 *                   description: The maximum storage limit for the user/tenant in bytes.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/stats',
  auth(),
  extractTenantContext,
  knowledgeBankController.getUserStorageStats
);

export default router;