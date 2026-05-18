import WorkflowExecution from '../models/workflowExecution.model.js';
import ComposioAuth from '../composio.model.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Workflow Service - Core business logic for scheduled workflows
 */
class WorkflowService {
  /**
   * Create a new scheduled workflow
   */
  async createWorkflow(workflowData) {
    try {
      const {
        userId,
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

      console.log(`Workflow created: ${workflowId} for user: ${userId}`);
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
   * Get user's workflows
   */
  async getUserWorkflows(userId, status = null, limit = 50, offset = 0) {
    try {
      const query = { userId };
      if (status) query.status = status;

      const workflows = await ScheduledWorkflow.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean();

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
   * Get workflow by ID
   */
  async getWorkflowById(workflowId, userId = null) {
    try {
      const query = { workflowId };
      if (userId) query.userId = userId;

      const workflow = await ScheduledWorkflow.findOne(query);

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
          message: 'The requested workflow does not exist',
        };
      }

      // Get recent executions
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
   * Update workflow
   */
  async updateWorkflow(workflowId, userId, updates) {
    try {
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

      console.log(`Workflow updated: ${workflowId}`);
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
   * Delete workflow
   */
  async deleteWorkflow(workflowId, userId) {
    try {
      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId });

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

      await ScheduledWorkflow.deleteOne({ workflowId, userId });

      // Optionally delete execution history
      await WorkflowExecution.deleteMany({ workflowId });

      console.log(`Workflow deleted: ${workflowId}`);
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
   * Manually trigger workflow execution
   */
  async triggerWorkflow(workflowId, userId, triggerSource = 'user_click') {
    try {
      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId });

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

      // TODO: Add to execution queue here
      // For now, just return success
      console.log(`Workflow triggered manually: ${workflowId}`);

      return {
        success: true,
        data: {
          executionId: executionResult.data.executionId,
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
   * Pause workflow
   */
  async pauseWorkflow(workflowId, userId) {
    try {
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
   * Resume workflow
   */
  async resumeWorkflow(workflowId, userId) {
    try {
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
   * Get workflow execution history
   */
  async getWorkflowExecutions(workflowId, userId, limit = 50) {
    try {
      // Verify workflow ownership
      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId });
      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

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
   * Create execution record
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
   * Validate workflow connections
   */
  async validateWorkflowConnections(workflow) {
    try {
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
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user's connected accounts for specific apps
   */
  async getUserConnectedAccounts(userId, requiredApps) {
    try {
      const accounts = await ComposioAuth.find({
        userId: userId,
        status: 'active',
      });

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
   * Get workflows due for execution (for scheduler)
   */
  async getDueWorkflows() {
    try {
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

// Export singleton instance
export const workflowService = new WorkflowService();
export default workflowService;
