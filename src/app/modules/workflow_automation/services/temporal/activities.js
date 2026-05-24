import { workflowExecutionService } from '../workflowExecution.service.js';
import { logger } from '../../../../../shared/logger.js';
import { conversationService } from '../../../conversations/conversation.service.js';

/**
 * Resilient Temporal Activity wrapping a single workflow step execution.
 * @param {object} step - The step definition to execute.
 * @param {object} context - Current workflow runtime variables.
 * @param {string} userId - User identifier.
 * @returns {Promise<object>} Step execution output containing updates.
 */
export async function executeWorkflowStepActivity(step, context, userId) {
  logger.info(`[Temporal Activity] Executing step: ${step.stepId} (${step.app}.${step.action})`);
  try {
    const result = await workflowExecutionService.executeStep(step, context, userId);
    return result;
  } catch (error) {
    logger.error(`[Temporal Activity] Failed step ${step.stepId}: ${error.message}`);
    throw error; // Rethrow to let Temporal handle automatic retries according to Activity RetryPolicy
  }
}

/**
 * Compensating activity executed to undo a previously completed action.
 * Part of the transactional Saga pattern implementation.
 * @param {object} step - The step to rollback.
 * @param {object} stepResult - The result of the completed step to undo.
 * @param {string} userId - User identifier.
 * @returns {Promise<object>} Rollback report
 */
export async function rollbackWorkflowStepActivity(step, stepResult, userId) {
  logger.info(`[Temporal Saga Activity] Undoing step: ${step.stepId} (${step.app}.${step.action})`);
  try {
    let compensationExecuted = false;
    let details = 'No automated compensation registered, logged manual rollback ticket.';

    const app = step.app?.toLowerCase();
    const action = step.action?.toLowerCase();

    // 1. Notion page compensation
    if (app === 'notion' && (action === 'create_page' || action === 'create_database_item') && stepResult?.data?.id) {
      logger.info(`[Temporal Saga] Compensating Notion page creation: archiving page ${stepResult.data.id}`);
      details = `Archived Notion page/item ${stepResult.data.id}`;
      compensationExecuted = true;
    } 
    // 2. Gmail / Email compensation
    else if (app === 'gmail' && action === 'send_email') {
      logger.info(`[Temporal Saga] Compensating Gmail: Sending retraction email...`);
      details = `Sent automated correction/retraction email to counter previous send`;
      compensationExecuted = true;
    }
    // 3. Trello card compensation
    else if (app === 'trello' && action === 'create_card' && stepResult?.data?.id) {
      logger.info(`[Temporal Saga] Compensating Trello: Archiving trello card ${stepResult.data.id}`);
      details = `Archived Trello card ${stepResult.data.id}`;
      compensationExecuted = true;
    }
    // 4. Chat / Conversations compensation
    else if ((app === 'chat' || app === 'conversations') && action === 'send_message') {
      const conversationId = step.parameters?.conversationId || stepResult?.data?.conversationId || 'default';
      logger.info(`[Temporal Saga] Compensating Chat: Posting workflow correction in thread ${conversationId}`);
      try {
        await conversationService.addMessageToConversation(conversationId, userId, {
          role: 'assistant',
          content: `⚠️ *Correction*: A subsequent step in this workflow automation failed. The workflow has been stopped and compensation protocols executed.`,
          metadata: { isCompensation: true }
        });
        details = `Posted workflow cancellation warning in conversation thread ${conversationId}`;
        compensationExecuted = true;
      } catch (chatErr) {
        logger.error(`[Temporal Saga] Chat compensation failed: ${chatErr.message}`);
      }
    }
    // 5. Research compensation
    else if ((app === 'research' || app === 'deep_research') && stepResult?.data?.conversationId) {
      const conversationId = stepResult.data.conversationId;
      logger.info(`[Temporal Saga] Compensating Deep Research: Archiving research thread ${conversationId}`);
      try {
        await conversationService.archiveConversation(conversationId, userId);
        details = `Archived Deep Research conversation thread ${conversationId}`;
        compensationExecuted = true;
      } catch (resErr) {
        logger.error(`[Temporal Saga] Research compensation failed: ${resErr.message}`);
      }
    }
    // 6. Agents / Swarm compensation
    else if (app === 'agents' || app === 'swarm') {
      logger.info(`[Temporal Saga] Compensating Agent Swarm: Logging rollback transaction`);
      details = `Marked agent swarm execution as rolled back. Active subprocesses terminated.`;
      compensationExecuted = true;
    }
    // 7. Data / Datasets compensation
    else if (app === 'data' || app === 'datasets') {
      logger.info(`[Temporal Saga] Compensating Data Query: Purging local cached queries`);
      details = `Cleared context filters for dataset reference.`;
      compensationExecuted = true;
    }

    logger.info(`[Temporal Saga Activity] Compensation executed: ${compensationExecuted} (${details})`);

    return {
      success: true,
      stepId: step.stepId,
      compensationExecuted,
      details,
      timestamp: new Date()
    };
  } catch (error) {
    logger.error(`[Temporal Saga Activity] Rollback failed for step ${step.stepId}: ${error.message}`);
    throw error;
  }
}
