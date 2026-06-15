import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { LlamaAiService } from './groq.service.js';
import { GeminiAiService } from '../gemini/gemini.service.js';
import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';
import { fetchSearchResults } from './groq.utilities.js';
import { massiveSmartRouter } from '../../helpers/massiveSmartRouter.js';
import ApiError from '../../../errors/ApiError.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import config from '../../../../config/index.js';

// Mock external dependencies
vi.mock('../gemini/gemini.service.js');
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../auth/auth.model.js');
vi.mock('../conversations/chatHistory.model.js');
vi.mock('./groq.utilities.js');
vi.mock('../../helpers/massiveSmartRouter.js');
vi.mock('../../../errors/ApiError.js');
vi.mock('@google/generative-ai');
vi.mock('crypto', () => ({
  randomUUID: vi.fn(),
}));
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-gemini-key',
  },
}));
vi.mock('mongoose');

describe('LlamaAiService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAiResponsesGroqService', () => {
    it('should redirect the request to GeminiAiService.geminiService', async () => {
      const prompt = 'Hello, world!';
      const userId = 'user123';
      const sessionId = 'session456';
      const expectedResponse = { reply: 'Hello from Gemini!' };

      GeminiAiService.geminiService.mockResolvedValue(expectedResponse);

      const result = await LlamaAiService.getAiResponsesGroqService(prompt, userId, sessionId);

      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Redirecting Groq completions Request to Google Gemini 3.1 Flash exclusively.',
        sessionId,
        userId,
      }));
      expect(GeminiAiService.geminiService).toHaveBeenCalledWith(sessionId, prompt, userId);
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('GroqAiGetResponseAnonymousService', () => {
    const mockGenerateContent = vi.fn();
    const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
      generateContent: mockGenerateContent,
    }));

    beforeEach(() => {
      GoogleGenerativeAI.mockImplementation(() => ({
        getGenerativeModel: mockGetGenerativeModel,
      }));
      randomUUID.mockReturnValue('new-session-uuid');
      massiveSmartRouter.combinedRouteAndEnhancePrompt.mockImplementation(p => Promise.resolve(p));
      fetchSearchResults.mockResolvedValue([]);
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: {
              parts: [{
                text: 'AI reply'
              }]
            }
          }]
        }
      });
    });

    it('should throw an ApiError if prompt is missing', async () => {
      await expect(LlamaAiService.GroqAiGetResponseAnonymousService(null, 'session123')).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(httpStatus.BAD_REQUEST, 'Prompt is required.');
    });

    it('should create a new session if sessionId is not provided', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      ChatHistory.findOne.mockResolvedValue(null);
      ChatHistory.create.mockResolvedValue({
        sessionId: 'new-session-uuid',
        messages: [],
        save: mockSave,
      });

      const result = await LlamaAiService.GroqAiGetResponseAnonymousService('test prompt');

      expect(randomUUID).toHaveBeenCalled();
      expect(ChatHistory.findOne).toHaveBeenCalledWith({ sessionId: 'new-session-uuid' });
      expect(ChatHistory.create).toHaveBeenCalledWith({ sessionId: 'new-session-uuid', messages: [] });
      expect(result.sessionId).toBe('new-session-uuid');
      expect(result.reply).toBe('AI reply');
      expect(mockSave).toHaveBeenCalled();
    });

    it('should use an existing session if sessionId is provided', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      const existingMessages = [{
        type: 'human',
        content: 'old prompt'
      }, {
        type: 'ai',
        content: 'old reply'
      }, ];
      ChatHistory.findOne.mockResolvedValue({
        sessionId: 'existing-session',
        messages: existingMessages,
        save: mockSave,
      });

      const result = await LlamaAiService.GroqAiGetResponseAnonymousService('new prompt', 'existing-session');

      expect(ChatHistory.findOne).toHaveBeenCalledWith({ sessionId: 'existing-session' });
      expect(ChatHistory.create).not.toHaveBeenCalled();
      expect(result.sessionId).toBe('existing-session');
      expect(mockSave).toHaveBeenCalled();
      const enrichedPrompt = mockGenerateContent.mock.calls[0][0];
      expect(enrichedPrompt).toContain('Previous Conversation:');
      expect(enrichedPrompt).toContain('HUMAN: old prompt');
      expect(enrichedPrompt).toContain('AI: old reply');
    });

    it('should handle memory limit by slicing older messages', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      const longHistory = Array.from({ length: 20 }, (_, i) => ({
        type: i % 2 === 0 ? 'human' : 'ai',
        content: `message ${i}`,
      }));
      ChatHistory.findOne.mockResolvedValue({
        sessionId: 'long-history-session',
        messages: longHistory,
        save: mockSave,
      });

      await LlamaAiService.GroqAiGetResponseAnonymousService('new prompt', 'long-history-session');

      const enrichedPrompt = mockGenerateContent.mock.calls[0][0];
      // MAX_MEMORY_SIZE is 12. The prompt should contain the last 12 messages.
      expect(enrichedPrompt).toContain('message 8'); // First message of the sliced history
      expect(enrichedPrompt).not.toContain('message 7'); // Should be sliced off
    });

    it('should include search results in the prompt and response', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      const searchResults = [{
        title: 'Result 1',
        link: 'http://example.com/1'
      }, {
        title: 'Result 2',
        link: 'http://example.com/2'
      }, ];
      fetchSearchResults.mockResolvedValue(searchResults);
      ChatHistory.findOne.mockResolvedValue({
        sessionId: 'search-session',
        messages: [],
        save: mockSave,
      });

      const result = await LlamaAiService.GroqAiGetResponseAnonymousService('search prompt', 'search-session');

      const enrichedPrompt = mockGenerateContent.mock.calls[0][0];
      expect(enrichedPrompt).toContain('[SYSTEM INSTRUCTION - ACTIVE ELITE WEB SEARCH]');
      expect(enrichedPrompt).toContain('Real-Time Search Info:');
      expect(enrichedPrompt).toContain('1. Result 1: http://example.com/1');
      expect(enrichedPrompt).toContain('2. Result 2: http://example.com/2');
      expect(result.search_results).toEqual(searchResults);
    });

    it('should use a fallback reply if Gemini response is malformed', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      mockGenerateContent.mockResolvedValue({ response: {} }); // Malformed response
      ChatHistory.findOne.mockResolvedValue({
        sessionId: 'fallback-session',
        messages: [],
        save: mockSave,
      });

      const result = await LlamaAiService.GroqAiGetResponseAnonymousService('test prompt', 'fallback-session');

      expect(result.reply).toBe('No reply generated');
    });
  });

  describe('getAiResponsesByUserIdService', () => {
    it('should return session data for a valid user ID', async () => {
      const mockSessionData = {
        _id: 'user123',
        email: 'test@test.com',
        llamaAiSessions: [{
          _id: 'session_obj_1',
          sessionId: 'session1'
        }]
      };
      const leanMock = vi.fn().mockResolvedValue(mockSessionData);
      const populateMock = vi.fn().mockReturnValue({ lean: leanMock });
      const selectMock = vi.fn().mockReturnValue({ populate: populateMock });
      UserModel.findOne.mockReturnValue({ select: selectMock });

      const result = await LlamaAiService.getAiResponsesByUserIdService('user123');

      expect(UserModel.findOne).toHaveBeenCalledWith({ _id: 'user123' });
      expect(result).toEqual(mockSessionData);
    });

    it('should return a not found error if user does not exist', async () => {
      const leanMock = vi.fn().mockResolvedValue(null);
      const populateMock = vi.fn().mockReturnValue({ lean: leanMock });
      const selectMock = vi.fn().mockReturnValue({ populate: populateMock });
      UserModel.findOne.mockReturnValue({ select: selectMock });

      const result = await LlamaAiService.getAiResponsesByUserIdService('nonexistentuser');

      expect(result).toEqual({
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Session not found',
        reply: null,
      });
    });
  });

  describe('getAiResponsesBySession', () => {
    it('should return session data for a valid session ID', async () => {
      const mockSessionData = {
        _id: 'session_obj_1',
        sessionId: 'session123'
      };
      const leanMock = vi.fn().mockResolvedValue(mockSessionData);
      ChatHistory.findOne.mockReturnValue({ lean: leanMock });

      const result = await LlamaAiService.getAiResponsesBySession('session123');

      expect(ChatHistory.findOne).toHaveBeenCalledWith({ sessionId: 'session123' });
      expect(result).toEqual(mockSessionData);
    });

    it('should return a not found error if session does not exist', async () => {
      const leanMock = vi.fn().mockResolvedValue(null);
      ChatHistory.findOne.mockReturnValue({ lean: leanMock });

      const result = await LlamaAiService.getAiResponsesBySession('nonexistentsession');

      expect(result).toEqual({
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Session not found',
        response: null,
      });
    });
  });

  describe('deleteOneLlamaAiSession', () => {
    it('should successfully delete a session and update the user', async () => {
      const objectId = 'session_obj_1';
      const userId = 'user123';
      const leanMock = vi.fn().mockResolvedValue({ _id: objectId, user: userId });
      ChatHistory.findOne.mockReturnValue({ lean: leanMock });
      ChatHistory.deleteOne.mockResolvedValue({ deletedCount: 1 });
      UserModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await LlamaAiService.deleteOneLlamaAiSession(objectId);

      expect(ChatHistory.findOne).toHaveBeenCalledWith({ _id: objectId });
      expect(ChatHistory.deleteOne).toHaveBeenCalledWith({ _id: objectId });
      expect(UserModel.updateOne).toHaveBeenCalledWith({ _id: userId }, { $pull: { llamaAiSessions: objectId } });
      expect(result).toEqual({
        success: true,
        message: 'LlamaAiSession and user reference deleted successfully',
      });
    });

    it('should throw ApiError if session is not found', async () => {
      const leanMock = vi.fn().mockResolvedValue(null);
      ChatHistory.findOne.mockReturnValue({ lean: leanMock });

      await expect(LlamaAiService.deleteOneLlamaAiSession('nonexistent')).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(httpStatus.NOT_FOUND, 'LlamaAiSession not found');
    });

    it('should throw ApiError if deletion fails', async () => {
      const leanMock = vi.fn().mockResolvedValue({ _id: 'id', user: 'user' });
      ChatHistory.findOne.mockReturnValue({ lean: leanMock });
      ChatHistory.deleteOne.mockResolvedValue({ deletedCount: 0 });

      await expect(LlamaAiService.deleteOneLlamaAiSession('id')).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to delete the LlamaAiSession');
    });

    it('should throw ApiError if user update fails', async () => {
      const leanMock = vi.fn().mockResolvedValue({ _id: 'id', user: 'user' });
      ChatHistory.findOne.mockReturnValue({ lean: leanMock });
      ChatHistory.deleteOne.mockResolvedValue({ deletedCount: 1 });
      UserModel.updateOne.mockResolvedValue({ modifiedCount: 0 });

      await expect(LlamaAiService.deleteOneLlamaAiSession('id')).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update the user model');
    });
  });

  describe('deleteAllAiSessionsService', () => {
    const mockSession = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
    };

    beforeEach(() => {
      mongoose.startSession.mockResolvedValue(mockSession);
    });

    it('should delete all sessions for a user and update the user model', async () => {
      const userId = 'user123';
      const sessionIds = ['session_obj_1', 'session_obj_2'];
      const userWithSessions = {
        _id: userId,
        llamaAiSessions: sessionIds
      };

      const leanMock = vi.fn().mockResolvedValue(userWithSessions);
      const sessionChainMock = vi.fn().mockReturnValue({ lean: leanMock });
      UserModel.findById.mockReturnValue({ session: sessionChainMock });
      ChatHistory.deleteMany.mockReturnValue({ session: vi.fn().mockResolvedValue({ deletedCount: 2 }) });
      UserModel.updateOne.mockReturnValue({ session: vi.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 }) });

      const result = await LlamaAiService.deleteAllAiSessionsService(userId);

      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(UserModel.findById).toHaveBeenCalledWith(userId);
      expect(ChatHistory.deleteMany).toHaveBeenCalledWith({ _id: { $in: sessionIds } });
      expect(UserModel.updateOne).toHaveBeenCalledWith({ _id: userId }, { $pull: { llamaAiSessions: { $in: sessionIds } } });
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(result).toEqual({
        statusCode: httpStatus.OK,
        success: true,
        message: 'AI sessions and user references deleted successfully',
      });
    });

    it('should handle users with no sessions gracefully', async () => {
      const userId = 'user456';
      const userWithNoSessions = {
        _id: userId,
        llamaAiSessions: []
      };

      const leanMock = vi.fn().mockResolvedValue(userWithNoSessions);
      const sessionChainMock = vi.fn().mockReturnValue({ lean: leanMock });
      UserModel.findById.mockReturnValue({ session: sessionChainMock });
      // updateOne will have modifiedCount: 0, but it's a success case
      UserModel.updateOne.mockReturnValue({ session: vi.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 0 }) });

      const result = await LlamaAiService.deleteAllAiSessionsService(userId);

      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(result).toEqual({
        statusCode: httpStatus.OK,
        success: true,
        message: 'No AI sessions to delete or user references to update.',
      });
    });

    it('should return an error and abort transaction if user is not found', async () => {
      const leanMock = vi.fn().mockResolvedValue(null);
      const sessionChainMock = vi.fn().mockReturnValue({ lean: leanMock });
      UserModel.findById.mockReturnValue({ session: sessionChainMock });

      const result = await LlamaAiService.deleteAllAiSessionsService('nonexistentuser');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      expect(result.message).toBe('An internal server error occurred');
    });

    it('should return an error and abort transaction if ChatHistory.deleteMany fails', async () => {
      const userId = 'user123';
      const sessionIds = ['session_obj_1', 'session_obj_2'];
      const userWithSessions = {
        _id: userId,
        llamaAiSessions: sessionIds
      };

      const leanMock = vi.fn().mockResolvedValue(userWithSessions);
      const sessionChainMock = vi.fn().mockReturnValue({ lean: leanMock });
      UserModel.findById.mockReturnValue({ session: sessionChainMock });
      // Simulate deleting fewer documents than expected
      ChatHistory.deleteMany.mockReturnValue({ session: vi.fn().mockResolvedValue({ deletedCount: 1 }) });

      const result = await LlamaAiService.deleteAllAiSessionsService(userId);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.message).toBe('An internal server error occurred');
    });
  });
});