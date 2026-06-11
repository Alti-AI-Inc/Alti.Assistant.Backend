/**
 * @file Defines the core Temporal Workflow for durable, stateful automation execution.
 * @module app/modules/workflow_automation/services/temporal/workflows
 */

/**
 * Represents a single step within a workflow document.
 * @typedef {object} WorkflowStep
 * @property {string} stepId - A unique identifier for the step.
 * @property {number} order - The baseline execution order.
 * @property {Array<string>} [dependsOn] - An array of `stepId`s that this step depends on. If omitted, sequential dependency is inferred from the `order`.
 * @property {string} app - The application or service to call (e.g., 'openai', 'google_sheets').
 * @property {string} action - The action to perform within the app (e.g., 'generateText', 'appendRow').
 * @property {string} stepType - The type of step (e.g., 'action', 'condition').
 * @property {boolean} [continueOnError=false] - If true, the workflow continues even if this step fails.
 * @property {object} [retryPolicy] - Custom retry policy for this step.
 * @property {number} [retryPolicy.initialIntervalMs] - Initial retry interval in milliseconds.
 * @property {number} [retryPolicy.backoffCoefficient] - The backoff coefficient for subsequent retries.
 * @property {number} [retryPolicy.maxDelayMs] - The maximum retry interval in milliseconds.
 * @property {number} [retryPolicy.maxAttempts] - The maximum number of retry attempts.
 */

/**
 * Represents the full workflow document payload.
 * @typedef {object} WorkflowDocument
 * @property {Array<WorkflowStep>} steps - An array of step objects to be executed.
 */

/**
 * Represents the final execution report of a workflow.
 * @typedef {object} WorkflowExecutionReport
 * @property {boolean} success - Indicates if the workflow completed without unhandled errors.
 * @property {string} status - The final status of the workflow (e.g., 'completed').
 * @property {string} summary - A human-readable summary of the execution result.
 * @property {object} context - The final, mutated context object after all steps have run.
 */

/**
 * A stateful, durable Temporal Workflow that orchestrates step-by-step automation execution.
 * This orchestrator fuses several advanced patterns:
 * 1.  **Directed Acyclic Graph (DAG) Scheduling**: Executes steps with defined dependencies in parallel whenever possible, maximizing throughput. It also auto-infers sequential dependencies if none are provided.
 * 2.  **Automatic Retries**: Leverages Temporal's built-in retry mechanism with exponential backoff for transient failures, enhancing resilience.
 * 3.  **Saga Pattern**: Implements a transactional rollback mechanism. If a step fails, it triggers compensating actions for all previously completed steps in reverse order, ensuring data consistency.
 * 4.  **Dynamic Activity Loading**: Switches between real Temporal proxied activities and local mock implementations based on environment variables, enabling robust offline testing.
 *
 * @param {WorkflowDocument} workflow - The full workflow document payload containing the steps to execute.
 * @param {string} userId - The identifier of the user initiating the workflow. Used for auditing and permissions within activities.
 * @param {object} [context={}] - The initial runtime context for the workflow. This object is passed to and can be modified by each step.
 * @param {number} [startStepIndex=0] - The index of the step (based on initial sort order) from which to begin execution. Useful for resuming workflows.
 * @returns {Promise<WorkflowExecutionReport>} A promise that resolves to an execution report summary upon successful completion.
 * @throws {Error} If a step fails and `continueOnError` is false, or if a cyclic dependency/deadlock is detected. The error message will contain details about the failure and the Saga compensation results.
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

  const executionId = currentContext._executionId;
  if (executionId) {
    await activities.updateExecutionToRunningActivity(executionId, steps.length);
  }

  try {
    while (true) {
      // Resolve steps that should be skipped because all of their dependencies are skipped
      for (const step of steps) {
        if (stepStatuses[step.stepId] === 'pending' && step.dependsOn.length > 0) {
          const allDepsSkipped = step.dependsOn.every((dep) => {
            let depId = dep;
            if (dep.includes('.')) {
              depId = dep.split('.')[0];
            }
            return stepStatuses[depId] === 'skipped';
          });
          if (allDepsSkipped) {
            stepStatuses[step.stepId] = 'skipped';
            if (executionId) {
              await activities.skipWorkflowStepActivity(executionId, step.stepId, 'All parent dependencies were skipped.');
            }
          }
        }
      }

      const pendingSteps = steps.filter((s) => stepStatuses[s.stepId] === 'pending');
      
      if (pendingSteps.length === 0) {
        break; // All steps completed
      }

      // Find steps whose dependencies are all completed or skipped
      const eligibleSteps = pendingSteps.filter((step) => {
        return step.dependsOn.every((dep) => {
          let depId = dep;
          if (dep.includes('.')) {
            depId = dep.split('.')[0];
          }
          return stepStatuses[depId] === 'completed' || stepStatuses[depId] === 'skipped';
        });
      });

      if (eligibleSteps.length === 0) {
        throw new Error('Cyclic dependency or deadlock detected in Temporal workflow steps.');
      }

      // Keep a temporary map of context updates for the current concurrent layer to prevent thread-unsafe context overrides
      const layerContextUpdates = {};

      // Schedule all eligible steps concurrently (durable Promise.all)
      const executionPromises = eligibleSteps.map(async (step) => {
        stepStatuses[step.stepId] = 'running';
        
        try {
          let stepActivities = activities;
          if (!isMock && step.retryPolicy) {
            const { proxyActivities } = await import('@temporalio/workflow');
            stepActivities = proxyActivities({
              startToCloseTimeout: '15 minutes',
              retry: {
                initialInterval: step.retryPolicy.initialIntervalMs ? `${step.retryPolicy.initialIntervalMs}ms` : '2s',
                backoffCoefficient: step.retryPolicy.backoffCoefficient || 2,
                maximumInterval: step.retryPolicy.maxDelayMs ? `${step.retryPolicy.maxDelayMs}ms` : '1 minute',
                maximumAttempts: step.retryPolicy.maxAttempts || 3
              }
            });
          }
          // Execute the step activity durably (will automatically retry on transient failure)
          const stepResult = await stepActivities.executeWorkflowStepActivity(step, currentContext, userId);
          
          if (stepResult.success) {
            stepStatuses[step.stepId] = 'completed';
            
            // Register compensating rollback activity to the Saga stack (if not condition step)
            if (step.stepType !== 'condition') {
              sagaStack.push({ step, stepResult });
            }
            
            // Accumulate context updates for this step
            Object.assign(layerContextUpdates, stepResult.contextUpdates || {});

            // Handle branching cascade skipping if condition or step has evaluation
            if (step.stepType === 'condition' || (stepResult && stepResult.evaluation !== undefined)) {
              const evaluation = stepResult.evaluation;
              
              const cascadeSkip = async (skippedStepId) => {
                const stepsToSkip = steps.filter(s => 
                  s.dependsOn.some(dep => dep === skippedStepId || dep.startsWith(skippedStepId + '.')) &&
                  stepStatuses[s.stepId] === 'pending'
                );
                for (const s of stepsToSkip) {
                  stepStatuses[s.stepId] = 'skipped';
                  if (executionId) {
                    await activities.skipWorkflowStepActivity(executionId, s.stepId, `Skipped because branch parent step ${skippedStepId} was skipped.`);
                  }
                  await cascadeSkip(s.stepId);
                }
              };

              if (typeof evaluation === 'boolean') {
                if (evaluation === true) {
                  // Skip steps depending on step.stepId.false
                  for (const s of steps) {
                    if (s.dependsOn.includes(`${step.stepId}.false`) && stepStatuses[s.stepId] === 'pending') {
                      stepStatuses[s.stepId] = 'skipped';
                      if (executionId) {
                        await activities.skipWorkflowStepActivity(executionId, s.stepId, `Condition evaluated to true, skipping false branch.`);
                      }
                      await cascadeSkip(s.stepId);
                    }
                  }
                } else {
                  // Skip steps depending on step.stepId.true or step.stepId (default)
                  for (const s of steps) {
                    if ((s.dependsOn.includes(`${step.stepId}.true`) || s.dependsOn.includes(step.stepId)) && stepStatuses[s.stepId] === 'pending') {
                      stepStatuses[s.stepId] = 'skipped';
                      if (executionId) {
                        await activities.skipWorkflowStepActivity(executionId, s.stepId, `Condition evaluated to false, skipping true branch.`);
                      }
                      await cascadeSkip(s.stepId);
                    }
                  }
                }
              } else if (typeof evaluation === 'string') {
                const selectedRoute = evaluation;
                const prefix = `${step.stepId}.`;
                for (const s of steps) {
                  if (stepStatuses[s.stepId] === 'pending') {
                    const hasNonMatchingDep = s.dependsOn.some(dep => 
                      dep.startsWith(prefix) && dep.slice(prefix.length) !== selectedRoute
                    );
                    if (hasNonMatchingDep) {
                      stepStatuses[s.stepId] = 'skipped';
                      if (executionId) {
                        await activities.skipWorkflowStepActivity(executionId, s.stepId, `AI Router evaluated to '${selectedRoute}', skipping non-matching branch.`);
                      }
                      await cascadeSkip(s.stepId);
                    }
                  }
                }
              }
            }
          } else {
            if (step.continueOnError === true) {
              stepStatuses[step.stepId] = 'completed'; // Treat as completed to bypass failure
              console.warn(`[Temporal Executor] Step ${step.stepId} (${step.app}.${step.action}) returned unsuccessful status, but continueOnError is true. Bypassing.`);
            } else {
              stepStatuses[step.stepId] = 'failed';
              throw new Error(`Step ${step.stepId} (${step.app}.${step.action}) returned unsuccessful status.`);
            }
          }
        } catch (stepError) {
          if (step.continueOnError === true) {
            stepStatuses[step.stepId] = 'completed'; // Treat as completed to bypass failure
            console.warn(`[Temporal Executor] Step ${step.stepId} (${step.app}.${step.action}) threw error, but continueOnError is true. Bypassing. Error: ${stepError.message}`);
          } else {
            stepStatuses[step.stepId] = 'failed';
            throw stepError; // Fail the Promise.all and trigger Sagas
          }
        }
      });

      await Promise.all(executionPromises);

      // Merge all accumulated layer updates into the primary context safely
      currentContext = { ...currentContext, ...layerContextUpdates };
    }

    const stepReports = Object.keys(stepStatuses).map(stepId => ({
      stepId,
      success: stepStatuses[stepId] === 'completed',
    }));
    const completedSteps = stepReports.filter(r => r.success).length;
    const failedSteps = stepReports.filter(r => !r.success).length;

    if (executionId) {
      await activities.completeExecutionActivity(
        executionId,
        `Durable Temporal parallel DAG completed successfully: ${completedSteps}/${steps.length} steps complete.`,
        currentContext,
        completedSteps,
        failedSteps
      );
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

    if (executionId) {
      await activities.failExecutionActivity(executionId, error.message, error.stack);
    }

    // Rethrow original error so the Temporal workflow is marked as failed, maintaining correct state
    throw new Error(`Workflow execution failed: ${error.message}. Sagas Executed: ${JSON.stringify(compensationReports)}`);
  }
}

/**
 * Re-exports the stateful, durable Temporal Workflow for dataset ingestion.
 * @see {@link module:app/modules/datasets/temporal/ingestionWorkflow.runDatasetIngestionWorkflow}
 */
export { runDatasetIngestionWorkflow } from '../../../datasets/temporal/ingestionWorkflow.js';

/**
 * Re-exports the stateful, durable Temporal Workflow for resilient RAG (Retrieval-Augmented Generation) ingestion.
 * @see {@link module:app/modules/llamaindex/temporal/ragIngestionWorkflow.resilientRAGIngestionWorkflow}
 */
export { resilientRAGIngestionWorkflow } from '../../../llamaindex/temporal/ragIngestionWorkflow.js';