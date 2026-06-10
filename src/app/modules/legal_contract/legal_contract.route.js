import express from 'express';
import { PubSub } from '@google-cloud/pubsub';
import { v4 as uuidv4 } from 'uuid';
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

// --- GCP Pub/Sub Integration for Asynchronous Processing ---
// REASON: Original code processed long-running tasks (AI generation, RAG, file processing)
// in-memory during the HTTP request. This blocks the event loop, leads to timeouts,
// and prevents stateless, horizontal scaling.
// SOLUTION: Offload these tasks to a background worker via GCP Pub/Sub. The API
// now immediately responds with a 202 Accepted status and a job/conversation ID.
// A separate worker service will subscribe to these topics to perform the actual work.

// Initialize the GCP Pub/Sub client.
// Ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set.
const pubSubClient = new PubSub();

// Define Pub/Sub topic names. Replace 'your-gcp-project-id' with your actual project ID.
// These topics must be created in your GCP project.
const TOPIC_CONVERSATIONAL_ASSISTANT =
  'projects/your-gcp-project-id/topics/conversational-assistant-jobs';
const TOPIC_GENERATE_CONTRACT =
  'projects/your-gcp-project-id/topics/generate-contract-jobs';
const TOPIC_MODIFY_CONTRACT =
  'projects/your-gcp-project-id/topics/modify-contract-jobs';

// New controller to handle queuing jobs to Pub/Sub instead of processing them inline.
const legalContractJobController = {
  /**
   * Queues a conversational assistant job to a Pub/Sub topic.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  queueConversationalAssistant: async (req, res, next) => {
    try {
      const { prompt, conversationId: existingConversationId } = req.body;
      const { user, tenantId } = req;
      const file = req.file; // From multer middleware

      // Use existing conversationId for an ongoing chat or generate a new one.
      const conversationId = existingConversationId || uuidv4();

      // Construct the message payload for the background worker.
      // This payload contains all necessary information to process the request.
      const payload = {
        prompt,
        conversationId,
        user, // Contains user ID, roles, etc.
        tenantId,
        // If a file was uploaded for RAG, include its GCS path and metadata.
        // The 'uploadLegalContract' middleware is assumed to upload to GCS and attach info to req.file.
        file: file
          ? {
              path: file.path,
              originalname: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
            }
          : null,
      };

      // Publish the message to the Pub/Sub topic for asynchronous processing.
      await pubSubClient
        .topic(TOPIC_CONVERSATIONAL_ASSISTANT)
        .publishMessage({ json: payload });

      // Respond immediately with 202 Accepted.
      // The client can use the conversationId to poll for status or receive updates via WebSocket/SSE.
      res.status(202).json({
        success: true,
        statusCode: 202,
        message:
          'Your request is being processed. You will be notified upon completion.',
        data: {
          conversationId: conversationId,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Queues a direct contract generation job to a Pub/Sub topic.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  queueGenerateContract: async (req, res, next) => {
    try {
      const { templateId, variables } = req.body;
      const { user, tenantId } = req;
      const jobId = uuidv4(); // Generate a unique ID for this specific job.

      const payload = {
        jobId,
        templateId,
        variables,
        user,
        tenantId,
      };

      await pubSubClient
        .topic(TOPIC_GENERATE_CONTRACT)
        .publishMessage({ json: payload });

      res.status(202).json({
        success: true,
        statusCode: 202,
        message:
          'Contract generation has started. You can check the status using the provided jobId.',
        data: {
          jobId: jobId,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Queues a contract modification job to a Pub/Sub topic.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  queueModifyContract: async (req, res, next) => {
    try {
      const { conversationId, instruction } = req.body;
      const { user, tenantId } = req;

      const payload = {
        conversationId,
        instruction,
        user,
        tenantId,
      };

      await pubSubClient
        .topic(TOPIC_MODIFY_CONTRACT)
        .publishMessage({ json: payload });

      res.status(202).json({
        success: true,
        statusCode: 202,
        message:
          'Contract modification request received and is being processed.',
        data: {
          conversationId: conversationId,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

const router = express.Router();

/**
 * @openapi
 * /legal-contracts/assistant:
 *   post:
 *     summary: Queues a conversational assistant job
 *     description: Accepts a conversational request and offloads it for asynchronous processing. Immediately returns a conversation ID.
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
 *       202:
 *         description: Request accepted for processing. The conversationId is returned for status tracking.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                   example: 202
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
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
  // MODIFIED: Offload processing to a background worker via Pub/Sub.
  legalContractJobController.queueConversationalAssistant
);

/**
 * @openapi
 * /legal-contracts/generate:
 *   post:
 *     summary: Queues a direct contract generation job
 *     description: Accepts parameters for direct contract generation and offloads it for asynchronous processing. Immediately returns a job ID.
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
 *       202:
 *         description: Request accepted for processing. A jobId is returned for status tracking.
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
  // MODIFIED: Offload processing to a background worker via Pub/Sub.
  legalContractJobController.queueGenerateContract
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
  // NO CHANGE: This is a read operation and is not a long-running task.
  legalContractController.getConversationHistory
);

/**
 * @openapi
 * /legal-contracts/download/{conversationId}:
 *   get:
 *     summary: Download generated contract
 *     description: Downloads the contract generated by an asynchronous job. Requires USER or ADMIN role.
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
  // NO CHANGE: This endpoint should fetch a pre-generated file from storage.
  // The heavy lifting of file generation/conversion is handled by the async worker.
  legalContractController.downloadContract
);

/**
 * @openapi
 * /legal-contracts/modify:
 *   post:
 *     summary: Queues a contract modification job
 *     description: Accepts a modification instruction for an existing contract and offloads it for asynchronous processing.
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
 *       202:
 *         description: Request accepted for processing.
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
  // MODIFIED: Offload processing to a background worker via Pub/Sub.
  legalContractJobController.queueModifyContract
);

/**
 * Express router defining routes for legal contract generation, modification, and assistant interactions.
 * Handles multi-tenancy context extraction, rate limiting, and role-based access control.
 * Heavy computational tasks are offloaded asynchronously via GCP Pub/Sub.
 *
 * @type {import('express').Router}
 */
export const legalContractRoutes = router;