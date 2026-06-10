import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { mcpToolboxController } from './mcp_toolbox.controller.js';

// Mock dependencies
const mockRouter = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
  use: vi.fn(),
};

vi.mock('express', () => ({
  default: {
    Router: () => mockRouter,
  },
}));

const mockAuthMiddleware = vi.fn((req, res, next) => next());
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn(() => mockAuthMiddleware),
}));

vi.mock('./mcp_toolbox.controller.js', () => ({
  mcpToolboxController: {
    connectController: vi.fn(),
    queryController: vi.fn(),
    disconnectController: vi.fn(),
    statusController: vi.fn(),
    connectServerController: vi.fn(),
    stopServerController: vi.fn(),
    listToolsController: vi.fn(),
    callToolController: vi.fn(),
    dashboardStatusController: vi.fn(),
    sseConnectionHandler: vi.fn(),
    mcpMessageHandler: vi.fn(),
    registerServerController: vi.fn(),
    installAppController: vi.fn(),
    listUnifiedToolsController: vi.fn(),
    callUnifiedToolController: vi.fn(),
  },
}));

describe('MCP Toolbox Routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamically import the router file to ensure mocks are applied for each test
    await import('./mcp_toolbox.route.js');
  });

  it('should create an express router', () => {
    expect(express.Router).toHaveBeenCalled();
  });

  // ==========================================
  // A. Legacy Database MCP Toolbox Endpoints
  // ==========================================
  describe('Legacy Database Endpoints', () => {
    it('should register POST /connect route with auth middleware and connectController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/connect',
        mockAuthMiddleware,
        mcpToolboxController.connectController
      );
    });

    it('should register POST /query route with auth middleware and queryController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/query',
        mockAuthMiddleware,
        mcpToolboxController.queryController
      );
    });

    it('should register POST /disconnect route with auth middleware and disconnectController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/disconnect',
        mockAuthMiddleware,
        mcpToolboxController.disconnectController
      );
    });

    it('should register GET /status route with auth middleware and statusController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/status',
        mockAuthMiddleware,
        mcpToolboxController.statusController
      );
    });
  });

  // ==========================================
  // B. New Universal Multi-Server Endpoints
  // ==========================================
  describe('Universal Multi-Server Endpoints', () => {
    it('should register POST /connect-server route with auth middleware and connectServerController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/connect-server',
        mockAuthMiddleware,
        mcpToolboxController.connectServerController
      );
    });

    it('should register POST /stop-server route with auth middleware and stopServerController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/stop-server',
        mockAuthMiddleware,
        mcpToolboxController.stopServerController
      );
    });

    it('should register GET /servers/:serverId/tools route with auth middleware and listToolsController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/servers/:serverId/tools',
        mockAuthMiddleware,
        mcpToolboxController.listToolsController
      );
    });

    it('should register POST /call-tool route with auth middleware and callToolController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/call-tool',
        mockAuthMiddleware,
        mcpToolboxController.callToolController
      );
    });

    it('should register GET /servers/status route with auth middleware and dashboardStatusController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/servers/status',
        mockAuthMiddleware,
        mcpToolboxController.dashboardStatusController
      );
    });

    it('should register GET /sse route with auth middleware and sseConnectionHandler', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/sse',
        mockAuthMiddleware,
        mcpToolboxController.sseConnectionHandler
      );
    });

    it('should register POST /message route with auth middleware and mcpMessageHandler', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/message',
        mockAuthMiddleware,
        mcpToolboxController.mcpMessageHandler
      );
    });
  });

  // ==========================================
  // C. Gateway & Dynamic Registration Endpoints
  // ==========================================
  describe('Gateway & Dynamic Registration Endpoints', () => {
    it('should register POST /register-server route with auth middleware and registerServerController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/register-server',
        mockAuthMiddleware,
        mcpToolboxController.registerServerController
      );
    });

    it('should register POST /install-app route with auth middleware and installAppController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/install-app',
        mockAuthMiddleware,
        mcpToolboxController.installAppController
      );
    });

    it('should register GET /unified/tools route with auth middleware and listUnifiedToolsController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/unified/tools',
        mockAuthMiddleware,
        mcpToolboxController.listUnifiedToolsController
      );
    });

    it('should register POST /unified/call-tool route with auth middleware and callUnifiedToolController', () => {
      expect(auth).toHaveBeenCalledWith();
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/unified/call-tool',
        mockAuthMiddleware,
        mcpToolboxController.callUnifiedToolController
      );
    });
  });

  it('should verify that auth middleware is called for every route', () => {
    // The router file defines 16 routes (5 GET, 11 POST)
    const totalRoutes = 16;
    // auth() is called once per route definition
    expect(auth).toHaveBeenCalledTimes(totalRoutes);
  });
});