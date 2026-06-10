import { logger } from '../../../../shared/logger.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import { cronManager } from './cronManager.service.js';
import workflowExecutor from './workflowExecutor.service.js';

/**
 * @class SchedulerInitializer
 * @description Manages the lifecycle of scheduled workflows, including initialization,
 * loading active workflows, graceful shutdown, and manual/emergency execution.
 * It acts as the central orchestrator for the application's scheduling capabilities.
 */
class SchedulerInitializer {
  /**
   * @private
   * @type {boolean}
   * @description Indicates whether the scheduler has been successfully initialized.
   */
  initialized = false;

  /**
   * @private
   * @type {Array<Function>}
   * @description A list of functions to be executed during graceful shutdown.
   */
  gracefulShutdownHandlers = [];

  /**
   * @constructor
   * @description Creates an instance of SchedulerInitializer.
   */
  constructor() {
    // Class properties 'initialized' and 'gracefulShutdownHandlers' are already initialized
    // with default values, so explicit assignments in the constructor are redundant.
  }

  /**
   * @async
   * @method initialize
   * @description Initializes the workflow scheduler on application startup.
   * This involves initializing the cron manager, loading and scheduling all active workflows
   * from the database, and setting up graceful shutdown handlers.
   * @returns {Promise<object>} A promise that resolves to an object indicating the success
   * or failure of the initialization, along with a message and the count of scheduled workflows.
   * @returns {boolean} returns.success - True if initialization was successful, false otherwise.
   * @returns {string} returns.message - A descriptive message about the initialization status.
   * @returns {number} [returns.scheduledWorkflows] - The number of workflows successfully scheduled.
   * @returns {string} [returns.error] - Error message if initialization failed.
   */
  async initialize() {
    try {
      logger.info('Initializing workflow scheduler...');

      // Initialize cron manager
      await cronManager.initialize();

      // Load and schedule active workflows
      await this.loadActiveWorkflows();

      // Set up graceful shutdown
      this.setupGracefulShutdown();

      this.initialized = true;
      logger.info('Workflow scheduler initialized successfully');

      return {
        success: true,
        message: 'Scheduler initialized',
        scheduledWorkflows: cronManager.getActiveJobsCount(),
      };
    } catch (error) {
      logger.error('Error initializing scheduler:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * @async
   * @method loadActiveWorkflows
   * @description Retrieves all active scheduled workflows from the database and schedules them
   * using the cron manager. It handles both recurring (cron) and one-time scheduled runs.
   * Workflows with a `nextRun` date in the past are ignored.
   * @returns {Promise<object>} A promise that resolves to an object containing statistics
   * about the loaded and scheduled workflows.
   * @returns {number} returns.total - The total number of active workflows found in the database.
   * @returns {number} returns.scheduled - The number of workflows successfully scheduled.
   * @returns {number} returns.errors - The number of workflows that failed to schedule.
   * @throws {Error} If there is an error fetching workflows from the database.
   */
  async loadActiveWorkflows() {
    try {
      logger.info('Loading active scheduled workflows...');

      // Get all active scheduled workflows
      // Optimization: Added .lean() for performance as these documents are read-only.
      // Indexing Recommendation: Consider a compound index on { isActive: 1, nextRun: 1 } for this query.
      const activeWorkflows = await ScheduledWorkflow.find({
        isActive: true,
        nextRun: { $gt: new Date() }, // Only workflows with future runs
      }).lean();

      // Use Promise.allSettled to schedule workflows concurrently for better performance
      const schedulingPromises = activeWorkflows.map(async (workflow) => {
        let scheduledThisWorkflow = false;
        let hadErrorThisWorkflow = false;

        try {
          // Schedule if cron expression exists
          if (workflow.cronExpression) {
            const result = await cronManager.scheduleWorkflow(
              workflow.workflowId,
              workflow.cronExpression,
              workflow.userId,
              workflow.timezone || 'UTC'
            );

            if (result.success) {
              scheduledThisWorkflow = true;
              logger.info(
                `Scheduled workflow: ${workflow.workflowId} (${workflow.name})`
              );
            } else {
              hadErrorThisWorkflow = true;
              logger.error(
                `Failed to schedule workflow ${workflow.workflowId} (cron): ${result.error}`
              );
            }
          }

          // Schedule one-time runs
          if (
            workflow.oneTimeRun &&
            workflow.oneTimeDate &&
            workflow.oneTimeDate > new Date()
          ) {
            const result = await cronManager.scheduleOneTimeWorkflow(
              workflow.workflowId,
              workflow.oneTimeDate,
              workflow.userId,
              workflow.timezone || 'UTC'
            );

            if (result.success) {
              scheduledThisWorkflow = true;
              logger.info(
                `Scheduled one-time workflow: ${workflow.workflowId} for ${workflow.oneTimeDate}`
              );
            } else {
              hadErrorThisWorkflow = true;
              logger.error(
                `Failed to schedule one-time workflow ${workflow.workflowId}: ${result.error}`
              );
            }
          }
        } catch (workflowError) {
          hadErrorThisWorkflow = true;
          logger.error(
            `Error processing workflow ${workflow.workflowId}:`,
            workflowError
          );
        }
        return { scheduled: scheduledThisWorkflow, error: hadErrorThisWorkflow };
      });

      const results = await Promise.allSettled(schedulingPromises);

      let scheduledCount = 0;
      let errorCount = 0;

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          if (result.value.scheduled) {
            scheduledCount++;
          }
          if (result.value.error) {
            errorCount++;
          }
        } else {
          // This case should ideally be caught by the inner try/catch,
          // but as a fallback, count it as an error if the promise itself rejected.
          errorCount++;
          logger.error('Unhandled promise rejection during workflow scheduling:', result.reason);
        }
      });

      logger.info(
        `Loaded ${activeWorkflows.length} workflows, scheduled ${scheduledCount}, errors: ${errorCount}`
      );

      return {
        total: activeWorkflows.length,
        scheduled: scheduledCount,
        errors: errorCount,
      };
    } catch (error) {
      logger.error('Error loading active workflows:', error);
      throw error;
    }
  }

  /**
   * @method setupGracefulShutdown
   * @description Configures event listeners for various process signals (SIGTERM, SIGINT, SIGQUIT)
   * and uncaught exceptions/unhandled rejections to ensure a graceful shutdown of the scheduler.
   * During shutdown, it stops new scheduling, executes registered shutdown handlers,
   * and performs a graceful shutdown of the cron manager.
   */
  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      try {
        // Stop accepting new workflow schedules
        await cronManager.stopScheduling();

        // Execute shutdown handlers
        for (const handler of this.gracefulShutdownHandlers) {
          try {
            await handler();
          } catch (error) {
            logger.error('Error in shutdown handler:', error);
          }
        }

        // Perform graceful shutdown
        await cronManager.gracefulShutdown();

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

    // Handle uncaught exceptions and rejections
    // Ensure gracefulShutdown is awaited to allow async cleanup to complete before process exit.
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception:', error);
      await gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      await gracefulShutdown('UNHANDLED_REJECTION');
    });
  }

  /**
   * @method addShutdownHandler
   * @description Registers a function to be called during the graceful shutdown process.
   * These handlers are executed before the cron manager's final shutdown.
   * @param {Function} handler - The asynchronous function to execute during shutdown.
   *   It should not take any arguments and should return a Promise.
   */
  addShutdownHandler(handler) {
    if (typeof handler === 'function') {
      this.gracefulShutdownHandlers.push(handler);
    }
  }

  /**
   * @async
   * @method reloadWorkflows
   * @description Stops all currently scheduled jobs and reloads all active workflows
   * from the database, effectively rescheduling them. This is useful for applying
   * runtime updates to workflow configurations without restarting the entire application.
   * @returns {Promise<object>} A promise that resolves to an object indicating the success
   * or failure of the reload operation, along with data about the reloaded workflows.
   * @returns {boolean} returns.success - True if workflows were reloaded successfully, false otherwise.
   * @returns {object} [returns.data] - Statistics about the reloaded workflows (total, scheduled, errors).
   * @returns {string} returns.message - A descriptive message about the reload status.
   * @returns {string} [returns.error] - Error message if reloading failed.
   */
  async reloadWorkflows() {
    try {
      logger.info('Reloading scheduled workflows...');

      // Stop all current jobs
      await cronManager.stopAllJobs();

      // Reload from database
      const result = await this.loadActiveWorkflows();

      logger.info('Workflow reload completed');
      return {
        success: true,
        data: result,
        message: 'Workflows reloaded successfully',
      };
    } catch (error) {
      logger.error('Error reloading workflows:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * @method getStatus
   * @description Provides the current operational status of the scheduler,
   * including its initialization state, cron manager status, active job count,
   * process uptime, memory usage, and the number of registered shutdown handlers.
   * @returns {object} An object containing various status metrics.
   * @returns {boolean} returns.initialized - True if the scheduler is initialized.
   * @returns {object} returns.cronManagerStatus - The status object from the cron manager.
   * @returns {number} returns.activeJobs - The number of currently active jobs in the cron manager.
   * @returns {number} returns.uptime - The process uptime in seconds.
   * @returns {object} returns.memoryUsage - The current memory usage of the process.
   * @returns {number} returns.shutdownHandlers - The number of registered graceful shutdown handlers.
   */
  getStatus() {
    return {
      initialized: this.initialized,
      cronManagerStatus: cronManager.getStatus(),
      activeJobs: cronManager.getActiveJobsCount(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      shutdownHandlers: this.gracefulShutdownHandlers.length,
    };
  }

  /**
   * @async
   * @method healthCheck
   * @description Performs a health check on the scheduler and its underlying cron manager.
   * It indicates whether the scheduler is initialized and if the cron manager is healthy.
   * @returns {Promise<object>} A promise that resolves to an object indicating the health status.
   * @returns {boolean} returns.healthy - True if both the scheduler and cron manager are healthy.
   * @returns {object} returns.status - Detailed status of the scheduler and cron manager.
   * @returns {object} returns.status.scheduler - The status object from `getStatus()`.
   * @returns {object} returns.status.cronManager - The health check result from the cron manager.
   * @returns {string} returns.timestamp - ISO string of when the health check was performed.
   * @returns {string} [returns.error] - Error message if the health check failed.
   */
  async healthCheck() {
    try {
      const status = this.getStatus();
      const cronHealth = await cronManager.healthCheck();

      return {
        healthy: this.initialized && cronHealth.healthy,
        status: {
          scheduler: status,
          cronManager: cronHealth,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * @async
   * @method forceCleanup
   * @description Initiates a forceful cleanup of the scheduler. This stops all active jobs
   * immediately and resets the scheduler's initialization state. This method should be
   * used with caution, primarily in emergency situations where a graceful shutdown is not possible.
   * @returns {Promise<object>} A promise that resolves to an object indicating the success
   * or failure of the cleanup operation.
   * @returns {boolean} returns.success - True if force cleanup was successful, false otherwise.
   * @returns {string} returns.message - A descriptive message about the cleanup status.
   * @returns {string} [returns.error] - Error message if cleanup failed.
   */
  async forceCleanup() {
    try {
      logger.warn('Force cleanup initiated...');

      await cronManager.stopAllJobs(true); // Force stop

      // Reset initialization state
      this.initialized = false;

      logger.info('Force cleanup completed');
      return {
        success: true,
        message: 'Force cleanup completed',
      };
    } catch (error) {
      logger.error('Error during force cleanup:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * @async
   * @method executeWorkflowManually
   * @description Triggers the immediate execution of a specific workflow identified by its ID and user.
   * It first verifies the workflow's existence and active status before initiating execution.
   * @param {string} workflowId - The unique identifier of the workflow to execute.
   * @param {string} userId - The ID of the user who owns the workflow.
   * @param {string} [reason='Manual trigger'] - An optional reason for the manual execution.
   * @returns {Promise<object>} A promise that resolves to an object indicating the success
   * or failure of the manual execution, along with any data returned by the workflow executor.
   * @returns {boolean} returns.success - True if manual execution was initiated successfully, false otherwise.
   * @returns {object} [returns.data] - Data returned by the `workflowExecutor.executeWorkflow` method.
   * @returns {string} returns.message - A descriptive message about the execution status.
   * @returns {string} [returns.error] - Error message if execution failed or workflow not found/active.
   */
  async executeWorkflowManually(workflowId, userId, reason = 'Manual trigger') {
    try {
      logger.info(`Manual execution requested for workflow: ${workflowId}`);

      // Get workflow
      // Optimization: Added .lean() for performance as this document is read-only.
      // Indexing Recommendation: Consider a compound index on { workflowId: 1, userId: 1 } for this query.
      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId }).lean();

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      if (!workflow.isActive) {
        return {
          success: false,
          error: 'Workflow is not active',
        };
      }

      // Execute workflow
      const result = await workflowExecutor.executeWorkflow(
        workflow,
        'manual',
        `manual_trigger: ${reason}`
      );

      return {
        success: true,
        data: result,
        message: 'Manual execution started',
      };
    } catch (error) {
      logger.error(`Error in manual execution for ${workflowId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * @async
   * @method emergencyExecute
   * @description Executes a workflow immediately, potentially bypassing active status checks
   * if `overrideChecks` is set to true. This method is intended for critical situations
   * where a workflow must run regardless of its normal scheduling state.
   * @param {string} workflowId - The unique identifier of the workflow to execute.
   * @param {string} userId - The ID of the user who owns the workflow.
   * @param {boolean} [overrideChecks=false] - If true, the workflow will be executed even if it's not active.
   * @returns {Promise<object>} A promise that resolves to an object indicating the success
   * or failure of the emergency execution, along with any data returned by the workflow executor.
   * @returns {boolean} returns.success - True if emergency execution was completed successfully, false otherwise.
   * @returns {object} [returns.data] - Data returned by the `workflowExecutor.executeWorkflow` method.
   * @returns {string} returns.message - A descriptive message about the execution status.
   * @returns {string} [returns.error] - Error message if execution failed or workflow not found/active (without override).
   */
  async emergencyExecute(workflowId, userId, overrideChecks = false) {
    try {
      logger.warn(`Emergency execution for workflow: ${workflowId}`);

      // Optimization: Added .lean() for performance as this document is read-only.
      // Indexing Recommendation: Consider a compound index on { workflowId: 1, userId: 1 } for this query.
      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId }).lean();

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      // Skip normal checks if override is true
      if (!overrideChecks && !workflow.isActive) {
        return {
          success: false,
          error: 'Workflow is not active and overrideChecks is false',
        };
      }

      // Execute immediately
      const result = await workflowExecutor.executeWorkflow(
        workflow,
        'emergency',
        'emergency_trigger'
      );

      return {
        success: true,
        data: result,
        message: 'Emergency execution completed',
      };
    } catch (error) {
      logger.error(`Error in emergency execution for ${workflowId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

/**
 * @constant {SchedulerInitializer} schedulerInitializer
 * @description A singleton instance of the SchedulerInitializer class,
 * providing a centralized point of control for workflow scheduling throughout the application.
 */
export const schedulerInitializer = new SchedulerInitializer();
export default schedulerInitializer;