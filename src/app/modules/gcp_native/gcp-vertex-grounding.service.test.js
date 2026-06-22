import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js'; // Assuming ApiError is a class

const {
  mockGenerateContent,
  mockAddMessage,
  mockGoogleGenAI,
  mockInMemoryChatMessageHistory,
  mockBufferMemory,
  mockLoggerInfo,
  mockLoggerError,
  mockFindByIdAndUpdate,
  mockUpdateOne,
  mockFindOneAndUpdate,
  mockIncrementPromptsUsed,
  mockPublish,
  mockCombinedRouteAndEnhancePrompt
} = vi.hoisted(() => {
  const mockGenerateContent = vi.fn();
  const mockAddMessage = vi.fn();

  const mockGoogleGenAI = vi.fn().mockImplementation(function() {
    this.models = {
      generateContent: mockGenerateContent,
    };
  });

  const mockInMemoryChatMessageHistory = vi.fn().mockImplementation(function() {
    this.addMessage = mockAddMessage;
    this.getMessages = vi.fn().mockImplementation(() => []);
  });

  const mockBufferMemory = vi.fn().mockImplementation(function(opts) {
    this.chatHistory = opts?.chatHistory;
  });

  const mockLoggerInfo = vi.fn();
  const mockLoggerError = vi.fn();
  const mockFindByIdAndUpdate = vi.fn();
  const mockUpdateOne = vi.fn();
  const mockFindOneAndUpdate = vi.fn();
  const mockIncrementPromptsUsed = vi.fn();
  const mockPublish = vi.fn();
  const mockCombinedRouteAndEnhancePrompt = vi.fn();

  return {
    mockGenerateContent,
    mockAddMessage,
    mockGoogleGenAI,
    mockInMemoryChatMessageHistory,
    mockBufferMemory,
    mockLoggerInfo,
    mockLoggerError,
    mockFindByIdAndUpdate,
    mockUpdateOne,
    mockFindOneAndUpdate,
    mockIncrementPromptsUsed,
    mockPublish,
    mockCombinedRouteAndEnhancePrompt
  };
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: mockGoogleGenAI,
}));

vi.mock('@langchain/core/chat_history', () => ({
  InMemoryChatMessageHistory: mockInMemoryChatMessageHistory,
}));

vi.mock('@langchain/core/messages', () => ({
  AIMessage: vi.fn().mockImplementation(function(msg) {
    return { type: 'ai', content: msg };
  }),
  HumanMessage: vi.fn().mockImplementation(function(msg) {
    return { type: 'human', content: msg };
  }),
}));

vi.mock('langchain/memory', () => ({
  BufferMemory: mockBufferMemory,
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-gemini-key',
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
  },
}));

vi.mock('../auth/auth.model.js', () => ({
  default: {
    findByIdAndUpdate: mockFindByIdAndUpdate,
    updateOne: mockUpdateOne,
  },
}));

vi.mock('../conversations/chatHistory.model.js', () => ({
  default: {
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}));

vi.mock('../payment/payment.controller.js', () => ({
  paymentController: {
    incrementPromptsUsed: mockIncrementPromptsUsed,
  },
}));

vi.mock('../../../shared/redis.js', () => ({
  RedisClient: {
    publish: mockPublish,
  },
}));

vi.mock('../../helpers/UnifiedSmartRouter.js', () => ({
  UnifiedSmartRouter: {
    combinedRouteAndEnhancePrompt: mockCombinedRouteAndEnhancePrompt,
  },
}));

// Import the service after all mocks are set up
let GcpVertexGroundingService;

describe('GcpVertexGroundingService', () => {
  const sessionId = 'test-session-id';
  const userId = 'test-user-id';
  const prompt = 'Hello, Gemini!';
  const enhancedPrompt = 'Enhanced: Hello, Gemini!';
  const aiReply = 'Hello there! How can I help you today?';
  const mockGroundingMetadata = {
    webSearchQueries: [{ text: 'test query' }],
    groundingChunks: [{ title: 'Test Ref', uri: 'http://test.com' }],
    searchEntryPoint: 'Test Search Entry',
  };
  const mockGeminiResponse = {
    candidates: [
      {
        content: {
          parts: [
            { text: aiReply },
            { thought: 'thinking...' } // Should be filtered out
          ],
        },
        groundingMetadata: {
          webSearchQueries: [{ text: 'test query' }],
          groundingChunks: [{ web: { title: 'Test Ref', uri: 'http://test.com' } }],
          searchEntryPoint: { renderedContent: 'Test Search Entry' },
        },
      },
    ],
    usageMetadata: {
      candidatesTokenCount: 50,
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers(); // Use fake timers to control setInterval and Date.now()
    vi.setSystemTime(1000); // Fixed starting time
    vi.resetModules();
    const module = await import('./gcp-vertex-grounding.service.js');
    GcpVertexGroundingService = module.GcpVertexGroundingService;

    mockBufferMemory.mockClear();
    mockInMemoryChatMessageHistory.mockClear();

    mockCombinedRouteAndEnhancePrompt.mockResolvedValue(enhancedPrompt);
    mockGenerateContent.mockResolvedValue(mockGeminiResponse);
    mockIncrementPromptsUsed.mockResolvedValue({ success: true });
    mockFindOneAndUpdate.mockResolvedValue({ _id: 'new-chat-history-id', user: userId, sessionId, responses: [] });
    mockUpdateOne.mockResolvedValue({});
    mockPublish.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers(); // Restore real timers after each test
  });

  describe('groundedPromptResponse', () => {
    it('should initialize new memory for a new session and process the prompt', async () => {
      const initialTime = Date.now();
      vi.setSystemTime(initialTime);

      const result = await GcpVertexGroundingService.groundedPromptResponse(sessionId, prompt, userId);

      expect(mockBufferMemory).toHaveBeenCalledTimes(1);
      expect(mockInMemoryChatMessageHistory).toHaveBeenCalledTimes(1);
      expect(mockCombinedRouteAndEnhancePrompt).toHaveBeenCalledWith(prompt);
      expect(mockAddMessage).toHaveBeenCalledWith({ type: 'human', content: prompt });
      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-pro',
        contents: enhancedPrompt,
        config: {
          temperature: 0.1,
          tools: [{ googleSearch: {} }],
        },
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Sending prompt with live Google Search Grounding'));
      expect(mockIncrementPromptsUsed).toHaveBeenCalledWith(userId);
      expect(mockAddMessage).toHaveBeenCalledWith({ type: 'ai', content: aiReply });
      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        { user: userId, sessionId },
        {
          $push: {
            responses: {
              prompt,
              model: 'gemini-2.5-pro-grounded',
              reply: aiReply,
              groundingMetadata: mockGroundingMetadata,
              output_tokens: 50,
            },
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true, lean: true }
      );
      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: userId },
        { $addToSet: { geminiAiSessions: 'new-chat-history-id' } }
      );
      expect(mockPublish).toHaveBeenCalledWith(
        'GEMINI_RESPONSE_SERVICE_POST',
        JSON.stringify({ prompt, sessionId, reply: aiReply, groundingMetadata: mockGroundingMetadata })
      );
      expect(result).toEqual({ prompt, sessionId, reply: aiReply, groundingMetadata: mockGroundingMetadata });
    });

    it('should reuse existing memory for an ongoing session and update lastAccessed', async () => {
      const initialTime = Date.now();
      vi.setSystemTime(initialTime);

      // First call to create the session memory
      await GcpVertexGroundingService.groundedPromptResponse(sessionId, prompt, userId);
      expect(mockBufferMemory).toHaveBeenCalledTimes(1);
      expect(mockInMemoryChatMessageHistory).toHaveBeenCalledTimes(1);
      mockBufferMemory.mockClear(); // Clear mock to check if it's called again
      mockInMemoryChatMessageHistory.mockClear();

      // Advance time by a small amount
      vi.setSystemTime(initialTime + 10000); // 10 seconds later

      // Second call for the same session
      await GcpVertexGroundingService.groundedPromptResponse(sessionId, 'Another prompt', userId);

      // Memory should NOT be re-initialized
      expect(mockBufferMemory).not.toHaveBeenCalled();
      expect(mockInMemoryChatMessageHistory).not.toHaveBeenCalled();
      expect(mockAddMessage).toHaveBeenCalledTimes(4); // 2 human, 2 AI messages across two calls
    });

    it('should handle empty groundingMetadata from Gemini response gracefully', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: { parts: [{ text: aiReply }] },
            // No groundingMetadata field
          },
        ],
        usageMetadata: { candidatesTokenCount: 30 },
      });

      const result = await GcpVertexGroundingService.groundedPromptResponse(sessionId, prompt, userId);

      expect(result.groundingMetadata).toEqual({
        webSearchQueries: [],
        groundingChunks: [],
        searchEntryPoint: '',
      });
      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $push: {
            responses: expect.objectContaining({
              groundingMetadata: {
                webSearchQueries: [],
                groundingChunks: [],
                searchEntryPoint: '',
              },
            }),
          },
        }),
        expect.any(Object)
      );
    });

    it('should throw ApiError if prompt enhancement fails', async () => {
      const error = new Error('Enhancement failed');
      mockCombinedRouteAndEnhancePrompt.mockRejectedValue(error);

      await expect(GcpVertexGroundingService.groundedPromptResponse(sessionId, prompt, userId)).rejects.toThrow(
        new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `GCP Grounding Service failed: ${error.message}`)
      );
      expect(mockLoggerError).toHaveBeenCalledWith('GCP Vertex Grounding Service Error:', error);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should throw ApiError if Gemini API call fails', async () => {
      const error = new Error('Gemini API error');
      mockGenerateContent.mockRejectedValue(error);

      await expect(GcpVertexGroundingService.groundedPromptResponse(sessionId, prompt, userId)).rejects.toThrow(
        new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `GCP Grounding Service failed: ${error.message}`)
      );
      expect(mockLoggerError).toHaveBeenCalledWith('GCP Vertex Grounding Service Error:', error);
      expect(mockIncrementPromptsUsed).not.toHaveBeenCalled();
    });

    it('should throw ApiError if incrementing prompts usage fails', async () => {
      mockIncrementPromptsUsed.mockResolvedValue({ success: false, message: 'Payment failed' });

      await expect(GcpVertexGroundingService.groundedPromptResponse(sessionId, prompt, userId)).rejects.toThrow(
        new ApiError(httpStatus.BAD_REQUEST, 'Payment failed')
      );
      expect(mockLoggerError).toHaveBeenCalledWith('Error incrementing prompts usage in grounding service:', expect.any(Error));
      expect(mockFindOneAndUpdate).not.toHaveBeenCalled(); // Should not save chat history if payment fails
    });

    it('should throw ApiError if incrementing prompts usage throws an error', async () => {
      const error = new Error('DB error on payment');
      mockIncrementPromptsUsed.mockRejectedValue(error);

      await expect(GcpVertexGroundingService.groundedPromptResponse(sessionId, prompt, userId)).rejects.toThrow(
        new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An error occurred while updating prompt usage.')
      );
      expect(mockLoggerError).toHaveBeenCalledWith('Error incrementing prompts usage in grounding service:', error);
      expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should throw ApiError if saving chat history fails', async () => {
      const error = new Error('Chat history save failed');
      mockFindOneAndUpdate.mockRejectedValue(error);

      await expect(GcpVertexGroundingService.groundedPromptResponse(sessionId, prompt, userId)).rejects.toThrow(
        new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `GCP Grounding Service failed: ${error.message}`)
      );
      expect(mockLoggerError).toHaveBeenCalledWith('GCP Vertex Grounding Service Error:', error);
      expect(mockUpdateOne).not.toHaveBeenCalled();
    });

    it('should throw ApiError if updating user sessions fails', async () => {
      const error = new Error('User update failed');
      mockUpdateOne.mockRejectedValue(error);

      await expect(GcpVertexGroundingService.groundedPromptResponse(sessionId, prompt, userId)).rejects.toThrow(
        new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `GCP Grounding Service failed: ${error.message}`)
      );
      expect(mockLoggerError).toHaveBeenCalledWith('GCP Vertex Grounding Service Error:', error);
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('should return "No reply generated" if Gemini response has no content', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{ content: { parts: [] } }], // No parts with text
        usageMetadata: { candidatesTokenCount: 0 },
      });

      const result = await GcpVertexGroundingService.groundedPromptResponse(sessionId, prompt, userId);

      expect(result.reply).toBe('No reply generated');
      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $push: {
            responses: expect.objectContaining({
              reply: 'No reply generated',
            }),
          },
        }),
        expect.any(Object)
      );
    });

    it('should handle Gemini response with no candidates', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [], // No candidates
        usageMetadata: { candidatesTokenCount: 0 },
      });

      const result = await GcpVertexGroundingService.groundedPromptResponse(sessionId, prompt, userId);

      expect(result.reply).toBe('No reply generated');
      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $push: {
            responses: expect.objectContaining({
              reply: 'No reply generated',
            }),
          },
        }),
        expect.any(Object)
      );
    });

    it('should publish to Redis even if RedisClient.publish throws an error (but still throw ApiError)', async () => {
      const redisError = new Error('Redis publish failed');
      mockPublish.mockRejectedValue(redisError);

      await expect(GcpVertexGroundingService.groundedPromptResponse(sessionId, prompt, userId)).rejects.toThrow(
        new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `GCP Grounding Service failed: ${redisError.message}`)
      );
      expect(mockLoggerError).toHaveBeenCalledWith('GCP Vertex Grounding Service Error:', redisError);
      expect(mockPublish).toHaveBeenCalledWith(
        'GEMINI_RESPONSE_SERVICE_POST',
        JSON.stringify({ prompt, sessionId, reply: aiReply, groundingMetadata: mockGroundingMetadata })
      );
    });
  });

  // Testing cleanupMemoryStore indirectly by observing memory behavior
  describe('Memory Cleanup', () => {
    it('should clean up expired sessions after the cleanup interval', async () => {
      const SESSION_TTL_MINUTES = 30;
      const CLEANUP_INTERVAL_MINUTES = 10;
      
      mockLoggerInfo.mockClear();
      
      // Create a session
      await GcpVertexGroundingService.groundedPromptResponse('session-to-expire', 'initial prompt', userId);
      expect(mockBufferMemory).toHaveBeenCalledTimes(1);
      mockBufferMemory.mockClear();

      // Advance time past TTL + cleanup interval using advanceTimersByTime
      const timeToAdvance = (SESSION_TTL_MINUTES + CLEANUP_INTERVAL_MINUTES + 1) * 60 * 1000;
      vi.advanceTimersByTime(timeToAdvance);

      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Cleaning up expired session memory for sessionId: session-to-expire'));

      // Now, call groundedPromptResponse for the same session ID. It should create a *new* memory.
      await GcpVertexGroundingService.groundedPromptResponse('session-to-expire', 'subsequent prompt', userId);
      expect(mockBufferMemory).toHaveBeenCalledTimes(1); // Should be called again, indicating new memory was created
    });
  });
});