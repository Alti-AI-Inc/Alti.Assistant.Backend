import { PubSub } from '@google-cloud/pubsub';
import { EventEmitter } from 'events';

export const telemetryEmitter = new EventEmitter();
// Initialize the Google Cloud Pub/Sub client.
// This will automatically use the service account credentials available in the environment
// (e.g., when running on Cloud Run, GKE, or with GOOGLE_APPLICATION_CREDENTIALS set).
const pubSubClient = new PubSub();

// The name of the Pub/Sub topic to which telemetry progress messages will be published.
// It's a best practice to configure this via an environment variable.
const topicName = process.env.TELEMETRY_PROGRESS_TOPIC || 'telemetry-progress-updates';

/**
 * Publishes a real-time progress update to a GCP Pub/Sub topic for an active research thread.
 * This offloads the notification to a scalable, asynchronous messaging system,
 * allowing any subscribed service (e.g., a WebSocket server instance) to process it,
 * thus ensuring stateless and scalable architecture.
 * 
 * @param {string} conversationId - Active conversation thread ID
 * @param {object} data - Progress update attributes
 * @param {string} data.step - Step identifier (e.g. 'breadth_search')
 * @param {string} data.message - Short descriptive update message
 * @param {number} data.percentage - Estimated progress percentage (0 - 100)
 * @param {object} [data.metadata] - Optional additional state facts
 */
export const emitTelemetryProgress = async (conversationId, data) => {
  if (!conversationId) {
    console.warn('emitTelemetryProgress called without a conversationId.');
    return;
  }

  try {
    // Construct the message payload.
    const messagePayload = {
      conversationId,
      timestamp: new Date().toISOString(),
      ...data,
    };

    // Pub/Sub messages must be sent as a Buffer.
    const dataBuffer = Buffer.from(JSON.stringify(messagePayload));

    // Publish the message to the specified Pub/Sub topic.
    // The `publishMessage` method is asynchronous and returns a message ID upon success.
    const messageId = await pubSubClient.topic(topicName).publishMessage({ data: dataBuffer });
    
    // Optional: Log the message ID for tracing purposes in a real environment.
    // console.log(`Telemetry message ${messageId} published for conversation ${conversationId}.`);
    
    // Also emit locally for SSE
    telemetryEmitter.emit('progress', messagePayload);
  } catch (error) {
    // Log any errors that occur during the publishing process.
    // In a production environment, this should be routed to a proper logging/monitoring service.
    console.error(`Failed to publish telemetry progress for conversation ${conversationId}:`, error);
  }
};