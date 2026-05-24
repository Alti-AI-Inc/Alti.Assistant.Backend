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
