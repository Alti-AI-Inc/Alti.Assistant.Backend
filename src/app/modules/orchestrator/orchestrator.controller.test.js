import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orchestratorController } from './orchestrator.controller.js';
import { orchestratorService } from './orchestrator.service.js';
import sendResponse from '../../../shared/sendResponse.js';
import catchAsync from '../../../shared/catchAsync.js';
import httpStatus from 'http-status';

// Mock external dependencies
vi.mock('./orchestrator.service.js', () => ({
  orchestratorService: {
    classifyAndDispatch: vi.fn(),
  },
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  __esModule: true,
  default: vi.fn(),
}));

// Mock catchAsync to directly execute the provided async function
// This allows us to test the inner logic of the controller without
// needing to simulate catchAsync's error handling wrapper.
vi.mock('../../../shared/catchAsync.js', () => ({
  __esModule: true,
  default: (fn) => fn,
}));

describe('orchestratorController', () => {
  let mockReq;
  let mockRes;
  let next; // For catchAsync, though not directly used in this controller's logic

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    mockReq = {
      body: {},
      user: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn(); // Mock next function for middleware context
  });

  describe('routePrompt', () => {
    it('should classify and dispatch a prompt using message from req.body and userId from req.user.id', async () => {
      const mockMessage = 'Hello, AI!';
      const mockSessionId = 'session123';
      const mockUserId = 'user456';
      const mockConversationId = 'conv789';
      const mockServiceResult = { response: 'Processed message' };

      mockReq.body = {
        message: mockMessage,
        sessionId: mockSessionId,
        conversationId: mockConversationId,
      };
      mockReq.user = { id: mockUserId };

      orchestratorService.classifyAndDispatch.mockResolvedValue(mockServiceResult);

      // Call the controller method
      await orchestratorController.routePrompt(mockReq, mockRes, next);

      // Assertions
      expect(orchestratorService.classifyAndDispatch).toHaveBeenCalledTimes(1);
      expect(orchestratorService.classifyAndDispatch).toHaveBeenCalledWith(
        mockMessage,
        mockSessionId,
        mockUserId,
        mockConversationId,
        undefined
      );

      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Prompt successfully routed and processed.',
        data: mockServiceResult,
      });
    });

    it('should classify and dispatch a prompt using prompt from req.body and userId from req.user._id', async () => {
      const mockPrompt = 'What is the weather?';
      const mockSessionId = 'session456';
      const mockUserId = 'user789';
      const mockConversationId = 'conv101';
      const mockServiceResult = { response: 'Weather forecast' };

      mockReq.body = {
        prompt: mockPrompt,
        sessionId: mockSessionId,
        conversationId: mockConversationId,
      };
      mockReq.user = { _id: mockUserId };

      orchestratorService.classifyAndDispatch.mockResolvedValue(mockServiceResult);

      await orchestratorController.routePrompt(mockReq, mockRes, next);

      expect(orchestratorService.classifyAndDispatch).toHaveBeenCalledTimes(1);
      expect(orchestratorService.classifyAndDispatch).toHaveBeenCalledWith(
        mockPrompt,
        mockSessionId,
        mockUserId,
        mockConversationId,
        undefined
      );

      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Prompt successfully routed and processed.',
        data: mockServiceResult,
      });
    });

    it('should classify and dispatch a prompt using message from req.body and userId from req.user.userId', async () => {
      const mockMessage = 'Tell me a story.';
      const mockSessionId = 'session789';
      const mockUserId = 'user101';
      const mockConversationId = 'conv202';
      const mockServiceResult = { response: 'Once upon a time...' };

      mockReq.body = {
        message: mockMessage,
        sessionId: mockSessionId,
        conversationId: mockConversationId,
      };
      mockReq.user = { userId: mockUserId };

      orchestratorService.classifyAndDispatch.mockResolvedValue(mockServiceResult);

      await orchestratorController.routePrompt(mockReq, mockRes, next);

      expect(orchestratorService.classifyAndDispatch).toHaveBeenCalledTimes(1);
      expect(orchestratorService.classifyAndDispatch).toHaveBeenCalledWith(
        mockMessage,
        mockSessionId,
        mockUserId,
        mockConversationId,
        undefined
      );

      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Prompt successfully routed and processed.',
        data: mockServiceResult,
      });
    });

    it('should handle missing sessionId and conversationId gracefully by passing undefined', async () => {
      const mockMessage = 'Test message without session/conversation ID.';
      const mockUserId = 'user_no_session';
      const mockServiceResult = { response: 'Processed without session' };

      mockReq.body = {
        message: mockMessage,
        // sessionId and conversationId are intentionally missing
      };
      mockReq.user = { id: mockUserId };

      orchestratorService.classifyAndDispatch.mockResolvedValue(mockServiceResult);

      await orchestratorController.routePrompt(mockReq, mockRes, next);

      expect(orchestratorService.classifyAndDispatch).toHaveBeenCalledTimes(1);
      expect(orchestratorService.classifyAndDispatch).toHaveBeenCalledWith(
        mockMessage,
        undefined, // Expect undefined for missing sessionId
        mockUserId,
        undefined,  // Expect undefined for missing conversationId
        undefined
      );

      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Prompt successfully routed and processed.',
        data: mockServiceResult,
      });
    });

    it('should return 403 Forbidden if req.user is empty or does not contain id, _id, or userId', async () => {
      const mockMessage = 'Test message with no user ID.';
      const mockSessionId = 'session_no_user';
      const mockConversationId = 'conv_no_user';

      mockReq.body = {
        message: mockMessage,
        sessionId: mockSessionId,
        conversationId: mockConversationId,
      };
      mockReq.user = {}; // Empty user object

      await orchestratorController.routePrompt(mockReq, mockRes, next);

      expect(orchestratorService.classifyAndDispatch).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'User ID is missing or invalid. Authentication required.',
      });
    });

    it('should prioritize message over prompt if both are present', async () => {
      const mockMessage = 'Preferred message';
      const mockPrompt = 'Ignored prompt';
      const mockSessionId = 'session_priority';
      const mockUserId = 'user_priority';
      const mockConversationId = 'conv_priority';
      const mockServiceResult = { response: 'Message prioritized' };

      mockReq.body = {
        message: mockMessage,
        prompt: mockPrompt,
        sessionId: mockSessionId,
        conversationId: mockConversationId,
      };
      mockReq.user = { id: mockUserId };

      orchestratorService.classifyAndDispatch.mockResolvedValue(mockServiceResult);

      await orchestratorController.routePrompt(mockReq, mockRes, next);

      expect(orchestratorService.classifyAndDispatch).toHaveBeenCalledTimes(1);
      expect(orchestratorService.classifyAndDispatch).toHaveBeenCalledWith(
        mockMessage, // Should use message
        mockSessionId,
        mockUserId,
        mockConversationId,
        undefined
      );

      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Prompt successfully routed and processed.',
        data: mockServiceResult,
      });
    });

    it('should return 400 Bad Request if neither message nor prompt are present', async () => {
      const mockSessionId = 'session_no_prompt';
      const mockUserId = 'user_no_prompt';
      const mockConversationId = 'conv_no_prompt';

      mockReq.body = {
        // message and prompt are intentionally missing
        sessionId: mockSessionId,
        conversationId: mockConversationId,
      };
      mockReq.user = { id: mockUserId };

      await orchestratorController.routePrompt(mockReq, mockRes, next);

      expect(orchestratorService.classifyAndDispatch).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Prompt message is required and cannot be empty.',
      });
    });
  });
});