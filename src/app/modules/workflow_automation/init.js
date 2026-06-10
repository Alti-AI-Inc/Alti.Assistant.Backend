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

    // Initialize scheduled workflows.
    // INTEGRATION_NOTE: The service implementation must ensure it only initializes workflows for active tenants/workspaces.
    await workflowExecutionService.initializeScheduledWorkflows();

    // Initialize dynamic GCP event triggers.
    const { gcpEventsService } = await import('./services/gcpEvents.service.js');
    // INTEGRATION_NOTE: The service implementation must respect tenant boundaries and only initialize triggers for active workflows.
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
 * @async
 * @function cleanupWorkflowAutomation
 * @returns {Promise<void>} A promise that resolves when cleanup is complete.
 */
export const cleanupWorkflowAutomation = async () => {
  try {
    logger.info('Cleaning up Workflow Automation module...');

    // Stop all scheduled jobs
    workflowExecutionService.scheduledJobs.forEach((job, workflowId) => {
      job.stop();
      logger.info(`Stopped scheduled job for workflow: ${workflowId}`);
    });

    workflowExecutionService.scheduledJobs.clear();

    // Release all active dynamic GCP Pub/Sub subscription listeners.
    // This was made async to prevent a race condition where the app would exit before cleanup completed.
    const { gcpEventsService } = await import('./services/gcpEvents.service.js');
    
    const activeSubscriptionEntries = Array.from(gcpEventsService.activeSubscriptions.entries());
    if (activeSubscriptionEntries.length > 0) {
        const unregisterPromises = activeSubscriptionEntries.map(([workflowId]) => 
            gcpEventsService.unregisterPubSubTrigger(workflowId)
        );

        // Await all cleanup promises to ensure they complete before the process exits.
        // Using Promise.allSettled allows the cleanup to continue even if one unregister call fails.
        const results = await Promise.allSettled(unregisterPromises);

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const [workflowId] = activeSubscriptionEntries[index];
                logger.warn(`Failed to release dynamic GCP event subscription for workflow ${workflowId}: ${result.reason?.message || result.reason}`);
            }
        });
        
        gcpEventsService.activeSubscriptions.clear();
    }

    logger.info('Workflow Automation module cleanup completed');
  } catch (error) {
    logger.error('Error during Workflow Automation cleanup:', error);
    // Do not re-throw during shutdown to allow other cleanup handlers to execute.
  }
};