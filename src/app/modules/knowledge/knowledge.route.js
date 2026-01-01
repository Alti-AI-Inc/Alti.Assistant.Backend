import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { knowledgeController } from './knowledge.controller.js';
import { KnowledgeValidation } from './knowledge.validation.js';
import { uploadKnowledge } from './middlewares/uploadKnowledge.js';

const router = express.Router();

// ==================== FILE ROUTES ====================

/**
 * Upload file to knowledge system
 * POST /api/v1/knowledge/upload
 * Supports both user files and bot files with ownerType parameter
 */
router.post(
  '/upload',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  uploadKnowledge.single('file'),
  validateRequest(KnowledgeValidation.uploadFileSchema),
  knowledgeController.uploadFile
);

/**
 * Process file with RAG system
 * POST /api/v1/knowledge/process/:fileId
 */
router.post(
  '/process/:fileId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(KnowledgeValidation.processFileSchema),
  knowledgeController.processFile
);

/**
 * Get files by owner
 * GET /api/v1/knowledge/files?ownerType=user&ownerId=xxx
 */
router.get(
  '/files',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(KnowledgeValidation.getFilesSchema),
  knowledgeController.getFiles
);

/**
 * Get file by ID
 * GET /api/v1/knowledge/files/:fileId?ownerType=user&ownerId=xxx
 */
router.get(
  '/files/:fileId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(KnowledgeValidation.getFileByIdSchema),
  knowledgeController.getFileById
);

/**
 * Delete file
 * DELETE /api/v1/knowledge/files/:fileId
 */
router.delete(
  '/files/:fileId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(KnowledgeValidation.deleteFileSchema),
  knowledgeController.deleteFile
);

/**
 * Get storage statistics
 * GET /api/v1/knowledge/stats?ownerType=user&ownerId=xxx
 */
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(KnowledgeValidation.getStorageStatsSchema),
  knowledgeController.getStorageStats
);

// ==================== FOLDER ROUTES (USER FILES ONLY) ====================

/**
 * Create folder
 * POST /api/v1/knowledge/folders
 */
router.post(
  '/folders',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(KnowledgeValidation.createFolderSchema),
  knowledgeController.createFolder
);

/**
 * Get folders
 * GET /api/v1/knowledge/folders?parentFolderId=xxx
 */
router.get(
  '/folders',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(KnowledgeValidation.getFoldersSchema),
  knowledgeController.getFolders
);

/**
 * Get folder by ID
 * GET /api/v1/knowledge/folders/:folderId
 */
router.get(
  '/folders/:folderId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(KnowledgeValidation.getFolderByIdSchema),
  knowledgeController.getFolderById
);

/**
 * Update folder
 * PATCH /api/v1/knowledge/folders/:folderId
 */
router.patch(
  '/folders/:folderId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(KnowledgeValidation.updateFolderSchema),
  knowledgeController.updateFolder
);

/**
 * Delete folder
 * DELETE /api/v1/knowledge/folders/:folderId
 */
router.delete(
  '/folders/:folderId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(KnowledgeValidation.deleteFolderSchema),
  knowledgeController.deleteFolder
);

/**
 * Get folder contents (subfolders + files)
 * GET /api/v1/knowledge/folders/:folderId/contents
 */
router.get(
  '/folders/:folderId/contents',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(KnowledgeValidation.getFolderContentsSchema),
  knowledgeController.getFolderContents
);

// ==================== QUERY & CONVERSATIONAL ROUTES ====================

/**
 * Conversational query - Chat with your knowledge base
 * POST /api/v1/knowledge/chat
 * Body: { message, conversationId, ownerType, ownerId, topK }
 */
router.post(
  '/chat',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  knowledgeController.conversationalQuery
);

/**
 * Direct query - One-off question
 * POST /api/v1/knowledge/query
 * Body: { query, ownerType, ownerId, topK }
 */
router.post(
  '/query',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  knowledgeController.queryKnowledge
);

/**
 * Semantic search - Find relevant documents
 * POST /api/v1/knowledge/search
 * Body: { query, ownerType, ownerId, limit }
 */
router.post(
  '/search',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  knowledgeController.semanticSearch
);

/**
 * Get conversation history
 * GET /api/v1/knowledge/conversations/:conversationId
 */
router.get(
  '/conversations/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  knowledgeController.getConversationHistory
);

export const knowledgeRoutes = router;
