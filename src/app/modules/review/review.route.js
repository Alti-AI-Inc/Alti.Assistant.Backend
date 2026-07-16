import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { uploadRewrite } from './middlewares/uploadRewrite.js';
import { rewriteController } from './review.controller.js';
import { RewriteValidation } from './review.validation.js';

const router = express.Router();

router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  uploadRewrite.single('file'),
  createRateLimiter(30, 15), // 30 requests per 15 minutes - Uncommented for performance/security
  validateRequest(RewriteValidation.conversationalRequestSchema),
  rewriteController.conversationalAssistant
);

router.post(
  '/rewrite',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  uploadRewrite.single('file'),
  checkRAGFeature,
  createRateLimiter(20, 15), // 20 rewrites per 15 minutes - Uncommented for performance/security
  validateRequest(RewriteValidation.rewriteContentSchema),
  rewriteController.rewriteContent
);

router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(RewriteValidation.getConversationHistorySchema),
  rewriteController.getConversationHistory
);

export const reviewRoutes = router;
