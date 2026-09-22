import composioClient from './composio.client.js';
import axios from 'axios';
import withRetry from '../../../shared/axiosRetry.js';
import config from '../../../../config/index.js';

const composioApi = withRetry(axios.create({
  baseURL: config.composio.baseUrl,
  headers: {
    'x-api-key': config.composio.apiKey,
    'Content-Type': 'application/json',
  },
}), 'composio');

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

// ── Tools: get single, input schema, required scopes ─────────────────────────

const getTool = async (toolSlug, options = {}) => {
  const response = await composioApi.get(`/api/v3.1/tools/${toolSlug}`, { params: options });
  return response.data;
};

const getToolInputSchema = async (toolSlug, body = {}) => {
  const response = await composioApi.post(`/api/v3.1/tools/execute/${toolSlug}/input`, body);
  return response.data;
};

const getRequiredScopes = async (body) => {
  const response = await composioApi.post('/api/v3.1/tools/scopes/required', body);
  return response.data;
};

// ── Connected Accounts: refresh ──────────────────────────────────────────────

const refreshConnection = async (nanoid) => {
  const response = await composioApi.post(`/api/v3.1/connected_accounts/${nanoid}/refresh`);
  return response.data;
};

// ── Auth Configs: create, update, delete ─────────────────────────────────────

const createAuthConfig = async (payload) => {
  const response = await composioApi.post('/api/v3.1/auth_configs', payload);
  return response.data;
};

const updateAuthConfig = async (nanoid, payload) => {
  const response = await composioApi.patch(`/api/v3.1/auth_configs/${nanoid}`, payload);
  return response.data;
};

const deleteAuthConfig = async (nanoid) => {
  const response = await composioApi.delete(`/api/v3.1/auth_configs/${nanoid}`);
  return response.data;
};

// ── Triggers: get single, update ─────────────────────────────────────────────

const getTrigger = async (triggerId) => {
  const response = await composioApi.get(`/api/v3.1/trigger_instances/${triggerId}`);
  return response.data;
};

const updateTrigger = async (triggerId, payload) => {
  const response = await composioApi.patch(`/api/v3.1/trigger_instances/${triggerId}`, payload);
  return response.data;
};

// ── Files: upload, download ──────────────────────────────────────────────────

const uploadFile = async (formData) => {
  const response = await composioApi.post('/api/v3.1/files', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

const downloadFile = async (fileId) => {
  const response = await composioApi.get(`/api/v3.1/files/${fileId}`);
  return response.data;
};

// ── Logs ─────────────────────────────────────────────────────────────────────

const listLogs = async (params = {}) => {
  const response = await composioApi.get('/api/v3.1/logs', { params });
  return response.data;
};

// ── Webhook Endpoints ────────────────────────────────────────────────────────

const createWebhookEndpoint = async (payload) => {
  const response = await composioApi.post('/api/v3.1/webhook_endpoints', payload);
  return response.data;
};

const listWebhookEndpoints = async () => {
  const response = await composioApi.get('/api/v3.1/webhook_endpoints');
  return response.data;
};

const getWebhookEndpoint = async (endpointId) => {
  const response = await composioApi.get(`/api/v3.1/webhook_endpoints/${endpointId}`);
  return response.data;
};

const updateWebhookEndpoint = async (endpointId, payload) => {
  const response = await composioApi.patch(`/api/v3.1/webhook_endpoints/${endpointId}`, payload);
  return response.data;
};

const deleteWebhookEndpoint = async (endpointId) => {
  const response = await composioApi.delete(`/api/v3.1/webhook_endpoints/${endpointId}`);
  return response.data;
};

// ── Webhook Subscriptions ────────────────────────────────────────────────────

const createWebhookSubscription = async (payload) => {
  const response = await composioApi.post('/api/v3.1/webhook_subscriptions', payload);
  return response.data;
};

const listWebhookSubscriptions = async () => {
  const response = await composioApi.get('/api/v3.1/webhook_subscriptions');
  return response.data;
};

const getWebhookSubscription = async (subscriptionId) => {
  const response = await composioApi.get(`/api/v3.1/webhook_subscriptions/${subscriptionId}`);
  return response.data;
};

const updateWebhookSubscription = async (subscriptionId, payload) => {
  const response = await composioApi.patch(`/api/v3.1/webhook_subscriptions/${subscriptionId}`, payload);
  return response.data;
};

const deleteWebhookSubscription = async (subscriptionId) => {
  const response = await composioApi.delete(`/api/v3.1/webhook_subscriptions/${subscriptionId}`);
  return response.data;
};

// ── Webhook Events ───────────────────────────────────────────────────────────

const listWebhookEvents = async (params = {}) => {
  const response = await composioApi.get('/api/v3.1/webhook_events', { params });
  return response.data;
};

export const ComposioService = {
  createSession,
  getSession,
  deleteSession,
  listToolkits,
  getToolkit,
  listTools,
  getTool,
  getToolInputSchema,
  getRequiredScopes,
  executeTool,
  searchTools,
  listConnectedAccounts,
  initiateConnection,
  getConnectionStatus,
  revokeConnection,
  refreshConnection,
  listTriggerTypes,
  subscribeTrigger,
  listActiveTriggers,
  getTrigger,
  updateTrigger,
  deleteTrigger,
  getMCPUrl,
  listMCPServers,
  listAuthConfigs,
  getAuthConfig,
  createAuthConfig,
  updateAuthConfig,
  deleteAuthConfig,
  executeProxy,
  uploadFile,
  downloadFile,
  listLogs,
  createWebhookEndpoint,
  listWebhookEndpoints,
  getWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  createWebhookSubscription,
  listWebhookSubscriptions,
  getWebhookSubscription,
  updateWebhookSubscription,
  deleteWebhookSubscription,
  listWebhookEvents,
};

export default ComposioService;
