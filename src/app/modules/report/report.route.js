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
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

/**
 * @swagger
 * tags:
 *   name: Report
 *   description: API for generating, managing, and interacting with reports.
 */

/**
 * Express router for report-related routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * @swagger
 * /report/assistant:
 *   post:
 *     summary: Conversational AI assistant
 *     description: |
 *       Main entry point for natural language interaction with the AI assistant.
 *       Supports both authenticated and guest users.
 *       Handles text input and optional file uploads for Retrieval-Augmented Generation (RAG).
 *       Includes checks for daily request limits, storage limits, and RAG feature availability.
 *     tags:
 *       - Report
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConversationalRequest'
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The natural language prompt for the assistant.
 *               conversationId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional ID of an ongoing conversation.
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Optional files to be uploaded for RAG.
 *     responses:
 *       200:
 *         description: Successful interaction with the assistant.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI assistant's response.
 *                     conversationId:
 *                       type: string
 *                       format: uuid
 *                       description: The ID of the current conversation.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/assistant',
  // Rate limit for the core AI interaction endpoint.
  // Allows 20 requests per 15 minutes per user/IP.
  createRateLimiter(20, 15),
  optionalAuth(),
  extractTenantContext,
  // OPTIMIZATION: Fail fast on daily limits before processing files.
  checkDailyRequestLimit,
  // Process file uploads to make req.files and req.body available.
  uploadReportFiles,
  // Validate the request payload (including text fields from multipart form).
  validateRequest(ReportValidation.conversationalRequestSchema),
  // Check if the user has access to the RAG feature, especially if files were provided.
  checkRAGFeature,
  // OPTIMIZATION: Now that files are processed (in req.files), check if they exceed the user's storage quota.
  checkStorageLimit,
  reportController.conversationalAssistant
);

/**
 * @swagger
 * /report/generate:
 *   post:
 *     summary: Direct report generation (non-conversational)
 *     description: |
 *       Programmatic access to generate reports based on provided parameters, without conversational context.
 *       Supports both authenticated and guest users. Enforces daily request limits.
 *     tags:
 *       - Report
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateReportRequest'
 *     responses:
 *       200:
 *         description: Report generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Report'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/generate',
  // Stricter rate limit for direct, potentially heavy, report generation.
  // Allows 10 generations per 15 minutes per user/IP.
  createRateLimiter(10, 15),
  optionalAuth(),
  extractTenantContext,
  // IMPROVEMENT: Added to ensure direct generation counts towards user's daily usage limits for consistency.
  checkDailyRequestLimit,
  validateRequest(ReportValidation.generateReportSchema),
  reportController.generateReport
);

/**
 * @swagger
 * /report/analyze:
 *   post:
 *     summary: Analyze uploaded files
 *     description: |
 *       Extracts and analyzes content from multiple uploaded files using RAG capabilities.
 *       Supports both authenticated and guest users.
 *       Includes checks for daily request limits, storage limits, and RAG feature availability.
 *     tags:
 *       - Report
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Files to be uploaded for analysis.
 *     responses:
 *       200:
 *         description: Files analyzed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     analysisResult:
 *                       type: string
 *                       description: The result of the file analysis.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/analyze',
  // Rate limit for file analysis, another resource-intensive operation.
  // Allows 15 requests per 15 minutes per user/IP.
  createRateLimiter(15, 15),
  optionalAuth(),
  // CRITICAL-FIX: Added to ensure proper user/tenant context is set for authenticated requests, preventing data leaks.
  extractTenantContext,
  // OPTIMIZATION: Fail fast on daily limits before processing files.
  checkDailyRequestLimit,
  // Process file uploads to make req.files and req.body available.
  uploadReportFiles,
  // Validate the request payload.
  validateRequest(ReportValidation.analyzeFilesSchema),
  // Check if the user has access to the RAG feature.
  checkRAGFeature,
  // OPTIMIZATION: Now that files are processed, check if they exceed the user's storage quota.
  checkStorageLimit,
  reportController.analyzeFiles
);

/**
 * @swagger
 * /report/download/{reportId}:
 *   get:
 *     summary: Download a generated report
 *     description: |
 *       Downloads a report file by its ID.
 *       Requires authentication to ensure only the report owner can download it, protecting user data.
 *     tags:
 *       - Report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The unique identifier of the report to download.
 *     responses:
 *       200:
 *         description: Report file streamed successfully.
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/download/:reportId',
  // Protects against bandwidth abuse. Allows 30 downloads per minute per user.
  createRateLimiter(30, 1),
  // SECURITY-IMPROVEMENT: Added authentication to protect user data and ensure only the owner can download.
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  // Added validation for the reportId parameter.
  validateRequest(ReportValidation.downloadReportSchema),
  reportController.downloadReport
);

/**
 * @swagger
 * /report/export:
 *   post:
 *     summary: Export an existing report to a different format
 *     description: |
 *       Exports a specified report to a different format (e.g., PDF, DOCX).
 *       Requires user or admin authentication.
 *     tags:
 *       - Report
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ExportReportRequest'
 *     responses:
 *       200:
 *         description: Report exported successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     downloadUrl:
 *                       type: string
 *                       format: uri
 *                       description: URL to download the exported report.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/export',
  // Rate limit for the authenticated, resource-intensive export feature.
  // Allows 10 exports per 15 minutes per user.
  createRateLimiter(10, 15),
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ReportValidation.exportReportSchema),
  reportController.exportReport
);

/**
 * @swagger
 * /report/{reportId}:
 *   get:
 *     summary: Get a report by ID
 *     description: Retrieves details of a specific report by its unique identifier. Requires user or admin authentication.
 *     tags:
 *       - Report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The unique identifier of the report.
 *     responses:
 *       200:
 *         description: Report details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Report'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/:reportId',
  // Standard rate limit for authenticated GET endpoints to prevent API abuse.
  // Allows 60 requests per minute per user.
  createRateLimiter(60, 1),
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ReportValidation.getReportSchema),
  reportController.getReport
);

/**
 * @swagger
 * /report:
 *   get:
 *     summary: List user reports
 *     description: Retrieves a paginated list of reports belonging to the authenticated user. Requires user or admin authentication.
 *     tags:
 *       - Report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Number of items per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for filtering reports.
 *     responses:
 *       200:
 *         description: List of reports retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Report'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/',
  // Standard rate limit for authenticated list endpoints.
  // Allows 60 requests per minute per user.
  createRateLimiter(60, 1),
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ReportValidation.listReportsSchema),
  reportController.listReports
);

/**
 * @swagger
 * /report/modify:
 *   post:
 *     summary: Modify an existing report
 *     description: |
 *       Updates the content or metadata of an existing report.
 *       Requires user or admin authentication.
 *     tags:
 *       - Report
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ModifyReportRequest'
 *     responses:
 *       200:
 *         description: Report modified successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Report'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/modify',
  // Standard rate limit for authenticated write operations.
  // Allows 60 requests per minute per user.
  createRateLimiter(60, 1),
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(ReportValidation.modifyReportSchema),
  reportController.modifyReport
);

export default router;