import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { brainstormController } from './brainstorm.controller.js';
import { BrainstormValidation } from './brainstorm.validation.js';

const router = express.Router();

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language brainstorming requests
 */
router.post(
  '/assistant',
  optionalAuth(),
  checkDailyRequestLimit,
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(BrainstormValidation.conversationalBrainstormSchema),
  brainstormController.conversationalAssistant
);

/**
 * Structured brainstorm generation endpoint
 * For programmatic access with all parameters specified
 */
router.post(
  '/generate',
  optionalAuth(),
  // createRateLimiter(20, 15), // 20 requests per 15 minutes
  validateRequest(BrainstormValidation.structuredBrainstormSchema),
  brainstormController.generateBrainstorm
);

/**
 * Get conversation history
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(BrainstormValidation.getConversationHistorySchema),
  brainstormController.getConversationHistory
);

/**
 * Export brainstorm session
 */
router.post(
  '/export',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  // createRateLimiter(10, 15), // 10 exports per 15 minutes
  validateRequest(BrainstormValidation.exportBrainstormSchema),
  brainstormController.exportBrainstorm
);

/**
 * Refine existing brainstorm
 */
router.post(
  '/refine',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  // createRateLimiter(20, 15), // 20 refinements per 15 minutes
  validateRequest(BrainstormValidation.refineBrainstormSchema),
  brainstormController.refineBrainstorm
);

export const brainstormRoutes = router;
