import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline';
import { EventEmitter } from 'events';
import { dockerWorkspaceService } from '../docker/dockerWorkspace.service.js';
import { mcpToolboxService } from './mcp_toolbox.service.js';

// Mock dependencies
vi.mock('fs');
vi.mock('child_process');
vi.mock('readline');
vi.mock('../docker/dockerWorkspace.service.js');

// Mock implementation details
const mockProcess = {
  stdin: { write: vi.fn() },
  stdout: new EventEmitter(),
  stderr: new EventEmitter(),
  on: vi.fn().mockImplementation((event, cb) => {
    if (event === 'exit') mockProcess.exitCb = cb;
    if (event === 'error') mockProcess.errorCb = cb;
    return mockProcess;
  }),
  kill: vi.fn(),
  removeAllListeners: vi.fn(),
  exitCb: null,
  errorCb: null,
};

const mockReadlineInterface = {
  on: vi.fn().mockImplementation((event, cb) => {
    if (event === 'line') mockReadlineInterface.lineCb = cb;
  }),
  lineCb: null,
};

describe('McpToolboxService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mcpToolboxService.activeServers.clear();

    spawn.mockReturnValue(mockProcess);
    readline.createInterface.mockReturnValue(mockReadlineInterface);
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockReturnValue(undefined);
    fs.writeFileSync.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Context Boundaries and Tenant Isolation', () => {
    it('should generate config in a tenant-specific directory', () => {
      const tenantId = 'tenant-isolation-test-1';
      mcpToolboxService.generateConfig(tenantId, {});
      const expectedDir = path.resolve(`storage/users/${tenantId}/workspace/mcp_config`);
      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(expectedDir, 'tools.yaml'),
        expect.any(String),
        'utf-8'
      );
    });

    it('should start a server in a tenant-specific docker container', async () => {
      const tenantId = 'tenant-isolation-test-2';
      dockerWorkspaceService.getOrCreateWorkspace.mockResolvedValue({
        mode: 'docker-isolated',
        containerId: 'container-for-tenant-2'
      });

      const startPromise = mcpToolboxService.startMcpServer(tenantId, {});
      await vi.advanceTimersByTimeAsync(3500);

      // Simulate handshake
      const initRequest = JSON.parse(mockProcess.stdin.write.mock.calls[0][0]);
      mockReadlineInterface.lineCb(JSON.stringify({ id: initRequest.id, result: { capabilities: {} } }));
      const listRequest = JSON.parse(mockProcess.stdin.write.mock.calls[2][0]);
      mockReadlineInterface.lineCb(JSON.stringify({ id: listRequest.id, result: { tools: [] } }));

      await startPromise;

      expect(dockerWorkspaceService.getOrCreateWorkspace).toHaveBeenCalledWith(tenantId);
      expect(spawn).toHaveBeenCalledWith('docker', expect.arrayContaining(['container-for-tenant-2']), {});
    });

    it('should manage server states independently for different tenants', async () => {
      // Start server for tenant A
      const tenantA = 'tenant-A';
      dockerWorkspaceService.getOrCreateWorkspace.mockResolvedValue({ mode: 'local' });
      fs.existsSync.mockReturnValue(true); // local binary exists
      const startPromiseA = mcpToolboxService.startMcpServer(tenantA, { type: 'postgres' });
      await vi.advanceTimersByTimeAsync(3500);
      const initReqA = JSON.parse(mockProcess.stdin.write.mock.calls[0][0]);
      mockReadlineInterface.lineCb(JSON.stringify({ id: initReqA.id, result: { capabilities: {} } }));
      const listReqA = JSON.parse(mockProcess.stdin.write.mock.calls[2][0]);
      mockReadlineInterface.lineCb(JSON.stringify({ id: listReqA.id, result: { tools: [] } }));
      await startPromiseA;

      // Start server for tenant B
      const tenantB = 'tenant-B';
      const startPromiseB = mcpToolboxService.startMcpServer(tenantB, { type: 'mysql' });
      await vi.advanceTimersByTimeAsync(3500);
      const initReqB = JSON.parse(mockProcess.stdin.write.mock.calls[3][0]);
      mockReadlineInterface.lineCb(JSON.stringify({ id: initReqB.id, result: { capabilities: {} } }));
      const listReqB = JSON.parse(mockProcess.stdin.write.mock.calls[5][0]);
      mockReadlineInterface.lineCb(JSON.stringify({ id: listReqB.id, result: { tools: [] } }));
      await startPromiseB;

      expect(mcpToolboxService.activeServers.size).toBe(2);
      const statusA = mcpToolboxService.getStatus(tenantA);
      const statusB = mcpToolboxService.getStatus(tenantB);

      expect(statusA.connected).toBe(true);
      expect(statusA.type).toBe('postgres');
      expect(statusB.connected).toBe(true);
      expect(statusB.type).toBe('mysql');

      // Stop server for tenant A
      await mcpToolboxService.stopMcpServer(tenantA);
      expect(mcpToolboxService.activeServers.size).toBe(1);
      expect(mcpToolboxService.getStatus(tenantA).connected).toBe(false);
      expect(mcpToolboxService.getStatus(tenantB).connected).toBe(true);
    });
  });

  describe('generateConfig', () => {
    it('should generate a basic postgres config', () => {
      const tenantId = 'tenant-1';
      const connectionDetails = {
        type: 'postgres',
        host: 'db.example.com',
        port: 5433,
        database: 'testdb',
        user: 'testuser',
        password: 'testpassword'
      };
      const { yamlContent } = mcpToolboxService.generateConfig(tenantId, connectionDetails);

      expect(yamlContent).toContain(`Tenant: ${tenantId}`);
      expect(yamlContent).toContain(`name: database-source-${tenantId}`);
      expect(yamlContent).toContain('type: postgres');
      expect(yamlContent).toContain('host: db.example.com');
      expect(yamlContent).toContain('port: 5433');
      expect(yamlContent).toContain('database: testdb');
      expect(yamlContent).toContain('user: testuser');
      expect(yamlContent).toContain('password: testpassword');
      expect(yamlContent).toContain('kind: toolset');
      expect(yamlContent).toContain('- list_tables');
    });

    it('should generate config with custom tools', () => {
      const tenantId = 'tenant-2';
      const customTools = [{
        name: 'get_user_by_email',
        description: 'Fetches a user by their email address.',
        parameters: [{ name: 'email', type: 'string' }],
        statement: 'SELECT * FROM users WHERE email = $1;'
      }];
      const { yamlContent } = mcpToolboxService.generateConfig(tenantId, {}, customTools);

      expect(yamlContent).toContain('kind: tool');
      expect(yamlContent).toContain('name: get_user_by_email');
      expect(yamlContent).toContain('description: Fetches a user by their email address.');
      expect(yamlContent).toContain('parameters:');
      expect(yamlContent).toContain('- name: email');
      expect(yamlContent).toContain('type: string');
      expect(yamlContent).toContain('statement: SELECT * FROM users WHERE email = $1;');
    });
  });

  describe('startMcpServer', () => {
    it('should start successfully in a Docker container', async () => {
      const tenantId = 'docker-tenant';
      dockerWorkspaceService.getOrCreateWorkspace.mockResolvedValue({
        mode: 'docker-isolated',
        containerId: 'test-container-id'
      });

      const startPromise = mcpToolboxService.startMcpServer(tenantId, {});
      await vi.advanceTimersByTimeAsync(3500);

      // Simulate successful handshake
      const initRequest = JSON.parse(mockProcess.stdin.write.mock.calls[0][0]);
      expect(initRequest.method).toBe('initialize');
      mockReadlineInterface.lineCb(JSON.stringify({ id: initRequest.id, result: { capabilities: { server: '1.0' } } }));

      const notification = JSON.parse(mockProcess.stdin.write.mock.calls[1][0]);
      expect(notification.method).toBe('notifications/initialized');

      const listRequest = JSON.parse(mockProcess.stdin.write.mock.calls[2][0]);
      expect(listRequest.method).toBe('tools/list');
      mockReadlineInterface.lineCb(JSON.stringify({ id: listRequest.id, result: { tools: [{ name: 'list_tables' }] } }));

      const result = await startPromise;

      expect(spawn).toHaveBeenCalledWith('docker', [
        'exec', '-i', '-w', '/mcp-toolbox', 'test-container-id',
        'go', 'run', '.', 'serve', '--config', '/workspace/mcp_config/tools.yaml', '--stdio'
      ], {});
      expect(result.success).toBe(true);
      expect(result.isMocked).toBe(false);
      expect(result.message).toContain('secure Docker Workspace');
      expect(mcpToolboxService.activeServers.get(tenantId).isMocked).toBe(false);
    });

    it('should start successfully using a local binary', async () => {
      const tenantId = 'local-tenant';
      dockerWorkspaceService.getOrCreateWorkspace.mockResolvedValue({ mode: 'local' });
      const binaryPath = process.platform === 'win32' ? path.resolve('bin/mcp-toolbox.exe') : path.resolve('bin/mcp-toolbox');
      fs.existsSync.mockImplementation((p) => p === binaryPath);

      const startPromise = mcpToolboxService.startMcpServer(tenantId, {});
      await vi.advanceTimersByTimeAsync(3500);

      // Simulate successful handshake
      const initRequest = JSON.parse(mockProcess.stdin.write.mock.calls[0][0]);
      mockReadlineInterface.lineCb(JSON.stringify({ id: initRequest.id, result: { capabilities: {} } }));
      const listRequest = JSON.parse(mockProcess.stdin.write.mock.calls[2][0]);
      mockReadlineInterface.lineCb(JSON.stringify({ id: listRequest.id, result: { tools: [] } }));

      const result = await startPromise;

      expect(spawn).toHaveBeenCalledWith(binaryPath, expect.any(Array), expect.any(Object));
      expect(result.success).toBe(true);
      expect(result.isMocked).toBe(false);
      expect(result.message).toContain('Go MCP Stdio Bridge');
    });

    it('should fall back to high-fidelity mock if all real methods fail', async () => {
      const tenantId = 'mock-tenant';
      dockerWorkspaceService.getOrCreateWorkspace.mockResolvedValue({ mode: 'docker-isolated', containerId: 'fail-container' });

      // Make both Docker and local spawn fail
      spawn.mockImplementation(() => {
        const p = new EventEmitter();
        p.stdin = { write: vi.fn() };
        p.stdout = new EventEmitter();
        p.stderr = new EventEmitter();
        p.kill = vi.fn();
        p.removeAllListeners = vi.fn();
        setTimeout(() => p.emit('error', new Error('Spawn failed')), 10);
        return p;
      });

      const result = await mcpToolboxService.startMcpServer(tenantId, {});

      expect(result.success).toBe(true);
      expect(result.isMocked).toBe(true);
      expect(result.message).toContain('High-Fidelity Virtual Mock');
      const serverState = mcpToolboxService.activeServers.get(tenantId);
      expect(serverState.isMocked).toBe(true);
      expect(serverState.bridge).toBeNull();
    });
  });

  describe('stopMcpServer', () => {
    it('should stop a running server and clean up', async () => {
      const tenantId = 'stoppable-tenant';
      // Start a server first (mocked success)
      dockerWorkspaceService.getOrCreateWorkspace.mockResolvedValue({ mode: 'local' });
      fs.existsSync.mockReturnValue(true);
      const startPromise = mcpToolboxService.startMcpServer(tenantId, {});
      await vi.advanceTimersByTimeAsync(3500);
      const initReq = JSON.parse(mockProcess.stdin.write.mock.calls[0][0]);
      mockReadlineInterface.lineCb(JSON.stringify({ id: initReq.id, result: {} }));
      const listReq = JSON.parse(mockProcess.stdin.write.mock.calls[2][0]);
      mockReadlineInterface.lineCb(JSON.stringify({ id: listReq.id, result: { tools: [] } }));
      await startPromise;

      expect(mcpToolboxService.activeServers.has(tenantId)).toBe(true);

      const result = await mcpToolboxService.stopMcpServer(tenantId);

      expect(result.success).toBe(true);
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mcpToolboxService.activeServers.has(tenantId)).toBe(false);
    });

    it('should return failure if no server is active for the tenant', async () => {
      const result = await mcpToolboxService.stopMcpServer('non-existent-tenant');
      expect(result.success).toBe(false);
      expect(result.message).toContain('No active MCP Toolbox instance found');
    });
  });

  describe('querySecureDatabase', () => {
    const tenantId = 'query-tenant';
    const customTools = [{ name: 'find_expensive_subscriptions', statement: 'SELECT * FROM subs WHERE price > 100' }];

    beforeEach(async () => {
      // Start a server with a real bridge for this tenant
      dockerWorkspaceService.getOrCreateWorkspace.mockResolvedValue({ mode: 'local' });
      fs.existsSync.mockReturnValue(true);
      const startPromise = mcpToolboxService.startMcpServer(tenantId, {}, customTools);
      await vi.advanceTimersByTimeAsync(3500);
      const initReq = JSON.parse(mockProcess.stdin.write.mock.calls[0][0]);
      mockReadlineInterface.lineCb(JSON.stringify({ id: initReq.id, result: {} }));
      const listReq = JSON.parse(mockProcess.stdin.write.mock.calls[2][0]);
      mockReadlineInterface.lineCb(JSON.stringify({ id: listReq.id, result: { tools: [] } }));
      await startPromise;
    });

    it('should throw an error if the server is not connected', async () => {
      await expect(mcpToolboxService.querySecureDatabase('unconnected-tenant', 'list tables'))
        .rejects.toThrow('Google MCP Database Toolbox is not connected for this workspace.');
    });

    it('should execute a query via the real MCP bridge', async () => {
      const bridge = mcpToolboxService.activeServers.get(tenantId).bridge;
      const mockResponse = { content: [{ text: 'users\nsubscriptions\n' }] };
      const sendRequestSpy = vi.spyOn(bridge, 'sendRequest').mockResolvedValue(mockResponse);

      const result = await mcpToolboxService.querySecureDatabase(tenantId, 'list all tables');

      expect(sendRequestSpy).toHaveBeenCalledWith('tools/call', {
        name: 'list_tables',
        arguments: {}
      });
      expect(result.success).toBe(true);
      expect(result.toolUsed).toBe('list_tables');
      expect(result.answer).toContain('users\nsubscriptions\n');
      expect(result.answer).toContain('Safe Transaction Completed');
    });

    it('should correctly map query intent to a schema tool', async () => {
      const bridge = mcpToolboxService.activeServers.get(tenantId).bridge;
      const mockResponse = { content: [{ text: 'id: int\nemail: varchar\n' }] };
      const sendRequestSpy = vi.spyOn(bridge, 'sendRequest').mockResolvedValue(mockResponse);

      const result = await mcpToolboxService.querySecureDatabase(tenantId, 'what is the schema for the users table?');

      expect(sendRequestSpy).toHaveBeenCalledWith('tools/call', {
        name: 'get_schema',
        arguments: { table: 'users' }
      });
      expect(result.toolUsed).toBe('get_schema');
      expect(result.answer).toContain('id: int\nemail: varchar\n');
    });

    it('should fall back to mock implementation if real bridge query fails', async () => {
      const bridge = mcpToolboxService.activeServers.get(tenantId).bridge;
      const sendRequestSpy = vi.spyOn(bridge, 'sendRequest').mockRejectedValue(new Error('Bridge connection lost'));

      const result = await mcpToolboxService.querySecureDatabase(tenantId, 'list tables');

      expect(sendRequestSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.toolUsed).toBe('list_tables');
      expect(result.answer).toContain('billing_history'); // from mock data
      expect(mcpToolboxService.activeServers.get(tenantId).terminalLogs.some(log => log.includes('Falling back to virtual simulation'))).toBe(true);
    });

    it('should use mock implementation if server was started in mock mode', async () => {
      const mockTenant = 'mock-only-tenant';
      mcpToolboxService.activeServers.set(mockTenant, {
        status: 'active',
        isMocked: true,
        bridge: null,
        connectionDetails: { type: 'postgres' },
        customTools: customTools,
        terminalLogs: []
      });

      const result = await mcpToolboxService.querySecureDatabase(mockTenant, 'show me find_expensive_subscriptions');
      expect(result.success).toBe(true);
      expect(result.toolUsed).toBe('find_expensive_subscriptions');
      expect(result.statement).toBe('SELECT * FROM subs WHERE price > 100');
      expect(result.answer).toContain('Gemini Enterprise Workspace API'); // from mock data
    });
  });

  describe('getStatus', () => {
    it('should return connection status for an active server', () => {
      const tenantId = 'status-tenant';
      mcpToolboxService.activeServers.set(tenantId, {
        connectionDetails: { type: 'mysql', database: 'prod_db' },
        configPath: '/path/to/config.yaml',
        customTools: [{}, {}],
        terminalLogs: ['log1'],
        isMocked: true
      });

      const status = mcpToolboxService.getStatus(tenantId);
      expect(status).toEqual({
        connected: true,
        type: 'mysql',
        database: 'prod_db',
        configPath: '/path/to/config.yaml',
        customToolsCount: 2,
        terminalLogs: ['log1'],
        isMocked: true
      });
    });

    it('should return not connected for an inactive tenant', () => {
      const status = mcpToolboxService.getStatus('inactive-tenant');
      expect(status).toEqual({ connected: false });
    });
  });
});