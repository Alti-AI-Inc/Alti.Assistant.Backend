import cron from 'node-cron';
import { logger } from '../../../../shared/logger.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import { workflowExecutor } from './workflowExecutor.service.js';
import parser from 'cron-parser'; // Import cron-parser for accurate next execution time calculation

/**
 * @typedef {object} AuthContext
 * @property {string} userId - The ID of the user performing the action.
 * @property {string} workspaceId - The ID of the workspace (tenant) the user belongs to.
 * @property {('super_admin'|'admin'|'manager'|'user')} role - The role of the user.
 */

/**
 * @typedef {object} ScheduleConfig
 * @property {boolean} isActive - Whether the schedule is active.
 * @property {string} [triggerDate] - For 'scheduled' workflows, the specific date/time for one-time execution (ISO string).
 * @property {string} [cronExpression] - For 'recurring' workflows, the cron expression defining the recurrence.
 * @property {string} [timezone='UTC'] - The timezone for the cron schedule (e.g., 'America/New_York', 'UTC').
 */

/**
 * @typedef {object} Workflow
 * @property {string} workflowId - Unique identifier for the workflow.
 * @property {string} triggerType - The type of trigger for the workflow ('scheduled', 'recurring', 'manual').
 * @property {ScheduleConfig} scheduleConfig - Configuration for scheduling the workflow.
 * @property {string} status - The current status of the workflow (e.g., 'active', 'completed').
 * @property {Date} [updatedAt] - The last update timestamp for the workflow.
 * @property {string} [_id] - MongoDB document ID.
 * @property {string} workspaceId - CRITICAL: The ID of the workspace (tenant) this workflow belongs to.
 * @property {string} createdBy - CRITICAL: The ID of the user who created this workflow.
 */

/**
 * Cron Manager Service - Handles scheduling and execution of workflows based on cron expressions.
 * It manages active cron jobs, initializes schedules from the database, and performs cleanup tasks.
 */
class CronManager {
  /**
   * Creates an instance of CronManager.
   * @constructor
   */
  constructor() {
    /**
     * A map to store active cron jobs.
     * Key: workflowId (string)
     * Value: { job: cron.CronJob, cronExpression: string, description: string, createdAt: Date }
     * @type {Map<string, { job: import('node-cron').CronJob, cronExpression: string, description: string, createdAt: Date }>}
     */
    this.activeCronJobs = new Map();
    /**
     * Indicates whether the CronManager has been initialized.
     * @type {boolean}
     */
    this.isInitialized = false;
  }

  /**
   * Initializes the cron manager by loading existing active workflows from the database,
   * setting up their cron jobs, and scheduling internal cleanup and health check jobs.
   * Prevents re-initialization if already initialized.
   * @async
   * @returns {Promise<void>} A promise that resolves when initialization is complete.
   * @throws {Error} If initialization fails for any reason (e.g., database error).
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('CronManager already initialized');
      return;
    }

    try {
      logger.info('Initializing CronManager...');

      // Load existing active workflows and set up their cron jobs
      await this.loadActiveWorkflows();

      // Set up a cleanup job to run every hour
      this.setupCleanupJob();

      // Set up a health check job
      this.setupHealthCheckJob();

      this.isInitialized = true;
      logger.info('CronManager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize CronManager:', error);
      throw error;
    }
  }

  /**
   * Schedules a workflow for execution based on its `triggerType` and `scheduleConfig`.
   * If the workflow is already scheduled, it will be unscheduled first.
   * This operation is tenant-aware and checks workspace limits.
   *
   * @async
   * @param {Workflow} workflow - The workflow object to schedule.
   * @param {AuthContext} authContext - The authorization context of the user performing the action.
   * @returns {Promise<{success: boolean, message?: string, error?: string, data?: {cronExpression: string, description: string, nextExecution: Date|null}}>}
   *   An object indicating the success or failure of the scheduling operation.
   * @throws {Error} If the `scheduleConfig` is invalid or the cron expression is malformed.
   */
  async scheduleWorkflow(workflow, authContext) {
    try {
      // SECURITY & TENANCY: Validate authorization context.
      if (!authContext || !authContext.workspaceId) {
        throw new Error('Authorization context with workspaceId is required.');
      }
      // SECURITY & TENANCY: Ensure the workflow being scheduled belongs to the user's workspace.
      if (workflow.workspaceId.toString() !== authContext.workspaceId.toString()) {
        logger.warn(`IDOR Attempt: User in workspace ${authContext.workspaceId} tried to schedule workflow ${workflow.workflowId} from another workspace ${workflow.workspaceId}.`);
        return { success: false, error: 'Workflow not found in your workspace.' };
      }

      const { workflowId, scheduleConfig } = workflow;

      // HIERARCHY & LIMITS: Check against workspace limits before scheduling.
      // This is a critical integration point for managing tenant resources.
      // In a real application, this limit would come from a subscription plan associated with the workspace.
      const scheduleLimit = 50; // Example limit
      const activeScheduleCount = await ScheduledWorkflow.countDocuments({
          workspaceId: authContext.workspaceId,
          'scheduleConfig.isActive': true,
          triggerType: { $in: ['scheduled', 'recurring'] }
      });

      if (activeScheduleCount >= scheduleLimit) {
          // HIERARCHY & NOTIFICATIONS: This is a point where a notification could be sent to the workspace admin.
          logger.warn(`Workspace ${authContext.workspaceId} has reached its scheduled workflow limit of ${scheduleLimit}.`);
          return { success: false, error: `You have reached the limit of ${scheduleLimit} active scheduled workflows for your workspace.` };
      }

      // Remove existing cron job if any, ensuring it's done within the tenant's context.
      await this.unscheduleWorkflow(workflowId, authContext);

      if (!scheduleConfig.isActive) {
        logger.info(`Workflow ${workflowId} is inactive, not scheduling`);
        return { success: true, message: 'Workflow is inactive' };
      }

      let cronExpression;
      let description;

      if (workflow.triggerType === 'scheduled') {
        if (!scheduleConfig.triggerDate) throw new Error('Trigger date is required for scheduled workflows');
        const triggerTime = new Date(scheduleConfig.triggerDate);
        if (triggerTime <= new Date()) throw new Error('Trigger date must be in the future');
        cronExpression = this.dateTimeToCron(triggerTime);
        description = `One-time execution at ${triggerTime.toISOString()}`;
      } else if (workflow.triggerType === 'recurring') {
        if (!scheduleConfig.cronExpression) throw new Error('Cron expression is required for recurring workflows');
        cronExpression = scheduleConfig.cronExpression;
        description = `Recurring execution: ${cronExpression}`;
      } else {
        return { success: true, message: 'Manual trigger workflow, no scheduling needed' };
      }

      if (!cron.validate(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`);
      }

      const cronJob = cron.schedule(
        cronExpression,
        async () => {
          // BUG FIX: Added try-catch block to handle potential unhandled promise rejections
          // within the cron job callback, ensuring robustness.
          try {
            await this.executeCronJob(workflowId);
          } catch (jobError) {
            logger.error(`Unhandled error in cron job for workflow ${workflowId}:`, jobError);
          }
        },
        { scheduled: true, timezone: scheduleConfig.timezone || 'UTC' }
      );

      this.activeCronJobs.set(workflowId, {
        job: cronJob,
        cronExpression,
        description,
        createdAt: new Date(),
      });

      const nextExecution = this.getNextExecutionTime(cronExpression, scheduleConfig.timezone);
      
      // SECURITY & TENANCY: Ensure the database update is scoped to the correct tenant.
      await ScheduledWorkflow.updateOne({ workflowId, workspaceId: authContext.workspaceId }, { nextExecution });

      logger.info(`Workflow ${workflowId} scheduled for workspace ${authContext.workspaceId}: ${description}`);

      return {
        success: true,
        message: 'Workflow scheduled successfully',
        data: { cronExpression, description, nextExecution },
      };
    } catch (error) {
      logger.error(`Failed to schedule workflow ${workflow.workflowId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unschedules a workflow by stopping its cron job and clearing its next execution time in the DB.
   * This operation is tenant-aware.
   *
   * @async
   * @param {string} workflowId - The unique identifier of the workflow to unschedule.
   * @param {Pick<AuthContext, 'workspaceId'>} context - The context containing the workspaceId to scope the operation.
   * @returns {Promise<{success: boolean, error?: string}>} An object indicating the success or failure of the operation.
   */
  async unscheduleWorkflow(workflowId, context) {
    try {
      const cronJobData = this.activeCronJobs.get(workflowId);

      if (cronJobData) {
        cronJobData.job.stop();
        cronJobData.job.destroy();
        this.activeCronJobs.delete(workflowId);
        logger.info(`Workflow ${workflowId} unscheduled`);
      }

      // SECURITY & TENANCY: If context is provided, scope the database update.
      // This prevents a user in one tenant from affecting another tenant's workflow.
      const query = { workflowId };
      if (context && context.workspaceId) {
        query.workspaceId = context.workspaceId;
      } else {
        // Failsafe: Log a warning if a DB-mutating operation is attempted without tenant context.
        logger.warn(`Unschedule operation for workflow ${workflowId} was called without a workspace context.`);
        // Depending on security policy, you might want to throw an error here instead.
      }

      // This operation is now tenant-aware if context is supplied.
      await ScheduledWorkflow.updateOne(query, { $set: { nextExecution: null } });

      return { success: true };
    } catch (error) {
      logger.error(`Failed to unschedule workflow ${workflowId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reschedules an existing workflow. This is an unschedule followed by a schedule, respecting tenancy and limits.
   *
   * @async
   * @param {Workflow} workflow - The workflow object to reschedule.
   * @param {AuthContext} authContext - The authorization context of the user performing the action.
   * @returns {Promise<{success: boolean, message?: string, error?: string, data?: {cronExpression: string, description: string, nextExecution: Date|null}}>}
   */
  async rescheduleWorkflow(workflow, authContext) {
    try {
      // SECURITY & TENANCY: The context is passed down to the underlying methods,
      // which will enforce all necessary authorization and tenancy rules.
      if (!authContext || !authContext.workspaceId) {
        throw new Error('Authorization context with workspaceId is required.');
      }
      // The unschedule and schedule methods are already tenant-aware.
      await this.unscheduleWorkflow(workflow.workflowId, authContext);
      return await this.scheduleWorkflow(workflow, authContext);
    } catch (error) {
      logger.error(`Failed to reschedule workflow ${workflow.workflowId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Executes a specific workflow identified by its ID. Called by the cron job callback.
   * It propagates the correct tenant and user context to the workflow executor for usage tracking.
   *
   * @async
   * @param {string} workflowId - The unique identifier of the workflow to execute.
   * @returns {Promise<void>}
   */
  async executeCronJob(workflowId) {
    try {
      logger.info(`Executing cron job for workflow: ${workflowId}`);

      const workflow = await ScheduledWorkflow.findOne({ workflowId }).lean();

      if (!workflow) {
        logger.error(`Orphaned cron job found for non-existent workflow: ${workflowId}. Unscheduling.`);
        await this.unscheduleWorkflow(workflowId); // Pass no context to just remove the in-memory job.
        return;
      }

      // SECURITY & TENANCY: Validate that the workflow has the necessary context data before execution.
      if (!workflow.workspaceId || !workflow.createdBy) {
        logger.error(`Workflow ${workflowId} is missing critical tenancy data (workspaceId, createdBy) and cannot be executed securely.`);
        await this.unscheduleWorkflow(workflowId, { workspaceId: workflow.workspaceId });
        return;
      }

      if (!workflow.scheduleConfig.isActive) {
        logger.info(`Workflow ${workflowId} is inactive, skipping execution`);
        return;
      }

      // HIERARCHY & USAGE: Create an execution context from the workflow's own data.
      // This ensures that any actions and usage metrics are correctly attributed to the originating user and workspace.
      const executionContext = {
          userId: workflow.createdBy,
          workspaceId: workflow.workspaceId,
          role: 'system', // Denotes automated execution
      };

      // Pass the context to the executor.
      await workflowExecutor.executeWorkflow(
        workflow,
        'scheduled',
        'cron_job',
        executionContext
      );

      if (workflow.triggerType === 'scheduled') {
        await ScheduledWorkflow.updateOne(
          { _id: workflow._id, workspaceId: workflow.workspaceId },
          { status: 'completed', 'scheduleConfig.isActive': false }
        );
        await this.unscheduleWorkflow(workflowId, { workspaceId: workflow.workspaceId });
        logger.info(`One-time scheduled workflow ${workflowId} completed and unscheduled`);
      } else {
        const nextExecution = this.getNextExecutionTime(
          workflow.scheduleConfig.cronExpression,
          workflow.scheduleConfig.timezone
        );
        await ScheduledWorkflow.updateOne(
          { _id: workflow._id, workspaceId: workflow.workspaceId },
          { nextExecution }
        );
      }

      logger.info(`Cron job execution completed for workflow: ${workflowId}`);
    } catch (error) {
      logger.error(`Error executing cron job for workflow ${workflowId}:`, error);
    }
  }

  /**
   * Loads all active workflows from the database and schedules them. Called on initialization.
   *
   * @async
   * @returns {Promise<void>}
   */
  async loadActiveWorkflows() {
    try {
      // This is a system-level operation, so it queries across all tenants.
      const activeWorkflows = await ScheduledWorkflow.find({
        status: 'active',
        'scheduleConfig.isActive': true,
        triggerType: { $in: ['scheduled', 'recurring'] },
      }).lean();

      logger.info(`Loading ${activeWorkflows.length} active workflows`);

      for (const workflow of activeWorkflows) {
        // Construct a basic context from the workflow data for scheduling.
        const context = { workspaceId: workflow.workspaceId, userId: workflow.createdBy, role: 'system' };
        // Use a simplified schedule call that bypasses user-facing limit checks on startup.
        // For simplicity here, we call the main scheduler but in a real-world scenario,
        // a separate internal scheduler might be used.
        await this.scheduleWorkflow(workflow, context);
      }

      logger.info(`Loaded and scheduled ${activeWorkflows.length} workflows`);
    } catch (error) {
      logger.error('Failed to load active workflows:', error);
    }
  }

  /**
   * Sets up a recurring job to clean up completed one-time workflows.
   *
   * @returns {void}
   */
  setupCleanupJob() {
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('Running workflow cleanup job');
        const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const completedWorkflows = await ScheduledWorkflow.find({
          triggerType: 'scheduled',
          status: 'completed',
          updatedAt: { $lt: cutoffDate },
        }).lean();

        for (const workflow of completedWorkflows) {
          // SECURITY & TENANCY: Pass context to the unschedule method to ensure tenant-safe operations.
          await this.unscheduleWorkflow(workflow.workflowId, { workspaceId: workflow.workspaceId });
        }

        logger.info(`Cleanup completed: processed ${completedWorkflows.length} completed workflows`);
      } catch (error) {
        logger.error('Error in cleanup job:', error);
      }
    }, { timezone: 'UTC' });

    logger.info('Cleanup job scheduled');
  }

  /**
   * Sets up a recurring job for health checks.
   *
   * @returns {void}
   */
  setupHealthCheckJob() {
    cron.schedule('*/5 * * * *', () => {
      const activeJobsCount = this.activeCronJobs.size;
      logger.debug(`CronManager health check: ${activeJobsCount} active jobs`);
    }, { timezone: 'UTC' });

    logger.info('Health check job scheduled');
  }

  /**
   * Converts a `Date` object into a cron expression for one-time execution.
   *
   * @param {Date|string} dateTime - The date and time to convert.
   * @returns {string} The cron expression.
   */
  dateTimeToCron(dateTime) {
    const date = new Date(dateTime);
    const minute = date.getMinutes();
    const hour = date.getHours();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    return `${minute} ${hour} ${day} ${month} *`;
  }

  /**
   * Calculates the next execution time for a given cron expression using `cron-parser`.
   *
   * @param {string} cronExpression - The cron expression.
   * @param {string} [timezone='UTC'] - The timezone for calculation.
   * @returns {Date|null} The next execution time or null if parsing fails.
   */
  getNextExecutionTime(cronExpression, timezone = 'UTC') {
    // BUG FIX: Replaced placeholder implementation with actual cron expression parsing
    // using 'cron-parser' to accurately calculate the next execution time.
    try {
      const options = {
        currentDate: new Date(),
        tz: timezone,
      };
      const interval = parser.parseExpression(cronExpression, options);
      return interval.next().toDate();
    } catch (error) {
      logger.error(`Error parsing cron expression "${cronExpression}" for next execution time:`, error);
      return null;
    }
  }

  /**
   * Retrieves the current status of the CronManager.
   * SECURITY: This endpoint should only be exposed to `super_admin` roles as it contains system-wide information.
   *
   * @returns {{isInitialized: boolean, activeJobsCount: number, jobs: Array<{workflowId: string, cronExpression: string, description: string, createdAt: Date, isRunning: boolean}>}}
   */
  getStatus() {
    const jobs = Array.from(this.activeCronJobs.entries()).map(
      ([workflowId, jobData]) => ({
        workflowId,
        cronExpression: jobData.cronExpression,
        description: jobData.description,
        createdAt: jobData.createdAt,
        isRunning: !!jobData.job.running, // Ensure boolean value
      })
    );

    return {
      isInitialized: this.isInitialized,
      activeJobsCount: this.activeCronJobs.size,
      jobs,
    };
  }

  /**
   * Stops all active cron jobs for a graceful shutdown.
   *
   * @async
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      logger.info('Shutting down CronManager...');
      for (const [, jobData] of this.activeCronJobs) {
        jobData.job.stop();
        jobData.job.destroy();
      }
      this.activeCronJobs.clear();
      this.isInitialized = false;
      logger.info('CronManager shutdown completed');
    } catch (error) {
      logger.error('Error during CronManager shutdown:', error);
    }
  }

  /**
   * Manually triggers the execution of a specific scheduled workflow, respecting tenancy and roles.
   *
   * @async
   * @param {string} workflowId - The unique identifier of the workflow to trigger.
   * @param {AuthContext} authContext - The authorization context of the user performing the action.
   * @returns {Promise<{success: boolean, data?: object, error?: string, message?: string}>}
   */
  async triggerScheduledWorkflow(workflowId, authContext) {
    try {
      // SECURITY & TENANCY: Validate authorization context.
      if (!authContext || !authContext.workspaceId || !authContext.userId) {
        return { success: false, error: 'Authorization context is required.' };
      }

      // SECURITY & TENANCY: Find the workflow ONLY within the user's workspace to prevent IDOR.
      const workflow = await ScheduledWorkflow.findOne({
        workflowId,
        workspaceId: authContext.workspaceId,
      }).lean();

      if (!workflow) {
        return { success: false, error: 'Workflow not found' };
      }

      // HIERARCHY & ROLE VALIDATION: Check if the user has permission to trigger this workflow.
      // Example: Only the creator or a workspace admin/manager can trigger it.
      const isOwner = workflow.createdBy.toString() === authContext.userId.toString();
      const isAdminOrManager = ['admin', 'manager'].includes(authContext.role);
      if (!isOwner && !isAdminOrManager) {
        return { success: false, error: 'You do not have permission to trigger this workflow.' };
      }

      // HIERARCHY & USAGE: Pass the user's auth context to the executor
      // to correctly attribute usage and enforce permissions during execution.
      const executionResult = await workflowExecutor.executeWorkflow(
        workflow,
        'manual',
        'user_trigger',
        authContext
      );

      return {
        success: true,
        data: executionResult,
        message: 'Workflow triggered successfully',
      };
    } catch (error) {
      logger.error(`Error triggering scheduled workflow ${workflowId}:`, error);
      return { success: false, error: error.message };
    }
  }
}

/**
 * The singleton instance of the CronManager.
 * @type {CronManager}
 */
export const cronManager = new CronManager();
export default cronManager;