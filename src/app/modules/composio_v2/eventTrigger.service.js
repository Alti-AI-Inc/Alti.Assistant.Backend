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
    const trigger = await EventTrigger.findOneAndUpdate(
      { userId, appName, eventName },
      { dispatchType, targetId, paramMapping, isActive: true },
      { new: true, upsert: true }
    );
    logger.info(`EventTrigger: registered trigger for user ${userId} on event ${appName}:${eventName}`);
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
    const activeTriggers = await EventTrigger.find({
      appName: appName.toLowerCase(),
      eventName: eventName.toLowerCase(),
      isActive: true,
    });

    if (activeTriggers.length === 0) {
      logger.info(`EventTrigger: no active triggers matched "${appName}:${eventName}"`);
      return { success: true, executedCount: 0 };
    }

    let executedCount = 0;
    for (const trigger of activeTriggers) {
      // Asynchronously resolve parameters and execute to ensure webhooks return immediately
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
          logger.error(`EventTrigger: failed to execute dispatched target ${trigger.targetId}:`, execErr);
        }
      })().catch(() => {});

      executedCount++;
    }

    return {
      success: true,
      message: `Successfully accepted webhook and dispatched ${executedCount} automation(s) asynchronously.`,
      dispatchedCount: executedCount,
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
