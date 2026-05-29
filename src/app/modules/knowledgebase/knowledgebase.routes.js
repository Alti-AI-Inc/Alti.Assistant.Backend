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

import os from 'os';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, os.tmpdir());
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

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

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2000 * 1024 * 1024, // 2GB limit for large media files
  },
});

// Routes
router.post(
  '/create',
  auth(),
  extractTenantContext,
  checkRAGFeature,
  knowledgebaseController.createKnowledgeBase
);
router.get(
  '/list',
  auth(),
  extractTenantContext,
  knowledgebaseController.getUserKnowledgeBases
);
router.post(
  '/upload',
  optionalAuth(),
  extractTenantContext,
  checkStorageLimit,
  upload.any(),
  checkRAGFeature,
  knowledgebaseController.uploadFile
);
router.get(
  '/files',
  auth(),
  extractTenantContext,
  knowledgebaseController.getUserFiles
);
router.delete(
  '/files/:fileId',
  auth(),
  extractTenantContext,
  knowledgebaseController.deleteFile
);
router.delete(
  '/:knowledgebaseId',
  auth(),
  extractTenantContext,
  knowledgebaseController.deleteKnowledgeBase
);
router.post(
  '/invoke-rag',
  optionalAuth(),
  extractTenantContext,
  checkRAGFeature,
  knowledgebaseController.invokeRagSystem
);
router.post(
  '/chat',
  auth(),
  extractTenantContext,
  checkRAGFeature,
  knowledgebaseController.chatWithKnowledgeBase
);
router.get(
  '/:knowledgebaseId/conversations',
  auth(),
  extractTenantContext,
  knowledgebaseController.getKnowledgeBaseConversations
);
router.get(
  '/conversations/:conversationId/messages',
  auth(),
  extractTenantContext,
  knowledgebaseController.getConversationMessages
);

export default router;
