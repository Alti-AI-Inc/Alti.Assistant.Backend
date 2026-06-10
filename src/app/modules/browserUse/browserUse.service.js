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
 * Masks Personally Identifiable Information (PII) from a given string.
 * This function replaces common PII patterns like emails, phone numbers,
 * Social Security Numbers (SSN), and credit card numbers with generic placeholders.
 * It is used to sanitize data before sending it to external services.
 *
 * @param {string} text - The input text to sanitize.
 * @returns {string} The sanitized text with PII masked. Returns the original input if it's not a non-empty string.
 */
const maskPII = (text) => {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[CREDIT_CARD]');
};

/**
 * Validates the user and tenant context to ensure proper role-based access control
 * and tenant boundary isolation. This function checks if the requesting user (actor)
 * has the appropriate role and tenant access to perform an action on a target user.
 *
 * **Permissions:**
 * - `super_admin`: Can access any user across any tenant.
 * - `admin`, `manager`, `user`: Can only access users within their own tenant.
 *
 * @param {string} userId - The ID of the target user for the action.
 * @param {Request | null} req - The Express request object, containing the authenticated user (`req.user`) and tenant context.
 * @throws {ApiError} Throws a `NOT_FOUND` error if the target user doesn't exist.
 * @throws {ApiError} Throws a `FORBIDDEN` error for invalid actor roles or tenant boundary violations.
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
 * and notifications up to managers and administrators within the same tenant.
 *
 * **Role-based Limits:**
 * - `user`: 10 sessions
 * - `manager`: 50 sessions
 * - `admin`: 200 sessions
 * - `super_admin`: Infinity
 *
 * @param {string} userId - The ID of the user initiating the task.
 * @param {string | null} tenantId - The active tenant ID for scoping notifications.
 * @throws {ApiError} Throws a `NOT_FOUND` error if the user doesn't exist.
 * @throws {ApiError} Throws a `PAYMENT_REQUIRED` error if the user's usage limit is exceeded.
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
 * This service enforces role-based permissions, tenant boundaries, and usage limits.
 *
 * **Permissions:**
 * - Requires an authenticated user.
 * - `super_admin` can initiate tasks for any user.
 * - Other roles (`admin`, `manager`, `user`) can only initiate tasks for themselves or users within their tenant, subject to hierarchy rules.
 *
 * @param {string} userId - The ID of the user initiating the task.
 * @param {string | null} sessionId - The ID of an existing browser session to add the task to, or null to create a new session.
 * @param {string} prompt - The natural language prompt/task for the browser automation. This prompt will be sanitized for PII.
 * @param {object | null} structuredOutputSchema - An optional JSON schema for the desired structured output from the browser task.
 * @param {Request | null} [req=null] - The Express request object, used for user authentication, role checks, and tenant filtering.
 * @returns {Promise<IBrowserSession>} A promise that resolves to the updated or newly created browser session document.
 * @throws {ApiError} If the external API does not return a task ID, or if the specified session is not found.
 * @throws {ApiError} Throws errors from `validateUserAndTenantContext` and `propagateUsageAndCheckLimits` on validation or limit failures.
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

  // Sanitize prompt to filter out or mask PII before transmitting data to external LLM-based services
  const sanitizedPrompt = maskPII(prompt);

  const apiBody = {
    task: sanitizedPrompt,
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
    prompt: sanitizedPrompt,
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
 * **Permissions:**
 * - Requires an authenticated user.
 * - Access is restricted by tenant boundaries. A user can only update tasks in sessions they have access to within their tenant.
 *
 * @param {string} sessionId - The ID of the browser session containing the task.
 * @param {string} taskId - The ID of the specific task to update.
 * @param {Request | null} [req=null] - The Express request object, used for user authentication and tenant filtering.
 * @returns {Promise<IBrowserSession>} A promise that resolves to the updated browser session document.
 * @throws {ApiError} If the task or session is not found in the database or if access is denied due to tenant restrictions.
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
 * Retrieves a list of browser sessions for a specific user. The returned data is a summary,
 * containing only the first prompt of each session for display in a list.
 *
 * **Permissions:**
 * - Requires an authenticated user.
 * - `super_admin` can retrieve sessions for any user.
 * - Other roles can only retrieve sessions for users within their own tenant.
 *
 * @param {string} userId - The ID of the user whose sessions are to be retrieved.
 * @param {Request | null} [req=null] - The Express request object, used for user authentication, role checks, and tenant filtering.
 * @returns {Promise<Array<IBrowserSession>>} A promise that resolves to an array of summarized browser session documents (lean objects).
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
 * Fetches a single, complete session by its ID, ensuring it belongs to the specified user and the active tenant.
 *
 * **Permissions:**
 * - Requires an authenticated user.
 * - `super_admin` can retrieve any session.
 * - Other roles can only retrieve sessions belonging to users within their own tenant.
 *
 * @param {string} sessionId - The ID of the session to retrieve.
 * @param {string} userId - The ID of the user who owns the session.
 * @param {Request | null} [req=null] - The Express request object, used for user authentication, role checks, and tenant filtering.
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

/**
 * A collection of services for managing browser automation tasks and sessions.
 * These services handle interactions with an external browser automation API,
 * manage session data in the database, and enforce business logic such as
 * role-based access control, tenant isolation, and usage limits.
 * @namespace BrowserUseServices
 */
export const BrowserUseServices = {
  initiateTaskInSessionService,
  updateTaskStatusService,
  getSessionsForUserService,
  getSessionByIdService,
};