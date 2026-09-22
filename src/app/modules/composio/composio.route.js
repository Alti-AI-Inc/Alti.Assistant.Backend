import express from 'express';
import { ComposioController } from './composio.controller.js';
import auth from '../../middlewares/auth/auth.js';
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { ComposioValidation } from './composio.validation.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth());

// Sessions
router.post('/sessions', validateRequest(ComposioValidation.createSessionZodSchema), ComposioController.createSession);
router.get('/sessions/:sessionId', ComposioController.getSession);
router.delete('/sessions/:sessionId', ComposioController.deleteSession);

// Tools & Toolkits
router.get('/toolkits', ComposioController.listToolkits);
router.get('/toolkits/:slug', ComposioController.getToolkit);
router.get('/tools', ComposioController.listTools);
router.get('/tools/:toolSlug', ComposioController.getTool);
router.post('/tools/:toolSlug/execute', validateRequest(ComposioValidation.executeToolZodSchema), ComposioController.executeTool);
router.post('/tools/:toolSlug/input', ComposioController.getToolInputSchema);
router.post('/tools/search', ComposioController.searchTools);
router.post('/tools/scopes/required', ComposioController.getRequiredScopes);
router.post('/tools/proxy', ComposioController.executeProxy);

// Connected Accounts
router.get('/accounts', ComposioController.listConnectedAccounts);
router.post('/accounts/connect', validateRequest(ComposioValidation.initiateConnectionZodSchema), ComposioController.initiateConnection);
router.get('/accounts/:nanoid', ComposioController.getConnectionStatus);
router.post('/accounts/:nanoid/refresh', ComposioController.refreshConnection);
router.delete('/accounts/:nanoid', ComposioController.revokeConnection);

// Triggers
router.get('/triggers/types', ComposioController.listTriggerTypes);
router.post('/triggers/subscribe', validateRequest(ComposioValidation.subscribeTriggerZodSchema), ComposioController.subscribeTrigger);
router.get('/triggers/active', ComposioController.listActiveTriggers);
router.get('/triggers/:triggerId', ComposioController.getTrigger);
router.patch('/triggers/:triggerId', ComposioController.updateTrigger);
router.delete('/triggers/:triggerId', ComposioController.deleteTrigger);

// Auth Configs
router.get('/auth-configs', ComposioController.listAuthConfigs);
router.post('/auth-configs', ComposioController.createAuthConfig);
router.get('/auth-configs/:nanoid', ComposioController.getAuthConfig);
router.patch('/auth-configs/:nanoid', ComposioController.updateAuthConfig);
router.delete('/auth-configs/:nanoid', ComposioController.deleteAuthConfig);

// Files
router.post('/files', ComposioController.uploadFile);
router.get('/files/:fileId', ComposioController.downloadFile);

// Logs
router.get('/logs', ComposioController.listLogs);

// MCP
router.get('/mcp/url', ComposioController.getMCPUrl);
router.get('/mcp/servers', ComposioController.listMCPServers);

// Webhook Endpoints
router.post('/webhook-endpoints', ComposioController.createWebhookEndpoint);
router.get('/webhook-endpoints', ComposioController.listWebhookEndpoints);
router.get('/webhook-endpoints/:endpointId', ComposioController.getWebhookEndpoint);
router.patch('/webhook-endpoints/:endpointId', ComposioController.updateWebhookEndpoint);
router.delete('/webhook-endpoints/:endpointId', ComposioController.deleteWebhookEndpoint);

// Webhook Subscriptions
router.post('/webhook-subscriptions', ComposioController.createWebhookSubscription);
router.get('/webhook-subscriptions', ComposioController.listWebhookSubscriptions);
router.get('/webhook-subscriptions/:subscriptionId', ComposioController.getWebhookSubscription);
router.patch('/webhook-subscriptions/:subscriptionId', ComposioController.updateWebhookSubscription);
router.delete('/webhook-subscriptions/:subscriptionId', ComposioController.deleteWebhookSubscription);

// Webhook Events
router.get('/webhook-events', ComposioController.listWebhookEvents);

export const ComposioRoutes = router;
