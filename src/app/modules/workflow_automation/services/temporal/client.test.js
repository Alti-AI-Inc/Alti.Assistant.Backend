import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const {
  mockConnection,
  mockClient,
  mockRunDurableWorkflow,
  mockLogger,
  mockConfig
} = vi.hoisted(() => {
  // Mock @temporalio/client
  const mockConnection = {
    connect: vi.fn(),
  };
  const mockClient = {
    workflow: {
      start: vi.fn(),
    },
  };

  // Mock runDurableWorkflow
  const mockRunDurableWorkflow = vi.fn();

  // Mock logger
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
  };

  // Mock config
  const mockConfig = {
    temporal: {
      address: 'test-temporal-address:7233',
      namespace: 'test-namespace',
      active: true,
    },
  };

  return {
    mockConnection,
    mockClient,
    mockRunDurableWorkflow,
    mockLogger,
    mockConfig
  };
});

vi.mock('@temporalio/client', () => ({
  Connection: mockConnection,
  Client: vi.fn().mockImplementation(() => mockClient),
}));

vi.mock('./workflows.js', () => ({
  runDurableWorkflow: mockRunDurableWorkflow,
}));

vi.mock('../../../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../../../config/index.js', () => ({
  default: mockConfig,
}));

// Import the module to be tested
import { temporalClientCoordinator } from './client.js';

describe('TemporalClientCoordinator', () => {
  let originalEnv;

  beforeEach(() => {
    // Reset the singleton instance for each test
    temporalClientCoordinator.client = null;
    temporalClientCoordinator.connection = null;
    temporalClientCoordinator.isMock = false;
    temporalClientCoordinator.connectionPromise = null;

    // Reset all mocks
    vi.clearAllMocks();

    // Store original process.env
    originalEnv = process.env;
    process.env = { ...originalEnv }; // Create a copy to modify
  });

  afterEach(() => {
    // Restore original process.env
    process.env = originalEnv;
  });

  describe('connect', () => {
    it('should connect to Temporal successfully when active and not in offline/test mode', async () => {
      mockConnection.connect.mockResolvedValueOnce({ /* mock connection object */ });

      const client = await temporalClientCoordinator.connect();

      expect(mockConnection.connect).toHaveBeenCalledWith({ address: mockConfig.temporal.address });
      expect(Client).toHaveBeenCalledWith({
        connection: expect.any(Object), // The resolved connection object
        namespace: mockConfig.temporal.namespace,
      });
      expect(client).toBe(mockClient);
      expect(temporalClientCoordinator.isMock).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `[Temporal Client] Connecting to Temporal Service at ${mockConfig.temporal.address}...`
      );
      expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Client] Connected successfully to Temporal Service.');
      expect(temporalClientCoordinator.connectionPromise).toBeNull(); // Should be cleared after connection
    });

    it('should initialize a mock client if connection fails', async () => {
      const errorMessage = 'Connection refused';
      mockConnection.connect.mockRejectedValueOnce(new Error(errorMessage));

      const client = await temporalClientCoordinator.connect();

      expect(mockConnection.connect).toHaveBeenCalledWith({ address: mockConfig.temporal.address });
      expect(Client).not.toHaveBeenCalled(); // Client constructor should not be called
      expect(client).toBeDefined();
      expect(client.workflow.start).toBeInstanceOf(Function); // Should be the mock client's start method
      expect(temporalClientCoordinator.isMock).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `[Temporal Client] Live Temporal connection failed: ${errorMessage}. Initializing Offline Mock Client.`
      );
      expect(temporalClientCoordinator.connectionPromise).toBeNull(); // Should be cleared after connection attempt
    });

    it('should initialize a mock client if OFFLINE_MODE is true', async () => {
      process.env.OFFLINE_MODE = 'true';
      mockConfig.temporal.active = true; // Ensure config is active, but env var overrides

      const client = await temporalClientCoordinator.connect();

      expect(mockConnection.connect).not.toHaveBeenCalled();
      expect(Client).not.toHaveBeenCalled();
      expect(client).toBeDefined();
      expect(client.workflow.start).toBeInstanceOf(Function);
      expect(temporalClientCoordinator.isMock).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Temporal Client] Live Temporal connection failed: Local offline/test environment mode is active.. Initializing Offline Mock Client.'
      );
      expect(temporalClientCoordinator.connectionPromise).toBeNull();
    });

    it('should initialize a mock client if NODE_ENV is test', async () => {
      process.env.NODE_ENV = 'test';
      mockConfig.temporal.active = true; // Ensure config is active, but env var overrides

      const client = await temporalClientCoordinator.connect();

      expect(mockConnection.connect).not.toHaveBeenCalled();
      expect(Client).not.toHaveBeenCalled();
      expect(client).toBeDefined();
      expect(client.workflow.start).toBeInstanceOf(Function);
      expect(temporalClientCoordinator.isMock).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Temporal Client] Live Temporal connection failed: Local offline/test environment mode is active.. Initializing Offline Mock Client.'
      );
      expect(temporalClientCoordinator.connectionPromise).toBeNull();
    });

    it('should initialize a mock client if config.temporal.active is false', async () => {
      mockConfig.temporal.active = false;
      process.env.OFFLINE_MODE = 'false'; // Ensure env vars don't interfere
      process.env.NODE_ENV = 'development';

      const client = await temporalClientCoordinator.connect();

      expect(mockConnection.connect).not.toHaveBeenCalled();
      expect(Client).not.toHaveBeenCalled();
      expect(client).toBeDefined();
      expect(client.workflow.start).toBeInstanceOf(Function);
      expect(temporalClientCoordinator.isMock).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Temporal Client] Live Temporal connection failed: Local offline/test environment mode is active.. Initializing Offline Mock Client.'
      );
      expect(temporalClientCoordinator.connectionPromise).toBeNull();
    });

    it('should use default address if config.temporal.address is not provided', async () => {
      const originalAddress = mockConfig.temporal.address;
      mockConfig.temporal.address = undefined;
      mockConnection.connect.mockResolvedValueOnce({});

      await temporalClientCoordinator.connect();

      expect(mockConnection.connect).toHaveBeenCalledWith({ address: 'localhost:7233' });
      mockConfig.temporal.address = originalAddress; // Restore
    });

    it('should use default namespace if config.temporal.namespace is not provided', async () => {
      const originalNamespace = mockConfig.temporal.namespace;
      mockConfig.temporal.namespace = undefined;
      mockConnection.connect.mockResolvedValueOnce({});

      await temporalClientCoordinator.connect();

      expect(Client).toHaveBeenCalledWith({
        connection: expect.any(Object),
        namespace: 'default',
      });
      mockConfig.temporal.namespace = originalNamespace; // Restore
    });

    it('should handle concurrent calls to connect without creating multiple connections', async () => {
      mockConnection.connect.mockResolvedValueOnce({});

      const promise1 = temporalClientCoordinator.connect();
      const promise2 = temporalClientCoordinator.connect();
      const promise3 = temporalClientCoordinator.connect();

      const [client1, client2, client3] = await Promise.all([promise1, promise2, promise3]);

      expect(mockConnection.connect).toHaveBeenCalledTimes(1); // Only one actual connection attempt
      expect(Client).toHaveBeenCalledTimes(1);
      expect(client1).toBe(mockClient);
      expect(client2).toBe(mockClient);
      expect(client3).toBe(mockClient);
      expect(temporalClientCoordinator.connectionPromise).toBeNull(); // Should be cleared
    });

    it('should allow reconnection after a failed attempt', async () => {
      // First attempt fails
      mockConnection.connect.mockRejectedValueOnce(new Error('Initial failure'));
      await temporalClientCoordinator.connect();
      expect(temporalClientCoordinator.isMock).toBe(true);
      expect(mockConnection.connect).toHaveBeenCalledTimes(1);
      expect(temporalClientCoordinator.connectionPromise).toBeNull(); // Promise cleared

      // Reset mocks for a fresh attempt
      vi.clearAllMocks();
      temporalClientCoordinator.client = null; // Reset client to force new connection
      temporalClientCoordinator.isMock = false;

      // Second attempt succeeds
      mockConnection.connect.mockResolvedValueOnce({});
      await temporalClientCoordinator.connect();
      expect(temporalClientCoordinator.isMock).toBe(false);
      expect(mockConnection.connect).toHaveBeenCalledTimes(1); // Another connection attempt
      expect(Client).toHaveBeenCalledTimes(1);
      expect(temporalClientCoordinator.connectionPromise).toBeNull(); // Promise cleared
    });
  });

  describe('startWorkflow', () => {
    const mockWorkflow = { _id: 'wf123', name: 'Test Workflow' };
    const mockUserId = 'user456';
    const mockContext = { data: 'some data' };
    const mockOptions = { startStepIndex: 1 };

    it('should start a live workflow if connected to Temporal', async () => {
      // Simulate successful connection
      mockConnection.connect.mockResolvedValueOnce({});
      temporalClientCoordinator.client = mockClient; // Pre-set client to simulate already connected
      temporalClientCoordinator.isMock = false;

      const mockHandle = { workflowId: 'live-wf-id', result: vi.fn().mockResolvedValue('workflow-result') };
      mockClient.workflow.start.mockResolvedValueOnce(mockHandle);

      const result = await temporalClientCoordinator.startWorkflow(
        mockWorkflow,
        mockUserId,
        mockContext,
        mockOptions
      );

      expect(temporalClientCoordinator.client).toBe(mockClient);
      expect(mockClient.workflow.start).toHaveBeenCalledTimes(1);
      expect(mockClient.workflow.start).toHaveBeenCalledWith(mockRunDurableWorkflow, {
        args: [mockWorkflow, mockUserId, mockContext, mockOptions.startStepIndex],
        taskQueue: 'insoai-workflows-queue',
        workflowId: expect.stringMatching(/^wf-wf123-\d+$/),
      });
      expect(result).toEqual({
        success: true,
        workflowId: expect.stringMatching(/^wf-wf123-\d+$/),
        isMock: false,
        handle: mockHandle,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[Temporal Client\] Starting durable workflow wf-wf123-\d+ \(Mock: false\)$/)
      );
    });

    it('should start a mock workflow if in mock mode', async () => {
      // Simulate mock connection
      temporalClientCoordinator.isMock = true;
      temporalClientCoordinator.client = temporalClientCoordinator._createMockClient(); // Manually create mock client

      const mockWorkflowResult = 'mock-workflow-completed';
      mockRunDurableWorkflow.mockResolvedValueOnce(mockWorkflowResult);

      const result = await temporalClientCoordinator.startWorkflow(
        mockWorkflow,
        mockUserId,
        mockContext,
        mockOptions
      );

      expect(temporalClientCoordinator.isMock).toBe(true);
      expect(mockRunDurableWorkflow).toHaveBeenCalledWith(
        mockWorkflow,
        mockUserId,
        mockContext,
        mockOptions.startStepIndex
      );
      expect(result).toEqual({
        success: true,
        workflowId: expect.stringMatching(/^wf-wf123-\d+$/),
        isMock: true,
        handle: expect.objectContaining({
          workflowId: expect.stringMatching(/^wf-wf123-\d+$/),
          result: expect.any(Function),
        }),
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[Temporal Client\] Starting durable workflow wf-wf123-\d+ \(Mock: true\)$/)
      );

      // Verify the mock handle's result method
      const handleResult = await result.handle.result();
      expect(handleResult).toBe(mockWorkflowResult);
    });

    it('should connect first if client is not initialized, then start live workflow', async () => {
      // Ensure client is null initially
      temporalClientCoordinator.client = null;
      temporalClientCoordinator.isMock = false;

      // Mock successful connection
      mockConnection.connect.mockResolvedValueOnce({});
      mockClient.workflow.start.mockResolvedValueOnce({ workflowId: 'live-wf-id' });

      const result = await temporalClientCoordinator.startWorkflow(
        mockWorkflow,
        mockUserId,
        mockContext,
        mockOptions
      );

      expect(mockConnection.connect).toHaveBeenCalledTimes(1); // connect should be called
      expect(Client).toHaveBeenCalledTimes(1); // Client should be instantiated
      expect(mockClient.workflow.start).toHaveBeenCalledTimes(1); // Workflow should be started
      expect(result.isMock).toBe(false);
    });

    it('should connect first if client is not initialized, then start mock workflow if connection fails', async () => {
      // Ensure client is null initially
      temporalClientCoordinator.client = null;
      temporalClientCoordinator.isMock = false;

      // Mock connection failure
      mockConnection.connect.mockRejectedValueOnce(new Error('Connection failed for startWorkflow test'));

      const mockWorkflowResult = 'mock-workflow-completed-after-failed-connect';
      mockRunDurableWorkflow.mockResolvedValueOnce(mockWorkflowResult);

      const result = await temporalClientCoordinator.startWorkflow(
        mockWorkflow,
        mockUserId,
        mockContext,
        mockOptions
      );

      expect(mockConnection.connect).toHaveBeenCalledTimes(1); // connect should be called
      expect(Client).not.toHaveBeenCalled(); // Client should NOT be instantiated for live
      expect(temporalClientCoordinator.isMock).toBe(true); // Should be in mock mode
      expect(mockRunDurableWorkflow).toHaveBeenCalledTimes(1); // Mock workflow should be started
      expect(result.isMock).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Connection failed for startWorkflow test')
      );
    });

    it('should use default startStepIndex of 0 if not provided', async () => {
      temporalClientCoordinator.isMock = true;
      temporalClientCoordinator.client = temporalClientCoordinator._createMockClient();

      await temporalClientCoordinator.startWorkflow(mockWorkflow, mockUserId, mockContext, {}); // No options

      expect(mockRunDurableWorkflow).toHaveBeenCalledWith(
        mockWorkflow,
        mockUserId,
        mockContext,
        0 // Default startStepIndex
      );
    });

    it('should generate workflowId with "temp" if workflow._id is missing', async () => {
      temporalClientCoordinator.isMock = true;
      temporalClientCoordinator.client = temporalClientCoordinator._createMockClient();

      const workflowWithoutId = { name: 'Another Workflow' };
      const result = await temporalClientCoordinator.startWorkflow(workflowWithoutId, mockUserId);

      expect(result.workflowId).toMatch(/^wf-temp-\d+$/);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[Temporal Client\] Starting durable workflow wf-temp-\d+ \(Mock: true\)$/)
      );
    });
  });

  describe('_createMockClient', () => {
    it('should return a client-like object with a workflow.start method', () => {
      const mockClientInstance = temporalClientCoordinator._createMockClient();
      expect(mockClientInstance).toBeDefined();
      expect(mockClientInstance.workflow).toBeDefined();
      expect(mockClientInstance.workflow.start).toBeInstanceOf(Function);
    });

    it('mock client start method should log and return a handle with workflowId and result', async () => {
      const mockClientInstance = temporalClientCoordinator._createMockClient();
      const mockOptions = {
        workflowId: 'mock-test-wf-id',
        args: ['arg1', 'arg2'],
      };
      const mockWorkflowFn = vi.fn().mockResolvedValue('mock-result');

      const handle = await mockClientInstance.workflow.start(mockWorkflowFn, mockOptions);

      expect(mockLogger.info).toHaveBeenCalledWith(
        `[Mock Temporal Client] Emulating workflow execution launch for ID: ${mockOptions.workflowId}`
      );
      expect(handle).toEqual({
        workflowId: mockOptions.workflowId,
        result: expect.any(Function),
      });

      // Verify the result function
      const result = await handle.result();
      expect(result).toBe('mock-result');
      expect(mockWorkflowFn).toHaveBeenCalledWith(...mockOptions.args);
    });
  });
});