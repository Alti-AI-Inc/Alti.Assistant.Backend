import express from "express";
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { searchController } from "./search.controller.js";
import { SearchValidation } from "./search.validation.js";

const router = express.Router();

router.post(
  '/assistant',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  createRateLimiter(30, 15), // 30 search requests per 15 minutes
  validateRequest(SearchValidation.searchQuerySchema),
  searchController.performSearch
);

// Get search statistics
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  searchController.getSearchStats
);

export const searchRoute = router;