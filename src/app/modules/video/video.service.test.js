import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';
import { getOperationStatus } from './videoService.js'; // This is the external dependency

// Mock external dependencies
vi.mock('http-status', () => ({ default: {
    INTERNAL_SERVER_ERROR: 500,
    NOT_FOUND: 404,
    OK: 200
}}));
vi.mock('../../../errors/ApiError.js', () => ({ default: vi.fn().mockImplementation((status, message) => {
    const error = new Error(message);
    error.statusCode = status;
    return error;
}) }));
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
      ObjectId: vi.fn().mockImplementation(() => ({
        toString: vi.fn().mockImplementation(() => 'mockObjectIdString'),
      })),
    },
  },
}));
vi.mock('./videoService.js', () => ({
    getOperationStatus: vi.fn(),
}));

// Import the service after mocks are set up
import { videoService } from './video.service.js';

describe('videoService', () => {
  const mockUserId = 'user123';
  const mockGuestUserId = 'guest123';
  const mockConversationId = 'conv123';
  const mockVideoQuery = 'how to make a video';
  const mockReq = { ip: '127.0.0.1' };
  const mockDate = '2023-10-27T10:00:00.000Z';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(mockDate));
    process.env.NODE_ENV = 'test'; // Default to test, can be overridden for specific cases
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateGuestUserId', () => {
    it('should generate a new mongoose ObjectId string', () => {
      const id = videoService.generateGuestUserId();
      expect(mongoose.Types.ObjectId).toHaveBeenCalledTimes(1);
      expect(id).toBe('mockObjectIdString');
    });
  });

  describe('generateVideoConversationId', () => {
    it('should generate a unique video conversation ID', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
      const id = videoService.generateVideoConversationId();
      expect(id).toMatch(/^vid-conv-\d{13}-[a-z0-9]{9}$/);
      expect(id).toContain(`${Date.now()}`);
      expect(id).toContain('2m2y5f2'); // '0.123456789'.substr(2,9)
    });

    it('should generate different IDs on subsequent calls', () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.2);
      const id1 = videoService.generateVideoConversationId();
      const id2 = videoService.generateVideoConversationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('handleVideoConversation', () => {
    const mockConversation = {
      _id: mockConversationId,
      userId: mockUserId,
      title: 'Video: how to make a video...',
      metadata: { category: 'video', userType: 'authenticated' },
      is_video_assistant: true,
    };
    const mockGuestConversation = {
      _id: mockConversationId,
      userId: mockGuestUserId,
      title: 'Video: how to make a video...',
      metadata: { category: 'video', userType: 'guest' },
      is_video_assistant: true,
    };

    it('should return an existing conversation if found for authenticated user', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      const result = await videoService.handleVideoConversation(
        mockUserId,
        mockConversationId,
        mockVideoQuery,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(result).toEqual(mockConversation);
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Created video conversation'));
    });

    it('should return an existing conversation if found for guest user with correct type', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(mockGuestConversation);

      const result = await videoService.handleVideoConversation(
        mockGuestUserId,
        mockConversationId,
        mockVideoQuery,
        true,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        null
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(result).toEqual(mockGuestConversation);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should create a new conversation if existing one is not found', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Not found'));
      conversationService.createConversation.mockResolvedValue(mockConversation);

      const result = await videoService.handleVideoConversation(
        mockUserId,
        mockConversationId,
        mockVideoQuery,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Conversation ${mockConversationId} not found; creating new one`
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: `Video: ${mockVideoQuery.substring(0, 50)}...`,
          metadata: {
            category: 'video',
            model: 'video-assistant',
            videoType: 'generation',
            userType: 'authenticated',
            isGuest: false,
          },
          is_video_assistant: true,
        },
        mockConversationId,
        mockReq
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Created video conversation ${mockConversationId} for user ${mockUserId} (guest: false)`
      );
      expect(result).toEqual(mockConversation);
    });

    it('should create a new conversation if no conversationId is provided', async () => {
      conversationService.createConversation.mockResolvedValue(mockConversation);
      vi.spyOn(videoService, 'generateVideoConversationId').mockReturnValue('new-vid-conv-id');

      const result = await videoService.handleVideoConversation(
        mockUserId,
        null, // No conversationId
        mockVideoQuery,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).not.toHaveBeenCalled();
      expect(videoService.generateVideoConversationId).toHaveBeenCalledTimes(1);
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.any(Object),
        'new-vid-conv-id',
        mockReq
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Created video conversation new-vid-conv-id for user ${mockUserId} (guest: false)`
      );
      expect(result).toEqual(mockConversation);
    });

    it('should create a new conversation if guest user tries to access non-guest conversation', async () => {
      const nonGuestConv = { ...mockConversation, metadata: { userType: 'authenticated' } };
      conversationHelpers.getConversationById.mockResolvedValue(nonGuestConv);
      conversationService.createConversation.mockResolvedValue(mockGuestConversation);
      vi.spyOn(videoService, 'generateVideoConversationId').mockReturnValue('new-guest-conv-id');

      const result = await videoService.handleVideoConversation(
        mockGuestUserId,
        mockConversationId,
        mockVideoQuery,
        true,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        null
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Guest user ${mockGuestUserId} tried to access non-guest conversation ${mockConversationId}`
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockGuestUserId,
          title: `Video: ${mockVideoQuery.substring(0, 50)}...`,
          metadata: {
            category: 'video',
            model: 'video-assistant',
            videoType: 'generation',
            userType: 'guest',
            isGuest: true,
          },
          is_video_assistant: true,
        },
        'new-guest-conv-id',
        mockReq
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Created video conversation new-guest-conv-id for user ${mockGuestUserId} (guest: true)`
      );
      expect(result).toEqual(mockGuestConversation);
    });

    it('should throw ApiError if conversation creation fails', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Not found'));
      conversationService.createConversation.mockRejectedValue(new Error('DB error'));

      await expect(
        videoService.handleVideoConversation(
          mockUserId,
          mockConversationId,
          mockVideoQuery,
          false,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to handle video conversation'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error handling video conversation:',
        expect.any(Error)
      );
    });
  });

  describe('addVideoQueryMessage', () => {
    const mockMessage = { _id: 'msg1', role: 'user', content: mockVideoQuery };

    it('should successfully add a video query message', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockMessage);

      const result = await videoService.addVideoQueryMessage(
        mockConversationId,
        mockUserId,
        mockVideoQuery,
        false,
        mockReq
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {
          role: 'user',
          content: mockVideoQuery,
          metadata: {
            messageType: 'video_query',
            timestamp: mockDate,
          },
        }
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Added video query message to ${mockConversationId} for auth user ${mockUserId}`
      );
      expect(result).toEqual(mockMessage);
    });

    it('should log for guest user', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockMessage);

      await videoService.addVideoQueryMessage(
        mockConversationId,
        mockGuestUserId,
        mockVideoQuery,
        true,
        mockReq
      );

      expect(logger.info).toHaveBeenCalledWith(
        `Added video query message to ${mockConversationId} for guest user ${mockGuestUserId}`
      );
    });

    it('should throw ApiError if adding message fails', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(new Error('DB error'));

      await expect(
        videoService.addVideoQueryMessage(
          mockConversationId,
          mockUserId,
          mockVideoQuery,
          false,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to add video query message'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding video query message:',
        expect.any(Error)
      );
    });
  });

  describe('addVideoResultMessage', () => {
    const mockMessage = { _id: 'msg2', role: 'assistant', content: 'Video result' };
    const mockVideoContent = { url: 'http://example.com/video.mp4' };

    it('should successfully add a video result message with string content', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockMessage);

      const result = await videoService.addVideoResultMessage(
        mockConversationId,
        mockUserId,
        'Video result',
        { duration: 60 },
        false,
        mockReq
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {
          role: 'assistant',
          content: 'Video result',
          metadata: {
            messageType: 'video_result',
            timestamp: mockDate,
            model: 'video-assistant',
            duration: 60,
          },
        }
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Added video result message to ${mockConversationId} for auth user ${mockUserId}`
      );
      expect(result).toEqual(mockMessage);
    });

    it('should successfully add a video result message with object content (stringified)', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockMessage);

      const result = await videoService.addVideoResultMessage(
        mockConversationId,
        mockUserId,
        mockVideoContent,
        { format: 'mp4' },
        false,
        mockReq
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {
          role: 'assistant',
          content: JSON.stringify(mockVideoContent),
          metadata: {
            messageType: 'video_result',
            timestamp: mockDate,
            model: 'video-assistant',
            format: 'mp4',
          },
        }
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Added video result message to ${mockConversationId} for auth user ${mockUserId}`
      );
      expect(result).toEqual(mockMessage);
    });

    it('should log for guest user', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockMessage);

      await videoService.addVideoResultMessage(
        mockConversationId,
        mockGuestUserId,
        'Guest video result',
        {},
        true,
        mockReq
      );

      expect(logger.info).toHaveBeenCalledWith(
        `Added video result message to ${mockConversationId} for guest user ${mockGuestUserId}`
      );
    });

    it('should throw ApiError if adding message fails', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(new Error('DB error'));

      await expect(
        videoService.addVideoResultMessage(
          mockConversationId,
          mockUserId,
          'Video result',
          {},
          false,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to add video result message'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding video result message:',
        expect.any(Error)
      );
    });
  });

  describe('addErrorMessage', () => {
    const mockErrorMessage = 'Something went wrong';
    const mockError = new Error('Test error');
    const mockMessage = { _id: 'msg3', role: 'assistant', content: mockErrorMessage };

    it('should successfully add an error message in development environment', async () => {
      process.env.NODE_ENV = 'development';
      conversationService.addMessageToConversation.mockResolvedValue(mockMessage);

      const result = await videoService.addErrorMessage(
        mockConversationId,
        mockUserId,
        mockErrorMessage,
        mockError,
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
            messageType: 'error',
            timestamp: mockDate,
            error: {
              message: mockError.message,
              stack: mockError.stack,
            },
          },
        }
      );
      expect(result).toEqual(mockMessage);
    });

    it('should successfully add an error message in production environment (no stack)', async () => {
      process.env.NODE_ENV = 'production';
      conversationService.addMessageToConversation.mockResolvedValue(mockMessage);

      const result = await videoService.addErrorMessage(
        mockConversationId,
        mockUserId,
        mockErrorMessage,
        mockError,
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
            messageType: 'error',
            timestamp: mockDate,
            error: {
              message: mockError.message,
              stack: undefined,
            },
          },
        }
      );
      expect(result).toEqual(mockMessage);
    });

    it('should log error and return null if adding error message fails', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(new Error('DB error'));

      const result = await videoService.addErrorMessage(
        mockConversationId,
        mockUserId,
        mockErrorMessage,
        mockError,
        false,
        mockReq
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error adding error message to conversation:',
        expect.any(Error)
      );
      expect(result).toBeNull();
    });
  });

  describe('getGuestConversations', () => {
    const mockGuestConversations = {
      conversations: [
        { _id: 'gc1', metadata: { userType: 'guest' } },
        { _id: 'gc2', metadata: { userType: 'guest' } },
      ],
      totalCount: 2,
    };
    const mockMixedConversations = {
      conversations: [
        { _id: 'gc1', metadata: { userType: 'guest' } },
        { _id: 'ac1', metadata: { userType: 'authenticated' } },
        { _id: 'gc2', metadata: { userType: 'guest' } },
      ],
      totalCount: 3,
    };

    it('should retrieve and filter guest video conversations', async () => {
      conversationHelpers.getUserConversations.mockResolvedValue(mockMixedConversations);

      const result = await videoService.getGuestConversations(mockGuestUserId, mockReq);

      expect(conversationHelpers.getUserConversations).toHaveBeenCalledWith(mockGuestUserId, {
        category: 'video',
        limit: 100,
      });
      expect(result).toEqual([
        { _id: 'gc1', metadata: { userType: 'guest' } },
        { _id: 'gc2', metadata: { userType: 'guest' } },
      ]);
    });

    it('should return empty array if no guest conversations found', async () => {
      conversationHelpers.getUserConversations.mockResolvedValue({
        conversations: [{ _id: 'ac1', metadata: { userType: 'authenticated' } }],
        totalCount: 1,
      });

      const result = await videoService.getGuestConversations(mockGuestUserId, mockReq);

      expect(result).toEqual([]);
    });

    it('should throw ApiError if fetching conversations fails', async () => {
      conversationHelpers.getUserConversations.mockRejectedValue(new Error('DB error'));

      await expect(
        videoService.getGuestConversations(mockGuestUserId, mockReq)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to retrieve guest conversations'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error getting guest video conversations:',
        expect.any(Error)
      );
    });
  });

  describe('getGuestConversation', () => {
    const mockGuestConversation = { _id: mockConversationId, metadata: { userType: 'guest' } };
    const mockAuthConversation = { _id: mockConversationId, metadata: { userType: 'authenticated' } };

    it('should retrieve a guest conversation if found and is guest type', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(mockGuestConversation);

      const result = await videoService.getGuestConversation(mockConversationId, mockReq);

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockReq
      );
      expect(result).toEqual(mockGuestConversation);
    });

    it('should throw ApiError if conversation not found', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(null);

      await expect(
        videoService.getGuestConversation(mockConversationId, mockReq)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(httpStatus.NOT_FOUND, 'Guest conversation not found');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching guest video conversation:',
        expect.any(Error)
      );
    });

    it('should throw ApiError if conversation found but not guest type', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(mockAuthConversation);

      await expect(
        videoService.getGuestConversation(mockConversationId, mockReq)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(httpStatus.NOT_FOUND, 'Guest conversation not found');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching guest video conversation:',
        expect.any(Error)
      );
    });

    it('should re-throw original error if fetching fails', async () => {
      const originalError = new Error('Network error');
      conversationHelpers.getConversationById.mockRejectedValue(originalError);

      await expect(
        videoService.getGuestConversation(mockConversationId, mockReq)
      ).rejects.toThrow(originalError);
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching guest video conversation:',
        originalError
      );
    });
  });

  describe('getVideoStats', () => {
    it('should calculate video statistics correctly for multiple conversations', async () => {
      const mockConversations = {
        conversations: [
          { _id: 'c1', messageCount: 5, lastActivity: '2023-10-27T09:00:00.000Z' },
          { _id: 'c2', messageCount: 3, lastActivity: '2023-10-26T08:00:00.000Z' },
          { _id: 'c3', messageCount: 2, lastActivity: '2023-10-25T07:00:00.000Z' },
        ],
        totalCount: 3,
      };
      conversationHelpers.getUserConversations.mockResolvedValue(mockConversations);

      const result = await videoService.getVideoStats(mockUserId, mockReq);

      expect(conversationHelpers.getUserConversations).toHaveBeenCalledWith(mockUserId, {
        category: 'video',
        limit: 1000,
      });
      expect(result).toEqual({
        totalConversations: 3,
        totalMessages: 10,
        totalVideos: 4, // (5/2 floor) + (3/2 floor) + (2/2 floor) = 2 + 1 + 1 = 4
        averageMessagesPerConversation: '3.33',
        lastActivity: '2023-10-27T09:00:00.000Z',
      });
    });

    it('should calculate video statistics correctly for no conversations', async () => {
      const mockConversations = {
        conversations: [],
        totalCount: 0,
      };
      conversationHelpers.getUserConversations.mockResolvedValue(mockConversations);

      const result = await videoService.getVideoStats(mockUserId, mockReq);

      expect(result).toEqual({
        totalConversations: 0,
        totalMessages: 0,
        totalVideos: 0,
        averageMessagesPerConversation: 0,
        lastActivity: null,
      });
    });

    it('should handle conversations with no messageCount gracefully', async () => {
      const mockConversations = {
        conversations: [
          { _id: 'c1', lastActivity: '2023-10-27T09:00:00.000Z' }, // No messageCount
          { _id: 'c2', messageCount: 4, lastActivity: '2023-10-26T08:00:00.000Z' },
        ],
        totalCount: 2,
      };
      conversationHelpers.getUserConversations.mockResolvedValue(mockConversations);

      const result = await videoService.getVideoStats(mockUserId, mockReq);

      expect(result).toEqual({
        totalConversations: 2,
        totalMessages: 4,
        totalVideos: 2, // (0/2 floor) + (4/2 floor) = 0 + 2 = 2
        averageMessagesPerConversation: '2.00',
        lastActivity: '2023-10-27T09:00:00.000Z',
      });
    });

    it('should throw ApiError if fetching conversations fails', async () => {
      conversationHelpers.getUserConversations.mockRejectedValue(new Error('DB error'));

      await expect(videoService.getVideoStats(mockUserId, mockReq)).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to retrieve video statistics'
      );
      expect(logger.error).toHaveBeenCalledWith('Error getting video stats:', expect.any(Error));
    });
  });

  describe('getOperationStatus', () => {
    it('should call the external getOperationStatus function', async () => {
      getOperationStatus.mockResolvedValue({ status: 'completed' });
      const operationId = 'op123';
      const result = await videoService.getOperationStatus(operationId);
      expect(getOperationStatus).toHaveBeenCalledWith(operationId);
      expect(result).toEqual({ status: 'completed' });
    });
  });
});