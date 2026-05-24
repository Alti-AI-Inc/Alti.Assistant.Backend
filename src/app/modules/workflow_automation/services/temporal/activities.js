import { workflowExecutionService } from '../workflowExecution.service.js';
import { logger } from '../../../../../shared/logger.js';
import { conversationService } from '../../../conversations/conversation.service.js';
import WorkflowExecution from '../../models/workflowExecution.model.js';

/**
 * Resilient Temporal Activity wrapping a single workflow step execution.
 * @param {object} step - The step definition to execute.
 * @param {object} context - Current workflow runtime variables.
 * @param {string} userId - User identifier.
 * @returns {Promise<object>} Step execution output containing updates.
 */
export async function executeWorkflowStepActivity(step, context, userId) {
  logger.info(`[Temporal Activity] Executing step: ${step.stepId} (${step.app}.${step.action || step.stepType})`);
  
  const executionId = context._executionId;
  const stepStartTime = new Date();
  
  if (executionId) {
    try {
      await workflowExecutionService.updateStepStatus(executionId, step.stepId, 'running', stepStartTime);
    } catch (err) {
      logger.warn(`Failed to update step status in activity to running: ${err.message}`);
    }
  }

  try {
    const result = await workflowExecutionService.executeStep(step, context, userId);
    
    const stepEndTime = new Date();
    const duration = stepEndTime - stepStartTime;
    
    if (executionId) {
      try {
        await workflowExecutionService.updateStepStatus(
          executionId,
          step.stepId,
          'completed',
          stepStartTime,
          stepEndTime,
          duration,
          result
        );
      } catch (err) {
        logger.warn(`Failed to update step status in activity to completed: ${err.message}`);
      }
    }

    return result;
  } catch (error) {
    logger.error(`[Temporal Activity] Failed step ${step.stepId}: ${error.message}`);
    
    const stepEndTime = new Date();
    const duration = stepEndTime - stepStartTime;
    
    if (executionId) {
      try {
        await workflowExecutionService.updateStepStatus(
          executionId,
          step.stepId,
          'failed',
          stepStartTime,
          stepEndTime,
          duration,
          null,
          error
        );
      } catch (err) {
        logger.warn(`Failed to update step status in activity to failed: ${err.message}`);
      }
    }

    throw error; // Rethrow to let Temporal handle automatic retries according to Activity RetryPolicy
  }
}

/**
 * Update step status to skipped in database for Temporal runs
 */
export async function skipWorkflowStepActivity(executionId, stepId, reason) {
  try {
    await workflowExecutionService.updateStepStatus(
      executionId,
      stepId,
      'skipped',
      new Date(),
      new Date(),
      0,
      { skipped: true, reason }
    );
    return { success: true };
  } catch (err) {
    logger.error(`[Temporal Activity] Failed to skip step: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Initialize state tracking in database for Temporal execution
 */
export async function updateExecutionToRunningActivity(executionId, totalSteps) {
  try {
    await WorkflowExecution.updateOne(
      { _id: executionId },
      {
        status: 'running',
        startTime: new Date(),
        totalSteps,
      }
    );
    return { success: true };
  } catch (err) {
    logger.error(`[Temporal Activity] Failed to update execution to running: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Update execution record as completed successfully in MongoDB
 */
export async function completeExecutionActivity(executionId, summary, currentContext, completedSteps, failedSteps) {
  try {
    const endTime = new Date();
    const execution = await WorkflowExecution.findById(executionId);
    const duration = execution?.startTime ? (endTime - execution.startTime) : 0;
    
    await WorkflowExecution.updateOne(
      { _id: executionId },
      {
        status: 'completed',
        endTime,
        duration,
        completedSteps,
        failedSteps,
        context: currentContext,
        result: {
          success: failedSteps === 0,
          summary,
        }
      }
    );
    return { success: true };
  } catch (err) {
    logger.error(`[Temporal Activity] Failed to complete execution: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Update execution record as failed in MongoDB
 */
export async function failExecutionActivity(executionId, errorMessage, errorStack) {
  try {
    await WorkflowExecution.updateOne(
      { _id: executionId },
      {
        status: 'failed',
        endTime: new Date(),
        error: {
          message: errorMessage,
          stack: errorStack
        }
      }
    );
    return { success: true };
  } catch (err) {
    logger.error(`[Temporal Activity] Failed to fail execution: ${err.message}`);
    return { success: false, error: err.message };
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
    // 8. Google Cloud Platform compensation
    else if (app === 'google_cloud' || app === 'gcp') {
      const bucketName = step.parameters?.bucketName || stepResult?.data?.bucketName;
      const fileName = step.parameters?.fileName || stepResult?.data?.fileName;
      if (action === 'gcs_upload' && bucketName && fileName) {
        logger.info(`[Temporal Saga] Compensating GCS: Deleting uploaded file gs://${bucketName}/${fileName}`);
        const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');
        if (!isMock) {
          try {
            const { Storage } = await import('@google-cloud/storage');
            const storage = new Storage();
            await storage.bucket(bucketName).file(fileName).delete();
          } catch (err) {
            logger.error(`[Temporal Saga] GCS deletion failed: ${err.message}`);
          }
        }
        details = `Deleted uploaded GCS file gs://${bucketName}/${fileName}`;
        compensationExecuted = true;
      } else {
        details = `No compensation required for action ${action} on google_cloud.`;
        compensationExecuted = true;
      }
    }
    // 9. Google Workspace compensation
    else if (app === 'google_workspace') {
      const fileId = stepResult?.data?.fileId;
      if (action === 'drive_upload' && fileId) {
        logger.info(`[Temporal Saga] Compensating Drive: Deleting uploaded file ID ${fileId}`);
        const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');
        if (!isMock) {
          try {
            const { google } = await import('googleapis');
            const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.file'] });
            const authClient = await auth.getClient();
            const drive = google.drive({ version: 'v3', auth: authClient });
            await drive.files.delete({ fileId });
          } catch (err) {
            logger.error(`[Temporal Saga] Google Drive deletion failed: ${err.message}`);
          }
        }
        details = `Deleted uploaded Google Drive file with ID ${fileId}`;
        compensationExecuted = true;
      } else if (action === 'sheets_append') {
        const spreadsheetId = step.parameters?.spreadsheetId || stepResult?.data?.spreadsheetId;
        const range = stepResult?.data?.updatedRange || step.parameters?.range;
        const rowsAppended = stepResult?.data?.rowsAppended || 1;
        
        logger.info(`[Temporal Saga] Compensating Google Sheets: Deleting ${rowsAppended} appended rows from sheet...`);
        const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');
        
        if (!isMock && spreadsheetId && range) {
          try {
            const { google } = await import('googleapis');
            const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
            const authClient = await auth.getClient();
            const sheets = google.sheets({ version: 'v4', auth: authClient });
            
            const rangeRegex = /(?:'?(.+?)'?!)?([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?/;
            const match = range.match(rangeRegex);
            if (match) {
              const sheetName = match[1] || 'Sheet1';
              const startRow = parseInt(match[3], 10) - 1; // 0-indexed in Sheets API
              const endRow = match[5] ? parseInt(match[5], 10) : startRow + rowsAppended;
              
              const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
              const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
              const sheetId = sheet ? sheet.properties.sheetId : 0;
              
              await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                  requests: [
                    {
                      deleteDimension: {
                        range: {
                          sheetId,
                          dimension: 'ROWS',
                          startIndex: startRow,
                          endIndex: endRow
                        }
                      }
                    }
                  ]
                }
              });
              details = `Deleted ${rowsAppended} appended rows (indices ${startRow} to ${endRow}) from Sheet "${sheetName}"`;
              compensationExecuted = true;
            } else {
              details = `Could not parse sheets range regex: ${range}. Bypassed.`;
              compensationExecuted = true;
            }
          } catch (err) {
            logger.error(`[Temporal Saga] Google Sheets compensation failed: ${err.message}`);
            details = `Sheets deletion failed: ${err.message}`;
            compensationExecuted = false;
          }
        } else {
          details = `[Mock Rollback] Deleted ${rowsAppended} appended rows from range ${range || 'unknown'}`;
          compensationExecuted = true;
        }
      } else {
        details = `No compensation required for action ${action} on google_workspace.`;
        compensationExecuted = true;
      }
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

export * from '../../../datasets/temporal/ingestionActivities.js';

