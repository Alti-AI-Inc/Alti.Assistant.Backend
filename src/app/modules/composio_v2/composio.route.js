import express from 'express';

const router = express.Router();

import { composioController } from './composio.controller.js';
import { aiClassificationController } from './aiClassification.controller.js';
import { workflowRoutes } from './routes/workflow.routes.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';

// Original composio v2 routes
router.post('/initiate', optionalAuth(), composioController.composioInitiateController);
router.post('/wait-for-connection', optionalAuth(), composioController.composioWaitForConnectionController);

// Conversational Composio routes
router.post('/chat', optionalAuth(), composioController.composioConversationController);
router.get('/conversation/:conversationId', optionalAuth(), composioController.getComposioConversationController);
router.get('/conversations', optionalAuth(), composioController.getUserComposioConversationsController);

// AI Classification routes
router.post('/classify-and-execute', optionalAuth(), aiClassificationController.classifyAndExecuteController);
router.get('/supported-apps', aiClassificationController.getSupportedAppsController);
router.post('/test-classification', aiClassificationController.testClassificationController);
router.get('/user-connections', optionalAuth(), aiClassificationController.getUserConnectionsController);
router.get('/conversation-history', optionalAuth(), aiClassificationController.getConversationHistoryController);

// Scheduled Workflow routes
router.use('/workflows', workflowRoutes);

export const composioV2Routes = router;