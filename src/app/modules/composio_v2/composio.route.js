import express from 'express';

const router = express.Router();

import {composioController} from './composio.controller.js';
import {aiClassificationController} from './aiClassification.controller.js';

// Original composio v2 routes
router.post('/initiate', composioController.composioInitiateController);
router.post('/wait-for-connection', composioController.composioWaitForConnectionController);

// Conversational Composio routes
router.post('/chat', composioController.composioConversationController);
router.get('/conversation/:conversationId', composioController.getComposioConversationController);
router.get('/conversations', composioController.getUserComposioConversationsController);

// AI Classification routes
router.post('/classify-and-execute', aiClassificationController.classifyAndExecuteController);
router.get('/supported-apps', aiClassificationController.getSupportedAppsController);
router.post('/test-classification', aiClassificationController.testClassificationController);
router.get('/user-connections/:userId', aiClassificationController.getUserConnectionsController);

export const composioV2Routes = router;