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
        triggerType: 'manual',
        totalSteps: workflow.steps.length,
        context,
      });

      await execution.save();

      // Execute the workflow
      const result = await this.runWorkflowSteps(workflow, execution, context);

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
        const pendingSteps = steps.filter((s) => stepStatuses.get(s.stepId) === 'pending');
        
        if (pendingSteps.length === 0) {
          break; // All steps completed or handled successfully
        }

        // Find steps whose dependencies are all successfully completed
        const eligibleSteps = pendingSteps.filter((step) => {
          return step.dependsOn.every((depId) => stepStatuses.get(depId) === 'completed');
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

            // Execute step and record output updates
            const stepResult = await this.executeStep(step, currentContext, workflow.userId);

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
          } catch (stepError) {
            logger.error(`[DAG Step Worker] Error in step ${step.stepId}:`, stepError);

            const stepEndTime = new Date();
            const duration = stepEndTime - stepStartTime;

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
      logger.info(`Executing step: ${step.app}.${step.action}`);

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

        if (action === 'vertex_ai_generate') {
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
    const prepared = { ...stepParameters };

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

    const replaceVariables = (obj) => {
      if (typeof obj === 'string') {
        const trimmed = obj.trim();
        // Check if the string is EXACTLY a single template variable e.g., "{{step1_result.data}}"
        const exactMatch = trimmed.match(/^\{\{([^}]+)\}\}$/);
        if (exactMatch) {
          const resolved = resolvePath(context, exactMatch[1]);
          return resolved !== undefined ? resolved : obj;
        }

        // Otherwise, replace inline variables in the string
        return obj.replace(/\{\{([^}]+)\}}/g, (match, variable) => {
          const resolved = resolvePath(context, variable);
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
  async resumeExecution(approvalId, userId, approved = true) {
    try {
      logger.info(`Resuming execution for approval ${approvalId} (Approved: ${approved})`);

      const approval = await WorkflowApproval.findOne({ approvalId, userId });
      if (!approval) {
        throw new Error('Approval request not found');
      }

      if (approval.status !== 'pending') {
        throw new Error(`Approval is already resolved as ${approval.status}`);
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
}

export const workflowExecutionService = new WorkflowExecutionService();
