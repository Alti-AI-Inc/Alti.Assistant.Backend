import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * GoogleAuth client instance configured with 'https://www.googleapis.com/auth/cloud-platform' scope.
 * This client is used to authenticate requests to Google Cloud APIs.
 * @private
 * @type {GoogleAuth}
 */
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Programmatically schedules a delayed background HTTP task using Google Cloud Tasks.
 * This function handles authentication, task payload construction, and dispatch to the specified
 * Google Cloud Tasks queue. The task will make a POST request to the target URL with the provided payload.
 *
 * @param {string} [queueName='inso-default-tasks'] - The ID of the Cloud Tasks Queue to dispatch the task to.
 *   If not provided, defaults to "inso-default-tasks".
 * @param {string} url - The target HTTP callback URL that the Cloud Task will invoke. This URL must be publicly accessible.
 * @param {object} [payload={}] - The request body payload to send with the HTTP POST request.
 *   This object will be JSON.stringified and base64-encoded as required by Cloud Tasks.
 * @param {number} [delaySeconds=0] - The delay in seconds before the task should be executed.
 *   A value of 0 means the task will be executed immediately (or as soon as possible).
 * @param {object} [headers={}] - Optional custom HTTP headers to send with the task callback.
 *   'Content-Type: application/json' is added by default.
 * @returns {Promise<object>} A promise that resolves with details of the enqueued task.
 * @returns {boolean} Promise.success - Indicates if the task was successfully enqueued.
 * @returns {string} Promise.taskName - The full resource name of the created task (e.g., `projects/PROJECT_ID/locations/LOCATION_ID/queues/QUEUE_ID/tasks/TASK_ID`).
 * @returns {string} Promise.dispatchUrl - The target URL the task is configured to call.
 * @returns {string} Promise.scheduleTime - The ISO string timestamp when the task is scheduled to run.
 * @returns {string} Promise.queue - The ID of the queue the task was dispatched to.
 * @returns {number} Promise.delaySeconds - The requested delay in seconds for the task.
 * @throws {Error} If the GCP Project ID is not configured.
 * @throws {Error} If the target callback URL is not provided.
 * @throws {Error} If the Cloud Tasks dispatch fails for any other reason (e.g., network issues, API errors).
 */
const createHttpTask = async (queueName = 'inso-default-tasks', url, payload = {}, delaySeconds = 0, headers = {}) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    const location = config.google.gcp_location || process.env.GCP_LOCATION || 'us-central1';

    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    if (!url) {
      throw new Error('Target callback URL is required.');
    }

    const activeQueue = queueName || 'inso-default-tasks';
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

/**
 * @typedef {object} GcpTasksService
 * @property {function(string, string, object, number, object): Promise<object>} createHttpTask - Function to create and dispatch an HTTP task to Google Cloud Tasks.
 */

/**
 * Service module for interacting with Google Cloud Tasks.
 * Provides functionality to programmatically schedule and dispatch HTTP tasks.
 * @type {GcpTasksService}
 */
export const GcpTasksService = {
  createHttpTask
};