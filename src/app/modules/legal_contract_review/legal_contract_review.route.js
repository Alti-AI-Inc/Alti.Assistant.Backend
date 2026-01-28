import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { legalContractReviewController } from './legal_contract_review.controller.js';
import { LegalContractReviewValidation } from './legal_contract_review.validation.js';
import { uploadLegalContractReview } from './middlewares/uploadLegalContractReview.js';

const router = express.Router();

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language requests intelligently with file upload or text input
 * User can upload a contract file or paste contract text
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext, // Extract tenant context after auth
  checkDailyRequestLimit,
  uploadLegalContractReview.single('file'),
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(LegalContractReviewValidation.conversationalRequestSchema),
  legalContractReviewController.conversationalAssistant
);

/**
 * Direct review endpoint (non-conversational)
 * For programmatic access with all parameters
 * Suitable for API integrations
 */
router.post(
  '/review',
  optionalAuth(),
  extractTenantContext, // Extract tenant context after auth
  uploadLegalContractReview.single('file'),
  // createRateLimiter(20, 15), // 20 reviews per 15 minutes
  validateRequest(LegalContractReviewValidation.reviewContractSchema),
  legalContractReviewController.reviewContract
);

/**
 * Get conversation history
 * Retrieves all messages and metadata from a contract review conversation
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext, // Extract tenant context after auth
  validateRequest(LegalContractReviewValidation.getConversationHistorySchema),
  legalContractReviewController.getConversationHistory
);

export const legalContractReviewRoutes = router;
