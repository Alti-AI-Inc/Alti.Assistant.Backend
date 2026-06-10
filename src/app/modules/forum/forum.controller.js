const httpStatus = require('http-status');
const pick = require('../../middlewares/other/pick');
const ApiError = require('../../utils/ApiError'); // Assuming a custom error class for structured HTTP errors
const catchAsync = require('../../utils/catchAsync'); // Assuming a utility to wrap async route handlers
const logger = require('../../../config/logger'); // BUG FIX: Added logger import
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

module.exports.addForum = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user from request object (populated by auth middleware)
  const data = req.body;

  // CRITICAL INTEGRATION: Check if user or workspace has reached the limit for forum posts before creation.
  await checkUsageAndLimits(user, 'forum_post');

  // SECURITY (Tenant Isolation): Associate the new forum post with the authenticated user and their workspace.
  const forumData = {
    ...data,
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

module.exports.getForum = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const filters = pick(req.query, ['searchTerm', 'title', 'category']);

  // SECURITY (Tenant Isolation): Ensure users can only see forums within their own workspace.
  filters.workspace = user.workspaceId;

  const paginationOptions = pick(req.query, paginationFields);
  const result = await getForumService(filters, paginationOptions);

  res.status(httpStatus.OK).json({
    status: 'success',
    message: 'Forums retrieved successfully',
    data: result,
  });
});

module.exports.getForumById = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const { id } = req.params;

  // SECURITY (Tenant Isolation): Pass workspaceId to the service to ensure the fetched forum belongs to the user's workspace.
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

// SECURITY: Replaced insecure `getForumByEmail` with `getMyForums` to prevent user information leakage.
// This endpoint now fetches forums for the currently authenticated user only.
module.exports.getMyForums = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user

  // The service will fetch all forums where author matches user.id
  const result = await getForumsByAuthorId(user.id, user.workspaceId);

  res.status(httpStatus.OK).json({
    status: 'success',
    message: 'Your forums retrieved successfully',
    data: result,
  });
});

exports.updateForum = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const { id } = req.params;
  const updateBody = req.body;

  // SECURITY (IDOR & Authorization): Pass the user object to the service layer.
  // The service layer MUST verify that the user is either the author of the post
  // or has a role (e.g., 'manager', 'admin', 'super_admin') that permits editing, AND that the post is in their workspace.
  const result = await updateForumService(id, updateBody, user);

  res.status(httpStatus.OK).json({
    status: 'success',
    message: 'Forum updated successfully',
    data: result,
  });
});

exports.deleteForum = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const { id } = req.params;

  // SECURITY (IDOR & Authorization): Pass the user object to the service layer.
  // The service layer MUST verify ownership or role permissions before deleting.
  await deleteForumService(id, user);

  // BUG FIX: Use 204 No Content for successful deletions, as there is no body to return.
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports.getForumSuggestion = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const { suggestion } = req.params;

  // SECURITY (Tenant Isolation): Scope suggestions to the user's workspace to prevent data leakage across tenants.
  const result = await getForumSuggestionService(suggestion, user.workspaceId);

  res.status(httpStatus.OK).json({
    status: 'success',
    message: 'Forum suggestions retrieved successfully',
    data: result,
  });
});

module.exports.addUserForumActivity = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const activityData = req.body; // e.g., { forumId: '...', comment: '...' }

  // CRITICAL INTEGRATION: Check usage limits for comments/activities.
  await checkUsageAndLimits(user, 'forum_activity');

  // SECURITY: Associate activity with the user and pass the user object for validation in the service.
  // The service MUST verify that the target forum (activityData.forumId) exists within the user's workspace.
  const result = await addUserForumActivityServices(activityData, user);

  // CRITICAL INTEGRATION: Record the usage.
  await recordUsage(user, 'forum_activity', { forumId: activityData.forumId, activityId: result.id });

  res.status(httpStatus.CREATED).json({
    status: 'success',
    message: 'Activity added successfully',
    data: result,
  });
});

module.exports.getComment = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const { commentId } = req.params;

  // SECURITY (Tenant Isolation): Pass workspaceId to the service.
  // The service MUST verify the comment belongs to a forum within the user's workspace.
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

exports.deleteComment = catchAsync(async (req, res) => {
  const { user } = req; // AUTH: Get authenticated user
  const { id } = req.params; // This is the comment ID

  // SECURITY (IDOR & Authorization): Pass the user object to the service layer.
  // The service MUST verify the user is the comment author, the forum author, or an admin/manager/super_admin
  // and that the comment is in their workspace before deleting.
  await deleteCommentServices(id, user);

  res.status(httpStatus.NO_CONTENT).send();
});