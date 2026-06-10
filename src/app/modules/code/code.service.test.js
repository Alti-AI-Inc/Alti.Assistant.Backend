import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { codeService } from './code.service.js';

// Mock external dependencies
vi.mock('http-status', () => ({ default: { INTERNAL_SERVER_ERROR: 500 } }));
vi.mock('../../../errors/ApiError.js', () => ({
  default: vi.fn((status, message) => {
    const error = new Error(message);
    error.statusCode = status;
    return error;
  }),
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../conversations/conversation.service.js', () => ({
  conversationService: {
    createConversation: vi.fn(),
    addMessageToConversation: vi.fn(),
    updateConversationTitle: vi.fn(),
  },
}));
vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: {
    getConversationById: vi.fn(),
    getUserConversations: vi.fn(),
  },
}));

// Mock internal helper functions for deterministic IDs
const MOCK_DATE_NOW = 1678886400000; // A fixed timestamp
const MOCK_MATH_RANDOM = 0.123456789; // A fixed random number

describe('codeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock Date.now and Math.random for deterministic ID generation
    vi.spyOn(Date, 'now').mockReturnValue(MOCK_DATE_NOW);
    vi.spyOn(Math, 'random').mockReturnValue(MOCK_MATH_RANDOM);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleCodeConversation', () => {
    const userId = 'user123';
    const codeQuery = 'console.log("Hello, world!");';
    const req = { tenantId: 'tenant1' };

    it('should retrieve an existing conversation for an authenticated user if conversationId is provided and found', async () => {
      const conversationId = 'conv123';
      const mockConversation = {
        conversationId,
        userId,
        title: 'Existing Code Conversation',
        messages: [],
      };
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      const result = await codeService.handleCodeConversation(
        userId,
        conversationId,
        codeQuery,
        false,
        req
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        conversationId,
        userId,
        req,
        { lean: true }
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(result).toEqual(mockConversation);
    });

    it('should create a new conversation for an authenticated user if conversationId is not provided', async () => {
      const newConversationId = `code-${MOCK_DATE_NOW}-${MOCK_MATH_RANDOM.toString(36).substr(2, 9)}`;
      const mockNewConversation = {
        conversationId: newConversationId,
        userId,
        title: 'Code: console.log("Hello, world!");',
        metadata: {
          category: 'code',
          model: 'code-assistant',
          codeType: 'assistant',
          userType: 'authenticated',
        },
        is_code_assistant: true,
      };
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Not found')); // Simulate not found
      conversationService.createConversation.mockResolvedValue(mockNewConversation);

      const result = await codeService.handleCodeConversation(
        userId,
        undefined, // No conversationId
        codeQuery,
        false,
        req
      );

      expect(conversationHelpers.getConversationById).not.toHaveBeenCalled(); // Because conversationId is undefined
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId,
          title: 'Code: console.log("Hello, world!");',
          metadata: {
            category: 'code',
            model: 'code-assistant',
            codeType: 'assistant',
            userType: 'authenticated',
          },
          is_code_assistant: true,
        },
        newConversationId,
        req
      );
      expect(result).toEqual(mockNewConversation);
    });

    it('should create a new conversation for an authenticated user if conversationId is provided but not found', async () => {
      const conversationId = 'nonExistentConv';
      const newConversationId = `code-${MOCK_DATE_NOW}-${MOCK_MATH_RANDOM.toString(36).substr(2, 9)}`;
      const mockNewConversation = {
        conversationId: newConversationId,
        userId,
        title: 'Code: console.log("Hello, world!");',
        metadata: {
          category: 'code',
          model: 'code-assistant',
          codeType: 'assistant',
          userType: 'authenticated',
        },
        is_code_assistant: true,
      };
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Conversation not found'));
      conversationService.createConversation.mockResolvedValue(mockNewConversation);

      const result = await codeService.handleCodeConversation(
        userId,
        conversationId,
        codeQuery,
        false,
        req
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        conversationId,
        userId,
        req,
        { lean: true }
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Conversation ${conversationId} not found for user ${userId}, creating new one`
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId,
          title: 'Code: console.log("Hello, world!");',
          metadata: {
            category: 'code',
            model: 'code-assistant',
            codeType: 'assistant',
            userType: 'authenticated',
          },
          is_code_assistant: true,
        },
        newConversationId,
        req
      );
      expect(result).toEqual(mockNewConversation);
    });

    it('should create an in-memory conversation for a guest user if conversationId is not provided', async () => {
      const newConversationId = `code-${MOCK_DATE_NOW}-${MOCK_MATH_RANDOM.toString(36).substr(2, 9)}`;
      const guestUserId = 'guest123';
      const result = await codeService.handleCodeConversation(
        guestUserId,
        undefined, // No conversationId
        codeQuery,
        true, // isGuest
        req
      );

      expect(conversationHelpers.getConversationById).not.toHaveBeenCalled();
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        conversationId: newConversationId,
        userId: guestUserId,
        title: 'Code: console.log("Hello, world!");',
        isGuest: true,
        metadata: {
          category: 'code',
          model: 'code-assistant',
          codeType: 'assistant',
          userType: 'guest',
        },
      });
      expect(result).toHaveProperty('createdAt');
    });

    it('should create an in-memory conversation for a guest user if conversationId is provided', async () => {
      const conversationId = 'guestConv123';
      const guestUserId = 'guest123';
      const result = await codeService.handleCodeConversation(
        guestUserId,
        conversationId,
        codeQuery,
        true, // isGuest
        req
      );

      expect(conversationHelpers.getConversationById).not.toHaveBeenCalled();
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        conversationId: conversationId, // Should use the provided ID
        userId: guestUserId,
        title: 'Code: console.log("Hello, world!");',
        isGuest: true,
        metadata: {
          category: 'code',
          model: 'code-assistant',
          codeType: 'assistant',
          userType: 'guest',
        },
      });
      expect(result).toHaveProperty('createdAt');
    });

    it('should truncate long code queries for conversation title', async () => {
      const longCodeQuery = 'a'.repeat(100);
      const expectedTitle = `Code: ${'a'.repeat(50)}...`;
      const newConversationId = `code-${MOCK_DATE_NOW}-${MOCK_MATH_RANDOM.toString(36).substr(2, 9)}`;
      conversationService.createConversation.mockResolvedValue({
        conversationId: newConversationId,
        userId,
        title: expectedTitle,
      });

      const result = await codeService.handleCodeConversation(
        userId,
        undefined,
        longCodeQuery,
        false,
        req
      );

      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({ title: expectedTitle }),
        newConversationId,
        req
      );
      expect(result.title).toBe(expectedTitle);
    });

    it('should throw ApiError on internal server error during conversation handling', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Not found'));
      conversationService.createConversation.mockRejectedValue(new Error('DB error'));

      await expect(
        codeService.handleCodeConversation(userId, undefined, codeQuery, false, req)
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        'Error handling code conversation:',
        expect.any(Error)
      );
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to handle code conversation'
      );
    });
  });

  describe('addCodeQueryMessage', () => {
    const conversationId = 'conv123';
    const userId = 'user123';
    const codeQuery = 'SELECT * FROM users;';
    const req = { tenantId: 'tenant1' };

    it('should add a message for an authenticated user', async () => {
      const mockResult = { success: true, message: 'Message added' };
      conversationService.addMessageToConversation.mockResolvedValue(mockResult);

      const result = await codeService.addCodeQueryMessage(
        conversationId,
        userId,
        codeQuery,
        false,
        req
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        conversationId,
        userId,
        {
          role: 'user',
          content: codeQuery,
          metadata: {
            type: 'code_query',
            timestamp: expect.any(String),
          },
        },
        req
      );
      expect(result).toEqual(mockResult);
    });

    it('should log and return success for a guest user', async () => {
      const guestUserId = 'guest123';
      const result = await codeService.addCodeQueryMessage(
        conversationId,
        guestUserId,
        codeQuery,
        true, // isGuest
        req
      );

      expect(conversationService.addMessageToConversation).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        `Guest user ${guestUserId} code query in conversation ${conversationId}: ${codeQuery}...`
      );
      expect(result).toEqual({
        success: true,
        message: 'Guest message logged',
        conversationId,
        userId: guestUserId,
        isGuest: true,
      });
    });

    it('should throw ApiError on internal server error for authenticated user', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(new Error('DB error'));

      await expect(
        codeService.addCodeQueryMessage(conversationId, userId, codeQuery, false, req)
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding code query message:',
        expect.any(Error)
      );
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to add code query to conversation'
      );
    });

    it('should return success: false for guest user on internal error without throwing', async () => {
      const guestUserId = 'guest123';
      logger.info.mockImplementation(() => {
        throw new Error('Logging failed');
      });

      const result = await codeService.addCodeQueryMessage(
        conversationId,
        guestUserId,
        codeQuery,
        true,
        req
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error adding code query message:',
        expect.any(Error)
      );
      expect(result).toEqual({
        success: false,
        error: 'Logging failed',
        isGuest: true,
      });
    });
  });

  describe('addCodeResultMessage', () => {
    const conversationId = 'conv123';
    const userId = 'user123';
    const codeResult = 'The query returned 10 rows.';
    const req = { tenantId: 'tenant1' };
    const metadata = { language: 'SQL' };

    it('should add a message for an authenticated user', async () => {
      const mockResult = { success: true, message: 'Message added' };
      conversationService.addMessageToConversation.mockResolvedValue(mockResult);

      const result = await codeService.addCodeResultMessage(
        conversationId,
        userId,
        codeResult,
        metadata,
        false,
        req
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        conversationId,
        userId,
        {
          role: 'assistant',
          content: codeResult,
          metadata: {
            type: 'code_result',
            timestamp: expect.any(String),
            model: 'code-assistant',
            ...metadata,
          },
        },
        req
      );
      expect(result).toEqual(mockResult);
    });

    it('should log and return success for a guest user', async () => {
      const guestUserId = 'guest123';
      const result = await codeService.addCodeResultMessage(
        conversationId,
        guestUserId,
        codeResult,
        metadata,
        true, // isGuest
        req
      );

      expect(conversationService.addMessageToConversation).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        `Guest user ${guestUserId} code result in conversation ${conversationId}: ${codeResult}...`
      );
      expect(result).toEqual({
        success: true,
        message: 'Guest response logged',
        conversationId,
        userId: guestUserId,
        isGuest: true,
      });
    });

    it('should throw ApiError on internal server error for authenticated user', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(new Error('DB error'));

      await expect(
        codeService.addCodeResultMessage(conversationId, userId, codeResult, metadata, false, req)
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding code result message:',
        expect.any(Error)
      );
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to add code result to conversation'
      );
    });

    it('should return success: false for guest user on internal error without throwing', async () => {
      const guestUserId = 'guest123';
      logger.info.mockImplementation(() => {
        throw new Error('Logging failed');
      });

      const result = await codeService.addCodeResultMessage(
        conversationId,
        guestUserId,
        codeResult,
        metadata,
        true,
        req
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error adding code result message:',
        expect.any(Error)
      );
      expect(result).toEqual({
        success: false,
        error: 'Logging failed',
        isGuest: true,
      });
    });
  });

  describe('addErrorMessage', () => {
    const conversationId = 'conv123';
    const userId = 'user123';
    const errorMessage = 'An unexpected error occurred.';
    const originalError = new Error('Detailed internal error');
    const req = { tenantId: 'tenant1' };

    it('should add an error message to the conversation', async () => {
      const mockResult = { success: true, message: 'Error message added' };
      conversationService.addMessageToConversation.mockResolvedValue(mockResult);

      const result = await codeService.addErrorMessage(
        conversationId,
        userId,
        errorMessage,
        originalError,
        req
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        conversationId,
        userId,
        {
          role: 'assistant',
          content: errorMessage,
          metadata: {
            type: 'error',
            timestamp: expect.any(String),
            error: originalError.message,
          },
        },
        req
      );
      expect(result).toEqual(mockResult);
    });

    it('should not throw if adding the error message fails', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(new Error('DB write error'));

      const result = await codeService.addErrorMessage(
        conversationId,
        userId,
        errorMessage,
        originalError,
        req
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error adding error message:',
        expect.any(Error)
      );
      expect(result).toBeUndefined(); // Function returns void on error
    });

    it('should handle originalError being null or undefined', async () => {
      const mockResult = { success: true, message: 'Error message added' };
      conversationService.addMessageToConversation.mockResolvedValue(mockResult);

      await codeService.addErrorMessage(
        conversationId,
        userId,
        errorMessage,
        null, // No original error
        req
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        conversationId,
        userId,
        expect.objectContaining({
          metadata: expect.objectContaining({
            error: 'Unknown error',
          }),
        }),
        req
      );
    });
  });

  describe('getCodeHistory', () => {
    const conversationId = 'conv123';
    const userId = 'user123';
    const req = { tenantId: 'tenant1' };

    it('should return a limited history of messages if conversation is found', async () => {
      const mockConversation = {
        conversationId,
        userId,
        messages: [
          { role: 'user', content: 'Msg 1', timestamp: '2023-01-01T00:00:00Z' },
          { role: 'assistant', content: 'Msg 2', timestamp: '2023-01-01T00:01:00Z' },
          { role: 'user', content: 'Msg 3', timestamp: '2023-01-01T00:02:00Z' },
          { role: 'assistant', content: 'Msg 4', timestamp: '2023-01-01T00:03:00Z' },
          { role: 'user', content: 'Msg 5', timestamp: '2023-01-01T00:04:00Z' },
        ],
      };
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      const result = await codeService.getCodeHistory(conversationId, userId, 3, req);

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        conversationId,
        userId,
        req,
        { lean: true }
      );
      expect(result).toEqual([
        { role: 'user', content: 'Msg 3', timestamp: '2023-01-01T00:02:00Z' },
        { role: 'assistant', content: 'Msg 4', timestamp: '2023-01-01T00:03:00Z' },
        { role: 'user', content: 'Msg 5', timestamp: '2023-01-01T00:04:00Z' },
      ]);
    });

    it('should return all messages if limit is greater than total messages', async () => {
      const mockConversation = {
        conversationId,
        userId,
        messages: [
          { role: 'user', content: 'Msg 1', timestamp: '2023-01-01T00:00:00Z' },
          { role: 'assistant', content: 'Msg 2', timestamp: '2023-01-01T00:01:00Z' },
        ],
      };
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      const result = await codeService.getCodeHistory(conversationId, userId, 10, req);

      expect(result.length).toBe(2);
      expect(result).toEqual([
        { role: 'user', content: 'Msg 1', timestamp: '2023-01-01T00:00:00Z' },
        { role: 'assistant', content: 'Msg 2', timestamp: '2023-01-01T00:01:00Z' },
      ]);
    });

    it('should return an empty array if conversation is not found', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(null);

      const result = await codeService.getCodeHistory(conversationId, userId, 10, req);

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        conversationId,
        userId,
        req,
        { lean: true }
      );
      expect(result).toEqual([]);
    });

    it('should return an empty array if conversation has no messages', async () => {
      const mockConversation = { conversationId, userId, messages: [] };
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      const result = await codeService.getCodeHistory(conversationId, userId, 10, req);

      expect(result).toEqual([]);
    });

    it('should return an empty array on error', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(new Error('DB error'));

      const result = await codeService.getCodeHistory(conversationId, userId, 10, req);

      expect(logger.error).toHaveBeenCalledWith(
        'Error getting code history:',
        expect.any(Error)
      );
      expect(result).toEqual([]);
    });
  });

  describe('updateConversationTitle', () => {
    const conversationId = 'conv123';
    const userId = 'user123';
    const codeQuery = 'New query for title';
    const req = { tenantId: 'tenant1' };

    it('should update the conversation title successfully', async () => {
      conversationService.updateConversationTitle.mockResolvedValue({});

      await codeService.updateConversationTitle(conversationId, userId, codeQuery, req);

      expect(conversationService.updateConversationTitle).toHaveBeenCalledWith(
        conversationId,
        userId,
        'Code: New query for title',
        req
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should truncate long code queries for the title', async () => {
      const longCodeQuery = 'b'.repeat(100);
      const expectedTitle = `Code: ${'b'.repeat(50)}...`;
      conversationService.updateConversationTitle.mockResolvedValue({});

      await codeService.updateConversationTitle(conversationId, userId, longCodeQuery, req);

      expect(conversationService.updateConversationTitle).toHaveBeenCalledWith(
        conversationId,
        userId,
        expectedTitle,
        req
      );
    });

    it('should not throw if updating the title fails, but log a warning', async () => {
      conversationService.updateConversationTitle.mockRejectedValue(new Error('Update failed'));

      await codeService.updateConversationTitle(conversationId, userId, codeQuery, req);

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to update conversation title:',
        expect.any(Error)
      );
    });
  });

  describe('generateCodeConversationId', () => {
    it('should generate a unique ID starting with "code-"', () => {
      const id = codeService.generateCodeConversationId();
      expect(id).toMatch(/^code-\d{13}-[a-z0-9]{9}$/);
      expect(id).toBe(`code-${MOCK_DATE_NOW}-${MOCK_MATH_RANDOM.toString(36).substr(2, 9)}`);
    });

    it('should generate different IDs on subsequent calls (if mocks were not fixed)', () => {
      vi.restoreAllMocks(); // Restore original Math.random and Date.now
      const id1 = codeService.generateCodeConversationId();
      const id2 = codeService.generateCodeConversationId();
      expect(id1).not.toBe(id2);
      vi.spyOn(Date, 'now').mockReturnValue(MOCK_DATE_NOW); // Re-mock for other tests
      vi.spyOn(Math, 'random').mockReturnValue(MOCK_MATH_RANDOM);
    });
  });

  describe('generateGuestUserId', () => {
    it('should generate a unique ID starting with "guest-"', () => {
      const id = codeService.generateGuestUserId();
      expect(id).toMatch(/^guest-\d{13}-[a-z0-9]{9}$/);
      expect(id).toBe(`guest-${MOCK_DATE_NOW}-${MOCK_MATH_RANDOM.toString(36).substr(2, 9)}`);
    });

    it('should generate different IDs on subsequent calls (if mocks were not fixed)', () => {
      vi.restoreAllMocks();
      const id1 = codeService.generateGuestUserId();
      const id2 = codeService.generateGuestUserId();
      expect(id1).not.toBe(id2);
      vi.spyOn(Date, 'now').mockReturnValue(MOCK_DATE_NOW);
      vi.spyOn(Math, 'random').mockReturnValue(MOCK_MATH_RANDOM);
    });
  });

  describe('getCodeStats', () => {
    const userId = 'user123';
    const req = { tenantId: 'tenant1' };

    it('should return correct statistics for a user with code conversations', async () => {
      const mockConversations = {
        conversations: [
          { messageCount: 5, category: 'code' },
          { messageCount: 10, category: 'code' },
          { messageCount: 3, category: 'code' },
        ],
        totalResults: 3,
      };
      conversationHelpers.getUserConversations.mockResolvedValue(mockConversations);

      const result = await codeService.getCodeStats(userId, req);

      expect(conversationHelpers.getUserConversations).toHaveBeenCalledWith(
        userId,
        { page: 1, limit: 0, category: 'code' },
        req,
        { lean: true }
      );
      expect(result).toEqual({
        totalCodeConversations: 3,
        totalCodeMessages: 18,
        averageMessagesPerConversation: 6, // (5+10+3)/3 = 6
      });
    });

    it('should return zero statistics for a user with no code conversations', async () => {
      conversationHelpers.getUserConversations.mockResolvedValue({
        conversations: [],
        totalResults: 0,
      });

      const result = await codeService.getCodeStats(userId, req);

      expect(result).toEqual({
        totalCodeConversations: 0,
        totalCodeMessages: 0,
        averageMessagesPerConversation: 0,
      });
    });

    it('should return zero statistics on error', async () => {
      conversationHelpers.getUserConversations.mockRejectedValue(new Error('DB error'));

      const result = await codeService.getCodeStats(userId, req);

      expect(logger.error).toHaveBeenCalledWith(
        'Error getting code stats:',
        expect.any(Error)
      );
      expect(result).toEqual({
        totalCodeConversations: 0,
        totalCodeMessages: 0,
        averageMessagesPerConversation: 0,
      });
    });
  });
});