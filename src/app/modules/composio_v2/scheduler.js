import { schedulerInitializer } from './services/schedulerInitializer.service.js';
import { cronManager } from './services/cronManager.service.js';
import { queueManager } from './services/queueManager.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * @typedef {object} WorkflowSchedulerConfig
 * @property {object} [queue] - Configuration for the queue manager.
 * @property {string} [queue.connectionString] - Connection string for the queue.
 * // Add more specific queue config properties if known, otherwise keep it general.
 */

/**
 * @typedef {object} SchedulerInitializationResult
 * @property {boolean} success - Indicates if the initialization was successful.
 * @property {string} message - A descriptive message about the initialization status.
 * @property {object} [data] - Contains detailed results if successful.
 * @property {object} [data.scheduler] - Result from `schedulerInitializer.initialize()`.
 * @property {boolean} data.scheduler.success - True if scheduler initialized.
 * @property {string} [data.scheduler.error] - Error message if scheduler initialization failed.
 * @property {number} data.scheduler.scheduledWorkflows - Number of workflows scheduled.
 * @property {object} [data.queue] - Result from `queueManager.initialize()`.
 * @property {boolean} data.queue.success - True if queue manager initialized.
 * @property {string} [data.queue.error] - Error message if queue manager initialization failed.
 * @property {string} [error] - An error message if the overall initialization failed.
 */

/**
 * Initializes the Composio v2 workflow scheduling system.
 * This function should be called during application startup to set up the necessary
 * queue and scheduler components. It ensures that the system is ready to process
 * and manage scheduled workflows.
 *
 * @param {WorkflowSchedulerConfig} [config={}] - Optional configuration object for the scheduler components.
 * @returns {Promise<SchedulerInitializationResult>} A promise that resolves to an object indicating the success or failure of the initialization,
 *   along with relevant data or an error message.
 */
export const initializeWorkflowScheduler = async (config = {}) => {
  try {
    logger.info('Initializing Composio v2 workflow scheduling system...');

    // Initialize queue manager first
    const queueResult = await queueManager.initialize(config.queue || {});
    if (!queueResult.success) {
      throw new Error(
        `Queue manager initialization failed: ${queueResult.error}`
      );
    }

    // Initialize scheduler
    const schedulerResult = await schedulerInitializer.initialize();
    if (!schedulerResult.success) {
      throw new Error(
        `Scheduler initialization failed: ${schedulerResult.error}`
      );
    }

    logger.info('Workflow scheduling system initialized successfully');
    logger.info(
      `Active scheduled workflows: ${schedulerResult.scheduledWorkflows}`
    );

    return {
      success: true,
      message: 'Workflow scheduling system initialized',
      data: {
        scheduler: schedulerResult,
        queue: queueResult,
      },
    };
  } catch (error) {
    logger.error('Failed to initialize workflow scheduling system:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * @typedef {object} SystemStatusResult
 * @property {object} scheduler - Status information from the scheduler initializer.
 * @property {object} queue - Status information from the queue manager.
 * @property {object} cronManager - Status information from the cron manager.
 * @property {string} timestamp - ISO 8601 formatted timestamp of when the status was retrieved.
 */

/**
 * Retrieves the current operational status of the workflow scheduling system components.
 * This includes the status of the scheduler, queue manager, and cron manager.
 *
 * @returns {SystemStatusResult} An object containing the status of each component and a timestamp.
 */
export const getSystemStatus = () => {
  return {
    scheduler: schedulerInitializer.getStatus(),
    queue: queueManager.getQueueStatus(),
    cronManager: cronManager.getStatus(),
    timestamp: new Date().toISOString(),
  };
};

/**
 * @typedef {object} ComponentHealth
 * @property {boolean} healthy - Indicates if the component is healthy.
 * @property {string} [message] - A descriptive message about the component's health.
 * @property {object} [details] - Additional health details specific to the component.
 */

/**
 * @typedef {object} HealthCheckResult
 * @property {boolean} healthy - Overall health status of the system (true if all components are healthy).
 * @property {object} components - Health status for individual components.
 * @property {ComponentHealth} components.scheduler - Health status of the scheduler.
 * @property {ComponentHealth} components.queue - Health status of the queue manager.
 * @property {ComponentHealth} components.cronManager - Health status of the cron manager.
 * @property {string} timestamp - ISO 8601 formatted timestamp of when the health check was performed.
 * @property {string} [error] - An error message if the health check itself failed.
 */

/**
 * Performs a comprehensive health check across all core components of the workflow scheduling system.
 * This includes checking the health of the scheduler, queue manager, and cron manager.
 *
 * @returns {Promise<HealthCheckResult>} A promise that resolves to an object detailing the overall system health
 *   and the health status of each individual component.
 */
export const healthCheck = async () => {
  try {
    const schedulerHealth = await schedulerInitializer.healthCheck();
    // Bug fix: queueManager.healthCheck() should be awaited as it likely returns a Promise,
    // similar to other health check calls.
    const queueHealth = await queueManager.healthCheck();
    const cronHealth = await cronManager.healthCheck();

    const overallHealth =
      schedulerHealth.healthy && queueHealth.healthy && cronHealth.healthy;

    return {
      healthy: overallHealth,
      components: {
        scheduler: schedulerHealth,
        queue: queueHealth,
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
};

/**
 * @typedef {object} ShutdownResult
 * @property {boolean} success - Indicates if the shutdown was successful.
 * @property {string} message - A descriptive message about the shutdown status.
 * @property {string} [error] - An error message if the shutdown failed.
 */

/**
 * Initiates a graceful shutdown of the Composio v2 workflow scheduling system.
 * This involves stopping the queue manager, cron manager, and scheduler initializer
 * to ensure all resources are released properly and ongoing operations are concluded.
 *
 * @returns {Promise<ShutdownResult>} A promise that resolves to an object indicating the success or failure of the shutdown.
 */
export const shutdownWorkflowScheduler = async () => {
  try {
    logger.info('Shutting down workflow scheduling system...');

    // Stop queue manager first
    await queueManager.stop();

    // Stop cron manager
    await cronManager.gracefulShutdown();

    // Bug fix: schedulerInitializer is initialized but not explicitly stopped.
    // Assuming schedulerInitializer manages resources that need cleanup,
    // a corresponding stop method should be called for a graceful shutdown.
    // If schedulerInitializer does not have a 'stop' method, this implies
    // the underlying service needs to be updated to provide one.
    await schedulerInitializer.stop();

    logger.info('Workflow scheduling system shutdown complete');
    return {
      success: true,
      message: 'Workflow scheduling system shutdown complete',
    };
  } catch (error) {
    logger.error('Error during workflow scheduler shutdown:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Core service managers for the Composio v2 workflow scheduling system.
 * These modules provide functionalities for initializing, managing, and interacting
 * with the scheduler, cron tasks, and message queue.
 * @property {object} schedulerInitializer - Manages the initialization and status of the core workflow scheduler.
 * @property {object} cronManager - Manages cron-based scheduling and tasks.
 * @property {object} queueManager - Manages the message queue for workflow processing.
 */
export { schedulerInitializer, cronManager, queueManager };