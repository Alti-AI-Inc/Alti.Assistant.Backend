import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';
import { openMemoryClient } from '../../shared/openMemoryClient.js';
import { summaryService } from './summary.service.js'; // Import the service to be tested

// Mock external dependencies
vi.mock('http-status', () => ({
  default: {
    INTERNAL_SERVER_ERROR: 500,
  },
}));

vi.mock('../../../errors/ApiError.js', () => ({
  default: vi.fn((statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }),
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
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

vi.mock('mongoose', () => ({
  default: {
    Types: {
      ObjectId: vi.fn(() => ({
        toString: vi.fn(() => 'mockObjectIdString'),
      })),
    },
  },
}));

vi.mock('../../shared/openMemoryClient.js', () => ({
  openMemoryClient: {
    enabled: false, // Default to disabled for most tests
    addMemory: vi.fn(),
  },
}));

describe('summaryService', () => {
  const mockUserId = 'user123';
  const mockConversationId = 'conv456';
  const mockSummaryQuery = 'What is the capital of France?';
  const mockSummaryResult = 'The capital of France is Paris.';
  const mockReq = { user: { id: mockUserId } }; // Mock request object

  beforeEach(() => {
    vi.clearAllMocks();
    openMemoryClient.enabled = false; // Reset openMemoryClient to disabled
  });

  describe('generateGuestUserId', () => {
    it('should generate a unique guest user ID using mongoose ObjectId', () => {
      const guestUserId = summaryService.generateGuestUserId();
      expect(mongoose.Types.ObjectId).toHaveBeenCalledTimes(1);
      expect(guestUserId).toBe('mockObjectIdString');
    });
  });

  describe('handleSummaryConversation', () => {
    it('should return an existing conversation if found for authenticated user', async () => {
      const existingConversation = {
        _id: mockConversationId,
        userId: mockUserId,
        title: 'Existing Summary',
        metadata: { userType: 'authenticated' },
      };
      conversationHelpers.getConversationById.mockResolvedValue(
        existingConversation
      );

      const result = await summaryService.handleSummaryConversation(
        mockUserId,
        mockConversationId,
        mockSummaryQuery,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        mockReq
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(result).toEqual(existingConversation);
    });

    it('should return an existing conversation if found for guest user and is guest type', async () => {
      const existingConversation = {
        _id: mockConversationId,
        userId: mockUserId,
        title: 'Existing Guest Summary',
        metadata: { userType: 'guest', isGuest: true },
      };
      conversationHelpers.getConversationById.mockResolvedValue(
        existingConversation
      );

      const result = await summaryService.handleSummaryConversation(
        mockUserId,
        mockConversationId,
        mockSummaryQuery,
        true,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        null, // userId is null for guest in getConversationById
        mockReq
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(result).toEqual(existingConversation);
    });

    it('should create a new conversation if existing one is not found for authenticated user', async () => {
      const newConversation = {
        _id: 'newConvId',
        userId: mockUserId,
        title: `Summary: ${mockSummaryQuery.substring(0, 50)}...`,
        metadata: { userType: 'authenticated' },
      };
      conversationHelpers.getConversationById.mockRejectedValue(
        new Error('Not found')
      );
      conversationService.createConversation.mockResolvedValue(newConversation);

      const result = await summaryService.handleSummaryConversation(
        mockUserId,
        mockConversationId,
        mockSummaryQuery,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        mockReq
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Conversation ${mockConversationId} not found for user ${mockUserId}, creating new one`
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: `Summary: ${mockSummaryQuery.substring(0, 50)}...`,
          metadata: {
            category: 'summary',
            model: 'summary-agent',
            summaryType: 'assistant',
            userType: 'authenticated',
          },
        },
        expect.any(String), // newConversationId
        mockReq
      );
      expect(result).toEqual(newConversation);
    });

    it('should create a new conversation if existing one is not found for guest user', async () => {
      const newConversation = {
        _id: 'newGuestConvId',
        userId: mockUserId,
        title: `Summary: ${mockSummaryQuery.substring(0, 50)}...`,
        metadata: { userType: 'guest', isGuest: true },
      };
      conversationHelpers.getConversationById.mockRejectedValue(
        new Error('Not found')
      );
      conversationService.createConversation.mockResolvedValue(newConversation);

      const result = await summaryService.handleSummaryConversation(
        mockUserId,
        mockConversationId,
        mockSummaryQuery,
        true,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        null,
        mockReq
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Conversation ${mockConversationId} not found for user ${mockUserId}, creating new one`
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: `Summary: ${mockSummaryQuery.substring(0, 50)}...`,
          metadata: {
            category: 'summary',
            model: 'summary-agent',
            summaryType: 'assistant',
            userType: 'guest',
            isGuest: true,
          },
        },
        expect.any(String), // newConversationId
        mockReq
      );
      expect(result).toEqual(newConversation);
    });

    it('should create a new conversation if no conversationId is provided for authenticated user', async () => {
      const newConversation = {
        _id: 'newConvIdNoId',
        userId: mockUserId,
        title: `Summary: ${mockSummaryQuery.substring(0, 50)}...`,
        metadata: { userType: 'authenticated' },
      };
      conversationService.createConversation.mockResolvedValue(newConversation);

      const result = await summaryService.handleSummaryConversation(
        mockUserId,
        null, // No conversationId
        mockSummaryQuery,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).not.toHaveBeenCalled();
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: `Summary: ${mockSummaryQuery.substring(0, 50)}...`,
          metadata: {
            category: 'summary',
            model: 'summary-agent',
            summaryType: 'assistant',
            userType: 'authenticated',
          },
        },
        expect.stringMatching(/^summary-\d{13}-[a-z0-9]{9}$/), // Checks for generated ID format
        mockReq
      );
      expect(result).toEqual(newConversation);
    });

    it('should create a new conversation if guest user tries to access non-guest conversation', async () => {
      const nonGuestConversation = {
        _id: mockConversationId,
        userId: 'anotherUser',
        title: 'Non-Guest Summary',
        metadata: { userType: 'authenticated' },
      };
      const newGuestConversation = {
        _id: 'newGuestConvId',
        userId: mockUserId,
        title: `Summary: ${mockSummaryQuery.substring(0, 50)}...`,
        metadata: { userType: 'guest', isGuest: true },
      };
      conversationHelpers.getConversationById.mockResolvedValue(
        nonGuestConversation
      );
      conversationService.createConversation.mockResolvedValue(
        newGuestConversation
      );

      const result = await summaryService.handleSummaryConversation(
        mockUserId,
        mockConversationId,
        mockSummaryQuery,
        true,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        null,
        mockReq
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Guest user ${mockUserId} trying to access non-guest conversation ${mockConversationId}`
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: `Summary: ${mockSummaryQuery.substring(0, 50)}...`,
          metadata: {
            category: 'summary',
            model: 'summary-agent',
            summaryType: 'assistant',
            userType: 'guest',
            isGuest: true,
          },
        },
        expect.any(String),
        mockReq
      );
      expect(result).toEqual(newGuestConversation);
    });

    it('should throw ApiError if an error occurs during conversation handling', async () => {
      const mockError = new Error('Database error');
      conversationHelpers.getConversationById.mockRejectedValue(mockError);
      conversationService.createConversation.mockRejectedValue(mockError);

      await expect(
        summaryService.handleSummaryConversation(
          mockUserId,
          mockConversationId,
          mockSummaryQuery,
          false,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        'Error handling summary conversation:',
        mockError
      );
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to handle summary conversation'
      );
    });
  });

  describe('addSummaryQueryMessage', () => {
    const mockSavedMessage = {
      _id: 'msg1',
      conversationId: mockConversationId,
      role: 'user',
      content: mockSummaryQuery,
    };

    it('should add a summary query message to the conversation', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(
        mockSavedMessage
      );

      const result = await summaryService.addSummaryQueryMessage(
        mockConversationId,
        mockUserId,
        mockSummaryQuery,
        false,
        mockReq
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {
          role: 'user',
          content: mockSummaryQuery,
          metadata: {
            type: 'summary_query',
            timestamp: expect.any(String),
          },
        },
        mockReq
      );
      expect(result).toEqual(mockSavedMessage);
    });

    it('should persist summary query in OpenMemory if enabled', async () => {
      openMemoryClient.enabled = true;
      conversationService.addMessageToConversation.mockResolvedValue(
        mockSavedMessage
      );
      openMemoryClient.addMemory.mockResolvedValue({});

      await summaryService.addSummaryQueryMessage(
        mockConversationId,
        mockUserId,
        mockSummaryQuery,
        false,
        mockReq
      );

      expect(openMemoryClient.addMemory).toHaveBeenCalledWith({
        content: mockSummaryQuery,
        userId: mockUserId,
        tags: ['summary', 'query'],
        metadata: {
          conversationId: mockConversationId,
          type: 'summary_query',
          timestamp: expect.any(String),
          isGuest: false,
        },
        sector: 'episodic',
      });
    });

    it('should not persist summary query in OpenMemory if disabled', async () => {
      openMemoryClient.enabled = false;
      conversationService.addMessageToConversation.mockResolvedValue(
        mockSavedMessage
      );

      await summaryService.addSummaryQueryMessage(
        mockConversationId,
        mockUserId,
        mockSummaryQuery,
        false,
        mockReq
      );

      expect(openMemoryClient.addMemory).not.toHaveBeenCalled();
    });

    it('should log a warning if OpenMemory persistence fails but still return message', async () => {
      openMemoryClient.enabled = true;
      const memoryError = new Error('Memory persistence failed');
      conversationService.addMessageToConversation.mockResolvedValue(
        mockSavedMessage
      );
      openMemoryClient.addMemory.mockRejectedValue(memoryError);

      const result = await summaryService.addSummaryQueryMessage(
        mockConversationId,
        mockUserId,
        mockSummaryQuery,
        false,
        mockReq
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to persist summary query in OpenMemory',
        memoryError
      );
      expect(result).toEqual(mockSavedMessage); // Should still return the saved message
    });

    it('should throw ApiError if adding message to conversation fails', async () => {
      const mockError = new Error('DB error');
      conversationService.addMessageToConversation.mockRejectedValue(mockError);

      await expect(
        summaryService.addSummaryQueryMessage(
          mockConversationId,
          mockUserId,
          mockSummaryQuery,
          false,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding summary query message:',
        mockError
      );
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to add summary query to conversation'
      );
    });
  });

  describe('addSummaryResultMessage', () => {
    const mockSavedMessage = {
      _id: 'msg2',
      conversationId: mockConversationId,
      role: 'assistant',
      content: mockSummaryResult,
    };
    const mockMetadata = { source: 'web' };

    it('should add a summary result message to the conversation', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(
        mockSavedMessage
      );

      const result = await summaryService.addSummaryResultMessage(
        mockConversationId,
        mockUserId,
        mockSummaryResult,
        mockMetadata,
        false,
        mockReq
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {
          role: 'assistant',
          content: mockSummaryResult,
          metadata: {
            type: 'summary_result',
            timestamp: expect.any(String),
            model: 'summary-agent',
            ...mockMetadata,
          },
        },
        mockReq
      );
      expect(result).toEqual(mockSavedMessage);
    });

    it('should persist summary result in OpenMemory if enabled', async () => {
      openMemoryClient.enabled = true;
      conversationService.addMessageToConversation.mockResolvedValue(
        mockSavedMessage
      );
      openMemoryClient.addMemory.mockResolvedValue({});

      await summaryService.addSummaryResultMessage(
        mockConversationId,
        mockUserId,
        mockSummaryResult,
        mockMetadata,
        true, // isGuest
        mockReq
      );

      expect(openMemoryClient.addMemory).toHaveBeenCalledWith({
        content: mockSummaryResult,
        userId: mockUserId,
        tags: ['summary', 'answer'],
        metadata: {
          conversationId: mockConversationId,
          ...mockMetadata,
          type: 'summary_result',
          isGuest: true,
        },
        sector: mockMetadata.sector || 'semantic',
      });
    });

    it('should not persist summary result in OpenMemory if disabled', async () => {
      openMemoryClient.enabled = false;
      conversationService.addMessageToConversation.mockResolvedValue(
        mockSavedMessage
      );

      await summaryService.addSummaryResultMessage(
        mockConversationId,
        mockUserId,
        mockSummaryResult,
        mockMetadata,
        false,
        mockReq
      );

      expect(openMemoryClient.addMemory).not.toHaveBeenCalled();
    });

    it('should log a warning if OpenMemory persistence fails but still return message', async () => {
      openMemoryClient.enabled = true;
      const memoryError = new Error('Memory persistence failed');
      conversationService.addMessageToConversation.mockResolvedValue(
        mockSavedMessage
      );
      openMemoryClient.addMemory.mockRejectedValue(memoryError);

      const result = await summaryService.addSummaryResultMessage(
        mockConversationId,
        mockUserId,
        mockSummaryResult,
        mockMetadata,
        false,
        mockReq
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to persist summary result in OpenMemory',
        memoryError
      );
      expect(result).toEqual(mockSavedMessage); // Should still return the saved message
    });

    it('should throw ApiError if adding message to conversation fails', async () => {
      const mockError = new Error('DB error');
      conversationService.addMessageToConversation.mockRejectedValue(mockError);

      await expect(
        summaryService.addSummaryResultMessage(
          mockConversationId,
          mockUserId,
          mockSummaryResult,
          mockMetadata,
          false,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding summary result message:',
        mockError
      );
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to add summary result to conversation'
      );
    });
  });

  describe('addErrorMessage', () => {
    const mockErrorMessage = 'An unexpected error occurred.';
    const mockOriginalError = new Error('Internal server issue');
    const mockSavedMessage = {
      _id: 'msg3',
      conversationId: mockConversationId,
      role: 'assistant',
      content: mockErrorMessage,
      metadata: { type: 'error', error: mockOriginalError.message },
    };

    it('should add an error message to the conversation', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(
        mockSavedMessage
      );

      const result = await summaryService.addErrorMessage(
        mockConversationId,
        mockUserId,
        mockErrorMessage,
        mockOriginalError,
        false,
        mockReq
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {
          role: 'assistant',
          content: mockErrorMessage,
          metadata: {
            type: 'error',
            timestamp: expect.any(String),
            error: mockOriginalError.message,
          },
        },
        mockReq
      );
      expect(result).toEqual(mockSavedMessage);
    });

    it('should handle adding error message for guest user', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(
        mockSavedMessage
      );

      await summaryService.addErrorMessage(
        mockConversationId,
        mockUserId,
        mockErrorMessage,
        mockOriginalError,
        true,
        mockReq
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({
          role: 'assistant',
          content: mockErrorMessage,
        }),
        mockReq
      );
    });

    it('should log an error but not throw if adding error message fails', async () => {
      const mockDbError = new Error('DB write failed');
      conversationService.addMessageToConversation.mockRejectedValue(
        mockDbError
      );

      const result = await summaryService.addErrorMessage(
        mockConversationId,
        mockUserId,
        mockErrorMessage,
        mockOriginalError,
        false,
        mockReq
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error adding error message:',
        mockDbError
      );
      expect(result).toBeUndefined(); // Should not return anything or throw
    });

    it('should use "Unknown error" if originalError is null or undefined', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(
        mockSavedMessage
      );

      await summaryService.addErrorMessage(
        mockConversationId,
        mockUserId,
        mockErrorMessage,
        null, // No original error
        false,
        mockReq
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({
          metadata: expect.objectContaining({
            error: 'Unknown error',
          }),
        }),
        mockReq
      );
    });
  });

  describe('getSummaryHistory', () => {
    const mockMessages = [
      { role: 'user', content: 'Q1', timestamp: '2023-01-01T10:00:00Z' },
      { role: 'assistant', content: 'A1', timestamp: '2023-01-01T10:01:00Z' },
      { role: 'user', content: 'Q2', timestamp: '2023-01-01T10:02:00Z' },
      { role: 'assistant', content: 'A2', timestamp: '2023-01-01T10:03:00Z' },
      { role: 'user', content: 'Q3', timestamp: '2023-01-01T10:04:00Z' },
    ];
    const mockConversation = {
      _id: mockConversationId,
      userId: mockUserId,
      messages: mockMessages,
    };

    it('should return formatted summary history for a conversation', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(
        mockConversation
      );

      const result = await summaryService.getSummaryHistory(
        mockConversationId,
        mockUserId,
        3,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        mockReq
      );
      expect(result).toEqual([
        { role: 'assistant', content: 'A2', timestamp: '2023-01-01T10:03:00Z' },
        { role: 'user', content: 'Q3', timestamp: '2023-01-01T10:04:00Z' },
      ]);
      expect(result.length).toBe(2); // Default limit is 10, but we passed 3, so it should be 2 (last 2 messages)
    });

    it('should return all messages if limit is greater than message count', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(
        mockConversation
      );

      const result = await summaryService.getSummaryHistory(
        mockConversationId,
        mockUserId,
        10,
        mockReq
      );

      expect(result.length).toBe(5);
      expect(result[0]).toEqual({
        role: 'user',
        content: 'Q1',
        timestamp: '2023-01-01T10:00:00Z',
      });
    });

    it('should return an empty array if conversation is not found', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(null);

      const result = await summaryService.getSummaryHistory(
        mockConversationId,
        mockUserId,
        10,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        mockReq
      );
      expect(result).toEqual([]);
    });

    it('should return an empty array if conversation has no messages', async () => {
      conversationHelpers.getConversationById.mockResolvedValue({
        _id: mockConversationId,
        userId: mockUserId,
        messages: [],
      });

      const result = await summaryService.getSummaryHistory(
        mockConversationId,
        mockUserId,
        10,
        mockReq
      );

      expect(result).toEqual([]);
    });

    it('should log an error and return an empty array if an error occurs', async () => {
      const mockError = new Error('Fetch error');
      conversationHelpers.getConversationById.mockRejectedValue(mockError);

      const result = await summaryService.getSummaryHistory(
        mockConversationId,
        mockUserId,
        10,
        mockReq
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error getting summary history:',
        mockError
      );
      expect(result).toEqual([]);
    });
  });

  describe('updateConversationTitle', () => {
    it('should update the conversation title with a truncated summary query', async () => {
      const longSummaryQuery =
        'This is a very long summary query that should be truncated to fit into the conversation title properly.';
      const expectedTitle =
        'Summary: This is a very long summary query that should be trun...';
      conversationService.updateConversationTitle.mockResolvedValue({});

      await summaryService.updateConversationTitle(
        mockConversationId,
        mockUserId,
        longSummaryQuery,
        mockReq
      );

      expect(conversationService.updateConversationTitle).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expectedTitle,
        mockReq
      );
    });

    it('should update the conversation title without truncation if query is short', async () => {
      const shortSummaryQuery = 'Short query.';
      const expectedTitle = 'Summary: Short query.';
      conversationService.updateConversationTitle.mockResolvedValue({});

      await summaryService.updateConversationTitle(
        mockConversationId,
        mockUserId,
        shortSummaryQuery,
        mockReq
      );

      expect(conversationService.updateConversationTitle).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expectedTitle,
        mockReq
      );
    });

    it('should log a warning but not throw if updating title fails', async () => {
      const mockError = new Error('Update failed');
      conversationService.updateConversationTitle.mockRejectedValue(mockError);

      await summaryService.updateConversationTitle(
        mockConversationId,
        mockUserId,
        mockSummaryQuery,
        mockReq
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to update conversation title:',
        mockError
      );
      // Expect no error to be thrown
    });
  });

  describe('generateSummaryConversationId', () => {
    it('should generate a unique conversation ID with the correct format', () => {
      const id = summaryService.generateSummaryConversationId();
      expect(id).toMatch(/^summary-\d{13}-[a-z0-9]{9}$/);
    });
  });

  describe('getSummaryStats', () => {
    it('should return correct summary statistics for a user', async () => {
      const mockConversations = {
        conversations: [
          { _id: 'c1', messageCount: 5 },
          { _id: 'c2', messageCount: 10 },
          { _id: 'c3', messageCount: 3 },
        ],
        totalResults: 3,
      };
      conversationHelpers.getUserConversations.mockResolvedValue(
        mockConversations
      );

      const stats = await summaryService.getSummaryStats(mockUserId, mockReq);

      expect(conversationHelpers.getUserConversations).toHaveBeenCalledWith(
        mockUserId,
        {
          page: 1,
          limit: 1000,
          category: 'summary',
        }
      );
      expect(stats).toEqual({
        totalSummaryConversations: 3,
        totalSummaryMessages: 18,
        averageMessagesPerConversation: 6, // 18 / 3 = 6
      });
    });

    it('should return zero statistics if no summary conversations are found', async () => {
      conversationHelpers.getUserConversations.mockResolvedValue({
        conversations: [],
        totalResults: 0,
      });

      const stats = await summaryService.getSummaryStats(mockUserId, mockReq);

      expect(stats).toEqual({
        totalSummaryConversations: 0,
        totalSummaryMessages: 0,
        averageMessagesPerConversation: 0,
      });
    });

    it('should log an error and return zero statistics if an error occurs', async () => {
      const mockError = new Error('Stats fetch error');
      conversationHelpers.getUserConversations.mockRejectedValue(mockError);

      const stats = await summaryService.getSummaryStats(mockUserId, mockReq);

      expect(logger.error).toHaveBeenCalledWith(
        'Error getting summary stats:',
        mockError
      );
      expect(stats).toEqual({
        totalSummaryConversations: 0,
        totalSummaryMessages: 0,
        averageMessagesPerConversation: 0,
      });
    });
  });
});