/**
 * @file Defines the routes for the Forum module.
 * @module routes/forum
 * @requires express
 * @requires forumController - Controller for forum-related operations.
 * @requires middlewares/validateRequest - Middleware for validating request bodies.
 * @requires middlewares/tenantContext - Middleware for extracting tenant context from requests.
 * @requires middlewares/auth - Middleware for user authentication and authorization.
 */

const express = require('express');
const router = express.Router();
const forumController = require('./forum.controller');
/**
 * @description Controller for handling comment-related logic.
 * @note This is currently an alias for forumController. For better separation of concerns,
 * it could be refactored into its own `comment.controller.js` file.
 */
const commentController = require('./forum.controller'); // Assuming forum.controller handles comment logic, otherwise this should be a separate comment.controller
const {
  validateRequest,
} = require('../../middlewares/validateRequest/validateRequest');
const {
  extractTenantContext,
} = require('../../middlewares/tenant/tenantContext');
// VULNERABILITY FIX: Import authentication middleware to protect all endpoints.
// Unprotected endpoints allow unauthorized access and modification of data,
// bypassing tenant and role-based security checks.
const { auth } = require('../../middlewares/auth/auth');
// REFACTOR: Import the entire validation schema module to access all forum-related schemas.
const forumValidation = require('./forum.validation');
// const { authController } = require("../auth/auth.controller");

/**
 * @openapi
 * /api/v1/forums/{id}:
 *   get:
 *     summary: Get a specific forum post by its ID
 *     description: Retrieves a single forum post. This is a multi-tenant endpoint and requires authentication.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the forum post.
 *     responses:
 *       200:
 *         description: The forum post was found and returned.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Forum'
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Forum post not found.
 *   patch:
 *     summary: Update a forum post
 *     description: Updates an existing forum post. Requires user to be the author or an administrator. This is a multi-tenant endpoint and requires authentication.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the forum post to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForumUpdate'
 *     responses:
 *       200:
 *         description: The forum post was successfully updated.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Forum'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: User is not authorized to update this post.
 *       404:
 *         description: Forum post not found.
 *   delete:
 *     summary: Delete a forum post
 *     description: Deletes an existing forum post. Requires user to be the author or an administrator. This is a multi-tenant endpoint and requires authentication.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the forum post to delete.
 *     responses:
 *       204:
 *         description: The forum post was successfully deleted.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: User is not authorized to delete this post.
 *       404:
 *         description: Forum post not found.
 */
router
  .route('/:id')
  .get(extractTenantContext, auth(), forumController.getForumById)
  .patch(
    extractTenantContext,
    auth(),
    // BUG FIX: Added validation for the update payload to ensure data integrity.
    validateRequest(forumValidation.updateForumSchema),
    forumController.updateForum,
  )
  .delete(extractTenantContext, auth(), forumController.deleteForum);

/**
 * @openapi
 * /api/v1/forums/comment/{commentId}:
 *   get:
 *     summary: Get a specific comment by its ID
 *     description: Retrieves a single comment from a forum post. This is a multi-tenant endpoint and requires authentication.
 *     tags: [Forums, Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the comment.
 *     responses:
 *       200:
 *         description: The comment was found and returned.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Comment not found.
 */
router
  .route('/comment/:commentId')
  .get(extractTenantContext, auth(), commentController.getComment);

/**
 * @openapi
 * /api/v1/forums/deleteComment/{id}:
 *   delete:
 *     summary: Delete a comment
 *     description: Deletes a specific comment. Requires user to be the author of the comment or an administrator. This is a multi-tenant endpoint and requires authentication.
 *     tags: [Forums, Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the comment to delete.
 *     responses:
 *       204:
 *         description: The comment was successfully deleted.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: User is not authorized to delete this comment.
 *       404:
 *         description: Comment not found.
 */
router
  .route('/deleteComment/:id')
  .delete(extractTenantContext, auth(), commentController.deleteComment);

/**
 * @openapi
 * /api/v1/forums/getBlogByEmail/{email}:
 *   get:
 *     summary: Get all forum posts by a user's email
 *     description: Retrieves all forum posts created by a specific user, identified by their email. This is a multi-tenant endpoint and requires authentication.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         description: The email of the user whose posts are to be retrieved.
 *     responses:
 *       200:
 *         description: A list of forum posts by the specified user.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Forum'
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: No user found with the given email or user has no posts.
 */
router
  .route('/getBlogByEmail/:email')
  .get(extractTenantContext, auth(), commentController.getForumByEmail);

/**
 * @openapi
 * /api/v1/forums:
 *   get:
 *     summary: Get all forum posts
 *     description: Retrieves a list of all forum posts, potentially with pagination. This is a multi-tenant endpoint and requires authentication.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of forum posts.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Forum'
 *       401:
 *         description: Unauthorized.
 *   post:
 *     summary: Create a new forum post
 *     description: Adds a new post to the forum. Requires an authenticated user. This is a multi-tenant endpoint.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForumCreate'
 *     responses:
 *       201:
 *         description: The forum post was successfully created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Forum'
 *       400:
 *         description: Invalid request body.
 *       401:
 *         description: Unauthorized.
 */
router
  .route('/')
  .get(extractTenantContext, auth(), forumController.getForum)
  .post(
    extractTenantContext,
    auth(),
    // BUG FIX: Added validation for the creation payload to ensure data integrity.
    validateRequest(forumValidation.createForumSchema),
    forumController.addForum,
  );

/**
 * @openapi
 * /api/v1/forums/blog-suggestion/{suggestion}:
 *   get:
 *     summary: Get forum post suggestions
 *     description: Retrieves a list of forum posts that match a suggestion or search query. This is a multi-tenant endpoint and requires authentication.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: suggestion
 *         required: true
 *         schema:
 *           type: string
 *         description: The search term to get suggestions for.
 *     responses:
 *       200:
 *         description: A list of suggested forum posts.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Forum'
 *       401:
 *         description: Unauthorized.
 */
router
  .route('/blog-suggestion/:suggestion')
  .get(extractTenantContext, auth(), forumController.getForumSuggestion);

/**
 * @openapi
 * /api/v1/forums/userForumActivity:
 *   post:
 *     summary: Log user activity on a forum post
 *     description: Records a user's activity, such as a like, view, or comment. Requires an authenticated user. This is a multi-tenant endpoint.
 *     tags: [Forums, User Activity]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserForumActivity'
 *     responses:
 *       201:
 *         description: The activity was successfully logged.
 *       400:
 *         description: Invalid request body.
 *       401:
 *         description: Unauthorized.
 */
router
  .route('/userForumActivity')
  .post(
    extractTenantContext,
    auth(),
    // BUG FIX: Added validation for the user activity payload to ensure data integrity.
    validateRequest(forumValidation.forumUserActivitiesValidationSchema),
    commentController.addUserForumActivity,
  );

module.exports = router;