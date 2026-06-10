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

// Optimization Recommendation:
// For the BrowserSession model (in browserUse.model.js), consider adding the following indexes for improved query performance:
// 1. For filtering by 'user' and 'tenantId' (used in most queries):
//    BrowserSessionSchema.index({ user: 1 });
//    BrowserSessionSchema.index({ tenantId: 1 });
// 2. For efficient sorting in getSessionsForUserService:
//    BrowserSessionSchema.index({ updatedAt: -1 });
// 3. For querying subdocuments within the 'responses' array (e.g., by 'taskId' in updateTaskStatusService):
//    BrowserSessionSchema.index({ 'responses.taskId': 1 });
// 4. Compound index for getSessionsForUserService for optimal performance (covering user, tenantId, and sort by updatedAt):
//    BrowserSessionSchema.index({ user: 1, tenantId: 1, updatedAt: -1 });
// 5. Compound index for findOne operations involving user and tenantId (e.g., initiateTaskInSessionService, getSessionByIdService):
//    BrowserSessionSchema.index({ user: 1, tenantId: 1 });

// Optimization Recommendation:
// For the User model (in auth.model.js), consider adding an index for the 'browserSessions' array
// if it grows very large and is frequently queried or modified:
// UserSchema.index({ browserSessions: 1 });

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
  try {
    const tenantId = req ? (req.user?.currentTenantId || req.tenantId || null) : null;

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

    let apiResponse;
    try {
      apiResponse = await axios.post(
        'https://api.browser-use.com/api/v1/run-task',
        apiBody,
        {
          headers: {
            Authorization: `Bearer ${config.browser_use_secret_key}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (apiErr) {
      logger.error('Error calling external browser-use API in initiateTaskInSessionService', {
        error: apiErr.message,
        stack: apiErr.stack,
        userId,
        sessionId,
      });
      throw new ApiError(
        apiErr.response?.status || httpStatus.BAD_GATEWAY,
        `External browser automation service error: ${apiErr.response?.data?.message || apiErr.message}`
      );
    }

    const apiData = apiResponse.data;

    if (!apiData || !apiData.id) {
      logger.error('External browser-use API did not return a task ID', { apiData, userId, sessionId });
      throw new ApiError(httpStatus.BAD_GATEWAY, 'API did not return a task ID');
    }

    // --- CORRECTED: Save ALL initial data from the API response ---
    const newResponseObject = {
      taskId: apiData.id,
      status: apiData.status || 'created',
      prompt: prompt,
      live_url: apiData.live_url,
      steps: apiData.steps || [], // Save initial steps if they exist
    };

    // 2. Check if we are adding to an existing session or creating a new one
    if (sessionId) {
      // Find the existing session and push a new response, ensuring it belongs to the active tenant/user
      // .lean() is not used here because we are modifying and saving the Mongoose document.
      const query = req ? withTenantFilter(req, { _id: sessionId, user: userId }) : { _id: sessionId, user: userId };
      const session = await BrowserSession.findOne(query);
      if (!session) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Session not found.');
      }

      session.responses.push(newResponseObject);
      await session.save();
      return session;
    } else {
      // Create a new session document
      const newSession = await BrowserSession.create({
        user: userId,
        tenantId: tenantId,
        responses: [newResponseObject],
      });

      // Add the new session's ID to the user's document
      // .lean() is not applicable here as we are modifying the document.
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
    });
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal error occurred while initiating the browser task.'
    );
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
  try {
    let apiResponse;
    try {
      apiResponse = await axios.get(
        `https://api.browser-use.com/api/v1/task/${taskId}`,
        { headers: { Authorization: `Bearer ${config.browser_use_secret_key}` } }
      );
    } catch (apiErr) {
      logger.error('Error fetching task status from external browser-use API', {
        error: apiErr.message,
        stack: apiErr.stack,
        sessionId,
        taskId,
      });
      throw new ApiError(
        apiErr.response?.status || httpStatus.BAD_GATEWAY,
        `External browser automation service error: ${apiErr.response?.data?.message || apiErr.message}`
      );
    }

    const apiData = apiResponse.data;

    // --- CORRECTED: Build the complete update object ---
    const updateFields = {
      'responses.$.status': apiData.status,
      'responses.$.output': apiData.output,
      'responses.$.structured_output': apiData.structured_output,
      'responses.$.live_url': apiData.live_url,
      'responses.$.error_message': apiData.error_message,
      'responses.$.finished_at': apiData.finished_at,
      'responses.$.steps': apiData.steps, // CRITICAL: Update the steps array
    };

    const query = req
      ? withTenantFilter(req, { _id: sessionId, 'responses.taskId': taskId })
      : { _id: sessionId, 'responses.taskId': taskId };

    // .lean() is not used here as { new: true } returns a Mongoose document, which is then returned by the service.
    const updatedSession = await BrowserSession.findOneAndUpdate(
      query,
      { $set: updateFields },
      { new: true }
    );

    if (!updatedSession) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Task to update was not found in the session.'
      );
    }

    return updatedSession;
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
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal error occurred while updating the task status.'
    );
  }
};

/**
 * Retrieves a list of browser sessions for a specific user.
 * It selects only the first prompt from the responses array and excludes other detailed fields
 * for a lighter overview, sorted by the most recently updated session.
 *
 * @param {string} userId - The ID of the user whose sessions are to be retrieved.
 * @param {Request | null} [req=null] - The Express request object, used for tenant filtering.
 * @returns {Promise<Array<IBrowserSession>>} A promise that resolves to an array of browser session documents (lean objects).
 */
const getSessionsForUserService = async (userId, req = null) => {
  try {
    const query = req ? withTenantFilter(req, { user: userId }) : { user: userId };
    // Optimization: Added .lean() for read-only operations to improve performance
    // by returning plain JavaScript objects instead of Mongoose documents.
    const sessions = await BrowserSession.find(query)
      .select({
        'responses.prompt': { $slice: 1 }, // Only get the first element of the responses array
        'responses.status': 0, // Exclude all other fields from the sub-document
        'responses.output': 0,
        'responses.taskId': 0,
        'responses.live_url': 0,
        'responses.error_message': 0,
        'responses.finished_at': 0,
        'responses.structured_output': 0,
        'responses.createdAt': 0,
        'responses.updatedAt': 0,
      })
      .sort({ updatedAt: -1 }) // Sort by most recently updated
      .lean(); // Optimization: Use .lean() for read-only query

    return sessions;
  } catch (error) {
    logger.error('Error in getSessionsForUserService', {
      error: error.message,
      stack: error.stack,
      userId,
    });
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal error occurred while retrieving browser sessions.'
    );
  }
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
  try {
    const query = req ? withTenantFilter(req, { _id: sessionId, user: userId }) : { _id: sessionId, user: userId };
    // Optimization: Added .lean() for read-only operations to improve performance
    // by returning plain JavaScript objects instead of Mongoose documents.
    const session = await BrowserSession.findOne(query).lean(); // Optimization: Use .lean() for read-only query
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
    });
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal error occurred while retrieving the browser session.'
    );
  }
};

/**
 * @typedef {object} BrowserUseServices
 * @property {function(string, string | null, string, object | null, Request | null): Promise<IBrowserSession>} initiateTaskInSessionService - Initiates a new browser automation task.
 * @property {function(string, string, Request | null): Promise<IBrowserSession>} updateTaskStatusService - Updates the status of an existing browser automation task.
 * @property {function(string, Request | null): Promise<Array<IBrowserSession>>} getSessionsForUserService - Retrieves a list of browser sessions for a user.
 * @property {function(string, string, Request | null): Promise<IBrowserSession>} getSessionByIdService - Retrieves a single browser session by ID.
 */

/**
 * An object grouping all browser use related service functions.
 * @type {BrowserUseServices}
 */
export const BrowserUseServices = {
  initiateTaskInSessionService,
  updateTaskStatusService,
  getSessionsForUserService,
  getSessionByIdService,
};