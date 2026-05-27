import express from 'express';
import { mcpToolboxController } from './mcp_toolbox.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

// ==========================================
// A. Legacy Database MCP Toolbox Endpoints
// ==========================================

router.post(
  '/connect',
  auth(),
  mcpToolboxController.connectController
);

router.post(
  '/query',
  auth(),
  mcpToolboxController.queryController
);

router.post(
  '/disconnect',
  auth(),
  mcpToolboxController.disconnectController
);

router.get(
  '/status',
  auth(),
  mcpToolboxController.statusController
);

// ==========================================
// B. New Universal Multi-Server Endpoints
// ==========================================

router.post(
  '/connect-server',
  auth(),
  mcpToolboxController.connectServerController
);

router.post(
  '/stop-server',
  auth(),
  mcpToolboxController.stopServerController
);

router.get(
  '/servers/:serverId/tools',
  auth(),
  mcpToolboxController.listToolsController
);

router.post(
  '/call-tool',
  auth(),
  mcpToolboxController.callToolController
);

router.get(
  '/servers/status',
  auth(),
  mcpToolboxController.dashboardStatusController
);

router.get(
  '/sse',
  auth(),
  mcpToolboxController.sseConnectionHandler
);

router.post(
  '/message',
  auth(),
  mcpToolboxController.mcpMessageHandler
);

// ==========================================
// C. Gateway & Dynamic Registration Endpoints
// ==========================================

router.post(
  '/register-server',
  auth(),
  mcpToolboxController.registerServerController
);

router.get(
  '/unified/tools',
  auth(),
  mcpToolboxController.listUnifiedToolsController
);

router.post(
  '/unified/call-tool',
  auth(),
  mcpToolboxController.callUnifiedToolController
);

export const mcpToolboxRoutes = router;
