import { describe, it, expect, vi, beforeEach } from 'vitest';
import { imageService } from './image.service.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';

// Mock dependencies
vi.mock('mongoose', () => {
  return {
    default: {
      Types: {
        ObjectId: class {
          toString() {
            return '507f1f77bcf86cd799439011';
          }
        }
      }
    }
  };
});

vi.mock('http-status', () => ({
  default: {
    INTERNAL_SERVER_ERROR: 500,
    NOT_FOUND: 404,
    OK: 200,
  }
}));

vi.mock('../../../errors/ApiError.js', () => {
  return {
    default: class ApiError extends Error {
      constructor(statusCode, message, isOperational = true, stack = '') {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        if (stack) {
          this.stack = stack;
        } else {
          Error.captureStackTrace(this, this.constructor);
        }
      }
    }
  };
});

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

describe('ImageService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateGuestUserId', () => {
    it('should generate a valid guest user ID string', () => {
      const guestId = imageService.generateGuestUserId();
      expect(guestId).toBe('507f1f77bcf86cd799439011');
    });
  });

  describe('generateImageConversationId', () => {
    it('should generate a unique image conversation ID starting with prefix', () => {
      const convId = imageService.generateImageConversationId();
      expect(convId).typeOf('string');
      expect(convId.startsWith('img-conv-')).toBe(true);
    });
  });

  describe('handleImageConversation', () => {
    const mockReq = { headers: {} };

    // Context Boundaries: Testing across different roles/user types
    const roles = ['super_admin', 'admin', 'manager', 'user'];

    roles.forEach((role) => {
      it(`should retrieve existing conversation for authenticated role: ${role}`, async () => {
        const userId = `user-${role}`;
        const conversationId = 'existing-conv-id';
        const mockConversation = { _id: conversationId, userId, title: 'Existing Chat' };

        conversationHelpers.getConversationById.mockResolvedValueOnce(mockConversation);

        const result = await imageService.handleImageConversation(
          userId,
          conversationId,
          'generate a cat',
          false,
          mockReq
        );

        expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
          conversationId,
          userId,
          { lean: true }
        );
        expect(result).toEqual(mockConversation);
        expect(conversationService.createConversation).not.toHaveBeenCalled();
      });
    });

    it('should handle guest user context and filter explicitly for guest conversations', async () => {
      const guestUserId = 'guest-user-123';
      const conversationId = 'guest-conv-id';
      const mockConversation = { 
        _id: conversationId, 
        userId: guestUserId, 
        metadata: { userType: 'guest' } 
      };

      conversationHelpers.getConversationById.mockResolvedValueOnce(mockConversation);

      const result = await imageService.handleImageConversation(
        guestUserId,
        conversationId,
        'generate a dog',
        true,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        conversationId,
        guestUserId,
        { lean: true, 'metadata.userType': 'guest' }
      );
      expect(result).toEqual(mockConversation);
    });

    it('should create a new conversation if existing conversation is not found', async () => {
      const userId = 'user-123';
      const conversationId = 'non-existent-id';
      const mockNewConversation = { _id: 'new-conv-id', userId, title: 'Image: generate a cat...' };

      conversationHelpers.getConversationById.mockResolvedValueOnce(null);
      conversationService.createConversation.mockResolvedValueOnce(mockNewConversation);

      const result = await imageService.handleImageConversation(
        userId,
        conversationId,
        'generate a cat',
        false,
        mockReq
      );

      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          title: 'Image: generate a cat...',
          metadata: {
            category: 'image',
            model: 'image-assistant',
            imageType: 'generation',
            userType: 'authenticated',
          },
          is_image_assistant: true,
        }),
        expect.any(String),
        mockReq
      );
      expect(result).toEqual(mockNewConversation);
    });

    it('should create a new guest conversation if not found', async () => {
      const guestUserId = 'guest-123';
      const conversationId = 'non-existent-guest-id';
      const mockNewConversation = { _id: 'new-guest-conv-id', userId: guestUserId };

      conversationHelpers.getConversationById.mockRejectedValueOnce(new Error('Not found'));
      conversationService.createConversation.mockResolvedValueOnce(mockNewConversation);

      const result = await imageService.handleImageConversation(
        guestUserId,
        conversationId,
        'generate a bird',
        true,
        mockReq
      );

      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: guestUserId,
          title: 'Image: generate a bird...',
          metadata: {
            category: 'image',
            model: 'image-assistant',
            imageType: 'generation',
            userType: 'guest',
            isGuest: true,
          },
          is_image_assistant: true,
        }),
        expect.any(String),
        mockReq
      );
      expect(result).toEqual(mockNewConversation);
    });

    it('should throw ApiError when conversation creation fails', async () => {
      conversationHelpers.getConversationById.mockResolvedValueOnce(null);
      conversationService.createConversation.mockRejectedValueOnce(new Error('DB Error'));

      await expect(
        imageService.handleImageConversation('user-123', null, 'query', false, mockReq)
      ).rejects.toThrow(ApiError);
    });
  });

  describe('addImageQueryMessage', () => {
    it('should successfully add a user query message to conversation', async () => {
      const mockMessage = { role: 'user', content: 'draw a forest' };
      conversationService.addMessageToConversation.mockResolvedValueOnce(mockMessage);

      const result = await imageService.addImageQueryMessage(
        'conv-123',
        'user-123',
        'draw a forest',
        false,
        {}
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        'conv-123',
        'user-123',
        expect.objectContaining({
          role: 'user',
          content: 'draw a forest',
          metadata: expect.objectContaining({
            messageType: 'image_query',
          }),
        }),
        {}
      );
      expect(result).toEqual(mockMessage);
    });

    it('should throw ApiError if adding query message fails', async () => {
      conversationService.addMessageToConversation.mockRejectedValueOnce(new Error('Failed to save'));

      await expect(
        imageService.addImageQueryMessage('conv-123', 'user-123', 'query')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('addImageResultMessage', () => {
    it('should successfully add a string image result message', async () => {
      const mockMessage = { role: 'assistant', content: 'http://image.url' };
      conversationService.addMessageToConversation.mockResolvedValueOnce(mockMessage);

      const result = await imageService.addImageResultMessage(
        'conv-123',
        'user-123',
        'http://image.url',
        { size: '1024x1024' },
        false,
        {}
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        'conv-123',
        'user-123',
        expect.objectContaining({
          role: 'assistant',
          content: 'http://image.url',
          metadata: expect.objectContaining({
            messageType: 'image_result',
            model: 'image-assistant',
            size: '1024x1024',
          }),
        }),
        {}
      );
      expect(result).toEqual(mockMessage);
    });

    it('should stringify object image results before saving', async () => {
      const mockMessage = { role: 'assistant', content: '{"url":"http://image.url"}' };
      conversationService.addMessageToConversation.mockResolvedValueOnce(mockMessage);

      const result = await imageService.addImageResultMessage(
        'conv-123',
        'user-123',
        { url: 'http://image.url' },
        {},
        false,
        {}
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        'conv-123',
        'user-123',
        expect.objectContaining({
          content: '{"url":"http://image.url"}',
        }),
        {}
      );
      expect(result).toEqual(mockMessage);
    });

    it('should throw ApiError if adding result message fails', async () => {
      conversationService.addMessageToConversation.mockRejectedValueOnce(new Error('Failed to save'));

      await expect(
        imageService.addImageResultMessage('conv-123', 'user-123', 'result')
      ).rejects.toThrow(ApiError);
    });
  });

  describe('addErrorMessage', () => {
    it('should successfully add an error message to conversation', async () => {
      const mockMessage = { role: 'assistant', content: 'Something went wrong' };
      conversationService.addMessageToConversation.mockResolvedValueOnce(mockMessage);

      const result = await imageService.addErrorMessage(
        'conv-123',
        'user-123',
        'Something went wrong',
        new Error('Timeout'),
        false,
        {}
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        'conv-123',
        'user-123',
        expect.objectContaining({
          role: 'assistant',
          content: 'Something went wrong',
          metadata: expect.objectContaining({
            messageType: 'error',
            error: expect.objectContaining({
              message: 'Timeout',
            }),
          }),
        }),
        {}
      );
      expect(result).toEqual(mockMessage);
    });

    it('should return null and not throw if adding error message fails internally', async () => {
      conversationService.addMessageToConversation.mockRejectedValueOnce(new Error('Fatal DB Error'));

      const result = await imageService.addErrorMessage(
        'conv-123',
        'user-123',
        'Error',
        new Error('Fail')
      );

      expect(result).toBeNull();
    });
  });

  describe('getGuestConversations', () => {
    it('should retrieve guest conversations with correct query options', async () => {
      const mockConversations = {
        conversations: [
          { title: 'Guest Chat 1', messageCount: 2 },
          { title: 'Guest Chat 2', messageCount: 4 },
        ],
      };
      conversationHelpers.getUserConversations.mockResolvedValueOnce(mockConversations);

      const result = await imageService.getGuestConversations('guest-123');

      expect(conversationHelpers.getUserConversations).toHaveBeenCalledWith(
        'guest-123',
        {
          category: 'image',
          'metadata.userType': 'guest',
          limit: 100,
        },
        {
          lean: true,
          select: 'title metadata lastActivity messageCount',
        }
      );
      expect(result).toEqual(mockConversations.conversations);
    });

    it('should return empty array if no conversations are found', async () => {
      conversationHelpers.getUserConversations.mockResolvedValueOnce(null);

      const result = await imageService.getGuestConversations('guest-123');
      expect(result).toEqual([]);
    });

    it('should throw ApiError if retrieval fails', async () => {
      conversationHelpers.getUserConversations.mockRejectedValueOnce(new Error('DB Error'));

      await expect(imageService.getGuestConversations('guest-123')).rejects.toThrow(ApiError);
    });
  });

  describe('getGuestConversation', () => {
    it('should retrieve a single guest conversation by ID', async () => {
      const mockConversation = { _id: 'conv-123', metadata: { userType: 'guest' } };
      conversationHelpers.getConversationById.mockResolvedValueOnce(mockConversation);

      const result = await imageService.getGuestConversation('conv-123', 'guest-123');

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        'conv-123',
        'guest-123',
        { 'metadata.userType': 'guest', lean: true }
      );
      expect(result).toEqual(mockConversation);
    });

    it('should throw NOT_FOUND ApiError if guest conversation is not found', async () => {
      conversationHelpers.getConversationById.mockResolvedValueOnce(null);

      await expect(
        imageService.getGuestConversation('conv-123', 'guest-123')
      ).rejects.toThrow(new ApiError(httpStatus.NOT_FOUND, 'Guest conversation not found'));
    });

    it('should propagate other errors during retrieval', async () => {
      const dbError = new Error('Connection lost');
      conversationHelpers.getConversationById.mockRejectedValueOnce(dbError);

      await expect(
        imageService.getGuestConversation('conv-123', 'guest-123')
      ).rejects.toThrow(dbError);
    });
  });

  describe('getImageStats', () => {
    it('should calculate correct statistics for user conversations', async () => {
      const mockConversations = {
        totalCount: 2,
        conversations: [
          { messageCount: 10, lastActivity: '2023-10-01T12:00:00.000Z' },
          { messageCount: 5, lastActivity: '2023-10-01T11:00:00.000Z' },
        ],
      };
      conversationHelpers.getUserConversations.mockResolvedValueOnce(mockConversations);

      const stats = await imageService.getImageStats('user-123');

      expect(conversationHelpers.getUserConversations).toHaveBeenCalledWith(
        'user-123',
        { category: 'image', limit: 1000 },
        { lean: true, select: 'messageCount lastActivity' }
      );

      expect(stats).toEqual({
        totalConversations: 2,
        totalMessages: 15,
        totalImages: 7, // Math.floor(10/2) + Math.floor(5/2) = 5 + 2 = 7
        averageMessagesPerConversation: '7.50',
        lastActivity: '2023-10-01T12:00:00.000Z',
      });
    });

    it('should return default stats if user has no conversations', async () => {
      conversationHelpers.getUserConversations.mockResolvedValueOnce({ conversations: [] });

      const stats = await imageService.getImageStats('user-123');

      expect(stats).toEqual({
        totalConversations: 0,
        totalMessages: 0,
        totalImages: 0,
        averageMessagesPerConversation: 0,
        lastActivity: null,
      });
    });

    it('should throw ApiError if stats retrieval fails', async () => {
      conversationHelpers.getUserConversations.mockRejectedValueOnce(new Error('DB Error'));

      await expect(imageService.getImageStats('user-123')).rejects.toThrow(ApiError);
    });
  });

  describe('validateImageData', () => {
    it('should return invalid for non-string input', () => {
      const result = imageService.validateImageData(null);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Image data must be a non-empty string');
    });

    it('should validate a correct HTTP/HTTPS URL', () => {
      const result = imageService.validateImageData('https://example.com/image.png');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('url');
    });

    it('should invalidate an incorrect URL format', () => {
      const result = imageService.validateImageData('https://invalid-url-format^&%');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid image URL format');
    });

    it('should validate a correct base64 image data string', () => {
      const base64Str = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==';
      const result = imageService.validateImageData(base64Str);
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('base64');
    });

    it('should invalidate base64 image data exceeding 10MB limit', () => {
      // 15MB of characters to exceed 10MB binary size limit
      const hugeBase64 = 'data:image/png;base64,' + 'A'.repeat(15 * 1024 * 1024);
      const result = imageService.validateImageData(hugeBase64);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Image size exceeds the maximum limit of 10MB');
    });

    it('should invalidate incorrect base64 formats', () => {
      const badBase64 = 'data:image/invalid;base64,iVBORw0KGgoAAAANSUhEUg==';
      const result = imageService.validateImageData(badBase64);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid base64 image format');
    });

    it('should invalidate generic strings that are neither URL nor base64', () => {
      const result = imageService.validateImageData('just-some-random-text');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Image data must be a valid URL or base64 encoded image');
    });
  });
});