import { ComposioService } from './composio.service.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';

const createSession = catchAsync(async (req, res) => {
  const result = await ComposioService.createSession(req.user.id, req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Session created successfully',
    data: result,
  });
});

const getSession = catchAsync(async (req, res) => {
  const result = await ComposioService.getSession(req.params.sessionId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Session fetched successfully',
    data: result,
  });
});

const deleteSession = catchAsync(async (req, res) => {
  const result = await ComposioService.deleteSession(req.params.sessionId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Session deleted successfully',
    data: result,
  });
});

const listToolkits = catchAsync(async (req, res) => {
  const result = await ComposioService.listToolkits(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Toolkits fetched successfully',
    data: result,
  });
});

const getToolkit = catchAsync(async (req, res) => {
  const result = await ComposioService.getToolkit(req.params.slug);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Toolkit fetched successfully',
    data: result,
  });
});

const listTools = catchAsync(async (req, res) => {
  const result = await ComposioService.listTools(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tools fetched successfully',
    data: result,
  });
});

const executeTool = catchAsync(async (req, res) => {
  const { toolSlug } = req.params;
  const { params, sessionId } = req.body;
  const result = await ComposioService.executeTool(toolSlug, params, sessionId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tool executed successfully',
    data: result,
  });
});

const searchTools = catchAsync(async (req, res) => {
  const { sessionId, query } = req.body;
  const result = await ComposioService.searchTools(sessionId, query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Tools searched successfully',
    data: result,
  });
});

const listConnectedAccounts = catchAsync(async (req, res) => {
  const result = await ComposioService.listConnectedAccounts(req.user.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Connected accounts fetched successfully',
    data: result,
  });
});

const initiateConnection = catchAsync(async (req, res) => {
  const { toolkit } = req.body;
  const result = await ComposioService.initiateConnection(req.user.id, toolkit);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Connection initiated successfully',
    data: result,
  });
});

const getConnectionStatus = catchAsync(async (req, res) => {
  const result = await ComposioService.getConnectionStatus(req.params.nanoid);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Connection status fetched successfully',
    data: result,
  });
});

const revokeConnection = catchAsync(async (req, res) => {
  const result = await ComposioService.revokeConnection(req.params.nanoid);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Connection revoked successfully',
    data: result,
  });
});

const listTriggerTypes = catchAsync(async (req, res) => {
  const result = await ComposioService.listTriggerTypes();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Trigger types fetched successfully',
    data: result,
  });
});

const subscribeTrigger = catchAsync(async (req, res) => {
  const { slug, config } = req.body;
  const result = await ComposioService.subscribeTrigger(slug, config);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Trigger subscribed successfully',
    data: result,
  });
});

const listActiveTriggers = catchAsync(async (req, res) => {
  const result = await ComposioService.listActiveTriggers();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Active triggers fetched successfully',
    data: result,
  });
});

const deleteTrigger = catchAsync(async (req, res) => {
  const result = await ComposioService.deleteTrigger(req.params.triggerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Trigger deleted successfully',
    data: result,
  });
});

const getMCPUrl = catchAsync(async (req, res) => {
  const result = await ComposioService.getMCPUrl(req.user.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'MCP URL fetched successfully',
    data: result,
  });
});

const listMCPServers = catchAsync(async (req, res) => {
  const result = await ComposioService.listMCPServers();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'MCP servers fetched successfully',
    data: result,
  });
});

const listAuthConfigs = catchAsync(async (req, res) => {
  const result = await ComposioService.listAuthConfigs();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Auth configurations fetched successfully',
    data: result,
  });
});

const getAuthConfig = catchAsync(async (req, res) => {
  const result = await ComposioService.getAuthConfig(req.params.nanoid);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Auth configuration fetched successfully',
    data: result,
  });
});

const executeProxy = catchAsync(async (req, res) => {
  const result = await ComposioService.executeProxy(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Proxy execution completed',
    data: result,
  });
});

export const ComposioController = {
  createSession,
  getSession,
  deleteSession,
  listToolkits,
  getToolkit,
  listTools,
  executeTool,
  searchTools,
  listConnectedAccounts,
  initiateConnection,
  getConnectionStatus,
  revokeConnection,
  listTriggerTypes,
  subscribeTrigger,
  listActiveTriggers,
  deleteTrigger,
  getMCPUrl,
  listMCPServers,
  listAuthConfigs,
  getAuthConfig,
  executeProxy,
};
