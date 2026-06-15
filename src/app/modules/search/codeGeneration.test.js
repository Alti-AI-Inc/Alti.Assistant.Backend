import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCodeGeneration } from './codeGeneration.js';

const {
  mockPrepareConversationContext,
  mockExecuteToolBasedConversation,
  mockConversationModel
} = vi.hoisted(() => {
  // Mock dependencies
  const mockPrepareConversationContext = vi.fn();
  const mockExecuteToolBasedConversation = vi.fn();

  // Mock Mongoose model
  const mockConversationModel = {
    findOne: vi.fn().mockImplementation(() => mockConversationModel), // Allow chaining .select()
    select: vi.fn().mockImplementation(() => mockConversationModel), // Allow chaining .lean()
    lean: vi.fn().mockImplementation(() => Promise.resolve(null)), // Default to resolving null
  };

  return {
    mockPrepareConversationContext,
    mockExecuteToolBasedConversation,
    mockConversationModel
  };
});

vi.mock('./utils/historyManager.js', () => ({
  prepareConversationContext: mockPrepareConversationContext,
}));

vi.mock('./services/reactAgent.js', () => ({
  executeToolBasedConversation: mockExecuteToolBasedConversation,
}));

vi.mock('../conversations/conversation.model.js', () => ({
  default: mockConversationModel,
}));

describe('runCodeGeneration', () => {
  const MOCK_DATE = new Date('2023-10-26T10:00:00Z');
  const MOCK_DATE_STRING = MOCK_DATE.toDateString();
  const MOCK_YEAR = MOCK_DATE.getFullYear();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock Date to ensure consistent system prompt generation
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_DATE);

    // Default mock implementations
    mockPrepareConversationContext.mockResolvedValue({
      formattedContext: 'Prepared context string',
      contextTokens: 100,
      isOptimized: true,
    });
    mockExecuteToolBasedConversation.mockResolvedValue({
      responseMessage: {
        answer: 'Generated code',
        reference: [],
        citations: [],
        citationMetadata: {},
      },
    });
    mockConversationModel.lean.mockResolvedValue(null); // Reset default for conversation model
    // Suppress console.log for cleaner test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers(); // Restore real timers
    vi.restoreAllMocks(); // Restore console.log/error
  });

  it('should process query and user ID correctly from state.currentQuery and state.userId', async () => {
    const state = {
      currentQuery: 'create a react component',
      userId: 'user123',
      conversationId: 'conv123',
    };

    await runCodeGeneration(state);

    expect(mockPrepareConversationContext).toHaveBeenCalledWith(
      expect.any(Array), // conversationContext
      null, // existingSummary
      state.currentQuery
    );
    expect(mockExecuteToolBasedConversation).toHaveBeenCalledWith(
      expect.any(Array), // messages
      { userId: state.userId, conversationId: state.conversationId }
    );
  });

  it('should use state.query if state.currentQuery is not present', async () => {
    const state = {
      query: 'create a python script',
      authUserId: 'user456',
    };

    await runCodeGeneration(state);

    expect(mockPrepareConversationContext).toHaveBeenCalledWith(
      expect.any(Array),
      null,
      state.query
    );
    expect(mockExecuteToolBasedConversation).toHaveBeenCalledWith(
      expect.any(Array),
      { userId: state.authUserId, conversationId: undefined }
    );
  });

  it('should use state.user.id if userId and authUserId are not present', async () => {
    const state = {
      query: 'create a python script',
      user: { id: 'user789' },
    };

    await runCodeGeneration(state);

    expect(mockExecuteToolBasedConversation).toHaveBeenCalledWith(
      expect.any(Array),
      { userId: state.user.id, conversationId: undefined }
    );
  });

  it('should fetch conversation context from DB if conversationId is provided', async () => {
    const mockMessages = [{ role: 'user', content: 'hello' }];
    const mockSummary = 'summary of conversation';
    mockConversationModel.lean.mockResolvedValue({
      messages: mockMessages,
      conversationSummary: mockSummary,
    });

    const state = {
      query: 'new query',
      conversationId: 'conv456',
    };

    await runCodeGeneration(state);

    expect(mockConversationModel.findOne).toHaveBeenCalledWith({
      conversationId: state.conversationId,
    });
    expect(mockConversationModel.select).toHaveBeenCalledWith(
      'messages conversationSummary'
    );
    expect(mockConversationModel.lean).toHaveBeenCalled();
    expect(mockPrepareConversationContext).toHaveBeenCalledWith(
      mockMessages,
      mockSummary,
      state.query
    );
  });

  it('should use state.conversationContext if provided, ignoring conversationId', async () => {
    const stateContext = [{ role: 'user', content: 'provided context' }];
    const state = {
      query: 'another query',
      conversationId: 'conv789', // This should be ignored
      conversationContext: stateContext,
    };

    await runCodeGeneration(state);

    expect(mockConversationModel.findOne).not.toHaveBeenCalled();
    expect(mockPrepareConversationContext).toHaveBeenCalledWith(
      stateContext,
      null, // existingSummary should be null if not provided in state
      state.query
    );
  });

  it('should initialize conversationContext as empty array if not provided', async () => {
    const state = { query: 'empty context test' };

    await runCodeGeneration(state);

    expect(mockConversationModel.findOne).not.toHaveBeenCalled();
    expect(mockPrepareConversationContext).toHaveBeenCalledWith(
      [],
      null,
      state.query
    );
  });

  it('should filter out consecutive user messages from conversation context', async () => {
    const initialContext = [
      { role: 'user', content: 'user 1' },
      { role: 'user', content: 'user 2' },
      { role: 'assistant', content: 'assistant 1' },
      { role: 'user', content: 'user 3' },
      { role: 'user', content: 'user 4' },
      { role: 'assistant', content: 'assistant 2' },
      { role: 'user', content: 'user 5' },
    ];
    const expectedFilteredContext = [
      { role: 'user', content: 'user 1' },
      { role: 'assistant', content: 'assistant 1' },
      { role: 'user', content: 'user 3' },
      { role: 'assistant', content: 'assistant 2' },
      { role: 'user', content: 'user 5' },
    ];

    const state = {
      query: 'filter test',
      conversationContext: initialContext,
    };

    await runCodeGeneration(state);

    expect(mockPrepareConversationContext).toHaveBeenCalledWith(
      expectedFilteredContext,
      null,
      state.query
    );
  });

  it('should construct the system prompt with current date and year', async () => {
    const state = { query: 'test prompt' };
    await runCodeGeneration(state);

    const messages = mockExecuteToolBasedConversation.mock.calls[0][0];
    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain(`Today's date: ${MOCK_DATE_STRING}`);
    expect(systemPrompt).toContain(`Current year: ${MOCK_YEAR}`);
    expect(systemPrompt).toContain('You are an expert code generation assistant powered by Claude Sonnet 4.5.');
    expect(systemPrompt).toContain('DEFAULT BEHAVIOR: Generate code directly without search unless you have a specific reason to search.');
    expect(systemPrompt).toContain('CRITICAL RULE: Default to generating code directly. Only search if you have a compelling reason.');
  });

  it('should call executeToolBasedConversation with the correct messages and options', async () => {
    const state = {
      query: 'generate a simple express app',
      userId: 'user123',
      conversationId: 'conv123',
    };
    const mockFormattedContext = 'Formatted conversation history.';
    mockPrepareConversationContext.mockResolvedValue({
      formattedContext: mockFormattedContext,
      contextTokens: 50,
      isOptimized: false,
    });

    await runCodeGeneration(state);

    const messages = mockExecuteToolBasedConversation.mock.calls[0][0];
    const options = mockExecuteToolBasedConversation.mock.calls[0][1];

    expect(messages).toHaveLength(2); // System prompt + user message
    expect(messages[1].content).toContain(mockFormattedContext);
    expect(messages[1].content).toContain(`Current request: ${state.query}`);
    expect(options).toEqual({
      userId: state.userId,
      conversationId: state.conversationId,
    });
  });

  it('should return the result from executeToolBasedConversation', async () => {
    const expectedResult = {
      answer: 'Final generated code',
      reference: ['ref1'],
      citations: [{ text: 'citation text' }],
      citationMetadata: { source: 'web' },
    };
    mockExecuteToolBasedConversation.mockResolvedValue({
      responseMessage: expectedResult,
    });

    const state = { query: 'test result' };
    const result = await runCodeGeneration(state);

    expect(result).toEqual(expectedResult);
  });

  it('should handle errors gracefully and return a fallback message', async () => {
    const errorMessage = 'Failed to generate code';
    mockExecuteToolBasedConversation.mockRejectedValue(new Error(errorMessage));

    const state = { query: 'error test' };
    const result = await runCodeGeneration(state);

    expect(result.answer).toContain(
      `I apologize, but I encountered an error while generating code: ${errorMessage}`
    );
    expect(result.citationMetadata.error).toBe(true);
    expect(result.citationMetadata.errorMessage).toBe(errorMessage);
    expect(result.citationMetadata.timestamp).toBeDefined();
  });

  it('should handle errors during conversation context fetching', async () => {
    const dbErrorMessage = 'DB connection error';
    mockConversationModel.lean.mockRejectedValue(new Error(dbErrorMessage));

    const state = { query: 'db error test', conversationId: 'bad_conv' };
    const result = await runCodeGeneration(state);

    expect(result.answer).toContain(
      `I apologize, but I encountered an error while generating code: ${dbErrorMessage}`
    );
    expect(result.citationMetadata.error).toBe(true);
    expect(result.citationMetadata.errorMessage).toBe(dbErrorMessage);
  });

  it('should pass existingSummary from state if available and no conversation model summary', async () => {
    const state = {
      query: 'query with summary',
      conversationSummary: 'existing summary from state',
    };

    await runCodeGeneration(state);

    expect(mockPrepareConversationContext).toHaveBeenCalledWith(
      expect.any(Array),
      state.conversationSummary,
      state.query
    );
  });

  it('should prioritize conversation model summary over state.conversationSummary if both are present', async () => {
    const mockMessages = [{ role: 'user', content: 'hello' }];
    const mockDbSummary = 'summary from db';
    const mockStateSummary = 'summary from state';
    mockConversationModel.lean.mockResolvedValue({
      messages: mockMessages,
      conversationSummary: mockDbSummary,
    });

    const state = {
      query: 'query with both summaries',
      conversationId: 'conv_with_summary',
      conversationSummary: mockStateSummary,
    };

    await runCodeGeneration(state);

    expect(mockPrepareConversationContext).toHaveBeenCalledWith(
      mockMessages,
      mockDbSummary, // DB summary should take precedence
      state.query
    );
  });

  it('should use state.conversationSummary if conversation model summary is null/undefined', async () => {
    const mockMessages = [{ role: 'user', content: 'hello' }];
    // Simulate conversation found but no summary in DB
    mockConversationModel.lean.mockResolvedValue({
      messages: mockMessages,
      conversationSummary: undefined,
    });

    const state = {
      query: 'query with state summary, no db summary',
      conversationId: 'conv_no_db_summary',
      conversationSummary: 'summary from state',
    };

    await runCodeGeneration(state);

    expect(mockPrepareConversationContext).toHaveBeenCalledWith(
      mockMessages,
      state.conversationSummary, // State summary should be used
      state.query
    );
  });
});