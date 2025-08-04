import express from "express";
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { deepResearchController } from "./deep_research.controller.js";
import { DeepResearchValidation } from "./deep_research.validation.js";

const router = express.Router();

// Deep research assistant endpoint - open to all (with optional auth)
router.post(
  '/assistant',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  createRateLimiter(10, 15), // 10 deep research requests per 15 minutes (due to heavy computational cost)
  validateRequest(DeepResearchValidation.deepResearchQuerySchema),
  deepResearchController.performDeepResearch
);

// Get deep research statistics - authenticated users only
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER), // Keep regular auth for stats
  deepResearchController.getDeepResearchStats
);

// Download PDF endpoint - open to all for guest access
router.get(
  '/download-pdf/:savedId',
  optionalAuth(), // Allow guest access to download PDFs
  deepResearchController.downloadPDF
);

export const deepResearchRoute = router;
