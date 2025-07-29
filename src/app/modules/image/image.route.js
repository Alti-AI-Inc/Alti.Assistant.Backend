import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { imageController } from './image.controller.js';
import { ImageValidation } from './image.validation.js';

const router = express.Router();

console.log('Image routes initialized');

// Image generation endpoint - open to all (with optional auth)
router.post(
  '/generate',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  createRateLimiter(20, 15), // 20 image generation requests per 15 minutes
  validateRequest(ImageValidation.imageGenerationSchema),
  imageController.generateImage
);

// Image analysis endpoint - open to all (with optional auth)
router.post(
  '/analyze',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  createRateLimiter(30, 15), // 30 image analysis requests per 15 minutes
  validateRequest(ImageValidation.imageAnalysisSchema),
  imageController.analyzeImage
);

// Get image statistics - authenticated users only
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER), // Keep regular auth for stats
  imageController.getImageStats
);

// Get guest conversation - open to all for guest continuation
router.get(
  '/conversation/:conversationId',
  optionalAuth(), // Use optional auth to allow guest access
  validateRequest(ImageValidation.conversationSchema),
  imageController.getImageConversation
);

// Get guest conversations by user ID - for guest conversation history
router.get(
  '/guest/:guestUserId/conversations',
  optionalAuth(), // Use optional auth to allow guest access
  validateRequest(ImageValidation.guestUserSchema),
  imageController.getGuestConversations
);

export const imageRoutes = router;
