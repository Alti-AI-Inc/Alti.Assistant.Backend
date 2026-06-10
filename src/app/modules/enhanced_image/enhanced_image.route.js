import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { enhancedImageController } from './enhanced_image.controller.js';
import { EnhancedImageValidation } from './enhanced_image.validation.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';

const router = express.Router();

// Generate image directly with prompt - open to all (with optional auth)
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(20, 15), // 20 image generation requests per 15 minutes - Re-enabled rate limiting
  validateRequest(EnhancedImageValidation.generateImageSchema),
  enhancedImageController.generateImageDirect
);

// Edit image with prompt and base64 image - open to all (with optional auth)
router.post(
  '/edit',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(20, 15), // 20 image editing requests per 15 minutes - Re-enabled rate limiting
  validateRequest(EnhancedImageValidation.editImageSchema),
  enhancedImageController.editImage
);

// Analyze image generation intent - open to all
router.post(
  '/analyze-intent',
  createRateLimiter(30, 15), // Rate limit intent analysis to prevent LLM cost runaway
  validateRequest(EnhancedImageValidation.analyzeIntentSchema),
  enhancedImageController.analyzeIntent
);

// Analyze image intent with context - open to all (with optional auth)
router.post(
  '/analyze-image-intent',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(20, 15), // Rate limit expensive multimodal image analysis
  validateRequest(EnhancedImageValidation.analyzeImageIntentSchema), // Re-enabled validation
  enhancedImageController.analyzeImageIntent
);

// Evaluate prompt quality - open to all (with optional auth)
router.post(
  '/evaluate-prompt',
  optionalAuth(),
  extractTenantContext,
  createRateLimiter(30, 15), // Rate limit prompt evaluation LLM calls
  validateRequest(EnhancedImageValidation.evaluatePromptSchema), // Re-enabled validation
  enhancedImageController.evaluatePrompt
);

// Add detail to conversation and re-evaluate - open to all (with optional auth)
router.post(
  '/add-detail',
  optionalAuth(),
  extractTenantContext,
  createRateLimiter(30, 15), // Rate limit conversation detail additions
  validateRequest(EnhancedImageValidation.addDetailSchema),
  enhancedImageController.addDetail
);

// Finalize prompt - build enhanced prompt from conversation - open to all (with optional auth)
router.post(
  '/finalize-prompt',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(30, 15), // Rate limit prompt finalization LLM calls
  validateRequest(EnhancedImageValidation.finalizePromptSchema),
  enhancedImageController.finalizePrompt
);

// Build enhanced prompt from conversation - open to all (with optional auth)
router.post(
  '/build-enhanced-prompt',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(30, 15), // Rate limit prompt building LLM calls
  validateRequest(EnhancedImageValidation.buildEnhancedPromptSchema),
  enhancedImageController.buildEnhancedPrompt
);

// Generate image from conversation history - open to all (with optional auth)
router.post(
  '/generate-from-conversation',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(20, 15), // Re-enabled rate limiting
  validateRequest(EnhancedImageValidation.generateFromConversationSchema),
  enhancedImageController.generateFromConversation
);

// Get image statistics - authenticated users only
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(100, 15), // Rate limit stats queries to prevent DB abuse
  enhancedImageController.getImageStats
);

export const enhancedImageRoute = router;