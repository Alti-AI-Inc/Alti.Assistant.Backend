import { vi, describe, it, expect, beforeEach } from 'vitest';
import { START, END } from '@langchain/langgraph';

// Mock the dependencies
const mockAddNode = vi.fn();
const mockAddEdge = vi.fn();
const mockCompile = vi.fn(() => ({ isCompiledApp: true }));
const mockStateGraphInstance = {
  addNode: mockAddNode,
  addEdge: mockAddEdge,
  compile: mockCompile,
};
const mockStateGraphConstructor = vi.fn(() => mockStateGraphInstance);

vi.mock('@langchain/langgraph', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    StateGraph: mockStateGraphConstructor,
    START: original.START,
    END: original.END,
  };
});

const mockSummarizerState = { mockState: 'summarizer' };
vi.mock('./state.js', () => ({
  summarizerState: mockSummarizerState,
}));

const mockFetchContentNode = () => 'fetched';
const mockSummarizeContentNode = () => 'summarized';
vi.mock('./nodes.js', () => ({
  fetchContentNode: mockFetchContentNode,
  summarizeContentNode: mockSummarizeContentNode,
}));

vi.mock('../../code/code_assistant/MongoDBSaver.js', () => ({
    MongoDBSaver: {
        fromUri: vi.fn()
    }
}));

vi.mock('../../../../../config/index.js', () => ({
    default: {
        database_local: 'mock_db_uri'
    }
}));


describe('Summarizer Workflow', () => {
  let summarizerApp;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import the module to ensure the graph construction logic runs with fresh mocks for each test
    const module = await import('./workflow.js');
    summarizerApp = module.summarizerApp;
  });

  it('should initialize the StateGraph with the correct channels', () => {
    expect(mockStateGraphConstructor).toHaveBeenCalledTimes(1);
    expect(mockStateGraphConstructor).toHaveBeenCalledWith({
      channels: mockSummarizerState,
    });
  });

  it('should add the correct nodes to the graph', () => {
    expect(mockAddNode).toHaveBeenCalledTimes(2);
    expect(mockAddNode).toHaveBeenCalledWith('fetch_content', mockFetchContentNode);
    expect(mockAddNode).toHaveBeenCalledWith('summarize_content', mockSummarizeContentNode);
  });

  it('should define the correct workflow edges', () => {
    expect(mockAddEdge).toHaveBeenCalledTimes(3);
    // Use expect.arrayContaining to be order-independent, or check calls individually for strict order.
    expect(mockAddEdge).toHaveBeenCalledWith(START, 'fetch_content');
    expect(mockAddEdge).toHaveBeenCalledWith('fetch_content', 'summarize_content');
    expect(mockAddEdge).toHaveBeenCalledWith('summarize_content', END);
  });

  it('should compile the graph into a runnable application', () => {
    expect(mockCompile).toHaveBeenCalledTimes(1);
  });

  it('should export the compiled application', () => {
    expect(summarizerApp).toBeDefined();
    expect(summarizerApp).toEqual({ isCompiledApp: true });
  });
});