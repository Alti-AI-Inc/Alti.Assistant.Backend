import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { creativeWritingController } from './creative_writing.controller.js';
import { CreativeWritingValidation } from './creative_writing.validation.js';

const router = express.Router();

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language creative writing requests
 */
router.post(
  '/assistant',
  optionalAuth(),
  checkDailyRequestLimit,
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(CreativeWritingValidation.conversationalRequestSchema),
  creativeWritingController.conversationalAssistant
);

/**
 * Get conversation history
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(CreativeWritingValidation.getConversationHistorySchema),
  creativeWritingController.getConversationHistory
);

export const creativeWritingRoutes = router;
