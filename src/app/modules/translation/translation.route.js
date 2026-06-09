import express from 'express';
import multer from 'multer'; // Import multer to handle Multer-specific errors
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { TranslationValidation } from './translation.validation.js';
import { translationController } from './translation.controller.js';
import { uploadTranslation } from './middlewares/uploadTranslation.js';

const router = express.Router();

/**
 * Custom middleware to handle Multer errors specifically for the optional file upload.
 * This ensures that file upload-related errors (e.g., file size limits, invalid file types)
 * return appropriate 400 Bad Request responses instead of potentially falling through
 * to a generic 500 error handler or crashing the server.
 */
const handleMulterError = (req, res, next) => {
  uploadTranslation.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred during file upload
      return res.status(400).json({
        success: false,
        message: err.message,
        errorMessages: [{ path: 'file', message: err.message }],
      });
    } else if (err) {
      // An unknown error occurred during file upload
      return res.status(500).json({
        success: false,
        message: 'An unknown error occurred during file upload.',
        errorMessages: [{ path: 'file', message: err.message || 'Unknown file upload error' }],
      });
    }
    // No error, proceed to the next middleware
    next();
  });
};

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language requests with optional file upload
 * File is optional - users can translate inline text or upload documents
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  handleMulterError, // Use the custom error handler for optional file upload
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
  extractTenantContext,
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
  extractTenantContext,
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
  extractTenantContext,
  translationController.getSupportedLanguages
);

export default router;