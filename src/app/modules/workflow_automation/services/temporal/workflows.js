/**
 * Stateful, durable Temporal Workflow that orchestrates step-by-step automation execution.
 * Fuses concurrent parallel Directed Acyclic Graph (DAG) scheduling, automatic retries,
 * and the transactional Saga pattern for compensating rollbacks.
 * 
 * @param {object} workflow - The full workflow document payload containing steps.
 * @param {string} userId - User identifier.
 * @param {object} context - Starting workflow runtime context.
 * @param {number} startStepIndex - Index of the step to start from (default 0).
 * @returns {Promise<object>} Execution report summary.
 */
export async function runDurableWorkflow(workflow, userId, context = {}, startStepIndex = 0) {
  const steps = [...workflow.steps];
  
  // Sort baseline to establish order
  steps.sort((a, b) => a.order - b.order);
  
  // Auto-inject sequential dependency paths if dependsOn is missing (100% backward compatible)
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].dependsOn === undefined) {
      if (i > 0) {
        steps[i].dependsOn = [steps[i - 1].stepId];
      } else {
        steps[i].dependsOn = [];
      }
    }
  }

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

  const stepStatuses = {};
  steps.forEach((step, idx) => {
    if (idx < startStepIndex) {
      stepStatuses[step.stepId] = 'completed';
    } else {
      stepStatuses[step.stepId] = 'pending';
    }
  });

  try {
    while (true) {
      const pendingSteps = steps.filter((s) => stepStatuses[s.stepId] === 'pending');
      
      if (pendingSteps.length === 0) {
        break; // All steps completed
      }

      // Find steps whose dependencies are all successfully completed
      const eligibleSteps = pendingSteps.filter((step) => {
        return step.dependsOn.every((depId) => stepStatuses[depId] === 'completed');
      });

      if (eligibleSteps.length === 0) {
        throw new Error('Cyclic dependency or deadlock detected in Temporal workflow steps.');
      }

      // Schedule all eligible steps concurrently (durable Promise.all)
      const executionPromises = eligibleSteps.map(async (step) => {
        stepStatuses[step.stepId] = 'running';
        
        // Execute the step activity durably (will automatically retry on transient failure)
        const stepResult = await activities.executeWorkflowStepActivity(step, currentContext, userId);
        
        if (stepResult.success) {
          stepStatuses[step.stepId] = 'completed';
          
          // Register compensating rollback activity to the Saga stack
          sagaStack.push({ step, stepResult });
          
          // Update context with step results
          currentContext = { ...currentContext, ...stepResult.contextUpdates };
        } else {
          stepStatuses[step.stepId] = 'failed';
          throw new Error(`Step ${step.stepId} (${step.app}.${step.action}) returned unsuccessful status.`);
        }
      });

      await Promise.all(executionPromises);
    }
    
    return {
      success: true,
      status: 'completed',
      summary: `Durable Temporal parallel DAG run successfully completed ${steps.length} steps.`,
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

export { runDatasetIngestionWorkflow } from '../../../datasets/temporal/ingestionWorkflow.js';


