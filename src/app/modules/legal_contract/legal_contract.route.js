import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { legalContractController } from './legal_contract.controller.js';
import { LegalContractValidation } from './legal_contract.validation.js';
import { uploadLegalContract } from './middlewares/uploadLegalContract.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

const router = express.Router();

/**
 * @openapi
 * /legal-contracts/assistant:
 *   post:
 *     summary: Conversational assistant endpoint
 *     description: Main entry point for the conversational assistant. Supports both authenticated and guest users. Handles natural language requests intelligently with optional file upload (RAG).
 *     tags:
 *       - Legal Contract
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         schema:
 *           type: string
 *         required: false
 *         description: Tenant identifier for multi-tenant context
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Optional contract file for RAG context
 *               prompt:
 *                 type: string
 *                 description: Natural language prompt or instruction
 *               conversationId:
 *                 type: string
 *                 description: Optional existing conversation ID to continue
 *     responses:
 *       200:
 *         description: Successful response from conversational assistant
 *       400:
 *         description: Invalid request or validation error
 *       429:
 *         description: Daily request limit exceeded
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  uploadLegalContract.single('file'),
  checkRAGFeature,
  // createRateLimiter(20, 15), // 20 requests per 15 minutes
  validateRequest(LegalContractValidation.conversationalRequestSchema),
  legalContractController.conversationalAssistant
);

/**
 * @openapi
 * /legal-contracts/generate:
 *   post:
 *     summary: Direct contract generation
 *     description: Direct contract generation endpoint (non-conversational) for programmatic access with all parameters provided. Supports optional authentication and extracts tenant context.
 *     tags:
 *       - Legal Contract
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         schema:
 *           type: string
 *         required: false
 *         description: Tenant identifier for multi-tenant context
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateId
 *             properties:
 *               templateId:
 *                 type: string
 *               variables:
 *                 type: object
 *     responses:
 *       200:
 *         description: Contract generated successfully
 *       400:
 *         description: Validation error
 */
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext, // Extract tenant context after auth
  checkDailyRequestLimit,
  // createRateLimiter(10, 15), // 10 generations per 15 minutes
  validateRequest(LegalContractValidation.generateContractSchema),
  legalContractController.generateContract
);

/**
 * @openapi
 * /legal-contracts/conversation/{conversationId}:
 *   get:
 *     summary: Get conversation history
 *     description: Retrieves the conversation history for a specific conversation ID. Requires USER or ADMIN role.
 *     tags:
 *       - Legal Contract
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation
 *       - in: header
 *         name: x-tenant-id
 *         schema:
 *           type: string
 *         required: true
 *         description: Tenant identifier for multi-tenant context
 *     responses:
 *       200:
 *         description: Conversation history retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Conversation not found
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext, // Extract tenant context after auth
  validateRequest(LegalContractValidation.getConversationHistorySchema),
  legalContractController.getConversationHistory
);

/**
 * @openapi
 * /legal-contracts/download/{conversationId}:
 *   get:
 *     summary: Download generated contract
 *     description: Downloads the generated contract in the specified format (e.g., PDF, DOCX). Requires USER or ADMIN role.
 *     tags:
 *       - Legal Contract
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation associated with the contract
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [pdf, docx]
 *         required: false
 *         description: Target file format
 *       - in: header
 *         name: x-tenant-id
 *         schema:
 *           type: string
 *         required: true
 *         description: Tenant identifier for multi-tenant context
 *     responses:
 *       200:
 *         description: File downloaded successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  '/download/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext, // Extract tenant context after auth
  validateRequest(LegalContractValidation.downloadContractSchema),
  legalContractController.downloadContract
);

/**
 * @openapi
 * /legal-contracts/modify:
 *   post:
 *     summary: Modify existing contract
 *     description: Modifies an existing contract based on instructions. Requires USER or ADMIN role.
 *     tags:
 *       - Legal Contract
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         schema:
 *           type: string
 *         required: true
 *         description: Tenant identifier for multi-tenant context
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - conversationId
 *               - instruction
 *             properties:
 *               conversationId:
 *                 type: string
 *               instruction:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contract modified successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post(
  '/modify',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext, // Extract tenant context after auth
  validateRequest(LegalContractValidation.modifyContractSchema),
  legalContractController.modifyContract
);

/**
 * Express router defining routes for legal contract generation, modification, and assistant interactions.
 * Handles multi-tenancy context extraction, rate limiting, and role-based access control.
 * 
 * @type {import('express').Router}
 */
export const legalContractRoutes = router;