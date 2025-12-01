import express from "express";
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { enhancedImageController } from "./enhanced_image.controller.js";
import { EnhancedImageValidation } from "./enhanced_image.validation.js";

const router = express.Router();

// Generate image directly with prompt - open to all (with optional auth)
router.post(
  '/generate',
  optionalAuth(),
  // createRateLimiter(20, 15), // 20 image generation requests per 15 minutes
  validateRequest(EnhancedImageValidation.generateImageSchema),
  enhancedImageController.generateImageDirect
);

// Edit image with prompt and base64 image - open to all (with optional auth)
router.post(
  '/edit',
  optionalAuth(),
  // createRateLimiter(20, 15), // 20 image editing requests per 15 minutes
  validateRequest(EnhancedImageValidation.editImageSchema),
  enhancedImageController.editImage
);

// Analyze image generation intent - open to all
router.post(
  '/analyze-intent',
  validateRequest(EnhancedImageValidation.analyzeIntentSchema),
  enhancedImageController.analyzeIntent
);

// Analyze image intent with context - open to all (with optional auth)
router.post(
  '/analyze-image-intent',
  optionalAuth(),
  // validateRequest(EnhancedImageValidation.analyzeImageIntentSchema),
  enhancedImageController.analyzeImageIntent
);

// Evaluate prompt quality - open to all (with optional auth)
router.post(
  '/evaluate-prompt',
  optionalAuth(),
  // validateRequest(EnhancedImageValidation.evaluatePromptSchema),
  enhancedImageController.evaluatePrompt
);

// Add detail to conversation and re-evaluate - open to all (with optional auth)
router.post(
  '/add-detail',
  optionalAuth(),
  validateRequest(EnhancedImageValidation.addDetailSchema),
  enhancedImageController.addDetail
);

// Finalize prompt - build enhanced prompt from conversation - open to all (with optional auth)
router.post(
  '/finalize-prompt',
  optionalAuth(),
  validateRequest(EnhancedImageValidation.finalizePromptSchema),
  enhancedImageController.finalizePrompt
);

// Build enhanced prompt from conversation - open to all (with optional auth)
router.post(
  '/build-enhanced-prompt',
  optionalAuth(),
  validateRequest(EnhancedImageValidation.buildEnhancedPromptSchema),
  enhancedImageController.buildEnhancedPrompt
);

// Generate image from conversation history - open to all (with optional auth)
router.post(
  '/generate-from-conversation',
  optionalAuth(),
  // createRateLimiter(20, 15),
  validateRequest(EnhancedImageValidation.generateFromConversationSchema),
  enhancedImageController.generateFromConversation
);

// Get image statistics - authenticated users only
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  enhancedImageController.getImageStats
);

export const enhancedImageRoute = router;
