import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks setup ---
// Define mock instances and functions outside beforeEach so they can be referenced
// and their state cleared across test runs when vi.clearAllMocks() is called.

const mockMemorySaverInstance = { type: 'MemorySaverInstance' };
const mockMemorySaver = vi.fn(() => mockMemorySaverInstance);

// This mockCompiledStateGraphInstance will be returned by mockStateGraphInstance.compile.
// We add a custom property `_checkpointer` to track which checkpointer was used during compilation.
const mockCompiledStateGraphInstance = {
  invoke: vi.fn(),
  stream: vi.fn(),
  getGraph: vi.fn(),
  _checkpointer: null, // Custom property to track the checkpointer used for compilation
};

const mockStateGraphInstance = {
  addNode: vi.fn(),
  addEdge: vi.fn(),
  addConditionalEdges: vi.fn(),
  compile: vi.fn((options) => {
    // When compile is called, update the _checkpointer property of the returned instance
    mockCompiledStateGraphInstance._checkpointer = options.checkpointer;
    return mockCompiledStateGraphInstance;
  }),
};
const mockStateGraph = vi.fn(() => mockStateGraphInstance);

const mockLangchainLanggraph = {
  StateGraph: mockStateGraph,
  END: 'END',
  START: 'START',
  MemorySaver: mockMemorySaver,
};

const mockWritingAssistantState = {
  messages: {
    value: (x, y) => x.concat(y),
    default: () => [],
  },
  topic: {
    value: (x, y) => y,
    default: () => null,
  },
};

const mockConfig = {
  database_local: 'mongodb://localhost:27017/testdb',
};

const mockWriteContentNode = vi.fn();

const mockMongoDBSaverInstance = { type: 'MongoDBSaverInstance' };
const mockMongoDBSaver = {
  fromUri: vi.fn(() => Promise.resolve(mockMongoDBSaverInstance)), // Default to success
};

describe('writing_assistant/workflow', () => {
  let consoleLogSpy;
  let consoleWarnSpy;
  let writingAssistantApp; // To hold the imported app export

  // This beforeEach block sets up mocks and imports the module for the success path tests.
  beforeEach(async () => {
    // 1. Reset modules to clear cache and re-evaluate the file for each test.
    vi.resetModules();

    // 2. Re-establish all mocks *before* importing the module.
    // This ensures that the module under test sees our mocks when it initializes.
    vi.mock('@langchain/langgraph', () => mockLangchainLanggraph);
    vi.mock('./state.js', () => ({ writingAssistantState: mockWritingAssistantState }));
    vi.mock('../../../../../config/index.js', () => ({ default: mockConfig }));
    vi.mock('./nodes.js', () => ({ writeContentNode: mockWriteContentNode }));
    vi.mock('../../code/code_assistant/MongoDBSaver.js', () => ({ MongoDBSaver: mockMongoDBSaver }));

    // 3. Clear mock history for spies/mocks defined outside.
    // This resets call counts and arguments for vi.fn() mocks.
    vi.clearAllMocks();
    // Explicitly reset custom mock state not covered by vi.clearAllMocks().
    mockCompiledStateGraphInstance._checkpointer = null;

    // 4. Set default mock implementation for `MongoDBSaver.fromUri` to resolve.
    // This is for the success path tests. It will be overridden for the failure path.
    mockMongoDBSaver.fromUri.mockImplementation(() => Promise.resolve(mockMongoDBSaverInstance));

    // 5. Spy on console methods to capture logs.
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 6. Import the module under test. This will trigger the workflow definition
    // and the immediate execution of the async MongoDB checkpointer logic.
    // Awaiting the import ensures the promise chain for MongoDBSaver.fromUri settles
    // before subsequent assertions run.
    const module = await import('./workflow.js');
    writingAssistantApp = module.writingAssistantApp;
  });

  // Restore console spies after each test.
  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should initialize the workflow as a StateGraph with correct channels', () => {
    expect(mockStateGraph).toHaveBeenCalledTimes(1);
    expect(mockStateGraph).toHaveBeenCalledWith({ channels: mockWritingAssistantState });
  });

  it('should add the "write_content" node', () => {
    expect(mockStateGraphInstance.addNode).toHaveBeenCalledWith('write_content', mockWriteContentNode);
  });

  it('should define the START to "write_content" edge', () => {
    expect(mockStateGraphInstance.addEdge).toHaveBeenCalledWith(mockLangchainLanggraph.START, 'write_content');
  });

  it('should define the "write_content" to END edge', () => {
    expect(mockStateGraphInstance.addEdge).toHaveBeenCalledWith('write_content', mockLangchainLanggraph.END);
  });

  it('should initially compile the workflow with MemorySaver', () => {
    // The first call to compile happens immediately on module load.
    expect(mockStateGraphInstance.compile).toHaveBeenNthCalledWith(1, { checkpointer: mockMemorySaverInstance });
    expect(writingAssistantApp).toBe(mockCompiledStateGraphInstance);
  });

  describe('MongoDB Checkpointer Upgrade (Success Path)', () => {
    it('should attempt to connect to MongoDB for checkpointer', () => {
      expect(mockMongoDBSaver.fromUri).toHaveBeenCalledTimes(1);
      expect(mockMongoDBSaver.fromUri).toHaveBeenCalledWith(mockConfig.database_local, 'writer_checkpoints');
    });

    it('should recompile with MongoDBSaver if connection is successful', () => {
      // The `await import` in the main `beforeEach` ensures the promise has resolved.
      // By this point, the `.then()` block in the module should have executed.
      expect(mockStateGraphInstance.compile).toHaveBeenCalledTimes(2); // Initial compile + MongoDB recompile
      expect(mockStateGraphInstance.compile).toHaveBeenNthCalledWith(2, { checkpointer: mockMongoDBSaverInstance });

      // Verify that the `writingAssistantApp` object was updated to use the MongoDB checkpointer.
      expect(writingAssistantApp._checkpointer).toBe(mockMongoDBSaverInstance);
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Writing assistant: MongoDB checkpointer connected');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('MongoDB Checkpointer Upgrade (Failure Path)', () => {
    let consoleLogSpyFailure;
    let consoleWarnSpyFailure;
    let failedWritingAssistantApp;
    const mockError = new Error('MongoDB connection failed');

    // This beforeEach block specifically sets up mocks for the failure scenario.
    beforeEach(async () => {
      vi.resetModules(); // Clear module cache to ensure a fresh import.

      // Re-establish all mocks, but crucially, set `MongoDBSaver.fromUri` to reject.
      vi.mock('@langchain/langgraph', () => mockLangchainLanggraph);
      vi.mock('./state.js', () => ({ writingAssistantState: mockWritingAssistantState }));
      vi.mock('../../../../../config/index.js', () => ({ default: mockConfig }));
      vi.mock('./nodes.js', () => ({ writeContentNode: mockWriteContentNode }));
      vi.mock('../../code/code_assistant/MongoDBSaver.js', () => ({
        MongoDBSaver: {
          fromUri: vi.fn(() => Promise.reject(mockError)), // Mock failure for this test suite
        },
      }));

      vi.clearAllMocks();
      mockCompiledStateGraphInstance._checkpointer = null;

      consoleLogSpyFailure = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleWarnSpyFailure = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const module = await import('./workflow.js');
      failedWritingAssistantApp = module.writingAssistantApp;
    });

    afterEach(() => {
      consoleLogSpyFailure.mockRestore();
      consoleWarnSpyFailure.mockRestore();
    });

    it('should attempt to connect to MongoDB for checkpointer', () => {
      // The `fromUri` mock in this `beforeEach` should have been called.
      expect(mockMongoDBSaver.fromUri).toHaveBeenCalledTimes(1);
      expect(mockMongoDBSaver.fromUri).toHaveBeenCalledWith(mockConfig.database_local, 'writer_checkpoints');
    });

    it('should fall back to MemorySaver if MongoDB connection fails', () => {
      // Only the initial compile with MemorySaver should have occurred.
      expect(mockStateGraphInstance.compile).toHaveBeenCalledTimes(1);
      expect(mockStateGraphInstance.compile).toHaveBeenCalledWith({ checkpointer: mockMemorySaverInstance });

      // The `writingAssistantApp` should still be using the MemorySaver instance.
      expect(failedWritingAssistantApp._checkpointer).toBe(mockMemorySaverInstance);
      expect(consoleWarnSpyFailure).toHaveBeenCalledWith(
        '⚠️ Writing assistant: MongoDB checkpointer unavailable, using in-memory fallback:',
        mockError.message
      );
      expect(consoleLogSpyFailure).not.toHaveBeenCalled();
    });
  });
});