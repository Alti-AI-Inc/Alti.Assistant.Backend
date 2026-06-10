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
      // INTEGRATION NOTE: This is a system-level operation that loads all workflows for all tenants on startup.
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
              workflow._id.toString(), // Use the unique _id for scheduling
              workflow.cronExpression,
              workflow.userId,
              workflow.timezone || 'UTC'
            );

            if (result.success) {
              scheduledThisWorkflow = true;
              logger.info(
                `Scheduled workflow: ${workflow._id} (${workflow.name})`
              );
            } else {
              hadErrorThisWorkflow = true;
              logger.error(
                `Failed to schedule workflow ${workflow._id} (cron): ${result.error}`
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
              workflow._id.toString(), // Use the unique _id for scheduling
              workflow.oneTimeDate,
              workflow.userId,
              workflow.timezone || 'UTC'
            );



            if (result.success) {
              scheduledThisWorkflow = true;
              logger.info(
                `Scheduled one-time workflow: ${workflow._id} for ${workflow.oneTimeDate}`
              );
            } else {
              hadErrorThisWorkflow = true;
              logger.error(
                `Failed to schedule one-time workflow ${workflow._id}: ${result.error}`
              );
            }
          }
        } catch (workflowError) {
          hadErrorThisWorkflow = true;
          logger.error(
            `Error processing workflow ${workflow._id}:`,
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
   * from the database. This is a high-impact, global operation restricted to super administrators.
   * @param {object} caller - The authenticated user object making the request. Must be a super_admin.
   * @param {string} caller.role - The role of the calling user.
   * @returns {Promise<object>} A promise that resolves to an object indicating the success
   * or failure of the reload operation.
   */
  async reloadWorkflows(caller) {
    // SECURITY-FIX: This is a global, high-impact operation. It is now restricted to the super_admin role
    // to prevent lower-privileged users (like admins of one workspace) from disrupting the entire system.
    if (!caller || caller.role !== 'super_admin') {
      logger.error(`Unauthorized attempt to reload all workflows by user ${caller ? caller.id : 'unknown'} (role: ${caller ? caller.role : 'N/A'}).`);
      return {
        success: false,
        error: 'Permission denied. This operation is restricted to super administrators.',
      };
    }

    try {
      logger.info('Reloading scheduled workflows (initiated by super_admin)...');

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
   * @description Provides the current operational status of the scheduler.
   * @returns {object} An object containing various status metrics.
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
   * @returns {Promise<object>} A promise that resolves to an object indicating the health status.
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
   * immediately and resets the scheduler's initialization state.
   * @returns {Promise<object>} A promise that resolves to an object indicating the success
   * or failure of the cleanup operation.
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
   * @description Triggers the immediate execution of a specific workflow, ensuring the caller has permissions.
   * @param {object} caller - The authenticated user object making the request.
   * @param {string} caller.id - The ID of the calling user.
   * @param {string} caller.role - The role of the calling user (e.g., 'user', 'manager', 'admin', 'super_admin').
   * @param {string} caller.workspaceId - The workspace ID of the calling user.
   * @param {string} workflowId - The unique identifier (_id) of the workflow to execute.
   * @param {string} [reason='Manual trigger'] - An optional reason for the manual execution.
   * @returns {Promise<object>} A promise that resolves to an object indicating the success or failure.
   */
  async executeWorkflowManually(caller, workflowId, reason = 'Manual trigger') {
    try {
      logger.info(`Manual execution requested for workflow: ${workflowId} by user ${caller.id}`);

      // INTEGRATION-NOTE: Assumes the ScheduledWorkflow model contains a `workspaceId` field for multi-tenancy.
      const workflow = await ScheduledWorkflow.findById(workflowId).lean();

      if (!workflow) {
        return { success: false, error: 'Workflow not found' };
      }

      // SECURITY-FIX: Added comprehensive authorization checks to prevent IDOR and enforce role-based access.
      // This ensures users can only trigger their own workflows, while managers/admins are restricted to their workspace.
      const isOwner = workflow.userId.toString() === caller.id;
      const isSuperAdmin = caller.role === 'super_admin';
      const isAllowedByHierarchy =
        (caller.role === 'admin' || caller.role === 'manager') &&
        workflow.workspaceId && caller.workspaceId &&
        workflow.workspaceId.toString() === caller.workspaceId;

      if (!isOwner && !isSuperAdmin && !isAllowedByHierarchy) {
        logger.warn(`Authorization failed: User ${caller.id} (role: ${caller.role}) attempted to manually execute workflow ${workflowId} owned by ${workflow.userId}.`);
        return { success: false, error: 'Permission denied' };
      }

      if (!workflow.isActive) {
        return { success: false, error: 'Workflow is not active' };
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
   * @description Executes a workflow immediately, bypassing active status checks if needed.
   * This is a high-privilege action restricted to admins and super_admins.
   * @param {object} caller - The authenticated user object making the request.
   * @param {string} caller.id - The ID of the calling user.
   * @param {string} caller.role - The role of the calling user ('admin' or 'super_admin').
   * @param {string} caller.workspaceId - The workspace ID of the calling user.
   * @param {string} workflowId - The unique identifier (_id) of the workflow to execute.
   * @param {boolean} [overrideChecks=false] - If true, the workflow will be executed even if it's not active.
   * @returns {Promise<object>} A promise that resolves to an object indicating the success or failure.
   */
  async emergencyExecute(caller, workflowId, overrideChecks = false) {
    try {
      logger.warn(`Emergency execution for workflow: ${workflowId} by user ${caller.id}`);

      // INTEGRATION-NOTE: Assumes the ScheduledWorkflow model contains a `workspaceId` field for multi-tenancy.
      const workflow = await ScheduledWorkflow.findById(workflowId).lean();

      if (!workflow) {
        return { success: false, error: 'Workflow not found' };
      }

      // SECURITY-FIX: Stricter authorization for high-privilege emergency actions. Only admins (within their workspace)
      // and super_admins can perform this action, preventing misuse by lower-privileged roles.
      const isSuperAdmin = caller.role === 'super_admin';
      const isAdminOfWorkspace =
        caller.role === 'admin' &&
        workflow.workspaceId && caller.workspaceId &&
        workflow.workspaceId.toString() === caller.workspaceId;

      if (!isSuperAdmin && !isAdminOfWorkspace) {
        logger.warn(`Authorization failed: User ${caller.id} (role: ${caller.role}) attempted an emergency execution of workflow ${workflowId}.`);
        return { success: false, error: 'Permission denied for emergency execution' };
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