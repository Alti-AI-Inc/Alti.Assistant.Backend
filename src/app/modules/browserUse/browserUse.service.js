import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';
import BrowserSession from './browserUse.model.js';
import User from '../auth/auth.model.js';
import { withTenantFilter } from '../../helpers/tenantQuery.js';

/**
 * @typedef {import('./browserUse.model').IBrowserSession} IBrowserSession
 * @typedef {import('../auth/auth.model').IUser} IUser
 * @typedef {import('express').Request} Request
 */

/**
 * Validates the user and tenant context to ensure proper role-based access control
 * and tenant boundary isolation.
 *
 * @param {string} userId - The ID of the target user.
 * @param {Request | null} req - The Express request object.
 * @throws {ApiError} If validation fails.
 */
const validateUserAndTenantContext = async (userId, req) => {
  if (!req || !req.user) return;

  const actor = req.user; // The authenticated user making the request
  const targetUser = await User.findById(userId);

  if (!targetUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Target user not found');
  }

  // Validate actor role
  const validRoles = ['super_admin', 'admin', 'manager', 'user'];
  if (!validRoles.includes(actor.role)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: Invalid actor role');
  }

  // Tenant boundary check: non-super_admins cannot access other tenants
  if (actor.role !== 'super_admin') {
    const actorTenantId = actor.currentTenantId || req.tenantId;
    if (actorTenantId && targetUser.tenantId && targetUser.tenantId.toString() !== actorTenantId.toString()) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: Tenant boundary violation');
    }
  }
};

/**
 * Checks usage limits based on user roles and propagates usage details
 * and notifications up to managers and administrators.
 *
 * @param {string} userId - The ID of the user initiating the task.
 * @param {string | null} tenantId - The active tenant ID.
 * @throws {ApiError} If usage limits are exceeded.
 */
const propagateUsageAndCheckLimits = async (userId, tenantId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // 1. Check Limits based on role
  const sessionCount = await BrowserSession.countDocuments({ user: userId });
  let limit = 100; // Default limit
  if (user.role === 'user') limit = 10;
  if (user.role === 'manager') limit = 50;
  if (user.role === 'admin') limit = 200;
  if (user.role === 'super_admin') limit = Infinity;

  if (sessionCount >= limit) {
    throw new ApiError(
      httpStatus.PAYMENT_REQUIRED,
      `Usage limit reached for role '${user.role}'. Limit: ${limit}, Current: ${sessionCount}`
    );
  }

  // 2. Propagate usage details and notifications up the hierarchy
  const managersAndAdmins = await User.find({
    tenantId: tenantId || user.tenantId,
    role: { $in: ['manager', 'admin'] },
    _id: { $ne: userId } // Don't notify self
  });

  logger.info(
    `[Usage Propagation] User ${userId} (${user.role}) initiated a browser session. Current count: ${sessionCount + 1}/${limit}.`
  );

  for (const supervisor of managersAndAdmins) {
    logger.info(
      `[Notification] Sent to ${supervisor.role} (ID: ${supervisor._id}): User ${userId} has consumed 1 browser session unit.`
    );
    
    // Safely increment managed usage if tracked on the supervisor
    if (supervisor.managedUsage) {
      await User.findByIdAndUpdate(supervisor._id, {
        $inc: { 'managedUsage.browserSessionsCount': 1 }
      });
    }
  }

  // Also notify direct manager if specified on the user document
  if (user.managerId && user.managerId.toString() !== userId) {
    const directManager = await User.findById(user.managerId);
    if (directManager) {
      logger.info(
        `[Notification] Direct Manager (ID: ${directManager._id}) notified of user ${userId} activity.`
      );
    }
  }
};

/**
 * Initiates a browser automation task via an external API and records it in a user's session.
 * If a sessionId is provided, the task is added to an existing session. Otherwise, a new session is created.
 *
 * @param {string} userId - The ID of the user initiating the task.
 * @param {string | null} sessionId - The ID of an existing browser session to add the task to, or null to create a new session.
 * @param {string} prompt - The natural language prompt/task for the browser automation.
 * @param {object | null} structuredOutputSchema - An optional JSON schema for the desired structured output from the browser task.
 * @param {Request | null} [req=null] - The Express request object, used for tenant filtering.
 * @returns {Promise<IBrowserSession>} A promise that resolves to the updated or newly created browser session document.
 * @throws {ApiError} If the external API does not return a task ID, or if the specified session is not found.
 */
const initiateTaskInSessionService = async (
  userId,
  sessionId,
  prompt,
  structuredOutputSchema,
  req = null
) => {
  const tenantId = req ? (req.user?.currentTenantId || req.tenantId || null) : null;

  // Validate context and check limits before calling external API to save costs
  await validateUserAndTenantContext(userId, req);
  await propagateUsageAndCheckLimits(userId, tenantId);

  const apiBody = {
    task: prompt,
    secrets: {},
    allowed_domains: null,
    save_browser_data: true,
    llm_model: 'gemini-2.5-flash',
    use_adblock: true,
    use_proxy: true,
    highlight_elements: true,
  };

  if (structuredOutputSchema) {
    apiBody.structured_output_json = structuredOutputSchema;
  }

  const apiResponse = await axios.post(
    'https://api.browser-use.com/api/v1/run-task',
    apiBody,
    {
      headers: {
        Authorization: `Bearer ${config.browser_use_secret_key}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const apiData = apiResponse.data;

  if (!apiData.id) {
    throw new ApiError(httpStatus.NOT_FOUND, 'API did not return a task ID');
  }

  const newResponseObject = {
    taskId: apiData.id,
    status: apiData.status || 'created',
    prompt: prompt,
    live_url: apiData.live_url,
    steps: apiData.steps || [],
  };

  if (sessionId) {
    const query = req ? withTenantFilter(req, { _id: sessionId, user: userId }) : { _id: sessionId, user: userId };
    const session = await BrowserSession.findOne(query);
    if (!session)
      throw new ApiError(httpStatus.NOT_FOUND, 'Session not found.');

    session.responses.push(newResponseObject);
    await session.save();
    return session;
  } else {
    const newSession = await BrowserSession.create({
      user: userId,
      tenantId: tenantId,
      responses: [newResponseObject],
    });

    await User.findByIdAndUpdate(userId, {
      $push: { browserSessions: newSession._id },
    });

    return newSession;
  }
};

/**
 * Fetches the latest status of a browser automation task from the external API and updates the corresponding entry
 * within a specific browser session in the database.
 *
 * @param {string} sessionId - The ID of the browser session containing the task.
 * @param {string} taskId - The ID of the specific task to update.
 * @param {Request | null} [req=null] - The Express request object, used for tenant filtering.
 * @returns {Promise<IBrowserSession>} A promise that resolves to the updated browser session document.
 * @throws {ApiError} If the task or session is not found in the database.
 */
const updateTaskStatusService = async (sessionId, taskId, req = null) => {
  const query = req
    ? withTenantFilter(req, { _id: sessionId, 'responses.taskId': taskId })
    : { _id: sessionId, 'responses.taskId': taskId };

  const session = await BrowserSession.findOne(query);
  if (!session) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Task to update was not found in the session.'
    );
  }

  if (req) {
    await validateUserAndTenantContext(session.user, req);
  }

  const apiResponse = await axios.get(
    `https://api.browser-use.com/api/v1/task/${taskId}`,
    { headers: { Authorization: `Bearer ${config.browser_use_secret_key}` } }
  );
  const apiData = apiResponse.data;

  const updateFields = {
    'responses.$.status': apiData.status,
    'responses.$.output': apiData.output,
    'responses.$.structured_output': apiData.structured_output,
    'responses.$.live_url': apiData.live_url,
    'responses.$.error_message': apiData.error_message,
    'responses.$.finished_at': apiData.finished_at,
    'responses.$.steps': apiData.steps,
  };

  const updatedSession = await BrowserSession.findOneAndUpdate(
    query,
    { $set: updateFields },
    { new: true }
  );

  return updatedSession;
};

/**
 * Retrieves a list of browser sessions for a specific user.
 *
 * @param {string} userId - The ID of the user whose sessions are to be retrieved.
 * @param {Request | null} [req=null] - The Express request object, used for tenant filtering.
 * @returns {Promise<Array<IBrowserSession>>} A promise that resolves to an array of browser session documents (lean objects).
 */
const getSessionsForUserService = async (userId, req = null) => {
  if (req) {
    await validateUserAndTenantContext(userId, req);
  }
  const query = req ? withTenantFilter(req, { user: userId }) : { user: userId };
  const sessions = await BrowserSession.find(query)
    .select({
      'responses.prompt': { $slice: 1 },
      'responses.status': 0,
      'responses.output': 0,
      'responses.taskId': 0,
      'responses.live_url': 0,
      'responses.error_message': 0,
      'responses.finished_at': 0,
      'responses.structured_output': 0,
      'responses.createdAt': 0,
      'responses.updatedAt': 0,
    })
    .sort({ updatedAt: -1 })
    .lean();

  return sessions;
};

/**
 * Fetches a single, complete session by its ID, ensuring it belongs to the user and the active tenant.
 *
 * @param {string} sessionId - The ID of the session to retrieve.
 * @param {string} userId - The ID of the user who owns the session.
 * @param {Request | null} [req=null] - The Express request object, used for tenant filtering.
 * @returns {Promise<IBrowserSession>} A promise that resolves to the complete browser session document (lean object).
 * @throws {ApiError} If the session is not found or if the user does not have access to it.
 */
const getSessionByIdService = async (sessionId, userId, req = null) => {
  if (req) {
    await validateUserAndTenantContext(userId, req);
  }
  const query = req ? withTenantFilter(req, { _id: sessionId, user: userId }) : { _id: sessionId, user: userId };
  const session = await BrowserSession.findOne(query).lean();
  if (!session) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Session not found or access denied.'
    );
  }
  return session;
};

export const BrowserUseServices = {
  initiateTaskInSessionService,
  updateTaskStatusService,
  getSessionsForUserService,
  getSessionByIdService,
};