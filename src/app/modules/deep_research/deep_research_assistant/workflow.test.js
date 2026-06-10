import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external dependencies first
// Mock LangGraph components
const mockAddNode = vi.fn();
const mockAddEdge = vi.fn();
const mockInvoke = vi.fn(); // This will be the mock for the compiled app's invoke method
const mockCompile = vi.fn(() => ({
  invoke: mockInvoke,
}));

const mockStateGraph = vi.fn(() => ({
  addNode: mockAddNode,
  addEdge: mockAddEdge,
  compile: mockCompile,
}));

const mockMemorySaverInstance = {}; // A simple object to represent the instance
const mockMemorySaver = vi.fn(() => mockMemorySaverInstance); // Mock the constructor

const mockEND = 'END';
const mockSTART = 'START';

vi.mock('@langchain/langgraph', () => ({
  StateGraph: mockStateGraph,
  END: mockEND,
  START: mockSTART,
  MemorySaver: mockMemorySaver,
}));

// Mock state
const mockDeepResearchAgentState = {
  originalQuery: { value: null },
  conversationId: { value: null },
  generatePdf: { value: false },
  history: { value: [] },
  maxDepth: { value: 3 },
  currentDepth: { value: 0 },
  boardPersonas: { value: [] },
  consensusLevel: { value: 'majority' },
  finalReport: { value: null },
  allSources: { value: [] },
  promisingLeads: { value: [] },
  deepDiveResults: { value: [] },
  qualityMetrics: { value: {} },
  knowledgeGraph: { value: {} },
  metadata: { value: {} },
  pdfData: { value: null },
  researchProgress: { value: [] },
};
vi.mock('./state.js', () => ({
  deepResearchAgentState: mockDeepResearchAgentState,
}));

// Mock nodes - just need them to be functions
const mockInitializeResearchNode = vi.fn();
const mockBreadthFirstSearchNode = vi.fn();
const mockIdentifyPromisingLeadsNode = vi.fn();
const mockDeepDiveResearchNode = vi.fn();
const mockSynthesizeComprehensiveReportNode = vi.fn();
const mockBoardDebateNode = vi.fn();
const mockRefineSynthesisNode = vi.fn();
const mockSaveDeepResearchNode = vi.fn();
const mockGenerateDeepResearchPDFNode = vi.fn();

vi.mock('./nodes.js', () => ({
  initializeResearchNode: mockInitializeResearchNode,
  breadthFirstSearchNode: mockBreadthFirstSearchNode,
  identifyPromisingLeadsNode: mockIdentifyPromisingLeadsNode,
  deepDiveResearchNode: mockDeepDiveResearchNode,
  synthesizeComprehensiveReportNode: mockSynthesizeComprehensiveReportNode,
  boardDebateNode: mockBoardDebateNode,
  refineSynthesisNode: mockRefineSynthesisNode,
  saveDeepResearchNode: mockSaveDeepResearchNode,
  generateDeepResearchPDFNode: mockGenerateDeepResearchPDFNode,
}));

// Mock config
const mockConfig = {
  database_local: 'mongodb://localhost:27017/testdb',
  configurable: {
    thread_id: 'default_thread_id',
  },
};
vi.mock('../../../../../config/index.js', () => ({
  default: mockConfig,
}));

// Mock MongoDBSaver
const mockMongoDBSaverInstance = {
  // Mock methods if needed, but for this test, just need the instance
};
const mockMongoDBSaver = {
  fromUri: vi.fn(() => Promise.resolve(mockMongoDBSaverInstance)),
};
vi.mock('../../code/code_assistant/MongoDBSaver.js', () => ({
  MongoDBSaver: mockMongoDBSaver,
}));

// Use fake timers to control promise resolution for MongoDBSaver
vi.useFakeTimers();

let originalProcessEnv;

beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();

  // Reset the mock implementations for StateGraph and its methods
  mockAddNode.mockClear();
  mockAddEdge.mockClear();
  mockInvoke.mockClear();
  mockCompile.mockClear();
  mockStateGraph.mockClear();
  mockMemorySaver.mockClear();
  mockMongoDBSaver.fromUri.mockClear();

  // Store original process.env and create a mutable copy
  originalProcessEnv = process.env;
  process.env = { ...originalProcessEnv };

  // Reset modules to ensure a fresh import for each test, especially for process.env changes
  vi.resetModules();
});

afterEach(() => {
  process.env = originalProcessEnv; // Restore original process.env
  vi.runOnlyPendingTimers(); // Ensure any pending timers are cleared
  vi.useRealTimers(); // Switch back to real timers
});

describe('Deep Research Agent Workflow', () => {
  it('should correctly initialize the StateGraph with deepResearchAgentState channels', async () => {
    // Import the module here to ensure it's loaded after mocks are set up
    const { deepResearchAgentApp, runDeepResearchAgent } = await import('./workflow.js');

    expect(mockStateGraph).toHaveBeenCalledTimes(1);
    expect(mockStateGraph).toHaveBeenCalledWith({ channels: mockDeepResearchAgentState });
  });

  it('should add all research nodes to the workflow', async () => {
    const { deepResearchAgentApp, runDeepResearchAgent } = await import('./workflow.js');

    expect(mockAddNode).toHaveBeenCalledTimes(9);
    expect(mockAddNode).toHaveBeenCalledWith('initialize', mockInitializeResearchNode);
    expect(mockAddNode).toHaveBeenCalledWith('breadth_search', mockBreadthFirstSearchNode);
    expect(mockAddNode).toHaveBeenCalledWith('identify_leads', mockIdentifyPromisingLeadsNode);
    expect(mockAddNode).toHaveBeenCalledWith('deep_dive', mockDeepDiveResearchNode);
    expect(mockAddNode).toHaveBeenCalledWith('synthesize_report', mockSynthesizeComprehensiveReportNode);
    expect(mockAddNode).toHaveBeenCalledWith('board_debate', mockBoardDebateNode);
    expect(mockAddNode).toHaveBeenCalledWith('refine_synthesis', mockRefineSynthesisNode);
    expect(mockAddNode).toHaveBeenCalledWith('save_research', mockSaveDeepResearchNode);
    expect(mockAddNode).toHaveBeenCalledWith('generate_pdf', mockGenerateDeepResearchPDFNode);
  });

  it('should define all workflow edges correctly', async () => {
    const { deepResearchAgentApp, runDeepResearchAgent } = await import('./workflow.js');

    expect(mockAddEdge).toHaveBeenCalledTimes(9);
    expect(mockAddEdge).toHaveBeenCalledWith(mockSTART, 'initialize');
    expect(mockAddEdge).toHaveBeenCalledWith('initialize', 'breadth_search');
    expect(mockAddEdge).toHaveBeenCalledWith('breadth_search', 'identify_leads');
    expect(mockAddEdge).toHaveBeenCalledWith('identify_leads', 'deep_dive');
    expect(mockAddEdge).toHaveBeenCalledWith('deep_dive', 'synthesize_report');
    expect(mockAddEdge).toHaveBeenCalledWith('synthesize_report', 'board_debate');
    expect(mockAddEdge).toHaveBeenCalledWith('board_debate', 'refine_synthesis');
    expect(mockAddEdge).toHaveBeenCalledWith('refine_synthesis', 'save_research');
    expect(mockAddEdge).toHaveBeenCalledWith('save_research', 'generate_pdf');
    expect(mockAddEdge).toHaveBeenCalledWith('generate_pdf', mockEND);
  });

  it('should compile the workflow with MemorySaver initially', async () => {
    const { deepResearchAgentApp, runDeepResearchAgent } = await import('./workflow.js');

    expect(mockMemorySaver).toHaveBeenCalledTimes(1);
    expect(mockCompile).toHaveBeenCalledTimes(1); // Initial compile
    expect(mockCompile).toHaveBeenCalledWith({
      checkpointer: mockMemorySaverInstance, // Check that it's the instance returned by MemorySaver
      debug: true,
    });
    expect(deepResearchAgentApp).toBeDefined();
    expect(deepResearchAgentApp.invoke).toBeDefined();
  });

  describe('Checkpointer Configuration', () => {
    it('should attempt to connect to MongoDBSaver if not disabled and recompile on success', async () => {
      // Ensure DISABLE_MONGO_CHECKPOINTER is not 'true'
      delete process.env.DISABLE_MONGO_CHECKPOINTER;

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { deepResearchAgentApp, runDeepResearchAgent } = await import('./workflow.js');

      expect(mockMongoDBSaver.fromUri).toHaveBeenCalledTimes(1);
      expect(mockMongoDBSaver.fromUri).toHaveBeenCalledWith(
        mockConfig.database_local,
        'deep_research_agent_checkpoints'
      );

      // Advance timers for the promise to resolve
      await vi.runAllTimersAsync();

      // After successful MongoDB connection, workflow should be recompiled
      expect(mockCompile).toHaveBeenCalledTimes(2); // Initial + MongoDB recompile
      expect(mockCompile).toHaveBeenNthCalledWith(2, {
        checkpointer: mockMongoDBSaverInstance,
        debug: true,
      });
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Deep research: MongoDB checkpointer connected');
      consoleLogSpy.mockRestore();
    });

    it('should use MemorySaver if MongoDBSaver connection fails', async () => {
      delete process.env.DISABLE_MONGO_CHECKPOINTER;
      mockMongoDBSaver.fromUri.mockImplementationOnce(() => Promise.reject(new Error('MongoDB connection failed')));

      // Spy on console.warn to check if the warning is logged
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { deepResearchAgentApp, runDeepResearchAgent } = await import('./workflow.js');

      expect(mockMongoDBSaver.fromUri).toHaveBeenCalledTimes(1);

      // Advance timers for the promise to reject
      await vi.runAllTimersAsync();

      // Should not recompile with MongoDB checkpointer
      expect(mockCompile).toHaveBeenCalledTimes(1); // Only initial compile
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('MongoDB checkpointer unavailable'),
        expect.any(Error)
      );
      consoleWarnSpy.mockRestore();
    });

    it('should use MemorySaver if MongoDBSaver is explicitly disabled', async () => {
      process.env.DISABLE_MONGO_CHECKPOINTER = 'true';

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { deepResearchAgentApp, runDeepResearchAgent } = await import('./workflow.js');

      expect(mockMongoDBSaver.fromUri).not.toHaveBeenCalled();
      expect(mockCompile).toHaveBeenCalledTimes(1); // Only initial compile
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('MongoDB checkpointer disabled')
      );
      consoleLogSpy.mockRestore();
    });
  });

  describe('runDeepResearchAgent', () => {
    let consoleErrorSpy;
    let consoleLogSpy;
    let deepResearchAgentApp;
    let runDeepResearchAgent;

    beforeEach(async () => {
      // Ensure Mongo is disabled for consistent testing of runDeepResearchAgent
      process.env.DISABLE_MONGO_CHECKPOINTER = 'true';
      // Re-import to ensure the module is loaded with the correct env
      const module = await import('./workflow.js');
      deepResearchAgentApp = module.deepResearchAgentApp;
      runDeepResearchAgent = module.runDeepResearchAgent;

      mockInvoke.mockClear(); // Clear any calls from module load
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should invoke the deepResearchAgentApp with correct initial state and default config', async () => {
      const query = 'Test query';
      const mockResult = {
        originalQuery: query,
        finalReport: 'Mock report',
        allSources: ['source1'],
        promisingLeads: [],
        deepDiveResults: [],
        qualityMetrics: {},
        knowledgeGraph: {},
        metadata: {},
        pdfData: null,
        researchProgress: [],
      };
      mockInvoke.mockResolvedValue(mockResult);

      const result = await runDeepResearchAgent(query);

      expect(consoleLogSpy).toHaveBeenCalledWith(`Starting deep research for: "${query}"`);
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      const invokeArgs = mockInvoke.mock.calls[0];
      const initialState = invokeArgs[0];
      const config = invokeArgs[1];

      expect(initialState.originalQuery).toBe(query);
      expect(initialState.conversationId).toBe(mockConfig.configurable.thread_id);
      expect(initialState.generatePdf).toBe(false);
      expect(initialState.history).toEqual([]);
      expect(initialState.maxDepth).toBe(3);
      expect(initialState.currentDepth).toBe(0);
      expect(initialState.boardPersonas).toEqual(['McKinsey Strategy Partner', 'Gartner Research Director', 'YC Technical Architect']);
      expect(initialState.consensusLevel).toBe('majority');
      expect(initialState.metadata).toHaveProperty('timestamp');
      expect(initialState.metadata.totalSearches).toBe(0);
      expect(initialState.metadata.researchStrategy).toBe('recursive_deep');

      expect(config.configurable.thread_id).toMatch(/^deep_research_\d+$/); // Default generated ID

      expect(result).toEqual({
        success: true,
        query: mockResult.originalQuery,
        answer: mockResult.finalReport,
        classification: 'deep_research',
        sources: mockResult.allSources,
        promisingLeads: mockResult.promisingLeads,
        deepDiveResults: mockResult.deepDiveResults,
        qualityMetrics: mockResult.qualityMetrics,
        knowledgeGraph: mockResult.knowledgeGraph,
        metadata: mockResult.metadata,
        pdfData: mockResult.pdfData,
        conversationId: config.configurable.thread_id,
        researchProgress: mockResult.researchProgress,
      });
    });

    it('should invoke the deepResearchAgentApp with custom options', async () => {
      const query = 'Custom query';
      const options = {
        generatePdf: true,
        conversationId: 'custom_conv_id',
        history: [{ role: 'user', content: 'prev' }],
        maxDepth: 5,
        boardPersonas: ['CEO'],
        consensusLevel: 'unanimous',
      };
      const mockResult = {
        originalQuery: query,
        finalReport: 'Custom report',
        allSources: [],
        promisingLeads: [],
        deepDiveResults: [],
        qualityMetrics: {},
        knowledgeGraph: {},
        metadata: {},
        pdfData: 'pdf_data_here',
        researchProgress: [],
      };
      mockInvoke.mockResolvedValue(mockResult);

      const result = await runDeepResearchAgent(query, options);

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      const invokeArgs = mockInvoke.mock.calls[0];
      const initialState = invokeArgs[0];
      const config = invokeArgs[1];

      expect(initialState.originalQuery).toBe(query);
      expect(initialState.conversationId).toBe(options.conversationId);
      expect(initialState.generatePdf).toBe(options.generatePdf);
      expect(initialState.history).toEqual(options.history);
      expect(initialState.maxDepth).toBe(options.maxDepth);
      expect(initialState.boardPersonas).toEqual(options.boardPersonas);
      expect(initialState.consensusLevel).toBe(options.consensusLevel);

      expect(config.configurable.thread_id).toBe(options.conversationId);

      expect(result).toEqual({
        success: true,
        query: mockResult.originalQuery,
        answer: mockResult.finalReport,
        classification: 'deep_research',
        sources: mockResult.allSources,
        promisingLeads: mockResult.promisingLeads,
        deepDiveResults: mockResult.deepDiveResults,
        qualityMetrics: mockResult.qualityMetrics,
        knowledgeGraph: mockResult.knowledgeGraph,
        metadata: mockResult.metadata,
        pdfData: mockResult.pdfData,
        conversationId: config.configurable.thread_id,
        researchProgress: mockResult.researchProgress,
      });
    });

    it('should handle errors during deepResearchAgentApp invocation', async () => {
      const query = 'Error query';
      const errorMessage = 'Failed to run agent';
      mockInvoke.mockRejectedValue(new Error(errorMessage));

      const result = await runDeepResearchAgent(query);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error running deep research agent:', expect.any(Error));
      expect(result).toEqual({
        success: false,
        error: errorMessage,
        query,
        conversationId: expect.stringMatching(/^(custom_conv_id|deep_research_\d+)$/), // Could be default or custom if set
      });
    });
  });
});