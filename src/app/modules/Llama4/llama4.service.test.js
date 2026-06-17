import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';

// Mock external dependencies
const mockInMemoryChatMessageHistoryInstance = {
  addMessages: vi.fn(),
  getMessages: vi.fn().mockImplementation(() => []),
};

const mockChatVertexAIInstance = {
  model: 'gemini-1.5-flash',
};

const mockConversationChainInvoke = vi.fn();
const mockConversationChainInstance = {
  invoke: mockConversationChainInvoke,
};

const mockBufferMemoryInstance = {
  chatHistory: mockInMemoryChatMessageHistoryInstance,
  returnMessages: true,
  memoryKey: 'history',
};

const {
  mockInMemoryChatMessageHistory,
  mockAIMessage,
  mockHumanMessage,
  mockChatVertexAI,
  mockConversationChain,
  mockBufferMemory,
  mockApiError,
  mockLogger,
  mockUserModel,
  mockChatHistory,
  mockPlatformConfig,
  mockPaymentController
} = vi.hoisted(() => {
  function mockInMemoryChatMessageHistory() {
    return mockInMemoryChatMessageHistoryInstance;
  }

  function mockAIMessage(content) {
    this.type = 'ai';
    this.content = content;
  }
  function mockHumanMessage(content) {
    this.type = 'human';
    this.content = content;
  }

  function mockChatVertexAI(config) {
    this.model = config?.model || 'gemini-1.5-flash';
  }

  function mockConversationChain() {
    return mockConversationChainInstance;
  }

  function mockBufferMemory() {
    return mockBufferMemoryInstance;
  }

  class mockApiError extends Error {
    constructor(statusCode, message, stack = '') {
      super(message);
      this.statusCode = statusCode;
      if (stack) {
        this.stack = stack;
      } else {
        Error.captureStackTrace(this, this.constructor);
      }
    }
  }

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  const mockUserModel = {
    findById: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockImplementation(() => ({
        lean: vi.fn().mockResolvedValue({ status: 'active', role: 'user' }),
      })),
    })),
    updateOne: vi.fn().mockResolvedValue({}),
  };

  const mockChatHistory = {
    findOne: vi.fn().mockImplementation(() => ({
      lean: vi.fn(),
    })),
    create: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({}),
  };

  const mockPlatformConfig = {
    findOne: vi.fn().mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue({
        service: { enabled: true },
        ai: { defaultModel: 'gemini-1.5-flash', temperature: 0.7 },
      }),
    })),
  };

  const mockPaymentController = {
    incrementPromptsUsed: vi.fn(),
  };

  return {
    mockInMemoryChatMessageHistory,
    mockAIMessage,
    mockHumanMessage,
    mockChatVertexAI,
    mockConversationChain,
    mockBufferMemory,
    mockApiError,
    mockLogger,
    mockUserModel,
    mockChatHistory,
    mockPlatformConfig,
    mockPaymentController
  };
});

// Setup vitest mocks
vi.mock('@langchain/core/chat_history', () => ({
  InMemoryChatMessageHistory: mockInMemoryChatMessageHistory,
}));

vi.mock('@langchain/core/messages', () => ({
  AIMessage: mockAIMessage,
  HumanMessage: mockHumanMessage,
}));

vi.mock('@langchain/google-vertexai', () => ({
  ChatVertexAI: mockChatVertexAI,
}));

vi.mock('@google-cloud/vertexai', () => ({
  HarmCategory: {
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  },
  HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
  },
}));

vi.mock('langchain/chains', () => ({
  ConversationChain: mockConversationChain,
}));

vi.mock('langchain/memory', () => ({
  BufferMemory: mockBufferMemory,
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test_gemini_key',
  },
}));

vi.mock('../../../errors/ApiError.js', () => ({
  default: mockApiError,
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../auth/auth.model.js', () => ({
  default: mockUserModel,
}));

vi.mock('../conversations/chatHistory.model.js', () => ({
  default: mockChatHistory,
}));

vi.mock('../platform/platformConfig.model.js', () => ({
  default: mockPlatformConfig,
}));

vi.mock('../payment/payment.controller.js', () => ({
  paymentController: mockPaymentController,
}));

// Import the service
import { Llama4AiServices } from './llama4.service.js';

describe('Llama4AiGetResponseService', () => {
  const userId = 'user123';
  const sessionId = 'session456';
  const prompt1 = 'Hello AI';
  const aiReply1 = 'Hello Human!';
  const prompt2 = 'How are you?';
  const aiReply2 = 'I am fine, thank you!';

  const mockChainInvokeResponse1 = {
    response: aiReply1,
  };
  const mockChainInvokeResponse2 = {
    response: aiReply2,
  };

  const setupSuccessfulMocks = (invokeResponse = mockChainInvokeResponse1) => {
    mockConversationChainInvoke.mockResolvedValue(invokeResponse);
    mockPaymentController.incrementPromptsUsed.mockResolvedValue({ success: true });
    mockUserModel.findById.mockImplementation(() => ({
      select: vi.fn().mockImplementation(() => ({
        lean: vi.fn().mockResolvedValue({ status: 'active', role: 'user' }),
      })),
    }));
    mockPlatformConfig.findOne.mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue({
        service: { enabled: true },
        ai: { defaultModel: 'gemini-1.5-flash', temperature: 0.7 },
      }),
    }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize new session memory and return AI response for a new session', async () => {
    setupSuccessfulMocks();
    mockChatHistory.findOne.mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue(null),
    }));
    mockChatHistory.create.mockResolvedValue({
      _id: 'newChatHistoryId',
      user: userId,
      sessionId,
      responses: [],
    });

    const result = await Llama4AiServices.Llama4AiGetResponseService(prompt1, userId, sessionId);

    expect(mockConversationChainInvoke).toHaveBeenCalledWith({ input: prompt1 });
    expect(mockPaymentController.incrementPromptsUsed).toHaveBeenCalledWith(userId);

    expect(mockChatHistory.create).toHaveBeenCalledWith({
      user: userId,
      sessionId,
      responses: [
        {
          prompt: prompt1,
          model: 'gemini-1.5-flash',
          reply: aiReply1,
        },
      ],
    });
    expect(mockUserModel.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      { $push: { llamaAiSessions: 'newChatHistoryId' } }
    );

    expect(result).toEqual({ prompt: prompt1, sessionId, reply: aiReply1 });
  });

  it('should use existing session memory and update chat history for subsequent calls in the same session', async () => {
    setupSuccessfulMocks(mockChainInvokeResponse2);
    
    const existingChatHistory = {
      _id: 'existingChatHistoryId',
      user: userId,
      sessionId,
      responses: [
        {
          prompt: prompt1,
          model: 'gemini-1.5-flash',
          reply: aiReply1,
        }
      ],
    };

    mockChatHistory.findOne.mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue(existingChatHistory),
    }));

    const result = await Llama4AiServices.Llama4AiGetResponseService(prompt2, userId, sessionId);

    expect(mockConversationChainInvoke).toHaveBeenCalledWith({ input: prompt2 });
    expect(mockPaymentController.incrementPromptsUsed).toHaveBeenCalledWith(userId);

    expect(mockChatHistory.updateOne).toHaveBeenCalledWith(
      { _id: 'existingChatHistoryId' },
      {
        $push: {
          responses: {
            prompt: prompt2,
            model: 'gemini-1.5-flash',
            reply: aiReply2,
          }
        }
      }
    );

    expect(result).toEqual({ prompt: prompt2, sessionId, reply: aiReply2 });
  });

  it('should throw ApiError if chain.invoke fails', async () => {
    setupSuccessfulMocks();
    const errorMessage = 'AI model failed';
    mockConversationChainInvoke.mockRejectedValue(new Error(errorMessage));
    mockChatHistory.findOne.mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue(null),
    }));

    await expect(Llama4AiServices.Llama4AiGetResponseService(prompt1, userId, sessionId)).rejects.toThrow('AI service failed.');
    expect(mockPaymentController.incrementPromptsUsed).not.toHaveBeenCalled();
    expect(mockChatHistory.create).not.toHaveBeenCalled();
  });

  it('should throw ApiError if paymentController.incrementPromptsUsed returns success: false', async () => {
    setupSuccessfulMocks();
    const paymentErrorMessage = 'Payment limit reached';
    mockPaymentController.incrementPromptsUsed.mockResolvedValue({
      success: false,
      message: paymentErrorMessage,
    });
    mockChatHistory.findOne.mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue(null),
    }));

    await expect(Llama4AiServices.Llama4AiGetResponseService(prompt1, userId, sessionId)).rejects.toThrow(paymentErrorMessage);
    expect(mockChatHistory.create).not.toHaveBeenCalled();
  });

  it('should throw ApiError if paymentController.incrementPromptsUsed throws an error', async () => {
    setupSuccessfulMocks();
    const paymentError = new Error('Database error during payment update');
    mockPaymentController.incrementPromptsUsed.mockRejectedValue(paymentError);
    mockChatHistory.findOne.mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue(null),
    }));

    await expect(Llama4AiServices.Llama4AiGetResponseService(prompt1, userId, sessionId)).rejects.toThrow(paymentError.message);
    expect(mockChatHistory.create).not.toHaveBeenCalled();
  });

  it('should handle "No reply generated" if model response is empty', async () => {
    setupSuccessfulMocks({ response: null });
    mockChatHistory.findOne.mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue(null),
    }));
    mockChatHistory.create.mockResolvedValue({
      _id: 'newChatHistoryId',
      user: userId,
      sessionId,
      responses: [],
    });

    const result = await Llama4AiServices.Llama4AiGetResponseService(prompt1, userId, sessionId);

    expect(mockChatHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        responses: [
          {
            prompt: prompt1,
            model: 'gemini-1.5-flash',
            reply: 'No reply generated',
          },
        ],
      })
    );
    expect(result).toEqual({ prompt: prompt1, sessionId, reply: 'No reply generated' });
  });

  it('should throw ApiError if ChatHistory.create fails', async () => {
    setupSuccessfulMocks();
    const dbError = new Error('DB creation failed');
    mockChatHistory.findOne.mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue(null),
    }));
    mockChatHistory.create.mockRejectedValue(dbError);

    await expect(Llama4AiServices.Llama4AiGetResponseService(prompt1, userId, sessionId)).rejects.toThrow('AI service failed.');
  });

  it('should throw ApiError if ChatHistory.findOne fails', async () => {
    setupSuccessfulMocks();
    const dbError = new Error('DB find failed');
    mockChatHistory.findOne.mockImplementation(() => ({
      lean: vi.fn().mockResolvedValue(null),
    }));
    mockChatHistory.findOne.mockImplementation(() => ({
      lean: vi.fn().mockRejectedValue(dbError),
    }));

    await expect(Llama4AiServices.Llama4AiGetResponseService(prompt1, userId, sessionId)).rejects.toThrow('AI service failed.');
  });
});