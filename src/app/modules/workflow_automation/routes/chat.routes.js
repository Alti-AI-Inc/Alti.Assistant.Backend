import express from 'express';
import { chatController } from '../controllers/chat.controller.js';
import auth from '../../../middlewares/auth/auth.js';
import optionalAuth from '../../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';

const router = express.Router();

// Chat-based workflow creation routes
router.post('/create', optionalAuth(), checkDailyRequestLimit, chatController.createWorkflowFromPromptController);
router.post('/confirm', optionalAuth(), checkDailyRequestLimit, chatController.confirmWorkflowCreationController);
router.post('/continue', optionalAuth(), checkDailyRequestLimit, chatController.continueConversationController);

// Conversation management routes
router.get('/conversations', optionalAuth(), chatController.getUserConversationsController);
router.get('/conversations/:conversationId', optionalAuth(), chatController.getConversationController);

export const chatRoutes = router;