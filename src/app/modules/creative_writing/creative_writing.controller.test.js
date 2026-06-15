import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { conversationalAssistant, getConversationHistory } from './creative_writing.controller.js';
import { creativeWritingService } from './creative_writing.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import catchAsync from '../../../shared/catchAsync.js';

// Mock dependencies
vi.mock('../../../shared/catchAsync.js', () => ({
  default: vi.fn().mockImplementation(fn => fn),
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));

vi.mock('./creative_writing.service.js', () => ({
  creativeWritingService: {
    generateGuestUserId: vi.fn(),
    processConversationalRequest: vi.fn(),
    getConversationHistory: vi.fn(),
  },
}));

const mockLean = vi.fn();
const mockSort = vi.fn().mockImplementation(() => ({ lean: mockLean }));
const {
  mockFindOne
} = vi.hoisted(() => {
  const mockFindOne = vi.fn().mockImplementation(() => ({ sort: mockSort }));

  return {
    mockFindOne
  };
});
vi.mock('../payment/payment.model.js', () => ({
  default: { findOne: mockFindOne },
}));

describe('Creative Writing Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      user: null,
      isGuest: false,
    };
    res = {}; // Mocked sendResponse doesn't use res
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('conversationalAssistant', () => {
    it('should handle a new guest user by generating a userId', async () => {
      req.isGuest = true;
      req.body = { message: 'Write a poem' };
      const guestUserId = 'guest_12345';
      const serviceResult = { conversationId: 'conv_1', response: 'A poem...' };

      vi.spyOn(creativeWritingService, 'generateGuestUserId').mockReturnValue(guestUserId);
      vi.spyOn(creativeWritingService, 'processConversationalRequest').mockResolvedValue(serviceResult);

      await conversationalAssistant(req, res);

      expect(creativeWritingService.generateGuestUserId).toHaveBeenCalled();
      expect(creativeWritingService.processConversationalRequest).toHaveBeenCalledWith(
        guestUserId,
        'Write a poem',
        undefined,
        true,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: {
          ...serviceResult,
          userId: guestUserId,
        },
      });
    });

    it('should handle a returning guest user with an existing userId', async () => {
      req.isGuest = true;
      req.body = { message: 'Continue the poem', userId: 'guest_abcde' };
      const serviceResult = { conversationId: 'conv_1', response: 'The poem continues...' };

      vi.spyOn(creativeWritingService, 'processConversationalRequest').mockResolvedValue(serviceResult);

      await conversationalAssistant(req, res);

      expect(creativeWritingService.generateGuestUserId).not.toHaveBeenCalled();
      expect(creativeWritingService.processConversationalRequest).toHaveBeenCalledWith(
        'guest_abcde',
        'Continue the poem',
        undefined,
        true,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: {
          ...serviceResult,
          userId: 'guest_abcde',
        },
      });
    });

    it('should handle an authenticated user with a valid subscription', async () => {
      req.user = { userId: 'auth_user_1' };
      req.body = { message: 'Write a story' };
      const serviceResult = { conversationId: 'conv_2', response: 'A story...' };

      mockLean.mockResolvedValue({ usage: 5, monthlyPromptLimit: 10 });
      vi.spyOn(creativeWritingService, 'processConversationalRequest').mockResolvedValue(serviceResult);

      await conversationalAssistant(req, res);

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'auth_user_1' });
      expect(creativeWritingService.processConversationalRequest).toHaveBeenCalledWith(
        'auth_user_1',
        'Write a story',
        undefined,
        false,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: {
          ...serviceResult,
          userId: undefined, // userId should not be returned for authenticated users
        },
      });
    });

    it('should reject an authenticated user who has reached their subscription limit', async () => {
      req.user = { userId: 'auth_user_2' };
      req.body = { message: 'One more try' };

      mockLean.mockResolvedValue({ usage: 20, monthlyPromptLimit: 20 });

      await conversationalAssistant(req, res);

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'auth_user_2' });
      expect(creativeWritingService.processConversationalRequest).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your creative writing limit for this month. Please upgrade your plan to continue.',
      });
    });

    it('should reject an authenticated user with no active subscription', async () => {
      req.user = { userId: 'auth_user_3' };
      req.body = { message: 'Hello?' };

      mockLean.mockResolvedValue(null);

      await conversationalAssistant(req, res);

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'auth_user_3' });
      expect(creativeWritingService.processConversationalRequest).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your creative writing limit for this month. Please upgrade your plan to continue.',
      });
    });

    it('should prevent IDOR by ignoring userId in body for authenticated users', async () => {
      req.user = { userId: 'real_user_id' };
      req.body = { message: 'Write a story', userId: 'fake_user_id' }; // Attempt to impersonate
      const serviceResult = { conversationId: 'conv_3', response: 'A story...' };

      mockLean.mockResolvedValue({ usage: 1, monthlyPromptLimit: 10 });
      vi.spyOn(creativeWritingService, 'processConversationalRequest').mockResolvedValue(serviceResult);

      await conversationalAssistant(req, res);

      // Verify subscription check and service call use the secure ID from req.user
      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'real_user_id' });
      expect(creativeWritingService.processConversationalRequest).toHaveBeenCalledWith(
        'real_user_id',
        'Write a story',
        undefined,
        false,
        req
      );
    });

    it('should return 400 Bad Request if message is missing', async () => {
      req.body = {}; // No message
      req.isGuest = true;

      await conversationalAssistant(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Message is required',
      });
    });

    it('should return 500 Internal Server Error if userId cannot be generated for a new guest', async () => {
      req.isGuest = true;
      req.body = { message: 'Hello' };

      vi.spyOn(creativeWritingService, 'generateGuestUserId').mockReturnValue(null);

      await conversationalAssistant(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to generate user identifier',
      });
    });

    it('should handle errors from the service layer gracefully', async () => {
      req.isGuest = true;
      req.body = { message: 'This will fail' };
      const error = new Error('Service failed');
      error.statusCode = 503;

      vi.spyOn(creativeWritingService, 'generateGuestUserId').mockReturnValue('guest_fail');
      vi.spyOn(creativeWritingService, 'processConversationalRequest').mockRejectedValue(error);

      await conversationalAssistant(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error in creative writing assistant:', error);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: 503,
        success: false,
        message: 'Service failed',
      });
    });
  });

  describe('getConversationHistory', () => {
    it('should retrieve conversation history for an authenticated user', async () => {
      const userId = 'user_with_history';
      const conversationId = 'conv_history_1';
      const conversationData = { _id: conversationId, userId, messages: [] };

      req.user = { userId };
      req.params = { conversationId };

      vi.spyOn(creativeWritingService, 'getConversationHistory').mockResolvedValue(conversationData);

      await getConversationHistory(req, res);

      expect(creativeWritingService.getConversationHistory).toHaveBeenCalledWith(
        conversationId,
        userId,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation history retrieved successfully',
        data: conversationData,
      });
    });

    it('should handle errors when retrieving conversation history', async () => {
      const userId = 'user_with_history';
      const conversationId = 'conv_not_found';
      const error = new Error('Conversation not found for this user');
      error.statusCode = 404;

      req.user = { userId };
      req.params = { conversationId };

      vi.spyOn(creativeWritingService, 'getConversationHistory').mockRejectedValue(error);

      await getConversationHistory(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error getting conversation history:', error);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: 404,
        success: false,
        message: 'Conversation not found for this user',
      });
    });

    it('should default to 404 Not Found for generic errors', async () => {
        const userId = 'user_with_history';
        const conversationId = 'conv_generic_error';
        const error = new Error('Some database error');
  
        req.user = { userId };
        req.params = { conversationId };
  
        vi.spyOn(creativeWritingService, 'getConversationHistory').mockRejectedValue(error);
  
        await getConversationHistory(req, res);
  
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.NOT_FOUND,
          success: false,
          message: 'Some database error',
        });
      });
  });
});