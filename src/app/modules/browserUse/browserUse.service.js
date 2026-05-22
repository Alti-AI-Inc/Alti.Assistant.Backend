import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';
import BrowserSession from './browserUse.model.js';
import User from '../auth/auth.model.js';
import { withTenantFilter } from '../../helpers/tenantQuery.js';

const initiateTaskInSessionService = async (
  userId,
  sessionId,
  prompt,
  structuredOutputSchema,
  req = null
) => {
  const tenantId = req ? (req.user?.currentTenantId || req.tenantId || null) : null;

  const apiBody = {
    task: prompt,
    secrets: {},
    allowed_domains: null,
    save_browser_data: true,
    llm_model: 'gemini-3.5-flash',
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
    const query = req ? withTenantFilter(req, { _id: sessionId, user: userId }) : { _id: sessionId, user: userId };
    const session = await BrowserSession.findOne(query);
    if (!session)
      throw new ApiError(httpStatus.NOT_FOUND, 'Session not found.');

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
    await User.findByIdAndUpdate(userId, {
      $push: { browserSessions: newSession._id },
    });

    return newSession;
  }
};

const updateTaskStatusService = async (sessionId, taskId) => {
  const apiResponse = await axios.get(
    `https://api.browser-use.com/api/v1/task/${taskId}`,
    { headers: { Authorization: `Bearer ${config.browser_use_secret_key}` } }
  );
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

  const updatedSession = await BrowserSession.findOneAndUpdate(
    { _id: sessionId, 'responses.taskId': taskId },
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
};

const getSessionsForUserService = async (userId, req = null) => {
  const query = req ? withTenantFilter(req, { user: userId }) : { user: userId };
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
    .sort({ updatedAt: -1 }); // Sort by most recently updated

  return sessions;
};

/**
 * Fetches a single, complete session by its ID, ensuring it belongs to the user.
 */
const getSessionByIdService = async (sessionId, userId, req = null) => {
  const query = req ? withTenantFilter(req, { _id: sessionId, user: userId }) : { _id: sessionId, user: userId };
  const session = await BrowserSession.findOne(query);
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
