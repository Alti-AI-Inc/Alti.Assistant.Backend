import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { videoController } from './video.controller.js';
import { VideoValidation } from './video.validation.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';

const router = express.Router();

// Video generation endpoint (optional auth)
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(10, 15), // 10 video requests per 15 minutes
  validateRequest(VideoValidation.videoGenerationSchema),
  videoController.generateVideo
);

router.post(
  '/operations',
  optionalAuth(),
  extractTenantContext,
  // createRateLimiter(20, 1), // 20 requests per 1 minute
  videoController.getOperationStatus
);

// Video stats (auth only)
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  videoController.getVideoStats
);

// Get conversation (guest-compatible)
router.get(
  '/conversation/:conversationId',
  optionalAuth(),
  extractTenantContext,
  validateRequest(VideoValidation.conversationSchema),
  videoController.getVideoConversation
);

// Guest conversations by guest user id
router.get(
  '/guest/:guestUserId/conversations',
  optionalAuth(),
  extractTenantContext,
  validateRequest(VideoValidation.guestUserSchema),
  videoController.getGuestConversations
);

export const videoRoutes = router;
