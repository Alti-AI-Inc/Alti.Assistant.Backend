import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';

// Mock external dependencies
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-gemini-key',
  },
}));

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

const mockAddMessage = vi.fn();
const MockInMemoryChatMessageHistory = vi.fn(() => ({
  addMessage: mockAddMessage,
}));
vi.mock('@langchain/core/chat_history', () => ({
  InMemoryChatMessageHistory: MockInMemoryChatMessageHistory,
}));

const MockBufferMemory = vi.fn(() => ({
  chatHistory: {
    addMessage: mockAddMessage,
  },
}));
vi.mock('langchain/memory', () => ({
  BufferMemory: MockBufferMemory,
}));

vi.mock('@langchain/core/messages', () => ({
  AIMessage: vi.fn((content) => ({ type: 'ai', content })),
  HumanMessage: vi.fn((content) => ({ type: 'human', content })),
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    error: vi.fn(),
  },
}));

const mockFindByIdAndUpdate = vi.fn();
vi.mock('../auth/auth.model.js', () => ({
  default: {
    findByIdAndUpdate: mockFindByIdAndUpdate,
  },
}));

const mockFindOneAndUpdate = vi.fn();
const mockCreateChatHistory = vi.fn();
vi.mock('../conversations/chatHistory.model.js', () => ({
  default: {
    findOneAndUpdate: mockFindOneAndUpdate,
    create: mockCreateChatHistory,
  },
}));

const mockIncrementPromptsUsed = vi.fn();
vi.mock('../payment/payment.controller.js', () => ({
  paymentController: {
    incrementPromptsUsed: mockIncrementPromptsUsed,
  },
}));

const mockRedisPublish = vi.fn();
vi.mock('../../../shared/redis.js', () => ({
  RedisClient: {
    publish: mockRedisPublish,
  },
}));

const DEEPSEEK_RESPONSE_SERVICE_POST = 'test-deepseek-channel';
vi.mock('./deepseek.constatn.js', () => ({
  DEEPSEEK_RESPONSE_SERVICE_POST,
}));

let deepseekServices; // Will be assigned in beforeEach

describe('deepseekServices', () => {
  const prompt = 'Hello AI';
  const userId = 'user123';
  const sessionId = 'session456';
  const aiReply = 'Hello Human!';
  const mockChatHistoryId = 'chatHistoryId789';

  beforeEach(async () => {
    vi.resetModules(); // Resets the module cache, ensuring a fresh `sessionMemoryStore`
    // Re-import the service after all mocks are set up and modules are reset
    const module = await import('./deepseek.service.js');
    deepseekServices = module.deepseekServices;

    vi.clearAllMocks(); // Clear mocks after re-import, as new mocks might be created

    // Mock successful Gemini response by default
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [{ content: { parts: [{ text: aiReply }] } }],
      },
    });

    // Mock successful payment increment by default
    mockIncrementPromptsUsed.mockResolvedValue({ success: true });

    // Mock ChatHistory.findOneAndUpdate to return null by default (simulating new session)
    mockFindOneAndUpdate.mockResolvedValue(null);

    // Mock ChatHistory.create to return a new session document
    mockCreateChatHistory.mockResolvedValue({
      _id: mockChatHistoryId,
      user: userId,
      sessionId,
      responses: [{ prompt, model: 'gemini-2.5-flash', reply: aiReply, total_time: expect.any(Number) }],
    });

    // Mock UserModel.findByIdAndUpdate to resolve successfully
    mockFindByIdAndUpdate.mockResolvedValue({});
  });

  it('should process a new prompt, create a new session, and return the AI reply', async () => {
    const result = await deepseekServices.deepseekResponseService(prompt, userId, sessionId);

    expect(MockBufferMemory).toHaveBeenCalledTimes(1);
    expect(MockBufferMemory).toHaveBeenCalledWith({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: expect.any(MockInMemoryChatMessageHistory),
    });
    expect(MockInMemoryChatMessageHistory).toHaveBeenCalledTimes(1);

    expect(mockAddMessage).toHaveBeenCalledTimes(2);
    expect(mockAddMessage).toHaveBeenCalledWith({ type: 'human', content: prompt });
    expect(mockAddMessage).toHaveBeenCalledWith({ type: 'ai', content: aiReply });

    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
    expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-2.5-flash' });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledWith(prompt);

    expect(mockIncrementPromptsUsed).toHaveBeenCalledTimes(1);
    expect(mockIncrementPromptsUsed).toHaveBeenCalledWith(userId);

    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { user: userId, sessionId },
      { $push: { responses: expect.objectContaining({ prompt, reply: aiReply, model: 'gemini-2.5-flash', total_time: expect.any(Number) }) } },
      { new: true }
    );
    expect(mockCreateChatHistory).toHaveBeenCalledTimes(1);
    expect(mockCreateChatHistory).toHaveBeenCalledWith({
      user: userId,
      sessionId,
      responses: [expect.objectContaining({ prompt, reply: aiReply, model: 'gemini-2.5-flash', total_time: expect.any(Number) })],
    });
    expect(mockFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(userId, {
      $push: { llamaAiSessions: mockChatHistoryId },
    });

    expect(mockRedisPublish).toHaveBeenCalledTimes(1);
    expect(mockRedisPublish).toHaveBeenCalledWith(
      DEEPSEEK_RESPONSE_SERVICE_POST,
      JSON.stringify({ prompt, sessionId, reply: aiReply })
    );

    expect(result).toEqual({ prompt, sessionId, reply: aiReply });
  });

  it('should reuse existing session memory for subsequent prompts within the same test run', async () => {
    // Simulate the first call within this test to establish memory
    const firstPrompt = 'Initial query';
    const firstReply = 'Initial response';
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{ content: { parts: [{ text: firstReply }] } }],
      },
    });
    mockFindOneAndUpdate.mockResolvedValueOnce(null); // First call creates
    mockCreateChatHistory.mockResolvedValueOnce({
      _id: mockChatHistoryId,
      user: userId,
      sessionId,
      responses: [{ prompt: firstPrompt, model: 'gemini-2.5-flash', reply: firstReply, total_time: expect.any(Number) }],
    });
    await deepseekServices.deepseekResponseService(firstPrompt, userId, sessionId);

    vi.clearAllMocks(); // Clear mocks to check calls for the second prompt

    // Now, simulate the second call for the *same* session ID, which should reuse memory
    const newPrompt = 'How are you?';
    const newReply = 'I am fine, thank you!';
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{ content: { parts: [{ text: newReply }] } }],
      },
    });
    // For an existing session, findOneAndUpdate should return an existing document
    mockFindOneAndUpdate.mockResolvedValueOnce({
      _id: mockChatHistoryId,
      user: userId,
      sessionId,
      responses: [
        { prompt: firstPrompt, model: 'gemini-2.5-flash', reply: firstReply, total_time: expect.any(Number) },
        { prompt: newPrompt, model: 'gemini-2.5-flash', reply: newReply, total_time: expect.any(Number) },
      ],
    });

    const result = await deepseekServices.deepseekResponseService(newPrompt, userId, sessionId);

    // MockBufferMemory and MockInMemoryChatMessageHistory should NOT be called again
    // because the instance is already in sessionMemoryStore from the first call within this test.
    expect(MockBufferMemory).not.toHaveBeenCalled();
    expect(MockInMemoryChatMessageHistory).not.toHaveBeenCalled();

    expect(mockAddMessage).toHaveBeenCalledTimes(2); // Only for the new human and AI messages
    expect(mockAddMessage).toHaveBeenCalledWith({ type: 'human', content: newPrompt });
    expect(mockAddMessage).toHaveBeenCalledWith({ type: 'ai', content: newReply });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledWith(newPrompt);

    expect(mockIncrementPromptsUsed).toHaveBeenCalledTimes(1);
    expect(mockIncrementPromptsUsed).toHaveBeenCalledWith(userId);

    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { user: userId, sessionId },
      { $push: { responses: expect.objectContaining({ prompt: newPrompt, reply: newReply, model: 'gemini-2.5-flash', total_time: expect.any(Number) }) } },
      { new: true }
    );
    expect(mockCreateChatHistory).not.toHaveBeenCalled(); // Should not create a new session
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled(); // Should not update UserModel for existing session

    expect(mockRedisPublish).toHaveBeenCalledTimes(1);
    expect(mockRedisPublish).toHaveBeenCalledWith(
      DEEPSEEK_RESPONSE_SERVICE_POST,
      JSON.stringify({ prompt: newPrompt, sessionId, reply: newReply })
    );

    expect(result).toEqual({ prompt: newPrompt, sessionId, reply: newReply });
  });

  it('should handle cases where Gemini returns no reply', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{ content: { parts: [{ text: undefined }] } }], // No text part
      },
    });
    mockCreateChatHistory.mockResolvedValueOnce({
      _id: mockChatHistoryId,
      user: userId,
      sessionId,
      responses: [{ prompt, model: 'gemini-2.5-flash', reply: 'No reply generated', total_time: expect.any(Number) }],
    });

    const result = await deepseekServices.deepseekResponseService(prompt, userId, sessionId);

    expect(mockAddMessage).toHaveBeenCalledWith({ type: 'ai', content: 'No reply generated' });
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      { $push: { responses: expect.objectContaining({ reply: 'No reply generated' }) } },
      expect.any(Object)
    );
    expect(mockCreateChatHistory).toHaveBeenCalledWith(
      expect.objectContaining({ responses: [expect.objectContaining({ reply: 'No reply generated' })] })
    );
    expect(result).toEqual({ prompt, sessionId, reply: 'No reply generated' });
  });

  it('should throw ApiError if incrementPromptsUsed fails', async () => {
    const errorMessage = 'Payment failed';
    mockIncrementPromptsUsed.mockResolvedValueOnce({ success: false, message: errorMessage });

    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toThrow(ApiError);
    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toHaveProperty(
      'statusCode',
      httpStatus.BAD_REQUEST
    );
    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toHaveProperty(
      'message',
      errorMessage
    );

    expect(mockIncrementPromptsUsed).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Error in incrementPromptsUsed:', expect.any(ApiError));
    // Ensure no further operations are attempted
    expect(mockAddMessage).toHaveBeenCalledTimes(1); // Only human message added
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockCreateChatHistory).not.toHaveBeenCalled();
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(mockRedisPublish).not.toHaveBeenCalled();
  });

  it('should throw ApiError if Gemini service fails', async () => {
    const geminiError = new Error('Gemini API error');
    mockGenerateContent.mockRejectedValueOnce(geminiError);

    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toThrow(ApiError);
    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toHaveProperty(
      'statusCode',
      httpStatus.INTERNAL_SERVER_ERROR
    );
    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toHaveProperty(
      'message',
      'AI service failed.'
    );

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Error in deepseekResponseService:', geminiError);
    // Ensure no further operations are attempted
    expect(mockAddMessage).toHaveBeenCalledTimes(1); // Only human message added
    expect(mockIncrementPromptsUsed).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockCreateChatHistory).not.toHaveBeenCalled();
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(mockRedisPublish).not.toHaveBeenCalled();
  });

  it('should throw ApiError if ChatHistory.findOneAndUpdate fails', async () => {
    const dbError = new Error('DB update error');
    mockFindOneAndUpdate.mockRejectedValueOnce(dbError);

    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toThrow(ApiError);
    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toHaveProperty(
      'statusCode',
      httpStatus.INTERNAL_SERVER_ERROR
    );
    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toHaveProperty(
      'message',
      'AI service failed.'
    ); // The outer catch block catches this

    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Error in deepseekResponseService:', dbError);
    // Ensure Redis publish is not called
    expect(mockRedisPublish).not.toHaveBeenCalled();
  });

  it('should throw ApiError if ChatHistory.create fails', async () => {
    const dbError = new Error('DB create error');
    mockFindOneAndUpdate.mockResolvedValueOnce(null); // Ensure it tries to create
    mockCreateChatHistory.mockRejectedValueOnce(dbError);

    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toThrow(ApiError);
    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toHaveProperty(
      'statusCode',
      httpStatus.INTERNAL_SERVER_ERROR
    );
    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toHaveProperty(
      'message',
      'AI service failed.'
    );

    expect(mockCreateChatHistory).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Error in deepseekResponseService:', dbError);
    // Ensure UserModel update and Redis publish are not called
    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(mockRedisPublish).not.toHaveBeenCalled();
  });

  it('should throw ApiError if UserModel.findByIdAndUpdate fails', async () => {
    const dbError = new Error('User model update error');
    mockFindByIdAndUpdate.mockRejectedValueOnce(dbError);

    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toThrow(ApiError);
    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toHaveProperty(
      'statusCode',
      httpStatus.INTERNAL_SERVER_ERROR
    );
    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toHaveProperty(
      'message',
      'AI service failed.'
    );

    expect(mockFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Error in deepseekResponseService:', dbError);
    // Ensure Redis publish is not called
    expect(mockRedisPublish).not.toHaveBeenCalled();
  });

  it('should throw ApiError if RedisClient.publish fails', async () => {
    const redisError = new Error('Redis publish error');
    mockRedisPublish.mockRejectedValueOnce(redisError);

    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toThrow(ApiError);
    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toHaveProperty(
      'statusCode',
      httpStatus.INTERNAL_SERVER_ERROR
    );
    await expect(deepseekServices.deepseekResponseService(prompt, userId, sessionId)).rejects.toHaveProperty(
      'message',
      'AI service failed.'
    );

    expect(mockRedisPublish).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Error in deepseekResponseService:', redisError);
  });
});