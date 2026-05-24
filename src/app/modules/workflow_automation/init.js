import { workflowExecutionService } from './services/workflowExecution.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Initialize the workflow automation module
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
 * Cleanup function for graceful shutdown
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
