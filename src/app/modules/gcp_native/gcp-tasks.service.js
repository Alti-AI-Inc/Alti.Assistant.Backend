import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Programmatically schedules a delayed background HTTP task using Google Cloud Tasks.
 * 
 * @param {string} [queueName] - Cloud Tasks Queue ID (default: "alti-default-tasks")
 * @param {string} url - Target HTTP callback URL
 * @param {object} [payload] - Request body payload to post
 * @param {number} [delaySeconds] - Delay execution offset in seconds (default 0, direct execution)
 * @param {object} [headers] - Optional custom headers to send with the task callback
 * @returns {Promise<object>} Enqueued Task Details report
 */
const createHttpTask = async (queueName = 'alti-default-tasks', url, payload = {}, delaySeconds = 0, headers = {}) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    const location = config.google.gcp_location || process.env.GCP_LOCATION || 'us-central1';

    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    if (!url) {
      throw new Error('Target callback URL is required.');
    }

    const activeQueue = queueName || 'alti-default-tasks';
    logger.info(`GCP Cloud Tasks: Dispatching task to queue "projects/${projectId}/locations/${location}/queues/${activeQueue}"...`);

    const client = await auth.getClient();
    const endpoint = `https://cloudtasks.googleapis.com/v2/projects/${projectId}/locations/${location}/queues/${activeQueue}/tasks`;

    const taskPayload = {
      httpRequest: {
        httpMethod: 'POST',
        url: url,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      }
    };

    if (payload && Object.keys(payload).length > 0) {
      // Body payload must be base64-encoded according to Google Cloud Tasks specification
      taskPayload.httpRequest.body = Buffer.from(JSON.stringify(payload)).toString('base64');
    }

    if (delaySeconds > 0) {
      const scheduleTime = new Date(Date.now() + delaySeconds * 1000).toISOString();
      taskPayload.scheduleTime = scheduleTime;
    }

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: { task: taskPayload }
    });

    const createdTask = response.data || {};

    logger.info(`GCP Cloud Tasks: Task successfully enqueued: ${createdTask.name}`);

    return {
      success: true,
      taskName: createdTask.name,
      dispatchUrl: url,
      scheduleTime: createdTask.scheduleTime || new Date().toISOString(),
      queue: activeQueue,
      delaySeconds
    };
  } catch (err) {
    logger.error('GCP Cloud Tasks Dispatch Error:', err);
    throw new Error(`Cloud Tasks dispatch failed: ${err.message}`);
  }
};

export const GcpTasksService = {
  createHttpTask
};
