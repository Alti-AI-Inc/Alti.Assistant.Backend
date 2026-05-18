import { logger } from '../../../../shared/logger.js';
import WorkflowExecution from '../models/workflowExecution.model.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import { runAIClassificationAgent } from '../ai_classification/workflow.js';
import { executeComposioWithGemini } from '../services/aiClassificationService.js';
import ComposioAuth from '../composio.model.js';

/**
 * Workflow Executor Service - Executes saved workflows
 */
class WorkflowExecutor {
  /**
   * Execute a saved workflow
   */
  async executeWorkflow(
    workflow,
    executionType = 'manual',
    triggerSource = 'api_call'
  ) {
    const executionId = WorkflowExecution.generateExecutionId();

    try {
      logger.info(
        `Starting workflow execution: ${workflow.workflowId} (${executionType})`
      );

      // Create execution record
      const execution = new WorkflowExecution({
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
          execution
        );
      } else {
        executionResult = await this.executeMultiStepWorkflow(
          workflow,
          execution
        );
      }

      // Complete execution
      await execution.completeExecution(executionResult.success, {
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

      // Update execution record with error
      try {
        const execution = await WorkflowExecution.findOne({ executionId });
        if (execution) {
          await execution.addLog('error', `Execution failed: ${error.message}`);
          await execution.completeExecution(false, { error: error.message });
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
        error: error.message,
        message: 'Workflow execution failed',
      };
    }
  }

  /**
   * Execute single-step workflow
   */
  async executeSingleStepWorkflow(workflow, execution) {
    try {
      const step = workflow.executionPlan[0];

      await execution.addLog(
        'info',
        `Executing single step: ${step.app} -> ${step.action}`
      );
      await execution.updateProgress(1, {
        step: 1,
        app: step.app,
        action: step.action,
        status: 'running',
        startTime: new Date(),
        parameters: step.parameters,
      });

      // Get user's connected account for the app
      const connectedAccount = await this.getConnectedAccount(
        workflow.userId,
        step.app
      );
      if (!connectedAccount) {
        throw new Error(`No connected account found for ${step.app}`);
      }

      // Execute using existing Composio integration
      const result = await this.executeComposioAction(
        workflow.userId,
        step.app,
        step.action,
        step.parameters,
        connectedAccount
      );

      // Update step result
      await execution.updateProgress(1, {
        step: 1,
        app: step.app,
        action: step.action,
        status: result.success ? 'completed' : 'failed',
        endTime: new Date(),
        duration: 1000, // Calculate actual duration
        result: result.data,
        error: result.success ? null : { message: result.error },
      });

      return {
        success: result.success,
        data: result.data,
        summary: result.success
          ? `Successfully executed ${step.action} on ${step.app}`
          : `Failed to execute ${step.action}: ${result.error}`,
        outputData: { stepResults: [result.data] },
      };
    } catch (error) {
      logger.error('Error in single-step execution:', error);

      await execution.updateProgress(1, {
        step: 1,
        app: workflow.executionPlan[0].app,
        action: workflow.executionPlan[0].action,
        status: 'failed',
        endTime: new Date(),
        error: { message: error.message },
      });

      return {
        success: false,
        error: error.message,
        summary: `Single-step execution failed: ${error.message}`,
      };
    }
  }

  /**
   * Execute multi-step workflow
   */
  async executeMultiStepWorkflow(workflow, execution) {
    const stepResults = [];
    const stepOutputs = {}; // Store outputs for cross-step parameter mapping

    try {
      await execution.addLog(
        'info',
        `Executing multi-step workflow with ${workflow.executionPlan.length} steps`
      );

      for (let i = 0; i < workflow.executionPlan.length; i++) {
        const step = workflow.executionPlan[i];
        const stepNumber = step.step;

        await execution.addLog(
          'info',
          `Starting step ${stepNumber}: ${step.app} -> ${step.action}`
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

        // Update progress
        await execution.updateProgress(stepNumber, {
          step: stepNumber,
          app: step.app,
          action: step.action,
          status: 'running',
          startTime: new Date(),
          parameters: step.parameters,
        });

        try {
          // Resolve parameters with cross-step data
          const resolvedParameters = this.resolveCrossStepParameters(
            step.parameters,
            stepOutputs,
            workflow.crossStepParameters
          );

          // Get connected account
          const connectedAccount = await this.getConnectedAccount(
            workflow.userId,
            step.app
          );
          if (!connectedAccount) {
            throw new Error(`No connected account found for ${step.app}`);
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
            Object.entries(step.outputMapping).forEach(
              ([outputKey, targetKey]) => {
                stepOutputs[outputKey] = result.data;
              }
            );
          }

          // Update step result
          const stepResult = {
            step: stepNumber,
            app: step.app,
            action: step.action,
            status: result.success ? 'completed' : 'failed',
            endTime: new Date(),
            duration: 1000, // Calculate actual duration
            result: result.data,
            error: result.success ? null : { message: result.error },
          };

          await execution.updateProgress(stepNumber, stepResult);
          stepResults.push(stepResult);

          if (!result.success) {
            throw new Error(`Step ${stepNumber} failed: ${result.error}`);
          }

          await execution.addLog(
            'info',
            `Step ${stepNumber} completed successfully`
          );
        } catch (stepError) {
          logger.error(`Error in step ${stepNumber}:`, stepError);

          const failedStepResult = {
            step: stepNumber,
            app: step.app,
            action: step.action,
            status: 'failed',
            endTime: new Date(),
            error: { message: stepError.message },
          };

          await execution.updateProgress(stepNumber, failedStepResult);
          stepResults.push(failedStepResult);

          throw new Error(
            `Multi-step execution failed at step ${stepNumber}: ${stepError.message}`
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

      return {
        success: false,
        error: error.message,
        summary: `Multi-step execution failed: ${error.message}`,
        outputData: { stepResults: stepResults },
      };
    }
  }

  /**
   * Execute Composio action
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
        error: error.message,
      };
    }
  }

  /**
   * Resolve cross-step parameters
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
          const stepOutput = stepOutputs[outputKey];
          if (stepOutput) {
            resolved[key] = stepOutput;
          }
        }
      }
    });

    // Apply cross-step parameter mappings
    if (crossStepParameters) {
      Object.entries(crossStepParameters).forEach(
        ([targetKey, sourceValue]) => {
          if (stepOutputs[sourceValue]) {
            resolved[targetKey] = stepOutputs[sourceValue];
          }
        }
      );
    }

    return resolved;
  }

  /**
   * Validate workflow connections
   */
  async validateConnections(workflow) {
    try {
      const missingApps = [];

      for (const app of workflow.requiredApps) {
        const account = await this.getConnectedAccount(workflow.userId, app);
        if (!account) {
          missingApps.push(app);
        }
      }

      if (missingApps.length > 0) {
        return {
          success: false,
          error: `Missing connections for: ${missingApps.join(', ')}`,
          missingApps,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get connected account for user and app
   */
  async getConnectedAccount(userId, app) {
    try {
      const account = await ComposioAuth.findOne({
        userId: userId,
        integrationId: { $regex: new RegExp(app, 'i') },
        status: 'active',
      });

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
   * Get execution statistics
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
        error: error.message,
      };
    }
  }

  /**
   * Cancel running execution
   */
  async cancelExecution(executionId, userId) {
    try {
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
        error: error.message,
      };
    }
  }

  /**
   * Retry failed execution
   */
  async retryExecution(executionId, userId) {
    try {
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

      if (execution.status !== 'failed') {
        return {
          success: false,
          error: 'Only failed executions can be retried',
        };
      }

      // Get the original workflow
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
        error: error.message,
      };
    }
  }
}

// Export singleton instance
export const workflowExecutor = new WorkflowExecutor();
export default workflowExecutor;
