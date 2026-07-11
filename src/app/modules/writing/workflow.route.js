import express from 'express';
import {
  writingTask,
  getConversation,
  deleteConversation,
  listAgents,
  getAgentDetails,
} from './writer.controller.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';

/**
 * @module writingWorkflowRoutes
 * @description Defines API routes for the writing assistant workflow.
 */
const router = express.Router();

/**
 * @swagger
 * /assistant/agents:
 *   get:
 *     summary: List all specialized writing agents.
 *     tags: [Writing, Assistant]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *         required: false
 *         description: Optional category filter (e.g. "Legal Drafting").
 *     responses:
 *       200:
 *         description: List of available agents.
 */
router.get('/assistant/agents', optionalAuth(), listAgents);

/**
 * @swagger
 * /assistant/agents/{agentId}:
 *   get:
 *     summary: Get full details (including system prompt) for one specialized agent.
 *     tags: [Writing, Assistant]
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Agent details. }
 *       404: { description: Agent not found. }
 */
router.get('/assistant/agents/:agentId', optionalAuth(), getAgentDetails);

/**
 * @swagger
 * /assistant:
 *   post:
 *     summary: Initiate or continue a writing assistant conversation.
 *     description: |
 *       Handles requests to the AI writing assistant. This endpoint applies several middlewares:
 *       - `optionalAuth()`: Authenticates the user if a token is provided, making user-specific features available.
 *       - `extractTenantContext`: Extracts tenant information from the request, essential for multi-tenancy.
 *       - `checkDailyRequestLimit`: Verifies if the user or tenant has exceeded their daily request quota.
 *       The request is then processed by the `writingController` to generate AI-powered writing content.
 *     tags:
 *       - Writing
 *       - Assistant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Write a short story about a cat who learns to fly."
 *               conversationId:
 *                 type: string
 *                 description: Omit to start a new conversation; pass it back to continue one.
 *                 example: "conv-1678886400000"
 *     responses:
 *       200:
 *         description: Either a JSON clarifying-question response or an SSE stream of final content.
 *       400:
 *         description: Bad request, e.g., missing message.
 *       401:
 *         description: Unauthorized if authentication is required for certain features and not provided.
 *       403:
 *         description: Forbidden, e.g., daily request limit exceeded.
 *       429:
 *         description: Monthly/plan usage limit exceeded.
 *       500:
 *         description: Internal server error.
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  writingTask
);

/**
 * @swagger
 * /assistant/{conversationId}:
 *   get:
 *     summary: Get the current state/history of a conversation.
 *     tags: [Writing, Assistant]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Conversation state. }
 *       404: { description: Conversation not found. }
 */
router.get(
  '/assistant/:conversationId',
  optionalAuth(),
  extractTenantContext,
  getConversation
);

/**
 * @swagger
 * /assistant/{conversationId}:
 *   delete:
 *     summary: Delete a conversation and its stored history.
 *     tags: [Writing, Assistant]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted. }
 *       501: { description: Checkpointer doesn't support deletion. }
 */
router.delete(
  '/assistant/:conversationId',
  optionalAuth(),
  extractTenantContext,
  deleteConversation
);

export const writingRoutes = router;