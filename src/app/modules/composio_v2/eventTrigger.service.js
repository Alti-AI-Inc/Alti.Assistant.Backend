import EventTrigger from './models/eventTrigger.model.js';
import { LangchainExecutionService } from '../langchain/langchainExecution.service.js';
import { workflowExecutionService } from '../workflow_automation/services/workflowExecution.service.js';
import { logger } from '../../../shared/logger.js';

// Security: Define constants for input validation to prevent magic numbers and ease maintenance.
const MAX_PAYLOAD_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_MAPPING_KEYS = 100;
const MAX_STRING_LENGTH = 256;
const ID_REGEX = /^[a-zA-Z0-9_-]{1,256}$/; // A reasonably strict regex for common ID formats.
const NAME_REGEX = /^[a-z0-9_.-]{1,100}$/; // A reasonably strict regex for normalized app/event names.

/**
 * Safely extracts a nested value from an object using a dot-notation path string.
 * This helper prevents errors when accessing properties that might not exist at intermediate levels.
 * It also includes protection against prototype pollution.
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
  return pathString.split('.').reduce((acc, part) => {
    // Security: Prevent prototype pollution. Do not allow access to __proto__, constructor, or prototype.
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
      logger.warn(`EventTrigger: Detected attempt to access prohibited property '${part}' in path.`);
      return undefined;
    }
    return acc && acc[part];
  }, obj);
};

/**
 * Registers a new webhook event trigger or updates an existing one.
 * This function ensures that event triggers are consistently stored with normalized (lowercase)
 * application and event names for reliable lookup. It includes robust input validation.
 *
 * @param {string} userId - The ID of the user registering the trigger.
 * @param {string} appName - The name of the application (e.g., "github", "slack"). Will be normalized to lowercase.
 * @param {string} eventName - The name of the event (e.g., "issue_opened", "message_posted"). Will be normalized to lowercase.
 * @param {'chain' | 'workflow'} dispatchType - The type of execution to dispatch ('chain' for Langchain, 'workflow' for Workflow Automation).
 * @param {string} targetId - The ID of the target to execute (e.g., Langchain chain ID or Workflow ID).
 * @param {Object.<string, string>} paramMapping - An object mapping internal input keys to dot-notation paths within the incoming webhook payload.
 *   For example: `{ "issueTitle": "body.issue.title", "repositoryName": "body.repository.name" }`.
 * @returns {Promise<{ success: boolean, trigger?: import('./models/eventTrigger.model.js').EventTriggerDocument }>} A promise that resolves to an object indicating success and the registered trigger document.
 * @throws {Error} If the trigger registration fails due to a database error or invalid input.
 */
const registerTrigger = async (userId, appName, eventName, dispatchType, targetId, paramMapping) => {
  try {
    // Security Note: Ensure 'userId' is derived from an authenticated session and not directly from client input
    // to prevent IDOR (Insecure Direct Object Reference) vulnerabilities where a user could register triggers for another user.

    // Security: Perform comprehensive input validation to prevent invalid data storage and potential downstream errors.
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId provided.');
    }
    if (dispatchType !== 'chain' && dispatchType !== 'workflow') {
      throw new Error('Invalid dispatchType. Must be "chain" or "workflow".');
    }
    if (!ID_REGEX.test(targetId)) {
      throw new Error('Invalid targetId format.');
    }
    if (typeof appName !== 'string' || typeof eventName !== 'string') {
      throw new Error('appName and eventName must be strings.');
    }

    const normalizedAppName = appName.toLowerCase();
    const normalizedEventName = eventName.toLowerCase();

    if (!NAME_REGEX.test(normalizedAppName) || !NAME_REGEX.test(normalizedEventName)) {
      throw new Error('Invalid appName or eventName format. Use lowercase letters, numbers, and .-_');
    }

    if (typeof paramMapping !== 'object' || paramMapping === null || Array.isArray(paramMapping)) {
      throw new Error('paramMapping must be a valid object.');
    }

    const mappingKeys = Object.keys(paramMapping);
    if (mappingKeys.length > MAX_MAPPING_KEYS) {
      throw new Error(`paramMapping cannot exceed ${MAX_MAPPING_KEYS} keys.`);
    }

    for (const key of mappingKeys) {
      const value = paramMapping[key];
      if (key.length > MAX_STRING_LENGTH || typeof value !== 'string' || value.length > MAX_STRING_LENGTH) {
        throw new Error(`paramMapping keys and values must be strings and not exceed ${MAX_STRING_LENGTH} characters.`);
      }
      // Security: Prevent keys from being special object properties.
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new Error(`paramMapping key '${key}' is a reserved name.`);
      }
    }

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
    // Security: Create a null-prototype object for resolvedInputs to prevent prototype pollution vulnerabilities downstream.
    const resolvedInputs = Object.create(null);
    const paramMapping = trigger.paramMapping || {};
    const keys = Object.keys(paramMapping);

    // Optimization: Use a fast procedural loop instead of Object.entries to avoid array allocations.
    for (let i = 0; i < keys.length; i++) {
      const inputKey = keys[i];
      // Security: Although validated on registration, double-check to prevent processing of malicious keys.
      if (inputKey === '__proto__' || inputKey === 'constructor' || inputKey === 'prototype') {
        continue;
      }
      const payloadPath = paramMapping[inputKey];
      const val = getNestedValue(payload, payloadPath);
      if (val !== undefined) {
        // SECURITY WARNING: The value 'val' is untrusted data originating from the webhook payload.
        // Downstream services (e.g., LangchainExecutionService, workflowExecutionService) are responsible
        // for implementing context-specific sanitization and escaping (e.g., HTML escaping for web output,
        // parameterization for database queries) to prevent XSS, injection, and other vulnerabilities.
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
    // Security: Validate input types before use.
    if (typeof appName !== 'string' || typeof eventName !== 'string' || !payload || typeof payload !== 'object') {
      logger.warn('EventTrigger: received webhook with invalid input types.');
      // Do not throw, as this might cause webhook providers to retry. Return a success-like response.
      return { success: true, message: 'Invalid input.', dispatchedCount: 0 };
    }

    // Security: Limit the size of the incoming payload to prevent Denial of Service (DoS) attacks via resource exhaustion.
    // This is an approximation; a more accurate but slower method would be a deep object traversal.
    if (JSON.stringify(payload).length > MAX_PAYLOAD_SIZE_BYTES) {
      logger.warn(`EventTrigger: received webhook payload for "${appName}:${eventName}" exceeded size limit.`);
      // Return a success-like response to the webhook sender to avoid retries, but do not process.
      return { success: true, message: 'Payload size exceeds limit.', dispatchedCount: 0 };
    }

    const normalizedAppName = appName.toLowerCase();
    const normalizedEventName = eventName.toLowerCase();

    // Security: Validate format of normalized names to prevent unexpected values in queries.
    if (!NAME_REGEX.test(normalizedAppName) || !NAME_REGEX.test(normalizedEventName)) {
      logger.warn(`EventTrigger: received webhook with invalid app/event name format: "${appName}:${eventName}"`);
      return { success: true, message: 'Invalid app/event name format.', dispatchedCount: 0 };
    }

    logger.info(`EventTrigger: processing incoming webhook for "${normalizedAppName}:${normalizedEventName}"`);

    // Find all active triggers matching this app and event
    // Optimization: .lean() is used to return plain JavaScript objects, reducing Mongoose overhead.
    // Optimization: Ensure a compound index exists on { appName: 1, eventName: 1, isActive: 1 } for fast lookups.
    const activeTriggers = await EventTrigger.find({
      appName: normalizedAppName,
      eventName: normalizedEventName,
      isActive: true,
    }).lean();

    const len = activeTriggers.length;
    if (len === 0) {
      logger.info(`EventTrigger: no active triggers matched "${normalizedAppName}:${normalizedEventName}"`);
      return { success: true, message: 'No active triggers found.', dispatchedCount: 0 };
    }

    // Optimization: Use a fast procedural loop and delegate execution to a dedicated helper function.
    // This avoids creating nested closures/IIFEs inside the loop, saving memory and CPU cycles.
    for (let i = 0; i < len; i++) {
      // Fire-and-forget: dispatch triggers asynchronously and do not wait for their completion.
      // Errors within dispatchTrigger are logged there and intentionally swallowed here to prevent one failed
      // trigger from halting others.
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