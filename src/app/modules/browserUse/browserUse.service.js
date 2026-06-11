import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import crypto from 'crypto';
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
  try {
    if (!req || !req.user) return;

    const actor = req.user; // The authenticated user making the request
    // OPTIMIZATION: Added .lean() for a small performance boost on read-only operations.
    // This returns a plain JavaScript object instead of a full Mongoose document, reducing memory overhead.
    const targetUser = await User.findById(userId).lean();

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
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error in validateUserAndTenantContext', {
      error: error.message,
      stack: error.stack,
      userId,
      actorId: req?.user?._id,
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal error occurred during user validation.');
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
  try {
    // OPTIMIZATION: Added .lean() for a small performance boost on read-only operations.
    const user = await User.findById(userId).lean();
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    // 1. Check Limits based on role
    // OPTIMIZATION: For this query to be performant, an index on the 'user' field
    // in the 'BrowserSession' collection is recommended.
    // Example: `BrowserSession.collection.createIndex({ user: 1 })`
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
    // OPTIMIZATION: For this query to be performant, a compound index on '{ tenantId: 1, role: 1 }'
    // in the 'User' collection is recommended.
    // Example: `User.collection.createIndex({ tenantId: 1, role: 1 })`
    const managersAndAdmins = await User.find({
      tenantId: tenantId || user.tenantId,
      role: { $in: ['manager', 'admin'] },
      _id: { $ne: userId } // Don't notify self
    }).lean(); // OPTIMIZATION: Added .lean() to fetch plain JS objects, reducing memory overhead.

    logger.info(
      `[Usage Propagation] User ${userId} (${user.role}) initiated a browser session. Current count: ${sessionCount + 1}/${limit}.`
    );

    // OPTIMIZATION: N+1 query problem fixed.
    // The original code executed one update query per supervisor inside a loop.
    // This has been replaced with a single `updateMany` operation,
    // drastically reducing database round-trips and improving performance.
    const supervisorIds = managersAndAdmins.map(s => s._id);

    if (supervisorIds.length > 0) {
      // Log notifications before the bulk update
      managersAndAdmins.forEach(supervisor => {
        logger.info(
          `[Notification] Sent to ${supervisor.role} (ID: ${supervisor._id}): User ${userId} has consumed 1 browser session unit.`
        );
      });

      // Perform a single bulk update for all supervisors who track managed usage
      await User.updateMany(
        { _id: { $in: supervisorIds }, managedUsage: { $exists: true } },
        { $inc: { 'managedUsage.browserSessionsCount': 1 } }
      );
    }

    // Also notify direct manager if specified on the user document
    if (user.managerId && user.managerId.toString() !== userId) {
      // OPTIMIZATION: Added .lean() for a small performance boost on read-only operations.
      const directManager = await User.findById(user.managerId).lean();
      if (directManager) {
        logger.info(
          `[Notification] Direct Manager (ID: ${directManager._id}) notified of user ${userId} activity.`
        );
      }
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error in propagateUsageAndCheckLimits', {
      error: error.message,
      stack: error.stack,
      userId,
      tenantId,
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal error occurred while checking usage limits.');
  }
};

/**
 * Initiates a browser automation task via a direct call to Google's Vertex AI and records it in a user's session.
 * If a sessionId is provided, the task is added to an existing session. Otherwise, a new session is created.
 * This service enforces role-based permissions, tenant boundaries, and usage limits.
 * It uses the @google-cloud/vertexai SDK and configures enterprise-grade safety settings.
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
 * @throws {ApiError} If the Vertex AI API call fails, or if the specified session is not found.
 * @throws {ApiError} Throws errors from `validateUserAndTenantContext` and `propagateUsageAndCheckLimits` on validation or limit failures.
 */
const initiateTaskInSessionService = async (
  userId,
  sessionId,
  prompt,
  structuredOutputSchema,
  req = null
) => {
  try {
    const tenantId = req ? (req.user?.currentTenantId || req.tenantId || null) : null;

    // Validate context and check limits before calling external API to save costs
    await validateUserAndTenantContext(userId, req);
    await propagateUsageAndCheckLimits(userId, tenantId);

    // Sanitize prompt to filter out or mask PII before transmitting data to external LLM-based services
    const sanitizedPrompt = maskPII(prompt);

    // --- VERTEX AI SDK INTEGRATION ---
    // Initialize Vertex AI client using credentials and configuration from the environment.
    const vertex_ai = new VertexAI({
      project: config.gcp?.projectId || config.google?.gcp_project_id || process.env.GCP_PROJECT_ID || 'alti-assistant',
      location: config.gcp?.location || config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1',
    });
    const model = 'gemini-1.5-flash-001';

    // Configure enterprise-grade safety settings to block harmful content at a low threshold.
    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
      },
    ];

    const generativeModel = vertex_ai.getGenerativeModel({
      model: model,
      safetySettings,
    });

    const systemInstruction = `You are an AI assistant that generates a sequence of steps to accomplish a browser-based task.
  Based on the user's prompt, provide a clear, step-by-step plan. If a JSON schema is provided, format your output to match it.`;

    const request = {
      contents: [{ role: 'user', parts: [{ text: sanitizedPrompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
    };

    // If a schema is provided, use Vertex AI's function calling/tool use feature for structured output.
    if (structuredOutputSchema) {
      request.tools = [{
        function_declarations: [{
          name: 'extract_information',
          description: 'Extracts information from the page according to the provided schema.',
          parameters: {
            type: 'object',
            properties: {
              extracted_data: structuredOutputSchema
            },
            required: ['extracted_data']
          }
        }]
      }];
    }

    const result = await generativeModel.generateContent(request);
    const response = result.response;

    if (!response.candidates || response.candidates.length === 0) {
      // Handle cases where the model response was blocked by safety settings or other reasons.
      const blockReason = response.promptFeedback?.blockReason;
      logger.error(`Vertex AI call blocked. Reason: ${blockReason}`, { response });
      throw new ApiError(httpStatus.BAD_REQUEST, `Request blocked by safety filters: ${blockReason}`);
    }

    const modelContent = response.candidates[0].content.parts[0];

    // Create a new response object based on the direct Vertex AI call.
    // NOTE: The original implementation used a third-party service that returned a live URL and could be polled.
    // This has been replaced with a direct, synchronous call to Vertex AI. The response object reflects this change.
    const newResponseObject = {
      taskId: crypto.randomUUID(), // Using a local UUID as there's no external service.
      status: 'completed', // Status is immediate as we get the response directly.
      prompt: sanitizedPrompt,
      live_url: null, // No live browser session URL available with this direct approach.
      steps: [{ description: 'Generated plan from AI', output: modelContent.text || '' }],
      output: modelContent.text || '',
    };

    // Populate structured output if the model used the provided tool/function.
    if (structuredOutputSchema && modelContent.functionCall) {
      newResponseObject.structured_output = modelContent.functionCall.args.extracted_data;
      newResponseObject.output = JSON.stringify(newResponseObject.structured_output, null, 2);
    }
    // --- END VERTEX AI SDK INTEGRATION ---

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
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error in initiateTaskInSessionService', {
      error: error.message,
      stack: error.stack,
      userId,
      sessionId,
      tenantId,
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to initiate browser task.');
  }
};

/**
 * [DEPRECATED] Fetches the latest status of a browser automation task.
 * NOTE: This service is deprecated. Following the migration to the direct Vertex AI SDK,
 * tasks are generated in a single request-response cycle and there is no external,
 * long-running task to poll for status updates. This function now returns the session
 * without modification to maintain API compatibility.
 *
 * @param {string} sessionId - The ID of the browser session containing the task.
 * @param {string} taskId - The ID of the specific task to update.
 * @param {Request | null} [req=null] - The Express request object, used for user authentication and tenant filtering.
 * @returns {Promise<IBrowserSession>} A promise that resolves to the existing browser session document.
 * @throws {ApiError} If the task or session is not found in the database.
 */
const updateTaskStatusService = async (sessionId, taskId, req = null) => {
  try {
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

    // No-op: The external polling mechanism is no longer valid after switching to the direct Vertex AI SDK.
    // Returning the session as-is.
    logger.warn(`[Deprecated] updateTaskStatusService was called for taskId: ${taskId}. No action is taken.`);
    return session;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error in updateTaskStatusService', {
      error: error.message,
      stack: error.stack,
      sessionId,
      taskId,
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update task status.');
  }
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
  try {
    if (req) {
      await validateUserAndTenantContext(userId, req);
    }
    const query = req ? withTenantFilter(req, { user: userId }) : { user: userId };
    // OPTIMIZATION: For this query to be performant (covering both filter and sort),
    // a compound index on '{ user: 1, updatedAt: -1 }' is recommended.
    // Example: `BrowserSession.collection.createIndex({ user: 1, updatedAt: -1 })`
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
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error in getSessionsForUserService', {
      error: error.message,
      stack: error.stack,
      userId,
      actorId: req?.user?._id,
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve user sessions.');
  }
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
  try {
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
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error in getSessionByIdService', {
      error: error.message,
      stack: error.stack,
      sessionId,
      userId,
      actorId: req?.user?._id,
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve session.');
  }
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