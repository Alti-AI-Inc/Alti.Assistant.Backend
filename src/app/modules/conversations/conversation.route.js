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

/**
 * @swagger
 * tags:
 *   name: Conversations
 *   description: API for managing user conversations and messages.
 */

/**
 * Express router for conversation-related routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * @swagger
 * /conversations:
 *   post:
 *     summary: Create a new conversation
 *     description: Creates a new conversation for the authenticated user within their tenant context.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateConversationRequest'
 *     responses:
 *       201:
 *         description: Conversation created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - checkApiCallLimit
 *       - createRateLimiter(50, 15)
 *       - validateRequest(ConversationValidation.createConversationSchema)
 *   get:
 *     summary: Get user conversations
 *     description: Retrieves a list of conversations for the authenticated user, with optional pagination and filtering.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (ascending or descending).
 *       - in: query
 *         name: archived
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Filter for archived conversations.
 *       - in: query
 *         name: saved
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Filter for saved conversations.
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by conversation category.
 *     responses:
 *       200:
 *         description: A list of conversations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Conversation'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 */
router
  .route('/')
  .post(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    checkApiCallLimit, // Check tenant API call limit
    createRateLimiter(50, 15), // 50 requests per 15 minutes
    validateRequest(ConversationValidation.createConversationSchema),
    conversationController.createConversation
  )
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    // validateRequest(ConversationValidation.getUserConversationsSchema), // This validation is commented out in the original code
    conversationController.getUserConversations
  );

/**
 * @swagger
 * /conversations/stats:
 *   get:
 *     summary: Get conversation statistics
 *     description: Retrieves statistics related to user conversations, such as total count, archived count, etc.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conversation statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalConversations:
 *                   type: integer
 *                   example: 100
 *                 archivedConversations:
 *                   type: integer
 *                   example: 15
 *                 savedConversations:
 *                   type: integer
 *                   example: 20
 *                 # Add other relevant stats
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 */
router
  .route('/stats')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    conversationController.getConversationStats
  );

/**
 * @swagger
 * /conversations/recent:
 *   get:
 *     summary: Get recent conversations
 *     description: Retrieves a list of the most recently updated conversations for the authenticated user.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Number of recent conversations to retrieve.
 *     responses:
 *       200:
 *         description: A list of recent conversations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Conversation'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 */
router
  .route('/recent')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    conversationController.getRecentConversations
  );

/**
 * @swagger
 * /conversations/deep-search:
 *   get:
 *     summary: Perform deep search on conversations
 *     description: Searches conversations and their messages for a given query, returning relevant conversations.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         required: true
 *         description: The term to search for within conversations and messages.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page.
 *     responses:
 *       200:
 *         description: A list of conversations matching the deep search criteria.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Conversation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - validateRequest(ConversationValidation.getUserConversationsSchema) # Assuming this schema includes search params
 */
router
  .route('/deep-search')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    validateRequest(ConversationValidation.getUserConversationsSchema),
    conversationController.getDeepSearchConversations
  );

/**
 * @swagger
 * /conversations/search:
 *   get:
 *     summary: Search conversations by title or tags
 *     description: Searches conversations based on title or associated tags for the authenticated user.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         required: true
 *         description: The term to search for in conversation titles or tags.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page.
 *     responses:
 *       200:
 *         description: A list of conversations matching the search criteria.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Conversation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 */

router.route('/search').get(
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  // validateRequest(ConversationValidation.searchConversationsSchema), // This validation is commented out in the original code
  conversationController.searchConversations
);


/**
 * @swagger
 * /conversations/rename/{conversationId}:
 *   patch:
 *     summary: Rename a conversation
 *     description: Renames the title of a specific conversation.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to rename.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: The new title for the conversation.
 *                 example: "My Renamed Chat"
 *             required:
 *               - title
 *     responses:
 *       200:
 *         description: Conversation renamed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(30, 15)
 *       # - validateRequest(ConversationValidation.renameChatSchema) # This validation is commented out in the original code
 */
router.route('/rename/:conversationId').patch(
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(30, 15),
  // validateRequest(ConversationValidation.renameChatSchema), // This validation is commented out in the original code
  conversationController.renameChatConversation
);

/**
 * @swagger
 * /conversations/save/{conversationId}:
 *   patch:
 *     summary: Save or unsave a conversation
 *     description: Toggles the 'saved' status of a specific conversation.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to save/unsave.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isSaved:
 *                 type: boolean
 *                 description: Set to true to save, false to unsave.
 *                 example: true
 *             required:
 *               - isSaved
 *     responses:
 *       200:
 *         description: Conversation saved/unsaved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(30, 15)
 */
router.route('/save/:conversationId').patch(
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(30, 15),
  conversationController.saveChatConversation
);

/**
 * @swagger
 * /conversations/saved:
 *   get:
 *     summary: Get all saved conversations
 *     description: Retrieves a list of all conversations marked as 'saved' by the authenticated user.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page.
 *     responses:
 *       200:
 *         description: A list of saved conversations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Conversation'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 */
router
  .route('/saved')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    conversationController.getAllSavedConversations
  );

/**
 * @swagger
 * /conversations/bulk/archive:
 *   patch:
 *     summary: Bulk archive conversations
 *     description: Archives multiple conversations simultaneously for the authenticated user.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkOperationRequest'
 *     responses:
 *       200:
 *         description: Conversations archived successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Selected conversations archived successfully."
 *                 archivedCount:
 *                   type: integer
 *                   example: 3
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(10, 15)
 *       - validateRequest(ConversationValidation.bulkOperationSchema)
 */
router.route('/bulk/archive').patch(
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(10, 15), // 10 requests per 15 minutes
  validateRequest(ConversationValidation.bulkOperationSchema),
  conversationController.bulkArchiveConversations
);

/**
 * @swagger
 * /conversations/bulk/delete:
 *   patch:
 *     summary: Bulk delete conversations
 *     description: Deletes multiple conversations simultaneously for the authenticated user.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkOperationRequest'
 *     responses:
 *       200:
 *         description: Conversations deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Selected conversations deleted successfully."
 *                 deletedCount:
 *                   type: integer
 *                   example: 3
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(5, 15)
 *       - validateRequest(ConversationValidation.bulkOperationSchema)
 */
router.route('/bulk/delete').patch(
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(5, 15), // 5 requests per 15 minutes
  validateRequest(ConversationValidation.bulkOperationSchema),
  conversationController.bulkDeleteConversations
);

/**
 * @swagger
 * /conversations/category/{category}:
 *   get:
 *     summary: Get conversations by category
 *     description: Retrieves conversations filtered by a specific category. Authentication is optional.
 *     tags: [Conversations]
 *     parameters:
 *       - in: path
 *         name: category
 *         schema:
 *           type: string
 *         required: true
 *         description: The category name to filter conversations by.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page.
 *     responses:
 *       200:
 *         description: A list of conversations in the specified category.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Conversation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *     x-middleware:
 *       - optionalAuth()
 */
router
  .route('/category/:category')
  .get(optionalAuth(), conversationController.getConversationsByCategory);

/**
 * @swagger
 * /conversations/{conversationId}:
 *   get:
 *     summary: Get a conversation by ID
 *     description: Retrieves a single conversation by its unique ID. Authentication is optional.
 *     tags: [Conversations]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to retrieve.
 *     responses:
 *       200:
 *         description: Conversation retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *     x-middleware:
 *       - optionalAuth()
 *   delete:
 *     summary: Delete a conversation
 *     description: Deletes a specific conversation by its ID. This moves the conversation to an archived/soft-deleted state.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to delete.
 *     responses:
 *       200:
 *         description: Conversation deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Conversation deleted successfully."
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(20, 15)
 */
router
  .route('/:conversationId')
  .get(optionalAuth(), conversationController.getConversationById)
  .delete(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(20, 15), // 20 deletions per 15 minutes
    conversationController.deleteConversation
  );

/**
 * @swagger
 * /conversations/{conversationId}/title:
 *   patch:
 *     summary: Update conversation title
 *     description: Updates the title of a specific conversation.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateConversationTitleRequest'
 *     responses:
 *       200:
 *         description: Conversation title updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(30, 15)
 *       - validateRequest(ConversationValidation.updateTitleSchema)
 */
router.route('/:conversationId/title').patch(
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(30, 15), // 30 title updates per 15 minutes
  validateRequest(ConversationValidation.updateTitleSchema),
  conversationController.updateTitle
);

/**
 * @swagger
 * /conversations/{conversationId}/metadata:
 *   patch:
 *     summary: Update conversation metadata
 *     description: Updates custom metadata associated with a conversation.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to update metadata for.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Key-value pairs for metadata.
 *             example:
 *               customField: "value"
 *               anotherField: 123
 *     responses:
 *       200:
 *         description: Conversation metadata updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(30, 15)
 */
router.route('/:conversationId/metadata').patch(
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(30, 15), // 30 metadata updates per 15 minutes
  conversationController.updateMetadata
);

/**
 * @swagger
 * /conversations/{conversationId}/messages:
 *   get:
 *     summary: Get conversation messages
 *     description: Retrieves messages for a specific conversation, with optional pagination.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to retrieve messages from.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of messages per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order (ascending or descending).
 *     responses:
 *       200:
 *         description: A list of messages for the conversation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - validateRequest(ConversationValidation.getConversationMessagesSchema)
 *   post:
 *     summary: Add a message to a conversation
 *     description: Adds a new message to the specified conversation.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to add a message to.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddMessageRequest'
 *     responses:
 *       201:
 *         description: Message added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - checkApiCallLimit
 *       - createRateLimiter(100, 15)
 *       - validateRequest(ConversationValidation.addMessageSchema)
 *   delete:
 *     summary: Clear all messages in a conversation
 *     description: Deletes all messages associated with a specific conversation.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation whose messages are to be cleared.
 *     responses:
 *       200:
 *         description: All messages cleared successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "All messages cleared for conversation."
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(10, 15)
 *       - validateRequest(ConversationValidation.conversationParamsSchema)
 */
router
  .route('/:conversationId/messages')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    validateRequest(ConversationValidation.getConversationMessagesSchema),
    conversationController.getConversationMessages
  )
  .post(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    checkApiCallLimit, // Check tenant API call limit for message sending
    createRateLimiter(100, 15), // 100 messages per 15 minutes
    validateRequest(ConversationValidation.addMessageSchema),
    conversationController.addMessage
  )
  .delete(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(10, 15), // 10 clear operations per 15 minutes
    validateRequest(ConversationValidation.conversationParamsSchema),
    conversationController.clearMessages
  );

/**
 * @swagger
 * /conversations/{conversationId}/archive:
 *   patch:
 *     summary: Archive a conversation
 *     description: Archives a specific conversation by its ID.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to archive.
 *     responses:
 *       200:
 *         description: Conversation archived successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(30, 15)
 */
router.route('/:conversationId/archive').patch(
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(30, 15), // 30 archive operations per 15 minutes
  conversationController.archiveConversation
);

/**
 * @swagger
 * /conversations/{conversationId}/restore:
 *   patch:
 *     summary: Restore a conversation
 *     description: Restores an archived conversation, making it active again.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to restore.
 *     responses:
 *       200:
 *         description: Conversation restored successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(30, 15)
 */
router.route('/:conversationId/restore').patch(
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(30, 15), // 30 restore operations per 15 minutes
  conversationController.restoreConversation
);

/**
 * @swagger
 * /conversations/{conversationId}/permanent:
 *   delete:
 *     summary: Permanently delete a conversation
 *     description: Permanently deletes a conversation and all its associated data. This action is irreversible.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to permanently delete.
 *     responses:
 *       200:
 *         description: Conversation permanently deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Conversation permanently deleted."
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(5, 15)
 */
router.route('/:conversationId/permanent').delete(
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(5, 15), // 5 permanent deletions per 15 minutes
  conversationController.permanentlyDeleteConversation
);

/**
 * @swagger
 * /conversations/{conversationId}/tags:
 *   patch:
 *     summary: Add tags to a conversation
 *     description: Adds or updates tags associated with a specific conversation.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to add tags to.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddTagsRequest'
 *     responses:
 *       200:
 *         description: Tags added/updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(50, 15)
 *       - validateRequest(ConversationValidation.addTagsSchema)
 */
router.route('/:conversationId/tags').patch(
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(50, 15), // 50 tag operations per 15 minutes
  validateRequest(ConversationValidation.addTagsSchema),
  conversationController.addTags
);

/**
 * @swagger
 * /conversations/{conversationId}/share:
 *   post:
 *     summary: Share a conversation
 *     description: Creates a shareable link for a conversation, allowing it to be viewed publicly or with specific access controls.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to share.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ShareChatRequest'
 *     responses:
 *       201:
 *         description: Conversation shared successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SharedConversation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(20, 15)
 *       - validateRequest(ConversationValidation.shareChatSchema)
 *   patch:
 *     summary: Update conversation share settings
 *     description: Updates the settings (e.g., public/private, password) for an existing shared conversation.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation whose share settings to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateShareSettingsRequest'
 *     responses:
 *       200:
 *         description: Share settings updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SharedConversation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(30, 15)
 *       - validateRequest(ConversationValidation.updateShareSettingsSchema)
 *   delete:
 *     summary: Revoke conversation share
 *     description: Deletes the shareable link for a conversation, making it no longer publicly accessible.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation whose share link to revoke.
 *     responses:
 *       200:
 *         description: Conversation share revoked successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Conversation share revoked."
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 *       - createRateLimiter(10, 15)
 */
router
  .route('/:conversationId/share')
  .post(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(20, 15), // 20 share operations per 15 minutes
    validateRequest(ConversationValidation.shareChatSchema),
    conversationController.shareChatConversation
  )
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(30, 15), // 30 share updates per 15 minutes
    validateRequest(ConversationValidation.updateShareSettingsSchema),
    conversationController.updateChatShareSettings
  )
  .delete(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    createRateLimiter(10, 15), // 10 revoke operations per 15 minutes
    conversationController.revokeChatShare
  );

/**
 * @swagger
 * /conversations/shared:
 *   get:
 *     summary: Get user's shared chats
 *     description: Retrieves a list of all conversations that the authenticated user has shared.
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page.
 *     responses:
 *       200:
 *         description: A list of shared conversations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SharedConversation'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *     x-middleware:
 *       - auth(ADMIN, USER)
 *       - extractTenantContext
 */
router
  .route('/shared')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    extractTenantContext,
    conversationController.getUserSharedChats
  );

/**
 * @swagger
 * /conversations/shared/{shareId}:
 *   get:
 *     summary: Get a public shared conversation
 *     description: Retrieves a shared conversation using its unique share ID. No authentication is required for public shares.
 *     tags: [Conversations]
 *     parameters:
 *       - in: path
 *         name: shareId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The unique ID of the shared conversation.
 *       - in: query
 *         name: password
 *         schema:
 *           type: string
 *         description: Password if the shared conversation is protected.
 *     responses:
 *       200:
 *         description: Shared conversation retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SharedConversationDetails'
 *       401:
 *         description: Unauthorized, if password is required and not provided or incorrect.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router
  .route('/shared/:shareId')
  .get(conversationController.getSharedChatConversation);

/**
 * @swagger
 * components:
 *   schemas:
 *     Conversation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *         userId:
 *           type: string
 *           format: uuid
 *           example: "user-id-123"
 *         tenantId:
 *           type: string
 *           format: uuid
 *           example: "tenant-id-456"
 *         title:
 *           type: string
 *           example: "My First Chat"
 *         isArchived:
 *           type: boolean
 *           example: false
 *         isSaved:
 *           type: boolean
 *           example: false
 *         category:
 *           type: string
 *           nullable: true
 *           example: "Work"
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           example: ["important", "project-x"]
 *         metadata:
 *           type: object
 *           additionalProperties: true
 *           example:
 *             customField: "value"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2023-10-27T10:00:00Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2023-10-27T10:30:00Z"
 *     Message:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "msg-123-abc"
 *         conversationId:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *         sender:
 *           type: string
 *           enum: [user, assistant]
 *           example: "user"
 *         content:
 *           type: string
 *           example: "Hello, how are you?"
 *         timestamp:
 *           type: string
 *           format: date-time
 *           example: "2023-10-27T10:01:00Z"
 *     SharedConversation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "share-id-789"
 *         conversationId:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *         shareLink:
 *           type: string
 *           format: url
 *           example: "https://api.example.com/conversations/shared/share-id-789"
 *         isPublic:
 *           type: boolean
 *           example: true
 *         hasPassword:
 *           type: boolean
 *           example: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2023-10-27T11:00:00Z"
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2023-11-27T11:00:00Z"
 *     SharedConversationDetails:
 *       allOf:
 *         - $ref: '#/components/schemas/SharedConversation'
 *         - type: object
 *           properties:
 *             conversation:
 *               $ref: '#/components/schemas/Conversation'
 *             messages:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Message'
 *     PaginationMeta:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *           example: 1
 *         limit:
 *           type: integer
 *           example: 10
 *         total:
 *           type: integer
 *           example: 100
 *     CreateConversationRequest:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           description: Optional title for the new conversation.
 *           example: "New AI Chat"
 *         initialMessage:
 *           type: string
 *           description: Optional initial message to start the conversation.
 *           example: "Tell me about the latest AI trends."
 *         category:
 *           type: string
 *           description: Optional category for the conversation.
 *           example: "Research"
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           description: Optional list of tags for the conversation.
 *           example: ["AI", "trends"]
 *     BulkOperationRequest:
 *       type: object
 *       required:
 *         - conversationIds
 *       properties:
 *         conversationIds:
 *           type: array
 *           items:
 *             type: string
 *             format: uuid
 *           description: An array of conversation IDs to perform the bulk operation on.
 *           example: ["id1", "id2", "id3"]
 *     UpdateConversationTitleRequest:
 *       type: object
 *       required:
 *         - title
 *       properties:
 *         title:
 *           type: string
 *           description: The new title for the conversation.
 *           example: "Updated Chat Title"
 *     AddMessageRequest:
 *       type: object
 *       required:
 *         - content
 *       properties:
 *         content:
 *           type: string
 *           description: The text content of the message.
 *           example: "What is the capital of France?"
 *         sender:
 *           type: string
 *           enum: [user, assistant]
 *           description: The sender of the message. Defaults to 'user'.
 *           example: "user"
 *     AddTagsRequest:
 *       type: object
 *       required:
 *         - tags
 *       properties:
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           description: An array of tags to add to the conversation. Existing tags will be preserved.
 *           example: ["new-tag", "important"]
 *     ShareChatRequest:
 *       type: object
 *       required:
 *         - isPublic
 *       properties:
 *         isPublic:
 *           type: boolean
 *           description: Whether the shared link should be publicly accessible.
 *           example: true
 *         password:
 *           type: string
 *           nullable: true
 *           description: Optional password to protect the shared link if not public.
 *           example: "securePass123"
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Optional expiration date for the shared link.
 *           example: "2024-12-31T23:59:59Z"
 *     UpdateShareSettingsRequest:
 *       type: object
 *       properties:
 *         isPublic:
 *           type: boolean
 *           description: Update whether the shared link should be publicly accessible.
 *           example: false
 *         password:
 *           type: string
 *           nullable: true
 *           description: Update or set a new password for the shared link. Set to null to remove password.
 *           example: "newSecurePass"
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Update the expiration date for the shared link. Set to null for no expiration.
 *           example: "2025-01-01T00:00:00Z"
 *   responses:
 *     Unauthorized:
 *       description: Authentication required or invalid token.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Unauthorized"
 *     Forbidden:
 *       description: User does not have the necessary permissions.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Forbidden access"
 *     NotFound:
 *       description: Resource not found.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Conversation not found"
 *     BadRequest:
 *       description: Invalid request payload or parameters.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Validation Error"
 *               errors:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     path:
 *                       type: string
 *                     message:
 *                       type: string
 *     TooManyRequests:
 *       description: Rate limit exceeded.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Too many requests, please try again later."
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * Exports the conversation router.
 * @type {express.Router}
 */
export const conversationRoutes = router;