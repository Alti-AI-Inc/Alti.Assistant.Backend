import express from 'express';

/**
 * Express router instance for handling Composio v2 API routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 */

/**
 * Composio v2 controller for core operations like initiation and connection management.
 * @module composioController
 */
import { composioController } from './composio.controller.js';
/**
 * AI Classification controller for tasks such as classifying user intent and managing app connections.
 * @module aiClassificationController
 */
import { aiClassificationController } from './aiClassification.controller.js';
/**
 * Sub-router for workflow-related routes.
 * @module workflowRoutes
 */
import { workflowRoutes } from './routes/workflow.routes.js';
/**
 * Middleware to provide optional authentication. If a token is present and valid, `req.user` will be populated.
 * @module optionalAuth
 * @function
 */
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
/**
 * Middleware to check and enforce daily request limits for users.
 * @module checkDailyRequestLimit
 * @function
 */
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
/**
 * Middleware to extract tenant context from the request, typically from headers or user information.
 * @module extractTenantContext
 * @function
 */
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

// Original composio v2 routes

/**
 * @swagger
 * /composio/v2/initiate:
 *   post:
 *     summary: Initiate a Composio v2 session.
 *     description: Starts a new Composio v2 session, potentially involving a connection setup or initial task.
 *     tags:
 *       - Composio v2
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               // Define properties expected by composioInitiateController
 *               // Example:
 *               // sessionId:
 *               //   type: string
 *               //   description: Unique identifier for the session.
 *             example: {} # Placeholder, actual schema depends on controller
 *     responses:
 *       200:
 *         description: Session initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Details of the initiated session.
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/initiate',
  optionalAuth(),
  extractTenantContext,
  composioController.composioInitiateController
);

/**
 * @swagger
 * /composio/v2/wait-for-connection:
 *   post:
 *     summary: Wait for a Composio v2 connection to be established.
 *     description: Polls or waits for a previously initiated Composio v2 connection to become active.
 *     tags:
 *       - Composio v2
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               // Define properties expected by composioWaitForConnectionController
 *               // Example:
 *               // connectionId:
 *               //   type: string
 *               //   description: ID of the connection to wait for.
 *             example: {} # Placeholder, actual schema depends on controller
 *     responses:
 *       200:
 *         description: Connection established or status updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: connected
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/wait-for-connection',
  optionalAuth(),
  extractTenantContext,
  composioController.composioWaitForConnectionController
);

// Conversational Composio routes

/**
 * @swagger
 * /composio/v2/chat:
 *   post:
 *     summary: Engage in a conversational Composio interaction.
 *     description: Sends a user message to the conversational AI and receives a response, potentially triggering actions.
 *     tags:
 *       - Conversational Composio
 *     security:
 *       - bearerAuth: []
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
 *                 description: The user's message or query.
 *               conversationId:
 *                 type: string
 *                 description: Optional ID of an existing conversation to continue.
 *                 nullable: true
 *             example:
 *               message: "Can you help me create a new task in Jira?"
 *               conversationId: "conv_12345"
 *     responses:
 *       200:
 *         description: AI response received.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 response:
 *                   type: string
 *                   description: The AI's textual response.
 *                 conversationId:
 *                   type: string
 *                   description: The ID of the current conversation.
 *                 actions:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: List of actions taken or suggested by the AI.
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       429:
 *         description: Daily request limit exceeded.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/chat',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  composioController.composioConversationController
);

/**
 * @swagger
 * /composio/v2/conversation/{conversationId}:
 *   get:
 *     summary: Retrieve a specific Composio conversation by ID.
 *     description: Fetches the entire history of a single conversational Composio interaction.
 *     tags:
 *       - Conversational Composio
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the conversation.
 *     responses:
 *       200:
 *         description: Conversation history retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 conversation:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sender:
 *                             type: string
 *                             enum: [user, ai]
 *                           text:
 *                             type: string
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/conversation/:conversationId',
  optionalAuth(),
  extractTenantContext,
  composioController.getComposioConversationController
);

/**
 * @swagger
 * /composio/v2/conversations:
 *   get:
 *     summary: Retrieve all Composio conversations for the authenticated user.
 *     description: Fetches a list of all conversational Composio interactions associated with the current user.
 *     tags:
 *       - Conversational Composio
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 conversations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       lastMessage:
 *                         type: string
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/conversations',
  optionalAuth(),
  extractTenantContext,
  composioController.getUserComposioConversationsController
);

// AI Classification routes

/**
 * @swagger
 * /composio/v2/classify-and-execute:
 *   post:
 *     summary: Classify user intent and execute a corresponding action.
 *     description: Analyzes a user's query, classifies their intent, and attempts to execute an action using connected applications.
 *     tags:
 *       - AI Classification
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The user's natural language query.
 *               context:
 *                 type: object
 *                 description: Optional contextual information to aid classification.
 *                 nullable: true
 *             example:
 *               query: "Create a new task in Asana for project 'Marketing' titled 'Review Q3 Report'."
 *     responses:
 *       200:
 *         description: Intent classified and action executed (or proposed).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 classification:
 *                   type: object
 *                   description: Details of the classified intent.
 *                 executionResult:
 *                   type: object
 *                   description: Result of the executed action.
 *       400:
 *         description: Bad request, e.g., missing query.
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       429:
 *         description: Daily request limit exceeded.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/classify-and-execute',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  aiClassificationController.classifyAndExecuteController
);

/**
 * @swagger
 * /composio/v2/supported-apps:
 *   get:
 *     summary: Get a list of all supported applications.
 *     description: Retrieves a list of all applications that the Composio platform can integrate with and perform actions on.
 *     tags:
 *       - AI Classification
 *     responses:
 *       200:
 *         description: List of supported applications.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 apps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "Jira"
 *                       description:
 *                         type: string
 *                         example: "Project management and issue tracking."
 *                       iconUrl:
 *                         type: string
 *                         format: uri
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/supported-apps',
  extractTenantContext,
  aiClassificationController.getSupportedAppsController
);

/**
 * @swagger
 * /composio/v2/test-classification:
 *   post:
 *     summary: Test the AI classification engine with a given query.
 *     description: Allows testing how the AI classifies a specific natural language query without executing any actions.
 *     tags:
 *       - AI Classification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The natural language query to test.
 *             example:
 *               query: "Find all unassigned tasks in Trello."
 *     responses:
 *       200:
 *         description: Classification result returned.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 classification:
 *                   type: object
 *                   description: The predicted intent and extracted entities.
 *                   properties:
 *                     intent:
 *                       type: string
 *                       example: "search_tasks"
 *                     entities:
 *                       type: object
 *                       example:
 *                         status: "unassigned"
 *                         app: "Trello"
 *       400:
 *         description: Bad request, e.g., missing query.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/test-classification',
  extractTenantContext,
  aiClassificationController.testClassificationController
);

/**
 * @swagger
 * /composio/v2/user-connections:
 *   get:
 *     summary: Get a list of applications connected by the authenticated user.
 *     description: Retrieves all applications that the current user has connected to the Composio platform.
 *     tags:
 *       - AI Classification
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's connected applications.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 connections:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       appName:
 *                         type: string
 *                         example: "Slack"
 *                       status:
 *                         type: string
 *                         example: "connected"
 *                       connectedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/user-connections',
  optionalAuth(),
  extractTenantContext,
  aiClassificationController.getUserConnectionsController
);

/**
 * @swagger
 * /composio/v2/conversation-history:
 *   get:
 *     summary: Get the history of AI classification conversations for the authenticated user.
 *     description: Retrieves a log of past interactions where the AI classified intent and potentially executed actions.
 *     tags:
 *       - AI Classification
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conversation history retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 history:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       query:
 *                         type: string
 *                       classifiedIntent:
 *                         type: string
 *                       executedAction:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/conversation-history',
  optionalAuth(),
  extractTenantContext,
  aiClassificationController.getConversationHistoryController
);

// Scheduled Workflow routes
/**
 * @swagger
 * /composio/v2/workflows:
 *   x-swagger-router-controller: workflowRoutes
 *   description: Routes for managing scheduled workflows.
 *   get:
 *     summary: Get all workflows.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of workflows.
 *   post:
 *     summary: Create a new workflow.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Workflow created.
 */
router.use('/workflows', workflowRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// Action Audit Log routes
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Service for managing action audit logs.
 * @module actionAuditService
 */
import { actionAuditService } from './actionAudit.service.js';

/**
 * @swagger
 * /composio/v2/audit-log:
 *   get:
 *     summary: Retrieve the action audit log for the authenticated user.
 *     description: Fetches a paginated and filterable list of all actions performed by or on behalf of the user.
 *     tags:
 *       - Audit Log
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: app
 *         schema:
 *           type: string
 *         description: Filter logs by application name.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [success, failed, pending]
 *         description: Filter logs by action status.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Maximum number of log entries to return.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of log entries to skip for pagination.
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs for actions performed since this timestamp.
 *     responses:
 *       200:
 *         description: Audit log retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       userId:
 *                         type: string
 *                       appName:
 *                         type: string
 *                       action:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [success, failed, pending]
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       details:
 *                         type: object
 *                 total:
 *                   type: integer
 *                   example: 50
 *       401:
 *         description: Authentication required. User ID not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/audit-log',
  optionalAuth(),
  extractTenantContext,
  /**
   * Handles the retrieval of the user's action audit log.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      const result = await actionAuditService.getUserAuditLog(userId, {
        app: req.query.app,
        status: req.query.status,
        limit: req.query.limit,
        offset: req.query.offset,
        since: req.query.since,
      });
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * @swagger
 * /composio/v2/audit-analytics:
 *   get:
 *     summary: Retrieve analytics for user actions.
 *     description: Provides aggregated analytics and statistics on user actions, optionally filtered by a time window.
 *     tags:
 *       - Audit Log
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: window
 *         schema:
 *           type: string
 *           enum: [24h, 7d, 30d, 90d, 1y]
 *           default: 7d
 *         description: The time window for which to retrieve analytics (e.g., '7d' for 7 days).
 *     responses:
 *       200:
 *         description: Action analytics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 analytics:
 *                   type: object
 *                   properties:
 *                     totalActions:
 *                       type: integer
 *                       example: 150
 *                     successfulActions:
 *                       type: integer
 *                       example: 140
 *                     failedActions:
 *                       type: integer
 *                       example: 10
 *                     actionsByApp:
 *                       type: object
 *                       additionalProperties:
 *                         type: integer
 *                       example:
 *                         Jira: 50
 *                         Slack: 30
 *                         Google Drive: 20
 *                     actionsOverTime:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                           count:
 *                             type: integer
 *       401:
 *         description: Authentication required. User ID not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/audit-analytics',
  optionalAuth(),
  extractTenantContext,
  /**
   * Handles the retrieval of user action analytics.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      const result = await actionAuditService.getUserAnalytics(
        userId,
        req.query.window || '7d'
      );
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// App Discovery & Integration Recommendation routes
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Service for app discovery and integration recommendations.
 * @module appDiscoveryService
 */
import { appDiscoveryService } from './appDiscovery.service.js';

/**
 * @swagger
 * /composio/v2/recommendations:
 *   get:
 *     summary: Get personalized app integration recommendations.
 *     description: Retrieves a list of recommended applications for the user to integrate, based on their usage patterns or profile.
 *     tags:
 *       - App Discovery
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of app recommendations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       appName:
 *                         type: string
 *                         example: "Google Calendar"
 *                       reason:
 *                         type: string
 *                         example: "Frequently mentioned in your conversations."
 *                       priority:
 *                         type: integer
 *                         example: 1
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/recommendations',
  optionalAuth(),
  extractTenantContext,
  /**
   * Handles the retrieval of app integration recommendations for the user.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await appDiscoveryService.getRecommendations(userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * @swagger
 * /composio/v2/recommendations/dismiss:
 *   post:
 *     summary: Dismiss an app integration recommendation.
 *     description: Marks a specific app recommendation as dismissed for the user, preventing it from being shown again.
 *     tags:
 *       - App Discovery
 *     security:
 *       - bearerAuth: []
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
 *                 description: The name of the application recommendation to dismiss.
 *             example:
 *               appName: "Google Calendar"
 *     responses:
 *       200:
 *         description: Recommendation dismissed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Recommendation dismissed."
 *       400:
 *         description: Bad request, appName is required.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/recommendations/dismiss',
  optionalAuth(),
  extractTenantContext,
  /**
   * Handles the dismissal of an app integration recommendation.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const { appName } = req.body;
      if (!appName) {
        return res.status(400).json({ success: false, message: 'appName is required' });
      }
      const result = await appDiscoveryService.dismissRecommendation(appName);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Event Trigger routes
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Service for managing webhook event triggers.
 * @module eventTriggerService
 */
import { eventTriggerService } from './eventTrigger.service.js';

/**
 * @swagger
 * /composio/v2/triggers:
 *   post:
 *     summary: Register a new webhook event trigger.
 *     description: Sets up a new trigger that dispatches an event to a target (e.g., a workflow) when a specific webhook event occurs in an external application.
 *     tags:
 *       - Webhook Triggers
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appName
 *               - eventName
 *               - dispatchType
 *               - targetId
 *             properties:
 *               appName:
 *                 type: string
 *                 description: The name of the application providing the webhook event (e.g., "Stripe").
 *               eventName:
 *                 type: string
 *                 description: The specific event name to listen for (e.g., "invoice.paid").
 *               dispatchType:
 *                 type: string
 *                 enum: [workflow, function] # Example types
 *                 description: The type of target to dispatch the event to.
 *               targetId:
 *                 type: string
 *                 description: The ID of the workflow or function to trigger.
 *               paramMapping:
 *                 type: object
 *                 description: Optional mapping of webhook payload fields to target parameters.
 *                 nullable: true
 *             example:
 *               appName: "Stripe"
 *               eventName: "invoice.paid"
 *               dispatchType: "workflow"
 *               targetId: "wf_abc123"
 *               paramMapping:
 *                 invoiceId: "payload.data.id"
 *                 customerEmail: "payload.data.customer_email"
 *     responses:
 *       201:
 *         description: Trigger registered successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 triggerId:
 *                   type: string
 *                   description: The ID of the newly registered trigger.
 *       400:
 *         description: Bad request, missing required fields.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/triggers',
  optionalAuth(),
  extractTenantContext,
  /**
   * Handles the registration of a new webhook event trigger.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const { appName, eventName, dispatchType, targetId, paramMapping } = req.body;
      if (!appName || !eventName || !dispatchType || !targetId) {
        return res.status(400).json({ success: false, message: 'appName, eventName, dispatchType, and targetId are required' });
      }
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await eventTriggerService.registerTrigger(
        userId,
        appName,
        eventName,
        dispatchType,
        targetId,
        paramMapping
      );
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * @swagger
 * /composio/v2/webhooks/receive:
 *   post:
 *     summary: Public endpoint for receiving webhook events from external applications.
 *     description: This endpoint acts as a universal receiver for webhook events. It processes the incoming payload and dispatches it to registered triggers.
 *     tags:
 *       - Webhook Triggers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appName
 *               - eventName
 *               - payload
 *             properties:
 *               appName:
 *                 type: string
 *                 description: The name of the application sending the webhook (e.g., "GitHub", "Stripe").
 *               eventName:
 *                 type: string
 *                 description: The specific event that occurred (e.g., "push", "invoice.paid").
 *               payload:
 *                 type: object
 *                 description: The full payload received from the external webhook.
 *             example:
 *               appName: "GitHub"
 *               eventName: "push"
 *               payload:
 *                 ref: "refs/heads/main"
 *                 repository:
 *                   name: "my-repo"
 *                 pusher:
 *                   name: "octocat"
 *     responses:
 *       200:
 *         description: Webhook event received and processed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Webhook event processed."
 *                 dispatchedTriggers:
 *                   type: integer
 *                   description: Number of triggers successfully dispatched.
 *       400:
 *         description: Bad request, missing appName, eventName, or payload.
 *       500:
 *         description: Internal server error.
 */
// Public webhook receiver (can bypass standard user auth depending on the webhook secret, or support optional auth)
router.post(
  '/webhooks/receive',
  /**
   * Handles incoming webhook events from external applications.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const { appName, eventName, payload } = req.body;
      if (!appName || !eventName || !payload) {
        return res.status(400).json({ success: false, message: 'appName, eventName, and payload are required' });
      }
      const result = await eventTriggerService.receiveWebhookEvent(appName, eventName, payload);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Connection Auto-Recovery routes
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Service for connection auto-recovery.
 * @module connectionRecoveryService
 */
import { connectionRecoveryService } from './connectionRecovery.service.js';

/**
 * @swagger
 * /composio/v2/connections/{connectionId}/recover:
 *   post:
 *     summary: Attempt to auto-recover a specific failed connection.
 *     description: Initiates an automated recovery process for a connection that is experiencing issues.
 *     tags:
 *       - Connection Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: connectionId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the connection to attempt recovery for.
 *     responses:
 *       200:
 *         description: Connection recovery attempt initiated or completed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: "recovery_attempted"
 *                 message:
 *                   type: string
 *                   example: "Auto-recovery process started for connection."
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       404:
 *         description: Connection not found.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/connections/:connectionId/recover',
  optionalAuth(),
  extractTenantContext,
  /**
   * Handles the attempt to auto-recover a specific connection.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * @swagger
 * /composio/v2/connections/heartbeat:
 *   post:
 *     summary: Run a heartbeat check and recovery for all user connections.
 *     description: Triggers a periodic check on all of the user's connections and attempts recovery for any detected issues.
 *     tags:
 *       - Connection Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Heartbeat recovery process initiated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Heartbeat recovery process started for user connections."
 *                 connectionsChecked:
 *                   type: integer
 *                   example: 5
 *                 connectionsRecovered:
 *                   type: integer
 *                   example: 1
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/connections/heartbeat',
  optionalAuth(),
  extractTenantContext,
  /**
   * Handles the initiation of a heartbeat recovery process for all user connections.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await connectionRecoveryService.runHeartbeatRecovery(userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Connection Diagnostics & Rate-Limit Forecasting routes
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Service for connection diagnostics and rate-limit forecasting.
 * @module connectionDiagnosticsService
 */
import { connectionDiagnosticsService } from './connectionDiagnostics.service.js';

/**
 * @swagger
 * /composio/v2/connections/diagnostics:
 *   get:
 *     summary: Get diagnostics for all user connections.
 *     description: Retrieves diagnostic information and potential rate-limit forecasts for all applications connected by the authenticated user.
 *     tags:
 *       - Connection Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection diagnostics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 diagnostics:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       appName:
 *                         type: string
 *                         example: "Jira"
 *                       status:
 *                         type: string
 *                         example: "healthy"
 *                       lastChecked:
 *                         type: string
 *                         format: date-time
 *                       rateLimit:
 *                         type: object
 *                         properties:
 *                           limit:
 *                             type: integer
 *                           remaining:
 *                             type: integer
 *                           resetTime:
 *                             type: string
 *                             format: date-time
 *                       issues:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: []
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/connections/diagnostics',
  optionalAuth(),
  extractTenantContext,
  /**
   * Handles the retrieval of diagnostics for all user connections.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await connectionDiagnosticsService.getConnectionDiagnostics(userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * @swagger
 * /composio/v2/connections/{appName}/diagnostics:
 *   get:
 *     summary: Get diagnostics for a single user connection by app name.
 *     description: Retrieves diagnostic information and potential rate-limit forecasts for a specific application connected by the authenticated user.
 *     tags:
 *       - Connection Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appName
 *         schema:
 *           type: string
 *         required: true
 *         description: The name of the application for which to retrieve diagnostics.
 *     responses:
 *       200:
 *         description: Connection diagnostics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 diagnostic:
 *                   type: object
 *                   properties:
 *                     appName:
 *                       type: string
 *                       example: "Jira"
 *                     status:
 *                       type: string
 *                       example: "healthy"
 *                     lastChecked:
 *                       type: string
 *                       format: date-time
 *                     rateLimit:
 *                       type: object
 *                       properties:
 *                         limit:
 *                           type: integer
 *                         remaining:
 *                           type: integer
 *                         resetTime:
 *                           type: string
 *                           format: date-time
 *                     issues:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: []
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       404:
 *         description: Connection for the specified app not found for the user.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/connections/:appName/diagnostics',
  optionalAuth(),
  extractTenantContext,
  /**
   * Handles the retrieval of diagnostics for a single user connection.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const { appName } = req.params;
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await connectionDiagnosticsService.getSingleConnectionDiagnostics(userId, appName);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Pattern Intelligence Agent routes
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Service for workflow pattern intelligence.
 * @module workflowIntelligenceService
 */
import { workflowIntelligenceService } from './workflowIntelligence.service.js';

/**
 * @swagger
 * /composio/v2/intelligence/patterns:
 *   get:
 *     summary: Get identified workflow patterns for the user.
 *     description: Retrieves a list of recurring workflow patterns identified by the intelligence agent based on the user's actions and integrations.
 *     tags:
 *       - Workflow Intelligence
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of workflow patterns retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 patterns:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       patternId:
 *                         type: string
 *                       description:
 *                         type: string
 *                         example: "When a new email arrives in Gmail, create a task in Asana."
 *                       frequency:
 *                         type: integer
 *                         example: 15
 *                       suggestedAutomation:
 *                         type: object
 *                         description: Details for a potential automation.
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/intelligence/patterns',
  optionalAuth(),
  extractTenantContext,
  /**
   * Handles the retrieval of identified workflow patterns for the user.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await workflowIntelligenceService.getWorkflowPatterns(userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * @swagger
 * /composio/v2/intelligence/analyze:
 *   post:
 *     summary: Trigger an analysis for new workflow patterns.
 *     description: Initiates a background process to analyze user activity and identify new or updated workflow patterns.
 *     tags:
 *       - Workflow Intelligence
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workflow pattern analysis initiated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow pattern analysis started."
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/intelligence/analyze',
  optionalAuth(),
  extractTenantContext,
  /**
   * Handles the initiation of workflow pattern analysis for the user.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await workflowIntelligenceService.analyzeWorkflowPatterns(userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * @swagger
 * /composio/v2/intelligence/patterns/{patternId}/dismiss:
 *   post:
 *     summary: Dismiss a specific workflow pattern recommendation.
 *     description: Marks an identified workflow pattern as dismissed for the user, indicating they are not interested in automating it.
 *     tags:
 *       - Workflow Intelligence
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patternId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the workflow pattern to dismiss.
 *     responses:
 *       200:
 *         description: Workflow pattern dismissed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow pattern dismissed."
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       404:
 *         description: Pattern not found.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/intelligence/patterns/:patternId/dismiss',
  optionalAuth(),
  extractTenantContext,
  /**
   * Handles the dismissal of a specific workflow pattern.
   * @param {Request} req - The Express request object.
   * @param {Response} res - The Express response object.
   * @returns {Promise<void>}
   */
  async (req, res) => {
    try {
      const { patternId } = req.params;
      const userId = req.user?._id || req.userId || 'default_user';
      const result = await workflowIntelligenceService.dismissPattern(patternId, userId);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * The main router for Composio v2 API routes.
 * @type {express.Router}
 */
export const composioV2Routes = router;