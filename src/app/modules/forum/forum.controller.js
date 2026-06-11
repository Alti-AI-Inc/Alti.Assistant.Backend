const httpStatus = require('http-status');
const sanitizeHtml = require('sanitize-html');
const pick = require('../../middlewares/other/pick');
const ApiError = require('../../utils/ApiError'); // Assuming a custom error class for structured HTTP errors
const catchAsync = require('../../utils/catchAsync'); // Assuming a utility to wrap async route handlers
const logger = require('../../../shared/logger.js'); // BUG FIX: Added logger import
const { paginationFields } = require('./forum.constant');
const {
  addForumServices,
  getForumService,
  getForumServiceById,
  getForumsByAuthorId, // SECURITY: Renamed from getForumServiceByEmail for security
  updateForumService,
  deleteForumService,
  getForumSuggestionService,
  addUserForumActivityServices,
  getCommnetService,
  deleteCommentServices,
} = require('./forum.service');
// CRITICAL INTEGRATION: Import usage and notification services (placeholders for real implementation)
const { checkUsageAndLimits, recordUsage } = require('../usage/usage.service');

// SECURITY: All endpoints now require authentication and are scoped to the user's workspace/tenant.
// Authorization logic (e.g., checking roles like 'admin', 'manager') is delegated to the service layer.

/**
 * @constant {object}
 * @description Strict sanitizer options for plain text fields to prevent any HTML injection.
 * Disallows all HTML tags and attributes.
 * @type {import('sanitize-html').IOptions}
 */
const plainTextSanitizerOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

/**
 * @constant {object}
 * @description Sanitizer options for rich content, allowing a safe subset of HTML for formatting.
 * This prevents stored XSS attacks while preserving user-intended formatting like paragraphs, lists, and links.
 * @type {import('sanitize-html').IOptions}
 */
const richContentSanitizerOptions = {
  allowedTags: [
    'p',
    'b',
    'i',
    'em',
    'strong',
    'a',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'br',
    'hr',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'], // Add rel="noopener noreferrer" on the frontend for safety
  },
  allowedSchemes: ['http', 'https', 'mailto'],
};

/**
 * @openapi
 * /forums:
 *   post:
 *     summary: Create a new forum post
 *     description: Creates a new forum post within the authenticated user's workspace. Checks usage limits before creation.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 description: The title of the forum post.
 *               content:
 *                 type: string
 *                 description: The main content of the forum post (can be HTML or markdown).
 *               category:
 *                 type: string
 *                 description: The category of the forum post.
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: A list of tags associated with the post.
 *             example:
 *               title: "How to integrate with the new API?"
 *               content: "<p>I'm having trouble understanding the authentication flow for the v2 API. Can someone provide an example?</p>"
 *               category: "API Integration"
 *               tags: ["api", "v2", "authentication"]
 *     responses:
 *       "201":
 *         description: Created. The forum post was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Forum created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Forum'
 *       "400":
 *         description: Bad Request. Invalid input data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       "401":
 *         description: Unauthorized. Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       "403":
 *         description: Forbidden. The user has reached their usage limit for creating forum posts.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/**
 * @summary Create a new forum post.
 * @description Handles the request to create a new forum post. It performs usage limit checks, sanitizes user input to prevent XSS, associates the post with the authenticated user's workspace for tenant isolation, and records the usage upon successful creation.
 * @param {import('express').Request} req - The Express request object, containing the authenticated user in `req.user` and post data in `req.body`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
module.exports.addForum = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user from request object (populated by auth middleware)
  const data = req.body;

  // CRITICAL INTEGRATION: Check if user or workspace has reached the limit for forum posts before creation.
  await checkUsageAndLimits(user, 'forum_post');

  // SECURITY (XSS Protection): Sanitize all user-provided input before processing to prevent stored XSS.
  const sanitizedTitle = data.title ? sanitizeHtml(data.title, plainTextSanitizerOptions) : '';
  const sanitizedContent = data.content ? sanitizeHtml(data.content, richContentSanitizerOptions) : '';
  const sanitizedCategory = data.category ? sanitizeHtml(data.category, plainTextSanitizerOptions) : undefined;
  const sanitizedTags =
    data.tags && Array.isArray(data.tags)
      ? data.tags.map((tag) => sanitizeHtml(tag, plainTextSanitizerOptions))
      : [];

  // SECURITY (Tenant Isolation): Associate the new forum post with the authenticated user and their workspace.
  const forumData = {
    title: sanitizedTitle,
    content: sanitizedContent,
    category: sanitizedCategory,
    tags: sanitizedTags,
    author: user.id,
    workspace: user.workspaceId,
  };

  const result = await addForumServices(forumData);

  // CRITICAL INTEGRATION: Record the usage for analytics and limit tracking after successful creation.
  await recordUsage(user, 'forum_post', { forumId: result.id });

  res.status(httpStatus.CREATED).json({
    status: 'success',
    message: 'Forum created successfully',
    data: result,
  });
});

/**
 * @openapi
 * /forums:
 *   get:
 *     summary: Get all forum posts
 *     description: Retrieves a paginated list of forum posts within the user's workspace. Supports filtering and searching.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: A search term to filter posts by title or content.
 *       - in: query
 *         name: title
 *         schema:
 *           type: string
 *         description: Filter posts by exact title.
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter posts by category.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: The page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: The number of results per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: 'Sort order, e.g., `createdAt:desc`.'
 *     responses:
 *       "200":
 *         description: OK. A list of forum posts.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Forums retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Forum'
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalResults:
 *                       type: integer
 *       "401":
 *         description: Unauthorized. Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/**
 * @summary Retrieves a paginated list of forum posts.
 * @description Fetches forum posts based on query filters and pagination options. All queries are scoped to the authenticated user's workspace to ensure tenant isolation.
 * @param {import('express').Request} req - The Express request object, containing the authenticated user and query parameters for filtering/pagination.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
module.exports.getForum = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const filters = pick(req.query, ['searchTerm', 'title', 'category']);

  // SECURITY (Tenant Isolation): Ensure users can only see forums within their own workspace.
  filters.workspace = user.workspaceId;

  const paginationOptions = pick(req.query, paginationFields);

  // PERFORMANCE: The `getForumService` should use `.lean()` to return plain JavaScript objects instead of Mongoose documents,
  // which is significantly faster for read-only operations.
  // PERFORMANCE: For efficient filtering and searching, ensure the 'forums' collection has the following indexes:
  // 1. A compound index for filtering: `{ workspaceId: 1, category: 1, createdAt: -1 }` (adjust sort field as needed).
  // 2. A text index for `searchTerm`: `{ title: 'text', content: 'text' }`.
  const result = await getForumService(filters, paginationOptions);

  res.status(httpStatus.OK).json({
    status: 'success',
    message: 'Forums retrieved successfully',
    data: result,
  });
});

/**
 * @openapi
 * /forums/{id}:
 *   get:
 *     summary: Get a forum post by ID
 *     description: Retrieves a single forum post by its ID, ensuring it belongs to the user's workspace.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the forum post.
 *     responses:
 *       "200":
 *         description: OK. The requested forum post.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Forum retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/Forum'
 *       "401":
 *         description: Unauthorized. Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       "404":
 *         description: Not Found. The forum post with the specified ID was not found or is not in the user's workspace.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/**
 * @summary Retrieves a single forum post by its ID.
 * @description Fetches a specific forum post, ensuring it belongs to the authenticated user's workspace. Throws a 404 error if the post is not found or not within the user's tenant context.
 * @param {import('express').Request} req - The Express request object, containing the post ID in `req.params` and the user in `req.user`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
module.exports.getForumById = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const { id } = req.params;

  // SECURITY (Tenant Isolation): Pass workspaceId to the service to ensure the fetched forum belongs to the user's workspace.
  // PERFORMANCE: The `getForumServiceById` should use `.lean()` for faster read performance,
  // as the retrieved data is not modified before being sent in the response.
  // The query should also filter by `workspaceId` directly, e.g., `Forum.findOne({ _id: id, workspaceId }).lean()`.
  const result = await getForumServiceById(id, user.workspaceId);

  // BUG FIX: Handle case where forum is not found or is outside the user's tenant context.
  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Forum not found');
  }

  res.status(httpStatus.OK).json({
    status: 'success',
    message: 'Forum retrieved successfully',
    data: result,
  });
});

/**
 * @openapi
 * /forums/me:
 *   get:
 *     summary: Get my forum posts
 *     description: Retrieves all forum posts created by the currently authenticated user.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: OK. A list of the user's forum posts.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Your forums retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Forum'
 *       "401":
 *         description: Unauthorized. Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/**
 * @summary Retrieves all forum posts created by the authenticated user.
 * @description Fetches a list of forum posts where the author is the currently authenticated user, scoped to their workspace.
 * @param {import('express').Request} req - The Express request object, containing the authenticated user.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
// SECURITY: Replaced insecure `getForumByEmail` with `getMyForums` to prevent user information leakage.
// This endpoint now fetches forums for the currently authenticated user only.
module.exports.getMyForums = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user

  // The service will fetch all forums where author matches user.id
  // PERFORMANCE: The `getForumsByAuthorId` service should use `.lean()` to improve query speed for this read-only operation.
  // PERFORMANCE: Ensure an index exists on `{ workspaceId: 1, author: 1 }` in the 'forums' collection
  // to make this user-specific query highly efficient.
  const result = await getForumsByAuthorId(user.id, user.workspaceId);

  res.status(httpStatus.OK).json({
    status: 'success',
    message: 'Your forums retrieved successfully',
    data: result,
  });
});

/**
 * @openapi
 * /forums/{id}:
 *   patch:
 *     summary: Update a forum post
 *     description: Updates an existing forum post. Requires the user to be the author or have administrative privileges (e.g., 'manager', 'admin').
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the forum post to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *             example:
 *               title: "Updated: How to integrate with the new API?"
 *               content: "<p>Update: I figured it out. Here's the solution...</p>"
 *     responses:
 *       "200":
 *         description: OK. The forum post was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Forum updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Forum'
 *       "401":
 *         description: Unauthorized. Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       "403":
 *         description: Forbidden. The user does not have permission to update this post.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       "404":
 *         description: Not Found. The forum post was not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/**
 * @summary Updates an existing forum post.
 * @description Handles updates to a forum post. It sanitizes input and delegates authorization to the service layer, which must verify that the user is the post's author or has an administrative role (e.g., 'manager', 'admin'). The operation is scoped to the user's workspace.
 * @param {import('express').Request} req - The Express request object, containing the post ID in `req.params`, update data in `req.body`, and the authenticated user in `req.user`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
exports.updateForum = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const { id } = req.params;
  const updateBody = req.body;

  // SECURITY (XSS Protection): Sanitize all user-provided input before processing to prevent stored XSS.
  const sanitizedUpdateBody = {};
  if (updateBody.title) {
    sanitizedUpdateBody.title = sanitizeHtml(updateBody.title, plainTextSanitizerOptions);
  }
  if (updateBody.content) {
    sanitizedUpdateBody.content = sanitizeHtml(updateBody.content, richContentSanitizerOptions);
  }
  if (updateBody.category) {
    sanitizedUpdateBody.category = sanitizeHtml(updateBody.category, plainTextSanitizerOptions);
  }
  if (updateBody.tags && Array.isArray(updateBody.tags)) {
    sanitizedUpdateBody.tags = updateBody.tags.map((tag) => sanitizeHtml(tag, plainTextSanitizerOptions));
  }

  // SECURITY (IDOR & Authorization): Pass the user object to the service layer.
  // The service layer MUST verify that the user is either the author of the post
  // or has a role (e.g., 'manager', 'admin', 'super_admin') that permits editing, AND that the post is in their workspace.
  const result = await updateForumService(id, sanitizedUpdateBody, user);

  res.status(httpStatus.OK).json({
    status: 'success',
    message: 'Forum updated successfully',
    data: result,
  });
});

/**
 * @openapi
 * /forums/{id}:
 *   delete:
 *     summary: Delete a forum post
 *     description: Deletes a forum post. Requires the user to be the author or have administrative privileges (e.g., 'manager', 'admin').
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the forum post to delete.
 *     responses:
 *       "204":
 *         description: No Content. The forum post was deleted successfully.
 *       "401":
 *         description: Unauthorized. Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       "403":
 *         description: Forbidden. The user does not have permission to delete this post.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       "404":
 *         description: Not Found. The forum post was not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/**
 * @summary Deletes a forum post.
 * @description Handles the deletion of a forum post. Authorization is delegated to the service layer, which must verify ownership or administrative privileges (e.g., 'manager', 'admin') before proceeding.
 * @param {import('express').Request} req - The Express request object, containing the post ID in `req.params` and the authenticated user in `req.user`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
exports.deleteForum = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const { id } = req.params;

  // SECURITY (IDOR & Authorization): Pass the user object to the service layer.
  // The service layer MUST verify ownership or role permissions before deleting.
  await deleteForumService(id, user);

  // BUG FIX: Use 204 No Content for successful deletions, as there is no body to return.
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * @openapi
 * /forums/suggestions/{suggestion}:
 *   get:
 *     summary: Get forum suggestions
 *     description: Retrieves forum post suggestions based on a search term, scoped to the user's workspace.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: suggestion
 *         required: true
 *         schema:
 *           type: string
 *         description: The search term for which to find suggestions.
 *     responses:
 *       "200":
 *         description: OK. A list of forum suggestions.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Forum suggestions retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Forum'
 *       "401":
 *         description: Unauthorized. Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/**
 * @summary Gets forum post suggestions based on a search term.
 * @description Retrieves a list of forum posts that match a given suggestion term, scoped to the user's workspace to prevent data leakage.
 * @param {import('express').Request} req - The Express request object, containing the suggestion term in `req.params` and the authenticated user in `req.user`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
module.exports.getForumSuggestion = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const { suggestion } = req.params;

  // SECURITY (Tenant Isolation): Scope suggestions to the user's workspace to prevent data leakage across tenants.
  // PERFORMANCE: The `getForumSuggestionService` should use `.lean()` for faster query execution.
  // PERFORMANCE: For efficient text-based suggestions, the 'forums' collection should have a text index
  // on the fields being searched, e.g., `{ title: 'text', content: 'text' }`.
  // The service should also filter by `workspaceId`.
  const result = await getForumSuggestionService(suggestion, user.workspaceId);

  res.status(httpStatus.OK).json({
    status: 'success',
    message: 'Forum suggestions retrieved successfully',
    data: result,
  });
});

/**
 * @openapi
 * /forums/activities:
 *   post:
 *     summary: Add an activity to a forum post
 *     description: Adds an activity, such as a comment, to a specific forum post. The target forum must be in the user's workspace. Checks usage limits.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - forumId
 *               - comment
 *             properties:
 *               forumId:
 *                 type: string
 *                 description: The ID of the forum post to add the activity to.
 *               comment:
 *                 type: string
 *                 description: The content of the comment.
 *             example:
 *               forumId: "60d0fe4f5311236168a109ca"
 *               comment: "This is a very helpful post, thank you!"
 *     responses:
 *       "201":
 *         description: Created. The activity was added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Activity added successfully
 *                 data:
 *                   $ref: '#/components/schemas/ForumActivity'
 *       "401":
 *         description: Unauthorized. Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       "403":
 *         description: Forbidden. The user has reached their usage limit for forum activities.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       "404":
 *         description: Not Found. The target forum post was not found in the user's workspace.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/**
 * @summary Adds a new activity (e.g., a comment) to a forum post.
 * @description Handles the creation of a forum activity. It checks usage limits, sanitizes the comment content, and ensures the target forum post exists within the user's workspace.
 * @param {import('express').Request} req - The Express request object, containing the activity data in `req.body` and the authenticated user in `req.user`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
module.exports.addUserForumActivity = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const activityData = req.body; // e.g., { forumId: '...', comment: '...' }

  // CRITICAL INTEGRATION: Check usage limits for comments/activities.
  await checkUsageAndLimits(user, 'forum_activity');

  // SECURITY (XSS Protection): Sanitize comment content before processing to prevent stored XSS.
  const sanitizedComment = activityData.comment ? sanitizeHtml(activityData.comment, richContentSanitizerOptions) : '';

  const sanitizedActivityData = {
    ...activityData,
    comment: sanitizedComment,
  };

  // SECURITY: Associate activity with the user and pass the user object for validation in the service.
  // The service MUST verify that the target forum (activityData.forumId) exists within the user's workspace.
  const result = await addUserForumActivityServices(sanitizedActivityData, user);

  // CRITICAL INTEGRATION: Record the usage.
  await recordUsage(user, 'forum_activity', { forumId: activityData.forumId, activityId: result.id });

  res.status(httpStatus.CREATED).json({
    status: 'success',
    message: 'Activity added successfully',
    data: result,
  });
});

/**
 * @openapi
 * /forums/comments/{commentId}:
 *   get:
 *     summary: Get a comment by ID
 *     description: Retrieves a single comment by its ID, ensuring it belongs to a forum within the user's workspace.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the comment.
 *     responses:
 *       "200":
 *         description: OK. The requested comment.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Comment retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/ForumActivity'
 *       "401":
 *         description: Unauthorized. Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       "404":
 *         description: Not Found. The comment was not found or is not in the user's workspace.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/**
 * @summary Retrieves a single comment by its ID.
 * @description Fetches a specific comment, ensuring it belongs to a forum within the authenticated user's workspace.
 * @param {import('express').Request} req - The Express request object, containing the comment ID in `req.params` and the authenticated user in `req.user`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
module.exports.getComment = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const { commentId } = req.params;

  // SECURITY (Tenant Isolation): Pass workspaceId to the service.
  // The service MUST verify the comment belongs to a forum within the user's workspace.
  // PERFORMANCE: The `getCommnetService` should use `.lean()` for faster read performance.
  // PERFORMANCE (N+1 Risk): To verify the comment belongs to the user's workspace, avoid separate queries for the comment and its parent forum.
  // Instead, use a single, efficient query, possibly with an aggregation pipeline, to join the 'forumactivities' and 'forums' collections
  // and filter by `commentId` and `workspaceId` simultaneously.
  // Example Aggregation Logic:
  // 1. $match: { _id: commentId }
  // 2. $lookup: { from: 'forums', localField: 'forum', foreignField: '_id', as: 'forumDoc' }
  // 3. $unwind: '$forumDoc'
  // 4. $match: { 'forumDoc.workspace': workspaceId }
  const result = await getCommnetService(commentId, user.workspaceId);

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Comment not found');
  }

  res.status(httpStatus.OK).json({
    status: 'success',
    message: 'Comment retrieved successfully',
    data: result,
  });
});

/**
 * @openapi
 * /forums/comments/{id}:
 *   delete:
 *     summary: Delete a comment
 *     description: Deletes a comment. Requires the user to be the author of the comment, the author of the parent forum post, or have administrative privileges.
 *     tags: [Forums]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the comment to delete.
 *     responses:
 *       "204":
 *         description: No Content. The comment was deleted successfully.
 *       "401":
 *         description: Unauthorized. Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       "403":
 *         description: Forbidden. The user does not have permission to delete this comment.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       "404":
 *         description: Not Found. The comment was not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/**
 * @summary Deletes a comment.
 * @description Handles the deletion of a comment. Authorization is delegated to the service layer, which must verify that the user is the comment's author, the parent forum's author, or has administrative privileges (e.g., 'manager', 'admin').
 * @param {import('express').Request} req - The Express request object, containing the comment ID in `req.params` and the authenticated user in `req.user`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
exports.deleteComment = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const { id } = req.params; // This is the comment ID

  // SECURITY (IDOR & Authorization): Pass the user object to the service layer.
  // The service MUST verify the user is the comment author, the forum author, or an admin/manager/super_admin
  // and that the comment is in their workspace before deleting.
  await deleteCommentServices(id, user);

  res.status(httpStatus.NO_CONTENT).send();
});