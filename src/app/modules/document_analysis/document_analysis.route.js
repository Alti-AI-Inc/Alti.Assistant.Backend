import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { documentAnalysisController } from './document_analysis.controller.js';
import { DocumentAnalysisValidation } from './document_analysis.validation.js';
import { uploadDocumentAnalysis } from './middlewares/uploadDocumentAnalysis.js';

const router = express.Router();

/**
 * Document analysis endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles text analysis and file upload with natural language requests
 */
router.post(
  '/analyze',
  optionalAuth(),
  checkDailyRequestLimit,
  uploadDocumentAnalysis.single('file'),
  validateRequest(DocumentAnalysisValidation.analyzeRequestSchema),
  documentAnalysisController.analyzeDocument
);

/**
 * Get conversation history
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(DocumentAnalysisValidation.getConversationHistorySchema),
  documentAnalysisController.getConversationHistory
);

export const documentAnalysisRoutes = router;
