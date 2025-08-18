import { schedulerInitializer } from './services/schedulerInitializer.service.js';
import { cronManager } from './services/cronManager.service.js';
import { queueManager } from './services/queueManager.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Initialize the workflow scheduling system
 * Call this function during application startup
 */
export const initializeWorkflowScheduler = async (config = {}) => {
  try {
    logger.info('Initializing Composio v2 workflow scheduling system...');

    // Initialize queue manager first
    const queueResult = await queueManager.initialize(config.queue || {});
    if (!queueResult.success) {
      throw new Error(`Queue manager initialization failed: ${queueResult.error}`);
    }

    // Initialize scheduler
    const schedulerResult = await schedulerInitializer.initialize();
    if (!schedulerResult.success) {
      throw new Error(`Scheduler initialization failed: ${schedulerResult.error}`);
    }

    logger.info('Workflow scheduling system initialized successfully');
    logger.info(`Active scheduled workflows: ${schedulerResult.scheduledWorkflows}`);

    return {
      success: true,
      message: 'Workflow scheduling system initialized',
      data: {
        scheduler: schedulerResult,
        queue: queueResult
      }
    };

  } catch (error) {
    logger.error('Failed to initialize workflow scheduling system:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get system status
 */
export const getSystemStatus = () => {
  return {
    scheduler: schedulerInitializer.getStatus(),
    queue: queueManager.getQueueStatus(),
    cronManager: cronManager.getStatus(),
    timestamp: new Date().toISOString()
  };
};

/**
 * Perform health check
 */
export const healthCheck = async () => {
  try {
    const schedulerHealth = await schedulerInitializer.healthCheck();
    const queueHealth = queueManager.healthCheck();
    const cronHealth = await cronManager.healthCheck();

    const overallHealth = schedulerHealth.healthy && queueHealth.healthy && cronHealth.healthy;

    return {
      healthy: overallHealth,
      components: {
        scheduler: schedulerHealth,
        queue: queueHealth,
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
};

/**
 * Graceful shutdown
 */
export const shutdownWorkflowScheduler = async () => {
  try {
    logger.info('Shutting down workflow scheduling system...');

    // Stop queue manager first
    await queueManager.stop();

    // Stop cron manager
    await cronManager.gracefulShutdown();

    logger.info('Workflow scheduling system shutdown complete');
    return {
      success: true,
      message: 'Workflow scheduling system shutdown complete'
    };

  } catch (error) {
    logger.error('Error during workflow scheduler shutdown:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Export services for direct access if needed
export { schedulerInitializer, cronManager, queueManager };
