import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { GeminiAiController } from './tavily.controller.js';
import ApiError from '../../../errors/ApiError.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';
import sendResponse from '../../../shared/sendResponse.js';
import generateSessionId from '../../../shared/sessionGenerate.js';
import { GoogleGenAI } from '@google/genai';

// --- Mocks ---

// Mock @google/genai
const mockSendMessage = vi.fn();
const mockStartChat = vi.fn(() => ({ sendMessage: mockSendMessage }));
const mockGetGenerativeModel = vi.fn(() => ({
  startChat: mockStartChat,
  model: 'mock-gemini-model',
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

// Mock config
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-key',
    gemini_model_grounded: 'gemini-test-model',
  },
}));

// Mock shared utilities
vi.mock('../../../shared/catchAsync.js', () => ({
  default: vi.fn(fn => fn), // Pass-through mock
}));
vi.mock('../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));
vi.mock('../../../shared/sessionGenerate.js', () => ({
  default: vi.fn(() => 'new-mock-session-id'),
}));

// Mock Mongoose Models
const mockUserFindById = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn(),
};
vi.mock('../auth/auth.model.js', () => ({
  default: {
    findById: vi.fn(() => mockUserFindById),
    findByIdAndUpdate: vi.fn().mockResolvedValue(true),
  },
}));

const mockChatHistoryFindOne = {
  lean: vi.fn(),
};
vi.mock('../conversations/chatHistory.model.js', () => ({
  default: {
    findOne: vi.fn(() => mockChatHistoryFindOne),
    findOneAndUpdate: vi.fn(),
  },
}));

// --- Tests ---

describe('GeminiAiController', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      user: { id: 'user-123' },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    // Default mock implementations for a successful flow
    mockUserFindById.lean.mockResolvedValue({
      _id: 'user-123',
      limits: { dailyPrompts: 100 },
      usage: { promptsToday: 10 },
    });
    mockChatHistoryFindOne.lean.mockResolvedValue(null);
    ChatHistory.findOneAndUpdate.mockResolvedValue({ _id: 'chat-session-abc' });
    mockSendMessage.mockResolvedValue({
      response: {
        text: () => 'This is a mock AI reply.',
        usageMetadata: { totalTokenCount: 42 },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GeminiAiGetResponse', () => {
    it('should successfully get a response for a new session', async () => {
      req.body = { prompt: 'What is Vitest?' };

      await GeminiAiController.GeminiAiGetResponse(req, res);

      expect(generateSessionId).toHaveBeenCalledWith(24);
      expect(ChatHistory.findOne).toHaveBeenCalledWith({
        user: 'user-123',
        sessionId: 'new-mock-session-id',
      });
      expect(mockStartChat).toHaveBeenCalledWith({
        history: [],
        generationConfig: { temperature: 0.2 },
      });
      expect(mockSendMessage).toHaveBeenCalledWith('What is Vitest?');
      expect(ChatHistory.findOneAndUpdate).toHaveBeenCalledWith(
        { user: 'user-123', sessionId: 'new-mock-session-id' },
        expect.any(Object),
        { new: true, upsert: true, runValidators: true }
      );
      expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith('user-123', {
        $inc: {
          'usage.promptsToday': 1,
          'usage.promptsTotal': 1,
          'usage.tokensThisMonth': 42,
          'usage.tokensTotal': 42,
        },
        $addToSet: { aiSessions: 'chat-session-abc' },
      });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: {
          sessionId: 'new-mock-session-id',
          reply: 'This is a mock AI reply.',
        },
      });
    });

    it('should successfully get a response for an existing session and pass history', async () => {
      req.body = { prompt: 'And how do I use it?', sessionId: 'existing-session-123' };
      const existingHistory = {
        responses: [
          { prompt: 'What is Vitest?', reply: 'A testing framework.' },
          { prompt: 'Is it fast?', reply: 'Yes, very fast.' },
        ],
      };
      mockChatHistoryFindOne.lean.mockResolvedValue(existingHistory);

      await GeminiAiController.GeminiAiGetResponse(req, res);

      expect(generateSessionId).not.toHaveBeenCalled();
      expect(ChatHistory.findOne).toHaveBeenCalledWith({
        user: 'user-123',
        sessionId: 'existing-session-123',
      });
      expect(mockStartChat).toHaveBeenCalledWith({
        history: [
          { role: 'user', parts: [{ text: 'What is Vitest?' }] },
          { role: 'model', parts: [{ text: 'A testing framework.' }] },
          { role: 'user', parts: [{ text: 'Is it fast?' }] },
          { role: 'model', parts: [{ text: 'Yes, very fast.' }] },
        ],
        generationConfig: { temperature: 0.2 },
      });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: {
          sessionId: 'existing-session-123',
          reply: 'This is a mock AI reply.',
        },
      });
    });

    it('should throw 401 Unauthorized if user ID is missing', async () => {
      req.user = null;
      req.body = { prompt: 'test' };

      await expect(GeminiAiController.GeminiAiGetResponse(req, res)).rejects.toThrow(
        new ApiError(httpStatus.UNAUTHORIZED, 'Unauthorized: User ID is missing.')
      );
    });

    it('should throw 400 Bad Request if prompt is missing', async () => {
      req.body = {};

      await expect(GeminiAiController.GeminiAiGetResponse(req, res)).rejects.toThrow(
        new ApiError(httpStatus.BAD_REQUEST, 'Prompt is required.')
      );
    });

    it('should throw 404 Not Found if user does not exist', async () => {
      req.body = { prompt: 'test' };
      mockUserFindById.lean.mockResolvedValue(null);

      await expect(GeminiAiController.GeminiAiGetResponse(req, res)).rejects.toThrow(
        new ApiError(httpStatus.NOT_FOUND, 'User not found.')
      );
    });

    it('should throw 403 Forbidden if user has exceeded their daily prompt limit', async () => {
      req.body = { prompt: 'test' };
      mockUserFindById.lean.mockResolvedValue({
        _id: 'user-123',
        limits: { dailyPrompts: 50 },
        usage: { promptsToday: 50 }, // Limit is met
      });

      await expect(GeminiAiController.GeminiAiGetResponse(req, res)).rejects.toThrow(
        new ApiError(httpStatus.FORBIDDEN, 'You have exceeded your daily prompt limit.')
      );
    });

    it('should throw 500 Internal Server Error if AI fails to generate a reply', async () => {
      req.body = { prompt: 'test' };
      mockSendMessage.mockResolvedValue({
        response: {
          text: () => null, // AI returns no text
          usageMetadata: { totalTokenCount: 0 },
        },
      });

      await expect(GeminiAiController.GeminiAiGetResponse(req, res)).rejects.toThrow(
        new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI model failed to generate a reply.')
      );
    });

    it('should ensure all database queries are scoped to the authenticated user (context boundary check)', async () => {
      const specificUserId = 'user-context-check-456';
      req.user.id = specificUserId;
      req.body = { prompt: 'test', sessionId: 'session-context-check' };

      await GeminiAiController.GeminiAiGetResponse(req, res);

      // Check user lookup
      expect(UserModel.findById).toHaveBeenCalledWith(specificUserId);

      // Check chat history lookup
      expect(ChatHistory.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ user: specificUserId })
      );

      // Check chat history update/insert
      expect(ChatHistory.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ user: specificUserId }),
        expect.any(Object),
        expect.any(Object)
      );

      // Check user usage update
      expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(specificUserId, expect.any(Object));
    });
  });
});