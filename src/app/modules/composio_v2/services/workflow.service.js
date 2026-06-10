import WorkflowExecution from '../models/workflowExecution.model.js';
import ComposioAuth from '../composio.model.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import { logger } from '../../../../shared/logger.js';
import queueManager from './queueManager.service.js';

/**
 * @typedef {object} WorkflowData
 * @property {string} userId - The ID of the user creating the workflow.
 * @property {string} title - The title of the workflow.
 * @property {string} description - A description of the workflow.
 * @property {Array<object>} executionPlan - An array of steps defining the workflow's execution logic.
 * @property {string} workflowType - The type of workflow (e.g., 'automation', 'data_processing').
 * @property {string[]} requiredApps - An array of application IDs required for the workflow.
 * @property {'manual'|'scheduled'} [triggerType='manual'] - The type of trigger for the workflow.
 * @property {object} [scheduleConfig={}] - Configuration for scheduled workflows.
 * @property {string} [scheduleConfig.triggerDate] - ISO string for the initial trigger date for scheduled workflows.
 * @property {string} [scheduleConfig.recurrence] - Recurrence pattern (e.g., 'daily', 'weekly', 'cron').
 * @property {string} [scheduleConfig.timezone='UTC'] - Timezone for schedule configuration.
 * @property {string} originalUserInput - The original user input that led to the workflow creation.
 * @property {string} conversationId - The ID of the conversation context.
 * @property {object} conversationContext - Additional context from the conversation.
 */

/**
 * @typedef {object} WorkflowUpdateData
 * @property {string} [title] - New title for the workflow.
 * @property {string} [description] - New description for the workflow.
 * @property {object} [scheduleConfig] - New schedule configuration.
 * @property {string} [scheduleConfig.triggerDate] - New trigger date for scheduled workflows.
 * @property {string} [scheduleConfig.recurrence] - New recurrence pattern.
 * @property {string} [scheduleConfig.timezone] - New timezone for schedule configuration.
 * @property {'manual'|'scheduled'} [triggerType] - New trigger type for the workflow.
 * @property {'active'|'paused'|'pending'|'completed'|'failed'} [status] - New status for the workflow.
 */

/**
 * @typedef {object} ServiceResponse
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {any} [data] - The data returned by the operation, if successful.
 * @property {string} [error] - An error message, if the operation failed.
 * @property {string} [message] - A descriptive message about the operation's outcome.
 */

/**
 * Workflow Service - Core business logic for managing scheduled workflows, their creation, execution, and lifecycle.
 * This service interacts with `ScheduledWorkflow`, `WorkflowExecution`, and `ComposioAuth` models.
 * All user-specific methods require a `userId` to ensure data isolation and security (multi-tenancy).
 */
class WorkflowService {
  /**
   * Creates a new scheduled workflow based on provided data.
   * The `userId` within the workflow data establishes ownership of the workflow.
   * Generates a unique workflow ID, retrieves user's connected accounts for required applications,
   * and saves the workflow to the database.
   *
   * @async
   * @param {WorkflowData} workflowData - The data required to create a new workflow.
   * @returns {Promise<ServiceResponse>} A promise that resolves to an object indicating success or failure,
   *   along with the created workflow data if successful.
   */
  async createWorkflow(workflowData) {
    try {
      const {
        userId, // Assuming userId is validated and comes from the authenticated user's context
        title,
        description,
        executionPlan,
        workflowType,
        requiredApps,
        triggerType = 'manual',
        scheduleConfig = {},
        originalUserInput,
        conversationId,
        conversationContext,
      } = workflowData;

      // Generate unique workflow ID
      const workflowId = ScheduledWorkflow.generateWorkflowId();

      // Get user's connected accounts for required apps
      // Optimization: getUserConnectedAccounts internally uses .lean()
      const connectedAccounts = await this.getUserConnectedAccounts(
        userId,
        requiredApps
      );

      // Create workflow document
      const workflow = new ScheduledWorkflow({
        workflowId,
        userId,
        title,
        description,
        executionPlan,
        workflowType,
        requiredApps,
        totalSteps: executionPlan.length,
        triggerType,
        scheduleConfig: {
          isActive: true,
          timezone: 'UTC',
          ...scheduleConfig,
        },
        originalUserInput,
        conversationId,
        conversationContext,
        connectedAccounts,
        status: triggerType === 'manual' ? 'pending' : 'active',
      });

      // Set next execution time if scheduled
      if (triggerType !== 'manual' && scheduleConfig.triggerDate) {
        workflow.nextExecution = new Date(scheduleConfig.triggerDate);
      }

      await workflow.save();

      logger.info(`Workflow created: ${workflowId} for user: ${userId}`); // Replaced console.log with logger.info
      return {
        success: true,
        data: workflow,
        message: 'Workflow created successfully',
      };
    } catch (error) {
      logger.error(`Error creating workflow: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create workflow',
      };
    }
  }

  /**
   * Retrieves a list of workflows for a specific user, with optional filtering by status and pagination.
   * This operation is scoped to the provided `userId` for multi-tenancy.
   *
   * @async
   * @param {string} userId - The ID of the user whose workflows are to be retrieved.
   * @param {string} [status=null] - Optional. Filter workflows by their status (e.g., 'active', 'paused', 'completed').
   * @param {number} [limit=50] - Optional. The maximum number of workflows to return.
   * @param {number} [offset=0] - Optional. The number of workflows to skip before starting to return results.
   * @returns {Promise<ServiceResponse>} A promise that resolves to an object containing the list of workflows
   *   and pagination information, or an error if the operation fails.
   */
  async getUserWorkflows(userId, status = null, limit = 50, offset = 0) {
    try {
      const query = { userId };
      if (status) query.status = status;

      // Optimization: Already uses .lean() for read-only query.
      // Indexing Recommendation: For better performance, consider adding a compound index on `ScheduledWorkflow` model:
      // `{ userId: 1, status: 1, createdAt: -1 }`
      const workflows = await ScheduledWorkflow.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean();

      // Indexing Recommendation: The same compound index `{ userId: 1, status: 1 }` would benefit countDocuments.
      const total = await ScheduledWorkflow.countDocuments(query);

      return {
        success: true,
        data: {
          workflows,
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
          },
        },
      };
    } catch (error) {
      logger.error(`Error fetching user workflows: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Retrieves a single workflow by its ID, ensuring it belongs to the specified user.
   * Also fetches recent execution history and provides execution statistics for the workflow.
   *
   * @async
   * @param {string} workflowId - The ID of the workflow to retrieve.
   * @param {string} userId - The ID of the user requesting the workflow. (Mandatory for authorization and IDOR prevention).
   * @returns {Promise<ServiceResponse>} A promise that resolves to an object containing the workflow details,
   *   recent executions, and execution statistics, or an error if not found or failed.
   */
  async getWorkflowById(workflowId, userId) { // userId is now mandatory to prevent IDOR
    try {
      const query = { workflowId, userId }; // Ensure workflow belongs to the user
      // Optimization: Added .lean() for read-only query to improve performance.
      // Indexing Recommendation: For better performance, consider adding a compound index on `ScheduledWorkflow` model:
      // `{ workflowId: 1, userId: 1 }`
      const workflow = await ScheduledWorkflow.findOne(query).lean();

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
          message: 'The requested workflow does not exist',
        };
      }

      // Get recent executions
      // Optimization: Recommend adding .lean() inside WorkflowExecution.findByWorkflow if it performs a find operation.
      // Indexing Recommendation: For better performance, consider adding an index on `WorkflowExecution` model:
      // `{ workflowId: 1 }`
      const recentExecutions = await WorkflowExecution.findByWorkflow(
        workflowId,
        10
      );

      return {
        success: true,
        data: {
          workflow,
          recentExecutions,
          executionStats: {
            totalExecutions: workflow.executionCount,
            successRate: workflow.successRate,
            lastExecution: workflow.lastExecution,
            nextExecution: workflow.nextExecution,
          },
        },
      };
    } catch (error) {
      logger.error(`Error fetching workflow: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Updates an existing workflow identified by its ID and user ID.
   * Prevents updates to workflows that are currently running.
   * Only allows updates to specific fields like title, description, scheduleConfig, triggerType, and status.
   *
   * @async
   * @param {string} workflowId - The ID of the workflow to update.
   * @param {string} userId - The ID of the user who owns the workflow.
   * @param {WorkflowUpdateData} updates - An object containing the fields to update.
   * @returns {Promise<ServiceResponse>} A promise that resolves to an object indicating success or failure,
   *   along with the updated workflow data if successful.
   */
  async updateWorkflow(workflowId, userId, updates) {
    try {
      // Optimization: .lean() is not used here because the document is modified and saved later.
      // Indexing Recommendation: For better performance, consider adding a compound index on `ScheduledWorkflow` model:
      // `{ workflowId: 1, userId: 1 }`
      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId });

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
          message: 'The requested workflow does not exist',
        };
      }

      // Prevent updates to running workflows
      if (workflow.status === 'running') {
        return {
          success: false,
          error: 'Cannot update running workflow',
          message: 'Please stop the workflow before making changes',
        };
      }

      // Update allowed fields
      const allowedFields = [
        'title',
        'description',
        'scheduleConfig',
        'triggerType',
        'status',
      ];
      Object.keys(updates).forEach((key) => {
        if (allowedFields.includes(key)) {
          if (key === 'scheduleConfig') {
            workflow.scheduleConfig = {
              ...workflow.scheduleConfig,
              ...updates[key],
            };
          } else {
            workflow[key] = updates[key];
          }
        }
      });

      // Update next execution if schedule changed
      if (updates.scheduleConfig?.triggerDate) {
        workflow.nextExecution = new Date(updates.scheduleConfig.triggerDate);
      }

      await workflow.save();

      logger.info(`Workflow updated: ${workflowId}`); // Replaced console.log with logger.info
      return {
        success: true,
        data: workflow,
        message: 'Workflow updated successfully',
      };
    } catch (error) {
      logger.error(`Error updating workflow: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Deletes a workflow identified by its ID and user ID.
   * Prevents deletion of workflows that are currently running.
   * Also deletes all associated execution history.
   *
   * @async
   * @param {string} workflowId - The ID of the workflow to delete.
   * @param {string} userId - The ID of the user who owns the workflow.
   * @returns {Promise<ServiceResponse>} A promise that resolves to an object indicating success or failure.
   */
  async deleteWorkflow(workflowId, userId) {
    try {
      // Optimization: Added .lean() for read-only query to improve performance, as only status is checked.
      // Indexing Recommendation: For better performance, consider adding a compound index on `ScheduledWorkflow` model:
      // `{ workflowId: 1, userId: 1 }`
      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId }).lean();

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      // Prevent deletion of running workflows
      if (workflow.status === 'running') {
        return {
          success: false,
          error: 'Cannot delete running workflow',
          message: 'Please stop the workflow before deleting',
        };
      }

      // Indexing Recommendation: The same compound index `{ workflowId: 1, userId: 1 }` would benefit deleteOne.
      await ScheduledWorkflow.deleteOne({ workflowId, userId });

      // Optionally delete execution history
      // Indexing Recommendation: For better performance, consider adding an index on `WorkflowExecution` model:
      // `{ workflowId: 1 }`
      await WorkflowExecution.deleteMany({ workflowId });

      logger.info(`Workflow deleted: ${workflowId}`); // Replaced console.log with logger.info
      return {
        success: true,
        message: 'Workflow deleted successfully',
      };
    } catch (error) {
      logger.error(`Error deleting workflow: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Manually triggers the execution of a workflow.
   * Validates workflow existence, activity status, and required app connections before queuing the execution.
   *
   * @async
   * @param {string} workflowId - The ID of the workflow to trigger.
   * @param {string} userId - The ID of the user triggering the workflow.
   * @param {string} [triggerSource='user_click'] - The source of the trigger (e.g., 'user_click', 'api_call').
   * @returns {Promise<ServiceResponse>} A promise that resolves to an object indicating success or failure,
   *   along with execution and queue IDs if successful.
   */
  async triggerWorkflow(workflowId, userId, triggerSource = 'user_click') {
    try {
      // Optimization: Added .lean() for read-only query to improve performance.
      // Indexing Recommendation: For better performance, consider adding a compound index on `ScheduledWorkflow` model:
      // `{ workflowId: 1, userId: 1 }`
      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId }).lean();

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      if (!workflow.scheduleConfig.isActive) {
        return {
          success: false,
          error: 'Workflow is not active',
          message: 'Please activate the workflow before triggering',
        };
      }

      // Check if required apps are still connected
      const connectionCheck = await this.validateWorkflowConnections(workflow);
      if (!connectionCheck.success) {
        return connectionCheck;
      }

      // Create execution record
      const executionResult = await this.createExecution(
        workflow,
        'manual',
        triggerSource
      );

      if (!executionResult.success) {
        return executionResult;
      }

      // Add to execution queue
      const queueResult = await queueManager.queueWorkflow(workflow, 'high', {
        executionId: executionResult.data.executionId,
        executionType: 'manual',
        triggerSource,
      });

      logger.info(`Workflow triggered manually: ${workflowId}`); // Replaced console.log with logger.info

      return {
        success: true,
        data: {
          executionId: executionResult.data.executionId,
          queueId: queueResult.queueId || null,
          status: 'queued',
        },
        message: 'Workflow execution started',
      };
    } catch (error) {
      logger.error(`Error triggering workflow: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Pauses a scheduled workflow, preventing further automatic executions.
   *
   * @async
   * @param {string} workflowId - The ID of the workflow to pause.
   * @param {string} userId - The ID of the user who owns the workflow.
   * @returns {Promise<ServiceResponse>} A promise that resolves to an object indicating success or failure,
   *   along with the updated workflow data if successful.
   */
  async pauseWorkflow(workflowId, userId) {
    try {
      // Optimization: .lean() is not used here because workflow.pause() is likely an instance method that modifies the document.
      // Indexing Recommendation: For better performance, consider adding a compound index on `ScheduledWorkflow` model:
      // `{ workflowId: 1, userId: 1 }`
      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId });

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      await workflow.pause();

      return {
        success: true,
        data: workflow,
        message: 'Workflow paused successfully',
      };
    } catch (error) {
      logger.error(`Error pausing workflow: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Resumes a paused workflow, allowing it to execute according to its schedule again.
   *
   * @async
   * @param {string} workflowId - The ID of the workflow to resume.
   * @param {string} userId - The ID of the user who owns the workflow.
   * @returns {Promise<ServiceResponse>} A promise that resolves to an object indicating success or failure,
   *   along with the updated workflow data if successful.
   */
  async resumeWorkflow(workflowId, userId) {
    try {
      // Optimization: .lean() is not used here because workflow.resume() is likely an instance method that modifies the document.
      // Indexing Recommendation: For better performance, consider adding a compound index on `ScheduledWorkflow` model:
      // `{ workflowId: 1, userId: 1 }`
      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId });

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      await workflow.resume();

      return {
        success: true,
        data: workflow,
        message: 'Workflow resumed successfully',
      };
    } catch (error) {
      logger.error(`Error resuming workflow: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Retrieves the execution history for a specific workflow, ensuring user ownership.
   *
   * @async
   * @param {string} workflowId - The ID of the workflow to retrieve executions for.
   * @param {string} userId - The ID of the user who owns the workflow.
   * @param {number} [limit=50] - Optional. The maximum number of executions to return.
   * @returns {Promise<ServiceResponse>} A promise that resolves to an object containing the list of executions,
   *   or an error if the workflow is not found or the operation fails.
   */
  async getWorkflowExecutions(workflowId, userId, limit = 50) {
    try {
      // Verify workflow ownership
      // Optimization: Added .lean() for read-only query to improve performance.
      // Indexing Recommendation: For better performance, consider adding a compound index on `ScheduledWorkflow` model:
      // `{ workflowId: 1, userId: 1 }`
      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId }).lean();
      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      // Optimization: Recommend adding .lean() inside WorkflowExecution.findByWorkflow if it performs a find operation.
      // Indexing Recommendation: For better performance, consider adding an index on `WorkflowExecution` model:
      // `{ workflowId: 1 }`
      const executions = await WorkflowExecution.findByWorkflow(
        workflowId,
        limit
      );

      return {
        success: true,
        data: executions,
      };
    } catch (error) {
      logger.error(`Error fetching workflow executions: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Creates a new execution record for a given workflow.
   * This is an internal helper method used when a workflow is triggered.
   *
   * @internal
   * @async
   * @param {object} workflow - The workflow object for which to create an execution record.
   * @param {string} workflow.workflowId - The ID of the workflow.
   * @param {string} workflow.userId - The ID of the user owning the workflow.
   * @param {number} workflow.totalSteps - The total number of steps in the workflow.
   * @param {Array<object>} workflow.connectedAccounts - The connected accounts for the workflow.
   * @param {'manual'|'scheduled'} executionType - The type of execution.
   * @param {string} triggerSource - The source that initiated the execution (e.g., 'user_click', 'scheduler').
   * @returns {Promise<ServiceResponse>} A promise that resolves to an object indicating success or failure,
   *   along with the created execution record if successful.
   */
  async createExecution(workflow, executionType, triggerSource) {
    try {
      const executionId = WorkflowExecution.generateExecutionId();

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

      return {
        success: true,
        data: execution,
      };
    } catch (error) {
      logger.error(`Error creating execution: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Validates if all required applications for a workflow are connected and active for the user.
   *
   * @internal
   * @async
   * @param {object} workflow - The workflow object containing `userId` and `requiredApps`.
   * @param {string} workflow.userId - The ID of the user who owns the workflow.
   * @param {string[]} workflow.requiredApps - The list of required application IDs.
   * @returns {Promise<ServiceResponse>} A promise that resolves to an object indicating success or failure.
   *   If unsuccessful, it includes a list of missing app connections.
   */
  async validateWorkflowConnections(workflow) {
    try {
      // Optimization: getUserConnectedAccounts internally uses .lean()
      const connectedAccounts = await this.getUserConnectedAccounts(
        workflow.userId,
        workflow.requiredApps
      );

      const missingApps = workflow.requiredApps.filter(
        (app) =>
          !connectedAccounts.some(
            (account) => account.app === app && account.status === 'active'
          )
      );

      if (missingApps.length > 0) {
        return {
          success: false,
          error: 'Missing app connections',
          message: `Please connect these apps: ${missingApps.join(', ')}`,
          data: { missingApps },
        };
      }

      return {
        success: true,
        data: { connectedAccounts },
      };
    } catch (error) {
      logger.error(`Error validating workflow connections: ${error.message}`); // Added logging for this catch block
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Retrieves a user's active connected accounts for a specified list of applications.
   * This is an internal helper method.
   *
   * @internal
   * @async
   * @param {string} userId - The ID of the user.
   * @param {string[]} requiredApps - An array of application IDs to check for connections.
   * @returns {Promise<Array<object>>} A promise that resolves to an array of connected account objects,
   *   each containing `app`, `connectedAccountId`, and `status`. Returns an empty array on error.
   */
  async getUserConnectedAccounts(userId, requiredApps) {
    try {
      // Optimization: Added .lean() for read-only query to improve performance.
      // Indexing Recommendation: For better performance, consider adding a compound index on `ComposioAuth` model:
      // `{ userId: 1, status: 1 }`
      const accounts = await ComposioAuth.find({
        userId: userId,
        status: 'active',
      }).lean();

      return accounts
        .filter((account) =>
          requiredApps.includes(account.integrationId?.toLowerCase())
        )
        .map((account) => ({
          app: account.integrationId?.toLowerCase(),
          connectedAccountId: account.connectedAccountId,
          status: account.status,
        }));
    } catch (error) {
      logger.error(`Error fetching connected accounts: ${error.message}`);
      return [];
    }
  }

  /**
   * Retrieves workflows that are due for execution based on their schedule.
   * This method is typically called by a background scheduler and is not user-specific.
   *
   * @async
   * @returns {Promise<ServiceResponse>} A promise that resolves to an object containing an array of workflows
   *   due for execution, or an error if the operation fails.
   */
  async getDueWorkflows() {
    try {
      // Optimization: Recommend adding .lean() inside ScheduledWorkflow.findDueForExecution if it performs a find operation.
      // Indexing Recommendation: For better performance, consider adding an index on `ScheduledWorkflow` model
      // that covers the query criteria used in `findDueForExecution` (e.g., `{ nextExecution: 1, status: 1, 'scheduleConfig.isActive': 1 }`).
      const dueWorkflows = await ScheduledWorkflow.findDueForExecution();
      return {
        success: true,
        data: dueWorkflows,
      };
    } catch (error) {
      logger.error(`Error fetching due workflows: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

/**
 * The singleton instance of the WorkflowService.
 * @type {WorkflowService}
 */
export const workflowService = new WorkflowService();
export default workflowService;