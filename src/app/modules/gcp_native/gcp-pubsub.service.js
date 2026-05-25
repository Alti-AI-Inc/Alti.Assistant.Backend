import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Creates a brand new Google Cloud Pub/Sub Topic.
 * 
 * @param {string} topicId - Topic name
 * @returns {Promise<object>} Topic creation report
 */
const createTopic = async (topicId) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`Pub/Sub: Creating Topic "${topicId}"...`);

    const client = await auth.getClient();
    const endpoint = `https://pubsub.googleapis.com/v1/projects/${projectId}/topics/${topicId}`;

    const response = await client.request({
      url: endpoint,
      method: 'PUT'
    });

    return {
      success: true,
      projectId,
      topicId,
      name: response.data?.name
    };
  } catch (err) {
    logger.error(`Pub/Sub Topic Creation Error for ${topicId}:`, err);
    throw new Error(`Pub/Sub Topic creation failed: ${err.message}`);
  }
};

/**
 * Publishes a JSON data payload to a Google Cloud Pub/Sub Topic.
 * 
 * @param {string} topicId - Topic name
 * @param {object} messageData - JSON payload content
 * @returns {Promise<object>} Publish report containing messageIds
 */
const publishMessage = async (topicId, messageData) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`Pub/Sub: Publishing message to Topic "${topicId}"...`);

    const client = await auth.getClient();
    const endpoint = `https://pubsub.googleapis.com/v1/projects/${projectId}/topics/${topicId}:publish`;

    const base64Data = Buffer.from(JSON.stringify(messageData)).toString('base64');

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: {
        messages: [
          {
            data: base64Data
          }
        ]
      }
    });

    return {
      success: true,
      topicId,
      messageIds: response.data?.messageIds || []
    };
  } catch (err) {
    logger.error(`Pub/Sub Publish Error for Topic ${topicId}:`, err);
    throw new Error(`Pub/Sub Publish failed: ${err.message}`);
  }
};

/**
 * Creates a brand new Google Cloud Pub/Sub Subscription mapped to a Topic.
 * 
 * @param {string} topicId - Mapped Topic name
 * @param {string} subscriptionId - New Subscription name
 * @param {string} [pushEndpoint] - Optional push webhook URL (if omitted, creates standard pull subscription)
 * @returns {Promise<object>} Subscription creation report
 */
const createSubscription = async (topicId, subscriptionId, pushEndpoint = null) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`Pub/Sub: Creating Subscription "${subscriptionId}" for Topic "${topicId}"...`);

    const client = await auth.getClient();
    const endpoint = `https://pubsub.googleapis.com/v1/projects/${projectId}/subscriptions/${subscriptionId}`;

    const requestBody = {
      topic: `projects/${projectId}/topics/${topicId}`,
      ackDeadlineSeconds: 10
    };

    if (pushEndpoint) {
      requestBody.pushConfig = {
        pushEndpoint
      };
    }

    const response = await client.request({
      url: endpoint,
      method: 'PUT',
      data: requestBody
    });

    return {
      success: true,
      projectId,
      topicId,
      subscriptionId,
      name: response.data?.name,
      pushConfig: response.data?.pushConfig
    };
  } catch (err) {
    logger.error(`Pub/Sub Subscription Creation Error for ${subscriptionId}:`, err);
    throw new Error(`Pub/Sub Subscription creation failed: ${err.message}`);
  }
};

export const GcpPubSubService = {
  createTopic,
  publishMessage,
  createSubscription
};
