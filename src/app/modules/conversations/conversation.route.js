import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { conversationController } from './conversation.controller.js';
import { ConversationValidation } from './conversation.validation.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';

const router = express.Router();

// Create a new conversation
router
  .route('/')
  .post(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    createRateLimiter(50, 15), // 50 requests per 15 minutes
    validateRequest(ConversationValidation.createConversationSchema),
    conversationController.createConversation,
  )
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    validateRequest(ConversationValidation.getUserConversationsSchema),
    conversationController.getUserConversations,
  );

// Get conversation statistics
router
  .route('/stats')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    conversationController.getConversationStats,
  );

// Get recent conversations
router
  .route('/recent')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    conversationController.getRecentConversations,
  );

// Get deep search conversations
router
  .route('/deep-search')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    validateRequest(ConversationValidation.getUserConversationsSchema),
    conversationController.getDeepSearchConversations,
  );

// Search conversations
router
  .route('/search')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    validateRequest(ConversationValidation.searchConversationsSchema),
    conversationController.searchConversations,
  );

// Bulk operations
router
  .route('/bulk/archive')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    createRateLimiter(10, 15), // 10 requests per 15 minutes
    validateRequest(ConversationValidation.bulkOperationSchema),
    conversationController.bulkArchiveConversations,
  );

router
  .route('/bulk/delete')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    createRateLimiter(5, 15), // 5 requests per 15 minutes
    validateRequest(ConversationValidation.bulkOperationSchema),
    conversationController.bulkDeleteConversations,
  );

// Get conversations by category
router
  .route('/category/:category')
  .get(
    optionalAuth(),
    conversationController.getConversationsByCategory,
  );

// Specific conversation operations
router
  .route('/:conversationId')
  .get(
    optionalAuth(),
    conversationController.getConversationById,
  )
  .delete(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    createRateLimiter(20, 15), // 20 deletions per 15 minutes
    conversationController.deleteConversation,
  );

// Update conversation title
router
  .route('/:conversationId/title')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    createRateLimiter(30, 15), // 30 title updates per 15 minutes
    validateRequest(ConversationValidation.updateTitleSchema),
    conversationController.updateTitle,
  );

// Update conversation metadata
router
  .route('/:conversationId/metadata')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    createRateLimiter(30, 15), // 30 metadata updates per 15 minutes
    conversationController.updateMetadata,
  );

// Get conversation messages
router
  .route('/:conversationId/messages')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    validateRequest(ConversationValidation.getConversationMessagesSchema),
    conversationController.getConversationMessages,
  )
  .post(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    createRateLimiter(100, 15), // 100 messages per 15 minutes
    validateRequest(ConversationValidation.addMessageSchema),
    conversationController.addMessage,
  )
  .delete(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    createRateLimiter(10, 15), // 10 clear operations per 15 minutes
    validateRequest(ConversationValidation.conversationParamsSchema),
    conversationController.clearMessages,
  );

// Archive conversation
router
  .route('/:conversationId/archive')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    createRateLimiter(30, 15), // 30 archive operations per 15 minutes
    conversationController.archiveConversation,
  );

// Restore conversation
router
  .route('/:conversationId/restore')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    createRateLimiter(30, 15), // 30 restore operations per 15 minutes
    conversationController.restoreConversation,
  );

// Permanently delete conversation
router
  .route('/:conversationId/permanent')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    createRateLimiter(5, 15), // 5 permanent deletions per 15 minutes
    conversationController.permanentlyDeleteConversation,
  );

// Add tags to conversation
router
  .route('/:conversationId/tags')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    createRateLimiter(50, 15), // 50 tag operations per 15 minutes
    validateRequest(ConversationValidation.addTagsSchema),
    conversationController.addTags,
  );

export const conversationRoutes = router;
