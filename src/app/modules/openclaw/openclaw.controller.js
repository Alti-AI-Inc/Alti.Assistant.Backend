import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { OpenClawService } from './openclaw.service.js';

const createAgent = catchAsync(async (req, res) => {
  const result = await OpenClawService.createAgent(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'OpenClaw persistent daemon spawned.',
    data: result,
  });
});

const getAgent = catchAsync(async (req, res) => {
  const result = await OpenClawService.getAgent(req.params.agentId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OpenClaw agent state retrieved.',
    data: result,
  });
});

const sendMessage = catchAsync(async (req, res) => {
  const { message } = req.body;
  const result = await OpenClawService.sendMessage(req.params.agentId, message, req.user?.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent responded.',
    data: result,
  });
});

const listSkills = catchAsync(async (req, res) => {
  const result = await OpenClawService.listSkills();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OpenClaw skills listed.',
    data: result,
  });
});

const executeSkill = catchAsync(async (req, res) => {
  const { skillId, params } = req.body;
  const result = await OpenClawService.executeSkill(skillId, params);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Skill ${skillId} executed.`,
    data: result,
  });
});

const crawlUrl = catchAsync(async (req, res) => {
  const { url } = req.body;
  const result = await OpenClawService.crawlUrl(url);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Crawl completed.',
    data: result,
  });
});

const analyzeRepository = catchAsync(async (req, res) => {
  const { repoUrl, query } = req.body;
  
  // Delegate orchestration to Temporal Service natively
  const { TemporalService } = await import('../temporal/temporal.service.js');
  
  // collectionId isolates vector data for this specific intelligence run
  const collectionId = `repo-${Date.now()}`;
  
  const { workflowId, status } = await TemporalService.startWorkflow({
    workflowType: 'repositoryIntelligenceWorkflow',
    args: [repoUrl, query, collectionId]
  });

  sendResponse(res, {
    statusCode: httpStatus.ACCEPTED,
    success: true,
    message: 'Private Repository Intelligence engine started.',
    data: { workflowId, status, collectionId, repoUrl },
  });
});

export const OpenClawController = {
  createAgent,
  getAgent,
  sendMessage,
  listSkills,
  executeSkill,
  crawlUrl,
  analyzeRepository,
};

export default OpenClawController;

const queueEdgeCommand = catchAsync(async (req, res) => {
  const { machineId, command, payload } = req.body;
  const result = await OpenClawService.queueEdgeCommand(machineId, command, payload);
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'Edge command queued', data: result });
});

const pollEdgeCommands = catchAsync(async (req, res) => {
  const { machineId } = req.params;
  const result = await OpenClawService.pollEdgeCommands(machineId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: result ? 'Command found' : 'No commands in queue', data: result });
});

const submitEdgeResult = catchAsync(async (req, res) => {
  const { commandId } = req.params;
  const { result, error } = req.body;
  const commandRecord = await OpenClawService.submitEdgeResult(commandId, result, error);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Edge result recorded', data: commandRecord });
});

OpenClawController.queueEdgeCommand = queueEdgeCommand;
OpenClawController.pollEdgeCommands = pollEdgeCommands;
OpenClawController.submitEdgeResult = submitEdgeResult;

const orchestrateAgi = catchAsync(async (req, res) => {
  const { prompt, machineId } = req.body;
  
  const { TemporalService } = await import('../temporal/temporal.service.js');
  
  const { workflowId, status } = await TemporalService.startWorkflow({
    workflowType: 'advancedAgiWorkflow',
    args: [prompt, { machineId }]
  });

  sendResponse(res, {
    statusCode: httpStatus.ACCEPTED,
    success: true,
    message: 'Advanced AGI Master Orchestrator (World Best) engaged.',
    data: { workflowId, status, prompt },
  });
});

OpenClawController.orchestrateAgi = orchestrateAgi;
