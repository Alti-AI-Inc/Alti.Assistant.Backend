import express from 'express';
import { chatRoutes } from './routes/chat.routes.js';
import { executionRoutes } from './routes/execution.routes.js';
import { workflowRoutes } from './routes/workflow.routes.js';

/**
 * Express router instance for the workflow automation module.
 * This router serves as the main entry point for all workflow automation related API endpoints,
 * aggregating sub-routes for chat, workflow management, and execution.
 * @type {express.Router}
 */
const router = express.Router();

// Mount sub-routes for different aspects of workflow automation.
/**
 * Mounts the chat-related routes under the '/chat' path.
 * These routes handle interactions and functionalities specific to chat within workflows.
 */
router.use('/chat', chatRoutes);

/**
 * Mounts the workflow management routes under the '/workflows' path.
 * These routes handle operations related to creating, managing, and retrieving workflows.
 */
router.use('/workflows', workflowRoutes);

/**
 * Mounts the workflow execution routes under the '/execution' path.
 * These routes handle the initiation, monitoring, and management of workflow executions.
 */
router.use('/execution', executionRoutes);

/**
 * Exports the main router for the workflow automation module.
 * This router consolidates all API endpoints related to workflow automation,
 * including chat, workflow management, and execution functionalities.
 * It should be mounted under a base path in the main application router.
 * @type {express.Router}
 */
export const workflowAutomationRoutes = router;