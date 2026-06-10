import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';

// Mock external dependencies
const mockInMemoryChatMessageHistoryInstance = {
  addMessage: vi.fn(),
  getMessages: vi.fn(() => []), // Added for completeness, though not directly used in service
};
const mockInMemoryChatMessageHistory = vi.fn(() => mockInMemoryChatMessageHistoryInstance);
vi.mock('@langchain/core/chat_history', () => ({
  InMemoryChatMessageHistory: mockInMemoryChatMessageHistory,
}));

const mockAIMessage = vi.fn((content) => ({ type: 'ai', content }));
const mockHumanMessage = vi.fn((content) => ({ type: 'human', content }));
vi.mock('@langchain/core/messages', () => ({
  AIMessage: mockAIMessage,
  HumanMessage: mockHumanMessage,
}));

const mockChatGoogleGenerativeAIInstance = {}; // Simple instance
const mockChatGoogleGenerativeAI = vi.fn(() => mockChatGoogleGenerativeAIInstance);
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: mockChatGoogleGenerativeAI,
}));

const mockConversationChainInvoke = vi.fn();
const mockConversationChainInstance = {
  invoke: mockConversationChainInvoke,
};
const mockConversationChain = vi.fn(() => mockConversationChainInstance);
vi.mock('langchain/chains', () => ({
  ConversationChain: mockConversationChain,
}));

const mockBufferMemoryInstance = {
  chatHistory: mockInMemoryChatMessageHistoryInstance, // Link to the mocked history instance
  returnMessages: true,
  memoryKey: 'history',
};
const mockBufferMemory = vi.fn(() => mockBufferMemoryInstance);
vi.mock('langchain/memory', () => ({
  BufferMemory: mockBufferMemory,
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test_gemini_key',
  },
}));

const mockApiError = vi.fn((status, message) => {
  const error = new Error(message);
  error.statusCode = status;
  return error;
});
vi.mock('../../../errors/ApiError.js', () => ({
  default: mockApiError,
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

const mockUserModel = {
  findByIdAndUpdate: vi.fn(),
};
vi.mock('../auth/auth.model.js', () => ({
  default: mockUserModel,
}));

const mockChatHistorySave = vi.fn();
const mockChatHistory = {
  findOne: vi.fn(),
  create: vi.fn(),
};
vi.mock('../conversations/chatHistory.model.js', () => ({
  default: mockChatHistory,
}));

const mockPaymentController = {
  incrementPromptsUsed: vi.fn(),
};
vi.mock('../payment/payment.controller.js', () => ({
  paymentController: mockPaymentController,
}));

let Llama4AiGetResponseService;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules(); // Resets the module cache, ensuring sessionMemoryStore is cleared for each test

  // Re-import the service to get a fresh module state
  const serviceModule = await import('./llama4.service.js');
  Llama4AiGetResponseService = serviceModule.Llama4AiServices.Llama4AiGetResponseService;
});

describe('Llama4AiGetResponseService', () => {
  const userId = 'user123';
  const sessionId = 'session456';
  const prompt1 = 'Hello AI';
  const aiReply1 = 'Hello Human!';
  const prompt2 = 'How are you?';
  const aiReply2 = 'I am fine, thank you!';

  const mockChainInvokeResponse1 = {
    response: aiReply1,
    usage: { total_time: 100 },
  };
  const mockChainInvokeResponse2 = {
    response: aiReply2,
    usage: { total_time: 120 },
  };

  // Helper to set up common mocks for a successful flow
  const setupSuccessfulMocks = (invokeResponse = mockChainInvokeResponse1) => {
    mockChatGoogleGenerativeAI.mockReturnValue(mockChatGoogleGenerativeAIInstance);
    mockConversationChain.mockReturnValue(mockConversationChainInstance);
    mockConversationChainInvoke.mockResolvedValue(invokeResponse);
    mockPaymentController.incrementPromptsUsed.mockResolvedValue({ success: true });
  };

  it('should initialize new session memory and return AI response for a new session', async () => {
    setupSuccessfulMocks();
    mockChatHistory.findOne.mockResolvedValue(null); // No existing session
    mockChatHistory.create.mockResolvedValue({
      _id: 'newChatHistoryId',
      user: userId,
      sessionId,
      responses: [],
      save: mockChatHistorySave,
    });
    mockUserModel.findByIdAndUpdate.mockResolvedValue({});

    const result = await Llama4AiGetResponseService(prompt1, userId, sessionId);

    expect(mockBufferMemory).toHaveBeenCalledTimes(1); // BufferMemory initialized
    expect(mockInMemoryChatMessageHistory).toHaveBeenCalledTimes(1); // InMemoryChatMessageHistory initialized

    expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledTimes(2);
    expect(mockHumanMessage).toHaveBeenCalledWith(prompt1);
    expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'human', content: prompt1 })
    );
    expect(mockAIMessage).toHaveBeenCalledWith(aiReply1);
    expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ai', content: aiReply1 })
    );

    expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      apiKey: 'test_gemini_key',
    });
    expect(mockConversationChain).toHaveBeenCalledWith(
      expect.objectContaining({
        llm: mockChatGoogleGenerativeAIInstance,
        memory: mockBufferMemoryInstance,
      })
    );
    expect(mockConversationChainInvoke).toHaveBeenCalledWith({ input: prompt1 });

    expect(mockPaymentController.incrementPromptsUsed).toHaveBeenCalledWith(userId);

    expect(mockChatHistory.findOne).toHaveBeenCalledWith({ user: userId, sessionId });
    expect(mockChatHistory.create).toHaveBeenCalledWith({
      user: userId,
      sessionId,
      responses: [
        {
          prompt: prompt1,
          model: 'llama3-8b-8192',
          reply: aiReply1,
          total_time: mockChainInvokeResponse1.usage.total_time,
        },
      ],
    });
    expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(userId, {
      $push: { llamaAiSessions: 'newChatHistoryId' },
    });
    expect(mockChatHistorySave).not.toHaveBeenCalled(); // No save on new session, only create

    expect(result).toEqual({ prompt: prompt1, sessionId, reply: aiReply1 });
    expect(mockLogger.info).toHaveBeenCalledWith('Memory Initialized:', mockBufferMemoryInstance);
    expect(mockLogger.info).toHaveBeenCalledWith('Model Response:', mockChainInvokeResponse1);
    expect(mockLogger.info).toHaveBeenCalledWith('Creating New Session...');
    expect(mockLogger.info).toHaveBeenCalledWith('New Session Created:', expect.any(Object));
  });

  it('should use existing session memory and update chat history for subsequent calls in the same session', async () => {
    // First call: new session
    setupSuccessfulMocks(mockChainInvokeResponse1);
    const existingChatHistory = {
      _id: 'existingChatHistoryId',
      user: userId,
      sessionId,
      responses: [],
      save: mockChatHistorySave,
    };
    mockChatHistory.findOne.mockResolvedValueOnce(null); // First call: no existing session
    mockChatHistory.create.mockResolvedValueOnce(existingChatHistory);
    mockUserModel.findByIdAndUpdate.mockResolvedValueOnce({});

    await Llama4AiGetResponseService(prompt1, userId, sessionId);

    // Assertions for first call (similar to the 'new session' test)
    expect(mockBufferMemory).toHaveBeenCalledTimes(1);
    expect(mockInMemoryChatMessageHistory).toHaveBeenCalledTimes(1);
    expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledTimes(2);
    expect(mockHumanMessage).toHaveBeenCalledWith(prompt1);
    expect(mockAIMessage).toHaveBeenCalledWith(aiReply1);
    expect(mockChatHistory.create).toHaveBeenCalledTimes(1);
    expect(mockChatHistorySave).not.toHaveBeenCalled(); // No save on first create

    // Clear mocks for the second call, but the `sessionMemoryStore` state persists
    vi.clearAllMocks();

    // Second call: existing session
    setupSuccessfulMocks(mockChainInvokeResponse2);
    mockChatHistory.findOne.mockResolvedValueOnce(existingChatHistory); // Second call: existing session found
    mockChatHistorySave.mockResolvedValueOnce(existingChatHistory);

    const result = await Llama4AiGetResponseService(prompt2, userId, sessionId);

    // Expect BufferMemory and InMemoryChatMessageHistory constructors NOT to be called again
    expect(mockBufferMemory).toHaveBeenCalledTimes(0); // Should not be called again for the same session
    expect(mockInMemoryChatMessageHistory).toHaveBeenCalledTimes(0); // Should not be called again for the same session

    expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledTimes(2); // 2 new messages for this call
    expect(mockHumanMessage).toHaveBeenCalledWith(prompt2);
    expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'human', content: prompt2 })
    );
    expect(mockAIMessage).toHaveBeenCalledWith(aiReply2);
    expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ai', content: aiReply2 })
    );

    expect(mockChatGoogleGenerativeAI).toHaveBeenCalledTimes(0); // Not re-initialized
    expect(mockConversationChain).toHaveBeenCalledTimes(0); // Not re-initialized
    expect(mockConversationChainInvoke).toHaveBeenCalledWith({ input: prompt2 });

    expect(mockPaymentController.incrementPromptsUsed).toHaveBeenCalledWith(userId);

    expect(mockChatHistory.findOne).toHaveBeenCalledWith({ user: userId, sessionId });
    expect(mockChatHistory.create).not.toHaveBeenCalled(); // Should not create a new session
    expect(existingChatHistory.responses).toHaveLength(2); // Original (from first call) + new
    expect(existingChatHistory.responses[0]).toEqual({
      prompt: prompt1,
      model: 'llama3-8b-8192',
      reply: aiReply1,
      total_time: mockChainInvokeResponse1.usage.total_time,
    });
    expect(existingChatHistory.responses[1]).toEqual({
      prompt: prompt2,
      model: 'llama3-8b-8192',
      reply: aiReply2,
      total_time: mockChainInvokeResponse2.usage.total_time,
    });
    expect(mockChatHistorySave).toHaveBeenCalledTimes(1); // Should save the existing session
    expect(mockUserModel.findByIdAndUpdate).not.toHaveBeenCalled(); // No user update for existing session

    expect(result).toEqual({ prompt: prompt2, sessionId, reply: aiReply2 });
    expect(mockLogger.info).toHaveBeenCalledWith('Existing Session Found:', existingChatHistory);
    expect(mockLogger.info).toHaveBeenCalledWith('Updated Session:', existingChatHistory);
  });

  it('should throw ApiError if chain.invoke fails', async () => {
    setupSuccessfulMocks();
    const errorMessage = 'AI model failed';
    mockConversationChainInvoke.mockRejectedValue(new Error(errorMessage));
    mockChatHistory.findOne.mockResolvedValue(null);
    mockPaymentController.incrementPromptsUsed.mockResolvedValue({ success: true });

    await expect(Llama4AiGetResponseService(prompt1, userId, sessionId)).rejects.toThrow(
      expect.objectContaining({
        message: 'AI service failed.',
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      })
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error in Llama4AiGetResponseService:',
      expect.any(Error)
    );
    expect(mockApiError).toHaveBeenCalledWith(
      httpStatus.INTERNAL_SERVER_ERROR,
      'AI service failed.'
    );
    expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'human', content: prompt1 })
    );
    expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledTimes(1); // Only human message added
    expect(mockPaymentController.incrementPromptsUsed).not.toHaveBeenCalled(); // Should not be called if invoke fails
    expect(mockChatHistory.create).not.toHaveBeenCalled();
  });

  it('should throw ApiError if paymentController.incrementPromptsUsed returns success: false', async () => {
    setupSuccessfulMocks();
    const paymentErrorMessage = 'Payment limit reached';
    mockPaymentController.incrementPromptsUsed.mockResolvedValue({
      success: false,
      message: paymentErrorMessage,
    });
    mockChatHistory.findOne.mockResolvedValue(null);

    await expect(Llama4AiGetResponseService(prompt1, userId, sessionId)).rejects.toThrow(
      expect.objectContaining({
        message: paymentErrorMessage,
        statusCode: httpStatus.BAD_REQUEST,
      })
    );

    expect(mockPaymentController.incrementPromptsUsed).toHaveBeenCalledWith(userId);
    expect(mockLogger.error).not.toHaveBeenCalledWith(
      'Error in incrementPromptsUsed:',
      expect.any(Error)
    ); // This path is for thrown errors, not success: false
    expect(mockApiError).toHaveBeenCalledWith(httpStatus.BAD_REQUEST, paymentErrorMessage);
    expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledTimes(1); // Only human message added
    expect(mockChatHistory.create).not.toHaveBeenCalled(); // Should not save chat history
  });

  it('should throw ApiError if paymentController.incrementPromptsUsed throws an error', async () => {
    setupSuccessfulMocks();
    const paymentError = new Error('Database error during payment update');
    mockPaymentController.incrementPromptsUsed.mockRejectedValue(paymentError);
    mockChatHistory.findOne.mockResolvedValue(null);

    await expect(Llama4AiGetResponseService(prompt1, userId, sessionId)).rejects.toThrow(
      expect.objectContaining({
        message: paymentError.message,
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      })
    );

    expect(mockPaymentController.incrementPromptsUsed).toHaveBeenCalledWith(userId);
    expect(mockLogger.error).toHaveBeenCalledWith('Error in incrementPromptsUsed:', paymentError);
    expect(mockApiError).toHaveBeenCalledWith(
      httpStatus.INTERNAL_SERVER_ERROR,
      paymentError.message
    );
    expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledTimes(1); // Only human message added
    expect(mockChatHistory.create).not.toHaveBeenCalled(); // Should not save chat history
  });

  it('should handle "No reply generated" if model response is empty', async () => {
    setupSuccessfulMocks();
    mockConversationChainInvoke.mockResolvedValue({ response: null }); // No response
    mockChatHistory.findOne.mockResolvedValue(null);
    mockChatHistory.create.mockResolvedValue({
      _id: 'newChatHistoryId',
      user: userId,
      sessionId,
      responses: [],
      save: mockChatHistorySave,
    });
    mockUserModel.findByIdAndUpdate.mockResolvedValue({});

    const result = await Llama4AiGetResponseService(prompt1, userId, sessionId);

    expect(mockAIMessage).toHaveBeenCalledWith('No reply generated');
    expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ai', content: 'No reply generated' })
    );
    expect(mockChatHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        responses: expect.arrayContaining([
          expect.objectContaining({
            reply: 'No reply generated',
          }),
        ]),
      })
    );
    expect(result).toEqual({ prompt: prompt1, sessionId, reply: 'No reply generated' });
  });

  it('should throw ApiError if ChatHistory.create fails', async () => {
    setupSuccessfulMocks();
    const dbError = new Error('DB creation failed');
    mockChatHistory.findOne.mockResolvedValue(null);
    mockChatHistory.create.mockRejectedValue(dbError);

    await expect(Llama4AiGetResponseService(prompt1, userId, sessionId)).rejects.toThrow(
      expect.objectContaining({
        message: 'AI service failed.',
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      })
    );

    expect(mockChatHistory.create).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error in Llama4AiGetResponseService:',
      dbError
    );
    expect(mockApiError).toHaveBeenCalledWith(
      httpStatus.INTERNAL_SERVER_ERROR,
      'AI service failed.'
    );
  });

  it('should throw ApiError if ChatHistory.findOne fails', async () => {
    setupSuccessfulMocks();
    const dbError = new Error('DB find failed');
    mockChatHistory.findOne.mockRejectedValue(dbError);

    await expect(Llama4AiGetResponseService(prompt1, userId, sessionId)).rejects.toThrow(
      expect.objectContaining({
        message: 'AI service failed.',
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      })
    );

    expect(mockChatHistory.findOne).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error in Llama4AiGetResponseService:',
      dbError
    );
    expect(mockApiError).toHaveBeenCalledWith(
      httpStatus.INTERNAL_SERVER_ERROR,
      'AI service failed.'
    );
  });

  it('should throw ApiError if UserModel.findByIdAndUpdate fails', async () => {
    setupSuccessfulMocks();
    const dbError = new Error('User update failed');
    mockChatHistory.findOne.mockResolvedValue(null);
    mockChatHistory.create.mockResolvedValue({
      _id: 'newChatHistoryId',
      user: userId,
      sessionId,
      responses: [],
      save: mockChatHistorySave,
    });
    mockUserModel.findByIdAndUpdate.mockRejectedValue(dbError);

    await expect(Llama4AiGetResponseService(prompt1, userId, sessionId)).rejects.toThrow(
      expect.objectContaining({
        message: 'AI service failed.',
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      })
    );

    expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error in Llama4AiGetResponseService:',
      dbError
    );
    expect(mockApiError).toHaveBeenCalledWith(
      httpStatus.INTERNAL_SERVER_ERROR,
      'AI service failed.'
    );
  });

  it('should default total_time to 0 if not provided in model response', async () => {
    setupSuccessfulMocks();
    mockConversationChainInvoke.mockResolvedValue({ response: aiReply1, usage: null }); // No usage
    mockChatHistory.findOne.mockResolvedValue(null);
    mockChatHistory.create.mockResolvedValue({
      _id: 'newChatHistoryId',
      user: userId,
      sessionId,
      responses: [],
      save: mockChatHistorySave,
    });
    mockUserModel.findByIdAndUpdate.mockResolvedValue({});

    const result = await Llama4AiGetResponseService(prompt1, userId, sessionId);

    expect(mockChatHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        responses: expect.arrayContaining([
          expect.objectContaining({
            total_time: 0,
          }),
        ]),
      })
    );
    expect(result).toEqual({ prompt: prompt1, sessionId, reply: aiReply1 });
  });
});