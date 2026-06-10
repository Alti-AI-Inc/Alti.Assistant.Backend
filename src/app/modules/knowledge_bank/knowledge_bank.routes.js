/**
 * @file This file defines the API routes for the Knowledge Bank module.
 * It handles operations related to file uploads, file management, folder management,
 * and storage statistics within the knowledge bank.
 *
 * @module knowledge_bank.routes
 */

import express from 'express';
import multer from 'multer';
import { knowledgeBankController } from './knowledge_bank.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

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
 *     summary: Upload file(s) to the knowledge bank.
 *     description: Allows users to upload one or more files. Files are stored in memory temporarily before being processed. Can specify a `folderId` in the body to upload into a specific folder.
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
 *       201:
 *         description: File(s) uploaded successfully.
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
  knowledgeBankController.uploadFile
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
  knowledgeBankController.processFile
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
 *     description: Deletes a specific folder. If `recursive=true` is provided as a query parameter, all its contents (files and subfolders) will also be deleted.
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
 *       204:
 *         description: Folder deleted successfully. No content.
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
  knowledgeBankController.deleteFolder
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