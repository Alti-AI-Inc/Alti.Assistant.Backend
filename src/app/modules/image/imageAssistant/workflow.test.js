import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock StateGraph and its methods
const mockAddNode = vi.fn();
const mockAddEdge = vi.fn();
const mockAddConditionalEdges = vi.fn();
const mockCompile = vi.fn();

const {
  mockStateGraph,
  mockMongoDBSaverFromUri
} = vi.hoisted(() => {
  const mockStateGraph = vi.fn().mockImplementation(() => ({
    addNode: mockAddNode,
    addEdge: mockAddEdge,
    addConditionalEdges: mockAddConditionalEdges,
    compile: mockCompile,
  }));

  const mockMongoDBSaverFromUri = vi.fn();

  return {
    mockStateGraph,
    mockMongoDBSaverFromUri
  };
});

// Mock Langchain dependencies
let MockMemorySaver;
vi.mock('@langchain/langgraph', async (importOriginal) => {
  const original = await importOriginal();
  // Create a mock class to be able to use `expect.any(MockMemorySaver)`
  MockMemorySaver = class MockMemorySaver {};
  return {
    ...original,
    StateGraph: mockStateGraph,
    END: 'END',
    START: 'START',
    MemorySaver: MockMemorySaver,
  };
});

// Mock local dependencies
vi.mock('./nodes.js', () => ({
  analyzeInitialPromptNode: vi.fn(),
  processUserResponseNode: vi.fn(),
  askQuestionNode: vi.fn(),
  getConfirmationNode: vi.fn(),
  compileFinalPromptNode: vi.fn(),
  generateImageNode: vi.fn(),
  routeInitial: vi.fn(),
  routeNextStep: vi.fn(),
}));

vi.mock('./state.js', () => ({
  graphState: { messages: 'test_state_schema' },
}));

vi.mock('../../code/code_assistant/MongoDBSaver.js', () => ({
  MongoDBSaver: {
    fromUri: mockMongoDBSaverFromUri,
  },
}));

vi.mock('../../../../../config/index.js', () => ({
  default: {
    database_local: 'mongodb://test-uri',
  },
}));

// Helper to wait for async operations in the module to complete
const flushPromises = () => new Promise(setImmediate);

describe('Image Assistant Workflow', () => {
  let consoleLogSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should correctly define the graph structure and initial compilation', async () => {
    await vi.isolateModules(async () => {
      // Dynamically import mocked dependencies to get their current mock state
      const { default: config } = await import('../../../../../config/index.js');
      const { graphState } = await import('./state.js');
      const nodes = await import('./nodes.js');
      const { START, END } = await import('@langchain/langgraph');

      // This executes the module's top-level code
      await import('./workflow.js');

      // 1. Graph Initialization
      expect(mockStateGraph).toHaveBeenCalledWith({ channels: graphState });

      // 2. Node Addition
      expect(mockAddNode).toHaveBeenCalledWith('analyze_prompt', nodes.analyzeInitialPromptNode);
      expect(mockAddNode).toHaveBeenCalledWith('process_response', nodes.processUserResponseNode);
      expect(mockAddNode).toHaveBeenCalledWith('ask_question', nodes.askQuestionNode);
      expect(mockAddNode).toHaveBeenCalledWith('get_confirmation', nodes.getConfirmationNode);
      expect(mockAddNode).toHaveBeenCalledWith('compile_prompt', nodes.compileFinalPromptNode);
      expect(mockAddNode).toHaveBeenCalledWith('generate_image', nodes.generateImageNode);
      expect(mockAddNode).toHaveBeenCalledTimes(6);

      // 3. Edge Definition
      expect(mockAddConditionalEdges).toHaveBeenCalledWith(START, nodes.routeInitial, {
        analyze_prompt: 'analyze_prompt',
        process_response: 'process_response',
      });
      expect(mockAddEdge).toHaveBeenCalledWith('analyze_prompt', END);
      expect(mockAddConditionalEdges).toHaveBeenCalledWith('process_response', nodes.routeNextStep, {
        ask_question: 'ask_question',
        get_confirmation: 'get_confirmation',
        compile_prompt: 'compile_prompt',
      });
      expect(mockAddEdge).toHaveBeenCalledWith('ask_question', END);
      expect(mockAddEdge).toHaveBeenCalledWith('get_confirmation', END);
      expect(mockAddEdge).toHaveBeenCalledWith('compile_prompt', 'generate_image');
      expect(mockAddEdge).toHaveBeenCalledWith('generate_image', END);

      // 4. Initial Compilation
      expect(MockMemorySaver).toHaveBeenCalled();
      expect(mockCompile).toHaveBeenCalledWith({ checkpointer: expect.any(MockMemorySaver) });
      expect(mockCompile).toHaveBeenCalledTimes(1);

      // 5. Checkpointer Connection Attempt
      expect(mockMongoDBSaverFromUri).toHaveBeenCalledWith(config.database_local, 'image_checkpoints');
    });
  });

  it('should recompile with MongoDBSaver on successful connection', async () => {
    const mongoCheckpointerInstance = { type: 'MongoDBSaver' };
    mockMongoDBSaverFromUri.mockResolvedValue(mongoCheckpointerInstance);

    await vi.isolateModules(async () => {
      await import('./workflow.js');
      await flushPromises(); // Wait for the .then() block to execute

      expect(mockCompile).toHaveBeenCalledTimes(2);
      expect(mockCompile).toHaveBeenCalledWith({ checkpointer: expect.any(MockMemorySaver) });
      expect(mockCompile).toHaveBeenLastCalledWith({ checkpointer: mongoCheckpointerInstance });
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Image assistant: MongoDB checkpointer connected');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  it('should use fallback and warn on MongoDB connection failure', async () => {
    const connectionError = new Error('DB down');
    mockMongoDBSaverFromUri.mockRejectedValue(connectionError);

    await vi.isolateModules(async () => {
      await import('./workflow.js');
      await flushPromises(); // Wait for the .catch() block to execute

      expect(mockCompile).toHaveBeenCalledTimes(1);
      expect(mockCompile).toHaveBeenCalledWith({ checkpointer: expect.any(MockMemorySaver) });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '⚠️ Image assistant: MongoDB checkpointer unavailable, using in-memory fallback:',
        connectionError.message
      );
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});