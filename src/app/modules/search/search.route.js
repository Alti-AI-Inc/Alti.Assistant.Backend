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
  '/assistant',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  createRateLimiter(30, 15), // 30 search requests per 15 minutes (applies to all users)
  validateRequest(SearchValidation.searchQuerySchema),
  searchController.performSearch
);

// Get search statistics - authenticated users only
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER), // Keep regular auth for stats
  searchController.getSearchStats
);

export const searchRoute = router;