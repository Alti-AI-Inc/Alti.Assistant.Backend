import express from 'express';
import { chatController } from '../controllers/chat.controller.js';
import auth from '../../../middlewares/auth/auth.js';
import optionalAuth from '../../../middlewares/auth/optionalAuth.js';

const router = express.Router();

// Chat-based workflow creation routes
router.post('/create', optionalAuth(), chatController.createWorkflowFromPromptController);
router.post('/confirm', optionalAuth(), chatController.confirmWorkflowCreationController);
router.post('/continue', optionalAuth(), chatController.continueConversationController);

// Conversation management routes
router.get('/conversations', optionalAuth(), chatController.getUserConversationsController);
router.get('/conversations/:conversationId', optionalAuth(), chatController.getConversationController);

export const chatRoutes = router;