import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock console.log to prevent output during tests and capture calls
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

const {
  mockToolBasedSearchNode,
  mockStateGraphConstructor,
  mockResearchAgentState
} = vi.hoisted(() => {
  // --- Declare variables for mocks at the top level ---
  let mockToolBasedSearchNode;
  let mockStateGraphConstructor;

  const mockResearchAgentState = {
    messages: {
      value: (x, y) => x.concat(y),
      default: () => [],
    },
    // Add other state channels if they were defined in the actual state.js
    // For this test, we only need 'messages' to simulate a basic state.
  };

  return {
    mockToolBasedSearchNode,
    mockStateGraphConstructor,
    mockResearchAgentState
  };
});

let mockCompiledGraph;
let mockStateGraphInstance;

// --- Define vi.mock calls at the top level, using getters for dynamic assignment ---
// This ensures that when the module under test is imported, it gets the *current* mock implementations.

vi.mock('./nodes.js', () => ({
  get toolBasedSearchNode() { return mockToolBasedSearchNode; },
}));

vi.mock('./state.js', () => ({
  researchAgentState: mockResearchAgentState,
}));

vi.mock('@langchain/langgraph', () => ({
  get StateGraph() { return mockStateGraphConstructor; },
  END: 'END', // Export constants as they are
  START: 'START', // Export constants as they are
}));

describe('Enhanced Conversational Search Workflow', () => {
  let researchAgentApp; // Declare here to be assigned in beforeEach

  beforeEach(async () => {
    // Clear all mocks from previous tests, including consoleLogSpy
    vi.clearAllMocks();
    // Re-implement consoleLogSpy after clearing mocks
    consoleLogSpy.mockImplementation(() => {});

    // Re-initialize all mock functions for a fresh state in each test
    mockToolBasedSearchNode = vi.fn().mockImplementation(async (state) => {
      // Default mock behavior for the node: just pass through or add a simple message
      return { ...state, messages: [...(state.messages || []), { role: 'assistant', content: 'Default mock search result' }] };
    });

    // Mock the compiled graph's invoke method to simulate the workflow
    mockCompiledGraph = {
      invoke: vi.fn().mockImplementation(async (inputState) => {
        // In this simple graph (START -> toolBasedSearch -> END),
        // the invoke method directly calls the toolBasedSearchNode.
        return await mockToolBasedSearchNode(inputState);
      }),
      stream: vi.fn(), // Mock other methods if they were used
      getGraph: vi.fn(),
    };

    // Mock the StateGraph instance methods
    mockStateGraphInstance = {
      addNode: vi.fn(),
      addEdge: vi.fn(),
      compile: vi.fn().mockImplementation(() => mockCompiledGraph), // When compile is called, it returns our mockCompiledGraph
    };

    // Mock the StateGraph constructor
    mockStateGraphConstructor = vi.fn().mockImplementation(() => mockStateGraphInstance);

    // Dynamically import the module under test to ensure it's evaluated with fresh mocks.
    // This is crucial for testing module-level side effects (like graph definition)
    // and ensuring `toHaveBeenCalledTimes(1)` works correctly for each test.
    const module = await import('./workflow.js');
    researchAgentApp = module.researchAgentApp;
  });

  it('should initialize StateGraph with researchAgentState', () => {
    expect(mockStateGraphConstructor).toHaveBeenCalledTimes(1);
    expect(mockStateGraphConstructor).toHaveBeenCalledWith({ channels: mockResearchAgentState });
  });

  it('should add the toolBasedSearch node', () => {
    expect(mockStateGraphInstance.addNode).toHaveBeenCalledTimes(1);
    expect(mockStateGraphInstance.addNode).toHaveBeenCalledWith('toolBasedSearch', mockToolBasedSearchNode);
  });

  it('should define edges correctly', () => {
    expect(mockStateGraphInstance.addEdge).toHaveBeenCalledTimes(2);
    expect(mockStateGraphInstance.addEdge).toHaveBeenCalledWith('START', 'toolBasedSearch');
    expect(mockStateGraphInstance.addEdge).toHaveBeenCalledWith('toolBasedSearch', 'END');
  });

  it('should compile the workflow into researchAgentApp', () => {
    expect(mockStateGraphInstance.compile).toHaveBeenCalledTimes(1);
    // Verify that the exported researchAgentApp is indeed our mock compiled graph
    expect(researchAgentApp).toBe(mockCompiledGraph);
  });

  it('should execute the workflow and call toolBasedSearchNode', async () => {
    const initialState = { messages: [{ role: 'user', content: 'What is the capital of France?' }] };
    const expectedNodeOutput = { messages: [{ role: 'user', content: 'What is the capital of France?' }, { role: 'assistant', content: 'Paris is the capital of France.' }] };

    // Configure the mock node's behavior for this specific test
    mockToolBasedSearchNode.mockResolvedValue(expectedNodeOutput);

    // Invoke the compiled graph (which is our mockCompiledGraph)
    const result = await researchAgentApp.invoke(initialState);

    // Assertions for the compiled graph's invoke method
    expect(mockCompiledGraph.invoke).toHaveBeenCalledTimes(1);
    expect(mockCompiledGraph.invoke).toHaveBeenCalledWith(initialState);

    // Assertions for the toolBasedSearchNode being called
    expect(mockToolBasedSearchNode).toHaveBeenCalledTimes(1);
    expect(mockToolBasedSearchNode).toHaveBeenCalledWith(initialState);

    // Assert the final result of the workflow
    expect(result).toEqual(expectedNodeOutput);
  });

  it('should log initialization message to console', () => {
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '🚀 Initializing Enhanced Conversational Search Workflow with Tool-Based Intelligence'
    );
  });
});