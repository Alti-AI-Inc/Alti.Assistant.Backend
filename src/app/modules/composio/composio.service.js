import composioClient from './composio.client.js';
import axios from 'axios';
import config from '../../../../config/index.js';

const composioApi = axios.create({
  baseURL: config.composio.baseUrl,
  headers: {
    'x-api-key': config.composio.apiKey,
    'Content-Type': 'application/json',
  },
});

const createSession = async (userId, options = {}) => {
  const response = await composioApi.post('/api/v3.1/tool_router/session', {
    user_id: userId,
    ...options
  });
  return response.data;
};

const getSession = async (sessionId) => {
  const response = await composioApi.get(`/api/v3.1/tool_router/session/${sessionId}`);
  return response.data;
};

const deleteSession = async (sessionId) => {
  const response = await composioApi.delete(`/api/v3.1/tool_router/session/${sessionId}`);
  return response.data;
};

const listToolkits = async (options = {}) => {
  return await composioClient.app.list(options);
};

const getToolkit = async (slug) => {
  return await composioClient.app.get(slug);
};

const listTools = async (options = {}) => {
  return await composioClient.action.list(options);
};

const executeTool = async (toolSlug, params, sessionId) => {
  return await composioClient.action.execute(toolSlug, params);
};

const searchTools = async (sessionId, query) => {
  const response = await composioApi.post(`/api/v3.1/tool_router/session/${sessionId}/search`, { query });
  return response.data;
};

const listConnectedAccounts = async (userId) => {
  return await composioClient.connectedAccounts.get(userId);
};

const initiateConnection = async (userId, toolkit) => {
  const response = await composioApi.post('/api/v3.1/connected_accounts', {
    user_id: userId,
    toolkit: toolkit
  });
  return response.data;
};

const getConnectionStatus = async (nanoid) => {
  return await composioClient.connectedAccounts.get(nanoid);
};

const revokeConnection = async (nanoid) => {
  return await composioClient.connectedAccounts.delete(nanoid);
};

const listTriggerTypes = async () => {
  return await composioClient.trigger.list();
};

const subscribeTrigger = async (slug, triggerConfig) => {
  return await composioClient.trigger.subscribe(slug, triggerConfig);
};

const listActiveTriggers = async () => {
  const response = await composioApi.get('/api/v3.1/trigger_instances/active');
  return response.data;
};

const deleteTrigger = async (triggerId) => {
  return await composioClient.trigger.delete(triggerId);
};

const getMCPUrl = async (userId) => {
  const response = await composioApi.post('/api/v3.1/tool_router/session', { user_id: userId, mcp: true });
  return response.data;
};

const listMCPServers = async () => {
  const response = await composioApi.get('/api/v3.1/mcp/servers');
  return response.data;
};

const listAuthConfigs = async () => {
  const response = await composioApi.get('/api/v3.1/auth_configs');
  return response.data;
};

const getAuthConfig = async (nanoid) => {
  const response = await composioApi.get(`/api/v3.1/auth_configs/${nanoid}`);
  return response.data;
};

const executeProxy = async (proxyParams) => {
  const response = await composioApi.post('/api/v3.1/tools/execute/proxy', proxyParams);
  return response.data;
};

export const ComposioService = {
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

export default ComposioService;
