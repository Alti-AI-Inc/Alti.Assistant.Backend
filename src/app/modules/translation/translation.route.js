import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { TranslationValidation } from './translation.validation.js';
import { translationController } from './translation.controller.js';
import { uploadTranslation } from './middlewares/uploadTranslation.js';

const router = express.Router();

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language requests with optional file upload
 * File is optional - users can translate inline text or upload documents
 */
router.post(
  '/assistant',
  optionalAuth(),
  checkDailyRequestLimit,
  uploadTranslation.single('file'), // Optional file upload
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(TranslationValidation.conversationalRequestSchema),
  translationController.conversationalAssistant
);

/**
 * Direct translation endpoint (non-conversational)
 * For programmatic access with all parameters
 * Text-only, no file upload
 */
router.post(
  '/translate',
  optionalAuth(),
  // createRateLimiter(20, 15), // 20 translations per 15 minutes
  validateRequest(TranslationValidation.translateTextSchema),
  translationController.translateText
);

/**
 * Language detection endpoint
 * Detects the language of provided text
 */
router.post(
  '/detect',
  optionalAuth(),
  // createRateLimiter(30, 15), // 30 detections per 15 minutes
  validateRequest(TranslationValidation.detectLanguageSchema),
  translationController.detectLanguage
);

/**
 * Get supported languages
 * Returns list of all supported languages with codes
 */
router.get(
  '/languages',
  optionalAuth(),
  translationController.getSupportedLanguages
);

export default router;
