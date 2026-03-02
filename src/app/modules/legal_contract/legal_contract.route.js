import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { legalContractController } from './legal_contract.controller.js';
import { LegalContractValidation } from './legal_contract.validation.js';
import { uploadLegalContract } from './middlewares/uploadLegalContract.js';
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
  uploadLegalContract.single('file'),
  checkRAGFeature,
  // createRateLimiter(20, 15), // 20 requests per 15 minutes
  validateRequest(LegalContractValidation.conversationalRequestSchema),
  legalContractController.conversationalAssistant
);

/**
 * Direct contract generation endpoint (non-conversational)
 * For programmatic access with all parameters provided
 */
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext, // Extract tenant context after auth
  checkDailyRequestLimit,
  // createRateLimiter(10, 15), // 10 generations per 15 minutes
  validateRequest(LegalContractValidation.generateContractSchema),
  legalContractController.generateContract
);

/**
 * Get conversation history
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext, // Extract tenant context after auth
  validateRequest(LegalContractValidation.getConversationHistorySchema),
  legalContractController.getConversationHistory
);

/**
 * Download generated contract in specified format
 */
router.get(
  '/download/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext, // Extract tenant context after auth
  validateRequest(LegalContractValidation.downloadContractSchema),
  legalContractController.downloadContract
);

/**
 * Modify existing contract
 */
router.post(
  '/modify',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext, // Extract tenant context after auth
  validateRequest(LegalContractValidation.modifyContractSchema),
  legalContractController.modifyContract
);

export const legalContractRoutes = router;
