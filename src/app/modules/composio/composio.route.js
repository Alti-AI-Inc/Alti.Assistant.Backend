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
router.post('/tools/:toolSlug/execute', validateRequest(ComposioValidation.executeToolZodSchema), ComposioController.executeTool);
router.post('/tools/search', ComposioController.searchTools);

// Connected Accounts
router.get('/accounts', ComposioController.listConnectedAccounts);
router.post('/accounts/connect', validateRequest(ComposioValidation.initiateConnectionZodSchema), ComposioController.initiateConnection);
router.get('/accounts/:nanoid', ComposioController.getConnectionStatus);
router.delete('/accounts/:nanoid', ComposioController.revokeConnection);

// Triggers
router.get('/triggers/types', ComposioController.listTriggerTypes);
router.post('/triggers/subscribe', validateRequest(ComposioValidation.subscribeTriggerZodSchema), ComposioController.subscribeTrigger);
router.get('/triggers/active', ComposioController.listActiveTriggers);
router.delete('/triggers/:triggerId', ComposioController.deleteTrigger);

// Auth Configs
router.get('/auth-configs', ComposioController.listAuthConfigs);
router.get('/auth-configs/:nanoid', ComposioController.getAuthConfig);

// Proxy Execution
router.post('/tools/proxy', ComposioController.executeProxy);

// MCP
router.get('/mcp/url', ComposioController.getMCPUrl);
router.get('/mcp/servers', ComposioController.listMCPServers);

export const ComposioRoutes = router;
