import EventTrigger from './models/eventTrigger.model.js';
import { LangchainExecutionService } from '../langchain/langchainExecution.service.js';
import { workflowExecutionService } from '../workflow_automation/services/workflowExecution.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Helper to safely extract nested values from an object using a dot-notation path.
 * e.g., getNestedValue({ body: { issue: { title: "Bug" } } }, "body.issue.title") => "Bug"
 */
const getNestedValue = (obj, pathString) => {
  if (!pathString || !obj) return undefined;
  return pathString.split('.').reduce((acc, part) => acc && acc[part], obj);
};

/**
 * Registers or updates a webhook event trigger.
 */
const registerTrigger = async (userId, appName, eventName, dispatchType, targetId, paramMapping) => {
  try {
    // Security Note: Ensure 'userId' is derived from an authenticated session and not directly from client input
    // to prevent IDOR (Insecure Direct Object Reference) vulnerabilities where a user could register triggers for another user.

    // Normalize appName and eventName to lowercase for consistent storage and lookup.
    // This fixes a bug where `receiveWebhookEvent` queries using .toLowerCase() but `registerTrigger`
    // might store them with inconsistent casing, leading to triggers not being found.
    const normalizedAppName = appName.toLowerCase();
    const normalizedEventName = eventName.toLowerCase();

    // Optimization: Consider adding a compound index on { userId: 1, appName: 1, eventName: 1 }
    // to the EventTrigger model for faster upsert operations.
    const trigger = await EventTrigger.findOneAndUpdate(
      { userId, appName: normalizedAppName, eventName: normalizedEventName },
      { dispatchType, targetId, paramMapping, isActive: true, appName: normalizedAppName, eventName: normalizedEventName },
      { new: true, upsert: true }
    );
    logger.info(`EventTrigger: registered trigger for user ${userId} on event ${normalizedAppName}:${normalizedEventName}`);
    return { success: true, trigger };
  } catch (err) {
    logger.error('EventTrigger: registration failed:', err);
    throw err;
  }
};

/**
 * Receives an incoming Composio webhook payload, resolves its parameters, and dispatches active executions.
 */
const receiveWebhookEvent = async (appName, eventName, payload) => {
  try {
    logger.info(`EventTrigger: processing incoming webhook for "${appName}:${eventName}"`);

    // Find all active triggers matching this app and event
    // appName and eventName are converted to lowercase to match the normalized storage from registerTrigger.
    // Optimization: Add .lean() for read-only queries to return plain JavaScript objects, reducing Mongoose overhead.
    // Optimization: Consider adding a compound index on { appName: 1, eventName: 1, isActive: 1 }
    // to the EventTrigger model for faster query performance.
    const activeTriggers = await EventTrigger.find({
      appName: appName.toLowerCase(),
      eventName: eventName.toLowerCase(),
      isActive: true,
    }).lean();

    if (activeTriggers.length === 0) {
      logger.info(`EventTrigger: no active triggers matched "${appName}:${eventName}"`);
      return { success: true, executedCount: 0 };
    }

    let dispatchedCount = 0;
    for (const trigger of activeTriggers) {
      // Asynchronously resolve parameters and execute to ensure webhooks return immediately.
      // The .catch(() => {}) on the IIFE prevents unhandled promise rejections from crashing the process,
      // while the internal try/catch logs specific execution errors.
      (async () => {
        try {
          const resolvedInputs = {};
          for (const [inputKey, payloadPath] of Object.entries(trigger.paramMapping || {})) {
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
          // Log errors for individual asynchronous dispatches
          logger.error(`EventTrigger: failed to execute dispatched target ${trigger.targetId}:`, execErr);
        }
      })().catch(() => {
        // This outer catch prevents unhandled promise rejections from the IIFE itself,
        // but individual execution errors are already logged by the inner catch.
      });

      dispatchedCount++;
    }

    // Bug Fix: Adjusted the message to accurately reflect that automations are *initiated* asynchronously,
    // not necessarily completed successfully, as the webhook returns immediately.
    return {
      success: true,
      message: `Webhook received. Initiated ${dispatchedCount} automation dispatch(es) asynchronously.`,
      dispatchedCount: dispatchedCount,
    };
  } catch (err) {
    logger.error(`EventTrigger: receiveWebhookEvent failed:`, err);
    throw err;
  }
};

export const eventTriggerService = {
  registerTrigger,
  receiveWebhookEvent,
};