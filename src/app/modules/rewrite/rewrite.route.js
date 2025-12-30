import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { rewriteController } from './rewrite.controller.js';
import { RewriteValidation } from './rewrite.validation.js';
import { uploadRewrite } from './middlewares/uploadRewrite.js';

const router = express.Router();

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language requests intelligently with file upload or direct text
 */
router.post(
  '/assistant',
  optionalAuth(),
  uploadRewrite.single('file'),
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(RewriteValidation.conversationalRequestSchema),
  rewriteController.conversationalAssistant
);

/**
 * Direct rewrite endpoint (non-conversational)
 * For programmatic access with all parameters
 */
router.post(
  '/rewrite',
  optionalAuth(),
  uploadRewrite.single('file'),
  // createRateLimiter(20, 15), // 20 rewrites per 15 minutes
  validateRequest(RewriteValidation.rewriteContentSchema),
  rewriteController.rewriteContent
);

/**
 * Get conversation history
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(RewriteValidation.getConversationHistorySchema),
  rewriteController.getConversationHistory
);

export const rewriteRoutes = router;
