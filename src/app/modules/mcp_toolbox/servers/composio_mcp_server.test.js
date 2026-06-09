import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock process.exit, process.stderr.write, process.stdout.write
const mockExit = vi.fn();
const mockStderrWrite = vi.fn();
const mockStdoutWrite = vi.fn();

// Store original process.env to restore it later
const originalEnv = process.env;

// Mock readline
const mockReadlineInterface = {
  on: vi.fn(),
  close: vi.fn(),
};
vi.mock('readline', () => ({
  createInterface: vi.fn(() => mockReadlineInterface),
}));

// Mock @composio/core
const mockComposioToolsGet = vi.fn();
const mockComposioToolsExecute = vi.fn();
const mockComposioConstructor = vi.fn(() => ({
  tools: {
    get: mockComposioToolsGet,
    execute: mockComposioToolsExecute,
  },
}));
vi.mock('@composio/core', () => ({
  Composio: mockComposioConstructor,
}));

// Helper to re-import the module after setting up mocks
// This is necessary because the module has global side effects on import (e.g., reading process.env, initializing readline)
async function importModule() {
  // Clear module cache to ensure a fresh import with the current process.env and mocks
  vi.resetModules();

  // Mock process properties before importing the module
  Object.defineProperty(process, 'exit', { value: mockExit, configurable: true });
  Object.defineProperty(process, 'stderr', { value: { write: mockStderrWrite }, configurable: true });
  Object.defineProperty(process, 'stdout', { value: { write: mockStdoutWrite }, configurable: true });
  
  // Import the module. This will trigger its global initialization logic.
  await import('../src/app/modules/mcp_toolbox/servers/composio_mcp_server.js');
}

describe('Composio MCP Server', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Reset process.env to a clean state for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original process.env after all tests
    process.env = originalEnv;
  });

  // Test Case 1: Missing COMPOSIO_API_KEY
  it('should exit with an error if COMPOSIO_API_KEY is not set', async () => {
    delete process.env.COMPOSIO_API_KEY;

    await importModule();

    expect(mockStderrWrite).toHaveBeenCalledWith('[COMPOSIO MCP ERROR] COMPOSIO_API_KEY environment variable is required.\n');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockComposioConstructor).not.toHaveBeenCalled(); // Composio should not be initialized
  });

  // Test Case 2: Initialization with valid API key and default tenant/toolkits
  it('should initialize Composio with API key and default tenant/toolkits', async () => {
    process.env.COMPOSIO_API_KEY = 'test_api_key';
    delete process.env.TENANT_ID; // Ensure default 'default_user' is used
    delete process.env.COMPOSIO_TOOLKITS; // Ensure empty toolkits list

    await importModule();

    expect(mockExit).not.toHaveBeenCalled();
    expect(mockComposioConstructor).toHaveBeenCalledWith({ apiKey: 'test_api_key' });
    expect(mockReadlineInterface.on).toHaveBeenCalledWith('line', expect.any(Function));
  });

  // Test Case 3: Initialization with custom tenant and toolkits
  it('should initialize Composio with custom tenant and toolkits', async () => {
    process.env.COMPOSIO_API_KEY = 'test_api_key';
    process.env.TENANT_ID = 'custom_tenant_id';
    process.env.COMPOSIO_TOOLKITS = 'toolkit1, toolkit2,  toolkit3 '; // Test trimming and lowercasing

    await importModule();

    expect(mockExit).not.toHaveBeenCalled();
    expect(mockComposioConstructor).toHaveBeenCalledWith({ apiKey: 'test_api_key' });
    // The derived 'toolkits' array and 'tenantId' will be tested when used by handlers
  });

  // Test Case 4: `loadAndMapTools` with 'test_mock_key'
  it('should load static mock tools when apiKey is "test_mock_key"', async () => {
    process.env.COMPOSIO_API_KEY = 'test_mock_key';
    process.env.COMPOSIO_TOOLKITS = 'any_toolkit'; // This should be ignored by the mock key logic

    await importModule();

    // Get the line handler function that was registered with readline.on('line')
    const lineHandler = mockReadlineInterface.on.mock.calls[0][1];
    
    // Simulate an 'initialize' request to trigger loadAndMapTools
    await lineHandler(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }));

    expect(mockStderrWrite).toHaveBeenCalledWith('[COMPOSIO MCP] Mock testing key detected. Exposing static mock tools.\n');
    expect(mockComposioToolsGet).not.toHaveBeenCalled(); // Should not call the actual Composio API
    
    // Verify the initialize response contains server info
    const initResponse = JSON.parse(mockStdoutWrite.mock.calls[0][0]);
    expect(initResponse.result.protocolVersion).toBe('2024-11-05');
    expect(initResponse.result.serverInfo.name).toBe('Composio-Self-Hosted-MCP');

    // Now, simulate a 'tools/list' request to check the cached tools
    mockStdoutWrite.mockClear(); // Clear previous stdout calls
    await lineHandler(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));

    const toolsListResponse = JSON.parse(mockStdoutWrite.mock.calls[0][0]);
    expect(toolsListResponse.result.tools).toEqual([
      {
        name: 'GITHUB_STAR_A_REPOSITORY',
        description: 'Stars a repository on GitHub',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Owner of the repo' },
            repo: { type: 'string', description: 'Name of the repo' }
          },
          required: ['owner', 'repo']
        }
      }
    ]);
  });

  // Test Case 5: `loadAndMapTools` with no toolkits specified
  it('should load an empty tools list if no toolkits are specified', async () => {
    process.env.COMPOSIO_API_KEY = 'test_api_key';
    process.env.COMPOSIO_TOOLKITS = ''; // No toolkits

    await importModule();

    const lineHandler = mockReadlineInterface.on.mock.calls[0][1];
    await lineHandler(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }));

    expect(mockStderrWrite).toHaveBeenCalledWith('[COMPOSIO MCP] No toolkits specified. Exposing empty tools list.\n');
    expect(mockComposioToolsGet).not.toHaveBeenCalled(); // Should not call API if no toolkits
    
    // Simulate a 'tools/list' request to verify cached tools
    mockStdoutWrite.mockClear();
    await lineHandler(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
    const toolsListResponse = JSON.parse(mockStdoutWrite.mock.calls[0][0]);
    expect(toolsListResponse.result.tools).toEqual([]);
  });

  // Test Case 6: `loadAndMapTools` successfully fetches and maps tools
  it('should fetch and map tools from Composio API', async () => {
    process.env.COMPOSIO_API_KEY = 'test_api_key';
    process.env.COMPOSIO_TOOLKITS = 'toolkit1,toolkit2';

    const mockComposioApiResponse = [
      {
        name: 'TestTool1',
        slug: 'test_tool_1',
        description: 'Description for TestTool1',
        parameters: {
          type: 'object',
          properties: {
            param1: { type: 'string', description: 'Param 1 desc', required: true },
            param2: { type: 'number', description: 'Param 2 desc' },
          },
        },
      },
      {
        name: 'TestTool2',
        slug: 'test_tool_2',
        description: 'Description for TestTool2',
        parameters: {
          type: 'object',
          properties: {
            paramA: { type: 'boolean', description: 'Param A desc' },
          },
        },
      },
      { // Tool with no parameters
        name: 'TestTool3',
        slug: 'test_tool_3',
        description: 'Description for TestTool3',
        parameters: null,
      },
      { // Tool with empty parameters object
        name: 'TestTool4',
        slug: 'test_tool_4',
        description: 'Description for TestTool4',
        parameters: { type: 'object', properties: {} },
      },
    ];
    mockComposioToolsGet.mockResolvedValue(mockComposioApiResponse);

    await importModule();

    const lineHandler = mockReadlineInterface.on.mock.calls[0][1];
    await lineHandler(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }));

    expect(mockComposioToolsGet).toHaveBeenCalledWith({ apps: ['toolkit1', 'toolkit2'] });
    expect(mockStderrWrite).toHaveBeenCalledWith('[COMPOSIO MCP] Successfully mapped 4 compliant tools.\n');
    
    // Simulate a 'tools/list' request to check the cached tools
    mockStdoutWrite.mockClear();
    await lineHandler(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
    const toolsListResponse = JSON.parse(mockStdoutWrite.mock.calls[0][0]);
    expect(toolsListResponse.result.tools).toEqual([
      {
        name: 'TestTool1',
        description: 'Description for TestTool1',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string', description: 'Param 1 desc' },
            param2: { type: 'number', description: 'Param 2 desc' },
          },
          required: ['param1'],
        },
      },
      {
        name: 'TestTool2',
        description: 'Description for TestTool2',
        inputSchema: {
          type: 'object',
          properties: {
            paramA: { type: 'boolean', description: 'Param A desc' },
          },
          required: undefined, // No required params
        },
      },
      {
        name: 'TestTool3',
        description: 'Description for TestTool3',
        inputSchema: {
          type: 'object',
          properties: {},
          required: undefined,
        },
      },
      {
        name: 'TestTool4',
        description: 'Description for TestTool4',
        inputSchema: {
          type: 'object',
          properties: {},
          required: undefined,
        },
      },
    ]);
  });

  // Test Case 7: `loadAndMapTools` API call fails
  it('should handle errors when fetching tools from Composio API', async () => {
    process.env.COMPOSIO_API_KEY = 'test_api_key';
    process.env.COMPOSIO_TOOLKITS = 'toolkit1';

    const errorMessage = 'Failed to connect to Composio';
    mockComposioToolsGet.mockRejectedValue(new Error(errorMessage));

    await importModule();

    const lineHandler = mockReadlineInterface.on.mock.calls[0][1];
    await lineHandler(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }));

    expect(mockComposioToolsGet).toHaveBeenCalledWith({ apps: ['toolkit1'] });
    expect(mockStderrWrite).toHaveBeenCalledWith(`[COMPOSIO MCP ERROR] Failed to load toolkits: ${errorMessage}\n`);
    
    // Check that cachedMcpTools is empty after failure
    mockStdoutWrite.mockClear();
    await lineHandler(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
    const toolsListResponse = JSON.parse(mockStdoutWrite.mock.calls[0][0]);
    expect(toolsListResponse.result.tools).toEqual([]);
  });

  // Test Case 8: `tools/call` with 'test_mock_key'
  it('should execute mock action when apiKey is "test_mock_key"', async () => {
    process.env.COMPOSIO_API_KEY = 'test_mock_key';
    process.env.TENANT_ID = 'mock_tenant';

    await importModule();

    const lineHandler = mockReadlineInterface.on.mock.calls[0][1];
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'MOCK_TOOL',
        arguments: { key: 'value' },
      },
    };
    await lineHandler(JSON.stringify(request));

    expect(mockStderrWrite).toHaveBeenCalledWith('[COMPOSIO MCP] Executing action: "MOCK_TOOL" on behalf of user: "mock_tenant"\n');
    expect(mockComposioToolsExecute).not.toHaveBeenCalled(); // Should not call actual API
    
    const response = JSON.parse(mockStdoutWrite.mock.calls[0][0]);
    expect(response.result.content[0].text).toEqual(JSON.stringify({ success: true, message: 'Mock execution successful for: MOCK_TOOL', arguments: { key: 'value' } }));
  });

  // Test Case 9: `tools/call` successfully executes an action
  it('should execute an action via Composio API', async () => {
    process.env.COMPOSIO_API_KEY = 'test_api_key';
    process.env.TENANT_ID = 'real_tenant';

    const mockExecutionResult = { status: 'completed', output: 'Action done' };
    mockComposioToolsExecute.mockResolvedValue(mockExecutionResult);

    await importModule();

    const lineHandler = mockReadlineInterface.on.mock.calls[0][1];
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'REAL_TOOL',
        arguments: { arg1: 'val1' },
      },
    };
    await lineHandler(JSON.stringify(request));

    expect(mockStderrWrite).toHaveBeenCalledWith('[COMPOSIO MCP] Executing action: "REAL_TOOL" on behalf of user: "real_tenant"\n');
    expect(mockComposioToolsExecute).toHaveBeenCalledWith('REAL_TOOL', {
      userId: 'real_tenant',
      arguments: { arg1: 'val1' },
    });
    
    const response = JSON.parse(mockStdoutWrite.mock.calls[0][0]);
    expect(response.result.content[0].text).toEqual(JSON.stringify(mockExecutionResult));
  });

  // Test Case 10: `tools/call` execution fails
  it('should return an error response if action execution fails', async () => {
    process.env.COMPOSIO_API_KEY = 'test_api_key';
    process.env.TENANT_ID = 'real_tenant';

    const errorMessage = 'Execution failed due to external error';
    mockComposioToolsExecute.mockRejectedValue(new Error(errorMessage));

    await importModule();

    const lineHandler = mockReadlineInterface.on.mock.calls[0][1];
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'FAILING_TOOL',
        arguments: { arg1: 'val1' },
      },
    };
    await lineHandler(JSON.stringify(request));

    expect(mockStderrWrite).toHaveBeenCalledWith(`[COMPOSIO MCP EXEC ERROR] Action execution failed: ${errorMessage}\n`);
    
    const response = JSON.parse(mockStdoutWrite.mock.calls[0][0]);
    expect(response.error).toEqual({
      code: -32603,
      message: errorMessage,
    });
  });

  // Test Case 11: Invalid JSON input
  it('should log an error for unparsable stdin frame', async () => {
    process.env.COMPOSIO_API_KEY = 'test_api_key';
    await importModule();

    const lineHandler = mockReadlineInterface.on.mock.calls[0][1];
    await lineHandler('this is not json');

    expect(mockStderrWrite).toHaveBeenCalledWith(expect.stringContaining('[COMPOSIO MCP ERROR] Unparsable stdin frame:'));
    expect(mockStdoutWrite).not.toHaveBeenCalled(); // No JSON-RPC response for unparsable input
  });

  // Test Case 12: Empty line input
  it('should ignore empty lines', async () => {
    process.env.COMPOSIO_API_KEY = 'test_api_key';
    await importModule();

    const lineHandler = mockReadlineInterface.on.mock.calls[0][1];
    await lineHandler('');
    await lineHandler('   ');

    expect(mockStderrWrite).not.toHaveBeenCalled();
    expect(mockStdoutWrite).not.toHaveBeenCalled();
  });

  // Test Case 13: Unknown method
  it('should not respond to unknown methods', async () => {
    process.env.COMPOSIO_API_KEY = 'test_api_key';
    await importModule();

    const lineHandler = mockReadlineInterface.on.mock.calls[0][1];
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'unknown/method',
      params: {},
    };
    await lineHandler(JSON.stringify(request));

    // The current implementation doesn't send an error for unknown methods,
    // it just ignores them. So, stdout should not be called.
    expect(mockStdoutWrite).not.toHaveBeenCalled();
    expect(mockStderrWrite).not.toHaveBeenCalled(); // No specific error logging for unknown method
  });
});