import express from 'express';
import { composioSimpleController } from './composio.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

// Main chat endpoint
router.post(
  '/chat',
  auth(),
  composioSimpleController.chatController
);

// Authentication endpoints
router.post(
  '/initiate',
  auth(),
  composioSimpleController.initiateAuthController
);

router.post(
  '/wait-for-connection',
  auth(),
  composioSimpleController.waitForConnectionController
);

// Conversation endpoints
router.get(
  '/conversations',
  auth(),
  composioSimpleController.getConversationsController
);

router.get(
  '/conversation/:conversationId',
  auth(),
  composioSimpleController.getConversationController
);

// Connected accounts
router.get(
  '/connected-accounts',
  auth(),
  composioSimpleController.getConnectedAccountsController
);

// Comparison endpoint - runs same request through both systems
router.post(
  '/compare',
  auth(),
  composioSimpleController.compareController
);

export const composioSimpleRoutes = router;
