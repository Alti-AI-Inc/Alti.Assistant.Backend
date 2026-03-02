import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { planGeneratorController } from './plan_generator.controller.js';
import { PlanGeneratorValidation } from './plan_generator.validation.js';
import { uploadPlanFiles } from './middlewares/uploadPlanFiles.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

const router = express.Router();

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language requests intelligently with optional file upload
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  uploadPlanFiles.single('file'),
  checkRAGFeature,
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(PlanGeneratorValidation.conversationalRequestSchema),
  planGeneratorController.conversationalAssistant
);

/**
 * Async conversational assistant endpoint
 * Starts plan generation asynchronously and returns task ID
 * Use /task/:taskId to check status and get results
 */
router.post(
  '/assistant/async',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  uploadPlanFiles.single('file'),
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(PlanGeneratorValidation.conversationalRequestSchema),
  planGeneratorController.conversationalAssistantAsync
);

/**
 * Get task status and result
 * Check the progress and result of an async plan generation task
 */
router.get(
  '/task/:taskId',
  optionalAuth(),
  planGeneratorController.getTaskStatus
);

/**
 * Direct plan generation endpoint (non-conversational)
 * For programmatic access with all parameters
 */
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  // createRateLimiter(20, 15), // 20 generations per 15 minutes
  validateRequest(PlanGeneratorValidation.generatePlanSchema),
  planGeneratorController.generatePlan
);

/**
 * Brainstorm only endpoint
 * Generate brainstorming insights without full plan
 */
router.post(
  '/brainstorm',
  optionalAuth(),
  // createRateLimiter(30, 15), // 30 brainstorms per 15 minutes
  validateRequest(PlanGeneratorValidation.brainstormSchema),
  planGeneratorController.brainstormIdea
);

/**
 * Export plan endpoint
 * Export generated plan in various formats (PDF, DOCX, JSON, Markdown)
 */
router.post(
  '/export',
  optionalAuth(),
  // createRateLimiter(20, 15), // 20 exports per 15 minutes
  validateRequest(PlanGeneratorValidation.exportPlanSchema),
  planGeneratorController.exportPlan
);

/**
 * Get conversation history
 * Retrieve full conversation and plan data
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(PlanGeneratorValidation.getConversationHistorySchema),
  planGeneratorController.getConversationHistory
);

export const planGeneratorRoutes = router;
