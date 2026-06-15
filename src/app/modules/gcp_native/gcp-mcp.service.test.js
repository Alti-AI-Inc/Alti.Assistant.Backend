import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GcpMcpService } from './gcp-mcp.service.js'; // Assuming the test file is in the same directory or adjust path

// Mock external dependencies
vi.mock('child_process', () => ({
  spawn: vi.fn().mockImplementation(() => {
    const mockProcess = new (require('events').EventEmitter)();
    mockProcess.stdout = new (require('events').EventEmitter)();
    mockProcess.stderr = new (require('events').EventEmitter)();
    mockProcess.kill = vi.fn();
    mockProcess.pid = 12345; // Assign a mock PID
    return mockProcess;
  }),
}));

vi.mock('path', () => ({
  default: {
    resolve: vi.fn().mockImplementation((...args) => args.join('/')), // Simple mock for path resolution
    dirname: vi.fn().mockImplementation((p) => p.split('/').slice(0, -1).join('/')),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock('url', () => ({
  fileURLToPath: vi.fn().mockImplementation(() => '/mock/path/to/gcp-mcp.service.js'),
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the dynamic import for @toolbox-sdk/core
vi.mock('@toolbox-sdk/core', () => {
  const mockTool = {
    getName: vi.fn().mockImplementation(() => 'test-tool'),
    call: vi.fn().mockImplementation(async (params) => ({
      data: `Tool called with ${JSON.stringify(params)}`,
      status: 'success'
    })),
  };
  const mockClient = {
    loadToolset: vi.fn().mockImplementation(async (toolsetName) => {
      if (toolsetName === 'test-toolset') {
        return [mockTool];
      }
      return [];
    }),
  };
  return {
    ToolboxClient: vi.fn().mockImplementation(() => mockClient),
  };
});

// Import the mocked modules
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logger } from '../../../shared/logger.js';
import { ToolboxClient } from '@toolbox-sdk/core';

describe('GcpMcpService', () => {
  let mockChildProcess;
  let originalProcessPlatform;
  let originalProcessCwd;

  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure spawn returns a fresh mock process for each test
    mockChildProcess = new (require('events').EventEmitter)();
    mockChildProcess.stdout = new (require('events').EventEmitter)();
    mockChildProcess.stderr = new (require('events').EventEmitter)();
    mockChildProcess.kill = vi.fn();
    mockChildProcess.pid = 54321;
    spawn.mockReturnValue(mockChildProcess);

    // Reset process.env for each test
    delete process.env.OFFLINE_MODE;
    delete process.env.TEMPORAL_MOCK;
    delete process.env.PORT; // Clear any port set by previous tests

    // Store original process properties
    originalProcessPlatform = process.platform;
    originalProcessCwd = process.cwd;

    // Default mocks for path and fs
    path.resolve.mockImplementation((...args) => args.join('/'));
    fs.existsSync.mockReturnValue(false); // Default to no binary found
  });

  afterEach(() => {
    // Clean up any environment variables set during tests
    delete process.env.OFFLINE_MODE;
    delete process.env.TEMPORAL_MOCK;
    delete process.env.PORT;

    // Restore original process properties
    Object.defineProperty(process, 'platform', {
      value: originalProcessPlatform,
      writable: true,
    });
    Object.defineProperty(process, 'cwd', {
      value: originalProcessCwd,
      writable: true,
    });
  });

  describe('startMcpServer', () => {
    it('should start the MCP server in offline mode if OFFLINE_MODE is true', async () => {
      process.env.OFFLINE_MODE = 'true';
      const result = await GcpMcpService.startMcpServer();

      expect(result).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Offline/Mock mode active'));
      expect(spawn).not.toHaveBeenCalled();
      expect(GcpMcpService.getMcpServerStatus().serverUrl).toBe('http://127.0.0.1:5000');
    });

    it('should start the MCP server in mock mode if TEMPORAL_MOCK is true', async () => {
      process.env.TEMPORAL_MOCK = 'true';
      const result = await GcpMcpService.startMcpServer({ port: 8080 });

      expect(result).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Offline/Mock mode active'));
      expect(spawn).not.toHaveBeenCalled();
      expect(GcpMcpService.getMcpServerStatus().serverUrl).toBe('http://127.0.0.1:8080');
    });

    it('should spawn the MCP server process with default options', async () => {
      const result = await GcpMcpService.startMcpServer();

      expect(result).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing local MCP Toolbox server'));
      expect(spawn).toHaveBeenCalledWith(
        'npx',
        ['-y', '@toolbox-sdk/server', '--port', '5000', '--config', 'mcp-toolbox/tools.yaml'],
        expect.any(Object)
      );
      expect(spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          cwd: process.cwd(),
          env: { ...process.env, PORT: '5000' },
          shell: true,
        })
      );
      expect(GcpMcpService.getMcpServerStatus().serverUrl).toBe('http://127.0.0.1:5000');
    });

    it('should spawn the MCP server process with custom options', async () => {
      const options = {
        port: 8080,
        configPath: '/custom/config/path/my-tools.yaml',
        stdio: true,
      };
      const result = await GcpMcpService.startMcpServer(options);

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        'npx',
        ['-y', '@toolbox-sdk/server', '--port', '8080', '--config', '/custom/config/path/my-tools.yaml', '--stdio'],
        expect.any(Object)
      );
      expect(GcpMcpService.getMcpServerStatus().serverUrl).toBe('http://127.0.0.1:8080');
    });

    it('should use Windows binary if available on win32', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      Object.defineProperty(process, 'cwd', { value: () => 'C:\\mock\\cwd' });
      path.resolve.mockImplementation((...args) => args.join('\\')); // Windows path style
      fs.existsSync.mockImplementation((p) => p === 'C:\\mock\\cwd\\bin\\mcp-toolbox.exe');

      const result = await GcpMcpService.startMcpServer();

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        'C:\\mock\\cwd\\bin\\mcp-toolbox.exe',
        ['--port', '5000', '--config', 'C:\\mock\\cwd\\mcp-toolbox\\tools.yaml'],
        expect.any(Object)
      );
    });

    it('should use Unix binary if available on non-win32', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'cwd', { value: () => '/mock/cwd' });
      path.resolve.mockImplementation((...args) => args.join('/'));
      fs.existsSync.mockImplementation((p) => p === '/mock/cwd/bin/mcp-toolbox');

      const result = await GcpMcpService.startMcpServer();

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        '/mock/cwd/bin/mcp-toolbox',
        ['--port', '5000', '--config', '/mock/cwd/mcp-toolbox/tools.yaml'],
        expect.any(Object)
      );
    });

    it('should stop previous instance if mcpProcess is already running', async () => {
      // First call to start a process
      await GcpMcpService.startMcpServer();
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(mockChildProcess.kill).not.toHaveBeenCalled(); // No kill on first start

      // Second call to start, should stop the first
      await GcpMcpService.startMcpServer({ port: 5001 });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopping previous instance first.'));
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(spawn).toHaveBeenCalledTimes(2); // A new process is spawned
      expect(GcpMcpService.getMcpServerStatus().serverUrl).toBe('http://127.0.0.1:5001');
    });

    it('should log stdout and stderr from the child process', async () => {
      await GcpMcpService.startMcpServer();

      mockChildProcess.stdout.emit('data', 'stdout data line 1\n');
      mockChildProcess.stderr.emit('data', 'stderr data line 1\n');

      expect(logger.info).toHaveBeenCalledWith('[GCP MCP Server stdout]: stdout data line 1');
      expect(logger.warn).toHaveBeenCalledWith('[GCP MCP Server stderr]: stderr data line 1');
    });

    it('should log when the child process closes and reset mcpProcess', async () => {
      await GcpMcpService.startMcpServer();

      expect(GcpMcpService.getMcpServerStatus().activePid).toBe(mockChildProcess.pid);

      mockChildProcess.emit('close', 0);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Server subprocess exited with code 0.'));
      expect(GcpMcpService.getMcpServerStatus().activePid).toBeNull();
    });

    it('should return false and log error if spawning fails', async () => {
      spawn.mockImplementation(() => { throw new Error('Spawn failed'); });

      const result = await GcpMcpService.startMcpServer();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to spawn MCP Toolbox server subprocess:'), expect.any(Error));
    });
  });

  describe('stopMcpServer', () => {
    it('should kill the running mcpProcess if it exists', async () => {
      await GcpMcpService.startMcpServer(); // Start a process to set mcpProcess
      expect(GcpMcpService.getMcpServerStatus().activePid).toBe(mockChildProcess.pid);

      await GcpMcpService.stopMcpServer();

      expect(logger.info).toHaveBeenCalledWith('GCP MCP: Sending SIGTERM signal to local server daemon...');
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(GcpMcpService.getMcpServerStatus().activePid).toBeNull(); // Should be reset to null
    });

    it('should do nothing if no mcpProcess is running', async () => {
      // Ensure mcpProcess is null initially
      await GcpMcpService.stopMcpServer();

      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Sending SIGTERM'));
      expect(mockChildProcess.kill).not.toHaveBeenCalled(); // No process to kill
      expect(GcpMcpService.getMcpServerStatus().activePid).toBeNull();
    });
  });

  describe('generateToolsConfig', () => {
    it('should generate default YAML config if no sources or tools are provided', () => {
      fs.existsSync.mockReturnValue(true); // Directory exists
      fs.mkdirSync.mockClear(); // Clear any previous calls

      const yaml = GcpMcpService.generateToolsConfig();

      expect(logger.info).toHaveBeenCalledWith('GCP MCP: Compiling tools.yaml configuration specifications for MCP Toolbox...');
      expect(yaml).toContain('kind: source');
      expect(yaml).toContain('name: alti-default-postgres');
      expect(yaml).toContain('kind: tool');
      expect(yaml).toContain('name: fetch-recent-alerts');
      expect(fs.mkdirSync).toHaveBeenCalledWith('mcp-toolbox', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith('mcp-toolbox/tools.yaml', expect.any(String), 'utf8');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully generated tools.yaml config at:'));
    });

    it('should generate YAML config with provided sources and tools', () => {
      fs.existsSync.mockReturnValue(true);
      fs.mkdirSync.mockClear();

      const customSources = [{
        kind: 'source',
        name: 'my-db',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'my_app',
        user: 'root',
      }];
      const customTools = [{
        kind: 'tool',
        name: 'get-users',
        type: 'mysql-sql',
        source: 'my-db',
        description: 'Get all users',
        parameters: [],
        statement: 'SELECT * FROM users;',
      }];

      const yaml = GcpMcpService.generateToolsConfig(customSources, customTools, '/tmp/custom-tools.yaml');

      expect(yaml).toContain('name: my-db');
      expect(yaml).toContain('type: mysql');
      expect(yaml).toContain('name: get-users');
      expect(yaml).toContain('statement: SELECT * FROM users;');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/custom-tools.yaml', expect.any(String), 'utf8');
    });

    it('should create parent directory if it does not exist', () => {
      fs.existsSync.mockReturnValueOnce(false); // Simulate directory not existing

      GcpMcpService.generateToolsConfig([], [], '/new/dir/tools.yaml');

      expect(fs.mkdirSync).toHaveBeenCalledWith('new/dir', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should log an error if writing to file fails', () => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation(() => { throw new Error('Write failed'); });

      const yaml = GcpMcpService.generateToolsConfig();

      expect(yaml).toBeDefined(); // Still returns the YAML string
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to write generated config to filesystem:'), expect.any(Error));
    });
  });

  describe('executeMcpTool', () => {
    it('should return mock data if OFFLINE_MODE is true', async () => {
      process.env.OFFLINE_MODE = 'true';
      const result = await GcpMcpService.executeMcpTool('any-toolset', 'execute_sql', { param: 'value' });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Mock offline execution activated.'));
      expect(result).toEqual(expect.objectContaining({
        success: true,
        mocked: true,
        tool: 'execute_sql',
        toolset: 'any-toolset',
        rowCount: 3,
        columns: expect.any(Array),
        rows: expect.any(Array),
      }));
      expect(ToolboxClient).not.toHaveBeenCalled();
    });

    it('should return mock data for non-SQL tools if TEMPORAL_MOCK is true', async () => {
      process.env.TEMPORAL_MOCK = 'true';
      const result = await GcpMcpService.executeMcpTool('any-toolset', 'get-tables');

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Mock offline execution activated.'));
      expect(result).toEqual(expect.objectContaining({
        success: true,
        mocked: true,
        tool: 'get-tables',
        toolset: 'any-toolset',
        tables: expect.any(Array),
        details: expect.any(Object),
      }));
      expect(ToolboxClient).not.toHaveBeenCalled();
    });

    it('should dynamically import ToolboxClient and execute the tool', async () => {
      const mockTool = ToolboxClient().loadToolset()[0]; // Get the mock tool instance
      mockTool.getName.mockReturnValue('my-tool');

      const result = await GcpMcpService.executeMcpTool('test-toolset', 'my-tool', { id: 1 });

      expect(ToolboxClient).toHaveBeenCalledWith('http://127.0.0.1:5000'); // Default URL
      expect(ToolboxClient().loadToolset).toHaveBeenCalledWith('test-toolset');
      expect(mockTool.getName).toHaveBeenCalled();
      expect(mockTool.call).toHaveBeenCalledWith({ id: 1 });
      expect(result).toEqual({
        success: true,
        tool: 'my-tool',
        toolset: 'test-toolset',
        result: { data: 'Tool called with {"id":1}', status: 'success' },
      });
    });

    it('should return an error if the tool is not found', async () => {
      ToolboxClient().loadToolset.mockResolvedValueOnce([]); // Simulate no tools found

      const result = await GcpMcpService.executeMcpTool('non-existent-toolset', 'non-existent-tool');

      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: 'Tool "non-existent-tool" was not found inside the loaded "non-existent-toolset" toolset.',
      }));
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('GCP MCP Execution Exception:'), expect.any(Error));
    });

    it('should return an error if ToolboxClient call fails', async () => {
      const mockTool = ToolboxClient().loadToolset()[0];
      mockTool.getName.mockReturnValue('failing-tool');
      mockTool.call.mockRejectedValueOnce(new Error('Tool execution failed'));

      const result = await GcpMcpService.executeMcpTool('test-toolset', 'failing-tool');

      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: 'Tool execution failed',
      }));
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('GCP MCP Execution Exception:'), expect.any(Error));
    });
  });

  describe('queryNaturalLanguage', () => {
    it('should return mock data if OFFLINE_MODE is true', async () => {
      process.env.OFFLINE_MODE = 'true';
      const query = 'How many alerts are there by status?';
      const result = await GcpMcpService.queryNaturalLanguage(query);

      expect(result).toEqual(expect.objectContaining({
        success: true,
        mocked: true,
        queryText: query,
        generatedSql: 'SELECT COUNT(*), status FROM security_alerts GROUP BY status;',
        analysis: expect.any(String),
        records: expect.any(Array),
      }));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Analyzing natural language analytical query:'));
    });

    it('should call executeMcpTool and return results in production mode', async () => {
      // Temporarily replace the actual executeMcpTool with our mock
      const originalExecuteMcpTool = GcpMcpService.executeMcpTool;
      GcpMcpService.executeMcpTool = vi.fn().mockImplementation(async (toolset, tool, params) => {
        if (toolset === 'alti-default-postgres' && tool === 'execute_sql') {
          return {
            success: true,
            rows: [[10, 'ACTIVE'], [5, 'INACTIVE']],
            columns: ['count', 'status']
          };
        }
        return { success: false, error: 'Mock error' };
      });

      const query = 'Summarize alert statuses.';
      const result = await GcpMcpService.queryNaturalLanguage(query);

      expect(GcpMcpService.executeMcpTool).toHaveBeenCalledWith(
        'alti-default-postgres',
        'execute_sql',
        { statement: 'SELECT COUNT(*), status FROM security_alerts GROUP BY status;' }
      );
      expect(result).toEqual(expect.objectContaining({
        success: true,
        queryText: query,
        generatedSql: 'SELECT COUNT(*), status FROM security_alerts GROUP BY status;',
        analysis: 'Natural language analysis successfully mapped and resolved against database schemas.',
        records: [[10, 'ACTIVE'], [5, 'INACTIVE']],
      }));

      // Restore original executeMcpTool
      GcpMcpService.executeMcpTool = originalExecuteMcpTool;
    });

    it('should return an error if executeMcpTool fails in production mode', async () => {
      const originalExecuteMcpTool = GcpMcpService.executeMcpTool;
      GcpMcpService.executeMcpTool = vi.fn().mockImplementation(async () => ({
        success: false,
        error: 'Database query failed',
      }));

      const query = 'Show me something.';
      const result = await GcpMcpService.queryNaturalLanguage(query);

      expect(result).toEqual(expect.objectContaining({
        success: false,
        queryText: query,
        error: 'Database query failed',
      }));
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('GCP MCP Natural Language Query Error:'), expect.any(Error));

      GcpMcpService.executeMcpTool = originalExecuteMcpTool;
    });
  });

  describe('getMcpServerStatus', () => {
    it('should return correct status when server is not running', () => {
      // Ensure mcpProcess is null (default state after beforeEach)
      const status = GcpMcpService.getMcpServerStatus();

      expect(status).toEqual({
        isRunning: false,
        serverUrl: 'http://127.0.0.1:5000', // Default initial URL
        activePid: null,
        mode: 'production',
      });
    });

    it('should return correct status when server is running', async () => {
      await GcpMcpService.startMcpServer({ port: 5001 }); // Start a process

      const status = GcpMcpService.getMcpServerStatus();

      expect(status).toEqual({
        isRunning: true,
        serverUrl: 'http://127.0.0.1:5001',
        activePid: mockChildProcess.pid,
        mode: 'production',
      });
    });

    it('should return correct status when in OFFLINE_MODE', () => {
      process.env.OFFLINE_MODE = 'true';
      const status = GcpMcpService.getMcpServerStatus();

      expect(status).toEqual({
        isRunning: true, // isRunning is true in offline mode
        serverUrl: 'http://127.0.0.1:5000', // Default URL if startMcpServer not called
        activePid: null,
        mode: 'mock-offline',
      });
    });

    it('should reflect updated serverUrl from startMcpServer in OFFLINE_MODE', async () => {
      process.env.OFFLINE_MODE = 'true';
      await GcpMcpService.startMcpServer({ port: 9000 }); // This will update mcpServerUrl

      const status = GcpMcpService.getMcpServerStatus();

      expect(status).toEqual({
        isRunning: true,
        serverUrl: 'http://127.0.0.1:9000',
        activePid: null,
        mode: 'mock-offline',
      });
    });
  });
});