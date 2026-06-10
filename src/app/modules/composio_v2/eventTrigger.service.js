import EventTrigger from './models/eventTrigger.model.js';
import { LangchainExecutionService } from '../langchain/langchainExecution.service.js';
import { workflowExecutionService } from '../workflow_automation/services/workflowExecution.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Safely extracts a nested value from an object using a dot-notation path string.
 * This helper prevents errors when accessing properties that might not exist at intermediate levels.
 *
 * @example
 * // Returns "Bug"
 * getNestedValue({ body: { issue: { title: "Bug" } } }, "body.issue.title");
 *
 * @example
 * // Returns undefined (path does not exist)
 * getNestedValue({ data: { user: { id: 123 } } }, "data.user.profile.name");
 *
 * @param {object} obj - The object from which to extract the value.
 * @param {string} pathString - The dot-notation path string (e.g., "body.issue.title").
 * @returns {any | undefined} The value at the specified path, or `undefined` if the path does not exist or `obj` is null/undefined.
 */
const getNestedValue = (obj, pathString) => {
  if (!pathString || !obj) return undefined;
  return pathString.split('.').reduce((acc, part) => acc && acc[part], obj);
};

/**
 * Registers a new webhook event trigger or updates an existing one.
 * This function ensures that event triggers are consistently stored with normalized (lowercase)
 * application and event names for reliable lookup.
 *
 * @param {string} userId - The ID of the user registering the trigger.
 * @param {string} appName - The name of the application (e.g., "github", "slack"). Will be normalized to lowercase.
 * @param {string} eventName - The name of the event (e.g., "issue_opened", "message_posted"). Will be normalized to lowercase.
 * @param {'chain' | 'workflow'} dispatchType - The type of execution to dispatch ('chain' for Langchain, 'workflow' for Workflow Automation).
 * @param {string} targetId - The ID of the target to execute (e.g., Langchain chain ID or Workflow ID).
 * @param {Object.<string, string>} paramMapping - An object mapping internal input keys to dot-notation paths within the incoming webhook payload.
 *   For example: `{ "issueTitle": "body.issue.title", "repositoryName": "body.repository.name" }`.
 * @returns {Promise<{ success: boolean, trigger?: import('./models/eventTrigger.model.js').EventTriggerDocument }>} A promise that resolves to an object indicating success and the registered trigger document.
 * @throws {Error} If the trigger registration fails due to a database error or other issues.
 */
const registerTrigger = async (userId, appName, eventName, dispatchType, targetId, paramMapping) => {
  try {
    // Security Note: Ensure 'userId' is derived from an authenticated session and not directly from client input
    // to prevent IDOR (Insecure Direct Object Reference) vulnerabilities where a user could register triggers for another user.

    // Normalize appName and eventName to lowercase for consistent storage and lookup.
    const normalizedAppName = appName.toLowerCase();
    const normalizedEventName = eventName.toLowerCase();

    // Optimization: Added .lean() to avoid Mongoose document instantiation overhead for read/write upsert.
    // Optimization: Ensure a compound index exists on { userId: 1, appName: 1, eventName: 1 } for fast upserts.
    const trigger = await EventTrigger.findOneAndUpdate(
      { userId, appName: normalizedAppName, eventName: normalizedEventName },
      { dispatchType, targetId, paramMapping, isActive: true, appName: normalizedAppName, eventName: normalizedEventName },
      { new: true, upsert: true }
    ).lean();
    logger.info(`EventTrigger: registered trigger for user ${userId} on event ${normalizedAppName}:${normalizedEventName}`);
    return { success: true, trigger };
  } catch (err) {
    logger.error('EventTrigger: registration failed:', err);
    throw err;
  }
};

/**
 * Helper function to handle asynchronous dispatching of triggers.
 * Defined outside the loop to avoid creating anonymous functions/closures in a loop,
 * which reduces garbage collection overhead and improves performance.
 *
 * @param {object} trigger - The event trigger configuration.
 * @param {object} payload - The incoming webhook payload.
 */
const dispatchTrigger = async (trigger, payload) => {
  try {
    const resolvedInputs = {};
    const paramMapping = trigger.paramMapping || {};
    const keys = Object.keys(paramMapping);
    
    // Optimization: Use a fast procedural loop instead of Object.entries to avoid array allocations.
    for (let i = 0; i < keys.length; i++) {
      const inputKey = keys[i];
      const payloadPath = paramMapping[inputKey];
      const val = getNestedValue(payload, payloadPath);
      if (val !== undefined) {
        resolvedInputs[inputKey] = val;
      }
    }

    logger.info(`EventTrigger: dispatching execution of type "${trigger.dispatchType}" for user ${trigger.userId}`);

    if (trigger.dispatchType === 'chain') {
      await LangchainExecutionService.executeChain(trigger.targetId, resolvedInputs, trigger.userId);
    } else if (trigger.dispatchType === 'workflow') {
      await workflowExecutionService.executeWorkflow(trigger.targetId, trigger.userId, {
        webhookPayload: payload,
        webhookInputs: resolvedInputs,
      });
    }
  } catch (execErr) {
    logger.error(`EventTrigger: failed to execute dispatched target ${trigger.targetId}:`, execErr);
  }
};

/**
 * Processes an incoming Composio webhook payload, resolves parameters based on registered triggers,
 * and dispatches corresponding Langchain chains or workflows asynchronously.
 *
 * This function is designed to return quickly, initiating automation executions in the background.
 *
 * @param {string} appName - The name of the application from which the webhook originated (e.g., "github"). Will be normalized to lowercase for lookup.
 * @param {string} eventName - The specific event that occurred (e.g., "issue_opened"). Will be normalized to lowercase for lookup.
 * @param {object} payload - The full JSON payload received from the webhook.
 * @returns {Promise<{ success: boolean, message: string, dispatchedCount: number }>} A promise that resolves to an object indicating success, a message, and the number of automations initiated.
 * @throws {Error} If there's a critical error during the initial processing of the webhook (e.g., database query failure).
 */
const receiveWebhookEvent = async (appName, eventName, payload) => {
  try {
    logger.info(`EventTrigger: processing incoming webhook for "${appName}:${eventName}"`);

    // Find all active triggers matching this app and event
    // Optimization: .lean() is used to return plain JavaScript objects, reducing Mongoose overhead.
    // Optimization: Ensure a compound index exists on { appName: 1, eventName: 1, isActive: 1 } for fast lookups.
    const activeTriggers = await EventTrigger.find({
      appName: appName.toLowerCase(),
      eventName: eventName.toLowerCase(),
      isActive: true,
    }).lean();

    const len = activeTriggers.length;
    if (len === 0) {
      logger.info(`EventTrigger: no active triggers matched "${appName}:${eventName}"`);
      return { success: true, executedCount: 0 };
    }

    // Optimization: Use a fast procedural loop and delegate execution to a dedicated helper function.
    // This avoids creating nested closures/IIFEs inside the loop, saving memory and CPU cycles.
    for (let i = 0; i < len; i++) {
      dispatchTrigger(activeTriggers[i], payload).catch(() => {});
    }

    return {
      success: true,
      message: `Webhook received. Initiated ${len} automation dispatch(es) asynchronously.`,
      dispatchedCount: len,
    };
  } catch (err) {
    logger.error(`EventTrigger: receiveWebhookEvent failed:`, err);
    throw err;
  }
};

/**
 * @typedef {object} EventTriggerService
 * @property {function(string, string, string, 'chain' | 'workflow', string, Object.<string, string>): Promise<{ success: boolean, trigger?: import('./models/eventTrigger.model.js').EventTriggerDocument }>} registerTrigger - Registers or updates a webhook event trigger.
 * @property {function(string, string, object): Promise<{ success: boolean, message: string, dispatchedCount: number }>} receiveWebhookEvent - Receives and processes an incoming webhook event.
 */

/**
 * Provides services for managing and processing webhook event triggers.
 * This includes registering new triggers and handling incoming webhook payloads
 * to dispatch associated automations (Langchain chains or workflows).
 * @type {EventTriggerService}
 */
export const eventTriggerService = {
  registerTrigger,
  receiveWebhookEvent,
};