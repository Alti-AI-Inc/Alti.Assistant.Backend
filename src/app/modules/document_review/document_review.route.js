import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { documentReviewController } from './document_review.controller.js';
import { DocumentReviewValidation } from './document_review.validation.js';
import { uploadDocumentReview } from './middlewares/uploadDocumentReview.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

const router = express.Router();

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language requests intelligently with file upload
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  uploadDocumentReview.single('file'),
  checkRAGFeature,
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(DocumentReviewValidation.conversationalRequestSchema),
  documentReviewController.conversationalAssistant
);

/**
 * Direct review endpoint (non-conversational)
 * For programmatic access with all parameters
 */
router.post(
  '/review',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  uploadDocumentReview.single('file'),
  checkRAGFeature,
  // createRateLimiter(20, 15), // 20 reviews per 15 minutes
  validateRequest(DocumentReviewValidation.reviewDocumentSchema),
  documentReviewController.reviewDocument
);

/**
 * Get conversation history
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext, // Extract tenant context after auth
  validateRequest(DocumentReviewValidation.getConversationHistorySchema),
  documentReviewController.getConversationHistory
);

export const documentReviewRoutes = router;
