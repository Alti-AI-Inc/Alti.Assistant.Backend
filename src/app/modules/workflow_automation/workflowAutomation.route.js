import express from 'express';
import { chatRoutes } from './routes/chat.routes.js';
import { executionRoutes } from './routes/execution.routes.js';
import { workflowRoutes } from './routes/workflow.routes.js';

const router = express.Router();

// Mount sub-routes
router.use('/chat', chatRoutes);
router.use('/workflows', workflowRoutes);
router.use('/execution', executionRoutes);

export const workflowAutomationRoutes = router;