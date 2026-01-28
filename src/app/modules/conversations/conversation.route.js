import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { conversationController } from './conversation.controller.js';
import { ConversationValidation } from './conversation.validation.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { checkApiCallLimit } from '../../middlewares/tenant/checkTenantLimits.js';

const router = express.Router();

// Create a new conversation
router
  .route('/')
  .post(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    checkApiCallLimit, // Check tenant API call limit
    createRateLimiter(50, 15), // 50 requests per 15 minutes
    validateRequest(ConversationValidation.createConversationSchema),
    conversationController.createConversation,
  )
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    // validateRequest(ConversationValidation.getUserConversationsSchema),
    conversationController.getUserConversations,
  );

// Get conversation statistics
router
  .route('/stats')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    conversationController.getConversationStats,
  );

// Get recent conversations
router
  .route('/recent')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    conversationController.getRecentConversations,
  );

// Get deep search conversations
router
  .route('/deep-search')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    validateRequest(ConversationValidation.getUserConversationsSchema),
    conversationController.getDeepSearchConversations,
  );

// Search conversations
router
  .route('/search')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    // validateRequest(ConversationValidation.searchConversationsSchema),
    conversationController.searchConversations,
  );

router.route('/rename/:conversationId')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    // createRateLimiter(30, 15), // 30 rename operations per 15 minutes
    // validateRequest(ConversationValidation.renameChatSchema),
    conversationController.renameChatConversation,
  );

router.route('/save/:conversationId')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    // createRateLimiter(30, 15), // 30 save operations per 15 minutes
    conversationController.saveChatConversation,
  );

router
  .route('/saved')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    conversationController.getAllSavedConversations,
  );

// Bulk operations
router
  .route('/bulk/archive')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(10, 15), // 10 requests per 15 minutes
    validateRequest(ConversationValidation.bulkOperationSchema),
    conversationController.bulkArchiveConversations,
  );

router
  .route('/bulk/delete')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
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
    extractTenantContext,
    createRateLimiter(20, 15), // 20 deletions per 15 minutes
    conversationController.deleteConversation,
  );

// Update conversation title
router
  .route('/:conversationId/title')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(30, 15), // 30 title updates per 15 minutes
    validateRequest(ConversationValidation.updateTitleSchema),
    conversationController.updateTitle,
  );

// Update conversation metadata
router
  .route('/:conversationId/metadata')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(30, 15), // 30 metadata updates per 15 minutes
    conversationController.updateMetadata,
  );

// Get conversation messages
router
  .route('/:conversationId/messages')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    validateRequest(ConversationValidation.getConversationMessagesSchema),
    conversationController.getConversationMessages,
  )
  .post(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    checkApiCallLimit, // Check tenant API call limit for message sending
    createRateLimiter(100, 15), // 100 messages per 15 minutes
    validateRequest(ConversationValidation.addMessageSchema),
    conversationController.addMessage,
  )
  .delete(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(10, 15), // 10 clear operations per 15 minutes
    validateRequest(ConversationValidation.conversationParamsSchema),
    conversationController.clearMessages,
  );

// Archive conversation
router
  .route('/:conversationId/archive')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(30, 15), // 30 archive operations per 15 minutes
    conversationController.archiveConversation,
  );

// Restore conversation
router
  .route('/:conversationId/restore')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(30, 15), // 30 restore operations per 15 minutes
    conversationController.restoreConversation,
  );

// Permanently delete conversation
router
  .route('/:conversationId/permanent')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(5, 15), // 5 permanent deletions per 15 minutes
    conversationController.permanentlyDeleteConversation,
  );

// Add tags to conversation
router
  .route('/:conversationId/tags')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(50, 15), // 50 tag operations per 15 minutes
    validateRequest(ConversationValidation.addTagsSchema),
    conversationController.addTags,
  );

// Share chat conversation
router
  .route('/:conversationId/share')
  .post(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(20, 15), // 20 share operations per 15 minutes
    validateRequest(ConversationValidation.shareChatSchema),
    conversationController.shareChatConversation,
  )
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(30, 15), // 30 share updates per 15 minutes
    validateRequest(ConversationValidation.updateShareSettingsSchema),
    conversationController.updateChatShareSettings,
  )
  .delete(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(10, 15), // 10 revoke operations per 15 minutes
    conversationController.revokeChatShare,
  );

// Get user's shared chats
router
  .route('/shared')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    conversationController.getUserSharedChats,
  );

// Get public shared chat (no auth required)
router
  .route('/shared/:shareId')
  .get(
    conversationController.getSharedChatConversation,
  );

export const conversationRoutes = router;
