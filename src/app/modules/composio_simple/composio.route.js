import express from 'express';
import { composioSimpleController } from './composio.controller.js';
import auth from '../../middlewares/auth/auth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';

const router = express.Router();

/**
 * @openapi
 * /chat:
 *   post:
 *     summary: Send a chat message to the Composio agent
 *     description: Sends a message to the Composio agent, checking daily request limits and authentication.
 *     tags: [Composio]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The message to send to the agent.
 *               conversationId:
 *                 type: string
 *                 description: Optional conversation ID to continue an existing thread.
 *     responses:
 *       200:
 *         description: Successfully processed the chat message.
 *       401:
 *         description: Unauthorized access.
 *       429:
 *         description: Daily request limit exceeded.
 */
router.post(
  '/chat',
  auth(),
  checkDailyRequestLimit,
  composioSimpleController.chatController
);

/**
 * @openapi
 * /initiate:
 *   post:
 *     summary: Initiate authentication for an integration
 *     description: Starts the OAuth or API key connection flow for a specific integration/app.
 *     tags: [Composio]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appName
 *             properties:
 *               appName:
 *                 type: string
 *                 description: The name of the application to connect (e.g., 'github', 'google-calendar').
 *               redirectUrl:
 *                 type: string
 *                 description: Optional redirect URL after successful authentication.
 *     responses:
 *       200:
 *         description: Authentication initiated successfully.
 *       401:
 *         description: Unauthorized.
 */
router.post(
  '/initiate',
  auth(),
  composioSimpleController.initiateAuthController
);

/**
 * @openapi
 * /wait-for-connection:
 *   post:
 *     summary: Wait for connection establishment
 *     description: Polls or waits for the connection status of an initiated authentication flow.
 *     tags: [Composio]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - connectionId
 *             properties:
 *               connectionId:
 *                 type: string
 *                 description: The connection ID returned during initiation.
 *     responses:
 *       200:
 *         description: Connection status retrieved successfully.
 *       401:
 *         description: Unauthorized.
 */
router.post(
  '/wait-for-connection',
  auth(),
  composioSimpleController.waitForConnectionController
);

/**
 * @openapi
 * /conversations:
 *   get:
 *     summary: Retrieve all conversations
 *     description: Fetches a list of all active or past conversations for the authenticated user.
 *     tags: [Composio]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations retrieved successfully.
 *       401:
 *         description: Unauthorized.
 */
router.get(
  '/conversations',
  auth(),
  composioSimpleController.getConversationsController
);

/**
 * @openapi
 * /conversation/{conversationId}:
 *   get:
 *     summary: Retrieve a specific conversation
 *     description: Fetches details and message history of a specific conversation by its ID.
 *     tags: [Composio]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the conversation.
 *     responses:
 *       200:
 *         description: Conversation details retrieved successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 */
router.get(
  '/conversation/:conversationId',
  auth(),
  composioSimpleController.getConversationController
);

/**
 * @openapi
 * /connected-accounts:
 *   get:
 *     summary: Retrieve connected accounts
 *     description: Fetches all active integrations and connected accounts for the authenticated user.
 *     tags: [Composio]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Connected accounts retrieved successfully.
 *       401:
 *         description: Unauthorized.
 */
router.get(
  '/connected-accounts',
  auth(),
  composioSimpleController.getConnectedAccountsController
);

/**
 * @openapi
 * /disconnect:
 *   post:
 *     summary: Disconnect an integration
 *     description: Removes/disconnects an active integration or connected account.
 *     tags: [Composio]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - connectedAccountId
 *             properties:
 *               connectedAccountId:
 *                 type: string
 *                 description: The ID of the connected account to disconnect.
 *     responses:
 *       200:
 *         description: Account disconnected successfully.
 *       401:
 *         description: Unauthorized.
 */
router.post(
  '/disconnect',
  auth(),
  composioSimpleController.disconnectAppController
);

/**
 * @openapi
 * /app-capabilities:
 *   get:
 *     summary: Get application capabilities
 *     description: Retrieves the available actions and capabilities for a specific application.
 *     tags: [Composio]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: appName
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the application.
 *     responses:
 *       200:
 *         description: App capabilities retrieved successfully.
 *       401:
 *         description: Unauthorized.
 */
router.get(
  '/app-capabilities',
  auth(),
  composioSimpleController.getAppCapabilitiesController
);

/**
 * @openapi
 * /connection-status-stream:
 *   get:
 *     summary: Stream connection status
 *     description: Establishes a Server-Sent Events (SSE) stream to monitor connection status updates.
 *     tags: [Composio]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: SSE stream established successfully.
 *       401:
 *         description: Unauthorized.
 */
router.get(
  '/connection-status-stream',
  auth(),
  composioSimpleController.connectionStatusStreamController
);

/**
 * @openapi
 * /compare:
 *   post:
 *     summary: Compare requests across systems
 *     description: Runs the same request through both systems to compare performance or outputs.
 *     tags: [Composio]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The message/request to compare.
 *     responses:
 *       200:
 *         description: Comparison completed successfully.
 *       401:
 *         description: Unauthorized.
 */
router.post('/compare', auth(), composioSimpleController.compareController);

/**
 * Express router containing all Composio simple integration routes.
 * @type {import('express').Router}
 */
export const composioSimpleRoutes = router;