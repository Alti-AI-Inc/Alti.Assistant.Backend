import { workflowStorageService } from './workflowStorage.service.js';
import { workflowService } from '../../composio_v2/services/workflow.service.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Integration Service between Workflow Storage and Composio v2 Execution
 *
 * This service provides methods to execute stored workflows using the
 * existing Composio v2 workflow execution infrastructure.
 */
class WorkflowExecutionIntegrationService {
  /**
   * Execute a stored workflow using Composio v2
   * @param {string} workflowId - Stored workflow ID
   * @param {string} userId - User ID
   * @param {Object} options - Execution options
   * @returns {Object} Execution result
   */
  async executeStoredWorkflow(workflowId, userId, options = {}) {
    try {
      const {
        triggerSource = 'user_click',
        scheduleType = null,
        executionMetadata = {},
      } = options;

      console.log(`Starting execution of stored workflow: ${workflowId}`);

      // Step 1: Get stored workflow
      const storedWorkflowResult =
        await workflowStorageService.getStoredWorkflow(workflowId, userId);

      if (!storedWorkflowResult.success) {
        return {
          success: false,
          error: 'Stored workflow not found',
          details: storedWorkflowResult.error,
        };
      }

      const storedWorkflow = storedWorkflowResult.data;

      // Step 2: Check if workflow is executable
      if (!storedWorkflow.isExecutable) {
        return {
          success: false,
          error: 'Workflow is not executable',
          details: {
            status: storedWorkflow.status,
            missingConnections: storedWorkflow.missingConnections,
            requiredApps: storedWorkflow.requiredApps,
          },
        };
      }

      // Step 3: Prepare execution data in Composio v2 format
      const executionData = {
        userId,
        title: storedWorkflow.title,
        description: storedWorkflow.description,
        executionPlan: storedWorkflow.executionPlan,
        workflowType: storedWorkflow.workflowType,
        requiredApps: storedWorkflow.requiredApps,
        triggerType: 'manual', // Always manual for stored workflows
        scheduleConfig: {
          isActive: false, // Immediate execution
          triggerSource,
          executionMetadata: {
            ...executionMetadata,
            sourceWorkflowId: workflowId,
            sourceModule: 'workflow_storage',
            executionTime: new Date(),
          },
        },
        originalUserInput: storedWorkflow.originalUserInput,
        conversationId: storedWorkflow.conversationId,
        conversationContext: storedWorkflow.conversationContext || {},
      };

      // Step 4: Create and execute workflow in Composio v2
      console.log('Creating workflow in Composio v2...');
      const composioWorkflowResult =
        await workflowService.createWorkflow(executionData);

      if (!composioWorkflowResult.success) {
        return {
          success: false,
          error: 'Failed to create workflow in Composio v2',
          details: composioWorkflowResult.error,
        };
      }

      const composioWorkflow = composioWorkflowResult.data;

      // Step 5: Trigger execution
      console.log(
        `Triggering execution for Composio v2 workflow: ${composioWorkflow.workflowId}`
      );
      const executionResult = await workflowService.triggerWorkflow(
        composioWorkflow.workflowId,
        userId,
        triggerSource
      );

      // Step 6: Update stored workflow execution count
      if (executionResult.success) {
        await storedWorkflow.markAsExecuted();
        console.log(`Marked stored workflow ${workflowId} as executed`);
      }

      return {
        success: true,
        data: {
          storedWorkflowId: workflowId,
          composioWorkflowId: composioWorkflow.workflowId,
          executionId: executionResult.data?.executionId,
          status: executionResult.success ? 'started' : 'failed',
          executionResult: executionResult.data,
          metadata: {
            triggerSource,
            executionTime: new Date(),
            workflowTitle: storedWorkflow.title,
            workflowType: storedWorkflow.workflowType,
            totalSteps: storedWorkflow.totalSteps,
          },
        },
        message: 'Stored workflow execution started successfully',
      };
    } catch (error) {
      logger.error('Error executing stored workflow:', error);
      return {
        success: false,
        error: error.message,
        details: {
          stack: error.stack,
          workflowId,
          userId,
        },
      };
    }
  }

  /**
   * Execute multiple stored workflows in batch
   * @param {string[]} workflowIds - Array of stored workflow IDs
   * @param {string} userId - User ID
   * @param {Object} options - Execution options
   * @returns {Object} Batch execution results
   */
  async executeBatchStoredWorkflows(workflowIds, userId, options = {}) {
    try {
      const {
        concurrent = false,
        maxConcurrency = 3,
        continueOnError = true,
      } = options;

      console.log(
        `Starting batch execution of ${workflowIds.length} stored workflows`
      );

      const results = [];
      const errors = [];

      if (concurrent) {
        // Execute workflows concurrently
        const promises = workflowIds.map(async (workflowId) => {
          try {
            const result = await this.executeStoredWorkflow(
              workflowId,
              userId,
              options
            );
            return { workflowId, result };
          } catch (error) {
            return { workflowId, error: error.message };
          }
        });

        // Execute in batches to respect maxConcurrency
        for (let i = 0; i < promises.length; i += maxConcurrency) {
          const batch = promises.slice(i, i + maxConcurrency);
          const batchResults = await Promise.all(batch);

          batchResults.forEach(({ workflowId, result, error }) => {
            if (error) {
              errors.push({ workflowId, error });
            } else {
              results.push({ workflowId, result });
            }
          });
        }
      } else {
        // Execute workflows sequentially
        for (const workflowId of workflowIds) {
          try {
            const result = await this.executeStoredWorkflow(
              workflowId,
              userId,
              options
            );
            results.push({ workflowId, result });

            if (!result.success && !continueOnError) {
              errors.push({ workflowId, error: result.error });
              break;
            }
          } catch (error) {
            errors.push({ workflowId, error: error.message });

            if (!continueOnError) {
              break;
            }
          }
        }
      }

      const successCount = results.filter((r) => r.result.success).length;
      const failureCount = results.length - successCount + errors.length;

      return {
        success: successCount > 0,
        data: {
          totalRequested: workflowIds.length,
          successCount,
          failureCount,
          results,
          errors,
        },
        message: `Batch execution completed: ${successCount} succeeded, ${failureCount} failed`,
      };
    } catch (error) {
      logger.error('Error in batch execution:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Schedule stored workflow for recurring execution
   * @param {string} workflowId - Stored workflow ID
   * @param {string} userId - User ID
   * @param {Object} scheduleConfig - Schedule configuration
   * @returns {Object} Scheduling result
   */
  async scheduleStoredWorkflow(workflowId, userId, scheduleConfig) {
    try {
      console.log(`Scheduling stored workflow: ${workflowId}`);

      // Step 1: Get stored workflow
      const storedWorkflowResult =
        await workflowStorageService.getStoredWorkflow(workflowId, userId);

      if (!storedWorkflowResult.success) {
        return {
          success: false,
          error: 'Stored workflow not found',
        };
      }

      const storedWorkflow = storedWorkflowResult.data;

      // Step 2: Check if workflow is executable
      if (!storedWorkflow.isExecutable) {
        return {
          success: false,
          error: 'Workflow is not executable',
          details: {
            missingConnections: storedWorkflow.missingConnections,
          },
        };
      }

      // Step 3: Prepare scheduled workflow data
      const scheduledWorkflowData = {
        userId,
        title: `${storedWorkflow.title} (Scheduled)`,
        description: storedWorkflow.description,
        executionPlan: storedWorkflow.executionPlan,
        workflowType: storedWorkflow.workflowType,
        requiredApps: storedWorkflow.requiredApps,
        triggerType: 'scheduled',
        scheduleConfig: {
          ...scheduleConfig,
          isActive: true,
          sourceWorkflowId: workflowId,
          sourceModule: 'workflow_storage',
        },
        originalUserInput: storedWorkflow.originalUserInput,
        conversationId: storedWorkflow.conversationId,
        conversationContext: storedWorkflow.conversationContext || {},
      };

      // Step 4: Create scheduled workflow in Composio v2
      const scheduledResult = await workflowService.createWorkflow(
        scheduledWorkflowData
      );

      if (scheduledResult.success) {
        console.log(
          `Successfully scheduled workflow: ${scheduledResult.data.workflowId}`
        );
      }

      return {
        success: scheduledResult.success,
        data: {
          storedWorkflowId: workflowId,
          scheduledWorkflowId: scheduledResult.data?.workflowId,
          scheduleConfig,
          nextExecution: scheduledResult.data?.nextExecution,
        },
        error: scheduledResult.error,
        message: scheduledResult.success
          ? 'Workflow scheduled successfully'
          : 'Failed to schedule workflow',
      };
    } catch (error) {
      logger.error('Error scheduling stored workflow:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get execution history for a stored workflow
   * @param {string} workflowId - Stored workflow ID
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Object} Execution history
   */
  async getStoredWorkflowExecutionHistory(workflowId, userId, options = {}) {
    try {
      const { limit = 20, offset = 0 } = options;

      // Get stored workflow to verify ownership
      const storedWorkflowResult =
        await workflowStorageService.getStoredWorkflow(workflowId, userId);

      if (!storedWorkflowResult.success) {
        return {
          success: false,
          error: 'Stored workflow not found',
        };
      }

      // Get execution history from Composio v2
      // This would need to be implemented in Composio v2 service to filter by source workflow ID
      const historyResult = await workflowService.getUserWorkflows(
        userId,
        null,
        limit,
        offset
      );

      if (historyResult.success) {
        // Filter executions that originated from this stored workflow
        const filteredExecutions = historyResult.data.workflows.filter(
          (execution) =>
            execution.scheduleConfig?.executionMetadata?.sourceWorkflowId ===
            workflowId
        );

        return {
          success: true,
          data: {
            storedWorkflowId: workflowId,
            executions: filteredExecutions,
            totalExecutions: filteredExecutions.length,
          },
        };
      }

      return historyResult;
    } catch (error) {
      logger.error('Error getting execution history:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Convert stored workflow to template for reuse
   * @param {string} workflowId - Stored workflow ID
   * @param {string} userId - User ID
   * @param {Object} templateConfig - Template configuration
   * @returns {Object} Template creation result
   */
  async convertStoredWorkflowToTemplate(
    workflowId,
    userId,
    templateConfig = {}
  ) {
    try {
      const {
        templateTitle,
        templateDescription,
        isPublic = false,
        category = 'template',
      } = templateConfig;

      // Get stored workflow
      const storedWorkflowResult =
        await workflowStorageService.getStoredWorkflow(workflowId, userId);

      if (!storedWorkflowResult.success) {
        return {
          success: false,
          error: 'Stored workflow not found',
        };
      }

      const storedWorkflow = storedWorkflowResult.data;

      // Create template workflow data
      const templateData = {
        ...storedWorkflow.toObject(),
        _id: undefined,
        workflowId: undefined,
        title: templateTitle || `${storedWorkflow.title} (Template)`,
        description:
          templateDescription ||
          `Template created from: ${storedWorkflow.description}`,
        isTemplate: true,
        status: 'ready',
        category,
        tags: [...(storedWorkflow.tags || []), 'template'],
        originalWorkflowId: workflowId,
        createdAt: new Date(),
        updatedAt: new Date(),
        executionCount: 0,
        lastExecuted: null,
      };

      // Store as new template workflow
      const templateResult =
        await workflowStorageService.analyzeAndStoreWorkflow({
          userInput: storedWorkflow.originalUserInput,
          userId: isPublic ? 'template_user' : userId,
          title: templateData.title,
          description: templateData.description,
          tags: templateData.tags,
          category: templateData.category,
        });

      return {
        success: templateResult.success,
        data: {
          originalWorkflowId: workflowId,
          templateWorkflowId: templateResult.data?.workflowId,
          templateTitle: templateData.title,
          isPublic,
        },
        error: templateResult.error,
        message: templateResult.success
          ? 'Template created successfully'
          : 'Failed to create template',
      };
    } catch (error) {
      logger.error('Error converting to template:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
export const workflowExecutionIntegrationService =
  new WorkflowExecutionIntegrationService();
export default workflowExecutionIntegrationService;
