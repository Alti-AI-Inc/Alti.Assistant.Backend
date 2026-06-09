import { workflowExecutionService } from './services/workflowExecution.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Initializes the workflow automation module by setting up scheduled workflows
 * and dynamic Google Cloud Platform (GCP) event triggers.
 * This function should be called once during application startup to ensure all
 * automation components are active and ready.
 *
 * @async
 * @function initializeWorkflowAutomation
 * @returns {Promise<void>} A promise that resolves when the module is successfully initialized.
 * @throws {Error} If an error occurs during the initialization process, such as issues
 *   with scheduling workflows or setting up GCP Pub/Sub triggers. The error is re-thrown
 *   to propagate startup failures.
 */
export const initializeWorkflowAutomation = async () => {
  try {
    logger.info('Initializing Workflow Automation module...');

    // Initialize scheduled workflows
    await workflowExecutionService.initializeScheduledWorkflows();

    // Initialize dynamic GCP event triggers
    const { gcpEventsService } = await import('./services/gcpEvents.service.js');
    await gcpEventsService.initializePubSubTriggers();

    logger.info('Workflow Automation module initialized successfully');
  } catch (error) {
    logger.error('Error initializing Workflow Automation module:', error);
    throw error;
  }
};

/**
 * Performs cleanup operations for the workflow automation module during application shutdown.
 * This includes stopping all active scheduled jobs managed by `workflowExecutionService`
 * and releasing dynamic GCP Pub/Sub subscription listeners managed by `gcpEventsService`.
 * This function aims for a graceful shutdown, preventing resource leaks.
 *
 * @function cleanupWorkflowAutomation
 * @returns {void}
 */
export const cleanupWorkflowAutomation = () => {
  try {
    logger.info('Cleaning up Workflow Automation module...');

    // Stop all scheduled jobs
    workflowExecutionService.scheduledJobs.forEach((job, workflowId) => {
      job.stop();
      logger.info(`Stopped scheduled job for workflow: ${workflowId}`);
    });

    workflowExecutionService.scheduledJobs.clear();

    // Release all active dynamic GCP Pub/Sub subscription listeners
    import('./services/gcpEvents.service.js').then(({ gcpEventsService }) => {
      gcpEventsService.activeSubscriptions.forEach((sub, workflowId) => {
        gcpEventsService.unregisterPubSubTrigger(workflowId).catch(err => {
          logger.warn(`Failed to release dynamic GCP event subscription for workflow ${workflowId}: ${err.message}`);
        });
      });
    });

    logger.info('Workflow Automation module cleanup completed');
  } catch (error) {
    logger.error('Error during Workflow Automation cleanup:', error);
  }
};