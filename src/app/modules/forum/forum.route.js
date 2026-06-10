/**
 * @file Defines the routes for the Forum module.
 * @module routes/forum
 * @requires express
 * @requires forumController - Controller for forum-related operations.
 * @requires middlewares/validateRequest - Middleware for validating request bodies.
 * @requires middlewares/tenantContext - Middleware for extracting tenant context from requests.
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
const forumUserActivitiesValidationSchema = require('./forum.validation');
// const { authController } = require("../auth/auth.controller");

/**
 * @openapi
 * /api/v1/forums/{id}:
 *   get:
 *     summary: Get a specific forum post by its ID
 *     description: Retrieves a single forum post. This is a multi-tenant endpoint.
 *     tags: [Forums]
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
 *       404:
 *         description: Forum post not found.
 *   patch:
 *     summary: Update a forum post
 *     description: Updates an existing forum post. Requires user to be the author or an administrator. This is a multi-tenant endpoint.
 *     tags: [Forums]
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
 *       403:
 *         description: User is not authorized to update this post.
 *       404:
 *         description: Forum post not found.
 *   delete:
 *     summary: Delete a forum post
 *     description: Deletes an existing forum post. Requires user to be the author or an administrator. This is a multi-tenant endpoint.
 *     tags: [Forums]
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
 *       403:
 *         description: User is not authorized to delete this post.
 *       404:
 *         description: Forum post not found.
 */
router
  .route('/:id')
  .get(extractTenantContext, forumController.getForumById)
  .patch(extractTenantContext, forumController.updateForum)
  .delete(extractTenantContext, forumController.deleteForum);

/**
 * @openapi
 * /api/v1/forums/comment/{commentId}:
 *   get:
 *     summary: Get a specific comment by its ID
 *     description: Retrieves a single comment from a forum post. This is a multi-tenant endpoint.
 *     tags: [Forums, Comments]
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
 *       404:
 *         description: Comment not found.
 */
router
  .route('/comment/:commentId')
  .get(extractTenantContext, commentController.getComment);

/**
 * @openapi
 * /api/v1/forums/deleteComment/{id}:
 *   delete:
 *     summary: Delete a comment
 *     description: Deletes a specific comment. Requires user to be the author of the comment or an administrator. This is a multi-tenant endpoint.
 *     tags: [Forums, Comments]
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
 *       403:
 *         description: User is not authorized to delete this comment.
 *       404:
 *         description: Comment not found.
 */
router
  .route('/deleteComment/:id')
  .delete(extractTenantContext, commentController.deleteComment);

/**
 * @openapi
 * /api/v1/forums/getBlogByEmail/{email}:
 *   get:
 *     summary: Get all forum posts by a user's email
 *     description: Retrieves all forum posts created by a specific user, identified by their email. This is a multi-tenant endpoint.
 *     tags: [Forums]
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
 *       404:
 *         description: No user found with the given email or user has no posts.
 */
router
  .route('/getBlogByEmail/:email')
  .get(extractTenantContext, commentController.getForumByEmail);

/**
 * @openapi
 * /api/v1/forums:
 *   get:
 *     summary: Get all forum posts
 *     description: Retrieves a list of all forum posts, potentially with pagination. This is a multi-tenant endpoint.
 *     tags: [Forums]
 *     responses:
 *       200:
 *         description: A list of forum posts.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Forum'
 *   post:
 *     summary: Create a new forum post
 *     description: Adds a new post to the forum. Requires an authenticated user. This is a multi-tenant endpoint.
 *     tags: [Forums]
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
 */
router
  .route('/')
  .get(extractTenantContext, forumController.getForum)
  // BUG FIX: Removed duplicate .get() for forumController.getForumSuggestion.
  // Express processes routes in order, so the second .get() for the same path would never be reached.
  // getForumSuggestion already has its own dedicated route '/blog-suggestion/:suggestion'.
  .post(extractTenantContext, forumController.addForum);

/**
 * @openapi
 * /api/v1/forums/blog-suggestion/{suggestion}:
 *   get:
 *     summary: Get forum post suggestions
 *     description: Retrieves a list of forum posts that match a suggestion or search query. This is a multi-tenant endpoint.
 *     tags: [Forums]
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
 */
router
  .route('/blog-suggestion/:suggestion')
  .get(extractTenantContext, forumController.getForumSuggestion);

/**
 * @openapi
 * /api/v1/forums/userForumActivity:
 *   post:
 *     summary: Log user activity on a forum post
 *     description: Records a user's activity, such as a like, view, or comment. Requires an authenticated user. This is a multi-tenant endpoint.
 *     tags: [Forums, User Activity]
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
 */
router
  .route('/userForumActivity')
  .post(extractTenantContext, commentController.addUserForumActivity);

module.exports = router;