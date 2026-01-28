import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { codeController } from './code.controller.js';
import { CodeValidation } from './code.validation.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

const router = express.Router();

console.log('Code routes initialized');

// Code assistant endpoint - open to all (with optional auth)
router.post(
  '/assistant',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  createRateLimiter(30, 15), // 30 code requests per 15 minutes (applies to all users)
  validateRequest(CodeValidation.codeQuerySchema),
  codeController.performCodeTask
);

// Get code statistics - authenticated users only
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER), // Keep regular auth for stats
  extractTenantContext,
  codeController.getCodeStats
);

export const codeRoutes = router;