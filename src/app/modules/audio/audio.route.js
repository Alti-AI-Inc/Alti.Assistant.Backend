import express from 'express';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import { planLimitMiddleware } from '../billing/planLimit.middleware.js';
import { audioController } from './audio.controller.js';
import { audioValidation } from './audio.validation.js';

const router = express.Router();

router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  planLimitMiddleware('audio'),
  createRateLimiter(10, 15), // 10 audio requests per 15 minutes
  validateRequest(audioValidation.audioGenerationSchema),
  audioController.generateAudio
);

export const audioRoutes = router;
