import { logger } from '../../../../shared/logger.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import { cronManager } from './cronManager.service.js';
import workflowExecutor from './workflowExecutor.service.js';

/**
 * Scheduler Initialization Service - Handles app startup and shutdown for workflows
 */
class SchedulerInitializer {
  
  constructor() {
    this.initialized = false;
    this.gracefulShutdownHandlers = [];
  }

  /**
   * Initialize scheduler on app startup
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
        scheduledWorkflows: cronManager.getActiveJobsCount()
      };

    } catch (error) {
      logger.error('Error initializing scheduler:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Load active workflows from database and schedule them
   */
  async loadActiveWorkflows() {
    try {
      logger.info('Loading active scheduled workflows...');

      // Get all active scheduled workflows
      const activeWorkflows = await ScheduledWorkflow.find({
        isActive: true,
        nextRun: { $gt: new Date() } // Only workflows with future runs
      });

      let scheduledCount = 0;
      let errorCount = 0;

      for (const workflow of activeWorkflows) {
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
              scheduledCount++;
              logger.info(`Scheduled workflow: ${workflow.workflowId} (${workflow.name})`);
            } else {
              errorCount++;
              logger.error(`Failed to schedule workflow ${workflow.workflowId}: ${result.error}`);
            }
          }

          // Schedule one-time runs
          if (workflow.oneTimeRun && workflow.oneTimeDate && workflow.oneTimeDate > new Date()) {
            const result = await cronManager.scheduleOneTimeWorkflow(
              workflow.workflowId,
              workflow.oneTimeDate,
              workflow.userId,
              workflow.timezone || 'UTC'
            );

            if (result.success) {
              scheduledCount++;
              logger.info(`Scheduled one-time workflow: ${workflow.workflowId} for ${workflow.oneTimeDate}`);
            } else {
              errorCount++;
              logger.error(`Failed to schedule one-time workflow ${workflow.workflowId}: ${result.error}`);
            }
          }

        } catch (workflowError) {
          errorCount++;
          logger.error(`Error processing workflow ${workflow.workflowId}:`, workflowError);
        }
      }

      logger.info(`Loaded ${activeWorkflows.length} workflows, scheduled ${scheduledCount}, errors: ${errorCount}`);

      return {
        total: activeWorkflows.length,
        scheduled: scheduledCount,
        errors: errorCount
      };

    } catch (error) {
      logger.error('Error loading active workflows:', error);
      throw error;
    }
  }

  /**
   * Setup graceful shutdown handling
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
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });
  }

  /**
   * Add shutdown handler
   */
  addShutdownHandler(handler) {
    if (typeof handler === 'function') {
      this.gracefulShutdownHandlers.push(handler);
    }
  }

  /**
   * Reload workflows (useful for runtime updates)
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
        message: 'Workflows reloaded successfully'
      };

    } catch (error) {
      logger.error('Error reloading workflows:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      cronManagerStatus: cronManager.getStatus(),
      activeJobs: cronManager.getActiveJobsCount(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      shutdownHandlers: this.gracefulShutdownHandlers.length
    };
  }

  /**
   * Health check for scheduler
   */
  async healthCheck() {
    try {
      const status = this.getStatus();
      const cronHealth = await cronManager.healthCheck();

      return {
        healthy: this.initialized && cronHealth.healthy,
        status: {
          scheduler: status,
          cronManager: cronHealth
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Force cleanup (for emergency situations)
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
        message: 'Force cleanup completed'
      };

    } catch (error) {
      logger.error('Error during force cleanup:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Manual workflow execution trigger
   */
  async executeWorkflowManually(workflowId, userId, reason = 'Manual trigger') {
    try {
      logger.info(`Manual execution requested for workflow: ${workflowId}`);

      // Get workflow
      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId });
      
      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found'
        };
      }

      if (!workflow.isActive) {
        return {
          success: false,
          error: 'Workflow is not active'
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
        message: 'Manual execution started'
      };

    } catch (error) {
      logger.error(`Error in manual execution for ${workflowId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Emergency workflow execution (bypasses normal scheduling)
   */
  async emergencyExecute(workflowId, userId, overrideChecks = false) {
    try {
      logger.warn(`Emergency execution for workflow: ${workflowId}`);

      const workflow = await ScheduledWorkflow.findOne({ workflowId, userId });
      
      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found'
        };
      }

      // Skip normal checks if override is true
      if (!overrideChecks && !workflow.isActive) {
        return {
          success: false,
          error: 'Workflow is not active and overrideChecks is false'
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
        message: 'Emergency execution completed'
      };

    } catch (error) {
      logger.error(`Error in emergency execution for ${workflowId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const schedulerInitializer = new SchedulerInitializer();
export default schedulerInitializer;
