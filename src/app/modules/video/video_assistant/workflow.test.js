import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks Setup ---
// Mock LangGraph components
const mockAddNode = vi.fn();
const mockAddEdge = vi.fn();
const mockAddConditionalEdges = vi.fn();
const mockCompile = vi.fn((options) => ({
  checkpointer: options.checkpointer,
  invoke: vi.fn(),
  stream: vi.fn(),
}));

const mockMemorySaverInstance = { type: 'MemorySaverInstance' };
const mockMemorySaver = vi.fn(() => mockMemorySaverInstance);
const mockStateGraph = vi.fn(() => ({
  addNode: mockAddNode,
  addEdge: mockAddEdge,
  addConditionalEdges: mockAddConditionalEdges,
  compile: mockCompile,
}));

vi.mock('@langchain/langgraph', () => ({
  StateGraph: mockStateGraph,
  END: 'END',
  START: 'START',
  MemorySaver: mockMemorySaver,
}));

// Mock videoGeneratorState
const mockVideoGeneratorState = {
  messages: { value: (x, y) => x.concat(y), default: () => [] },
};
vi.mock('./state.js', () => ({
  videoGeneratorState: mockVideoGeneratorState,
}));

// Mock node and router functions
const mockAnalyzeInitialVideoPromptNode = vi.fn();
const mockProcessVideoUserResponseNode = vi.fn();
const mockAskVideoQuestionNode = vi.fn();
const mockGetVideoConfirmationNode = vi.fn();
const mockCompileVideoFinalPromptNode = vi.fn();
const mockGenerateVideoNode = vi.fn();
const mockRouteVideoInitial = vi.fn();
const mockRouteVideoNextStep = vi.fn();

vi.mock('./nodes.js', () => ({
  analyzeInitialVideoPromptNode: mockAnalyzeInitialVideoPromptNode,
  processVideoUserResponseNode: mockProcessVideoUserResponseNode,
  askVideoQuestionNode: mockAskVideoQuestionNode,
  getVideoConfirmationNode: mockGetVideoConfirmationNode,
  compileVideoFinalPromptNode: mockCompileVideoFinalPromptNode,
  generateVideoNode: mockGenerateVideoNode,
  routeVideoInitial: mockRouteVideoInitial,
  routeVideoNextStep: mockRouteVideoNextStep,
}));

// Mock config
const mockConfig = {
  database_local: 'mongodb://localhost:27017/test_db',
};
vi.mock('../../../../../config/index.js', () => ({
  default: mockConfig,
}));

// Mock MongoDBSaver
const mockMongoDBSaverInstance = { type: 'MongoDBSaverInstance' };
const mockMongoDBSaverFromUri = vi.fn();
vi.mock('../../code/code_assistant/MongoDBSaver.js', () => ({
  MongoDBSaver: {
    fromUri: mockMongoDBSaverFromUri,
  },
}));

// Mock console.warn and console.log
let consoleWarnSpy;
let consoleLogSpy;

describe('videoWorkflow and videoApp initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset modules to ensure fresh evaluation for each test, especially for the async checkpointer logic
    vi.resetModules();

    // Re-mock console spies after resetModules as they might be cleared
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Set up default mock for MongoDBSaver.fromUri to resolve, then override for specific tests
    mockMongoDBSaverFromUri.mockResolvedValue(mockMongoDBSaverInstance);
  });

  afterEach(() => {
    // Restore console spies
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('should initialize StateGraph with correct channels', async () => {
    // Dynamically import the module to ensure mocks are applied before execution
    const { videoApp } = await import('./workflow.js');

    expect(mockStateGraph).toHaveBeenCalledTimes(1);
    expect(mockStateGraph).toHaveBeenCalledWith({
      channels: mockVideoGeneratorState,
    });
  });

  it('should add all expected nodes to the workflow', async () => {
    const { videoApp } = await import('./workflow.js');

    expect(mockAddNode).toHaveBeenCalledTimes(6);
    expect(mockAddNode).toHaveBeenCalledWith('analyze_video_prompt', mockAnalyzeInitialVideoPromptNode);
    expect(mockAddNode).toHaveBeenCalledWith('process_video_response', mockProcessVideoUserResponseNode);
    expect(mockAddNode).toHaveBeenCalledWith('ask_video_question', mockAskVideoQuestionNode);
    expect(mockAddNode).toHaveBeenCalledWith('get_video_confirmation', mockGetVideoConfirmationNode);
    expect(mockAddNode).toHaveBeenCalledWith('compile_video_prompt', mockCompileVideoFinalPromptNode);
    expect(mockAddNode).toHaveBeenCalledWith('generate_video', mockGenerateVideoNode);
  });

  it('should add all expected edges and conditional edges to the workflow', async () => {
    const { videoApp } = await import('./workflow.js');

    expect(mockAddConditionalEdges).toHaveBeenCalledTimes(2);
    expect(mockAddEdge).toHaveBeenCalledTimes(5); // analyze_video_prompt -> END, ask_video_question -> END, get_video_confirmation -> END, compile_video_prompt -> generate_video, generate_video -> END

    // START conditional edge
    expect(mockAddConditionalEdges).toHaveBeenCalledWith('START', mockRouteVideoInitial, {
      analyze_video_prompt: 'analyze_video_prompt',
      process_video_response: 'process_video_response',
    });

    // process_video_response conditional edge
    expect(mockAddConditionalEdges).toHaveBeenCalledWith('process_video_response', mockRouteVideoNextStep, {
      ask_video_question: 'ask_video_question',
      get_video_confirmation: 'get_video_confirmation',
      compile_video_prompt: 'compile_video_prompt',
    });

    // Direct edges
    expect(mockAddEdge).toHaveBeenCalledWith('analyze_video_prompt', 'END');
    expect(mockAddEdge).toHaveBeenCalledWith('ask_video_question', 'END');
    expect(mockAddEdge).toHaveBeenCalledWith('get_video_confirmation', 'END');
    expect(mockAddEdge).toHaveBeenCalledWith('compile_video_prompt', 'generate_video');
    expect(mockAddEdge).toHaveBeenCalledWith('generate_video', 'END');
  });

  it('should initially compile videoApp with MemorySaver', async () => {
    const { videoApp } = await import('./workflow.js');

    expect(mockMemorySaver).toHaveBeenCalledTimes(1);
    expect(mockCompile).toHaveBeenCalledTimes(1);
    expect(mockCompile).toHaveBeenCalledWith({ checkpointer: mockMemorySaverInstance });
    expect(videoApp.checkpointer).toEqual(mockMemorySaverInstance);
  });

  it('should upgrade to MongoDBSaver if connection is successful', async () => {
    // This test specifically needs the MongoDBSaver.fromUri to resolve
    mockMongoDBSaverFromUri.mockResolvedValue(mockMongoDBSaverInstance);

    // Import the module, which triggers the async checkpointer logic
    const { videoApp } = await import('./workflow.js');

    // Wait for all pending promises/timers to resolve
    await vi.runAllTimersAsync();

    expect(mockMongoDBSaverFromUri).toHaveBeenCalledTimes(1);
    expect(mockMongoDBSaverFromUri).toHaveBeenCalledWith(mockConfig.database_local, 'video_checkpoints');

    // Expect re-compilation with the new checkpointer
    expect(mockCompile).toHaveBeenCalledTimes(2); // Initial compile + re-compile after upgrade
    expect(mockCompile.mock.calls[1][0].checkpointer).toEqual(mockMongoDBSaverInstance);
    expect(videoApp.checkpointer).toEqual(mockMongoDBSaverInstance);
    expect(consoleLogSpy).toHaveBeenCalledWith('✅ Video assistant: MongoDB checkpointer connected');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should remain with MemorySaver if MongoDBSaver connection fails', async () => {
    const error = new Error('MongoDB connection failed');
    mockMongoDBSaverFromUri.mockRejectedValue(error);

    // Import the module, which triggers the async checkpointer logic
    const { videoApp } = await import('./workflow.js');

    // Wait for all pending promises/timers to resolve/reject
    await vi.runAllTimersAsync();

    expect(mockMongoDBSaverFromUri).toHaveBeenCalledTimes(1);
    expect(mockMongoDBSaverFromUri).toHaveBeenCalledWith(mockConfig.database_local, 'video_checkpoints');

    // Expect no re-compilation, so mockCompile should only be called once (initial)
    expect(mockCompile).toHaveBeenCalledTimes(1);
    expect(videoApp.checkpointer).toEqual(mockMemorySaverInstance); // Should still be the initial MemorySaver
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '⚠️ Video assistant: MongoDB checkpointer unavailable, using in-memory fallback:',
      error.message
    );
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});