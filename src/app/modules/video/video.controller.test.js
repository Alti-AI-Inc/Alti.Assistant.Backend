import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { videoController } from './video.controller.js';
import { videoService } from './video.service.js';
import { videoApp } from './video_assistant/workflow.js';
import { videoHelpers } from './video.helper.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import catchAsync from '../../../shared/catchAsync.js';

// Mock dependencies
vi.mock('../../../shared/catchAsync.js', () => ({
  default: vi.fn().mockImplementation(fn => fn), // Mock catchAsync to just return the function
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./video.service.js', () => ({
  videoService: {
    generateGuestUserId: vi.fn(),
    generateVideoConversationId: vi.fn(),
    handleVideoConversation: vi.fn(),
    addVideoQueryMessage: vi.fn(),
    addVideoResultMessage: vi.fn(),
    addErrorMessage: vi.fn(),
    getVideoStats: vi.fn(),
    getGuestConversation: vi.fn(),
    getGuestConversations: vi.fn(),
    getOperationStatus: vi.fn(),
  },
}));

vi.mock('./video_assistant/workflow.js', () => ({
  videoApp: {
    invoke: vi.fn(),
  },
}));

vi.mock('./video.helper.js', () => ({
  videoHelpers: {
    formatVideoResponse: vi.fn(),
    formatErrorMessage: vi.fn(),
  },
}));

vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: {
    getConversationById: vi.fn(),
  },
}));

describe('Video Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      user: null,
      isGuest: false,
    };
    res = {}; // sendResponse is mocked, so res object can be simple
    vi.clearAllMocks();
  });

  describe('generateVideo', () => {
    it('should return BAD_REQUEST if message is not provided', async () => {
      req.body = {};
      await videoController.generateVideo(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'A video prompt is required',
      });
    });

    it('should handle authenticated user, first message successfully', async () => {
      req.user = { userId: 'auth_user_123' };
      req.body = { message: 'Create a video of a cat' };

      videoService.handleVideoConversation.mockResolvedValue({
        conversationId: 'conv_abc',
        messageCount: 0,
      });
      videoApp.invoke.mockResolvedValue({
        videoUrl: 'http://example.com/video.mp4',
        response: 'Here is your video.',
      });
      videoHelpers.formatVideoResponse.mockReturnValue({
        response: 'Here is your video.',
        video: 'http://example.com/video.mp4',
        conversationId: 'conv_abc',
      });

      await videoController.generateVideo(req, res);

      expect(videoService.handleVideoConversation).toHaveBeenCalledWith(
        'auth_user_123',
        undefined,
        'Create a video of a cat',
        false,
        req
      );
      expect(videoApp.invoke).toHaveBeenCalledWith(
        { initialPrompt: 'Create a video of a cat' },
        { configurable: { thread_id: 'conv_abc' } }
      );
      expect(videoService.addVideoResultMessage).toHaveBeenCalledWith(
        'conv_abc',
        'auth_user_123',
        'Here is your video.',
        { video: 'http://example.com/video.mp4' },
        false,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Video generation completed successfully',
        data: expect.objectContaining({
          userType: 'authenticated',
          conversationId: 'conv_abc',
        }),
      });
    });

    it('should handle authenticated user, subsequent message successfully', async () => {
      req.user = { userId: 'auth_user_123' };
      req.body = {
        message: 'Make it longer',
        conversationId: 'conv_abc',
      };

      videoService.handleVideoConversation.mockResolvedValue({
        conversationId: 'conv_abc',
        messageCount: 2,
      });
      videoApp.invoke.mockResolvedValue({
        responseMessage: 'How much longer?',
      });

      await videoController.generateVideo(req, res);

      expect(videoApp.invoke).toHaveBeenCalledWith(
        { userResponse: 'Make it longer' },
        { configurable: { thread_id: 'conv_abc' } }
      );
      expect(videoService.addVideoResultMessage).toHaveBeenCalledWith(
        'conv_abc',
        'auth_user_123',
        'How much longer?',
        { video: null },
        false,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Video generation completed successfully',
        data: expect.objectContaining({
          userType: 'authenticated',
        }),
      });
    });

    it('should handle guest user successfully', async () => {
      req.isGuest = true;
      req.body = { message: 'A video of a dog' };

      videoService.generateGuestUserId.mockReturnValue('guest_xyz');
      videoService.generateVideoConversationId.mockReturnValue('conv_guest_123');
      videoService.handleVideoConversation.mockResolvedValue({
        conversationId: 'conv_guest_123',
        messageCount: 0,
      });
      videoApp.invoke.mockResolvedValue({
        videoUrl: 'http://example.com/dog.mp4',
      });

      await videoController.generateVideo(req, res);

      expect(videoService.generateGuestUserId).toHaveBeenCalled();
      expect(videoService.handleVideoConversation).toHaveBeenCalledWith(
        'guest_xyz',
        undefined,
        'A video of a dog',
        true,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Video generation completed successfully',
        data: expect.objectContaining({
          userType: 'guest',
          userId: 'guest_xyz',
        }),
      });
    });

    it('should handle errors during video generation and log them', async () => {
      req.user = { userId: 'auth_user_123' };
      req.body = { message: 'Create a video', conversationId: 'conv_abc' };
      const error = new Error('Assistant failed');

      videoService.handleVideoConversation.mockResolvedValue({
        conversationId: 'conv_abc',
        messageCount: 2,
      });
      videoApp.invoke.mockRejectedValue(error);
      videoHelpers.formatErrorMessage.mockReturnValue('Formatted error message');

      await videoController.generateVideo(req, res);

      expect(logger.error).toHaveBeenCalledWith('Video Assistant Error:', error);
      expect(videoService.addErrorMessage).toHaveBeenCalledWith(
        'conv_abc',
        'auth_user_123',
        'Formatted error message',
        error,
        false,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An internal error occurred while processing your video request',
        data: {
          conversationId: 'conv_abc',
          userType: 'authenticated',
        },
      });
    });

    it('should prevent IDOR by ignoring userId from request body', async () => {
      req.user = { userId: 'auth_user_789' };
      req.body = {
        message: 'A test video',
        userId: 'malicious_user_abc', // This should be ignored
      };

      videoService.handleVideoConversation.mockResolvedValue({
        conversationId: 'conv_123',
        messageCount: 0,
      });
      videoApp.invoke.mockResolvedValue({
        videoUrl: 'http://example.com/video.mp4',
      });

      await videoController.generateVideo(req, res);

      // Verify that the authenticated user's ID is used, not the one from the body
      expect(videoService.handleVideoConversation).toHaveBeenCalledWith(
        'auth_user_789',
        undefined,
        'A test video',
        false,
        req
      );
    });
  });

  describe('getVideoStats', () => {
    it('should return stats for an authenticated user', async () => {
      req.user = { userId: 'user_stats_123' };
      const stats = { count: 5, duration: 120 };
      videoService.getVideoStats.mockResolvedValue(stats);

      await videoController.getVideoStats(req, res);

      expect(videoService.getVideoStats).toHaveBeenCalledWith(
        'user_stats_123',
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Video statistics retrieved successfully',
        data: stats,
      });
    });

    it('should return UNAUTHORIZED for a guest user', async () => {
      req.isGuest = true;

      await videoController.getVideoStats(req, res);

      expect(videoService.getVideoStats).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'Statistics are only available for authenticated users',
      });
    });
  });

  describe('getVideoConversation', () => {
    it('should return BAD_REQUEST if conversationId is missing', async () => {
      req.params = {};
      await videoController.getVideoConversation(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Conversation ID is required',
      });
    });

    it('should retrieve conversation for an authenticated user', async () => {
      req.user = { userId: 'auth_user_456' };
      req.params = { conversationId: 'conv_xyz' };
      const conversation = { id: 'conv_xyz', messages: [] };
      conversationHelpers.getConversationById.mockResolvedValue(conversation);

      await videoController.getVideoConversation(req, res);

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        'conv_xyz',
        'auth_user_456',
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation retrieved successfully',
        data: { conversation, userType: 'authenticated' },
      });
    });

    it('should retrieve conversation for a guest user', async () => {
      req.isGuest = true;
      req.params = { conversationId: 'conv_guest_789' };
      const conversation = { id: 'conv_guest_789', messages: [] };
      videoService.getGuestConversation.mockResolvedValue(conversation);

      await videoController.getVideoConversation(req, res);

      expect(videoService.getGuestConversation).toHaveBeenCalledWith(
        'conv_guest_789',
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation retrieved successfully',
        data: { conversation, userType: 'guest' },
      });
    });

    it('should return NOT_FOUND if conversation does not exist', async () => {
      req.user = { userId: 'auth_user_456' };
      req.params = { conversationId: 'conv_not_found' };
      const error = new Error('Not found');
      conversationHelpers.getConversationById.mockRejectedValue(error);

      await videoController.getVideoConversation(req, res);

      expect(logger.error).toHaveBeenCalledWith(
        'Error retrieving video conversation:',
        error
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
    });
  });

  describe('getGuestConversations', () => {
    it('should return BAD_REQUEST if guestUserId is missing', async () => {
      req.params = {};
      await videoController.getGuestConversations(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Guest user ID is required',
      });
    });

    it('should retrieve conversations for a given guest user ID', async () => {
      req.params = { guestUserId: 'guest_abc' };
      const conversations = [{ id: 'c1' }, { id: 'c2' }];
      videoService.getGuestConversations.mockResolvedValue(conversations);

      await videoController.getGuestConversations(req, res);

      expect(videoService.getGuestConversations).toHaveBeenCalledWith(
        'guest_abc',
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Guest conversations retrieved successfully',
        data: {
          conversations,
          totalCount: 2,
          userType: 'guest',
          userId: 'guest_abc',
        },
      });
    });
  });

  describe('getOperationStatus', () => {
    it('should return BAD_REQUEST if operationId is missing', async () => {
      req.body = {};
      await videoController.getOperationStatus(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Operation ID is required',
      });
    });

    it('should return status if operation is found', async () => {
      req.body = { operationId: 'op_123' };
      const status = { id: 'op_123', status: 'completed' };
      videoService.getOperationStatus.mockResolvedValue(status);

      await videoController.getOperationStatus(req, res);

      expect(videoService.getOperationStatus).toHaveBeenCalledWith('op_123');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Operation status retrieved successfully',
        data: status,
      });
    });

    it('should return NOT_FOUND if operation is not found', async () => {
      req.body = { operationId: 'op_not_found' };
      videoService.getOperationStatus.mockResolvedValue(null);

      await videoController.getOperationStatus(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Operation not found',
      });
    });

    it('should handle errors during status retrieval', async () => {
      req.body = { operationId: 'op_error' };
      const error = new Error('DB connection failed');
      videoService.getOperationStatus.mockRejectedValue(error);

      await videoController.getOperationStatus(req, res);

      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching operation status:',
        error
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to retrieve operation status',
      });
    });
  });
});