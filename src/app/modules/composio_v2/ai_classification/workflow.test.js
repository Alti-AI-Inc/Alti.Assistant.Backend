import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runAIClassificationAgent,
  getConversationHistory,
  clearConversationHistory,
  aiClassificationApp, // Import aiClassificationApp to access its mocked methods
} from './workflow.js';

const {
  mockComposioConnectedAccountsList,
  mockAiClassificationAppInvoke,
  mockAiClassificationAppGetState,
  mockAiClassificationAppUpdateState
} = vi.hoisted(() => {
  // Mock external dependencies
  // Mock @composio/core
  const mockComposioConnectedAccountsList = vi.fn().mockImplementation(() => Promise.resolve({ items: [{ id: 'acc1', name: 'Account 1' }] }));

  // Mock LangGraph components and the compiled workflow methods
  // This ensures that when `workflow.compile()` is called in the original file,
  // it returns an object with our mock functions for `invoke`, `getState`, `updateState`.
  const mockAiClassificationAppInvoke = vi.fn();
  const mockAiClassificationAppGetState = vi.fn();
  const mockAiClassificationAppUpdateState = vi.fn();

  return {
    mockComposioConnectedAccountsList,
    mockAiClassificationAppInvoke,
    mockAiClassificationAppGetState,
    mockAiClassificationAppUpdateState
  };
});

vi.mock('@composio/core', () => {
  const mockComposio = {
    connectedAccounts: {
      list: mockComposioConnectedAccountsList,
    },
  };
  return { Composio: vi.fn().mockImplementation(() => mockComposio) };
});

// Mock config
vi.mock('../../../../../config/index.js', () => ({
  default: {
    composio: {
      orgApiKey: 'mock-composio-api-key',
    },
    database_local: 'mock-mongodb-uri',
  },
}));

// Mock MongoDBSaver to prevent actual DB connection and ensure in-memory checkpointer is used
// This also ensures the `Object.assign` block for MongoDB checkpointer is not executed,
// keeping `aiClassificationApp` as the initial mocked compiled object.
vi.mock('../../code/code_assistant/MongoDBSaver.js', () => ({
  MongoDBSaver: {
    fromUri: vi.fn().mockImplementation(() => Promise.reject(new Error('Mocked MongoDB connection failure'))),
  },
}));

vi.mock('@langchain/langgraph', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    StateGraph: vi.fn().mockImplementation(() => ({
      addNode: vi.fn(),
      addEdge: vi.fn(),
      addConditionalEdges: vi.fn(),
      compile: vi.fn().mockImplementation(() => ({ // This is the object assigned to aiClassificationApp
        invoke: mockAiClassificationAppInvoke,
        getState: mockAiClassificationAppGetState,
        updateState: mockAiClassificationAppUpdateState,
      })),
    })),
    MemorySaver: vi.fn(),
  };
});


describe('AI Classification Workflow Functions', () => {
  beforeEach(() => {
    // Reset all mocks before each test to ensure isolation
    vi.clearAllMocks();

    // Default mock implementations for aiClassificationApp methods
    mockAiClassificationAppInvoke.mockResolvedValue({
      finalResponse: 'Mocked successful response',
      response: 'Mocked successful response',
      workflowType: 'single_step',
      executionResult: { status: 'success' },
      stepResults: [],
      identifiedApp: 'mock_app',
      identifiedAction: 'mock_action',
      confidence: 0.9,
      totalSteps: 1,
      executionPlan: [],
      aggregatedResults: {},
      history: [],
    });
    mockAiClassificationAppGetState.mockResolvedValue(null); // Default to no state found
    mockAiClassificationAppUpdateState.mockResolvedValue({});

    // Default mock for connectedAccounts.list
    mockComposioConnectedAccountsList.mockResolvedValue({ items: [{ id: 'acc1', name: 'Account 1' }] });
  });

  // Test runAIClassificationAgent
  describe('runAIClassificationAgent', () => {
    const userInput = 'Test user input';
    const userId = 'test_user_id';
    const conversationId = 'test_conversation_id';

    it('should invoke the AI classification app with correct initial state for a new conversation', async () => {
      const result = await runAIClassificationAgent(userInput, { userId });

      expect(mockComposioConnectedAccountsList).toHaveBeenCalledWith({ userIds: [userId] });
      expect(mockAiClassificationAppGetState).toHaveBeenCalledTimes(1); // Called to check for history
      expect(mockAiClassificationAppInvoke).toHaveBeenCalledTimes(1);

      const invokeArgs = mockAiClassificationAppInvoke.mock.calls[0][0];
      expect(invokeArgs.userInput).toBe(userInput);
      expect(invokeArgs.userId).toBe(userId);
      expect(invokeArgs.threadId).toMatch(/^ai_classification_test_user_id_\d+$/); // Dynamic threadId
      expect(invokeArgs.history).toEqual([]);
      expect(invokeArgs.messages).toEqual([
        expect.objectContaining({
          role: 'user',
          content: userInput,
        }),
      ]);
      expect(invokeArgs.conversationContext.turnCount).toBe(1);
      expect(invokeArgs.connectedAccounts).toEqual([{ id: 'acc1', name: 'Account 1' }]);
      expect(invokeArgs.currentStage).toBe('initial');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Tool execution completed successfully');
      expect(result.data.responseMessage.message).toBe('Mocked successful response');
      expect(result.data.conversationId).toBe(invokeArgs.threadId);
    });

    it('should retrieve existing conversation history if conversationId is provided and retrieveHistory is true', async () => {
      const mockHistory = [
        { role: 'user', content: 'Previous message' },
        { role: 'assistant', content: 'Previous response' },
      ];
      const mockContext = { turnCount: 5, lastApp: 'prev_app' };

      mockAiClassificationAppGetState.mockResolvedValueOnce({
        values: {
          history: mockHistory,
          conversationContext: mockContext,
        },
      });

      const result = await runAIClassificationAgent(userInput, {
        userId,
        conversationId,
        retrieveHistory: true,
      });

      expect(mockAiClassificationAppGetState).toHaveBeenCalledWith({
        configurable: { thread_id: conversationId },
      });
      expect(mockAiClassificationAppInvoke).toHaveBeenCalledTimes(1);

      const invokeArgs = mockAiClassificationAppInvoke.mock.calls[0][0];
      expect(invokeArgs.threadId).toBe(conversationId);
      expect(invokeArgs.history).toEqual(mockHistory);
      expect(invokeArgs.conversationContext.turnCount).toBe(mockContext.turnCount + 1);
      expect(invokeArgs.conversationContext.lastApp).toBe(mockContext.lastApp);
      expect(result.data.conversationId).toBe(conversationId);
      expect(result.data.messageCount).toBe(mockHistory.length + 2); // existing + user + assistant
    });

    it('should not retrieve history if retrieveHistory is false', async () => {
      await runAIClassificationAgent(userInput, {
        userId,
        conversationId,
        retrieveHistory: false,
      });

      expect(mockAiClassificationAppGetState).not.toHaveBeenCalled();
      expect(mockAiClassificationAppInvoke).toHaveBeenCalledTimes(1);

      const invokeArgs = mockAiClassificationAppInvoke.mock.calls[0][0];
      expect(invokeArgs.history).toEqual([]);
      expect(invokeArgs.conversationContext.turnCount).toBe(1);
    });

    it('should handle errors during history retrieval gracefully', async () => {
      mockAiClassificationAppGetState.mockRejectedValueOnce(new Error('No state found')); // Simulate error/no state

      await runAIClassificationAgent(userInput, {
        userId,
        conversationId,
        retrieveHistory: true,
      });

      expect(mockAiClassificationAppGetState).toHaveBeenCalledTimes(1);
      expect(mockAiClassificationAppInvoke).toHaveBeenCalledTimes(1);

      const invokeArgs = mockAiClassificationAppInvoke.mock.calls[0][0];
      expect(invokeArgs.history).toEqual([]); // Should start fresh
      expect(invokeArgs.conversationContext.turnCount).toBe(1);
    });

    it('should return an error response if AI classification app invocation fails', async () => {
      const errorMessage = 'AI app invocation failed';
      mockAiClassificationAppInvoke.mockRejectedValueOnce(new Error(errorMessage));

      const result = await runAIClassificationAgent(userInput, { userId });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Tool execution failed');
      expect(result.error).toBe(errorMessage);
      expect(result.data.responseMessage.text).toContain(errorMessage);
      expect(result.data.responseMessage.type).toBe('error');
    });

    it('should handle multi-step workflow responses correctly', async () => {
      mockAiClassificationAppInvoke.mockResolvedValueOnce({
        finalResponse: 'Multi-step workflow completed',
        workflowType: 'multi_step',
        executionPlan: [{ step: 1 }, { step: 2 }],
        stepResults: [{ result: 'step1' }, { result: 'step2' }],
        totalSteps: 2,
      });

      const result = await runAIClassificationAgent(userInput, { userId });

      expect(result.success).toBe(true);
      expect(result.data.responseMessage.message).toBe('Multi-step workflow completed');
      expect(result.data.responseMessage.type).toBe('multi_step');
      expect(result.data.responseMessage.metadata.workflowType).toBe('multi_step');
      expect(result.data.responseMessage.metadata.totalSteps).toBe(2);
      expect(result.data.responseMessage.toolResults).toEqual([{ result: 'step1' }, { result: 'step2' }]);
    });

    it('should not call connectedAccounts.list if userId is not provided', async () => {
      await runAIClassificationAgent(userInput, {});
      expect(mockComposioConnectedAccountsList).not.toHaveBeenCalled();
    });
  });

  // Test getConversationHistory
  describe('getConversationHistory', () => {
    const conversationId = 'test_conversation_id';

    it('should return conversation history if found', async () => {
      const mockHistory = [{ role: 'user', content: 'Hello' }];
      const mockContext = { turnCount: 3 };
      mockAiClassificationAppGetState.mockResolvedValueOnce({
        values: {
          history: mockHistory,
          conversationContext: mockContext,
          metadata: { some: 'data' },
        },
      });

      const result = await getConversationHistory(conversationId);

      expect(mockAiClassificationAppGetState).toHaveBeenCalledWith({
        configurable: { thread_id: conversationId },
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Conversation history retrieved successfully');
      expect(result.data.history).toEqual(mockHistory);
      expect(result.data.conversationContext).toEqual(mockContext);
      expect(result.data.metadata).toEqual({ some: 'data' });
      expect(result.data.conversationId).toBe(conversationId);
      expect(result.data.messageCount).toBe(mockHistory.length);
    });

    it('should return "Conversation not found" if no state exists', async () => {
      mockAiClassificationAppGetState.mockResolvedValueOnce(null);

      const result = await getConversationHistory(conversationId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Conversation not found');
      expect(result.data.conversationId).toBe(conversationId);
      expect(result.data.messageCount).toBe(0);
    });

    it('should handle errors during history retrieval', async () => {
      const errorMessage = 'DB error';
      mockAiClassificationAppGetState.mockRejectedValueOnce(new Error(errorMessage));

      const result = await getConversationHistory(conversationId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to retrieve conversation history');
      expect(result.error).toBe(errorMessage);
      expect(result.data.conversationId).toBe(conversationId);
      expect(result.data.messageCount).toBe(0);
    });
  });

  // Test clearConversationHistory
  describe('clearConversationHistory', () => {
    const conversationId = 'test_conversation_id';

    it('should clear conversation history if found', async () => {
      const mockExistingState = {
        values: {
          history: [{ role: 'user', content: 'Old message' }],
          messages: [{ role: 'user', content: 'Old message' }],
          conversationContext: { turnCount: 5, lastApp: 'old_app' },
          metadata: { some: 'data' },
          userInput: 'old input',
          userId: 'old_user',
        },
      };
      mockAiClassificationAppGetState.mockResolvedValueOnce(mockExistingState);

      const result = await clearConversationHistory(conversationId);

      expect(mockAiClassificationAppGetState).toHaveBeenCalledWith({
        configurable: { thread_id: conversationId },
      });
      expect(mockAiClassificationAppUpdateState).toHaveBeenCalledTimes(1);
      const updateArgs = mockAiClassificationAppUpdateState.mock.calls[0][1];
      expect(updateArgs.history).toEqual([]);
      expect(updateArgs.messages).toEqual([]);
      expect(updateArgs.conversationContext.turnCount).toBe(0);
      expect(updateArgs.conversationContext.lastApp).toBe(null);
      expect(updateArgs.metadata).toEqual(mockExistingState.values.metadata); // Other fields should remain
      expect(updateArgs.userInput).toBe(mockExistingState.values.userInput);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Conversation history cleared successfully');
      expect(result.data.conversationId).toBe(conversationId);
      expect(result.data.messageCount).toBe(0);
    });

    it('should return "Conversation not found" if no state exists', async () => {
      mockAiClassificationAppGetState.mockResolvedValueOnce(null);

      const result = await clearConversationHistory(conversationId);

      expect(mockAiClassificationAppGetState).toHaveBeenCalledWith({
        configurable: { thread_id: conversationId },
      });
      expect(mockAiClassificationAppUpdateState).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.message).toBe('Conversation not found');
      expect(result.data.conversationId).toBe(conversationId);
      expect(result.data.messageCount).toBe(0);
    });

    it('should handle errors during clearing history', async () => {
      const errorMessage = 'Update failed';
      mockAiClassificationAppGetState.mockResolvedValueOnce({ values: { history: ['old'] } });
      mockAiClassificationAppUpdateState.mockRejectedValueOnce(new Error(errorMessage));

      const result = await clearConversationHistory(conversationId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to clear conversation history');
      expect(result.error).toBe(errorMessage);
      expect(result.data.conversationId).toBe(conversationId);
      expect(result.data.messageCount).toBe(0);
    });
  });
});