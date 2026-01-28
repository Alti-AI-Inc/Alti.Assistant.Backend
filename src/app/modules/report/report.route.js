import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { reportController } from './report.controller.js';
import { ReportValidation } from './report.validation.js';
import { uploadReportFiles } from './middlewares/uploadReportFiles.js';

const router = express.Router();

/**
 * Conversational assistant endpoint - Main entry point
 * Supports both authenticated and guest users
 * Handles natural language requests with optional file uploads
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  uploadReportFiles,
  // createRateLimiter(20, 15), // 20 requests per 15 minutes
  validateRequest(ReportValidation.conversationalRequestSchema),
  reportController.conversationalAssistant
);

/**
 * Direct generation endpoint (non-conversational)
 * For programmatic access with all parameters
 */
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext,
  // createRateLimiter(10, 15), // 10 generations per 15 minutes
  validateRequest(ReportValidation.generateReportSchema),
  reportController.generateReport
);

/**
 * Analyze uploaded files
 * Extracts and analyzes content from multiple files
 */
router.post(
  '/analyze',
  optionalAuth(),
  uploadReportFiles,
  // createRateLimiter(15, 15), // 15 requests per 15 minutes
  validateRequest(ReportValidation.analyzeFilesSchema),
  reportController.analyzeFiles
);

/**
 * Download generated report
 * Public endpoint for downloading reports
 */
router.get(
  '/download/:filename',
  reportController.downloadReport
);

/**
 * Export existing report to different format
 * Requires authentication
 */
router.post(
  '/export',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ReportValidation.exportReportSchema),
  reportController.exportReport
);

/**
 * Get report by ID
 * Requires authentication
 */
router.get(
  '/:reportId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ReportValidation.getReportSchema),
  reportController.getReport
);

/**
 * List user reports
 * Requires authentication
 */
router.get(
  '/',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ReportValidation.listReportsSchema),
  reportController.listReports
);

/**
 * Modify existing report
 * Requires authentication
 */
router.post(
  '/modify',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ReportValidation.modifyReportSchema),
  reportController.modifyReport
);

export default router;
