/**
 * Stateful, durable Temporal Workflow that orchestrates step-by-step automation execution.
 * Fuses automatic retries and the transactional Saga pattern for compensating rollbacks.
 * 
 * @param {object} workflow - The full workflow document payload containing steps.
 * @param {string} userId - User identifier.
 * @param {object} context - Starting workflow runtime context.
 * @param {number} startStepIndex - Index of the step to start from (default 0).
 * @returns {Promise<object>} Execution report summary.
 */
export async function runDurableWorkflow(workflow, userId, context = {}, startStepIndex = 0) {
  const steps = workflow.steps.sort((a, b) => a.order - b.order);
  const sagaStack = []; // Stack to record successful actions for compensating rollbacks
  let currentContext = { ...context };

  // Resolve activities dynamically to support both production Temporal worker execution
  // and local mock tests under offline environments.
  let activities;
  const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');

  if (isMock) {
    // Dynamic import to prevent Temporal compiler from loading heavy I/O modules in production
    activities = await import('./activities.js');
  } else {
    const { proxyActivities } = await import('@temporalio/workflow');
    activities = proxyActivities({
      startToCloseTimeout: '15 minutes',
      retry: {
        initialInterval: '2s',
        backoffCoefficient: 2,
        maximumInterval: '1 minute',
        maximumAttempts: 3
      }
    });
  }

  try {
    for (let i = startStepIndex; i < steps.length; i++) {
      const step = steps[i];
      
      // Execute the step activity durably (will automatically retry on transient failure)
      const stepResult = await activities.executeWorkflowStepActivity(step, currentContext, userId);
      
      if (stepResult.success) {
        // Register compensating rollback activity to the Saga stack in case a later step fails
        sagaStack.push({ step, stepResult });
        
        // Update context with step results
        currentContext = { ...currentContext, ...stepResult.contextUpdates };
      } else {
        throw new Error(`Step ${step.stepId} (${step.app}.${step.action}) returned unsuccessful status.`);
      }
    }
    
    return {
      success: true,
      status: 'completed',
      summary: `Durable Temporal run successfully completed ${steps.length} steps.`,
      context: currentContext
    };
  } catch (error) {
    // A step failed! Trigger Saga Compensating Rollback sequence in reverse order!
    console.error(`[Temporal Saga Orchestrator] Critical step failure: ${error.message}. Initiating rollback transactions...`);
    
    const compensationReports = [];
    while (sagaStack.length > 0) {
      const { step, stepResult } = sagaStack.pop();
      try {
        const rollbackResult = await activities.rollbackWorkflowStepActivity(step, stepResult, userId);
        compensationReports.push(rollbackResult);
      } catch (rollbackError) {
        console.error(`[Temporal Saga Orchestrator] Failed to execute compensating rollback for step ${step.stepId}: ${rollbackError.message}`);
      }
    }

    // Rethrow original error so the Temporal workflow is marked as failed, maintaining correct state
    throw new Error(`Workflow execution failed: ${error.message}. Sagas Executed: ${JSON.stringify(compensationReports)}`);
  }
}

