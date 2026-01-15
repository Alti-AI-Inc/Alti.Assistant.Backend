import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { documentController } from './document.controller.js';
import { DocumentValidation } from './document.validation.js';

const router = express.Router();

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language requests intelligently
 */
router.post(
  '/assistant',
  optionalAuth(),
  checkDailyRequestLimit,
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(DocumentValidation.conversationalRequestSchema),
  documentController.conversationalAssistant
);

/**
 * Direct generation endpoint (non-conversational)
 * For programmatic access with all parameters
 */
router.post(
  '/generate',
  optionalAuth(),
  // createRateLimiter(20, 15), // 20 generations per 15 minutes
  validateRequest(DocumentValidation.generateDocumentSchema),
  documentController.generateDocument
);

/**
 * Export existing document to different format
 */
router.post(
  '/export',
  optionalAuth(),
  // createRateLimiter(20, 15), // 20 exports per 15 minutes
  validateRequest(DocumentValidation.exportDocumentSchema),
  documentController.exportDocument
);

/**
 * Edit/refine existing document
 */
router.post(
  '/edit',
  optionalAuth(),
  // createRateLimiter(20, 15), // 20 edits per 15 minutes
  validateRequest(DocumentValidation.editDocumentSchema),
  documentController.editDocument
);

export default router;
