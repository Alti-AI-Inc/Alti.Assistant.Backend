import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { articleWriterController } from './article_writer.controller.js';
import { ArticleWriterValidation } from './article_writer.validation.js';
import { uploadArticleFile } from './middlewares/uploadArticleFile.js';

const router = express.Router();

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language requests intelligently with file upload
 */
router.post(
  '/assistant',
  optionalAuth(),
  uploadArticleFile.single('file'),
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(ArticleWriterValidation.conversationalRequestSchema),
  articleWriterController.conversationalAssistant
);

/**
 * Get conversation history
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ArticleWriterValidation.getConversationHistorySchema),
  articleWriterController.getConversationHistory
);

export const articleWriterRoutes = router;
