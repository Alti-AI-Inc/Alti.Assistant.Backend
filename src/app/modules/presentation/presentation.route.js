import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { presentationController } from './presentation.controller.js';
import { PresentationValidation } from './presentation.validation.js';

const router = express.Router();

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language requests intelligently
 */
router.post(
  '/assistant',
  optionalAuth(),
  // createRateLimiter(20, 15), // 20 requests per 15 minutes
  validateRequest(PresentationValidation.conversationalRequestSchema),
  presentationController.conversationalAssistant
);

/**
 * Direct generation endpoint (non-conversational)
 * For programmatic access with all parameters
 */
router.post(
  '/generate',
  optionalAuth(),
  // createRateLimiter(10, 15), // 10 generations per 15 minutes
  validateRequest(PresentationValidation.generatePresentationSchema),
  presentationController.generatePresentation
);

/**
 * Check async task status
 */
router.get(
  '/status/:taskId',
  optionalAuth(),
  validateRequest(PresentationValidation.checkStatusSchema),
  presentationController.checkTaskStatus
);

/**
 * Edit existing presentation
 */
router.post(
  '/edit',
  optionalAuth(),
  // createRateLimiter(15, 15), // 15 edits per 15 minutes
  validateRequest(PresentationValidation.editPresentationSchema),
  presentationController.editPresentation
);

/**
 * Derive new presentation from existing one
 */
router.post(
  '/derive',
  optionalAuth(),
  // createRateLimiter(15, 15), // 15 derivations per 15 minutes
  validateRequest(PresentationValidation.editPresentationSchema), // Same schema as edit
  presentationController.derivePresentation
);

/**
 * Get presentation details
 */
router.get(
  '/:presentationId',
  optionalAuth(),
  validateRequest(PresentationValidation.getPresentationSchema),
  presentationController.getPresentation
);

export default router;
