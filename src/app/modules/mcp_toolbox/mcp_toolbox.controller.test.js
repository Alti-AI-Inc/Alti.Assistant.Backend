import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mcpToolboxController } from './mcp_toolbox.controller.js';
import { mcpToolboxService } from './mcp_toolbox.service.js';
import { mcpOrchestratorService } from './mcp_orchestrator.service.js';
import { mcpCatalog } from './mcp_catalog.js';

vi.mock('./mcp_toolbox.service.js', () => ({
  mcpToolboxService: {
    startMcpServer: vi.fn(),
    querySecureDatabase: vi.fn(),
    stopMcpServer: vi.fn(),
    getStatus: vi.fn(),
  }
}));

vi.mock('./mcp_orchestrator.service.js', () => ({
  mcpOrchestratorService: {
    startServer: vi.fn(),
    stopServer: vi.fn(),
    getUserServers: vi.fn(),
    callTool: vi.fn(),
    getDashboardStatus: vi.fn(),
    registerServer: vi.fn(),
    getUnifiedTools: vi.fn(),
    callUnifiedTool: vi.fn(),
  }
}));

vi.mock('./mcp_catalog.js', () => ({
  mcpCatalog: {
    postgres: {
      name: 'Postgres Server',
      requiredEnv: ['PG_PASSWORD'],
      env: {},
      args: []
    },
    sqlite: {
      name: 'SQLite Server',
      env: {},
      args: ['arg1', 'arg2', 'placeholder']
    }
  }
}));

describe('mcpToolboxController', () => {
  let req;
  let res;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      user: { userId: 'test_user_id' },
      body: {},
      params: {},
      query: {}
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      writeHead: vi.fn().mockReturnThis(),
      write: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
      headersSent: false,
      writableEnded: false
    };
  });

  describe('connectController', () => {
    it('should return 400 if connectionDetails or type is missing', async () => {
      req.body = { connectionDetails: {} };
      await mcpToolboxController.connectController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'connectionDetails with type (e.g. postgres, bigquery) is required.'
      });
    });

    it('should call startMcpServer and return 200 on success', async () => {
      req.body = { connectionDetails: { type: 'postgres' }, customTools: ['tool1'] };
      const mockResult = { success: true };
      mcpToolboxService.startMcpServer.mockResolvedValue(mockResult);

      await mcpToolboxController.connectController(req, res);

      expect(mcpToolboxService.startMcpServer).toHaveBeenCalledWith('test_user_id', req.body.connectionDetails, ['tool1']);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return 401 if req.user is missing', async () => {
      delete req.user;
      req.body = { connectionDetails: { type: 'postgres' } };

      await mcpToolboxController.connectController(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized: User not authenticated.' });
    });

    it('should return 500 if startMcpServer throws an error', async () => {
      req.body = { connectionDetails: { type: 'postgres' } };
      mcpToolboxService.startMcpServer.mockRejectedValue(new Error('Connection failed'));

      await mcpToolboxController.connectController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('queryController', () => {
    it('should return 400 if query is missing', async () => {
      req.body = {};
      await mcpToolboxController.queryController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'query prompt is required and must be a string.' });
    });

    it('should call querySecureDatabase and return 200 on success', async () => {
      req.body = { query: 'SELECT * FROM users' };
      const mockResult = { success: true, data: [] };
      mcpToolboxService.querySecureDatabase.mockResolvedValue(mockResult);

      await mcpToolboxController.queryController(req, res);

      expect(mcpToolboxService.querySecureDatabase).toHaveBeenCalledWith('test_user_id', 'SELECT * FROM users');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return 500 if querySecureDatabase throws an error', async () => {
      req.body = { query: 'SELECT * FROM users' };
      mcpToolboxService.querySecureDatabase.mockRejectedValue(new Error('Query failed'));

      await mcpToolboxController.queryController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('disconnectController', () => {
    it('should call stopMcpServer and return 200 on success', async () => {
      const mockResult = { success: true };
      mcpToolboxService.stopMcpServer.mockResolvedValue(mockResult);

      await mcpToolboxController.disconnectController(req, res);

      expect(mcpToolboxService.stopMcpServer).toHaveBeenCalledWith('test_user_id');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return 500 if stopMcpServer throws an error', async () => {
      mcpToolboxService.stopMcpServer.mockRejectedValue(new Error('Disconnect failed'));

      await mcpToolboxController.disconnectController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('statusController', () => {
    it('should call getStatus and return 200 on success', async () => {
      const mockResult = { active: true };
      mcpToolboxService.getStatus.mockResolvedValue(mockResult);

      await mcpToolboxController.statusController(req, res);

      expect(mcpToolboxService.getStatus).toHaveBeenCalledWith('test_user_id');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockResult });
    });

    it('should return 500 if getStatus throws an error', async () => {
      mcpToolboxService.getStatus.mockRejectedValue(new Error('Status failed'));

      await mcpToolboxController.statusController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('connectServerController', () => {
    it('should return 400 if serverId is missing', async () => {
      req.body = {};
      await mcpToolboxController.connectServerController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'serverId is required.' });
    });

    it('should call startServer and return 200 on success', async () => {
      req.body = { serverId: 'server-1' };
      const mockResult = { success: true };
      mcpOrchestratorService.startServer.mockResolvedValue(mockResult);

      await mcpToolboxController.connectServerController(req, res);

      expect(mcpOrchestratorService.startServer).toHaveBeenCalledWith('test_user_id', 'server-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return 500 if startServer throws an error', async () => {
      req.body = { serverId: 'server-1' };
      mcpOrchestratorService.startServer.mockRejectedValue(new Error('Start failed'));

      await mcpToolboxController.connectServerController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('stopServerController', () => {
    it('should return 400 if serverId is missing', async () => {
      req.body = {};
      await mcpToolboxController.stopServerController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'serverId is required.' });
    });

    it('should call stopServer and return 200 on success', async () => {
      req.body = { serverId: 'server-1' };
      const mockResult = { success: true };
      mcpOrchestratorService.stopServer.mockResolvedValue(mockResult);

      await mcpToolboxController.stopServerController(req, res);

      expect(mcpOrchestratorService.stopServer).toHaveBeenCalledWith('test_user_id', 'server-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return 500 if stopServer throws an error', async () => {
      req.body = { serverId: 'server-1' };
      mcpOrchestratorService.stopServer.mockRejectedValue(new Error('Stop failed'));

      await mcpToolboxController.stopServerController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('listToolsController', () => {
    it('should return 400 if serverId parameter is missing', async () => {
      req.params = {};
      await mcpToolboxController.listToolsController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'serverId parameter is required.' });
    });

    it('should return 404 if server is not active', async () => {
      req.params = { serverId: 'server-1' };
      const mockServers = new Map();
      mcpOrchestratorService.getUserServers.mockResolvedValue(mockServers);

      await mcpToolboxController.listToolsController(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'MCP Server "server-1" is not active.' });
    });

    it('should return tools if server is active', async () => {
      req.params = { serverId: 'server-1' };
      const mockServers = new Map();
      mockServers.set('server-1', { tools: ['tool1', 'tool2'] });
      mcpOrchestratorService.getUserServers.mockResolvedValue(mockServers);

      await mcpToolboxController.listToolsController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, tools: ['tool1', 'tool2'] });
    });

    it('should return 500 if getUserServers throws an error', async () => {
      req.params = { serverId: 'server-1' };
      mcpOrchestratorService.getUserServers.mockRejectedValue(new Error('Fetch failed'));

      await mcpToolboxController.listToolsController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('callToolController', () => {
    it('should return 400 if serverId or toolName is missing', async () => {
      req.body = { serverId: 'server-1' };
      await mcpToolboxController.callToolController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'serverId and toolName are required.' });
    });

    it('should call callTool and return 200 on success', async () => {
      req.body = { serverId: 'server-1', toolName: 'tool1', arguments: { arg: 'val' } };
      const mockResult = { success: true, result: 'output' };
      mcpOrchestratorService.callTool.mockResolvedValue(mockResult);

      await mcpToolboxController.callToolController(req, res);

      expect(mcpOrchestratorService.callTool).toHaveBeenCalledWith('test_user_id', 'server-1', 'tool1', { arg: 'val' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return 500 if callTool throws an error', async () => {
      req.body = { serverId: 'server-1', toolName: 'tool1' };
      mcpOrchestratorService.callTool.mockRejectedValue(new Error('Execution failed'));

      await mcpToolboxController.callToolController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('dashboardStatusController', () => {
    it('should call getDashboardStatus and return 200 on success', async () => {
      const mockStatus = [{ id: 'server-1', status: 'running' }];
      mcpOrchestratorService.getDashboardStatus.mockResolvedValue(mockStatus);

      await mcpToolboxController.dashboardStatusController(req, res);

      expect(mcpOrchestratorService.getDashboardStatus).toHaveBeenCalledWith('test_user_id');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, servers: mockStatus });
    });

    it('should return 500 if getDashboardStatus throws an error', async () => {
      mcpOrchestratorService.getDashboardStatus.mockRejectedValue(new Error('Dashboard failed'));

      await mcpToolboxController.dashboardStatusController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('sseConnectionHandler', () => {
    it('should return 400 if serverId is missing', async () => {
      req.query = {};
      await mcpToolboxController.sseConnectionHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'serverId parameter is required for SSE transport.' });
    });

    it('should return 404 if server is not running or process is missing', async () => {
      req.query = { serverId: 'server-1' };
      const mockServers = new Map();
      mockServers.set('server-1', { process: null });
      mcpOrchestratorService.getUserServers.mockResolvedValue(mockServers);

      await mcpToolboxController.sseConnectionHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Server is not running or process not found.' });
    });

    it('should establish SSE connection and handle stdout data', async () => {
      req.query = { serverId: 'server-1' };
      const mockStdout = {
        on: vi.fn(),
        off: vi.fn()
      };
      const mockServers = new Map();
      mockServers.set('server-1', { process: { stdout: mockStdout } });
      mcpOrchestratorService.getUserServers.mockResolvedValue(mockServers);

      let closeCallback;
      req.on = vi.fn().mockImplementation((event, callback) => {
        if (event === 'close') closeCallback = callback;
      });

      await mcpToolboxController.sseConnectionHandler(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff'
      });
      expect(res.write).toHaveBeenCalledWith(`event: endpoint\ndata: {"message":"SSE Connection Established."}\n\n`);
      expect(mockStdout.on).toHaveBeenCalledWith('data', expect.any(Function));

      const onDataCallback = mockStdout.on.mock.calls[0][1];
      onDataCallback(Buffer.from('test data'));
      expect(res.write).toHaveBeenCalledWith(`event: message\ndata: "test data"\n\n`);

      closeCallback();
      expect(mockStdout.off).toHaveBeenCalledWith('data', onDataCallback);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle errors and return 500 if headers not sent', async () => {
      req.query = { serverId: 'server-1' };
      mcpOrchestratorService.getUserServers.mockRejectedValue(new Error('SSE setup failed'));

      await mcpToolboxController.sseConnectionHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('mcpMessageHandler', () => {
    it('should return 400 if serverId or message is missing', async () => {
      req.body = { serverId: 'server-1' };
      await mcpToolboxController.mcpMessageHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'serverId and message payload are required.' });
    });

    it('should return 404 if server is not running or initialized', async () => {
      req.body = { serverId: 'server-1', message: { method: 'test' } };
      const mockServers = new Map();
      mockServers.set('server-1', { initialized: false });
      mcpOrchestratorService.getUserServers.mockResolvedValue(mockServers);

      await mcpToolboxController.mcpMessageHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'MCP Server "server-1" is not running.' });
    });

    it('should deliver message and return 200 on success', async () => {
      req.body = { serverId: 'server-1', message: { method: 'test', params: { a: 1 }, id: 123 } };
      const mockServer = {
        initialized: true,
        sendRequest: vi.fn().mockResolvedValue('response_data')
      };
      const mockServers = new Map();
      mockServers.set('server-1', mockServer);
      mcpOrchestratorService.getUserServers.mockResolvedValue(mockServers);

      await mcpToolboxController.mcpMessageHandler(req, res);

      expect(mockServer.sendRequest).toHaveBeenCalledWith('test', { a: 1 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        result: 'response_data',
        id: 123
      });
    });

    it('should return 500 if message delivery throws an error', async () => {
      req.body = { serverId: 'server-1', message: { method: 'test' } };
      mcpOrchestratorService.getUserServers.mockRejectedValue(new Error('RPC failed'));

      await mcpToolboxController.mcpMessageHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('registerServerController', () => {
    it('should return 400 if serverId or serverConfig is missing', async () => {
      req.body = { serverId: 'server-1' };
      await mcpToolboxController.registerServerController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'serverId and serverConfig details are required.' });
    });

    it('should call registerServer and return 200 on success', async () => {
      req.body = { serverId: 'server-1', serverConfig: { name: 'test' } };
      const mockResult = { success: true };
      mcpOrchestratorService.registerServer.mockResolvedValue(mockResult);

      await mcpToolboxController.registerServerController(req, res);

      expect(mcpOrchestratorService.registerServer).toHaveBeenCalledWith('test_user_id', 'server-1', { name: 'test' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return 500 if registerServer throws an error', async () => {
      req.body = { serverId: 'server-1', serverConfig: { name: 'test' } };
      mcpOrchestratorService.registerServer.mockRejectedValue(new Error('Registration failed'));

      await mcpToolboxController.registerServerController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('installAppController', () => {
    it('should return 400 if appId is missing', async () => {
      req.body = {};
      await mcpToolboxController.installAppController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'appId parameter is required.' });
    });

    it('should return 404 if appId is not found in catalog', async () => {
      req.body = { appId: 'unknown-app' };
      await mcpToolboxController.installAppController(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'MCP Application "unknown-app" not found in catalog.' });
    });

    it('should return 400 if required environment variables are missing', async () => {
      req.body = { appId: 'postgres', env: {} };
      await mcpToolboxController.installAppController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required environment variable "PG_PASSWORD" for app "postgres".'
      });
    });

    it('should return 400 if databaseUrl is missing for postgres app', async () => {
      req.body = { appId: 'postgres', env: { PG_PASSWORD: 'secret' } };
      await mcpToolboxController.installAppController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'databaseUrl is required to install postgres/postgresql app.'
      });
    });

    it('should install and boot postgres app successfully', async () => {
      req.body = { appId: 'postgres', env: { PG_PASSWORD: 'secret' }, databaseUrl: 'postgresql://localhost' };
      mcpOrchestratorService.registerServer.mockResolvedValue({ registered: true });
      mcpOrchestratorService.startServer.mockResolvedValue({ started: true });

      await mcpToolboxController.installAppController(req, res);

      expect(mcpOrchestratorService.registerServer).toHaveBeenCalledWith('test_user_id', 'postgres', expect.objectContaining({
        name: 'Postgres Server',
        env: { PG_PASSWORD: 'secret' },
        args: ['postgresql://localhost']
      }));
      expect(mcpOrchestratorService.startServer).toHaveBeenCalledWith('test_user_id', 'postgres');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Application "Postgres Server" installed and booted successfully.',
        serverId: 'postgres',
        registration: { registered: true },
        connection: { started: true }
      });
    });

    it('should install and boot sqlite app successfully with dynamic path isolation', async () => {
      req.body = { appId: 'sqlite' };
      mcpOrchestratorService.registerServer.mockResolvedValue({ registered: true });
      mcpOrchestratorService.startServer.mockResolvedValue({ started: true });

      await mcpToolboxController.installAppController(req, res);

      expect(mcpOrchestratorService.registerServer).toHaveBeenCalledWith('test_user_id', 'sqlite', expect.objectContaining({
        name: 'SQLite Server',
        args: ['arg1', 'arg2', 'storage/users/test_user_id/databases/sqlite.db']
      }));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 if installation process throws an error', async () => {
      req.body = { appId: 'sqlite' };
      mcpOrchestratorService.registerServer.mockRejectedValue(new Error('Installation failed'));

      await mcpToolboxController.installAppController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('listUnifiedToolsController', () => {
    it('should call getUnifiedTools and return 200 on success', async () => {
      const mockTools = ['tool1', 'tool2'];
      mcpOrchestratorService.getUnifiedTools.mockResolvedValue(mockTools);

      await mcpToolboxController.listUnifiedToolsController(req, res);

      expect(mcpOrchestratorService.getUnifiedTools).toHaveBeenCalledWith('test_user_id');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, tools: mockTools });
    });

    it('should return 500 if getUnifiedTools throws an error', async () => {
      mcpOrchestratorService.getUnifiedTools.mockRejectedValue(new Error('Fetch failed'));

      await mcpToolboxController.listUnifiedToolsController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });

  describe('callUnifiedToolController', () => {
    it('should return 400 if toolName is missing', async () => {
      req.body = {};
      await mcpToolboxController.callUnifiedToolController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'toolName is required.' });
    });

    it('should call callUnifiedTool and return 200 on success', async () => {
      req.body = { toolName: 'tool1', arguments: { arg: 'val' } };
      const mockResult = { success: true, result: 'output' };
      mcpOrchestratorService.callUnifiedTool.mockResolvedValue(mockResult);

      await mcpToolboxController.callUnifiedToolController(req, res);

      expect(mcpOrchestratorService.callUnifiedTool).toHaveBeenCalledWith('test_user_id', 'tool1', { arg: 'val' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return 500 if callUnifiedTool throws an error', async () => {
      req.body = { toolName: 'tool1' };
      mcpOrchestratorService.callUnifiedTool.mockRejectedValue(new Error('Execution failed'));

      await mcpToolboxController.callUnifiedToolController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'An internal server error occurred.' });
    });
  });
});