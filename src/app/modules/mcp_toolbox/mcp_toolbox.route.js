import express from 'express';
import { mcpToolboxController } from './mcp_toolbox.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

// ==========================================
// A. Legacy Database MCP Toolbox Endpoints
// ==========================================

/**
 * @openapi
 * /api/mcp-toolbox/connect:
 *   post:
 *     tags:
 *       - MCP Toolbox - Legacy
 *     summary: Connect to the legacy MCP database
 *     description: Establishes a connection to the legacy MCP database. The connection details are typically derived from the authenticated user's tenant context. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Connection successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Successfully connected to the legacy database."
 *       '401':
 *         description: Unauthorized.
 *       '500':
 *         description: Internal Server Error or connection failure.
 */
router.post(
  '/connect',
  auth(),
  mcpToolboxController.connectController
);

/**
 * @openapi
 * /api/mcp-toolbox/query:
 *   post:
 *     tags:
 *       - MCP Toolbox - Legacy
 *     summary: Execute a query on the legacy MCP database
 *     description: Sends a query string to be executed on the currently connected legacy MCP database. Requires an active connection. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: The query to be executed.
 *             example:
 *               query: "SELECT * FROM users;"
 *     responses:
 *       '200':
 *         description: Query executed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: The result set from the query.
 *       '400':
 *         description: Bad Request (e.g., invalid query, no active connection).
 *       '401':
 *         description: Unauthorized.
 *       '500':
 *         description: Internal Server Error during query execution.
 */
router.post(
  '/query',
  auth(),
  mcpToolboxController.queryController
);

/**
 * @openapi
 * /api/mcp-toolbox/disconnect:
 *   post:
 *     tags:
 *       - MCP Toolbox - Legacy
 *     summary: Disconnect from the legacy MCP database
 *     description: Closes the active connection to the legacy MCP database for the current session. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Disconnection successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Successfully disconnected from the legacy database."
 *       '401':
 *         description: Unauthorized.
 *       '500':
 *         description: Internal Server Error.
 */
router.post(
  '/disconnect',
  auth(),
  mcpToolboxController.disconnectController
);

/**
 * @openapi
 * /api/mcp-toolbox/status:
 *   get:
 *     tags:
 *       - MCP Toolbox - Legacy
 *     summary: Get legacy MCP database connection status
 *     description: Checks and returns the current connection status for the legacy MCP database. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isConnected:
 *                   type: boolean
 *                   description: True if a connection is active, false otherwise.
 *       '401':
 *         description: Unauthorized.
 *       '500':
 *         description: Internal Server Error.
 */
router.get(
  '/status',
  auth(),
  mcpToolboxController.statusController
);

// ==========================================
// B. New Universal Multi-Server Endpoints
// ==========================================

/**
 * @openapi
 * /api/mcp-toolbox/connect-server:
 *   post:
 *     tags:
 *       - MCP Toolbox - Universal
 *     summary: Connect to a universal server
 *     description: Establishes a connection to a specific server instance managed by the MCP system. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serverId:
 *                 type: string
 *                 description: The unique identifier of the server to connect to.
 *             example:
 *               serverId: "server-prod-01"
 *     responses:
 *       '200':
 *         description: Connection request initiated successfully.
 *       '400':
 *         description: Bad Request (e.g., missing serverId).
 *       '401':
 *         description: Unauthorized.
 *       '404':
 *         description: Server not found.
 *       '500':
 *         description: Internal Server Error.
 */
router.post(
  '/connect-server',
  auth(),
  mcpToolboxController.connectServerController
);

/**
 * @openapi
 * /api/mcp-toolbox/stop-server:
 *   post:
 *     tags:
 *       - MCP Toolbox - Universal
 *     summary: Disconnect from a universal server
 *     description: Closes the connection to a specific server instance. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serverId:
 *                 type: string
 *                 description: The unique identifier of the server to disconnect from.
 *             example:
 *               serverId: "server-prod-01"
 *     responses:
 *       '200':
 *         description: Disconnection request initiated successfully.
 *       '400':
 *         description: Bad Request (e.g., missing serverId).
 *       '401':
 *         description: Unauthorized.
 *       '404':
 *         description: Server not found or not connected.
 *       '500':
 *         description: Internal Server Error.
 */
router.post(
  '/stop-server',
  auth(),
  mcpToolboxController.stopServerController
);

/**
 * @openapi
 * /api/mcp-toolbox/servers/{serverId}/tools:
 *   get:
 *     tags:
 *       - MCP Toolbox - Universal
 *     summary: List tools for a specific server
 *     description: Retrieves a list of available tools (callable functions) for a given connected server. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: serverId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the server.
 *     responses:
 *       '200':
 *         description: A list of available tools.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   parameters:
 *                     type: object
 *       '401':
 *         description: Unauthorized.
 *       '404':
 *         description: Server not found or not connected.
 *       '500':
 *         description: Internal Server Error.
 */
router.get(
  '/servers/:serverId/tools',
  auth(),
  mcpToolboxController.listToolsController
);

/**
 * @openapi
 * /api/mcp-toolbox/call-tool:
 *   post:
 *     tags:
 *       - MCP Toolbox - Universal
 *     summary: Execute a tool on a specific server
 *     description: Invokes a specified tool with given arguments on a connected server. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serverId:
 *                 type: string
 *                 description: The ID of the server where the tool resides.
 *               toolName:
 *                 type: string
 *                 description: The name of the tool to execute.
 *               args:
 *                 type: object
 *                 description: An object containing the arguments for the tool.
 *             example:
 *               serverId: "server-prod-01"
 *               toolName: "restart_service"
 *               args:
 *                 serviceName: "web-api"
 *     responses:
 *       '200':
 *         description: The result of the tool execution.
 *       '400':
 *         description: Bad Request (e.g., missing parameters).
 *       '401':
 *         description: Unauthorized.
 *       '404':
 *         description: Server or tool not found.
 *       '500':
 *         description: Internal Server Error or tool execution failed.
 */
router.post(
  '/call-tool',
  auth(),
  mcpToolboxController.callToolController
);

/**
 * @openapi
 * /api/mcp-toolbox/servers/status:
 *   get:
 *     tags:
 *       - MCP Toolbox - Universal
 *     summary: Get dashboard status for all servers
 *     description: Retrieves the connection status and other metadata for all servers relevant to the user's dashboard. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: An array of server statuses.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   serverId:
 *                     type: string
 *                   status:
 *                     type: string
 *                     enum: [connected, disconnected, connecting, error]
 *                   metadata:
 *                     type: object
 *       '401':
 *         description: Unauthorized.
 *       '500':
 *         description: Internal Server Error.
 */
router.get(
  '/servers/status',
  auth(),
  mcpToolboxController.dashboardStatusController
);

/**
 * @openapi
 * /api/mcp-toolbox/sse:
 *   get:
 *     tags:
 *       - MCP Toolbox - Universal
 *     summary: Establish a Server-Sent Events (SSE) connection
 *     description: >
 *       Opens a persistent Server-Sent Events (SSE) connection for receiving real-time updates from the MCP Toolbox.
 *       Clients can subscribe to events like logs, status changes, and tool results. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: SSE connection established. The response body will be a stream of events.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: |
 *                 id: 1
 *                 event: log
 *                 data: {"level": "info", "message": "Server connected"}
 *
 *                 id: 2
 *                 event: status_update
 *                 data: {"serverId": "server-prod-01", "status": "connected"}
 *       '401':
 *         description: Unauthorized.
 */
router.get(
  '/sse',
  auth(),
  mcpToolboxController.sseConnectionHandler
);

/**
 * @openapi
 * /api/mcp-toolbox/message:
 *   post:
 *     tags:
 *       - MCP Toolbox - Universal
 *     summary: Send a message to the MCP system
 *     description: >
 *       Sends a generic message or command to the MCP system. This can be used for interactive sessions,
 *       chat-like functionality with an AI agent, or triggering complex workflows. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: The message content to send.
 *               context:
 *                 type: object
 *                 description: Optional context for the message.
 *             example:
 *               message: "What is the status of the production server?"
 *     responses:
 *       '200':
 *         description: Message received and is being processed. A response may be sent asynchronously via SSE.
 *       '400':
 *         description: Bad Request.
 *       '401':
 *         description: Unauthorized.
 *       '500':
 *         description: Internal Server Error.
 */
router.post(
  '/message',
  auth(),
  mcpToolboxController.mcpMessageHandler
);

// ==========================================
// C. Gateway & Dynamic Registration Endpoints
// ==========================================

/**
 * @openapi
 * /api/mcp-toolbox/register-server:
 *   post:
 *     tags:
 *       - MCP Toolbox - Gateway
 *     summary: Register a new server
 *     description: >
 *       Allows a new server instance to dynamically register itself with the MCP gateway.
 *       This is typically called by a server agent upon its startup. Requires authentication (e.g., a machine-to-machine token).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serverId:
 *                 type: string
 *               address:
 *                 type: string
 *               tools:
 *                 type: array
 *                 items:
 *                   type: object
 *             example:
 *               serverId: "new-web-server-05"
 *               address: "192.168.1.105:5000"
 *               tools: [{ "name": "get_logs", "description": "Fetches service logs." }]
 *     responses:
 *       '200':
 *         description: Server registered successfully.
 *       '400':
 *         description: Bad Request (e.g., invalid registration data).
 *       '401':
 *         description: Unauthorized.
 *       '409':
 *         description: Conflict (e.g., a server with the same ID is already registered).
 *       '500':
 *         description: Internal Server Error.
 */
router.post(
  '/register-server',
  auth(),
  mcpToolboxController.registerServerController
);

/**
 * @openapi
 * /api/mcp-toolbox/install-app:
 *   post:
 *     tags:
 *       - MCP Toolbox - Gateway
 *     summary: Install an application on a server
 *     description: Triggers an installation process for a specified application on a target server via the MCP gateway. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serverId:
 *                 type: string
 *                 description: The ID of the target server.
 *               appName:
 *                 type: string
 *                 description: The name of the application to install.
 *               appVersion:
 *                 type: string
 *                 description: The version of the application to install.
 *             example:
 *               serverId: "server-staging-02"
 *               appName: "monitoring-agent"
 *               appVersion: "2.1.0"
 *     responses:
 *       '202':
 *         description: Installation request accepted and is being processed.
 *       '400':
 *         description: Bad Request.
 *       '401':
 *         description: Unauthorized.
 *       '404':
 *         description: Server not found.
 *       '500':
 *         description: Internal Server Error.
 */
router.post(
  '/install-app',
  auth(),
  mcpToolboxController.installAppController
);

/**
 * @openapi
 * /api/mcp-toolbox/unified/tools:
 *   get:
 *     tags:
 *       - MCP Toolbox - Gateway
 *     summary: List all available tools across all servers
 *     description: Retrieves a unified, de-duplicated list of all tools available across all currently registered and connected servers. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: A unified list of available tools.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   servers:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: A list of server IDs that have this tool.
 *       '401':
 *         description: Unauthorized.
 *       '500':
 *         description: Internal Server Error.
 */
router.get(
  '/unified/tools',
  auth(),
  mcpToolboxController.listUnifiedToolsController
);

/**
 * @openapi
 * /api/mcp-toolbox/unified/call-tool:
 *   post:
 *     tags:
 *       - MCP Toolbox - Gateway
 *     summary: Execute a tool via the gateway
 *     description: >
 *       Invokes a tool by name, allowing the MCP gateway to intelligently route the request to a suitable server
 *       that has the tool available. This is useful for abstracting away the underlying server infrastructure. Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               toolName:
 *                 type: string
 *                 description: The name of the tool to execute.
 *               args:
 *                 type: object
 *                 description: An object containing the arguments for the tool.
 *             example:
 *               toolName: "get_system_load"
 *               args: {}
 *     responses:
 *       '200':
 *         description: The result of the tool execution.
 *       '400':
 *         description: Bad Request.
 *       '401':
 *         description: Unauthorized.
 *       '404':
 *         description: Tool not found on any available server.
 *       '500':
 *         description: Internal Server Error or tool execution failed.
 */
router.post(
  '/unified/call-tool',
  auth(),
  mcpToolboxController.callUnifiedToolController
);

/**
 * Express router for MCP Toolbox module endpoints.
 * Provides routes for legacy database interaction, universal server management,
 * and gateway services for dynamic tool discovery and execution.
 * @type {import('express').Router}
 */
export const mcpToolboxRoutes = router;