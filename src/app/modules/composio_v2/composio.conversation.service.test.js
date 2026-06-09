```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';
import { composioConversationService } from './composio.conversation.service.js';

// Mock external dependencies
vi.mock('http-status', () => ({ default: { INTERNAL_SERVER_ERROR: 500 } }));
vi.mock('../../../errors/ApiError.js', () => ({
  default: vi.fn((statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
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

// Mock mongoose for ObjectId generation
vi.mock('mongoose', () => {
  const mockObjectId = vi.fn(() => ({
    toString: vi.fn(() => 'mockObjectIdString'),
  }));
  return {
    default: {
      Types: {
        ObjectId: mockObjectId,
      },
    },
  };
});

describe('composioConversationService', () => {
  const mockUserId = 'user123';
  const mockConversationId = 'conv456';
  const mockUserInput = 'Test user input for automation task';
  const mockReq = {}; // Mock Express request object

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Mock Date.now and Math.random for deterministic ID generation
    vi.spyOn(Date, 'now').mockReturnValue(1678886400000); // A fixed timestamp
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789); // A fixed random number
    vi.spyOn(console, 'log').mockImplementation(() => {}); // Suppress console.log during tests
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateGuestUserId', () => {
    it('should generate a unique guest user ID using mongoose ObjectId format', () => {
      const guestUserId = composioConversationService.generateGuestUserId();
      expect(mongoose.Types.ObjectId).toHaveBeenCalledTimes(1);
      expect(guestUserId).toBe('mockObjectIdString');
    });
  });

  describe('generateComposioConversationId', () => {
    it('should generate a unique Composio conversation ID with a specific prefix', () => {
      const composioConvId = composioConversationService.generateComposioConversationId();
      expect(composioConvId).toMatch(/^composio_\d+_[a-z0-9]{9}$/);
      expect(composioConvId).toBe('composio_1678886400000_123456789'); // Based on mocked Date.now and Math.random
    });
  });

  describe('handleComposioConversation', () => {
    const mockConversation = {
      _id: mockConversationId,
      userId: mockUserId,
      title: 'Existing conversation',
      messages: [],
      metadata: { category: 'composio', userType: 'authenticated' },
    };

    it('should retrieve an existing conversation if conversationId is provided and found for authenticated user', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      const result = await composioConversationService.handleComposioConversation(
        mockUserId,
        mockConversationId,
        mockUserInput,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        mockReq
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(result).toEqual(mockConversation);
    });

    it('should retrieve an existing guest conversation if conversationId is provided and found for guest user', async () => {
      const mockGuestConversation = {
        ...mockConversation,
        metadata: { category: 'composio', userType: 'guest' },
      };
      conversationHelpers.getConversationById.mockResolvedValue(mockGuestConversation);

      const result = await composioConversationService.handleComposioConversation(
        mockUserId,
        mockConversationId,
        mockUserInput,
        true,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        null, // userId is null for guest lookup in helper
        mockReq
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(result).toEqual(mockGuestConversation);
    });

    it('should create a new conversation if conversationId is provided but not found (authenticated user)', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Not found')); // Simulate not found
      conversationService.createConversation.mockResolvedValue({
        _id: 'newConvId',
        userId: mockUserId,
        title: 'Automation task: Test user input for automation task',
        metadata: { category: 'composio', model: 'ai-classification-agent', toolType: 'multi-app', userType: 'authenticated' },
        is_deep_search: false,
      });

      const result = await composioConversationService.handleComposioConversation(
        mockUserId,
        mockConversationId,
        mockUserInput,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        mockReq
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: 'Automation task: Test user input for automation task',
          metadata: { category: 'composio', model: 'ai-classification-agent', toolType: 'multi-app', userType: 'authenticated' },
          is_deep_search: false,
        },
        expect.stringMatching(/^composio_\d+_[a-z0-9]{9}$/)
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Conversation ${mockConversationId} not found for user ${mockUserId}, creating new one`
      );
      expect(result).toHaveProperty('_id', 'newConvId');
    });

    it('should create a new conversation if conversationId is provided but not found (guest user)', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Not found')); // Simulate not found
      conversationService.createConversation.mockResolvedValue({
        _id: 'newGuestConvId',
        userId: mockUserId,
        title: 'Automation task: Test user input for automation task',
        metadata: { category: 'composio', model: 'ai-classification-agent', toolType: 'multi-app', userType: 'guest', isGuest: true },
        is_deep_search: false,
      });

      const result = await composioConversationService.handleComposioConversation(
        mockUserId,
        mockConversationId,
        mockUserInput,
        true,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        null,
        mockReq
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: 'Automation task: Test user input for automation task',
          metadata: { category: 'composio', model: 'ai-classification-agent', toolType: 'multi-app', userType: 'guest', isGuest: true },
          is_deep_search: false,
        },
        expect.stringMatching(/^composio_\d+_[a-z0-9]{9}$/)
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Conversation ${mockConversationId} not found for user ${mockUserId}, creating new one`
      );
      expect(result).toHaveProperty('_id', 'newGuestConvId');
    });

    it('should create a new conversation if conversationId is provided for guest but it is not a guest conversation', async () => {
      const mockAuthConversation = {
        ...mockConversation,
        metadata: { category: 'composio', userType: 'authenticated' },
      };
      conversationHelpers.getConversationById.mockResolvedValue(mockAuthConversation);
      conversationService.createConversation.mockResolvedValue({
        _id: 'newGuestConvId',
        userId: mockUserId,
        title: 'Automation task: Test user input for automation task',
        metadata: { category: 'composio', model: 'ai-classification-agent', toolType: 'multi-app', userType: 'guest', isGuest: true },
        is_deep_search: false,
      });

      const result = await composioConversationService.handleComposioConversation(
        mockUserId,
        mockConversationId,
        mockUserInput,
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
          title: 'Automation task: Test user input for automation task',
          metadata: { category: 'composio', model: 'ai-classification-agent', toolType: 'multi-app', userType: 'guest', isGuest: true },
          is_deep_search: false,
        },
        expect.stringMatching(/^composio_\d+_[a-z0-9]{9}$/)
      );
      expect(result).toHaveProperty('_id', 'newGuestConvId');
    });

    it('should create a new conversation if conversationId is null', async () => {
      conversationService.createConversation.mockResolvedValue({
        _id: 'newConvIdFromNull',
        userId: mockUserId,
        title: 'Automation task: Test user input for automation task',
        metadata: { category: 'composio', model: 'ai-classification-agent', toolType: 'multi-app', userType: 'authenticated' },
        is_deep_search: false,
      });

      const result = await composioConversationService.handleComposioConversation(
        mockUserId,
        null,
        mockUserInput,