import express from 'express';
import multer from 'multer';
import path from 'path';
import { knowledgebaseController } from './knowledgebase.controller.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store in memory for now

const fileFilter = (req, file, cb) => {
  // Log the file details for debugging
  console.log('File upload attempt:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    fieldname: file.fieldname
  });

  // Allow all file types
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Routes
router.post('/create', auth(), knowledgebaseController.createKnowledgeBase);
router.get('/list', auth(), knowledgebaseController.getUserKnowledgeBases);
router.post('/upload', optionalAuth(), upload.any(), knowledgebaseController.uploadFile);
router.get('/files', auth(), knowledgebaseController.getUserFiles);
router.post('/invoke-rag', optionalAuth(), knowledgebaseController.invokeRagSystem);
router.post('/chat', auth(), knowledgebaseController.chatWithKnowledgeBase);
router.get('/:knowledgebaseId/conversations', auth(), knowledgebaseController.getKnowledgeBaseConversations);
router.get('/conversations/:conversationId/messages', auth(), knowledgebaseController.getConversationMessages);

export default router;