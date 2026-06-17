import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { RedisClient } from '../../../shared/redis.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';
import { paymentController } from '../payment/payment.controller.js';
import {
  QWEN_QWQ_RESPONSE_SERVICE_POST,
  QWEN_RESPONSE_SERVICE_POST,
} from './qwen.constant.js';

// Mock all external dependencies
vi.mock('@langchain/core/chat_history');
vi.mock('@langchain/core/messages');
vi.mock('@langchain/google-genai');
vi.mock('langchain/chains');
vi.mock('langchain/memory');
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock_gemini_key',
  },
}));
vi.mock('../../../errors/ApiError.js');
vi.mock('../../../shared/logger.js');
vi.mock('../../../shared/redis.js');
vi.mock('../auth/auth.model.js');
vi.mock('../conversations/chatHistory.model.js');
vi.mock('../payment/payment.controller.js');
vi.mock('./qwen.constant.js', () => ({
  QWEN_QWQ_RESPONSE_SERVICE_POST: 'qwen_qwq_channel',
  QWEN_RESPONSE_SERVICE_POST: 'qwen_channel',
}));

// Import the actual service functions after mocks are defined
import { QwenAiServices } from './qwen.service.js';

describe('QwenAiServices', () => {
  const prompt = 'Hello AI';
  const userId = 'user123';
  const sessionId = 'session456';
  const aiReply = 'AI Reply';
  const totalTime = 100;

  let mockInMemoryChatMessageHistoryInstance;
  let mockBufferMemoryInstance;
  let mockConversationChainInstance;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Langchain components with state management
    let actualChatMessages = [];
    mockInMemoryChatMessageHistoryInstance = {
      addMessage: vi.fn().mockImplementation(message => actualChatMessages.push(message)),
      get messages() { return actualChatMessages; },
    };
    InMemoryChatMessageHistory.mockImplementation(() => {
      actualChatMessages = []; // Reset for each test
      return mockInMemoryChatMessageHistoryInstance;
    });

    mockBufferMemoryInstance = {
      chatHistory: mockInMemoryChatMessageHistoryInstance,
      returnMessages: true,
      memoryKey: 'history',
    };
    BufferMemory.mockImplementation(() => mockBufferMemoryInstance);

    mockConversationChainInstance = {
      invoke: vi.fn().mockResolvedValue({ response: aiReply, usage: { total_time: totalTime } }),
    };
    ConversationChain.mockImplementation(() => mockConversationChainInstance);

    ChatGoogleGenerativeAI.mockImplementation(() => ({
      model: 'gemini-3.5-flash',
      temperature: 0.7,
      apiKey: 'mock_gemini_key',
    }));

    AIMessage.mockImplementation(content => ({ type: 'ai', content }));
    HumanMessage.mockImplementation(content => ({ type: 'human', content }));

    // Default successful mocks for other dependencies
    ChatHistory.findOne.mockResolvedValue(null); // Default to no existing session
    ChatHistory.findOneAndUpdate.mockResolvedValue({
      _id: 'newChatSessionId',
      user: userId,
      sessionId,
      responses: [{ prompt, reply: aiReply, model: 'gemini-3.5-flash-thinking', total_time: totalTime }],
    });
    UserModel.findByIdAndUpdate.mockResolvedValue({});
    paymentController.incrementPromptsUsed.mockResolvedValue({ success: true, message: 'Usage updated' });
    RedisClient.publish.mockResolvedValue(1);
    logger.info.mockClear();
    logger.error.mockClear();
    ApiError.mockImplementation((status, message) => {
      const error = new Error(message);
      error.status = status;
      return error;
    });
  });

  describe('QwenAiGetResponseService', () => {
    it('should handle a new session successfully and return the AI response', async () => {
      const result = await QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId);

      expect(ChatHistory.findOne).toHaveBeenCalledWith({ user: userId, sessionId });
      expect(InMemoryChatMessageHistory).toHaveBeenCalledTimes(1);
      expect(BufferMemory).toHaveBeenCalledWith({
        returnMessages: true,
        memoryKey: 'history',
        chatHistory: mockInMemoryChatMessageHistoryInstance,
      });
      expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith({
        model: 'gemini-3.5-flash',
        temperature: 0.7,
        apiKey: 'mock_gemini_key',
      });
      expect(ConversationChain).toHaveBeenCalledWith({
        llm: expect.any(Object), // ChatGoogleGenerativeAI instance
        memory: mockBufferMemoryInstance,
      });
      expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(new HumanMessage(prompt));
      expect(mockConversationChainInstance.invoke).toHaveBeenCalledWith({ input: prompt });
      expect(paymentController.incrementPromptsUsed).toHaveBeenCalledWith(userId);
      expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(new AIMessage(aiReply));
      expect(ChatHistory.findOneAndUpdate).toHaveBeenCalledWith(
        { user: userId, sessionId },
        {
          $push: {
            responses: {
              prompt,
              model: 'gemini-3.5-flash-thinking',
              reply: aiReply,
              total_time: totalTime,
            },
          },
        },
        { new: true, upsert: true }
      );
      expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(userId, {
        $addToSet: { llamaAiSessions: 'newChatSessionId' },
      });
      expect(RedisClient.publish).toHaveBeenCalledWith(
        QWEN_RESPONSE_SERVICE_POST,
        JSON.stringify({ sessionId, prompt, reply: aiReply })
      );
      expect(result).toEqual({ sessionId, prompt, reply: aiReply });
      expect(logger.info).toHaveBeenCalledWith('Memory Initialized with history:', 0, 'messages');
      expect(logger.info).toHaveBeenCalledWith('Model Response:', { response: aiReply, usage: { total_time: totalTime } });
      expect(logger.info).toHaveBeenCalledWith('Chat Session Updated or Created:', 'newChatSessionId');
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should handle an existing session with history successfully', async () => {
      const existingResponses = [
        { prompt: 'Old prompt 1', reply: 'Old reply 1' },
        { prompt: 'Old prompt 2', reply: 'Old reply 2' },
      ];
      ChatHistory.findOne.mockResolvedValue({
        _id: 'existingChatSessionId',
        user: userId,
        sessionId,
        responses: existingResponses,
      });
      ChatHistory.findOneAndUpdate.mockResolvedValue({
        _id: 'existingChatSessionId',
        user: userId,
        sessionId,
        responses: [...existingResponses, { prompt, reply: aiReply, model: 'gemini-3.5-flash-thinking', total_time: totalTime }],
      });
      UserModel.findByIdAndUpdate.mockClear(); // Ensure it's not called

      const result = await QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId);

      expect(ChatHistory.findOne).toHaveBeenCalledWith({ user: userId, sessionId });
      expect(InMemoryChatMessageHistory).toHaveBeenCalledTimes(1);
      expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(new HumanMessage('Old prompt 1'));
      expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(new AIMessage('Old reply 1'));
      expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(new HumanMessage('Old prompt 2'));
      expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(new AIMessage('Old reply 2'));
      expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(new HumanMessage(prompt));
      expect(mockInMemoryChatMessageHistoryInstance.addMessage).toHaveBeenCalledWith(new AIMessage(aiReply));
      expect(UserModel.findByIdAndUpdate).not.toHaveBeenCalled(); // Should not be called for existing session
      expect(result).toEqual({ sessionId, prompt, reply: aiReply });
      expect(logger.info).toHaveBeenCalledWith('Memory Initialized with history:', 4, 'messages'); // 2 human + 2 ai
    });

    it('should throw ApiError if ConversationChain.invoke fails', async () => {
      const error = new Error('LLM failed');
      mockConversationChainInstance.invoke.mockRejectedValue(error);

      await expect(QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId)).rejects.toThrow(ApiError);
      await expect(QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId)).rejects.toHaveProperty('status', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error in _getAiResponseService:', error);
    });

    it('should throw ApiError if paymentController.incrementPromptsUsed returns success: false', async () => {
      paymentController.incrementPromptsUsed.mockResolvedValue({ success: false, message: 'Payment failed' });

      await expect(QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId)).rejects.toThrow(ApiError);
      await expect(QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId)).rejects.toHaveProperty('status', httpStatus.BAD_REQUEST);
      expect(logger.error).toHaveBeenCalledWith('Error in incrementPromptsUsed:', { success: false, message: 'Payment failed' });
    });

    it('should throw ApiError if paymentController.incrementPromptsUsed throws an error', async () => {
      const paymentError = new Error('DB error on payment');
      paymentController.incrementPromptsUsed.mockRejectedValue(paymentError);

      await expect(QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId)).rejects.toThrow(ApiError);
      await expect(QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId)).rejects.toHaveProperty('status', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error in incrementPromptsUsed:', paymentError);
    });

    it('should throw ApiError if ChatHistory.findOneAndUpdate fails to return an updated session', async () => {
      ChatHistory.findOneAndUpdate.mockResolvedValue(null); // Simulate failure to update/create

      await expect(QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId)).rejects.toThrow(ApiError);
      await expect(QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId)).rejects.toHaveProperty('status', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Failed to update or create chat session.');
    });

    it('should throw ApiError if UserModel.findByIdAndUpdate fails for a new session', async () => {
      const userModelError = new Error('User update failed');
      UserModel.findByIdAndUpdate.mockRejectedValue(userModelError);

      await expect(QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId)).rejects.toThrow(ApiError);
      await expect(QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId)).rejects.toHaveProperty('status', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error in _getAiResponseService:', userModelError);
    });

    it('should throw ApiError for a general unexpected error', async () => {
      ChatHistory.findOne.mockRejectedValue(new Error('DB connection lost'));

      await expect(QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId)).rejects.toThrow(ApiError);
      await expect(QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId)).rejects.toHaveProperty('status', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error in _getAiResponseService:', expect.any(Error));
    });

    it('should publish to Redis with the correct channel on success', async () => {
      await QwenAiServices.QwenAiGetResponseService(prompt, userId, sessionId);
      expect(RedisClient.publish).toHaveBeenCalledWith(
        QWEN_RESPONSE_SERVICE_POST,
        JSON.stringify({ sessionId, prompt, reply: aiReply })
      );
    });
  });

  describe('QwenQWQAiGetResponseService', () => {
    it('should call the underlying service with the correct QWQ Redis channel', async () => {
      const result = await QwenAiServices.QwenQWQAiGetResponseService(prompt, userId, sessionId);

      expect(RedisClient.publish).toHaveBeenCalledWith(
        QWEN_QWQ_RESPONSE_SERVICE_POST,
        JSON.stringify({ sessionId, prompt, reply: aiReply })
      );
      expect(result).toEqual({ sessionId, prompt, reply: aiReply });
    });
  });
});