import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { AgentService } from './agents.service.js';

const createAgent = catchAsync(async (req, res) => {
  const result = await AgentService.createAgent(req.user.id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Agent created successfully',
    data: result,
  });
});

const listAgents = catchAsync(async (req, res) => {
  const result = await AgentService.listAgents(req.user.id, req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agents retrieved successfully',
    data: result,
  });
});

const getAgent = catchAsync(async (req, res) => {
  const result = await AgentService.getAgent(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent retrieved successfully',
    data: result,
  });
});

const updateAgent = catchAsync(async (req, res) => {
  const result = await AgentService.updateAgent(req.params.id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent updated successfully',
    data: result,
  });
});

const deleteAgent = catchAsync(async (req, res) => {
  const result = await AgentService.deleteAgent(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent deleted successfully',
    data: result,
  });
});

const executeAgent = catchAsync(async (req, res) => {
  const { input } = req.body;
  const result = await AgentService.executeAgent(req.params.id, input, req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent executed successfully',
    data: result,
  });
});

const executeAgentStream = catchAsync(async (req, res) => {
  const { input } = req.body;
  const stream = await AgentService.executeAgentStream(req.params.id, input, req.user.id);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

const spawnSwarm = catchAsync(async (req, res) => {
  const { inputs } = req.body;
  const result = await AgentService.spawnSwarm(req.params.id, inputs, req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Swarm spawned successfully',
    data: result,
  });
});

const getAgentRuns = catchAsync(async (req, res) => {
  const result = await AgentService.getAgentRuns(req.params.id, req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent runs retrieved successfully',
    data: result,
  });
});

const getRunDetails = catchAsync(async (req, res) => {
  const result = await AgentService.getRunDetails(req.params.id, req.params.runId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Run details retrieved successfully',
    data: result,
  });
});

const duplicateAgent = catchAsync(async (req, res) => {
  const result = await AgentService.duplicateAgent(req.params.id, req.user.id);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Agent duplicated successfully',
    data: result,
  });
});

const updateStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const result = await AgentService.updateStatus(req.params.id, status);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent status updated successfully',
    data: result,
  });
});

export const AgentController = {
  createAgent,
  listAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  executeAgent,
  executeAgentStream,
  spawnSwarm,
  getAgentRuns,
  getRunDetails,
  duplicateAgent,
  updateStatus,
};
