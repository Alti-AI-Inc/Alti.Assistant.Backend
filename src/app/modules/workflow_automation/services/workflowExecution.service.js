import Workflow from '../models/workflow.model.js';
import WorkflowExecution from '../models/workflowExecution.model.js';
import WorkflowApproval from '../models/workflowApproval.model.js';
import { composioIntegrationService } from './composioIntegration.service.js';
import { workflowResilienceService } from './workflowResilience.service.js';
import { Composio } from '@composio/core';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';

// Initialize Composio
const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

/**
 * Service for executing workflows and managing their lifecycle
 */
class WorkflowExecutionService {
  constructor() {
    this.scheduledJobs = new Map(); // Store scheduled cron jobs
    this.executingWorkflows = new Map(); // Track currently executing workflows
  }

  /**
   * Execute a workflow manually
   */
  async executeWorkflow(workflowId, userId, context = {}) {
    try {
      logger.info(`Starting manual execution of workflow ${workflowId}`);

      // Get workflow
      const workflow = await Workflow.findOne({ _id: workflowId, userId });
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      if (workflow.status !== 'active') {
        throw new Error('Workflow is not active');
      }

      // Create execution record
      const executionId = uuidv4();
      const execution = new WorkflowExecution({
        workflowId,
        userId,
        executionId,
        triggerType: 'manual',
        totalSteps: workflow.steps.length,
        context,
      });

      await execution.save();

      // Execute the workflow
      const result = await this.runWorkflowSteps(workflow, execution, context);

      // Update workflow execution count
      await Workflow.updateOne(
        { _id: workflowId },
        {
          $inc: { executionCount: 1 },
          $set: { lastExecuted: new Date() },
        }
      );

      return {
        success: true,
        executionId,
        result,
      };
    } catch (error) {
      logger.error(`Error executing workflow ${workflowId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Run workflow steps sequentially
   */
  async runWorkflowSteps(workflow, execution, context = {}, startStepIndex = 0) {
    try {
      const steps = workflow.steps.sort((a, b) => a.order - b.order);
      const stepResults = [];
      let currentContext = { ...context };

      // Update execution status (only if starting from the beginning)
      if (startStepIndex === 0) {
        await WorkflowExecution.updateOne(
          { _id: execution._id },
          {
            status: 'running',
            startTime: new Date(),
            steps: steps.map((step) => ({
              stepId: step.stepId,
              status: 'pending',
            })),
          }
        );
      } else {
        await WorkflowExecution.updateOne(
          { _id: execution._id },
          {
            status: 'running',
          }
        );
      }

      this.executingWorkflows.set(execution.executionId, {
        workflow,
        execution,
        status: 'running',
      });

      // Define sensitive actions list requiring human-in-the-loop approval
      const SENSITIVE_ACTIONS = [
        'gmail.send_email',
        'slack.send_message',
        'slack.post_message',
        'github.create_issue',
        'github.create_pr',
        'trello.create_card',
        'notion.create_page',
      ];

      for (let i = startStepIndex; i < steps.length; i++) {
        const step = steps[i];
        const stepStartTime = new Date();

        // Check if the step requires Human-in-the-Loop approval
        const isSensitive = SENSITIVE_ACTIONS.includes(`${step.app?.toLowerCase()}.${step.action?.toLowerCase()}`);
        const approvalRequired = step.requireApproval || isSensitive;
        const alreadyApproved = currentContext._approvedSteps?.includes(step.stepId);

        if (approvalRequired && !alreadyApproved) {
          logger.info(`Suspending execution for step ${step.stepId}: requires human approval.`);
          
          const approvalId = `appr_${uuidv4()}`;
          const approval = new WorkflowApproval({
            approvalId,
            userId: workflow.userId,
            workflowId: workflow._id,
            conversationId: execution.context?.conversationId || `conv_${uuidv4()}`,
            stepId: step.stepId,
            action: `${step.app}.${step.action}`,
            parameters: this.prepareParameters(step.parameters, currentContext),
            status: 'pending',
            checkpointId: execution.executionId // Map to this execution
          });

          await approval.save();

          // Update execution to reflect the paused/awaiting_approval status
          await WorkflowExecution.updateOne(
            { _id: execution._id },
            {
              status: 'awaiting_approval',
              currentStepIndex: i,
              context: currentContext
            }
          );

          // Update step status to pending/paused
          await this.updateStepStatus(
            execution._id,
            step.stepId,
            'pending',
            null,
            null,
            null,
            null,
            new Error('Execution paused for human approval')
          );

          this.executingWorkflows.delete(execution.executionId);

          return {
            success: true,
            status: 'paused',
            approvalId,
            executionId: execution.executionId,
            message: `Execution paused at step "${step.description}". Human approval is required.`,
            stepId: step.stepId,
            action: `${step.app}.${step.action}`
          };
        }

        try {
          logger.info(`Executing step ${step.stepId}: ${step.description}`);

          // Update step status to running
          await this.updateStepStatus(
            execution._id,
            step.stepId,
            'running',
            stepStartTime
          );

          // Execute the step
          const stepResult = await this.executeStep(
            step,
            currentContext,
            workflow.userId
          );

          const stepEndTime = new Date();
          const duration = stepEndTime - stepStartTime;

          // Update step status to completed
          await this.updateStepStatus(
            execution._id,
            step.stepId,
            'completed',
            stepStartTime,
            stepEndTime,
            duration,
            stepResult
          );

          stepResults.push({
            stepId: step.stepId,
            success: true,
            result: stepResult,
            duration,
          });

          // Update context with step results
          currentContext = { ...currentContext, ...stepResult.contextUpdates };
        } catch (stepError) {
          logger.error(`Error in step ${step.stepId}:`, stepError);

          const stepEndTime = new Date();
          const duration = stepEndTime - stepStartTime;

          // Update step status to failed
          await this.updateStepStatus(
            execution._id,
            step.stepId,
            'failed',
            stepStartTime,
            stepEndTime,
            duration,
            null,
            stepError
          );

          stepResults.push({
            stepId: step.stepId,
            success: false,
            error: stepError.message,
            duration,
          });

          // Decide whether to continue or stop
          if (step.continueOnError !== true) {
            throw new Error(
              `Workflow stopped at step ${step.stepId}: ${stepError.message}`
            );
          }
        }
      }

      // Update execution as completed
      const endTime = new Date();
      const totalDuration = endTime - execution.startTime;
      const completedSteps = stepResults.filter((r) => r.success).length;
      const failedSteps = stepResults.filter((r) => !r.success).length;

      await WorkflowExecution.updateOne(
        { _id: execution._id },
        {
          status: 'completed',
          endTime,
          duration: totalDuration,
          completedSteps,
          failedSteps,
          result: {
            success: failedSteps === 0,
            data: stepResults,
            summary: `Completed ${completedSteps}/${steps.length} steps successfully`,
          },
        }
      );

      this.executingWorkflows.delete(execution.executionId);

      return {
        success: failedSteps === 0,
        completedSteps,
        failedSteps,
        totalSteps: steps.length,
        results: stepResults,
        duration: totalDuration,
      };
    } catch (error) {
      logger.error('Error running workflow steps:', error);

      // Update execution as failed
      await WorkflowExecution.updateOne(
        { _id: execution._id },
        {
          status: 'failed',
          endTime: new Date(),
          error: {
            message: error.message,
            stack: error.stack,
          },
        }
      );

      this.executingWorkflows.delete(execution.executionId);
      throw error;
    }
  }

  /**
   * Execute a single workflow step
   */
  async executeStep(step, context, userId) {
    try {
      logger.info(`Executing step: ${step.app}.${step.action}`);

      // Get user's available tools for this app
      const userTools = await composioIntegrationService.getUserAvailableTools(
        userId,
        [step.app]
      );

      if (!userTools.success) {
        throw new Error(
          `Failed to get tools for app ${step.app}: ${userTools.error}`
        );
      }

      const appTools = userTools.toolsByApp[step.app];
      if (!appTools || appTools.length === 0) {
        throw new Error(
          `No tools available for app ${step.app}. Please check if the app is connected.`
        );
      }

      // Find the specific action tool
      const tool = appTools.find(
        (t) =>
          t.name.toLowerCase().includes(step.action.toLowerCase()) ||
          t.slug.toLowerCase().includes(step.action.toLowerCase()) ||
          t.description.toLowerCase().includes(step.action.toLowerCase())
      );

      if (!tool) {
        throw new Error(
          `Tool not found for ${step.app}.${step.action}. Available tools: ${appTools.map((t) => t.name).join(', ')}`
        );
      }

      // Get Composio tools for execution
      const composioTools = await composio.getTools(
        {
          apps: [step.app],
        },
        userId
      );

      const executableTool = composioTools.find(
        (t) => t.name === tool.name || t.slug === tool.slug
      );

      if (!executableTool) {
        throw new Error(`Executable tool not found for ${tool.name}`);
      }

      // Prepare parameters by merging step parameters with context
      const parameters = this.prepareParameters(step.parameters, context);

      // Execute the tool with retry resilience
      const resilientResult = await workflowResilienceService.executeWithRetry(
        () => executableTool.execute(parameters),
        {
          stepId: step.stepId,
          actionType: this._classifyActionType(step.action),
          maxAttempts: step.retryPolicy?.maxAttempts || 3,
        }
      );

      if (!resilientResult.success) {
        throw new Error(
          `Step execution failed after ${resilientResult.attempts} attempts: ${resilientResult.error}`
        );
      }

      const result = resilientResult.result;

      // Register completed step for potential rollback
      if (context._executionId) {
        workflowResilienceService.registerCompletedStep(
          context._executionId,
          { stepId: step.stepId, app: step.app, action: step.action, parameters },
          result
        );
      }

      logger.info(
        `Step completed successfully: ${step.stepId}` +
        (resilientResult.retried ? ` (after ${resilientResult.attempts} attempts)` : '')
      );

      return {
        success: true,
        data: result,
        contextUpdates: this.extractContextUpdates(result, step),
        timestamp: new Date(),
        attempts: resilientResult.attempts,
        retried: resilientResult.retried,
        totalDurationMs: resilientResult.totalDurationMs,
      };
    } catch (error) {
      logger.error(`Error executing step ${step.stepId}:`, error);
      throw new Error(`Step execution failed: ${error.message}`);
    }
  }

  /**
   * Classify an action name into a retry policy type.
   * @private
   */
  _classifyActionType(action) {
    if (!action) return 'default';
    const a = action.toLowerCase();
    const readActions = ['get', 'list', 'search', 'find', 'fetch', 'read', 'check'];
    const writeActions = ['create', 'update', 'delete', 'send', 'post', 'put', 'patch'];
    if (readActions.some(r => a.includes(r))) return 'read';
    if (writeActions.some(w => a.includes(w))) return 'write';
    return 'network';
  }

  /**
   * Prepare parameters by substituting context variables
   */
  prepareParameters(stepParameters, context) {
    const prepared = { ...stepParameters };

    // Replace placeholders with context values
    const replaceVariables = (obj) => {
      if (typeof obj === 'string') {
        return obj.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
          return context[variable] || match;
        });
      } else if (Array.isArray(obj)) {
        return obj.map(replaceVariables);
      } else if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = replaceVariables(value);
        }
        return result;
      }
      return obj;
    };

    return replaceVariables(prepared);
  }

  /**
   * Extract context updates from step results
   */
  extractContextUpdates(result, step) {
    const updates = {};

    // Add result data with step prefix
    updates[`${step.stepId}_result`] = result;

    // Extract common fields
    if (result.id) updates[`${step.stepId}_id`] = result.id;
    if (result.url) updates[`${step.stepId}_url`] = result.url;
    if (result.message) updates[`${step.stepId}_message`] = result.message;

    return updates;
  }

  /**
   * Update step status in execution record
   */
  async updateStepStatus(
    executionId,
    stepId,
    status,
    startTime,
    endTime = null,
    duration = null,
    result = null,
    error = null
  ) {
    try {
      const update = {
        'steps.$.status': status,
        'steps.$.startTime': startTime,
      };

      if (endTime) update['steps.$.endTime'] = endTime;
      if (duration) update['steps.$.duration'] = duration;
      if (result) update['steps.$.result'] = result;
      if (error) {
        update['steps.$.error'] = {
          message: error.message,
          stack: error.stack,
        };
      }

      await WorkflowExecution.updateOne(
        { _id: executionId, 'steps.stepId': stepId },
        { $set: update }
      );
    } catch (updateError) {
      logger.error('Error updating step status:', updateError);
    }
  }

  /**
   * Schedule a workflow for automatic execution
   */
  async scheduleWorkflow(workflowId) {
    try {
      const workflow = await Workflow.findById(workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      if (!workflow.trigger?.scheduleConfig) {
        throw new Error('Workflow has no schedule configuration');
      }

      const { scheduleConfig } = workflow.trigger;
      const cronExpression = this.buildCronExpression(scheduleConfig);

      // Cancel existing job if any
      this.unscheduleWorkflow(workflowId);

      // Schedule new job
      const job = cron.schedule(
        cronExpression,
        async () => {
          try {
            logger.info(`Executing scheduled workflow: ${workflowId}`);
            await this.executeWorkflow(workflowId, workflow.userId, {
              triggeredBy: 'schedule',
              scheduledAt: new Date(),
            });
          } catch (error) {
            logger.error(`Error in scheduled workflow ${workflowId}:`, error);
          }
        },
        {
          scheduled: true,
          timezone: scheduleConfig.timezone || 'UTC',
        }
      );

      this.scheduledJobs.set(workflowId, job);

      // Update workflow with next execution time
      const nextExecution = this.calculateNextExecution(scheduleConfig);
      await Workflow.updateOne({ _id: workflowId }, { nextExecution });

      logger.info(
        `Workflow ${workflowId} scheduled with cron: ${cronExpression}`
      );
      return { success: true, cronExpression, nextExecution };
    } catch (error) {
      logger.error(`Error scheduling workflow ${workflowId}:`, error);
      throw new Error(`Failed to schedule workflow: ${error.message}`);
    }
  }

  /**
   * Unschedule a workflow
   */
  unscheduleWorkflow(workflowId) {
    const job = this.scheduledJobs.get(workflowId);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(workflowId);
      logger.info(`Unscheduled workflow: ${workflowId}`);
    }
  }

  /**
   * Build cron expression from schedule config
   */
  buildCronExpression(scheduleConfig) {
    const { frequency, time, daysOfWeek, dayOfMonth } = scheduleConfig;

    if (scheduleConfig.cronExpression) {
      return scheduleConfig.cronExpression;
    }

    const [hour, minute] = time ? time.split(':').map(Number) : [9, 0];

    switch (frequency) {
      case 'daily': {
        return `${minute} ${hour} * * *`;
      }

      case 'weekly': {
        const dayOfWeek = daysOfWeek?.[0] || 1; // Default to Monday
        return `${minute} ${hour} * * ${dayOfWeek}`;
      }

      case 'monthly': {
        const day = dayOfMonth || 1;
        return `${minute} ${hour} ${day} * *`;
      }

      case 'hourly': {
        return `${minute} * * * *`;
      }

      default: {
        return `${minute} ${hour} * * *`; // Default to daily
      }
    }
  }

  /**
   * Calculate next execution time
   */
  calculateNextExecution(scheduleConfig) {
    // This is a simplified calculation
    // In production, you might want to use a more robust library like cron-parser
    const now = new Date();
    const next = new Date(now);

    const { frequency, time } = scheduleConfig;
    const [hour, minute] = time ? time.split(':').map(Number) : [9, 0];

    next.setHours(hour, minute, 0, 0);

    switch (frequency) {
      case 'daily': {
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        break;
      }

      case 'weekly': {
        const daysOfWeek = scheduleConfig.daysOfWeek || [1];
        const targetDay = daysOfWeek[0];
        const currentDay = next.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0 || (daysToAdd === 0 && next <= now)) {
          daysToAdd += 7;
        }
        next.setDate(next.getDate() + daysToAdd);
        break;
      }

      case 'monthly': {
        const dayOfMonth = scheduleConfig.dayOfMonth || 1;
        next.setDate(dayOfMonth);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
        break;
      }

      case 'hourly': {
        next.setMinutes(minute);
        if (next <= now) {
          next.setHours(next.getHours() + 1);
        }
        break;
      }
    }

    return next;
  }

  /**
   * Get workflow execution history
   */
  async getExecutionHistory(workflowId, userId, limit = 50, offset = 0) {
    try {
      const executions = await WorkflowExecution.find({ workflowId, userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .exec();

      return executions;
    } catch (error) {
      logger.error('Error getting execution history:', error);
      throw new Error(`Failed to get execution history: ${error.message}`);
    }
  }

  /**
   * Get execution details
   */
  async getExecutionDetails(executionId, userId) {
    try {
      const execution = await WorkflowExecution.findOne({ executionId, userId })
        .populate('workflowId')
        .exec();

      return execution;
    } catch (error) {
      logger.error('Error getting execution details:', error);
      throw new Error(`Failed to get execution details: ${error.message}`);
    }
  }

  /**
   * Cancel a running workflow execution
   */
  async cancelExecution(executionId, userId) {
    try {
      const execution = await WorkflowExecution.findOne({
        executionId,
        userId,
      });
      if (!execution) {
        throw new Error('Execution not found');
      }

      if (execution.status !== 'running') {
        throw new Error('Execution is not running');
      }

      // Update execution status
      await WorkflowExecution.updateOne(
        { executionId },
        {
          status: 'cancelled',
          endTime: new Date(),
        }
      );

      // Remove from executing workflows
      this.executingWorkflows.delete(executionId);

      logger.info(`Execution cancelled: ${executionId}`);
      return { success: true, message: 'Execution cancelled successfully' };
    } catch (error) {
      logger.error(`Error cancelling execution ${executionId}:`, error);
      throw new Error(`Failed to cancel execution: ${error.message}`);
    }
  }

  /**
   * Initialize scheduled workflows on service startup
   */
  async initializeScheduledWorkflows() {
    try {
      logger.info('Initializing scheduled workflows...');

      const scheduledWorkflows = await Workflow.find({
        status: 'active',
        'trigger.triggerType': 'schedule',
      });

      for (const workflow of scheduledWorkflows) {
        try {
          await this.scheduleWorkflow(workflow._id);
        } catch (error) {
          logger.error(`Error scheduling workflow ${workflow._id}:`, error);
        }
      }

      logger.info(`Initialized ${this.scheduledJobs.size} scheduled workflows`);
    } catch (error) {
      logger.error('Error initializing scheduled workflows:', error);
    }
  }

  /**
   * Resume a paused workflow execution after approval
   */
  async resumeExecution(approvalId, userId, approved = true) {
    try {
      logger.info(`Resuming execution for approval ${approvalId} (Approved: ${approved})`);

      const approval = await WorkflowApproval.findOne({ approvalId, userId });
      if (!approval) {
        throw new Error('Approval request not found');
      }

      if (approval.status !== 'pending') {
        throw new Error(`Approval is already resolved as ${approval.status}`);
      }

      // Update approval status
      approval.status = approved ? 'approved' : 'rejected';
      approval.decisionTime = new Date();
      await approval.save();

      const execution = await WorkflowExecution.findOne({ executionId: approval.checkpointId, userId });
      if (!execution) {
        throw new Error('Associated execution record not found');
      }

      if (execution.status !== 'awaiting_approval') {
        throw new Error(`Execution is in invalid state: ${execution.status}`);
      }

      if (!approved) {
        // Mark execution as cancelled/failed
        await WorkflowExecution.updateOne(
          { _id: execution._id },
          {
            status: 'cancelled',
            endTime: new Date(),
            'result.summary': 'Workflow cancelled due to user rejection of approval request.'
          }
        );
        return {
          success: true,
          status: 'rejected',
          message: 'Workflow execution cancelled by user rejection.'
        };
      }

      // Load workflow
      const workflow = await Workflow.findById(execution.workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      // Add the current stepId to approved steps list in context
      const currentContext = { ...execution.context };
      if (!currentContext._approvedSteps) {
        currentContext._approvedSteps = [];
      }
      currentContext._approvedSteps.push(approval.stepId);

      // Run steps starting from the paused index
      const startStepIndex = execution.currentStepIndex || 0;
      
      // Run steps asynchronously or synchronously depending on the trigger
      const result = await this.runWorkflowSteps(workflow, execution, currentContext, startStepIndex);

      return {
        success: true,
        status: 'resumed',
        result
      };
    } catch (error) {
      logger.error(`Error resuming execution ${approvalId}:`, error);
      throw error;
    }
  }
}

export const workflowExecutionService = new WorkflowExecutionService();
