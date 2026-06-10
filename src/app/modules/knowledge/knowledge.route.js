/**
 * @file Defines the routes for the Knowledge module.
 * @module knowledge/routes
 * @description This file contains all the API routes for managing and interacting with the knowledge base,
 * including file and folder management, document processing, and various query types (chat, direct query, semantic search).
 * All routes are protected and require authentication and tenant context.
 */

import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { knowledgeController } from './knowledge.controller.js';
import { KnowledgeValidation } from './knowledge.validation.js';
import { uploadKnowledge } from './middlewares/uploadKnowledge.js';

const router = express.Router();

// ==================== FILE ROUTES ====================

/**
 * @openapi
 * /api/v1/knowledge/upload:
 *   post:
 *     summary: Upload a file to the knowledge base
 *     description: >
 *       Uploads a single file to be associated with a specific owner (user or bot).
 *       The file is stored and an entry is created in the database.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - ownerType
 *               - ownerId
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file to upload.
 *               ownerType:
 *                 type: string
 *                 enum: [user, bot]
 *                 description: The type of the owner of the file.
 *               ownerId:
 *                 type: string
 *                 description: The ID of the owner.
 *               folderId:
 *                 type: string
 *                 description: The optional ID of the folder to place the file in.
 *     responses:
 *       '201':
 *         description: File uploaded successfully. Returns the created file metadata.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KnowledgeFile'
 *       '400':
 *         description: Bad request (e.g., missing file, invalid ownerType).
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 */
router.post(
  '/upload',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  uploadKnowledge.single('file'),
  validateRequest(KnowledgeValidation.uploadFileSchema),
  knowledgeController.uploadFile
);

/**
 * @openapi
 * /api/v1/knowledge/process/{fileId}:
 *   post:
 *     summary: Process an uploaded file
 *     description: >
 *       Triggers the processing of a previously uploaded file. This involves chunking the document,
 *       generating embeddings, and indexing them in the vector store for Retrieval-Augmented Generation (RAG).
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the file to process.
 *     responses:
 *       '200':
 *         description: File processing started successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       '400':
 *         description: Bad request (e.g., invalid file ID).
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 *       '404':
 *         description: File not found.
 */
router.post(
  '/process/:fileId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.processFileSchema),
  knowledgeController.processFile
);

/**
 * @openapi
 * /api/v1/knowledge/files:
 *   get:
 *     summary: Get files by owner
 *     description: >
 *       Retrieves a list of files associated with a specific owner (user or bot).
 *       Can be filtered by a parent folder. If `folderId` is not provided, it retrieves files from the root.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *       - in: query
 *         name: ownerType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [user, bot]
 *         description: The type of the owner.
 *       - in: query
 *         name: ownerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the owner.
 *       - in: query
 *         name: folderId
 *         schema:
 *           type: string
 *         description: Optional. The ID of the parent folder to filter by.
 *     responses:
 *       '200':
 *         description: A list of files.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/KnowledgeFile'
 *       '400':
 *         description: Bad request (e.g., missing ownerType or ownerId).
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 */
router.get(
  '/files',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.getFilesSchema),
  knowledgeController.getFiles
);

/**
 * @openapi
 * /api/v1/knowledge/files/{fileId}:
 *   get:
 *     summary: Get a specific file by ID
 *     description: >
 *       Retrieves the metadata for a single file by its unique ID.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the file to retrieve.
 *     responses:
 *       '200':
 *         description: The file metadata.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KnowledgeFile'
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 *       '404':
 *         description: File not found.
 */
router.get(
  '/files/:fileId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.getFileByIdSchema),
  knowledgeController.getFileById
);

/**
 * @openapi
 * /api/v1/knowledge/files/{fileId}:
 *   delete:
 *     summary: Delete a file
 *     description: >
 *       Permanently deletes a file from storage and removes its indexed data from the vector store.
 *       This action is irreversible.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the file to delete.
 *     responses:
 *       '200':
 *         description: File deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 *       '404':
 *         description: File not found.
 */
router.delete(
  '/files/:fileId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.deleteFileSchema),
  knowledgeController.deleteFile
);

/**
 * @openapi
 * /api/v1/knowledge/stats:
 *   get:
 *     summary: Get storage statistics
 *     description: >
 *       Retrieves storage usage statistics for a given owner (user or bot),
 *       including total files, total size, and processing status counts.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Files
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *       - in: query
 *         name: ownerType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [user, bot]
 *         description: The type of the owner.
 *       - in: query
 *         name: ownerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the owner.
 *     responses:
 *       '200':
 *         description: Storage statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalFiles:
 *                   type: integer
 *                 totalSize:
 *                   type: number
 *                 statusCounts:
 *                   type: object
 *       '400':
 *         description: Bad request (e.g., missing ownerType or ownerId).
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 */
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.getStorageStatsSchema),
  knowledgeController.getStorageStats
);

// ==================== FOLDER ROUTES (USER FILES ONLY) ====================

/**
 * @openapi
 * /api/v1/knowledge/folders:
 *   post:
 *     summary: Create a new folder
 *     description: >
 *       Creates a new folder for organizing user files. Folders can be nested by providing a `parentFolderId`.
 *       This functionality is currently limited to user-owned files.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Folders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
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
 *                 description: Optional. The ID of the parent folder. If null, creates a root folder.
 *     responses:
 *       '201':
 *         description: Folder created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KnowledgeFolder'
 *       '400':
 *         description: Bad request (e.g., missing name, invalid parentFolderId).
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 */
router.post(
  '/folders',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.createFolderSchema),
  knowledgeController.createFolder
);

/**
 * @openapi
 * /api/v1/knowledge/folders:
 *   get:
 *     summary: Get folders for the current user
 *     description: >
 *       Retrieves a list of folders owned by the currently authenticated user.
 *       Can be filtered by a `parentFolderId` to get subfolders of a specific folder.
 *       If `parentFolderId` is not provided, it retrieves root-level folders.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Folders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *       - in: query
 *         name: parentFolderId
 *         schema:
 *           type: string
 *         description: Optional. The ID of the parent folder to retrieve subfolders from.
 *     responses:
 *       '200':
 *         description: A list of folders.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/KnowledgeFolder'
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 */
router.get(
  '/folders',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.getFoldersSchema),
  knowledgeController.getFolders
);

/**
 * @openapi
 * /api/v1/knowledge/folders/{folderId}:
 *   get:
 *     summary: Get a specific folder by ID
 *     description: >
 *       Retrieves the details of a single folder by its unique ID.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Folders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the folder to retrieve.
 *     responses:
 *       '200':
 *         description: The folder details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KnowledgeFolder'
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 *       '404':
 *         description: Folder not found.
 */
router.get(
  '/folders/:folderId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.getFolderByIdSchema),
  knowledgeController.getFolderById
);

/**
 * @openapi
 * /api/v1/knowledge/folders/{folderId}:
 *   patch:
 *     summary: Update a folder
 *     description: >
 *       Updates the properties of a folder, such as its name or parent folder.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Folders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
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
 *                 description: The new parent folder ID to move the folder to.
 *     responses:
 *       '200':
 *         description: Folder updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KnowledgeFolder'
 *       '400':
 *         description: Bad request (e.g., invalid data).
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 *       '404':
 *         description: Folder not found.
 */
router.patch(
  '/folders/:folderId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.updateFolderSchema),
  knowledgeController.updateFolder
);

/**
 * @openapi
 * /api/v1/knowledge/folders/{folderId}:
 *   delete:
 *     summary: Delete a folder
 *     description: >
 *       Deletes a folder. By default, this will fail if the folder is not empty.
 *       Future implementations may support recursive deletion.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Folders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the folder to delete.
 *     responses:
 *       '200':
 *         description: Folder deleted successfully.
 *       '400':
 *         description: Bad request (e.g., folder not empty).
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 *       '404':
 *         description: Folder not found.
 */
router.delete(
  '/folders/:folderId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.deleteFolderSchema),
  knowledgeController.deleteFolder
);

/**
 * @openapi
 * /api/v1/knowledge/folders/{folderId}/contents:
 *   get:
 *     summary: Get folder contents
 *     description: >
 *       Retrieves the contents of a specific folder, including both its subfolders and files.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Folders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *       - in: path
 *         name: folderId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the folder whose contents are to be retrieved. Use 'root' for the root directory.
 *     responses:
 *       '200':
 *         description: The contents of the folder.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 folders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/KnowledgeFolder'
 *                 files:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/KnowledgeFile'
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 *       '404':
 *         description: Folder not found.
 */
router.get(
  '/folders/:folderId/contents',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.getFolderContentsSchema),
  knowledgeController.getFolderContents
);

// ==================== QUERY & CONVERSATIONAL ROUTES ====================

/**
 * @openapi
 * /api/v1/knowledge/chat:
 *   post:
 *     summary: Conversational query (chat)
 *     description: >
 *       Engages in a conversation with the knowledge base. This endpoint maintains conversation history
 *       using a `conversationId` to provide contextually relevant answers.
 *       The query is performed against the documents of the specified owner.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Query
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - ownerType
 *               - ownerId
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's message or question.
 *               conversationId:
 *                 type: string
 *                 description: The ID of the ongoing conversation. A new one is created if not provided.
 *               ownerType:
 *                 type: string
 *                 enum: [user, bot]
 *                 description: The type of the knowledge base owner.
 *               ownerId:
 *                 type: string
 *                 description: The ID of the knowledge base owner.
 *               topK:
 *                 type: integer
 *                 description: The number of relevant document chunks to retrieve. Defaults to 4.
 *     responses:
 *       '200':
 *         description: The AI's response to the message.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: string
 *                 conversationId:
 *                   type: string
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *       '400':
 *         description: Bad request.
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 */
router.post(
  '/chat',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.conversationalQuerySchema),
  knowledgeController.conversationalQuery
);

/**
 * @openapi
 * /api/v1/knowledge/query:
 *   post:
 *     summary: Direct knowledge base query
 *     description: >
 *       Performs a single, stateless query against the knowledge base of a specified owner.
 *       This is suitable for one-off questions where conversation history is not needed.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Query
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *               - ownerType
 *               - ownerId
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's question.
 *               ownerType:
 *                 type: string
 *                 enum: [user, bot]
 *                 description: The type of the knowledge base owner.
 *               ownerId:
 *                 type: string
 *                 description: The ID of the knowledge base owner.
 *               topK:
 *                 type: integer
 *                 description: The number of relevant document chunks to retrieve. Defaults to 4.
 *     responses:
 *       '200':
 *         description: The answer to the query.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: string
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *       '400':
 *         description: Bad request.
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 */
router.post(
  '/query',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.queryKnowledgeSchema),
  knowledgeController.queryKnowledge
);

/**
 * @openapi
 * /api/v1/knowledge/search:
 *   post:
 *     summary: Semantic search
 *     description: >
 *       Performs a semantic search on the knowledge base to find the most relevant document chunks
 *       based on the query's meaning, without generating a natural language response.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Query
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *               - ownerType
 *               - ownerId
 *             properties:
 *               query:
 *                 type: string
 *                 description: The search query.
 *               ownerType:
 *                 type: string
 *                 enum: [user, bot]
 *                 description: The type of the knowledge base owner.
 *               ownerId:
 *                 type: string
 *                 description: The ID of the knowledge base owner.
 *               limit:
 *                 type: integer
 *                 description: The maximum number of results to return. Defaults to 5.
 *     responses:
 *       '200':
 *         description: A list of relevant document chunks.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       '400':
 *         description: Bad request.
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 */
router.post(
  '/search',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.semanticSearchSchema),
  knowledgeController.semanticSearch
);

/**
 * @openapi
 * /api/v1/knowledge/conversations/{conversationId}:
 *   get:
 *     summary: Get conversation history
 *     description: >
 *       Retrieves the message history for a specific conversation.
 *       Requires multi-tenant context via 'x-tenant-id' header.
 *     tags:
 *       - Knowledge - Query
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The tenant ID.
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to retrieve.
 *     responses:
 *       '200':
 *         description: The conversation history.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden.
 *       '404':
 *         description: Conversation not found.
 */
router.get(
  '/conversations/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(KnowledgeValidation.getConversationHistorySchema),
  knowledgeController.getConversationHistory
);

/**
 * Express router for knowledge module routes.
 * @type {express.Router}
 */
export const knowledgeRoutes = router;