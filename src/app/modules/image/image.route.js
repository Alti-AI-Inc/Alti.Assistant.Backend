import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { imageController } from './image.controller.js';
import { ImageValidation } from './image.validation.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

const router = express.Router();

console.log('Image routes initialized');

// Middleware to ensure a guest can only access their own conversations
// and authenticated users (non-admin) cannot access arbitrary guest conversations.
// This prevents Insecure Direct Object Reference (IDOR) for guest conversations.
const checkGuestUserOwnership = (req, res, next) => {
  const requestedGuestUserId = req.params.guestUserId;

  // Case 1: Authenticated user
  if (req.user) {
    // Allow admins to view any guest conversations
    if (req.user.role === ENUM_USER_ROLE.ADMIN) {
      return next();
    }
    // For non-admin authenticated users, deny access to guest conversations.
    // If there's a business requirement for an authenticated user to view their *own* past guest conversations,
    // the guestUserId would need to be linked to their userId, and that check would go here.
    // Without that specific requirement, it's safer to deny.
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Authenticated users cannot access guest conversations directly unless they are an administrator.',
    });
  }

  // Case 2: Guest user (from optionalAuth)
  // Assuming optionalAuth populates req.guestUser with an 'id' property for guests.
  // This check prevents IDOR for guest users trying to access other guest's conversations.
  if (req.guestUser && req.guestUser.id === requestedGuestUserId) {
    return next();
  }

  // Case 3: No user/guest context or mismatch
  // This covers scenarios where optionalAuth didn't identify a user/guest,
  // or the guestUser.id doesn't match the requestedGuestUserId.
  return res.status(403).json({
    success: false,
    message: 'Forbidden: You are not authorized to access these guest conversations.',
  });
};

// Image generation endpoint - open to all (with optional auth)
router.post(
  '/generate',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(20, 15), // 20 image generation requests per 15 minutes
  validateRequest(ImageValidation.imageGenerationSchema),
  imageController.generateImage
);

// Image analysis endpoint - open to all (with optional auth)
router.post(
  '/analyze',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(30, 15), // 30 image analysis requests per 15 minutes
  validateRequest(ImageValidation.imageAnalysisSchema),
  imageController.analyzeImage
);

// Get image statistics - authenticated users only
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER), // Keep regular auth for stats
  extractTenantContext,
  imageController.getImageStats
);

// Get guest conversation - open to all for guest continuation
router.get(
  '/conversation/:conversationId',
  optionalAuth(), // Use optional auth to allow guest access
  extractTenantContext,
  validateRequest(ImageValidation.conversationSchema),
  imageController.getImageConversation
);

// Get guest conversations by user ID - for guest conversation history
router.get(
  '/guest/:guestUserId/conversations',
  optionalAuth(), // Use optional auth to allow guest access
  extractTenantContext,
  checkGuestUserOwnership, // Add middleware to prevent IDOR for guest conversations
  validateRequest(ImageValidation.guestUserSchema),
  imageController.getGuestConversations
);

export const imageRoutes = router;