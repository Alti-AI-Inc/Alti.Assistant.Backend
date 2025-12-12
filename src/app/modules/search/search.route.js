import express from "express";
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { searchController } from "./search.controller.js";
import { SearchValidation } from "./search.validation.js";

const router = express.Router();

// Search assistant endpoint - open to all (with optional auth)
router.post(
  '/assistant_v2',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  // createRateLimiter(30, 15), // 30 search requests per 15 minutes (applies to all users)
  validateRequest(SearchValidation.searchQuerySchema),
  searchController.performSearch
);

// Dedicated code generation endpoint - Always uses Claude Sonnet 4.5
router.post(
  '/code',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  // createRateLimiter(20, 15), // 20 code generation requests per 15 minutes
  validateRequest(SearchValidation.searchQuerySchema),
  searchController.generateCode
);

// Dedicated writing endpoint - Uses intelligent routing (Claude for writing tasks)
router.post(
  '/writing',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  // createRateLimiter(20, 15), // 20 writing requests per 15 minutes
  validateRequest(SearchValidation.searchQuerySchema),
  searchController.generateWriting
);

// Get search statistics - authenticated users only
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER), // Keep regular auth for stats
  searchController.getSearchStats
);

// TEST ENDPOINT - Native grounding only (no smart routing)
// This endpoint uses ONLY Google's native grounding search for testing/comparison
router.post(
  '/assistant',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  // createRateLimiter(30, 15), // 30 search requests per 15 minutes
  validateRequest(SearchValidation.searchQuerySchema),
  searchController.performNativeGroundingSearch
);

export const searchRoute = router;