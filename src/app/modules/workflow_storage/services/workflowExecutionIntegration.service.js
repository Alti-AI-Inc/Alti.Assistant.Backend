import { workflowStorageService } from './workflowStorage.service.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Integration Service between Workflow Storage and Execution (Stubbed)
 *
 * This service provides methods to handle stored workflow actions.
 * Since Composio has been removed, execution and scheduling features
 * report that execution is disabled.
 */
class WorkflowExecutionIntegrationService {
  /**
   * Execute a stored workflow (Stubbed)
   * @param {string} workflowId - Stored workflow ID
   * @param {string} userId - User ID
   * @param {Object} options - Execution options
   * @returns {Object} Execution result
   */
  async executeStoredWorkflow(workflowId, userId, options = {}) {
    console.log(`Execution requested for stored workflow: ${workflowId} (disabled)`);
    return {
      success: false,
      error: 'External execution is disabled: Composio has been removed.',
      message: 'Workflow execution failed because the Composio integration has been removed.',
    };
  }

  /**
   * Execute multiple stored workflows in batch (Stubbed)
   * @param {string[]} workflowIds - Array of stored workflow IDs
   * @param {string} userId - User ID
   * @param {Object} options - Execution options
   * @returns {Object} Batch execution results
   */
  async executeBatchStoredWorkflows(workflowIds, userId, options = {}) {
    console.log(`Batch execution requested for ${workflowIds.length} workflows (disabled)`);
    return {
      success: false,
      error: 'External execution is disabled: Composio has been removed.',
      message: 'Batch workflow execution failed because the Composio integration has been removed.',
    };
  }

  /**
   * Schedule stored workflow for recurring execution (Stubbed)
   * @param {string} workflowId - Stored workflow ID
   * @param {string} userId - User ID
   * @param {Object} scheduleConfig - Schedule configuration
   * @returns {Object} Scheduling result
   */
  async scheduleStoredWorkflow(workflowId, userId, scheduleConfig) {
    console.log(`Scheduling requested for stored workflow: ${workflowId} (disabled)`);
    return {
      success: false,
      error: 'External execution scheduling is disabled: Composio has been removed.',
      message: 'Scheduling failed because the Composio integration has been removed.',
    };
  }

  /**
   * Get execution history for a stored workflow (Stubbed)
   * @param {string} workflowId - Stored workflow ID
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Object} Execution history
   */
  async getStoredWorkflowExecutionHistory(workflowId, userId, options = {}) {
    return {
      success: true,
      data: {
        storedWorkflowId: workflowId,
        executions: [],
        totalExecutions: 0,
      },
      message: 'No execution history available (Composio integration removed).',
    };
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
        await workflowStorageService.getStoredWorkflow(workflowId, userId, { lean: true });

      if (!storedWorkflowResult.success) {
        return {
          success: false,
          error: 'Stored workflow not found',
        };
      }

      const storedWorkflow = storedWorkflowResult.data;

      // Create template workflow data
      const templateData = {
        ...storedWorkflow,
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