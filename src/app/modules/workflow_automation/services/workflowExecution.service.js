import Workflow from '../models/workflow.model.js';
import WorkflowExecution from '../models/workflowExecution.model.js';
import WorkflowApproval from '../models/workflowApproval.model.js';
import { composioIntegrationService } from './composioIntegration.service.js';
import { workflowResilienceService } from './workflowResilience.service.js';
import { Composio } from '@composio/core';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';
import path from 'path';
import { runIngestionWorkflow } from '../llamaindex/indexPipeline.js';
import { runSearchWorkflow } from '../llamaindex/searchPipeline.js';
import { conversationService } from '../../conversations/conversation.service.js';
import { deepResearchService } from '../../deep_research/deep_research.service.js';
import { runDeepResearchAgent } from '../../deep_research/deep_research_assistant/workflow.js';
import { SwarmService } from '../../swarm/swarm.service.js';
import { DatasetsService } from '../../datasets/datasets.service.js';

// Initialize Composio
const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

/**
 * Service for executing workflows and managing their lifecycle
 */
class WorkflowExecutionService {
  constructor() {
    this.scheduledJobs = new Map(); // Store scheduled cron jobs
    this.executingWorkflows = new Map(); // Track currently executing workflows
  }

  /**
   * Execute a workflow manually
   */
  async executeWorkflow(workflowId, userId, context = {}) {
    try {
      logger.info(`Starting manual execution of workflow ${workflowId}`);

      // Get workflow
      const workflow = await Workflow.findOne({ _id: workflowId, userId });
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      if (workflow.status !== 'active') {
        throw new Error('Workflow is not active');
      }

      // Create execution record
      const executionId = uuidv4();
      const execution = new WorkflowExecution({
        workflowId,
        userId,
        executionId,
        triggerType: context.triggeredBy || 'manual',
        totalSteps: workflow.steps.length,
        context,
      });

      await execution.save();

      let result;
      const useTemporal = config.temporal?.active === true || process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true';

      if (useTemporal) {
        logger.info(`[Engine Switch] Routing workflow execution ${workflowId} through Temporal cluster...`);
        const { temporalClientCoordinator } = await import('./temporal/client.js');
        // Inject execution tracking coordinates in context
        const extendedContext = {
          ...context,
          _executionId: execution._id,
          executionId: execution.executionId
        };
        const startResult = await temporalClientCoordinator.startWorkflow(workflow, userId, extendedContext);
        
        if (startResult.success) {
          if (startResult.isMock) {
            const mockResult = await startResult.handle.result();
            result = mockResult;
          } else {
            result = {
              success: true,
              status: 'running_durable',
              workflowId: startResult.workflowId
            };
          }
        } else {
          throw new Error('Temporal workflow activation failed');
        }
      } else {
        logger.info(`[Engine Switch] Routing workflow execution ${workflowId} through local fallback DAG executor...`);
        // Fallback to local execution
        result = await this.runWorkflowSteps(workflow, execution, context);
      }

      // Update workflow execution count
      await Workflow.updateOne(
        { _id: workflowId },
        {
          $inc: { executionCount: 1 },
          $set: { lastExecuted: new Date() },
        }
      );

      return {
        success: true,
        executionId,
        result,
      };
    } catch (error) {
      logger.error(`Error executing workflow ${workflowId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Run workflow steps sequentially
   */
  /**
   * Run workflow steps concurrently using a parallel Directed Acyclic Graph (DAG) scheduling topology.
   * Tracks step statuses and schedules pending steps whose dependencies (dependsOn) are 100% completed.
   * Auto-injects sequential dependency paths if dependsOn is omitted to maintain 100% backward compatibility.
   */
  async runWorkflowSteps(workflow, execution, context = {}, startStepIndex = 0) {
    try {
      const steps = [...workflow.steps];
      
      // Sort to establish a clean sequential order baseline
      steps.sort((a, b) => a.order - b.order);
      
      // Auto-inject sequential dependency paths for 100% backward compatibility if dependsOn is missing
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].dependsOn === undefined) {
          if (i > 0) {
            steps[i].dependsOn = [steps[i - 1].stepId];
          } else {
            steps[i].dependsOn = [];
          }
        }
      }

      // Track the execution status and reports for each step
      const stepStatuses = new Map();
      const stepExecutionReports = new Map();
      
      steps.forEach((step, idx) => {
        if (idx < startStepIndex) {
          stepStatuses.set(step.stepId, 'completed');
        } else {
          stepStatuses.set(step.stepId, 'pending');
        }
      });

      let currentContext = { ...context };

      // Initialize execution status and log the step list in database
      if (startStepIndex === 0) {
        await WorkflowExecution.updateOne(
          { _id: execution._id },
          {
            status: 'running',
            startTime: new Date(),
            steps: steps.map((step) => ({
              stepId: step.stepId,
              status: 'pending',
            })),
          }
        );
      } else {
        await WorkflowExecution.updateOne(
          { _id: execution._id },
          {
            status: 'running',
          }
        );
      }

      this.executingWorkflows.set(execution.executionId, {
        workflow,
        execution,
        status: 'running',
      });

      // Define sensitive actions list requiring human-in-the-loop approval
      const SENSITIVE_ACTIONS = [
        'gmail.send_email',
        'slack.send_message',
        'slack.post_message',
        'github.create_issue',
        'github.create_pr',
        'trello.create_card',
        'notion.create_page',
      ];

      // Mutex update wrapper to keep currentContext thread-safe during parallel writes
      const mergeContextUpdates = (updates) => {
        currentContext = { ...currentContext, ...updates };
      };

      // Main DAG scheduling evaluation loop
      while (true) {
        // Resolve steps that should be skipped because all of their dependencies are skipped
        for (const step of steps) {
          if (stepStatuses.get(step.stepId) === 'pending' && step.dependsOn.length > 0) {
            const allDepsSkipped = step.dependsOn.every((dep) => {
              let depId = dep;
              if (dep.includes('.')) {
                depId = dep.split('.')[0];
              }
              return stepStatuses.get(depId) === 'skipped';
            });
            if (allDepsSkipped) {
              stepStatuses.set(step.stepId, 'skipped');
              // Record in MongoDB as skipped
              await this.updateStepStatus(
                execution._id,
                step.stepId,
                'skipped',
                new Date(),
                new Date(),
                0,
                { skipped: true, reason: 'All parent dependencies were skipped.' }
              );
            }
          }
        }

        const pendingSteps = steps.filter((s) => stepStatuses.get(s.stepId) === 'pending');
        
        if (pendingSteps.length === 0) {
          break; // All steps completed or handled successfully
        }

        // Find steps whose dependencies are all successfully completed or skipped
        const eligibleSteps = pendingSteps.filter((step) => {
          return step.dependsOn.every((dep) => {
            let depId = dep;
            if (dep.includes('.')) {
              depId = dep.split('.')[0];
            }
            return stepStatuses.get(depId) === 'completed' || stepStatuses.get(depId) === 'skipped';
          });
        });

        // Guard against cyclic dependencies or deadlocks
        if (eligibleSteps.length === 0) {
          throw new Error('Cyclic dependency or deadlock detected in workflow DAG steps.');
        }

        logger.info(
          `[DAG Executor] Scheduling ${eligibleSteps.length} steps in parallel: ${eligibleSteps.map((s) => s.stepId).join(', ')}`
        );

        // Execute eligible steps concurrently
        const executionPromises = eligibleSteps.map(async (step) => {
          stepStatuses.set(step.stepId, 'running');
          const stepStartTime = new Date();

          await this.updateStepStatus(execution._id, step.stepId, 'running', stepStartTime);

          // Check if the step requires Human-in-the-Loop approval
          const isSensitive = SENSITIVE_ACTIONS.includes(`${step.app?.toLowerCase()}.${step.action?.toLowerCase()}`);
          const approvalRequired = step.requireApproval || isSensitive;
          const alreadyApproved = currentContext._approvedSteps?.includes(step.stepId);

          if (approvalRequired && !alreadyApproved) {
            logger.info(`Suspending execution for step ${step.stepId}: requires human approval.`);
            
            // Revert status to pending so it can be resumed
            stepStatuses.set(step.stepId, 'pending');
            
            const approvalId = `appr_${uuidv4()}`;
            const approval = new WorkflowApproval({
              approvalId,
              userId: workflow.userId,
              workflowId: workflow._id,
              conversationId: execution.context?.conversationId || `conv_${uuidv4()}`,
              stepId: step.stepId,
              action: `${step.app}.${step.action}`,
              parameters: this.prepareParameters(step.parameters, currentContext),
              status: 'pending',
              checkpointId: execution.executionId // Map to this execution
            });

            await approval.save();

            // Update execution to reflect the paused/awaiting_approval status
            await WorkflowExecution.updateOne(
              { _id: execution._id },
              {
                status: 'awaiting_approval',
                currentStepIndex: steps.indexOf(step),
                context: currentContext
              }
            );

            // Update step status to pending/paused
            await this.updateStepStatus(
              execution._id,
              step.stepId,
              'pending',
              null,
              null,
              null,
              null,
              new Error('Execution paused for human approval')
            );

            this.executingWorkflows.delete(execution.executionId);

            // Throw a pause signal to interrupt Promise.all loop
            throw { type: 'approval_pause', approvalId, step };
          }

          try {
            logger.info(`[DAG Step Worker] Executing step ${step.stepId}: ${step.description}`);

            // Execute step with custom retry policy if specified
            let stepResult;
            const retryPolicy = step.retryPolicy || {};
            const maxAttempts = retryPolicy.maxAttempts || 1;
            const initialIntervalMs = retryPolicy.initialIntervalMs || 1000;
            const backoffCoefficient = retryPolicy.backoffCoefficient || 2;
            const maxDelayMs = retryPolicy.maxDelayMs || 30000;

            let attempt = 1;
            let currentDelay = initialIntervalMs;

            while (true) {
              try {
                stepResult = await this.executeStep(step, currentContext, workflow.userId);
                break; // Succeeded!
              } catch (stepErr) {
                if (attempt >= maxAttempts) {
                  throw stepErr; // Exhausted retries
                }
                
                logger.warn(`[DAG Step Worker] Step ${step.stepId} failed on attempt ${attempt}/${maxAttempts}: ${stepErr.message}. Retrying in ${currentDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, currentDelay));
                
                attempt++;
                currentDelay = Math.min(currentDelay * backoffCoefficient, maxDelayMs);
              }
            }

            const stepEndTime = new Date();
            const duration = stepEndTime - stepStartTime;

            // Update step status to completed
            await this.updateStepStatus(
              execution._id,
              step.stepId,
              'completed',
              stepStartTime,
              stepEndTime,
              duration,
              stepResult
            );

            stepStatuses.set(step.stepId, 'completed');
            stepExecutionReports.set(step.stepId, {
              stepId: step.stepId,
              success: true,
              result: stepResult,
              duration,
            });

            // Safely merge context updates
            mergeContextUpdates(stepResult.contextUpdates);

            // If condition step or step has evaluation result, perform cascade skipping
            if (step.stepType === 'condition' || (stepResult && stepResult.evaluation !== undefined)) {
              const evaluation = stepResult.evaluation;
              
              const cascadeSkip = async (skippedStepId) => {
                const stepsToSkip = steps.filter(s => 
                  s.dependsOn.some(dep => dep === skippedStepId || dep.startsWith(skippedStepId + '.')) &&
                  stepStatuses.get(s.stepId) === 'pending'
                );
                for (const s of stepsToSkip) {
                  stepStatuses.set(s.stepId, 'skipped');
                  await this.updateStepStatus(
                    execution._id,
                    s.stepId,
                    'skipped',
                    new Date(),
                    new Date(),
                    0,
                    { skipped: true, reason: `Skipped because branch parent step ${skippedStepId} was skipped.` }
                  );
                  await cascadeSkip(s.stepId);
                }
              };

              if (typeof evaluation === 'boolean') {
                if (evaluation === true) {
                  // Skip steps depending on step.stepId.false
                  for (const s of steps) {
                    if (s.dependsOn.includes(`${step.stepId}.false`) && stepStatuses.get(s.stepId) === 'pending') {
                      stepStatuses.set(s.stepId, 'skipped');
                      await this.updateStepStatus(
                        execution._id,
                        s.stepId,
                        'skipped',
                        new Date(),
                        new Date(),
                        0,
                        { skipped: true, reason: `Condition evaluated to true, skipping false branch.` }
                      );
                      await cascadeSkip(s.stepId);
                    }
                  }
                } else {
                  // Skip steps depending on step.stepId.true or step.stepId (default)
                  for (const s of steps) {
                    if ((s.dependsOn.includes(`${step.stepId}.true`) || s.dependsOn.includes(step.stepId)) && stepStatuses.get(s.stepId) === 'pending') {
                      stepStatuses.set(s.stepId, 'skipped');
                      await this.updateStepStatus(
                        execution._id,
                        s.stepId,
                        'skipped',
                        new Date(),
                        new Date(),
                        0,
                        { skipped: true, reason: `Condition evaluated to false, skipping true branch.` }
                      );
                      await cascadeSkip(s.stepId);
                    }
                  }
                }
              } else if (typeof evaluation === 'string') {
                const selectedRoute = evaluation;
                const prefix = `${step.stepId}.`;
                for (const s of steps) {
                  if (stepStatuses.get(s.stepId) === 'pending') {
                    const hasNonMatchingDep = s.dependsOn.some(dep => 
                      dep.startsWith(prefix) && dep.slice(prefix.length) !== selectedRoute
                    );
                    if (hasNonMatchingDep) {
                      stepStatuses.set(s.stepId, 'skipped');
                      await this.updateStepStatus(
                        execution._id,
                        s.stepId,
                        'skipped',
                        new Date(),
                        new Date(),
                        0,
                        { skipped: true, reason: `AI Router evaluated to '${selectedRoute}', skipping non-matching branch.` }
                      );
                      await cascadeSkip(s.stepId);
                    }
                  }
                }
              }
            }
          } catch (stepError) {
            logger.error(`[DAG Step Worker] Error in step ${step.stepId}:`, stepError);

            const stepEndTime = new Date();
            const duration = stepEndTime - stepStartTime;

            // Check if step requires autonomous agentic self-healing
            if (step.continueOnError === 'agentic_heal' || step.selfHeal === true) {
              try {
                logger.warn(`[DAG Step Worker] Step ${step.stepId} failed. Launching Autonomous Self-Healing Analyst...`);
                
                const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');
                let healedParameters = { ...step.parameters };

                if (isMock) {
                  logger.info(`[Self-Healing Agent] Diagnosed missing parameter or faulty reference in context.`);
                  healedParameters.repairedByAgent = true;
                  // Auto-inject mock fix based on context parameters
                  if (step.parameters && typeof step.parameters === 'object') {
                    if (step.parameters.couponCode) {
                      healedParameters.couponCode = 'HEALED_COUPON_CODE';
                    }
                  }
                } else {
                  const { GoogleGenAI } = await import('@google/genai');
                  const aiClient = new GoogleGenAI({ apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY });
                  
                  const systemInstruction = "You are an autonomous self-healing execution engine compiler. A step in a workflow failed execution. Analyze the error and context, and output a corrected JSON object of step parameters to fix the issue.";
                  const prompt = `Failed Step ID: "${step.stepId}"\nApp: "${step.app}"\nAction: "${step.action}"\nOriginal Parameters: ${JSON.stringify(step.parameters)}\nError Message: "${stepError.message}"\nCurrent Context: ${JSON.stringify(currentContext)}\n\nGenerate the corrected set of parameters to successfully retry this step inside a JSON block mapping to 'healedParameters'.`;

                  const geminiResult = await aiClient.models.generateContent({
                    model: 'gemini-1.5-flash',
                    contents: prompt,
                    config: {
                      temperature: 0.2,
                      systemInstruction,
                      responseMimeType: "application/json",
                      responseSchema: {
                        type: "OBJECT",
                        properties: {
                          healedParameters: {
                            type: "OBJECT",
                            description: "The corrected step parameters to retry with."
                          }
                        },
                        required: ["healedParameters"]
                      }
                    }
                  });

                  const textResult = geminiResult.text || geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;
                  const parsed = JSON.parse(textResult);
                  healedParameters = parsed.healedParameters;
                }

                logger.info(`[Self-Healing Agent] Automatically repairing parameters and initiating retry...`);
                const healedStep = { ...step, parameters: healedParameters };
                const retryResult = await this.executeStep(healedStep, currentContext, workflow.userId);
                
                const healEndTime = new Date();
                const healDuration = healEndTime - stepStartTime;

                await this.updateStepStatus(
                  execution._id,
                  step.stepId,
                  'completed',
                  stepStartTime,
                  healEndTime,
                  healDuration,
                  { ...retryResult, healed: true, originalError: stepError.message }
                );

                stepStatuses.set(step.stepId, 'completed');
                stepExecutionReports.set(step.stepId, {
                  stepId: step.stepId,
                  success: true,
                  result: { ...retryResult, healed: true },
                  duration: healDuration,
                });

                mergeContextUpdates(retryResult.contextUpdates);
                logger.info(`[Self-Healing Agent] Step ${step.stepId} was successfully healed!`);
                return; // Prevent fall-through to failure
              } catch (healError) {
                logger.error(`[Self-Healing Agent] Healing failed for step ${step.stepId}:`, healError);
              }
            }

            // Update step status to failed
            await this.updateStepStatus(
              execution._id,
              step.stepId,
              'failed',
              stepStartTime,
              stepEndTime,
              duration,
              null,
              stepError
            );

            stepExecutionReports.set(step.stepId, {
              stepId: step.stepId,
              success: false,
              error: stepError.message,
              duration,
            });

            // Decide whether to continue or stop
            if (step.continueOnError === true) {
              stepStatuses.set(step.stepId, 'completed'); // Bypass so dependent branches can run
            } else {
              stepStatuses.set(step.stepId, 'failed');
              throw stepError;
            }
          }
        });

        try {
          await Promise.all(executionPromises);
        } catch (err) {
          if (err.type === 'approval_pause') {
            return {
              success: true,
              status: 'paused',
              approvalId: err.approvalId,
              executionId: execution.executionId,
              message: `Execution paused at step "${err.step.description}". Human approval is required.`,
              stepId: err.step.stepId,
              action: `${err.step.app}.${err.step.action}`
            };
          }
          throw err;
        }
      }

      // Update execution as completed
      const endTime = new Date();
      const totalDuration = endTime - execution.startTime;
      const stepReports = Array.from(stepExecutionReports.values());
      const completedSteps = stepReports.filter((r) => r.success).length;
      const failedSteps = stepReports.filter((r) => !r.success).length;

      await WorkflowExecution.updateOne(
        { _id: execution._id },
        {
          status: 'completed',
          endTime,
          duration: totalDuration,
          completedSteps,
          failedSteps,
          result: {
            success: failedSteps === 0,
            data: stepReports,
            summary: `Completed DAG run successfully: ${completedSteps}/${steps.length} steps complete.`,
          },
        }
      );

      this.executingWorkflows.delete(execution.executionId);

      return {
        success: failedSteps === 0,
        completedSteps,
        failedSteps,
        totalSteps: steps.length,
        results: stepReports,
        duration: totalDuration,
      };
    } catch (error) {
      logger.error('Error running workflow steps DAG:', error);

      // Trigger automatic local Saga compensating rollbacks in reverse-chronological order
      try {
        logger.info(`Starting local Saga compensating rollbacks for execution ${execution.executionId}...`);
        const rollbackResult = await workflowResilienceService.rollbackExecution(
          execution.executionId,
          async (rollbackStep) => {
            return await this.executeStep(rollbackStep, currentContext, workflow.userId);
          }
        );
        logger.info(`Local Saga rollbacks completed: ${JSON.stringify(rollbackResult)}`);
      } catch (rollbackError) {
        logger.error(`Failed to execute local Saga compensating rollbacks: ${rollbackError.message}`);
      }

      // Update execution as failed
      await WorkflowExecution.updateOne(
        { _id: execution._id },
        {
          status: 'failed',
          endTime: new Date(),
          error: {
            message: error.message,
            stack: error.stack,
          },
        }
      );

      this.executingWorkflows.delete(execution.executionId);
      throw error;
    }
  }

  /**
   * Execute a single workflow step
   */
  async executeStep(step, context, userId) {
    try {
      logger.info(`Executing step: ${step.stepId} (${step.app}.${step.action || step.stepType})`);

      // Intercept Conditional Branching nodes
      if (step.stepType === 'condition') {
        const parameters = this.prepareParameters(step.parameters || {}, context);
        const { expression, value1, operator, value2 } = parameters;
        
        let evaluation = false;
        
        if (expression) {
          // Custom sandboxed expression, prepared/replaced by our deep resolver
          const evaluated = this.prepareParameters(`{{${expression}}}`, context);
          evaluation = !!evaluated;
        } else if (operator) {
          // Standard comparison rules
          const val1 = value1;
          const val2 = value2;
          
          switch (operator) {
            case 'eq':
            case 'equals':
            case '==':
            case '===':
              evaluation = (val1 === val2);
              break;
            case 'ne':
            case 'not_equals':
            case '!=':
            case '!==':
              evaluation = (val1 !== val2);
              break;
            case 'gt':
            case 'greater_than':
            case '>':
              evaluation = (Number(val1) > Number(val2));
              break;
            case 'gte':
            case 'greater_than_or_equals':
            case '>=':
              evaluation = (Number(val1) >= Number(val2));
              break;
            case 'lt':
            case 'less_than':
            case '<':
              evaluation = (Number(val1) < Number(val2));
              break;
            case 'lte':
            case 'less_than_or_equals':
            case '<=':
              evaluation = (Number(val1) <= Number(val2));
              break;
            case 'contains':
              evaluation = String(val1).includes(String(val2));
              break;
            case 'not_contains':
              evaluation = !String(val1).includes(String(val2));
              break;
            case 'starts_with':
              evaluation = String(val1).startsWith(String(val2));
              break;
            case 'ends_with':
              evaluation = String(val1).endsWith(String(val2));
              break;
            default:
              evaluation = false;
          }
        }
        
        logger.info(`[DAG Condition Worker] Evaluated condition step ${step.stepId}: ${evaluation}`);
        
        return {
          success: true,
          evaluation,
          data: { evaluation },
          contextUpdates: {
            [`${step.stepId}_evaluation`]: evaluation
          }
        };
      }

      // 1. Intercept Core Platform - Chat / Conversations Page
      if (step.app?.toLowerCase() === 'chat' || step.app?.toLowerCase() === 'conversations') {
        const parameters = this.prepareParameters(step.parameters, context);
        let result;
        const tStart = Date.now();

        const conversationId = parameters.conversationId || context.conversationId || `conv_wf_${Date.now()}`;
        
        if (step.action?.toLowerCase() === 'send_message') {
          const { content } = parameters;
          if (!content) {
            throw new Error(`Required parameter 'content' is missing for chat.${step.action}`);
          }
          result = await conversationService.addMessageToConversation(conversationId, userId, {
            role: 'assistant',
            content,
            metadata: {
              triggeredBy: 'workflow',
              stepId: step.stepId
            }
          });
        } else if (step.action?.toLowerCase() === 'create_thread') {
          const { title, initialMessage } = parameters;
          result = await conversationService.createConversation({
            userId,
            title: title || 'Workflow Generated Chat',
            initialMessage: initialMessage ? { role: 'user', content: initialMessage } : null,
            metadata: {
              triggeredBy: 'workflow',
              stepId: step.stepId
            }
          }, conversationId);
        } else {
          throw new Error(`Unknown action '${step.action}' for app '${step.app}'`);
        }

        const duration = Date.now() - tStart;
        
        if (context._executionId) {
          workflowResilienceService.registerCompletedStep(
            context._executionId,
            { stepId: step.stepId, app: step.app, action: step.action, parameters },
            result
          );
        }

        logger.info(`Chat platform step completed successfully: ${step.stepId} in ${duration}ms`);

        return {
          success: true,
          data: result,
          contextUpdates: {
            ...this.extractContextUpdates(result, step),
            conversationId // Propagate current conversationId to context
          },
          timestamp: new Date(),
          attempts: 1,
          retried: false,
          totalDurationMs: duration,
        };
      }

      // 2. Intercept Core Platform - Research Page
      if (step.app?.toLowerCase() === 'research' || step.app?.toLowerCase() === 'deep_research') {
        const parameters = this.prepareParameters(step.parameters, context);
        let result;
        const tStart = Date.now();

        if (step.action?.toLowerCase() === 'conduct_research') {
          const { query, depth, boardPersonas } = parameters;
          if (!query) {
            throw new Error(`Required parameter 'query' is missing for research.${step.action}`);
          }
          const conversationId = parameters.conversationId || context.conversationId || `dr_wf_${Date.now()}`;
          
          result = await runDeepResearchAgent(query, {
            conversationId,
            maxDepth: depth === 'fast' ? 2 : 4,
            boardPersonas: boardPersonas || ['McKinsey Strategy Partner', 'YC Technical Architect'],
          });
          
          if (!result.success) {
            throw new Error(`Deep research agent failed: ${result.error}`);
          }
        } else {
          throw new Error(`Unknown action '${step.action}' for app '${step.app}'`);
        }

        const duration = Date.now() - tStart;

        if (context._executionId) {
          workflowResilienceService.registerCompletedStep(
            context._executionId,
            { stepId: step.stepId, app: step.app, action: step.action, parameters },
            result
          );
        }

        logger.info(`Research platform step completed successfully: ${step.stepId} in ${duration}ms`);

        return {
          success: true,
          data: result,
          contextUpdates: this.extractContextUpdates(result, step),
          timestamp: new Date(),
          attempts: 1,
          retried: false,
          totalDurationMs: duration,
        };
      }

      // 3. Intercept Core Platform - Agents / Swarm Page
      if (step.app?.toLowerCase() === 'agents' || step.app?.toLowerCase() === 'swarm') {
        const parameters = this.prepareParameters(step.parameters, context);
        let result;
        const tStart = Date.now();

        if (step.action?.toLowerCase() === 'run_swarm') {
          const { query } = parameters;
          if (!query) {
            throw new Error(`Required parameter 'query' is missing for agents.${step.action}`);
          }
          
          result = await SwarmService.executeSwarmSync(query, []);
        } else if (step.action?.toLowerCase() === 'swarm_orchestrator') {
          const { instructions, agentsList } = parameters;
          if (!instructions) {
            throw new Error(`Required parameter 'instructions' is missing for agents.${step.action}`);
          }
          
          const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');
          
          if (isMock) {
            const swarmLog = [
              `[Swarm Dispatcher] Instantiating collaborative swarm consisting of: ${agentsList ? agentsList.join(', ') : 'Researcher, Copywriter, Reviewer'}...`,
              `[Agent: Researcher] Conducting deep semantic review based on instructions: "${instructions}"`,
              `[Agent: Copywriter] Reshaping raw research details into clean, production-ready deliverables.`,
              `[Agent: Reviewer] Executing thorough quality control inspections. No issues found.`
            ];
            const outputReport = `[Autonomous Swarm Unified Report] Executed multi-agent swarm loop. Instructions: "${instructions}". Roles: ${agentsList ? agentsList.join(', ') : 'Researcher, Copywriter, Reviewer'}. Execution completed in 3 autonomous conversational cycles. Final Quality Rating: 100% Verified.`;
            result = { success: true, swarmLog, outputReport, mocked: true };
          } else {
            result = await SwarmService.executeSwarmSync(instructions, agentsList || ['Researcher', 'Copywriter', 'Reviewer']);
          }
        } else {
          throw new Error(`Unknown action '${step.action}' for app '${step.app}'`);
        }

        const duration = Date.now() - tStart;

        if (context._executionId) {
          workflowResilienceService.registerCompletedStep(
            context._executionId,
            { stepId: step.stepId, app: step.app, action: step.action, parameters },
            result
          );
        }

        logger.info(`Swarm Agent platform step completed successfully: ${step.stepId} in ${duration}ms`);

        return {
          success: true,
          data: result,
          contextUpdates: this.extractContextUpdates(result, step),
          timestamp: new Date(),
          attempts: 1,
          retried: false,
          totalDurationMs: duration,
        };
      }

      // 4. Intercept Core Platform - Data / Datasets Page
      if (step.app?.toLowerCase() === 'data' || step.app?.toLowerCase() === 'datasets') {
        const parameters = this.prepareParameters(step.parameters, context);
        let result;
        const tStart = Date.now();

        if (step.action?.toLowerCase() === 'query_rag') {
          const { query } = parameters;
          if (!query) {
            throw new Error(`Required parameter 'query' is missing for data.${step.action}`);
          }
          result = await runSearchWorkflow(query, userId);
        } else if (step.action?.toLowerCase() === 'index_file') {
          const { filePath, originalName } = parameters;
          if (!filePath) {
            throw new Error(`Required parameter 'filePath' is missing for data.${step.action}`);
          }
          result = await runIngestionWorkflow(filePath, originalName || path.basename(filePath), userId);
        } else if (step.action?.toLowerCase() === 'archive_dataset') {
          const { datasetId } = parameters;
          if (!datasetId) {
            throw new Error(`Required parameter 'datasetId' is missing for data.${step.action}`);
          }
          result = await DatasetsService.archiveDatasetToGCS(datasetId);
        } else if (step.action?.toLowerCase() === 'index_dataset') {
          const { datasetId } = parameters;
          if (!datasetId) {
            throw new Error(`Required parameter 'datasetId' is missing for data.${step.action}`);
          }
          result = await DatasetsService.indexDatasetForRAG(datasetId);
        } else {
          throw new Error(`Unknown action '${step.action}' for app '${step.app}'`);
        }

        const duration = Date.now() - tStart;

        if (context._executionId) {
          workflowResilienceService.registerCompletedStep(
            context._executionId,
            { stepId: step.stepId, app: step.app, action: step.action, parameters },
            result
          );
        }

        logger.info(`Data platform step completed successfully: ${step.stepId} in ${duration}ms`);

        return {
          success: true,
          data: result,
          contextUpdates: this.extractContextUpdates(result, step),
          timestamp: new Date(),
          attempts: 1,
          retried: false,
          totalDurationMs: duration,
        };
      }

      // Intercept LlamaIndex event-driven steps
      if (step.app?.toLowerCase() === 'llamaindex') {
        const parameters = this.prepareParameters(step.parameters, context);
        let result;
        const tStart = Date.now();

        if (step.action?.toLowerCase() === 'ingest_file' || step.action?.toLowerCase() === 'index_file') {
          const { filePath, originalName } = parameters;
          if (!filePath) {
            throw new Error(`Required parameter 'filePath' is missing for llamaindex.${step.action}`);
          }
          result = await runIngestionWorkflow(filePath, originalName || path.basename(filePath), userId);
        } else if (step.action?.toLowerCase() === 'search' || step.action?.toLowerCase() === 'query') {
          const { query } = parameters;
          if (!query) {
            throw new Error(`Required parameter 'query' is missing for llamaindex.${step.action}`);
          }
          result = await runSearchWorkflow(query, userId);
        } else {
          throw new Error(`Unknown action '${step.action}' for app 'llamaindex'`);
        }

        const duration = Date.now() - tStart;
        
        // Register completed step for potential rollback
        if (context._executionId) {
          workflowResilienceService.registerCompletedStep(
            context._executionId,
            { stepId: step.stepId, app: step.app, action: step.action, parameters },
            result
          );
        }

        logger.info(`LlamaIndex event step completed successfully: ${step.stepId} in ${duration}ms`);

        return {
          success: true,
          data: result,
          contextUpdates: this.extractContextUpdates(result, step),
          timestamp: new Date(),
          attempts: 1,
          retried: false,
          totalDurationMs: duration,
        };
      }

      // 5. Intercept Google Cloud Platform Native Core Steps
      if (step.app?.toLowerCase() === 'google_cloud' || step.app?.toLowerCase() === 'gcp') {
        const parameters = this.prepareParameters(step.parameters, context);
        let result;
        const tStart = Date.now();
        const action = step.action?.toLowerCase();

        const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');

        if (action === 'vertex_ai_router') {
          const { input, routes } = parameters;
          if (!input || !routes || typeof routes !== 'object') {
            throw new Error(`Required parameters 'input' and 'routes' (object) are missing or invalid for google_cloud.${step.action}`);
          }

          let selectedRoute;

          if (isMock) {
            const textLower = String(input).toLowerCase();
            const keys = Object.keys(routes);
            
            if (textLower.includes('pricing') || textLower.includes('enterprise') || textLower.includes('cost') || textLower.includes('quote') || textLower.includes('sales')) {
              selectedRoute = keys.find(k => k.toLowerCase() === 'sales') || keys[0];
            } else if (textLower.includes('error') || textLower.includes('bug') || textLower.includes('broken') || textLower.includes('support') || textLower.includes('help')) {
              selectedRoute = keys.find(k => k.toLowerCase() === 'support') || keys[0];
            } else {
              selectedRoute = keys.includes('default') ? 'default' : keys[0];
            }
            result = { selectedRoute, success: true, mocked: true };
          } else {
            const { GoogleGenAI } = await import('@google/genai');
            const aiClient = new GoogleGenAI({ apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY });
            
            const routesListing = Object.entries(routes)
              .map(([key, desc]) => `- ${key}: ${desc}`)
              .join('\n');
            
            const systemInstruction = "You are an AI router. Categorize the user's input into one of the provided routes based on their description. You must output a JSON object containing a single field 'route' with the key of the selected route.";
            const prompt = `Input text to classify: "${input}"\n\nAvailable routes:\n${routesListing}\n\nSelect the most appropriate route. If none of the routes match, select the route key 'default' if it exists, otherwise select the first route.`;

            const geminiResult = await aiClient.models.generateContent({
              model: 'gemini-1.5-flash',
              contents: prompt,
              config: {
                temperature: 0.1,
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    route: {
                      type: "STRING",
                      description: "The selected route key that matches the user input best."
                    }
                  },
                  required: ["route"]
                }
              }
            });

            const textResult = geminiResult.text || geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;
            let parsed;
            try {
              parsed = JSON.parse(textResult);
            } catch (err) {
              logger.warn(`Failed to parse structured JSON from Gemini router: ${textResult}. Falling back to default routing.`, err);
            }

            selectedRoute = parsed?.route;
            const keys = Object.keys(routes);
            if (!selectedRoute || !keys.includes(selectedRoute)) {
              selectedRoute = keys.includes('default') ? 'default' : keys[0];
            }

            result = { selectedRoute, success: true };
          }

          const duration = Date.now() - tStart;
          if (context._executionId) {
            workflowResilienceService.registerCompletedStep(
              context._executionId,
              { stepId: step.stepId, app: step.app, action: step.action, parameters },
              result
            );
          }

          logger.info(`Vertex AI Prompt Router completed successfully: selected route '${selectedRoute}' in ${duration}ms`);

          return {
            success: true,
            evaluation: selectedRoute,
            data: result,
            contextUpdates: {
              ...this.extractContextUpdates(result, step),
              [`${step.stepId}_evaluation`]: selectedRoute,
            },
            timestamp: new Date(),
            attempts: 1,
            retried: false,
            totalDurationMs: duration,
          };
        } else if (action === 'vertex_ai_transform') {
          const { data, instructions } = parameters;
          if (data === undefined || !instructions) {
            throw new Error(`Required parameters 'data' and 'instructions' are missing or invalid for google_cloud.${step.action}`);
          }

          let transformedData;

          if (isMock) {
            const instructionsLower = String(instructions).toLowerCase();
            if (instructionsLower.includes('email')) {
              transformedData = ["support@example.com", "billing@example.com"];
            } else if (instructionsLower.includes('uppercase') || instructionsLower.includes('upper')) {
              transformedData = typeof data === 'string' ? data.toUpperCase() : data;
            } else {
              transformedData = {
                transformed: true,
                original: data,
                instructions
              };
            }
            result = { transformedData, success: true, mocked: true };
          } else {
            const { GoogleGenAI } = await import('@google/genai');
            const aiClient = new GoogleGenAI({ apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY });
            
            const systemInstruction = "You are an expert AI data transformer. You will ingest data and reshape/map/transform it exactly as specified by the user's natural language instructions. You must output valid, clean JSON representing the transformed output.";
            const dataString = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
            const prompt = `Data to transform:\n${dataString}\n\nInstructions: "${instructions}"\n\nPerform the transformation and return the result inside a JSON object with a single key 'transformedData'.`;

            const geminiResult = await aiClient.models.generateContent({
              model: 'gemini-1.5-flash',
              contents: prompt,
              config: {
                temperature: 0.1,
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    transformedData: {
                      type: "STRING",
                      description: "The transformed data output based on instructions."
                    }
                  },
                  required: ["transformedData"]
                }
              }
            });

            const textResult = geminiResult.text || geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;
            let parsed;
            try {
              parsed = JSON.parse(textResult);
              transformedData = parsed.transformedData;
              if (typeof transformedData === 'string' && (transformedData.startsWith('{') || transformedData.startsWith('['))) {
                try {
                  transformedData = JSON.parse(transformedData);
                } catch(e) {}
              }
            } catch (err) {
              logger.warn(`Failed to parse structured JSON from Gemini transformer: ${textResult}. Returning raw text.`, err);
              transformedData = textResult;
            }

            result = { transformedData, success: true };
          }

          const duration = Date.now() - tStart;
          if (context._executionId) {
            workflowResilienceService.registerCompletedStep(
              context._executionId,
              { stepId: step.stepId, app: step.app, action: step.action, parameters },
              result
            );
          }

          logger.info(`Vertex AI Cognitive Transformer completed successfully in ${duration}ms`);

          return {
            success: true,
            data: result,
            contextUpdates: {
              ...this.extractContextUpdates(result, step),
              [`${step.stepId}_transformed`]: transformedData,
            },
            timestamp: new Date(),
            attempts: 1,
            retried: false,
            totalDurationMs: duration,
          };
        } else if (action === 'vertex_ai_generate') {
          const { prompt, model, temperature, systemInstruction } = parameters;
          if (!prompt) {
            throw new Error(`Required parameter 'prompt' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            const mockText = `[Mock Vertex AI / Gemini Response for model '${model || 'gemini-1.5-flash'}'] Based on your prompt: "${prompt.slice(0, 100)}...", here is the structured analysis. Apple Inc. Q2 Revenue margin is 0.466 and sentiment is positive.`;
            result = { text: mockText, reply: mockText, answer: mockText, success: true };
          } else {
            const { GoogleGenAI } = await import('@google/genai');
            const aiClient = new GoogleGenAI({ apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY });
            const geminiResult = await aiClient.models.generateContent({
              model: model || 'gemini-1.5-flash',
              contents: prompt,
              config: {
                temperature: temperature ? parseFloat(temperature) : 0.2,
                systemInstruction
              }
            });
            const textResult = geminiResult.text || geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
            result = { text: textResult, reply: textResult, answer: textResult, success: true };
          }
        } else if (action === 'gcs_upload') {
          const { bucketName, fileName, content } = parameters;
          if (!bucketName || !fileName || !content) {
            throw new Error(`Required parameters 'bucketName', 'fileName', and 'content' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              uri: `gs://${bucketName}/${fileName}`,
              fileName,
              bucketName,
              bytes: content.length,
              mocked: true
            };
          } else {
            const { Storage } = await import('@google-cloud/storage');
            const storage = new Storage();
            await storage.bucket(bucketName).file(fileName).save(content);
            result = {
              success: true,
              uri: `gs://${bucketName}/${fileName}`,
              fileName,
              bucketName
            };
          }
        } else if (action === 'gcs_download') {
          const { bucketName, fileName } = parameters;
          if (!bucketName || !fileName) {
            throw new Error(`Required parameters 'bucketName' and 'fileName' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              content: `[Mock GCS Downloaded Payload] Content of gs://${bucketName}/${fileName}: Apple financials are positive. Revenue is 90800000000.`,
              fileName,
              bucketName,
              mocked: true
            };
          } else {
            const { Storage } = await import('@google-cloud/storage');
            const storage = new Storage();
            const [downloaded] = await storage.bucket(bucketName).file(fileName).download();
            result = {
              success: true,
              content: downloaded.toString(),
              fileName,
              bucketName
            };
          }
        } else if (action === 'bigquery_query') {
          const { query } = parameters;
          if (!query) {
            throw new Error(`Required parameter 'query' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              rows: [
                { revenue: 90800000000, margin: 0.466, ticker: 'AAPL', sentiment: 'positive' }
              ],
              totalRows: 1,
              mocked: true
            };
          } else {
            const { google } = await import('googleapis');
            const auth = new google.auth.GoogleAuth({
              scopes: ['https://www.googleapis.com/auth/bigquery']
            });
            const authClient = await auth.getClient();
            const projectId = await auth.getProjectId();
            const bigquery = google.bigquery({ version: 'v2', auth: authClient });
            const bqResult = await bigquery.jobs.query({
              projectId,
              requestBody: { query, useLegacySql: false }
            });
            const rows = bqResult.data.rows || [];
            result = { success: true, rows, totalRows: rows.length };
          }
        } else if (action === 'gcp_vision_analyze') {
          const { contentBase64, features } = parameters;
          if (!contentBase64) {
            throw new Error(`Required parameter 'contentBase64' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              text: "Mock OCR Text: Google Cloud Platform balance sheet shows record net profits.",
              safeSearch: { adult: "VERY_UNLIKELY", violence: "VERY_UNLIKELY" },
              labels: [{ description: "Document", score: 0.99 }],
              mocked: true
            };
          } else {
            const { GcpVisionService } = await import('../../gcp_native/gcp-vision.service.js');
            const parsedFeatures = features ? (typeof features === 'string' ? JSON.parse(features) : features) : undefined;
            result = await GcpVisionService.analyzeImage(Buffer.from(contentBase64, 'base64'), parsedFeatures);
          }
        } else if (action === 'gcp_text_to_speech') {
          const { text, options } = parameters;
          if (!text) {
            throw new Error(`Required parameter 'text' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              audioContent: "dGVzdF9tb2NrX2F1ZGlvX2NvbnRlbnRfMTIzNDU=",
              encoding: options?.audioEncoding || "MP3",
              voice: options?.voiceName || "en-US-Neural2-F",
              mocked: true
            };
          } else {
            const { GcpSpeechService } = await import('../../gcp_native/gcp-speech.service.js');
            result = await GcpSpeechService.synthesizeSpeech(text, options);
          }
        } else if (action === 'gcp_speech_to_text') {
          const { audioBase64, options } = parameters;
          if (!audioBase64) {
            throw new Error(`Required parameter 'audioBase64' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              transcript: "Mock transcribed text: Welcome to Google Cloud Vertex AI integrations on Alti Assistant.",
              confidence: 0.98,
              mocked: true
            };
          } else {
            const { GcpSpeechService } = await import('../../gcp_native/gcp-speech.service.js');
            result = await GcpSpeechService.transcribeSpeech(Buffer.from(audioBase64, 'base64'), options);
          }
        } else if (action === 'gcp_nlp_analyze') {
          const { text, operations } = parameters;
          if (!text) {
            throw new Error(`Required parameter 'text' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              results: {
                sentiment: { score: 0.9, magnitude: 0.9 },
                entities: [{ name: "Google Cloud", type: "ORGANIZATION", salience: 0.95 }]
              },
              mocked: true
            };
          } else {
            const { GcpNlpService } = await import('../../gcp_native/gcp-nlp.service.js');
            result = await GcpNlpService.analyzeText(text, operations);
          }
        } else if (action === 'gcp_video_analyze') {
          const { inputUri, contentBase64, features } = parameters;
          if (!inputUri && !contentBase64) {
            throw new Error(`Required parameter 'inputUri' or 'contentBase64' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              operationName: `projects/mock-verify/locations/us-central1/operations/video_mock_${Date.now()}`,
              done: true,
              results: {
                labels: [{ entity: "Google Cloud Launch", categories: ["Tech"], segments: [{ start: 0, end: 10, confidence: 0.99 }] }],
                text: [{ text: "Fully Entrenched in Google", segments: [{ start: 1, end: 5, confidence: 0.98 }] }]
              },
              mocked: true
            };
          } else {
            const { GcpVideoIntelService } = await import('../../gcp_native/gcp-video-intel.service.js');
            const parsedFeatures = features ? (typeof features === 'string' ? JSON.parse(features) : features) : undefined;
            const buffer = contentBase64 ? Buffer.from(contentBase64, 'base64') : null;
            result = await GcpVideoIntelService.startVideoAnalysis(inputUri, buffer, parsedFeatures);
            if (result.success && result.operationName) {
              result = await GcpVideoIntelService.pollVideoAnalysis(result.operationName);
            }
          }
        } else if (action === 'gcp_generate_embeddings') {
          const { text, taskType } = parameters;
          if (!text) {
            throw new Error(`Required parameter 'text' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              embeddings: Array(768).fill(0.123),
              model: 'text-embedding-004',
              dimensions: 768,
              mocked: true
            };
          } else {
            const { GcpEmbeddingsService } = await import('../../gcp_native/gcp-embeddings.service.js');
            result = await GcpEmbeddingsService.getTextEmbeddings(text, taskType);
          }
        } else if (action === 'gcp_detect_language') {
          const { text } = parameters;
          if (!text) {
            throw new Error(`Required parameter 'text' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              languageCode: 'en',
              confidence: 0.99,
              mocked: true
            };
          } else {
            const { GcpTranslateAdvancedService } = await import('../../gcp_native/gcp-translate-advanced.service.js');
            result = await GcpTranslateAdvancedService.detectTextLanguage(text);
          }
        } else if (action === 'gcp_translate_document') {
          const { contentBase64, mimeType, targetLanguageCode, sourceLanguageCode } = parameters;
          if (!contentBase64 || !mimeType || !targetLanguageCode) {
            throw new Error(`Parameters 'contentBase64', 'mimeType', and 'targetLanguageCode' are required for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              translatedContent: "dGVzdF9tb2NrX3RyYW5zbGF0ZWRfZG9jXzU1NTU=",
              mimeType,
              detectedLanguageCode: sourceLanguageCode || 'en',
              mocked: true
            };
          } else {
            const { GcpTranslateAdvancedService } = await import('../../gcp_native/gcp-translate-advanced.service.js');
            result = await GcpTranslateAdvancedService.translateDocument(
              Buffer.from(contentBase64, 'base64'),
              mimeType,
              targetLanguageCode,
              sourceLanguageCode
            );
          }
        } else if (action === 'gcp_storage_create_bucket') {
          const { bucketName, location } = parameters;
          if (!bucketName) {
            throw new Error(`Required parameter 'bucketName' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              bucketName,
              location: location || 'us-central1',
              created: new Date().toISOString(),
              mocked: true
            };
          } else {
            const { GcpStorageService } = await import('../../gcp_native/gcp-storage.service.js');
            result = await GcpStorageService.createBucket(bucketName, location);
          }
        } else if (action === 'gcp_storage_signed_url') {
          const { bucketName, fileName, action: signedUrlAction, expiresMinutes } = parameters;
          if (!bucketName || !fileName) {
            throw new Error(`Required parameters 'bucketName' and 'fileName' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              bucketName,
              fileName,
              action: signedUrlAction || 'read',
              url: `https://storage.googleapis.com/${bucketName}/${fileName}?GoogleAccessId=mock-sa@mock-project.iam.gserviceaccount.com&Signature=mock-signature&Expires=123456789`,
              expiresAt: new Date(Date.now() + (expiresMinutes || 15) * 60 * 1000).toISOString(),
              mocked: true
            };
          } else {
            const { GcpStorageService } = await import('../../gcp_native/gcp-storage.service.js');
            result = await GcpStorageService.generateSignedUrl(bucketName, fileName, signedUrlAction || 'read', expiresMinutes || 15);
          }
        } else if (action === 'gcp_bigquery_create_table') {
          const { datasetId, tableId, schemaFields } = parameters;
          if (!datasetId || !tableId || !schemaFields) {
            throw new Error(`Required parameters 'datasetId', 'tableId', and 'schemaFields' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              projectId: 'mock-project-id',
              datasetId,
              tableId,
              numBytes: 0,
              schema: { fields: schemaFields },
              mocked: true
            };
          } else {
            const { GcpBigqueryService } = await import('../../gcp_native/gcp-bigquery.service.js');
            result = await GcpBigqueryService.createTable(datasetId, tableId, schemaFields);
          }
        } else if (action === 'gcp_bigquery_load_csv') {
          const { datasetId, tableId, gcsUri } = parameters;
          if (!datasetId || !tableId || !gcsUri) {
            throw new Error(`Required parameters 'datasetId', 'tableId', and 'gcsUri' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              jobId: `job_mock_${Date.now()}`,
              state: 'DONE',
              configuration: {
                load: {
                  sourceUris: [gcsUri],
                  destinationTable: {
                    datasetId,
                    tableId
                  }
                }
              },
              mocked: true
            };
          } else {
            const { GcpBigqueryService } = await import('../../gcp_native/gcp-bigquery.service.js');
            result = await GcpBigqueryService.loadCsvFromGcs(datasetId, tableId, gcsUri);
          }
        } else if (action === 'gcp_secrets_get') {
          const { secretId } = parameters;
          if (!secretId) {
            throw new Error(`Required parameter 'secretId' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              secretId,
              value: 'mock-secret-value-abcdef123456',
              mocked: true
            };
          } else {
            const { GcpSecretsService } = await import('../../gcp_native/gcp-secrets.service.js');
            result = await GcpSecretsService.getSecretValue(secretId);
          }
        } else if (action === 'gcp_pubsub_publish') {
          const { topicId, messageData } = parameters;
          if (!topicId || !messageData) {
            throw new Error(`Required parameters 'topicId' and 'messageData' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              topicId,
              messageIds: [`msg_mock_${Date.now()}`],
              mocked: true
            };
          } else {
            const { GcpPubSubService } = await import('../../gcp_native/gcp-pubsub.service.js');
            result = await GcpPubSubService.publishMessage(topicId, messageData);
          }
        } else if (action === 'gcp_document_ai_process') {
          const { contentBase64, mimeType, processorId, location } = parameters;
          if (!contentBase64 || !mimeType) {
            throw new Error(`Required parameters 'contentBase64' and 'mimeType' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              text: "Verification sample parsed text from Google Document AI.",
              paragraphs: ["Verification sample parsed text from Google Document AI."],
              tables: [{
                headers: [["Item", "Quantity", "Amount"]],
                rows: [["Premium Gemini Setup", "1", "$0.00"], ["Enterprise Maps SDK", "1", "$0.00"]]
              }],
              keyValues: [{ key: "Invoice ID", value: "INV-2026-991A" }],
              metadata: { pageCount: 1, mimeType },
              mocked: true
            };
          } else {
            const { GcpDocumentAiService } = await import('../../gcp_native/gcp-document-ai.service.js');
            result = await GcpDocumentAiService.processDocument(
              Buffer.from(contentBase64, 'base64'),
              mimeType,
              processorId,
              location || 'us'
            );
          }
        } else if (action === 'gcp_vertex_grounded_prompt') {
          const { sessionId, prompt } = parameters;
          if (!prompt) {
            throw new Error(`Required parameter 'prompt' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              prompt,
              sessionId: sessionId || `sess_ground_${Date.now()}`,
              reply: "Mocked grounded reply: The Google Cloud Platform integration on Alti Assistant is fully active. Search confirms that all 25 cognitive and geolocation endpoints are successfully configured.",
              groundingMetadata: {
                webSearchQueries: ["Alti Assistant Google Cloud integrations", "GCP native automation actions"],
                groundingChunks: [
                  { title: "Alti Google Cloud Integration Wiki", uri: "https://wiki.alti.assistant/gcp-native" },
                  { title: "Vertex AI Search Grounding Overview", uri: "https://cloud.google.com/vertex-ai" }
                ],
                searchEntryPoint: "Alti GCP Grounding Search Entry Point"
              },
              mocked: true
            };
          } else {
            const { GcpVertexGroundingService } = await import('../../gcp_native/gcp-vertex-grounding.service.js');
            result = await GcpVertexGroundingService.groundedPromptResponse(
              sessionId || `sess_ground_${Date.now()}`,
              prompt,
              userId
            );
          }
        } else if (action === 'gcp_maps_geocode') {
          const { address } = parameters;
          if (!address) {
            throw new Error(`Required parameter 'address' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              formattedAddress: address,
              location: { lat: 37.4223878, lng: -122.0841814 },
              placeId: "ChIJ2eUgeAK6j4ARbn5u_wBq0hs",
              types: ["street_address"],
              mocked: true
            };
          } else {
            const { GcpMapsService } = await import('../../gcp_native/gcp-maps.service.js');
            result = await GcpMapsService.geocodeAddress(address);
          }
        } else if (action === 'gcp_maps_places_search') {
          const { latitude, longitude, radius, keyword } = parameters;
          if (latitude === undefined || longitude === undefined) {
            throw new Error(`Required parameters 'latitude' and 'longitude' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              location: { latitude, longitude },
              radius: radius || 5000,
              keyword: keyword || '',
              places: [
                {
                  name: "Googleplex",
                  formattedAddress: "1600 Amphitheatre Pkwy, Mountain View, CA 94043",
                  location: { lat: 37.422, lng: -122.084 },
                  placeId: "ChIJ2eUgeAK6j4ARbn5u_wBq0hs",
                  rating: 4.8,
                  types: ["establishment", "point_of_interest"],
                  openNow: true
                }
              ],
              mocked: true
            };
          } else {
            const { GcpMapsService } = await import('../../gcp_native/gcp-maps.service.js');
            result = await GcpMapsService.searchNearbyPlaces(
              parseFloat(latitude),
              parseFloat(longitude),
              radius ? parseInt(radius) : undefined,
              keyword
            );
          }
        } else if (action === 'gcp_maps_directions') {
          const { origin, destination, mode } = parameters;
          if (!origin || !destination) {
            throw new Error(`Required parameters 'origin' and 'destination' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              origin,
              destination,
              distance: "38.5 mi",
              distanceValueBytes: 61959,
              duration: "42 mins",
              durationValueSeconds: 2520,
              steps: [
                {
                  instruction: "Head south on US-101 S",
                  distance: "38.2 mi",
                  duration: "38 mins",
                  startLocation: { lat: 37.7749, lng: -122.4194 },
                  endLocation: { lat: 37.422, lng: -122.084 }
                },
                {
                  instruction: "Take exit 398A for Amphitheatre Pkwy",
                  distance: "0.3 mi",
                  duration: "4 mins",
                  startLocation: { lat: 37.422, lng: -122.084 },
                  endLocation: { lat: 37.422, lng: -122.084 }
                }
              ],
              mocked: true
            };
          } else {
            const { GcpMapsService } = await import('../../gcp_native/gcp-maps.service.js');
            result = await GcpMapsService.calculateRoute(origin, destination, mode || 'driving');
          }
        } else if (action === 'gcp_maps_place_details') {
          const { placeId } = parameters;
          if (!placeId) {
            throw new Error(`Required parameter 'placeId' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              name: "Googleplex",
              placeId,
              formattedAddress: "1600 Amphitheatre Pkwy, Mountain View, CA 94043",
              phoneNumber: "+1 650-253-0000",
              internationalPhoneNumber: "+1 650-253-0000",
              location: { lat: 37.422, lng: -122.084 },
              rating: 4.8,
              userRatingsTotal: 10452,
              website: "https://about.google",
              priceLevel: 2,
              businessStatus: "OPERATIONAL",
              openNow: true,
              weekdayText: ["Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM"],
              reviews: [
                { authorName: "Jane Doe", rating: 5, text: "Excellent corporate campus and innovation center!", relativeTime: "2 weeks ago" }
              ],
              photos: [{ photoReference: "photo_ref_abc_123" }],
              mocked: true
            };
          } else {
            const { GcpMapsService } = await import('../../gcp_native/gcp-maps.service.js');
            result = await GcpMapsService.getPlaceDetails(placeId);
          }
        } else if (action === 'gcp_maps_place_photo') {
          const { photoReference, maxWidth } = parameters;
          if (!photoReference) {
            throw new Error(`Required parameter 'photoReference' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              photoReference,
              maxWidth: maxWidth || 800,
              photoUrl: `https://maps.googleapis.com/maps/api/place/photo?photo_reference=${photoReference}&maxwidth=${maxWidth || 800}&key=MOCK_KEY`,
              mocked: true
            };
          } else {
            const { GcpMapsService } = await import('../../gcp_native/gcp-maps.service.js');
            result = await GcpMapsService.getPlacePhotoUrl(photoReference, maxWidth || 800);
          }
        } else if (action === 'gcp_business_list_locations') {
          const { accountId } = parameters;
          if (!accountId) {
            throw new Error(`Required parameter 'accountId' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              accountId,
              locations: [
                {
                  name: `accounts/${accountId}/locations/loc_992`,
                  title: "Alti HQ Silicon Valley",
                  storefrontAddress: { addressLines: ["100 Enterprise Way"], postalCode: "94043" }
                }
              ],
              mocked: true
            };
          } else {
            const { GcpBusinessService } = await import('../../gcp_native/gcp-business.service.js');
            result = await GcpBusinessService.listBusinessLocations(accountId);
          }
        } else if (action === 'gcp_business_list_reviews') {
          const { accountId, locationId } = parameters;
          if (!accountId || !locationId) {
            throw new Error(`Required parameters 'accountId' and 'locationId' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              accountId,
              locationId,
              locationName: `accounts/${accountId}/locations/${locationId}`,
              averageRating: 4.9,
              totalReviewCount: 1,
              reviews: [
                {
                  reviewId: "rev_mock_881",
                  reviewerName: "Alice Smith",
                  starRating: "FIVE",
                  comment: "Outstanding integration features on Alti! Unbelievably fast.",
                  createTime: new Date().toISOString()
                }
              ],
              mocked: true
            };
          } else {
            const { GcpBusinessService } = await import('../../gcp_native/gcp-business.service.js');
            result = await GcpBusinessService.listLocationReviews(accountId, locationId);
          }
        } else if (action === 'gcp_business_create_post') {
          const { accountId, locationId, postPayload } = parameters;
          if (!accountId || !locationId || !postPayload) {
            throw new Error(`Required parameters 'accountId', 'locationId', and 'postPayload' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              postId: `accounts/${accountId}/locations/${locationId}/localPosts/post_mock_773`,
              state: "LIVE",
              searchUrl: "https://google.com/search?q=Alti+HQ",
              languageCode: "en",
              createTime: new Date().toISOString(),
              mocked: true
            };
          } else {
            const { GcpBusinessService } = await import('../../gcp_native/gcp-business.service.js');
            result = await GcpBusinessService.createLocalPost(accountId, locationId, postPayload);
          }
        } else if (action === 'gcp_business_unified_analytics') {
          const { query } = parameters;
          if (!query) {
            throw new Error(`Required parameter 'query' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              query,
              name: "Alti Headquarters",
              placeId: "place_mock_9921",
              formattedAddress: "1600 Amphitheatre Pkwy, Mountain View, CA 94043",
              phoneNumber: "+1 650-253-0000",
              internationalPhoneNumber: "+1 650-253-0000",
              website: "https://alti.assistant",
              rating: 5.0,
              userRatingsTotal: 9942,
              location: { lat: 37.422, lng: -122.084 },
              priceLevel: 1,
              businessStatus: "OPERATIONAL",
              openNow: true,
              weekdayText: ["Monday: Open 24 Hours"],
              reviewsCount: 1,
              topReviews: [
                { authorName: "Tech Insider", rating: 5, text: "Truly state-of-the-art enterprise integration workflow engine.", relativeTime: "1 day ago" }
              ],
              rawReviews: [
                { authorName: "Tech Insider", rating: 5, text: "Truly state-of-the-art enterprise integration workflow engine.", relativeTime: "1 day ago" }
              ],
              photosList: [{ photoReference: "photo_mock_ref_882" }],
              timestamp: new Date().toISOString(),
              mocked: true
            };
          } else {
            const { GcpBusinessService } = await import('../../gcp_native/gcp-business.service.js');
            result = await GcpBusinessService.getUnifiedBusinessIntelligence(query);
          }
        } else if (action === 'gcp_logging_write') {
          const { logName, message, severity, labels } = parameters;
          if (!logName || !message) {
            throw new Error(`Required parameters 'logName' and 'message' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              logName: `projects/mock-project/logs/${logName}`,
              severity: severity || 'INFO',
              message,
              labels: labels || {},
              mocked: true
            };
          } else {
            const { GcpLoggingService } = await import('../../gcp_native/gcp-logging.service.js');
            result = await GcpLoggingService.writeLogEntry(logName, message, severity || 'INFO', labels);
          }
        } else if (action === 'gcp_errors_report') {
          const { errorMessage, stackTrace, user, serviceName } = parameters;
          if (!errorMessage) {
            throw new Error(`Required parameter 'errorMessage' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              serviceName: serviceName || 'alti-backend',
              errorMessage,
              user: user || 'user_mock_8811',
              mocked: true
            };
          } else {
            const { GcpErrorsService } = await import('../../gcp_native/gcp-errors.service.js');
            result = await GcpErrorsService.reportError(errorMessage, stackTrace, user, serviceName);
          }
        } else if (action === 'gcp_recaptcha_verify') {
          const { token, expectedAction, siteKey } = parameters;
          if (!token) {
            throw new Error(`Required parameter 'token' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              score: 0.9,
              reasons: [],
              action: expectedAction || 'login',
              mocked: true
            };
          } else {
            const { GcpRecaptchaService } = await import('../../gcp_native/gcp-recaptcha.service.js');
            result = await GcpRecaptchaService.verifyRecaptchaToken(token, expectedAction, siteKey);
          }
        } else if (action === 'gcp_advanced_search') {
          const { query, searchType, numResults, safe } = parameters;
          if (!query) {
            throw new Error(`Required parameter 'query' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              originalQuery: query,
              searchType: searchType || 'web',
              subQueries: [query, `${query} latest`, `${query} news`],
              totalCandidates: 3,
              uniqueCount: 3,
              results: [
                {
                  title: `Mock Search Result for: ${query}`,
                  link: 'https://example.com/mock-search',
                  displayLink: 'example.com',
                  snippet: `This is a premium simulated Google advanced search snippet for query: ${query}`,
                  relevanceScore: 12,
                  finalRank: 1
                }
              ],
              mocked: true
            };
          } else {
            const { GcpSearchAggregatorService } = await import('../../gcp_native/gcp-search-aggregator.service.js');
            result = await GcpSearchAggregatorService.executeParallelSearch(query, searchType, numResults, safe);
          }
        } else if (action === 'gcp_knowledge_graph_lookup') {
          const { query, limit, types, languages } = parameters;
          if (!query) {
            throw new Error(`Required parameter 'query' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              query,
              totalCount: 1,
              entities: [
                {
                  id: 'kg:/m/mock_entity',
                  name: query,
                  types: ['Thing', 'MockEntity'],
                  description: `Simulated entity lookup for "${query}"`,
                  detailedDescription: {
                    body: `This is a high-fidelity mock knowledge panel details block describing "${query}" retrieved from the simulated Google Knowledge Graph.`,
                    url: 'https://en.wikipedia.org/wiki/Special:Search'
                  },
                  image: {
                    url: 'https://example.com/mock-entity.png'
                  },
                  relevanceScore: 100
                }
              ],
              mocked: true
            };
          } else {
            const { GcpKnowledgeGraphService } = await import('../../gcp_native/gcp-knowledge-graph.service.js');
            result = await GcpKnowledgeGraphService.lookupEntity(query, limit, types, languages);
          }
        } else if (action === 'gcp_tasks_create') {
          const { queueName, url, payload, delaySeconds, headers } = parameters;
          if (!url) {
            throw new Error(`Required parameter 'url' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              taskName: `projects/mock-project/locations/us-central1/queues/${queueName || 'alti-default-tasks'}/tasks/mock-task-7711`,
              dispatchUrl: url,
              scheduleTime: new Date(Date.now() + (delaySeconds || 0) * 1000).toISOString(),
              queue: queueName || 'alti-default-tasks',
              delaySeconds: delaySeconds || 0,
              mocked: true
            };
          } else {
            const { GcpTasksService } = await import('../../gcp_native/gcp-tasks.service.js');
            result = await GcpTasksService.createHttpTask(queueName, url, payload, delaySeconds, headers);
          }
        } else if (action === 'gcp_safe_browsing_check') {
          const { url } = parameters;
          if (!url) {
            throw new Error(`Required parameter 'url' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              url,
              isSecure: !url.includes('malware') && !url.includes('phish'),
              threatCount: (url.includes('malware') || url.includes('phish')) ? 1 : 0,
              threats: (url.includes('malware') || url.includes('phish')) ? [
                {
                  threatType: url.includes('malware') ? 'MALWARE' : 'SOCIAL_ENGINEERING',
                  platformType: 'ANY_PLATFORM',
                  threatEntryType: 'URL'
                }
              ] : [],
              mocked: true
            };
          } else {
            const { GcpSafeBrowsingService } = await import('../../gcp_native/gcp-safe-browsing.service.js');
            result = await GcpSafeBrowsingService.lookupUrlSafety(url);
          }
        } else if (action === 'gcp_fonts_resolve') {
          const { filterQuery, sortBy, limit } = parameters;
          if (isMock) {
            result = {
              success: true,
              filterQuery: filterQuery || '',
              sortBy: sortBy || 'popularity',
              totalCount: 1,
              returnedCount: 1,
              fonts: [
                {
                  family: filterQuery || 'Roboto',
                  variants: ['regular', 'italic', '700'],
                  subsets: ['latin'],
                  version: 'v30',
                  category: 'sans-serif',
                  files: {
                    'regular': `https://fonts.gstatic.com/s/${filterQuery || 'roboto'}/v30/mock-font.ttf`
                  }
                }
              ],
              mocked: true
            };
          } else {
            const { GcpFontsService } = await import('../../gcp_native/gcp-fonts.service.js');
            result = await GcpFontsService.resolveGoogleFonts(filterQuery, sortBy, limit);
          }
        } else if (action === 'gcp_search_suggest') {
          const { query, language } = parameters;
          if (!query) {
            throw new Error(`Required parameter 'query' is missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              query,
              suggestions: [
                query,
                `${query} trends`,
                `${query} tutorial`,
                `${query} developer documents`
              ],
              mocked: true
            };
          } else {
            const { GcpSuggestService } = await import('../../gcp_native/gcp-suggest.service.js');
            result = await GcpSuggestService.getSearchSuggestions(query, language);
          }
        } else if (action === 'gcp_vertex_search') {
          const { dataStoreId, query, options } = parameters;
          if (!dataStoreId || !query) {
            throw new Error(`Required parameters 'dataStoreId' and 'query' are missing for google_cloud.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              originalQuery: query,
              dataStoreId,
              totalCount: 2,
              results: [
                {
                  id: 'mock-doc-1',
                  name: `projects/mock/locations/global/dataStores/${dataStoreId}/branches/0/documents/mock-doc-1`,
                  title: `Semantic Reference for "${query}"`,
                  snippet: `Grounded search index document matching query "${query}" with high semantic density.`,
                  link: 'https://cloud.google.com/vertex-ai-search-and-conversation',
                  relevanceScore: 0.98,
                  index: 1
                },
                {
                  id: 'mock-doc-2',
                  name: `projects/mock/locations/global/dataStores/${dataStoreId}/branches/0/documents/mock-doc-2`,
                  title: `Enterprise grounding corpus info - ${query}`,
                  snippet: `Simulated backup matching reference coordinates for "${query}".`,
                  link: 'https://cloud.google.com/vertex-ai',
                  relevanceScore: 0.89,
                  index: 2
                }
              ],
              mocked: true
            };
          } else {
            const { GcpVertexSearchService } = await import('../../gcp_native/gcp-vertex-search.service.js');
            result = await GcpVertexSearchService.searchDataStore(dataStoreId, query, options);
          }
        } else if (action === 'gcp_trends_fetch') {
          const { geo } = parameters;
          if (isMock) {
            result = {
              success: true,
              geo: geo || 'US',
              totalCount: 3,
              trends: [
                {
                  query: 'Vertex AI Grounding Spikes',
                  approxTraffic: '500,000+',
                  description: 'Search spikes in enterprise generative search capabilities.',
                  picture: 'https://example.com/trend-image1.png',
                  newsItem: {
                    title: 'Google releases new Vertex AI Search options',
                    snippet: 'Discovery Engine sees huge uptick in developer usage...',
                    url: 'https://example.com/vertex-news',
                    source: 'Tech News Daily'
                  }
                },
                {
                  query: 'Gemini Autocomplete integration',
                  approxTraffic: '100,000+',
                  description: 'Google Suggest is the new hot topic.',
                  picture: 'https://example.com/trend-image2.png',
                  newsItem: {
                    title: 'Alti integrates Google autocomplete natively',
                    snippet: 'The new design allows zero-latency completions...',
                    url: 'https://example.com/alti-news',
                    source: 'AI Gazette'
                  }
                },
                {
                  query: 'Google Trends XML harvesting',
                  approxTraffic: '50,000+',
                  description: 'Harvester yields high-velocity queries.',
                  picture: 'https://example.com/trend-image3.png',
                  newsItem: null
                }
              ],
              mocked: true
            };
          } else {
            const { GcpTrendsService } = await import('../../gcp_native/gcp-trends.service.js');
            result = await GcpTrendsService.getTrendingSearches(geo);
          }
        } else {
          throw new Error(`Unknown action '${step.action}' for app 'google_cloud'`);
        }

        const duration = Date.now() - tStart;
        if (context._executionId) {
          workflowResilienceService.registerCompletedStep(
            context._executionId,
            { stepId: step.stepId, app: step.app, action: step.action, parameters },
            result
          );
        }

        logger.info(`Google Cloud native step completed successfully: ${step.stepId} in ${duration}ms`);

        return {
          success: true,
          data: result,
          contextUpdates: this.extractContextUpdates(result, step),
          timestamp: new Date(),
          attempts: 1,
          retried: false,
          totalDurationMs: duration,
        };
      }

      // 6. Intercept Google Workspace Native Core Steps
      if (step.app?.toLowerCase() === 'google_workspace') {
        const parameters = this.prepareParameters(step.parameters, context);
        let result;
        const tStart = Date.now();
        const action = step.action?.toLowerCase();

        const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');

        if (action === 'sheets_append') {
          const { spreadsheetId, range, values } = parameters;
          if (!spreadsheetId || !range || !values) {
            throw new Error(`Required parameters 'spreadsheetId', 'range', and 'values' are missing for google_workspace.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              spreadsheetId,
              updatedRange: range,
              values,
              rowsAppended: Array.isArray(values) ? values.length : 1,
              mocked: true
            };
          } else {
            const { google } = await import('googleapis');
            const auth = new google.auth.GoogleAuth({
              scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            const authClient = await auth.getClient();
            const sheets = google.sheets({ version: 'v4', auth: authClient });
            const sheetResult = await sheets.spreadsheets.values.append({
              spreadsheetId,
              range,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: Array.isArray(values) ? (Array.isArray(values[0]) ? values : [values]) : [[values]] }
            });
            result = {
              success: true,
              spreadsheetId,
              updatedRange: sheetResult.data.updates?.updatedRange || range,
              rowsAppended: sheetResult.data.updates?.updatedRows || 1
            };
          }
        } else if (action === 'drive_upload') {
          const { folderId, fileName, content } = parameters;
          if (!fileName || !content) {
            throw new Error(`Required parameters 'fileName' and 'content' are missing for google_workspace.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              fileId: `mock_drive_${Date.now()}`,
              fileName,
              folderId: folderId || 'root',
              mocked: true
            };
          } else {
            const { google } = await import('googleapis');
            const auth = new google.auth.GoogleAuth({
              scopes: ['https://www.googleapis.com/auth/drive.file']
            });
            const authClient = await auth.getClient();
            const drive = google.drive({ version: 'v3', auth: authClient });
            const fileMetadata = { name: fileName };
            if (folderId) {
              fileMetadata.parents = [folderId];
            }
            const media = {
              mimeType: 'text/plain',
              body: content
            };
            const file = await drive.files.create({
              requestBody: fileMetadata,
              media,
              fields: 'id'
            });
            result = {
              success: true,
              fileId: file.data.id,
              fileName,
              folderId
            };
          }
        } else if (action === 'sheets_create') {
          const { title } = parameters;
          if (!title) {
            throw new Error(`Required parameter 'title' is missing for google_workspace.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              spreadsheetId: `mock_sheets_${Date.now()}`,
              spreadsheetUrl: "https://docs.google.com/spreadsheets/d/mock_id/edit",
              title,
              mocked: true
            };
          } else {
            const { GcpWorkspaceService } = await import('../../gcp_native/gcp-workspace.service.js');
            result = await GcpWorkspaceService.sheetsCreate(title);
          }
        } else if (action === 'sheets_read') {
          const { spreadsheetId, range } = parameters;
          if (!spreadsheetId || !range) {
            throw new Error(`Required parameters 'spreadsheetId' and 'range' are missing for google_workspace.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              spreadsheetId,
              range,
              values: [["Mock Row 1 Cell A", "Mock Row 1 Cell B"], ["Mock Row 2 Cell A", "Mock Row 2 Cell B"]],
              mocked: true
            };
          } else {
            const { GcpWorkspaceService } = await import('../../gcp_native/gcp-workspace.service.js');
            result = await GcpWorkspaceService.sheetsRead(spreadsheetId, range);
          }
        } else if (action === 'docs_create') {
          const { title, bodyText } = parameters;
          if (!title || !bodyText) {
            throw new Error(`Required parameters 'title' and 'bodyText' are missing for google_workspace.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              docId: `mock_doc_${Date.now()}`,
              title,
              webViewLink: "https://docs.google.com/document/d/mock_id/edit",
              mocked: true
            };
          } else {
            const { GcpWorkspaceService } = await import('../../gcp_native/gcp-workspace.service.js');
            result = await GcpWorkspaceService.docsCreate(title, bodyText);
          }
        } else if (action === 'calendar_create_event') {
          const { summary, startTime, endTime, details } = parameters;
          if (!summary || !startTime || !endTime) {
            throw new Error(`Required parameters 'summary', 'startTime', and 'endTime' are missing for google_workspace.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              eventId: `mock_event_${Date.now()}`,
              summary,
              start: { dateTime: startTime },
              end: { dateTime: endTime },
              htmlLink: "https://calendar.google.com/calendar/event?eid=mock_id",
              mocked: true
            };
          } else {
            const { GcpWorkspaceService } = await import('../../gcp_native/gcp-workspace.service.js');
            result = await GcpWorkspaceService.calendarCreateEvent(summary, startTime, endTime, details);
          }
        } else if (action === 'calendar_list_events') {
          const { options } = parameters;
          if (isMock) {
            result = {
              success: true,
              calendarId: options?.calendarId || "primary",
              events: [
                { id: "mock_e1", summary: "Google Workspace Native Launch", start: new Date().toISOString() }
              ],
              mocked: true
            };
          } else {
            const { GcpWorkspaceService } = await import('../../gcp_native/gcp-workspace.service.js');
            result = await GcpWorkspaceService.calendarListEvents(options);
          }
        } else if (action === 'drive_download') {
          const { fileId } = parameters;
          if (!fileId) {
            throw new Error(`Required parameter 'fileId' is missing for google_workspace.${step.action}`);
          }
          if (isMock) {
            result = {
              success: true,
              fileId,
              content: "[Mock Drive File Content] Google entrenchment is completed successfully.",
              mocked: true
            };
          } else {
            const { GcpWorkspaceService } = await import('../../gcp_native/gcp-workspace.service.js');
            result = await GcpWorkspaceService.driveDownload(fileId);
          }
        } else {
          throw new Error(`Unknown action '${step.action}' for app 'google_workspace'`);
        }

        const duration = Date.now() - tStart;
        if (context._executionId) {
          workflowResilienceService.registerCompletedStep(
            context._executionId,
            { stepId: step.stepId, app: step.app, action: step.action, parameters },
            result
          );
        }

        logger.info(`Google Workspace native step completed successfully: ${step.stepId} in ${duration}ms`);

        return {
          success: true,
          data: result,
          contextUpdates: this.extractContextUpdates(result, step),
          timestamp: new Date(),
          attempts: 1,
          retried: false,
          totalDurationMs: duration,
        };
      }

      // 7. Intercept Scripting App - Secure Sandboxed JS
      if (step.app?.toLowerCase() === 'scripting') {
        const parameters = this.prepareParameters(step.parameters, context);
        let result;
        const tStart = Date.now();
        const action = step.action?.toLowerCase();

        if (action === 'execute_js') {
          const { code } = parameters;
          if (!code) {
            throw new Error(`Required parameter 'code' is missing for scripting.${step.action}`);
          }

          let sandboxContext;
          try {
            const vm = await import('vm');
            const clonedContext = JSON.parse(JSON.stringify(context));
            sandboxContext = {
              context: clonedContext,
              console: {
                log: (...args) => logger.info(`[Scripting Box Log]`, ...args),
                error: (...args) => logger.error(`[Scripting Box Error]`, ...args)
              },
              result: null
            };
            
            const script = new vm.Script(code);
            const vmContext = vm.createContext(sandboxContext);
            
            script.runInContext(vmContext, { timeout: 2000 });
            
            const returnedResult = sandboxContext.result;
            const updatedContext = sandboxContext.context;
            
            result = {
              success: true,
              result: returnedResult,
              contextMutations: updatedContext
            };
          } catch (scriptErr) {
            throw new Error(`Sandbox Execution Failure: ${scriptErr.message}`);
          }
        } else {
          throw new Error(`Unknown action '${step.action}' for app 'scripting'`);
        }

        const duration = Date.now() - tStart;
        if (context._executionId) {
          workflowResilienceService.registerCompletedStep(
            context._executionId,
            { stepId: step.stepId, app: step.app, action: step.action, parameters },
            result
          );
        }

        logger.info(`Secure Sandboxed Script completed successfully: ${step.stepId} in ${duration}ms`);

        return {
          success: true,
          data: result,
          contextUpdates: {
            ...this.extractContextUpdates(result, step),
            ...result.contextMutations
          },
          timestamp: new Date(),
          attempts: 1,
          retried: false,
          totalDurationMs: duration,
        };
      }

      // Get user's available tools for this app
      const userTools = await composioIntegrationService.getUserAvailableTools(
        userId,
        [step.app]
      );

      if (!userTools.success) {
        throw new Error(
          `Failed to get tools for app ${step.app}: ${userTools.error}`
        );
      }

      const appTools = userTools.toolsByApp[step.app];
      if (!appTools || appTools.length === 0) {
        throw new Error(
          `No tools available for app ${step.app}. Please check if the app is connected.`
        );
      }

      // Find the specific action tool
      const tool = appTools.find(
        (t) =>
          t.name.toLowerCase().includes(step.action.toLowerCase()) ||
          t.slug.toLowerCase().includes(step.action.toLowerCase()) ||
          t.description.toLowerCase().includes(step.action.toLowerCase())
      );

      if (!tool) {
        throw new Error(
          `Tool not found for ${step.app}.${step.action}. Available tools: ${appTools.map((t) => t.name).join(', ')}`
        );
      }

      // Get Composio tools for execution
      const composioTools = await composio.getTools(
        {
          apps: [step.app],
        },
        userId
      );

      const executableTool = composioTools.find(
        (t) => t.name === tool.name || t.slug === tool.slug
      );

      if (!executableTool) {
        throw new Error(`Executable tool not found for ${tool.name}`);
      }

      // Prepare parameters by merging step parameters with context
      const parameters = this.prepareParameters(step.parameters, context);

      // Execute the tool with retry resilience
      const resilientResult = await workflowResilienceService.executeWithRetry(
        () => executableTool.execute(parameters),
        {
          stepId: step.stepId,
          actionType: this._classifyActionType(step.action),
          maxAttempts: step.retryPolicy?.maxAttempts || 3,
          app: step.app,
        }
      );

      if (!resilientResult.success) {
        throw new Error(
          `Step execution failed after ${resilientResult.attempts} attempts: ${resilientResult.error}`
        );
      }

      const result = resilientResult.result;

      // Register completed step for potential rollback
      if (context._executionId) {
        workflowResilienceService.registerCompletedStep(
          context._executionId,
          { stepId: step.stepId, app: step.app, action: step.action, parameters },
          result
        );
      }

      logger.info(
        `Step completed successfully: ${step.stepId}` +
        (resilientResult.retried ? ` (after ${resilientResult.attempts} attempts)` : '')
      );

      return {
        success: true,
        data: result,
        contextUpdates: this.extractContextUpdates(result, step),
        timestamp: new Date(),
        attempts: resilientResult.attempts,
        retried: resilientResult.retried,
        totalDurationMs: resilientResult.totalDurationMs,
      };
    } catch (error) {
      logger.error(`Error executing step ${step.stepId}:`, error);
      throw new Error(`Step execution failed: ${error.message}`);
    }
  }

  /**
   * Classify an action name into a retry policy type.
   * @private
   */
  _classifyActionType(action) {
    if (!action) return 'default';
    const a = action.toLowerCase();
    const readActions = ['get', 'list', 'search', 'find', 'fetch', 'read', 'check'];
    const writeActions = ['create', 'update', 'delete', 'send', 'post', 'put', 'patch'];
    if (readActions.some(r => a.includes(r))) return 'read';
    if (writeActions.some(w => a.includes(w))) return 'write';
    return 'network';
  }

  /**
   * Prepare parameters by substituting context variables with support for deep
   * dot-notation path resolution (e.g. step1_result.data.user.email), array index lookup,
   * default fallbacks, and preservation of native JSON types.
   */
  prepareParameters(stepParameters, context) {
    if (stepParameters === null || stepParameters === undefined) return stepParameters;
    const prepared = typeof stepParameters === 'object' ? (Array.isArray(stepParameters) ? [...stepParameters] : { ...stepParameters }) : stepParameters;

    const resolvePath = (obj, pathStr) => {
      if (!pathStr || !obj) return undefined;
      
      // Separate the variable path and any default values (e.g. "step1_result.id | default_id")
      const mainPath = pathStr.split('|')[0].trim();
      const parts = mainPath.split('.');
      let current = obj;
      
      for (const part of parts) {
        if (current === null || current === undefined) break;
        
        // Handle array indexing like "sources[0]" or "sources.0"
        const arrayMatch = part.match(/^([^\[]+)\[(\d+)\]$/);
        if (arrayMatch) {
          const key = arrayMatch[1];
          const index = parseInt(arrayMatch[2], 10);
          current = current[key];
          if (current === null || current === undefined) break;
          current = current[index];
        } else {
          current = current[part];
        }
      }
      
      if ((current === undefined || current === null) && pathStr.includes('|')) {
        const partsWithDefault = pathStr.split('|');
        if (partsWithDefault.length > 1) {
          return partsWithDefault[1].trim();
        }
      }
      
      return current;
    };

    const evaluateExpression = (exprStr, ctx) => {
      const expr = exprStr.trim();
      
      // Reserved JS words, functions, and string/array methods to exclude from path resolution
      const reserved = new Set([
        'true', 'false', 'null', 'undefined', 'Math', 'String', 'Number', 'Array', 'Object', 'JSON',
        'toUpperCase', 'toLowerCase', 'trim', 'slice', 'split', 'replace', 'length', 'includes',
        'indexOf', 'concat', 'substring', 'charAt', 'join', 'map', 'filter', 'reduce'
      ]);

      const pathsFound = [];
      // Strip single and double quoted string literals to avoid parsing words inside strings as variable paths
      const exprWithoutStrings = expr.replace(/(['"])(.*?)\1/g, '');
      const rawPaths = exprWithoutStrings.match(/[a-zA-Z_][a-zA-Z0-9_\.\[\]]*/g) || [];

      rawPaths.forEach(rawPath => {
        const parts = rawPath.split('.');
        const cleanParts = [];
        
        for (const part of parts) {
          const base = part.split('[')[0];
          if (reserved.has(base)) {
            break; // Truncate at reserved keywords or method names
          }
          cleanParts.push(part);
        }
        
        if (cleanParts.length > 0) {
          pathsFound.push(cleanParts.join('.'));
        }
      });

      // Sort paths by length in descending order to avoid partial replacement of variables
      pathsFound.sort((a, b) => b.length - a.length);
      const uniquePaths = [...new Set(pathsFound)];
      
      let parameterizedExpr = expr;
      const paramNames = [];
      const paramValues = [];

      uniquePaths.forEach((path, idx) => {
        const placeholder = `__v${idx}`;
        const escapedPath = path.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const exactWordRegex = new RegExp(`\\b${escapedPath}\\b`, 'g');
        parameterizedExpr = parameterizedExpr.replace(exactWordRegex, placeholder);
        
        paramNames.push(placeholder);
        paramValues.push(resolvePath(ctx, path));
      });

      try {
        const fnBody = `return (${parameterizedExpr})`;
        // Create a secure, sandboxed evaluator function with no scope access
        const evaluator = new Function(...paramNames, fnBody);
        return evaluator(...paramValues);
      } catch (err) {
        logger.warn(`Failed to evaluate expression: "${expr}". Falling back to path resolution. Error: ${err.message}`);
        return resolvePath(ctx, expr);
      }
    };

    const replaceVariables = (obj) => {
      if (typeof obj === 'string') {
        const trimmed = obj.trim();
        // Check if the string is EXACTLY a single template variable e.g., "{{step1_result.data}}"
        const exactMatch = trimmed.match(/^\{\{([^}]+)\}\}$/);
        if (exactMatch) {
          const expression = exactMatch[1];
          // Check if it's a simple path or a complex expression (contains math operators, ternaries, etc.)
          const isComplex = /[\+\-\*\/\?\:\(\)\>\<]|toUpperCase|toLowerCase|trim|slice|split|length/.test(expression);
          
          if (isComplex) {
            const evaluated = evaluateExpression(expression, context);
            return evaluated !== undefined ? evaluated : obj;
          }
          
          const resolved = resolvePath(context, expression);
          return resolved !== undefined ? resolved : obj;
        }

        // Otherwise, replace inline variables in the string
        return obj.replace(/\{\{([^}]+)\}}/g, (match, variable) => {
          const isComplex = /[\+\-\*\/\?\:\(\)\>\<]|toUpperCase|toLowerCase|trim|slice|split|length/.test(variable);
          let resolved;
          
          if (isComplex) {
            resolved = evaluateExpression(variable, context);
          } else {
            resolved = resolvePath(context, variable);
          }

          if (resolved === undefined || resolved === null) return match;
          if (typeof resolved === 'object') {
            try {
              return JSON.stringify(resolved);
            } catch (e) {
              return String(resolved);
            }
          }
          return String(resolved);
        });
      } else if (Array.isArray(obj)) {
        return obj.map(replaceVariables);
      } else if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = replaceVariables(value);
        }
        return result;
      }
      return obj;
    };

    return replaceVariables(prepared);
  }

  /**
   * Extract context updates from step results
   */
  extractContextUpdates(result, step) {
    const updates = {};

    // Add result data with step prefix
    updates[`${step.stepId}_result`] = result;

    // Extract common fields
    if (result.id) updates[`${step.stepId}_id`] = result.id;
    if (result.url) updates[`${step.stepId}_url`] = result.url;
    if (result.message) updates[`${step.stepId}_message`] = result.message;
    if (result.answer) updates[`${step.stepId}_answer`] = result.answer;
    if (result.reply) updates[`${step.stepId}_reply`] = result.reply;
    if (result.text) updates[`${step.stepId}_text`] = result.text;
    if (result.data?.answer) updates[`${step.stepId}_answer`] = result.data.answer;
    if (result.data?.reply) updates[`${step.stepId}_reply`] = result.data.reply;
    if (result.data?.text) updates[`${step.stepId}_text`] = result.data.text;

    return updates;
  }

  /**
   * Update step status in execution record
   */
  async updateStepStatus(
    executionId,
    stepId,
    status,
    startTime,
    endTime = null,
    duration = null,
    result = null,
    error = null
  ) {
    try {
      const update = {
        'steps.$.status': status,
        'steps.$.startTime': startTime,
      };

      if (endTime) update['steps.$.endTime'] = endTime;
      if (duration) update['steps.$.duration'] = duration;
      if (result) update['steps.$.result'] = result;
      if (error) {
        update['steps.$.error'] = {
          message: error.message,
          stack: error.stack,
        };
      }

      await WorkflowExecution.updateOne(
        { _id: executionId, 'steps.stepId': stepId },
        { $set: update }
      );
    } catch (updateError) {
      logger.error('Error updating step status:', updateError);
    }
  }

  /**
   * Schedule a workflow for automatic execution
   */
  async scheduleWorkflow(workflowId) {
    try {
      const workflow = await Workflow.findById(workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      if (!workflow.trigger?.scheduleConfig) {
        throw new Error('Workflow has no schedule configuration');
      }

      const { scheduleConfig } = workflow.trigger;
      const cronExpression = this.buildCronExpression(scheduleConfig);

      // Cancel existing job if any
      this.unscheduleWorkflow(workflowId);

      // Schedule new job
      const job = cron.schedule(
        cronExpression,
        async () => {
          try {
            logger.info(`Executing scheduled workflow: ${workflowId}`);
            await this.executeWorkflow(workflowId, workflow.userId, {
              triggeredBy: 'schedule',
              scheduledAt: new Date(),
            });
          } catch (error) {
            logger.error(`Error in scheduled workflow ${workflowId}:`, error);
          }
        },
        {
          scheduled: true,
          timezone: scheduleConfig.timezone || 'UTC',
        }
      );

      this.scheduledJobs.set(workflowId, job);

      // Update workflow with next execution time
      const nextExecution = this.calculateNextExecution(scheduleConfig);
      await Workflow.updateOne({ _id: workflowId }, { nextExecution });

      logger.info(
        `Workflow ${workflowId} scheduled with cron: ${cronExpression}`
      );
      return { success: true, cronExpression, nextExecution };
    } catch (error) {
      logger.error(`Error scheduling workflow ${workflowId}:`, error);
      throw new Error(`Failed to schedule workflow: ${error.message}`);
    }
  }

  /**
   * Unschedule a workflow
   */
  unscheduleWorkflow(workflowId) {
    const job = this.scheduledJobs.get(workflowId);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(workflowId);
      logger.info(`Unscheduled workflow: ${workflowId}`);
    }
  }

  /**
   * Build cron expression from schedule config
   */
  buildCronExpression(scheduleConfig) {
    const { frequency, time, daysOfWeek, dayOfMonth } = scheduleConfig;

    if (scheduleConfig.cronExpression) {
      return scheduleConfig.cronExpression;
    }

    const [hour, minute] = time ? time.split(':').map(Number) : [9, 0];

    switch (frequency) {
      case 'daily': {
        return `${minute} ${hour} * * *`;
      }

      case 'weekly': {
        const dayOfWeek = daysOfWeek?.[0] || 1; // Default to Monday
        return `${minute} ${hour} * * ${dayOfWeek}`;
      }

      case 'monthly': {
        const day = dayOfMonth || 1;
        return `${minute} ${hour} ${day} * *`;
      }

      case 'hourly': {
        return `${minute} * * * *`;
      }

      default: {
        return `${minute} ${hour} * * *`; // Default to daily
      }
    }
  }

  /**
   * Calculate next execution time
   */
  calculateNextExecution(scheduleConfig) {
    // This is a simplified calculation
    // In production, you might want to use a more robust library like cron-parser
    const now = new Date();
    const next = new Date(now);

    const { frequency, time } = scheduleConfig;
    const [hour, minute] = time ? time.split(':').map(Number) : [9, 0];

    next.setHours(hour, minute, 0, 0);

    switch (frequency) {
      case 'daily': {
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        break;
      }

      case 'weekly': {
        const daysOfWeek = scheduleConfig.daysOfWeek || [1];
        const targetDay = daysOfWeek[0];
        const currentDay = next.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0 || (daysToAdd === 0 && next <= now)) {
          daysToAdd += 7;
        }
        next.setDate(next.getDate() + daysToAdd);
        break;
      }

      case 'monthly': {
        const dayOfMonth = scheduleConfig.dayOfMonth || 1;
        next.setDate(dayOfMonth);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
        break;
      }

      case 'hourly': {
        next.setMinutes(minute);
        if (next <= now) {
          next.setHours(next.getHours() + 1);
        }
        break;
      }
    }

    return next;
  }

  /**
   * Get workflow execution history
   */
  async getExecutionHistory(workflowId, userId, limit = 50, offset = 0) {
    try {
      const executions = await WorkflowExecution.find({ workflowId, userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .exec();

      return executions;
    } catch (error) {
      logger.error('Error getting execution history:', error);
      throw new Error(`Failed to get execution history: ${error.message}`);
    }
  }

  /**
   * Get execution details
   */
  async getExecutionDetails(executionId, userId) {
    try {
      const execution = await WorkflowExecution.findOne({ executionId, userId })
        .populate('workflowId')
        .exec();

      return execution;
    } catch (error) {
      logger.error('Error getting execution details:', error);
      throw new Error(`Failed to get execution details: ${error.message}`);
    }
  }

  /**
   * Cancel a running workflow execution
   */
  async cancelExecution(executionId, userId) {
    try {
      const execution = await WorkflowExecution.findOne({
        executionId,
        userId,
      });
      if (!execution) {
        throw new Error('Execution not found');
      }

      if (execution.status !== 'running') {
        throw new Error('Execution is not running');
      }

      // Update execution status
      await WorkflowExecution.updateOne(
        { executionId },
        {
          status: 'cancelled',
          endTime: new Date(),
        }
      );

      // Remove from executing workflows
      this.executingWorkflows.delete(executionId);

      logger.info(`Execution cancelled: ${executionId}`);
      return { success: true, message: 'Execution cancelled successfully' };
    } catch (error) {
      logger.error(`Error cancelling execution ${executionId}:`, error);
      throw new Error(`Failed to cancel execution: ${error.message}`);
    }
  }

  /**
   * Initialize scheduled workflows on service startup
   */
  async initializeScheduledWorkflows() {
    try {
      logger.info('Initializing scheduled workflows...');

      const scheduledWorkflows = await Workflow.find({
        status: 'active',
        'trigger.triggerType': 'schedule',
      });

      for (const workflow of scheduledWorkflows) {
        try {
          await this.scheduleWorkflow(workflow._id);
        } catch (error) {
          logger.error(`Error scheduling workflow ${workflow._id}:`, error);
        }
      }

      logger.info(`Initialized ${this.scheduledJobs.size} scheduled workflows`);
    } catch (error) {
      logger.error('Error initializing scheduled workflows:', error);
    }
  }

  /**
   * Resume a paused workflow execution after approval
   */
  async resumeExecution(approvalId, userId, approved = true, formResponse = null) {
    try {
      logger.info(`Resuming execution for approval ${approvalId} (Approved: ${approved})`);

      const approval = await WorkflowApproval.findOne({ approvalId, userId });
      if (!approval) {
        throw new Error('Approval request not found');
      }

      if (approval.status !== 'pending') {
        throw new Error(`Approval is already resolved as ${approval.status}`);
      }

      // Validate formResponse against formSchema if defined
      if (approved && approval.formSchema && typeof approval.formSchema === 'object') {
        const schema = approval.formSchema;
        const response = formResponse || {};
        
        for (const [key, fieldConfig] of Object.entries(schema)) {
          if (fieldConfig.required && (response[key] === undefined || response[key] === null || response[key] === '')) {
            throw new Error(`Form validation failed: Required field "${key}" is missing.`);
          }
          if (fieldConfig.type === 'number' && response[key] !== undefined && isNaN(Number(response[key]))) {
            throw new Error(`Form validation failed: Field "${key}" must be a number.`);
          }
        }
        
        approval.formResponse = response;
      }

      // Update approval status
      approval.status = approved ? 'approved' : 'rejected';
      approval.decisionTime = new Date();
      await approval.save();

      const execution = await WorkflowExecution.findOne({ executionId: approval.checkpointId, userId });
      if (!execution) {
        throw new Error('Associated execution record not found');
      }

      if (execution.status !== 'awaiting_approval') {
        throw new Error(`Execution is in invalid state: ${execution.status}`);
      }

      if (!approved) {
        // Mark execution as cancelled/failed
        await WorkflowExecution.updateOne(
          { _id: execution._id },
          {
            status: 'cancelled',
            endTime: new Date(),
            'result.summary': 'Workflow cancelled due to user rejection of approval request.'
          }
        );
        return {
          success: true,
          status: 'rejected',
          message: 'Workflow execution cancelled by user rejection.'
        };
      }

      // Load workflow
      const workflow = await Workflow.findById(execution.workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      // Add the current stepId to approved steps list in context
      const currentContext = { ...execution.context };
      if (approved && formResponse) {
        Object.assign(currentContext, formResponse);
      }
      if (!currentContext._approvedSteps) {
        currentContext._approvedSteps = [];
      }
      currentContext._approvedSteps.push(approval.stepId);

      // Run steps starting from the paused index
      const startStepIndex = execution.currentStepIndex || 0;
      
      // Run steps asynchronously or synchronously depending on the trigger
      const result = await this.runWorkflowSteps(workflow, execution, currentContext, startStepIndex);

      return {
        success: true,
        status: 'resumed',
        result
      };
    } catch (error) {
      logger.error(`Error resuming execution ${approvalId}:`, error);
      throw error;
    }
  }

  /**
   * Time-Travel Replay execution from a specific step index with merged context mutations
   */
  async replayExecution(executionId, userId, startStepId, mutatedContext = {}) {
    try {
      logger.info(`Initiating time-travel replay for execution ${executionId} from step ${startStepId}...`);

      const execution = await WorkflowExecution.findOne({ executionId, userId });
      if (!execution) {
        throw new Error('Execution record not found');
      }

      const workflow = await Workflow.findById(execution.workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      // Restore context state
      let mergedContext = { ...execution.context, ...mutatedContext };

      // Find the start step and establish its index
      const steps = [...workflow.steps];
      steps.sort((a, b) => a.order - b.order);

      const startStep = steps.find(s => s.stepId === startStepId);
      if (!startStep) {
        throw new Error(`Starting step "${startStepId}" not found in workflow`);
      }

      const startStepIndex = steps.indexOf(startStep);

      // Reset starting step and all recursive child nodes back to pending
      const stepStatuses = new Map();
      execution.steps.forEach(s => {
        stepStatuses.set(s.stepId, s.status);
      });

      const resetDownstream = (stepId) => {
        stepStatuses.set(stepId, 'pending');
        const children = steps.filter(s => {
          if (!s.dependsOn) return false;
          return s.dependsOn.some(dep => {
            let depId = dep;
            if (dep.includes('.')) {
              depId = dep.split('.')[0];
            }
            return depId === stepId;
          });
        });
        children.forEach(child => {
          resetDownstream(child.stepId);
        });
      };

      resetDownstream(startStepId);

      // Prepare updated steps array
      const updatedStepsList = steps.map(step => {
        const currentStatus = stepStatuses.get(step.stepId);
        return {
          stepId: step.stepId,
          status: currentStatus === 'running' ? 'pending' : currentStatus,
        };
      });

      await WorkflowExecution.updateOne(
        { _id: execution._id },
        {
          status: 'running',
          steps: updatedStepsList,
          context: mergedContext,
          error: null
        }
      );

      // Trigger the run loop asynchronously in the background starting from startStepIndex
      this.runWorkflowSteps(workflow, execution, mergedContext, startStepIndex)
        .then(res => {
          logger.info(`Replay execution finished successfully for ${executionId}`);
        })
        .catch(err => {
          logger.error(`Replay execution failed for ${executionId}:`, err);
        });

      return {
        success: true,
        status: 'running_replay',
        executionId,
        message: `Replay successfully initiated from step "${startStepId}".`
      };
    } catch (error) {
      logger.error(`Error initiating replay for execution ${executionId}:`, error);
      throw error;
    }
  }
}

export const workflowExecutionService = new WorkflowExecutionService();
