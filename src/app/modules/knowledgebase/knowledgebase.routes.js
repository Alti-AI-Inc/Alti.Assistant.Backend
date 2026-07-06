import express from 'express';
import multer from 'multer';
import path from 'path';
import { knowledgebaseController } from './knowledgebase.controller.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

const router = express.Router();

import { GCSStorageEngine } from '../../middlewares/uploder/uploder.js';

/**
 * @constant {multer.StorageEngine} storage
 * @description Configures the storage engine for multer.
 * Files are streamed directly to Google Cloud Storage.
 */
const storage = new GCSStorageEngine({ folder: 'knowledgebase' });

/**
 * @function fileFilter
 * @description A multer filter function that accepts all incoming files.
 * This can be extended to filter by file type (mimetype) if needed.
 * @param {object} req - The Express request object.
 * @param {object} file - The file object provided by multer.
 * @param {function} cb - The callback function to signal acceptance or rejection of the file.
 */
const fileFilter = (req, file, cb) => {
  // Log the file details for debugging
  console.log('File upload attempt:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    fieldname: file.fieldname,
  });

  // Allow all file types
  cb(null, true);
};

/**
 * @constant {multer.Instance} upload
 * @description Multer instance configured for handling file uploads.
 * It uses the defined `storage` and `fileFilter`, and sets a file size limit of 2GB.
 */
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2000 * 1024 * 1024, // 2GB limit for large media files
  },
});

// Routes

/**
 * @openapi
 * /knowledgebase/create:
 *   post:
 *     tags:
 *       - KnowledgeBase
 *     summary: Create a new knowledge base
 *     description: |
 *       Creates a new knowledge base for the authenticated user's tenant.
 *       Requires the user to be authenticated and the RAG feature to be enabled for the tenant.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the knowledge base.
 *               description:
 *                 type: string
 *                 description: A brief description of the knowledge base.
 *             required:
 *               - name
 *     responses:
 *       '201':
 *         description: Knowledge base created successfully.
 *       '400':
 *         description: Bad request, missing required fields.
 *       '401':
 *         description: Unauthorized, user not authenticated.
 *       '403':
 *         description: Forbidden, RAG feature not enabled for the tenant.
 */
router.post(
  '/create',
  auth(),
  extractTenantContext,
  checkRAGFeature,
  knowledgebaseController.createKnowledgeBase
);

/**
 * @openapi
 * /knowledgebase/list:
 *   get:
 *     tags:
 *       - KnowledgeBase
 *     summary: List user's knowledge bases
 *     description: |
 *       Retrieves a list of all knowledge bases associated with the authenticated user's tenant.
 *       Requires user authentication.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: A list of knowledge bases.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *       '401':
 *         description: Unauthorized, user not authenticated.
 */
router.get(
  '/list',
  auth(),
  extractTenantContext,
  knowledgebaseController.getUserKnowledgeBases
);

/**
 * @openapi
 * /knowledgebase/upload:
 *   post:
 *     tags:
 *       - KnowledgeBase
 *     summary: Upload files to a knowledge base
 *     description: |
 *       Uploads one or more files to be processed and added to a specified knowledge base.
 *       This endpoint supports `multipart/form-data`.
 *       Authentication is optional, allowing for API key-based uploads.
 *       Requires tenant context, checks tenant storage limits, and verifies the RAG feature is enabled.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               knowledgebaseId:
 *                 type: string
 *                 description: The ID of the knowledge base to upload files to.
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: The file(s) to upload.
 *     responses:
 *       '200':
 *         description: Files uploaded and processing started successfully.
 *       '400':
 *         description: Bad request, missing knowledgebaseId or files.
 *       '403':
 *         description: Forbidden, RAG feature not enabled or storage limit exceeded.
 *       '413':
 *         description: Payload too large, file size exceeds the 2GB limit.
 */
router.post(
  '/upload',
  optionalAuth(),
  extractTenantContext,
  checkStorageLimit,
  upload.any(),
  checkRAGFeature,
  knowledgebaseController.uploadFile
);

/**
 * @openapi
 * /knowledgebase/files:
 *   get:
 *     tags:
 *       - KnowledgeBase
 *     summary: List files in a knowledge base
 *     description: |
 *       Retrieves a list of files associated with a specific knowledge base for the authenticated user's tenant.
 *       Requires user authentication.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: knowledgebaseId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the knowledge base to retrieve files from.
 *     responses:
 *       '200':
 *         description: A list of files.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   status:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *       '400':
 *         description: Bad request, missing knowledgebaseId.
 *       '401':
 *         description: Unauthorized, user not authenticated.
 *       '404':
 *         description: Knowledge base not found.
 */
router.get(
  '/files',
  auth(),
  extractTenantContext,
  knowledgebaseController.getUserFiles
);

/**
 * @openapi
 * /knowledgebase/files/{fileId}:
 *   delete:
 *     tags:
 *       - KnowledgeBase
 *     summary: Delete a file
 *     description: |
 *       Deletes a specific file from a knowledge base and its associated vector embeddings.
 *       Requires user authentication and ownership of the file within the tenant.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the file to delete.
 *     responses:
 *       '204':
 *         description: File deleted successfully.
 *       '401':
 *         description: Unauthorized, user not authenticated.
 *       '403':
 *         description: Forbidden, user does not have permission to delete this file.
 *       '404':
 *         description: File not found.
 */
router.delete(
  '/files/:fileId',
  auth(),
  extractTenantContext,
  knowledgebaseController.deleteFile
);

/**
 * @openapi
 * /knowledgebase/{knowledgebaseId}:
 *   delete:
 *     tags:
 *       - KnowledgeBase
 *     summary: Delete a knowledge base
 *     description: |
 *       Deletes an entire knowledge base, including all its associated files and vector embeddings.
 *       This is a destructive operation.
 *       Requires user authentication and ownership of the knowledge base within the tenant.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: knowledgebaseId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the knowledge base to delete.
 *     responses:
 *       '204':
 *         description: Knowledge base deleted successfully.
 *       '401':
 *         description: Unauthorized, user not authenticated.
 *       '403':
 *         description: Forbidden, user does not have permission to delete this knowledge base.
 *       '404':
 *         description: Knowledge base not found.
 */
router.delete(
  '/:knowledgebaseId',
  auth(),
  extractTenantContext,
  knowledgebaseController.deleteKnowledgeBase
);

/**
 * @openapi
 * /knowledgebase/invoke-rag:
 *   post:
 *     tags:
 *       - KnowledgeBase
 *     summary: Invoke the RAG system
 *     description: |
 *       Sends a query to the Retrieval-Augmented Generation (RAG) system for a specific knowledge base.
 *       This endpoint is used for direct, stateless queries against the knowledge base.
 *       Authentication is optional, allowing for API key-based access.
 *       Requires tenant context and the RAG feature to be enabled.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               knowledgebaseId:
 *                 type: string
 *                 description: The ID of the knowledge base to query.
 *               query:
 *                 type: string
 *                 description: The user's question or query.
 *             required:
 *               - knowledgebaseId
 *               - query
 *     responses:
 *       '200':
 *         description: RAG system response.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: string
 *                   description: The generated answer.
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fileName:
 *                         type: string
 *                       content:
 *                         type: string
 *       '400':
 *         description: Bad request, missing required fields.
 *       '403':
 *         description: Forbidden, RAG feature not enabled for the tenant.
 *       '404':
 *         description: Knowledge base not found.
 */
router.post(
  '/invoke-rag',
  optionalAuth(),
  extractTenantContext,
  checkRAGFeature,
  knowledgebaseController.invokeRagSystem
);

/**
 * @openapi
 * /knowledgebase/chat:
 *   post:
 *     tags:
 *       - KnowledgeBase
 *     summary: Chat with a knowledge base
 *     description: |
 *       Sends a message to a conversational chat session with a knowledge base.
 *       Maintains conversation history for context-aware responses.
 *       Requires user authentication and the RAG feature to be enabled.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               knowledgebaseId:
 *                 type: string
 *                 description: The ID of the knowledge base to chat with.
 *               conversationId:
 *                 type: string
 *                 description: The ID of the existing conversation. If not provided, a new one is created.
 *               message:
 *                 type: string
 *                 description: The user's message.
 *             required:
 *               - knowledgebaseId
 *               - message
 *     responses:
 *       '200':
 *         description: Chat response from the knowledge base.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: string
 *                   description: The generated chat reply.
 *                 conversationId:
 *                   type: string
 *                   description: The ID of the conversation session.
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *       '400':
 *         description: Bad request, missing required fields.
 *       '401':
 *         description: Unauthorized, user not authenticated.
 *       '403':
 *         description: Forbidden, RAG feature not enabled for the tenant.
 *       '404':
 *         description: Knowledge base not found.
 */
router.post(
  '/chat',
  auth(),
  extractTenantContext,
  checkRAGFeature,
  knowledgebaseController.chatWithKnowledgeBase
);

/**
 * @openapi
 * /knowledgebase/{knowledgebaseId}/conversations:
 *   get:
 *     tags:
 *       - KnowledgeBase
 *     summary: Get conversations for a knowledge base
 *     description: |
 *       Retrieves a list of all chat conversations associated with a specific knowledge base for the authenticated user.
 *       Requires user authentication.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: knowledgebaseId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the knowledge base.
 *     responses:
 *       '200':
 *         description: A list of conversations.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   title:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *       '401':
 *         description: Unauthorized, user not authenticated.
 *       '404':
 *         description: Knowledge base not found.
 */
router.get(
  '/:knowledgebaseId/conversations',
  auth(),
  extractTenantContext,
  knowledgebaseController.getKnowledgeBaseConversations
);

/**
 * @openapi
 * /knowledgebase/conversations/{conversationId}/messages:
 *   get:
 *     tags:
 *       - KnowledgeBase
 *     summary: Get messages for a conversation
 *     description: |
 *       Retrieves all messages within a specific chat conversation.
 *       Requires user authentication and access to the conversation.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the conversation.
 *     responses:
 *       '200':
 *         description: A list of messages in the conversation.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   role:
 *                     type: string
 *                     enum: [user, assistant]
 *                   content:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *       '401':
 *         description: Unauthorized, user not authenticated.
 *       '404':
 *         description: Conversation not found.
 */
router.get(
  '/conversations/:conversationId/messages',
  auth(),
  extractTenantContext,
  knowledgebaseController.getConversationMessages
);

export default router;