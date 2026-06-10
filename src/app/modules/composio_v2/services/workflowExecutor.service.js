import { logger } from '../../../../shared/logger.js';
import WorkflowExecution from '../models/workflowExecution.model.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import { runAIClassificationAgent } from '../ai_classification/workflow.js';
import { executeComposioWithGemini } from '../services/aiClassificationService.js';
import ComposioAuth from '../composio.model.js';

/**
 * Escapes special characters in a string for use in a regular expression.
 * This is a security measure to prevent Regular Expression Denial of Service (ReDoS) attacks.
 * @param {string} string The string to escape.
 * @returns {string} The escaped string, safe for use in a RegExp.
 * @private
 */
const escapeRegex = (string) => {
  if (typeof string !== 'string') {
    return '';
  }
  // Escape characters with special meaning in regular expressions.
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Sanitizes a string by replacing HTML special characters to prevent Cross-Site Scripting (XSS) attacks.
 * @param {string} str The input string to sanitize.
 * @returns {string} The sanitized string.
 * @private
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') {
    // Ensure we always return a string to prevent downstream errors.
    return str ? String(str) : '';
  }
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
};


// Optimization Recommendation: Add indexes to Mongoose models for improved query performance.
// For WorkflowExecution model:
// - Consider a compound index on `{ executionId: 1, userId: 1 }` for `findOne` queries in `cancelExecution` and `retryExecution`.
// - Consider an index on `{ workflowId: 1 }` for `getExecutionStats` and `retryExecution`.
// For ComposioAuth model:
// - Consider a compound index on `{ userId: 1, integrationId: 1, status: 1 }` for `findOne` and `find` queries.

/**
 * Provides services for executing and managing workflows.
 * This class handles the entire lifecycle of a workflow execution,
 * including single-step, multi-step, validation, and error handling.
 * All operations are performed within the context of a specific user.
 * @class WorkflowExecutor
 */
class WorkflowExecutor {
  /**
   * Executes a saved workflow, creating an execution record and running the defined steps.
   * This is the main entry point for triggering a workflow.
   * @param {import('../models/scheduledWorkflow.model.js').ScheduledWorkflow} workflow The Mongoose document of the workflow to execute.
   * @param {string} [executionType='manual'] The type of execution (e.g., 'manual', 'scheduled', 'retry').
   * @param {string} [triggerSource='api_call'] The source that triggered the execution (e.g., 'api_call', 'scheduler').
   * @returns {Promise<object>} An object containing the result of the execution.
   * @property {boolean} success - Indicates if the execution was successfully initiated and completed.
   * @property {string} executionId - The unique ID for this execution instance.
   * @property {object} [data] - The output data from the workflow if successful.
   * @property {string} [summary] - A summary of the execution result.
   * @property {string} [error] - An error message if the execution failed.
   * @property {string} message - A user-friendly message about the outcome.
   */
  async executeWorkflow(
    workflow,
    executionType = 'manual',
    triggerSource = 'api_call'
  ) {
    const executionId = WorkflowExecution.generateExecutionId();
    let execution; // Declare execution here to make it accessible in catch block

    try {
      logger.info(
        `Starting workflow execution: ${workflow.workflowId} (${executionType})`
      );

      // Create execution record
      execution = new WorkflowExecution({
        executionId,
        workflowId: workflow.workflowId,
        userId: workflow.userId,
        executionType,
        triggerSource,
        totalSteps: workflow.totalSteps,
        connectedAccountsUsed: workflow.connectedAccounts,
      });

      await execution.save();
      await execution.startExecution();

      // Validate connections before execution
      const connectionCheck = await this.validateConnections(workflow);
      if (!connectionCheck.success) {
        // Note: connectionCheck.error is already sanitized by validateConnections
        await execution.addLog(
          'error',
          `Connection validation failed: ${connectionCheck.error}`
        );
        await execution.completeExecution(false, {
          error: connectionCheck.error,
        });

        // Update workflow failure count
        await workflow.updateExecutionStats(false);

        return {
          success: false,
          executionId,
          error: connectionCheck.error,
          message: 'Workflow execution failed due to connection issues',
        };
      }

      // Execute workflow based on type
      let executionResult;
      if (workflow.workflowType === 'single_step') {
        executionResult = await this.executeSingleStepWorkflow(
          workflow,
          execution,
          connectionCheck.connectedAccounts
        );
      } else {
        executionResult = await this.executeMultiStepWorkflow(
          workflow,
          execution,
          connectionCheck.connectedAccounts
        );
      }

      // Complete execution
      await execution.completeExecution(executionResult.success, {
        // Note: summary is already sanitized by the execution methods
        summary: executionResult.summary || 'Workflow completed',
        data: executionResult.data,
        outputData: executionResult.outputData,
      });

      // Update workflow stats
      await workflow.updateExecutionStats(executionResult.success);

      logger.info(
        `Workflow execution completed: ${workflow.workflowId} - ${executionResult.success ? 'Success' : 'Failed'}`
      );

      return {
        success: executionResult.success,
        executionId,
        data: executionResult.data,
        summary: executionResult.summary,
        message: executionResult.success
          ? 'Workflow executed successfully'
          : 'Workflow execution failed',
      };
    } catch (error) {
      logger.error(`Error executing workflow ${workflow.workflowId}:`, error);

      // Security Patch: Sanitize error messages before saving to the database or returning in response to prevent stored XSS.
      const sanitizedErrorMessage = sanitizeString(error.message || 'An unknown error occurred.');

      // Update execution record with error
      try {
        // Optimization: Reuse the 'execution' object if it was successfully saved.
        // Avoids a redundant database query if the error occurred after execution.save().
        // Check for `_id` to ensure the document was persisted.
        if (execution && execution._id) {
          await execution.addLog('error', `Execution failed: ${sanitizedErrorMessage}`);
          await execution.completeExecution(false, { error: sanitizedErrorMessage });
        } else {
          logger.warn(
            `Execution record for ${executionId} was not found or not saved, cannot update with error.`
          );
        }

        // Update workflow failure count
        await workflow.updateExecutionStats(false);
      } catch (updateError) {
        logger.error(
          'Failed to update execution record with error:',
          updateError
        );
      }

      return {
        success: false,
        executionId,
        error: sanitizedErrorMessage,
        message: 'Workflow execution failed',
      };
    }
  }

  /**
   * Executes a workflow consisting of a single step.
   * @param {import('../models/scheduledWorkflow.model.js').ScheduledWorkflow} workflow The workflow document.
   * @param {import('../models/workflowExecution.model.js').WorkflowExecution} execution The current execution document.
   * @param {Array<object>} [prefetchedAccounts=null] An array of prefetched connected accounts to optimize DB queries.
   * @returns {Promise<object>} The result of the single-step execution.
   * @property {boolean} success - True if the step completed successfully.
   * @property {object} [data] - The data returned by the executed action.
   * @property {string} summary - A summary of the step's outcome.
   * @property {object} outputData - The structured output data.
   * @private
   */
  async executeSingleStepWorkflow(workflow, execution, prefetchedAccounts = null) {
    try {
      const step = workflow.executionPlan[0];
      // Security Patch: Sanitize potentially user-controlled workflow data before use in logs or summaries.
      const sanitizedApp = sanitizeString(step.app);
      const sanitizedAction = sanitizeString(step.action);

      await execution.addLog(
        'info',
        `Executing single step: ${sanitizedApp} -> ${sanitizedAction}`
      );
      
      const startTime = new Date(); // Capture start time for duration calculation
      await execution.updateProgress(1, {
        step: 1,
        app: step.app,
        action: step.action,
        status: 'running',
        startTime: startTime,
        parameters: step.parameters,
      });

      // Get user's connected account for the app (utilizing prefetched accounts to avoid DB query)
      const connectedAccount = await this.getConnectedAccount(
        workflow.userId,
        step.app,
        prefetchedAccounts
      );
      if (!connectedAccount) {
        // Security Patch: Sanitize app name in error message.
        throw new Error(`No connected account found for ${sanitizedApp}`);
      }

      // Execute using existing Composio integration
      const result = await this.executeComposioAction(
        workflow.userId,
        step.app,
        step.action,
        step.parameters,
        connectedAccount
      );

      const endTime = new Date(); // Capture end time
      const duration = endTime.getTime() - startTime.getTime(); // Calculate actual duration

      // Security Patch: Sanitize error message from result before saving.
      const sanitizedError = result.success ? null : { message: sanitizeString(result.error) };

      // Update step result
      await execution.updateProgress(1, {
        step: 1,
        app: step.app,
        action: step.action,
        status: result.success ? 'completed' : 'failed',
        endTime: endTime,
        duration: duration, // Use calculated duration
        result: result.data,
        error: sanitizedError,
      });

      return {
        success: result.success,
        data: result.data,
        // Security Patch: Use sanitized variables to construct the summary to prevent stored XSS.
        summary: result.success
          ? `Successfully executed ${sanitizedAction} on ${sanitizedApp}`
          : `Failed to execute ${sanitizedAction}: ${sanitizedError.message}`,
        outputData: { stepResults: [result.data] },
      };
    } catch (error) {
      logger.error('Error in single-step execution:', error);

      // Security Patch: Sanitize error messages before saving to the database or returning in response.
      const sanitizedErrorMessage = sanitizeString(error.message || 'An unknown error occurred.');

      await execution.updateProgress(1, {
        step: 1,
        app: workflow.executionPlan[0].app,
        action: workflow.executionPlan[0].action,
        status: 'failed',
        endTime: new Date(),
        error: { message: sanitizedErrorMessage },
      });

      return {
        success: false,
        error: sanitizedErrorMessage,
        summary: `Single-step execution failed: ${sanitizedErrorMessage}`,
      };
    }
  }

  /**
   * Executes a workflow consisting of multiple steps, handling dependencies and cross-step parameter mapping.
   * @param {import('../models/scheduledWorkflow.model.js').ScheduledWorkflow} workflow The workflow document.
   * @param {import('../models/workflowExecution.model.js').WorkflowExecution} execution The current execution document.
   * @param {Array<object>} [prefetchedAccounts=null] An array of prefetched connected accounts to optimize DB queries.
   * @returns {Promise<object>} The result of the multi-step execution.
   * @property {boolean} success - True if all steps completed successfully.
   * @property {object} [data] - An object containing the results of all steps.
   * @property {string} summary - A summary of the overall workflow outcome.
   * @property {object} outputData - The structured output data from all steps.
   * @private
   */
  async executeMultiStepWorkflow(workflow, execution, prefetchedAccounts = null) {
    const stepResults = [];
    const stepOutputs = {}; // Store outputs for cross-step parameter mapping
    // Optimization: Cache connected accounts to avoid N+1 queries if multiple steps use the same app.
    const connectedAccountsCache = new Map();

    try {
      await execution.addLog(
        'info',
        `Executing multi-step workflow with ${workflow.executionPlan.length} steps`
      );

      for (let i = 0; i < workflow.executionPlan.length; i++) {
        const step = workflow.executionPlan[i];
        const stepNumber = step.step;
        // Security Patch: Sanitize potentially user-controlled workflow data.
        const sanitizedApp = sanitizeString(step.app);
        const sanitizedAction = sanitizeString(step.action);

        await execution.addLog(
          'info',
          `Starting step ${stepNumber}: ${sanitizedApp} -> ${sanitizedAction}`
        );

        // Check dependencies
        if (step.dependencies && step.dependencies.length > 0) {
          const dependenciesMet = step.dependencies.every((depStep) =>
            stepResults.some(
              (sr) => sr.step === depStep && sr.status === 'completed'
            )
          );

          if (!dependenciesMet) {
            throw new Error(`Dependencies not met for step ${stepNumber}`);
          }
        }

        const stepStartTime = new Date(); // Capture start time for duration calculation
        // Update progress
        await execution.updateProgress(stepNumber, {
          step: stepNumber,
          app: step.app,
          action: step.action,
          status: 'running',
          startTime: stepStartTime,
          parameters: step.parameters,
        });

        try {
          // Resolve parameters with cross-step data
          const resolvedParameters = this.resolveCrossStepParameters(
            step.parameters,
            stepOutputs,
            workflow.crossStepParameters
          );

          // Get connected account - use cache and prefetched accounts to prevent N+1 queries
          let connectedAccount = connectedAccountsCache.get(step.app);
          if (!connectedAccount) {
            connectedAccount = await this.getConnectedAccount(
              workflow.userId,
              step.app,
              prefetchedAccounts
            );
            if (connectedAccount) {
              connectedAccountsCache.set(step.app, connectedAccount);
            }
          }

          if (!connectedAccount) {
            // Security Patch: Sanitize app name in error message.
            throw new Error(`No connected account found for ${sanitizedApp}`);
          }

          // Execute step
          const result = await this.executeComposioAction(
            workflow.userId,
            step.app,
            step.action,
            resolvedParameters,
            connectedAccount
          );

          // Store step output for future steps
          if (step.outputMapping) {
            // Bug Fix: Correctly map specific output keys from result.data to target keys in stepOutputs
            Object.entries(step.outputMapping).forEach(
              ([sourceKeyInResult, targetKeyInOutputs]) => {
                // Ensure sourceKeyInResult exists in result.data before mapping
                if (result.data && typeof result.data === 'object' && sourceKeyInResult in result.data) {
                  stepOutputs[targetKeyInOutputs] = result.data[sourceKeyInResult];
                } else {
                  logger.warn(`Output mapping failed: source key '${sourceKeyInResult}' not found in step result for step ${stepNumber}.`);
                }
              }
            );
          }

          const stepEndTime = new Date(); // Capture end time
          const stepDuration = stepEndTime.getTime() - stepStartTime.getTime(); // Calculate actual duration

          // Security Patch: Sanitize error message from result before saving.
          const sanitizedError = result.success ? null : { message: sanitizeString(result.error) };

          // Update step result
          const stepResult = {
            step: stepNumber,
            app: step.app,
            action: step.action,
            status: result.success ? 'completed' : 'failed',
            endTime: stepEndTime,
            duration: stepDuration, // Use calculated duration
            result: result.data,
            error: sanitizedError,
          };

          await execution.updateProgress(stepNumber, stepResult);
          stepResults.push(stepResult);

          if (!result.success) {
            throw new Error(`Step ${stepNumber} failed: ${sanitizedError.message}`);
          }

          await execution.addLog(
            'info',
            `Step ${stepNumber} completed successfully`
          );
        } catch (stepError) {
          logger.error(`Error in step ${stepNumber}:`, stepError);
          
          // Security Patch: Sanitize error message before saving.
          const sanitizedStepErrorMessage = sanitizeString(stepError.message);

          const failedStepResult = {
            step: stepNumber,
            app: step.app,
            action: step.action,
            status: 'failed',
            endTime: new Date(),
            error: { message: sanitizedStepErrorMessage },
          };

          await execution.updateProgress(stepNumber, failedStepResult);
          stepResults.push(failedStepResult);

          throw new Error(
            `Multi-step execution failed at step ${stepNumber}: ${sanitizedStepErrorMessage}`
          );
        }
      }

      return {
        success: true,
        data: { stepResults },
        summary: `Multi-step workflow completed successfully (${workflow.executionPlan.length} steps)`,
        outputData: {
          stepResults: stepResults.map((sr) => sr.result),
          crossStepOutputs: stepOutputs,
        },
      };
    } catch (error) {
      logger.error('Error in multi-step execution:', error);

      // Security Patch: Sanitize error message before returning in response.
      const sanitizedErrorMessage = sanitizeString(error.message || 'An unknown error occurred.');

      return {
        success: false,
        error: sanitizedErrorMessage,
        summary: `Multi-step execution failed: ${sanitizedErrorMessage}`,
        outputData: { stepResults: stepResults },
      };
    }
  }

  /**
   * Executes a specific action on a connected application via Composio.
   * This is a mock implementation for demonstration purposes.
   * @param {string} userId The ID of the user performing the action.
   * @param {string} app The name of the application (e.g., 'github').
   * @param {string} action The action to perform (e.g., 'create_issue').
   * @param {object} parameters The parameters for the action.
   * @param {object} connectedAccount The user's connected account information for the app.
   * @returns {Promise<object>} The result of the action.
   * @property {boolean} success - True if the action was successful.
   * @property {object} [data] - The result data from the action.
   * @property {string} [error] - An error message if the action failed.
   * @private
   */
  async executeComposioAction(
    userId,
    app,
    action,
    parameters,
    connectedAccount
  ) {
    try {
      // Use existing Composio integration
      // This simulates the actual execution - in production, you'd call the real Composio API

      logger.info(`Executing ${app}.${action} for user ${userId}`);

      // Mock execution for demo purposes
      const mockResult = {
        success: true,
        data: {
          action,
          app,
          parameters,
          timestamp: new Date().toISOString(),
          result: `Mock result for ${action} on ${app}`,
          executionId: `exec_${Date.now()}`,
        },
      };

      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return mockResult;

      // In real implementation, you would use:
      // return await executeComposioWithGroq(userId, `Execute ${action}`, tools, app, historySummary, conversationContext);
    } catch (error) {
      logger.error(`Error executing Composio action ${app}.${action}:`, error);
      return {
        success: false,
        // Security Patch: Sanitize error message before returning.
        error: sanitizeString(error.message),
      };
    }
  }

  /**
   * Resolves parameters for a workflow step by substituting placeholders with outputs from previous steps.
   * @param {object} parameters The original parameters for the current step.
   * @param {object} stepOutputs An object containing the outputs from all previously completed steps.
   * @param {object} crossStepParameters The workflow-level parameter mapping definitions.
   * @returns {object} The resolved parameters with placeholders replaced by actual values.
   * @private
   */
  resolveCrossStepParameters(parameters, stepOutputs, crossStepParameters) {
    const resolved = { ...parameters };

    // Look for parameters that reference previous step outputs
    Object.entries(resolved).forEach(([key, value]) => {
      if (typeof value === 'string' && value.startsWith('from_step_')) {
        // Extract step reference (e.g., "from_step_1.issues_list")
        const match = value.match(/from_step_(\d+)\.(.+)/);
        if (match) {
          const [, stepNum, outputKey] = match;
          // outputKey here refers to the targetKeyInOutputs from step.outputMapping
          const stepOutput = stepOutputs[outputKey];
          if (stepOutput !== undefined) { // Check for undefined to allow null/false values
            resolved[key] = stepOutput;
          }
        }
      }
    });

    // Apply cross-step parameter mappings
    if (crossStepParameters) {
      Object.entries(crossStepParameters).forEach(
        ([targetKey, sourceValue]) => {
          // sourceValue here refers to the targetKeyInOutputs from step.outputMapping
          if (stepOutputs[sourceValue] !== undefined) { // Check for undefined to allow null/false values
            resolved[targetKey] = stepOutputs[sourceValue];
          }
        }
      );
    }

    return resolved;
  }

  /**
   * Validates that the user has active connections for all applications required by the workflow.
   * @param {import('../models/scheduledWorkflow.model.js').ScheduledWorkflow} workflow The workflow to validate.
   * @returns {Promise<object>} An object indicating validation success or failure.
   * @property {boolean} success - True if all required connections are active.
   * @property {Array<object>} [connectedAccounts] - An array of the user's active connection documents if successful.
   * @property {string} [error] - An error message if validation fails.
   * @property {Array<string>} [missingApps] - A list of apps with missing connections.
   * @private
   */
  async validateConnections(workflow) {
    try {
      const requiredApps = workflow.requiredApps || [];
      if (requiredApps.length === 0) {
        return { success: true, connectedAccounts: [] }; // No apps to validate
      }

      // Optimization: Fetch all required ComposioAuth documents in a single query
      // to avoid N+1 query problem. Use .lean() as we only need to read data.
      const connectedAccounts = await ComposioAuth.find({
        userId: workflow.userId,
        // Security Patch: Use escaped regex for each app to prevent ReDoS injection.
        integrationId: { $in: requiredApps.map(app => new RegExp(escapeRegex(app), 'i')) },
        status: 'active',
      }).lean();

      // Create a set of connected app IDs (case-insensitive) for efficient lookup
      const connectedAppSet = new Set(
        connectedAccounts.map((account) => account.integrationId.toLowerCase())
      );

      const missingApps = [];
      for (const app of requiredApps) {
        // Check if a connected account exists for the app (case-insensitive)
        if (!connectedAppSet.has(app.toLowerCase())) {
          missingApps.push(app);
        }
      }

      if (missingApps.length > 0) {
        // Security Patch: Sanitize the list of app names before including in the error message.
        const sanitizedAppList = sanitizeString(missingApps.join(', '));
        return {
          success: false,
          error: `Missing connections for: ${sanitizedAppList}`,
          missingApps,
        };
      }

      return { success: true, connectedAccounts };
    } catch (error) {
      return {
        success: false,
        // Security Patch: Sanitize error message before returning.
        error: sanitizeString(error.message),
      };
    }
  }

  /**
   * Retrieves a user's active connected account for a specific application.
   * @param {string} userId The ID of the user.
   * @param {string} app The name of the application.
   * @param {Array<object>} [prefetchedAccounts=null] Optional array of prefetched accounts to avoid a database query.
   * @returns {Promise<object|null>} The connected account object or null if not found or inactive.
   * @private
   */
  async getConnectedAccount(userId, app, prefetchedAccounts = null) {
    try {
      // Security Patch: Escape app name to prevent ReDoS attacks in regex.
      const regex = new RegExp(escapeRegex(app), 'i');

      // Optimization: If prefetched accounts are provided, search in memory to avoid DB query
      if (prefetchedAccounts && Array.isArray(prefetchedAccounts)) {
        const account = prefetchedAccounts.find(acc => regex.test(acc.integrationId));
        if (account) {
          return {
            connectedAccountId: account.connectedAccountId,
            integrationId: account.integrationId,
            status: account.status,
          };
        }
        return null;
      }

      // Optimization: Use .lean() as this method returns a plain JavaScript object,
      // reducing Mongoose document overhead for read-only operations.
      const account = await ComposioAuth.findOne({
        userId: userId,
        integrationId: { $regex: regex },
        status: 'active',
      }).lean();

      return account
        ? {
            connectedAccountId: account.connectedAccountId,
            integrationId: account.integrationId,
            status: account.status,
          }
        : null;
    } catch (error) {
      logger.error(`Error getting connected account for ${app}:`, error);
      return null;
    }
  }

  /**
   * Retrieves execution statistics for a specific workflow.
   * @param {string} workflowId The ID of the workflow.
   * @returns {Promise<object>} An object containing the statistics.
   * @property {boolean} success - True if stats were retrieved successfully.
   * @property {object} [data] - The statistics data.
   * @property {string} [error] - An error message on failure.
   */
  async getExecutionStats(workflowId) {
    try {
      const stats = await WorkflowExecution.getExecutionStats(workflowId);
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      logger.error(`Error getting execution stats for ${workflowId}:`, error);
      return {
        success: false,
        // Security Patch: Sanitize error message before returning.
        error: sanitizeString(error.message),
      };
    }
  }

  /**
   * Cancels a currently running workflow execution.
   * The operation is scoped to the provided userId for security.
   * @param {string} executionId The ID of the execution to cancel.
   * @param {string} userId The ID of the user who owns the execution.
   * @returns {Promise<object>} An object indicating the result of the cancellation request.
   * @property {boolean} success - True if the cancellation was successful.
   * @property {string} [message] - A success message.
   * @property {string} [error] - An error message on failure.
   */
  async cancelExecution(executionId, userId) {
    try {
      // .lean() cannot be used here as `execution.cancel()` is a Mongoose document method.
      const execution = await WorkflowExecution.findOne({
        executionId,
        userId,
      });

      if (!execution) {
        return {
          success: false,
          error: 'Execution not found',
        };
      }

      if (!execution.isRunning) {
        return {
          success: false,
          error: 'Execution is not running',
        };
      }

      await execution.cancel('User requested cancellation');

      logger.info(`Execution cancelled: ${executionId}`);

      return {
        success: true,
        message: 'Execution cancelled successfully',
      };
    } catch (error) {
      logger.error(`Error cancelling execution ${executionId}:`, error);
      return {
        success: false,
        // Security Patch: Sanitize error message before returning.
        error: sanitizeString(error.message),
      };
    }
  }

  /**
   * Retries a failed workflow execution. This will trigger a new execution of the original workflow.
   * The operation is scoped to the provided userId for security.
   * @param {string} executionId The ID of the failed execution to retry.
   * @param {string} userId The ID of the user who owns the execution.
   * @returns {Promise<object>} An object containing the result of the new execution attempt.
   * @property {boolean} success - True if the retry was successfully initiated.
   * @property {object} [data] - The result object from the new `executeWorkflow` call.
   * @property {string} [message] - A success message.
   * @property {string} [error] - An error message on failure.
   */
  async retryExecution(executionId, userId) {
    try {
      // Optimization: Use .lean() here as we only read status and workflowId from the execution document.
      const execution = await WorkflowExecution.findOne({
        executionId,
        userId,
      }).lean();

      if (!execution) {
        return {
          success: false,
          error: 'Execution not found',
        };
      }

      if (execution.status !== 'failed') {
        return {
          success: false,
          error: 'Only failed executions can be retried',
        };
      }

      // Get the original workflow
      // .lean() cannot be used here as `this.executeWorkflow` expects a Mongoose document
      // for `workflow` which calls `workflow.updateExecutionStats`.
      const workflow = await ScheduledWorkflow.findOne({
        workflowId: execution.workflowId,
      });

      if (!workflow) {
        return {
          success: false,
          error: 'Original workflow not found',
        };
      }

      // Execute the workflow again
      const retryResult = await this.executeWorkflow(
        workflow,
        'retry',
        'user_retry'
      );

      return {
        success: true,
        data: retryResult,
        message: 'Execution retry started',
      };
    } catch (error) {
      logger.error(`Error retrying execution ${executionId}:`, error);
      return {
        success: false,
        // Security Patch: Sanitize error message before returning.
        error: sanitizeString(error.message),
      };
    }
  }
}

/**
 * Singleton instance of the WorkflowExecutor service.
 * @type {WorkflowExecutor}
 */
export const workflowExecutor = new WorkflowExecutor();
export default workflowExecutor;