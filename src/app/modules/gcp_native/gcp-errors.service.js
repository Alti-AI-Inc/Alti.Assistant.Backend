import { PubSub } from '@google-cloud/pubsub';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// Initialize the Pub/Sub client.
// The client will automatically use the service account credentials
// available in the environment (e.g., when running on Cloud Run, GKE, etc.).
const pubSubClient = new PubSub();

// Define the Pub/Sub topic for dispatching error reports.
// A separate background worker (e.g., Cloud Function) should subscribe to this topic
// to process the reports and send them to the Cloud Error Reporting API.
const errorReportingTopic = pubSubClient.topic(config.google.error_reporting_topic || 'gcp-error-reporting-events');

/**
 * Asynchronously queues an error report for processing via Pub/Sub.
 * This avoids blocking the request cycle on a network call to the Error Reporting API,
 * improving resilience and performance. A background worker will handle the actual reporting.
 * 
 * @param {string} errorMessage - Error description or raw message
 * @param {string} [stackTrace] - Error call stack trace (e.g. error.stack)
 * @param {string} [user] - Unique identifier of the user who encountered the error
 * @param {string} [serviceName] - Microservice identifier (default 'inso-backend')
 * @returns {Promise<object>} An object indicating the outcome of the queueing operation.
 */
const reportError = async (errorMessage, stackTrace = '', user = '', serviceName = 'inso-backend') => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    if (!projectId) {
      // This check is still needed for context, although the Pub/Sub client infers the project ID.
      throw new Error('GCP Project ID is not configured.');
    }

    logger.info(`GCP Errors: Queuing error report for service "${serviceName}" to Pub/Sub topic "${errorReportingTopic.name}"...`);

    // This is the payload that the background worker will receive.
    // It contains all the necessary information to call the Cloud Error Reporting API.
    const reportPayload = {
      eventTime: new Date().toISOString(),
      serviceContext: {
        service: serviceName,
        version: '1.19.0' // Consider making this version dynamic from package.json or env vars.
      },
      message: stackTrace ? `${errorMessage}\n${stackTrace}` : errorMessage,
      context: {
        user
      },
      // Adding projectId to the payload so the subscriber doesn't need to be configured with it.
      projectId
    };

    const dataBuffer = Buffer.from(JSON.stringify(reportPayload));

    // Publish the message to the Pub/Sub topic. This is a fast, non-blocking operation.
    const messageId = await errorReportingTopic.publishMessage({ data: dataBuffer });

    logger.info(`GCP Errors: Successfully queued error report with message ID: ${messageId}`);

    return {
      success: true,
      messageId,
      serviceName,
      user
    };
  } catch (err) {
    // If publishing to Pub/Sub fails, we log the error but do not throw.
    // Failing to report an error should not crash the main application flow.
    logger.error('Pub/Sub queueing for error report failed:', err);
    return {
      success: false,
      error: `Failed to queue error report to Pub/Sub: ${err.message}`
    };
  }
};

export const GcpErrorsService = {
  reportError
};