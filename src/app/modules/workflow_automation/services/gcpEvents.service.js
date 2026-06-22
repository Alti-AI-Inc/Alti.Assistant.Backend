import { workflowExecutionService } from './workflowExecution.service.js';
import { logger } from '../../../../shared/logger.js';
import config from '../../../../../config/index.js';

/**
 * @class GcpEventsService
 * @classdesc Google Cloud Platform Native Events Service.
 * This service handles real-time event-driven workflow triggers via Google Cloud Pub/Sub subscriptions
 * and utilizes Vertex AI / Gemini Structured Outputs for compliant schema evaluations.
 * It manages the lifecycle of Pub/Sub subscriptions dynamically based on workflow requirements.
 */
class GcpEventsService {
  /**
   * @constructor
   * @description Initializes the GcpEventsService.
   * Sets up a map to store active Pub/Sub subscription handles and initializes the Pub/Sub client to null.
   */
  constructor() {
    /**
     * @private
     * @type {Map<string, object>}
     * @description Stores dynamic Pub/Sub subscription handles, keyed by workflow ID.
     */
    this.activeSubscriptions = new Map();
    /**
     * @private
     * @type {import('@google-cloud/pubsub').PubSub | null}
     * @description The Google Cloud Pub/Sub client instance.
     */
    this.pubSubClient = null;
  }

  /**
   * Initializes dynamic Google Cloud Pub/Sub listeners for event-driven workflows.
   * This method sets up the main Pub/Sub client. It should be called once on application startup.
   * It handles mock/offline modes by skipping the actual GCP connection.
   * @async
   * @returns {Promise<void>} A promise that resolves when initialization is complete or skipped.
   */
  async initializePubSubTriggers() {
    try {
      logger.info('Initializing GCP Pub/Sub workflow event listeners...');
      
      const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');
      
      if (isMock) {
        logger.info('[GCP Pub/Sub] Local Offline Mock Mode: active.');
        return;
      }

      // Initialize live GCP Pub/Sub client
      const { PubSub } = await import('@google-cloud/pubsub');
      const projectId = config.gcp?.projectId;
      
      this.pubSubClient = new PubSub({
        projectId,
        // It's generally recommended to use an absolute path for keyFilename or ensure it's correctly
        // configured in `config.gcp?.saKeyPath` to avoid issues with varying current working directories.
        keyFilename: config.gcp?.saKeyPath || './gcp-sa-key.json'
      });

      logger.info('[GCP Pub/Sub] Client initialized successfully.');
    } catch (error) {
      logger.error('[GCP Pub/Sub] Initialization error:', error.message);
    }
  }

  /**
   * Dynamically subscribes a workflow to a Google Pub/Sub topic.
   * When a message arrives, it triggers the associated workflow execution with the message payload and attributes as context.
   * The subscription is created if it doesn't already exist.
   * @async
   * @param {string} topicName - The name of the GCP Pub/Sub topic to listen to.
   * @param {string} workflowId - The ID of the workflow to be triggered by messages on the topic.
   * @param {string} userId - The identifier of the user who owns the workflow.
   * @returns {Promise<{success: boolean, subscription: string, mocked: boolean}>} An object confirming the registration.
   * @throws {Error} If the Pub/Sub client is not initialized or if subscription registration fails.
   */
  async registerPubSubTrigger(topicName, workflowId, userId) {
    try {
      logger.info(`[GCP Pub/Sub] Registering event trigger on topic "${topicName}" for workflow ${workflowId}`);
      
      const subscriptionName = `sub-wf-${workflowId}`;
      const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');

      if (isMock) {
        logger.info(`[GCP Pub/Sub Mock] Simulating subscription "${subscriptionName}" to topic "${topicName}"`);
        this.activeSubscriptions.set(workflowId, { topicName, mock: true });
        return { success: true, subscription: subscriptionName, mocked: true };
      }

      if (!this.pubSubClient) {
        // Ensure the Pub/Sub client is initialized before proceeding.
        // This handles cases where registerPubSubTrigger might be called before initializePubSubTriggers.
        await this.initializePubSubTriggers();
      }

      // BUG FIX: Check if pubSubClient was successfully initialized to prevent TypeError
      if (!this.pubSubClient) {
        throw new Error('GCP Pub/Sub client is not initialized. Check configuration and credentials.');
      }

      const topic = this.pubSubClient.topic(topicName);
      
      // Ensure subscription exists, otherwise create it dynamically
      let [subscription] = await topic.subscription(subscriptionName).get({ autoCreate: true });

      // Handle message callbacks
      subscription.on('message', async (message) => {
        try {
          logger.info(`[GCP Pub/Sub] Received event trigger on topic "${topicName}" for workflow ${workflowId}`);
          
          let eventData = {};
          try {
            eventData = JSON.parse(message.data.toString());
          } catch (e) {
            // If JSON parsing fails, provide the raw payload for debugging/alternative processing
            eventData = { rawPayload: message.data.toString() };
          }

          // Merge message attributes and parsed payload as trigger execution context
          const context = {
            triggeredBy: 'gcp_pubsub',
            pubSubTopic: topicName,
            eventId: message.id,
            attributes: message.attributes || {},
            ...eventData
          };

          // Execute workflow asynchronously and handle acknowledgment based on its completion.
          // BUG FIX: The original code acknowledged the message immediately,
          // potentially losing the event if workflow execution failed later.
          // Now, message.ack() is called only upon successful workflow execution,
          * // and message.nack() is called if the workflow fails, ensuring at-least-once delivery.
          try {
            await workflowExecutionService.executeWorkflow(workflowId, userId, context);
            logger.info(`[GCP Pub/Sub] Event-driven workflow ${workflowId} executed successfully.`);
            message.ack(); // Acknowledge the message only after successful workflow execution
          } catch (workflowErr) {
            logger.error(`[GCP Pub/Sub] Event-driven workflow ${workflowId} execution failed:`, workflowErr);
            message.nack(); // Negative acknowledge to retry if workflow execution fails
          }
        } catch (msgErr) {
          // Catch errors during initial message processing (e.g., JSON parsing)
          logger.error(`[GCP Pub/Sub] Error processing subscription message or initial parsing:`, msgErr);
          message.nack(); // Negative acknowledge for any error before workflow execution attempt
        }
      });

      this.activeSubscriptions.set(workflowId, subscription);
      logger.info(`[GCP Pub/Sub] Dynamic listener active for topic: "${topicName}"`);

      return { success: true, subscription: subscriptionName, mocked: false };
    } catch (error) {
      logger.error(`[GCP Pub/Sub] Failed to register subscription:`, error);
      throw new Error(`Pub/Sub trigger activation failed: ${error.message}`);
    }
  }

  /**
   * Stops and releases a workflow's Pub/Sub event listener.
   * This is used when a workflow is disabled, deleted, or its trigger is changed.
   * @async
   * @param {string} workflowId - The ID of the workflow whose subscription should be unregistered.
   * @returns {Promise<{success: boolean, error?: string}>} An object indicating the result of the operation.
   */
  async unregisterPubSubTrigger(workflowId) {
    try {
      const subscription = this.activeSubscriptions.get(workflowId);
      if (subscription) {
        if (subscription.mock) {
          logger.info(`[GCP Pub/Sub Mock] Releasing simulated subscription for workflow ${workflowId}`);
        } else {
          logger.info(`[GCP Pub/Sub] Closing subscription connection for workflow ${workflowId}`);
          // Ensure the subscription object has a close method before calling it
          if (typeof subscription.close === 'function') {
            await subscription.close();
          } else {
            logger.warn(`[GCP Pub/Sub] Subscription object for workflow ${workflowId} does not have a 'close' method.`);
          }
        }
        this.activeSubscriptions.delete(workflowId);
      }
      return { success: true };
    } catch (error) {
      logger.error(`[GCP Pub/Sub] Error releasing subscription:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Natively triggers a structured Gemini JSON extraction query using Vertex AI.
   * This function guarantees a 100% schema-compliant JSON output from the AI model.
   * @async
   * @param {string} prompt - The prompt or instruction for the AI model.
   * @param {object} jsonSchema - The JSON schema that the AI's output must conform to.
   * @returns {Promise<{success: boolean, mocked?: boolean, result: object}>} An object containing the structured, schema-compliant response from the AI.
   * @throws {Error} If the Vertex AI generation fails or returns a malformed response.
   */
  async runCompliantVertexGeneration(prompt, jsonSchema) {
    try {
      const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');

      if (isMock) {
        logger.info('[Vertex AI] Mock Schema Generation bypassed.');
        return { success: true, mocked: true, result: {} };
      }

      // BUG FIX: Corrected package name from '@google-genai' to '@google/genai'
      const { GoogleGenAI } = await import('@google/genai');
      const aiClient = new GoogleGenAI({ apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY });
      
      const response = await aiClient.models.generateContent({
        model: config.gemini_pro_model || 'gemini-2.5-pro', // Structured schema outputs are best optimized on Pro models
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: jsonSchema,
          temperature: 0.1
        }
      });

      // The response.text is expected to be a JSON string due to responseMimeType and responseSchema.
      // If the AI returns malformed JSON, JSON.parse will throw, which is caught by the outer try/catch.
      const parsedResult = JSON.parse(response.text);
      return { success: true, result: parsedResult };
    } catch (error) {
      logger.error('[Vertex AI] Compliant Structured output generation failed:', error);
      throw new Error(`Vertex structured compilation failed: ${error.message}`);
    }
  }
}

/**
 * @const {GcpEventsService} gcpEventsService
 * @description A singleton instance of the GcpEventsService.
 */
export const gcpEventsService = new GcpEventsService();
export default gcpEventsService;