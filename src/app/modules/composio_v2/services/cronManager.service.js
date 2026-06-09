import cron from 'node-cron';
import { logger } from '../../../../shared/logger.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import { workflowExecutor } from './workflowExecutor.service.js';
import parser from 'cron-parser'; // Import cron-parser for accurate next execution time calculation

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
   * Supports 'scheduled' (one-time) and 'recurring' (cron-based) trigger types.
   * Manual trigger workflows do not require cron scheduling.
   *
   * @async
   * @param {Workflow} workflow - The workflow object to schedule.
   * @returns {Promise<{success: boolean, message?: string, error?: string, data?: {cronExpression: string, description: string, nextExecution: Date|null}}>}
   *   An object indicating the success or failure of the scheduling operation,
   *   along with a message, error details, and scheduling data if successful.
   * @throws {Error} If the `scheduleConfig` is invalid or the cron expression is malformed.
   */
  async scheduleWorkflow(workflow) {
    try {
      const { workflowId, scheduleConfig } = workflow;

      // Remove existing cron job if any
      await this.unscheduleWorkflow(workflowId);

      if (!scheduleConfig.isActive) {
        logger.info(`Workflow ${workflowId} is inactive, not scheduling`);
        return { success: true, message: 'Workflow is inactive' };
      }

      let cronExpression;
      let description;

      // Determine cron expression based on trigger type
      if (workflow.triggerType === 'scheduled') {
        // One-time scheduled execution
        if (!scheduleConfig.triggerDate) {
          throw new Error('Trigger date is required for scheduled workflows');
        }

        const triggerTime = new Date(scheduleConfig.triggerDate);
        if (triggerTime <= new Date()) {
          throw new Error('Trigger date must be in the future');
        }

        // Convert to cron expression for the specific date/time
        cronExpression = this.dateTimeToCron(triggerTime);
        description = `One-time execution at ${triggerTime.toISOString()}`;
      } else if (workflow.triggerType === 'recurring') {
        // Recurring scheduled execution
        if (!scheduleConfig.cronExpression) {
          throw new Error(
            'Cron expression is required for recurring workflows'
          );
        }

        cronExpression = scheduleConfig.cronExpression;
        description = `Recurring execution: ${cronExpression}`;
      } else {
        // Manual trigger workflows don't need cron scheduling
        return {
          success: true,
          message: 'Manual trigger workflow, no scheduling needed',
        };
      }

      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`);
      }

      // Create and start the cron job
      const cronJob = cron.schedule(
        cronExpression,
        async () => {
          // BUG FIX: Added try-catch block to handle potential unhandled promise rejections
          // within the cron job callback, ensuring robustness.
          try {
            await this.executeCronJob(workflowId);
          } catch (jobError) {
            logger.error(`Unhandled error in cron job for workflow ${workflowId}:`, jobError);
            // Depending on the desired behavior, you might want to unschedule the job here
            // if persistent errors occur, to prevent continuous failures.
          }
        },
        {
          scheduled: true,
          timezone: scheduleConfig.timezone || 'UTC',
        }
      );

      // Store the cron job
      this.activeCronJobs.set(workflowId, {
        job: cronJob,
        cronExpression,
        description,
        createdAt: new Date(),
      });

      // Update next execution time in database
      const nextExecution = this.getNextExecutionTime(
        cronExpression,
        scheduleConfig.timezone
      );
      // Optimization: Recommend indexing 'workflowId' for faster lookups.
      // Example: db.scheduledworkflows.createIndex({ workflowId: 1 })
      await ScheduledWorkflow.updateOne({ workflowId }, { nextExecution });

      logger.info(`Workflow ${workflowId} scheduled: ${description}`);

      return {
        success: true,
        message: 'Workflow scheduled successfully',
        data: {
          cronExpression,
          description,
          nextExecution,
        },
      };
    } catch (error) {
      logger.error(
        `Failed to schedule workflow ${workflow.workflowId}:`,
        error
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Unschedules a workflow by stopping and destroying its associated cron job.
   * Also clears the `nextExecution` time in the database for the workflow.
   *
   * @async
   * @param {string} workflowId - The unique identifier of the workflow to unschedule.
   * @returns {Promise<{success: boolean, error?: string}>} An object indicating the success or failure of the operation.
   */
  async unscheduleWorkflow(workflowId) {
    try {
      const cronJobData = this.activeCronJobs.get(workflowId);

      if (cronJobData) {
        cronJobData.job.stop();
        cronJobData.job.destroy();
        this.activeCronJobs.delete(workflowId);

        logger.info(`Workflow ${workflowId} unscheduled`);
      }

      // Clear next execution time in database
      // Optimization: Recommend indexing 'workflowId' for faster lookups.
      // Example: db.scheduledworkflows.createIndex({ workflowId: 1 })
      await ScheduledWorkflow.updateOne(
        { workflowId },
        { nextExecution: null }
      );

      return { success: true };
    } catch (error) {
      logger.error(`Failed to unschedule workflow ${workflowId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Reschedules an existing workflow. This is effectively an unschedule followed by a schedule.
   *
   * @async
   * @param {Workflow} workflow - The workflow object to reschedule.
   * @returns {Promise<{success: boolean, message?: string, error?: string, data?: {cronExpression: string, description: string, nextExecution: Date|null}}>}
   *   An object indicating the success or failure of the rescheduling operation.
   */
  async rescheduleWorkflow(workflow) {
    try {
      // First unschedule, then schedule again
      await this.unscheduleWorkflow(workflow.workflowId);
      return await this.scheduleWorkflow(workflow);
    } catch (error) {
      logger.error(
        `Failed to reschedule workflow ${workflow.workflowId}:`,
        error
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Executes a specific workflow identified by its ID.
   * This method is typically called by the cron job callback.
   * It fetches the workflow, executes it using `workflowExecutor`,
   * and handles post-execution logic such as marking one-time workflows as completed
   * and updating the `nextExecution` time for recurring workflows.
   *
   * @async
   * @param {string} workflowId - The unique identifier of the workflow to execute.
   * @returns {Promise<void>} A promise that resolves when the execution logic is complete.
   */
  async executeCronJob(workflowId) {
    try {
      logger.info(`Executing cron job for workflow: ${workflowId}`);

      // Get workflow from database
      // Optimization: Add .lean() for performance as this is a read-only operation.
      // Optimization: Recommend indexing 'workflowId' for faster lookups.
      // Example: db.scheduledworkflows.createIndex({ workflowId: 1 })
      const workflow = await ScheduledWorkflow.findOne({ workflowId }).lean();

      if (!workflow) {
        logger.error(`Workflow not found: ${workflowId}`);
        this.unscheduleWorkflow(workflowId); // Clean up orphaned cron job
        return;
      }

      if (!workflow.scheduleConfig.isActive) {
        logger.info(`Workflow ${workflowId} is inactive, skipping execution`);
        return;
      }

      // Execute the workflow
      const executionResult = await workflowExecutor.executeWorkflow(
        workflow,
        'scheduled',
        'cron_job'
      );

      // Handle one-time scheduled workflows
      if (workflow.triggerType === 'scheduled') {
        // Mark as completed and unschedule
        // BUG FIX: Changed from workflow.updateOne to ScheduledWorkflow.updateOne
        // for consistency and to ensure Mongoose middleware is properly triggered.
        await ScheduledWorkflow.updateOne(
          { _id: workflow._id }, // Use _id for specific document update
          {
            status: 'completed',
            'scheduleConfig.isActive': false,
          }
        );
        await this.unscheduleWorkflow(workflowId);

        logger.info(
          `One-time scheduled workflow ${workflowId} completed and unscheduled`
        );
      } else {
        // For recurring workflows, update next execution time
        const nextExecution = this.getNextExecutionTime(
          workflow.scheduleConfig.cronExpression,
          workflow.scheduleConfig.timezone
        );

        // BUG FIX: Changed from workflow.updateOne to ScheduledWorkflow.updateOne
        // for consistency and to ensure Mongoose middleware is properly triggered.
        await ScheduledWorkflow.updateOne(
          { _id: workflow._id }, // Use _id for specific document update
          { nextExecution }
        );
      }

      logger.info(`Cron job execution completed for workflow: ${workflowId}`);
    } catch (error) {
      logger.error(
        `Error executing cron job for workflow ${workflowId}:`,
        error
      );
    }
  }

  /**
   * Loads all active and scheduled/recurring workflows from the database
   * and schedules them using the `scheduleWorkflow` method.
   * This is typically called during manager initialization.
   *
   * @async
   * @returns {Promise<void>} A promise that resolves when all active workflows have been processed.
   */
  async loadActiveWorkflows() {
    try {
      // Optimization: Add .lean() for performance as this is a read-only operation.
      // Optimization: Recommend a compound index on { status: 1, 'scheduleConfig.isActive': 1, triggerType: 1 }
      // for this query. Example: db.scheduledworkflows.createIndex({ status: 1, 'scheduleConfig.isActive': 1, triggerType: 1 })
      const activeWorkflows = await ScheduledWorkflow.find({
        status: 'active',
        'scheduleConfig.isActive': true,
        triggerType: { $in: ['scheduled', 'recurring'] },
      }).lean();

      logger.info(`Loading ${activeWorkflows.length} active workflows`);

      for (const workflow of activeWorkflows) {
        await this.scheduleWorkflow(workflow);
      }

      logger.info(`Loaded and scheduled ${activeWorkflows.length} workflows`);
    } catch (error) {
      logger.error('Failed to load active workflows:', error);
    }
  }

  /**
   * Sets up a recurring cron job to clean up completed one-time workflows.
   * This job runs every hour and identifies 'scheduled' workflows that are
   * 'completed' and were updated more than 24 hours ago, then unschedules them.
   *
   * @returns {void}
   */
  setupCleanupJob() {
    // Run cleanup every hour
    cron.schedule(
      '0 * * * *',
      async () => {
        try {
          logger.info('Running workflow cleanup job');

          // Find completed one-time workflows older than 24 hours
          const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

          // Optimization: Add .lean() for performance as this is a read-only operation.
          // Optimization: Recommend a compound index on { triggerType: 1, status: 1, updatedAt: 1 }
          // for this query. Example: db.scheduledworkflows.createIndex({ triggerType: 1, status: 1, updatedAt: 1 })
          const completedWorkflows = await ScheduledWorkflow.find({
            triggerType: 'scheduled',
            status: 'completed',
            updatedAt: { $lt: cutoffDate },
          }).lean();

          for (const workflow of completedWorkflows) {
            // Ensure cron job is removed
            await this.unscheduleWorkflow(workflow.workflowId);
          }

          logger.info(
            `Cleanup completed: processed ${completedWorkflows.length} completed workflows`
          );
        } catch (error) {
          logger.error('Error in cleanup job:', error);
        }
      },
      {
        timezone: 'UTC',
      }
    );

    logger.info('Cleanup job scheduled');
  }

  /**
   * Sets up a recurring cron job for health checks.
   * This job runs every 5 minutes and logs the number of active cron jobs,
   * providing a basic health status of the CronManager.
   *
   * @returns {void}
   */
  setupHealthCheckJob() {
    // Health check every 5 minutes
    cron.schedule(
      '*/5 * * * *',
      () => {
        const activeJobsCount = this.activeCronJobs.size;
        logger.debug(
          `CronManager health check: ${activeJobsCount} active jobs`
        );
      },
      {
        timezone: 'UTC',
      }
    );

    logger.info('Health check job scheduled');
  }

  /**
   * Converts a specific `Date` or `DateTime` object into a cron expression
   * suitable for one-time execution at that exact moment.
   * The format is `minute hour day month *`.
   *
   * @param {Date|string} dateTime - The date and time to convert. Can be a Date object or an ISO string.
   * @returns {string} The cron expression for the specified date and time.
   */
  dateTimeToCron(dateTime) {
    const date = new Date(dateTime);

    const minute = date.getMinutes();
    const hour = date.getHours();
    const day = date.getDate();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed

    // For one-time execution: specific minute, hour, day, month, any day of week
    return `${minute} ${hour} ${day} ${month} *`;
  }

  /**
   * Calculates the next execution time for a given cron expression.
   * Uses the `cron-parser` library for accurate calculation, considering the specified timezone.
   *
   * @param {string} cronExpression - The cron expression (e.g., "0 0 * * *").
   * @param {string} [timezone='UTC'] - The timezone to use for calculation (e.g., 'America/New_York').
   * @returns {Date|null} The next scheduled execution time as a Date object, or null if parsing fails.
   */
  getNextExecutionTime(cronExpression, timezone = 'UTC') {
    // BUG FIX: Replaced placeholder implementation with actual cron expression parsing
    // using 'cron-parser' to accurately calculate the next execution time.
    try {
      const options = {
        currentDate: new Date(),
        endDate: null, // No end date, just get the next one
        iterator: false, // Return a single date, not an iterator
        timezone: timezone,
      };
      const interval = parser.parseExpression(cronExpression, options);
      return interval.next().toDate();
    } catch (error) {
      logger.error(`Error parsing cron expression "${cronExpression}" for next execution time:`, error);
      return null;
    }
  }

  /**
   * Retrieves the current status of the CronManager, including its initialization state
   * and details about all active cron jobs.
   *
   * @returns {{isInitialized: boolean, activeJobsCount: number, jobs: Array<{workflowId: string, cronExpression: string, description: string, createdAt: Date, isRunning: boolean}>}}
   *   An object containing the manager's status.
   */
  getStatus() {
    const jobs = Array.from(this.activeCronJobs.entries()).map(
      ([workflowId, jobData]) => ({
        workflowId,
        cronExpression: jobData.cronExpression,
        description: jobData.description,
        createdAt: jobData.createdAt,
        isRunning: jobData.job.running,
      })
    );

    return {
      isInitialized: this.isInitialized,
      activeJobsCount: this.activeCronJobs.size,
      jobs,
    };
  }

  /**
   * Stops all active cron jobs and clears the `activeCronJobs` map.
   * This method is crucial for graceful shutdown of the application.
   *
   * @async
   * @returns {Promise<void>} A promise that resolves when all cron jobs have been stopped.
   */
  async shutdown() {
    try {
      logger.info('Shutting down CronManager...');

      for (const [workflowId, jobData] of this.activeCronJobs) {
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
   * Manually triggers the execution of a specific scheduled workflow.
   * This bypasses the cron schedule and executes the workflow immediately.
   *
   * @async
   * @param {string} workflowId - The unique identifier of the workflow to trigger.
   * @returns {Promise<{success: boolean, data?: object, error?: string, message?: string}>}
   *   An object indicating the success or failure of the manual trigger,
   *   along with execution results or an error message.
   */
  async triggerScheduledWorkflow(workflowId) {
    try {
      // Optimization: Add .lean() for performance as this is a read-only operation.
      // Optimization: Recommend indexing 'workflowId' for faster lookups.
      // Example: db.scheduledworkflows.createIndex({ workflowId: 1 })
      const workflow = await ScheduledWorkflow.findOne({ workflowId }).lean();

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      // Execute the workflow manually
      const executionResult = await workflowExecutor.executeWorkflow(
        workflow,
        'manual',
        'user_trigger'
      );

      return {
        success: true,
        data: executionResult,
        message: 'Workflow triggered successfully',
      };
    } catch (error) {
      logger.error(`Error triggering scheduled workflow ${workflowId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

/**
 * The singleton instance of the CronManager.
 * This instance should be used throughout the application to manage scheduled workflows.
 * @type {CronManager}
 */
export const cronManager = new CronManager();
export default cronManager;