import crypto from 'crypto';
import { logger } from '../../../shared/logger.js';
import Workflow, { WorkflowRun } from './workflows.model.js';

export const WorkflowService = {
  createWorkflow: async (userId, config) => {
    const workflow = new Workflow({ ...config, createdBy: userId });
    return await workflow.save();
  },
  
  listWorkflows: async (userId, { page = 1, limit = 10, status }) => {
    const query = { createdBy: userId };
    if (status) query.status = status;
    const skip = (page - 1) * limit;
    
    const workflows = await Workflow.find(query).skip(skip).limit(limit).sort({ createdAt: -1 });
    const total = await Workflow.countDocuments(query);
    
    return { workflows, meta: { page, limit, total } };
  },
  
  getWorkflow: async (workflowId) => {
    return await Workflow.findById(workflowId).populate('steps.agentId', 'name');
  },
  
  updateWorkflow: async (workflowId, updates) => {
    return await Workflow.findByIdAndUpdate(workflowId, updates, { new: true });
  },
  
  deleteWorkflow: async (workflowId) => {
    return await Workflow.findByIdAndUpdate(workflowId, { status: 'archived' }, { new: true });
  },
  
  updateStatus: async (workflowId, status) => {
    return await Workflow.findByIdAndUpdate(workflowId, { status }, { new: true });
  },
  
  executeWorkflow: async (workflowId, input, userId) => {
    const workflow = await Workflow.findById(workflowId);
    if (!workflow) throw new Error('Workflow not found');
    
    const runId = crypto.randomUUID();
    const run = new WorkflowRun({
      workflowId,
      runId,
      status: 'running',
      input,
      currentStep: 0,
      startedAt: new Date(),
      userId
    });
    await run.save();
    
    let previousOutput = input;
    const startTime = Date.now();
    
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const stepStartTime = Date.now();
      let stepStatus = 'completed';
      let stepError = null;
      let stepOutput = null;
      
      try {
        if (step.type === 'agent') {
          // Dynamically import AgentService
          const { default: AgentService } = await import('../agents/agents.service.js');
          stepOutput = await AgentService.executeAgent(step.agentId, previousOutput);
        } else if (step.type === 'condition') {
          // evaluate step.config.expression against previousOutput
          stepOutput = previousOutput; // placeholder implementation
        } else if (step.type === 'loop') {
          // repeat the specified steps step.config.count times
          stepOutput = previousOutput; // placeholder implementation
        } else if (step.type === 'delay') {
          const delayMs = step.config?.durationMs || 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
          stepOutput = previousOutput;
        } else if (step.type === 'approval') {
          run.status = 'awaiting_approval';
          run.currentStep = i;
          await run.save();
          return { runId, status: 'awaiting_approval', stepResults: run.stepResults };
        } else if (step.type === 'transform') {
          // apply step.config.template to previousOutput
          let transformed = JSON.stringify(step.config?.template || {});
          for (const key in previousOutput) {
            transformed = transformed.replace(new RegExp(`{{${key}}}`, 'g'), previousOutput[key]);
          }
          try {
            stepOutput = JSON.parse(transformed);
          } catch (e) {
            stepOutput = transformed;
          }
        }
      } catch (err) {
        stepStatus = 'failed';
        stepError = err.message;
        if (step.onFailure === 'abort') {
           run.status = 'failed';
           run.stepResults.push({
             stepIndex: i,
             status: stepStatus,
             input: previousOutput,
             output: stepOutput,
             durationMs: Date.now() - stepStartTime,
             error: stepError
           });
           await run.save();
           return {
             runId,
             status: 'failed',
             output: previousOutput,
             durationMs: Date.now() - startTime,
             stepResults: run.stepResults
           };
        }
      }
      
      previousOutput = stepOutput || previousOutput;
      run.stepResults.push({
        stepIndex: i,
        status: stepStatus,
        input: previousOutput,
        output: stepOutput,
        durationMs: Date.now() - stepStartTime,
        error: stepError
      });
    }
    
    run.status = 'completed';
    run.output = previousOutput;
    run.completedAt = new Date();
    await run.save();
    
    workflow.lastRunAt = new Date();
    workflow.runCount += 1;
    await workflow.save();
    
    return {
      runId,
      status: 'completed',
      output: previousOutput,
      durationMs: Date.now() - startTime,
      stepResults: run.stepResults
    };
  },
  
  approveStep: async (workflowId, runId, decision) => {
    const run = await WorkflowRun.findOne({ workflowId, runId });
    if (!run || run.status !== 'awaiting_approval') {
      throw new Error('Run not awaiting approval');
    }
    
    if (decision === 'reject') {
      run.status = 'cancelled';
      await run.save();
      return run;
    }
    
    run.status = 'running';
    await run.save();
    return run;
  },
  
  getWorkflowRuns: async (workflowId, { page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;
    const runs = await WorkflowRun.find({ workflowId }).skip(skip).limit(limit).sort({ createdAt: -1 });
    const total = await WorkflowRun.countDocuments({ workflowId });
    
    return { runs, meta: { page, limit, total } };
  },
  
  executeWorkflowStream: async (workflowId, input, userId, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    res.write(`data: ${JSON.stringify({ status: 'started', workflowId })}\n\n`);
    try {
      const result = await WorkflowService.executeWorkflow(workflowId, input, userId);
      res.write(`data: ${JSON.stringify({ status: 'completed', result })}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({ status: 'error', error: error.message })}\n\n`);
    }
    res.end();
  }
};

export default WorkflowService;
