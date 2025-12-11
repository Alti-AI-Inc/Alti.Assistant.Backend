import express from 'express';
import multer from 'multer';
import path from 'path';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { TranslationValidation } from './translation.validation.js';
import { translationController } from './translation.controller.js';
import {
  ALLOWED_MIME_TYPES,
  FILE_SIZE_LIMITS,
  SUPPORTED_DOCUMENT_FORMATS,
} from './translation.constant.js';

const router = express.Router();

// Configure multer for document uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/translations/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'doc-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const supportedFormats = SUPPORTED_DOCUMENT_FORMATS.join(', ');
    cb(
      new Error(
        `Invalid file format. Supported formats: ${supportedFormats}`
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: FILE_SIZE_LIMITS.MAX_FILE_SIZE, // 10MB
  },
});

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language requests with optional file upload
 * File is optional - users can translate inline text or upload documents
 */
router.post(
  '/assistant',
  optionalAuth(),
  upload.single('file'), // Optional file upload
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
