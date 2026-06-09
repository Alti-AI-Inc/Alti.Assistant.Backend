import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { codeController, performCodeTask, getCodeStats } from './code.controller.js';

// Mock external dependencies
const mockCatchAsync = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    // In a real scenario, catchAsync would pass to error middleware.
    // For unit testing, we'll re-throw or handle as needed.
    throw error;
  }
};

vi.mock('../../../shared/catchAsync.js', () => ({
  default: mockCatchAsync,
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

const mockSendResponse = vi.fn();
vi.mock('../../../shared/sendResponse.js', () => ({
  default: mockSendResponse,
}));

const mockCodeService = {
  generateGuestUserId: vi.fn(),
  generateCodeConversationId: vi.fn(),
  handleCodeConversation: vi.fn(),
  addCodeQueryMessage: vi.fn(),
  addCodeResultMessage: vi.fn(),
  addErrorMessage: vi.fn(),
  getCodeStats: vi.fn(),
};
vi.mock('./code.service.js', () => ({
  codeService: mockCodeService,
}));

const mockCodeAssistantApp = {
  invoke: vi.fn(),
};
vi.mock('./code_assistant/workflow.js', () => ({
  codeAssistantApp: mockCodeAssistantApp,
}));

const mockSubscriptionModel = {
  findOne: vi.fn().mockReturnThis(), // Allows chaining .sort() and .lean()
  sort: vi.fn().mockReturnThis(),
  lean: vi.fn(),
};
vi.mock('../payment/payment.model.js', () => ({
  default: mockSubscriptionModel,
}));

const mockConversationHelpers = {
  getConversationById: vi.fn(),
};
vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: mockConversationHelpers,
}));

const mockCodeHelpers = {
  formatCodeResponse: vi.fn(),
  formatErrorMessage: vi.fn(),
};
vi.mock('./code.helper.js', () => ({
  codeHelpers: mockCodeHelpers,
}));

describe('codeController', () => {
  let req, res;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    req = {
      body: {},
      user: null,
      isGuest: false,
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    // Default mock implementations for common services
    mockCodeService.generateGuestUserId.mockReturnValue('guest-123');
    mockCodeService.generateCodeConversationId.mockReturnValue('conv-new-123');
    mockCodeService.handleCodeConversation.mockResolvedValue({
      conversationId: 'conv-123',
      messageCount: 0,
    });
    mockCodeService.addCodeQueryMessage.mockResolvedValue(null);
    mockCodeService.addCodeResultMessage.mockResolvedValue(null);
    mockCodeService.addErrorMessage.mockResolvedValue(null);
    mockCodeService.getCodeStats.mockResolvedValue({ total: 5, used: 2 });

    mockCodeAssistantApp.invoke.mockResolvedValue({ response: 'AI generated code' });

    mockCodeHelpers.formatCodeResponse.mockReturnValue({
      code: 'formatted code',
      conversationId: 'conv-123',
      messageCount: 2,
    });
    mockCodeHelpers.formatErrorMessage.mockReturnValue('formatted error message');

    // Default subscription mock (no subscription)
    mockSubscriptionModel.lean.mockResolvedValue(null);
    mockConversationHelpers.getConversationById.mockResolvedValue(0);
  });

  describe('performCodeTask', () => {
    it('should return BAD_REQUEST if message is missing', async () => {
      req.body = { conversationId: 'conv-123' };

      await performCodeTask(req, res);

      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'A code query is required',
      });
    });

    it('should handle guest user flow successfully', async () => {
      req.isGuest = true;
      req.body = { message: 'guest query' };

      await performCodeTask(req, res);

      expect(mockCodeService.generateGuestUserId).toHaveBeenCalled();
      expect(mockSubscriptionModel.findOne).not.toHaveBeenCalled(); // No subscription check for guests
      expect(mockConversationHelpers.getConversationById).not.toHaveBeenCalled(); // No conversation check for guests
      expect(mockCodeService.handleCodeConversation).toHaveBeenCalledWith(
        'guest-123',
        undefined, // No conversationId in req.body
        'guest query',
        true,
        req
      );
      expect(mockCodeService.addCodeQueryMessage).toHaveBeenCalledWith(
        'conv-123',
        'guest-123',
        'guest query',
        true,
        req
      );
      expect(mockCodeAssistantApp.invoke).toHaveBeenCalledWith(
        { userInput: 'guest query', history: [{ role: 'user', content: 'guest query' }] },
        { configurable: { thread_id: 'conv-123' } }
      );
      expect(mockCodeService.addCodeResultMessage).toHaveBeenCalledWith(
        'conv-123',
        'guest-123',
        'AI generated code',
        {},
        true,
        req
      );
      expect(mockCodeHelpers.formatCodeResponse).toHaveBeenCalledWith(
        'AI generated code',
        'conv-123',
        2
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Code task completed successfully',
        data: {
          code: 'formatted code',
          conversationId: 'conv-123',
          messageCount: 2,
          userType: 'guest',
          userId: 'guest-123',
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Code Assistant Result for conversation: conv-123 (guest user)'
      );
    });

    it('should handle authenticated user flow successfully with new conversation', async () => {
      req.user = { userId: 'user-123' };
      req.body = { message: 'auth query' };
      mockSubscriptionModel.lean.mockResolvedValue({ usage: 10, createdAt: new Date() }); // User has subscription
      mockCodeService.handleCodeConversation.mockResolvedValue({
        conversationId: 'conv-new-123',
        messageCount: 0,
      });

      await performCodeTask(req, res);

      expect(mockCodeService.generateGuestUserId).not.toHaveBeenCalled();
      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user-123' });
      expect(mockSubscriptionModel.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockSubscriptionModel.lean).toHaveBeenCalled();
      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith(
        undefined, // No conversationId in req.body
        'user-123',
        req
      );
      expect(mockCodeService.generateCodeConversationId).toHaveBeenCalled();
      expect(mockCodeService.handleCodeConversation).toHaveBeenCalledWith(
        'user-123',
        undefined,
        'auth query',
        false,
        req
      );
      expect(mockCodeService.addCodeQueryMessage).toHaveBeenCalledWith(
        'conv-new-123',
        'user-123',
        'auth query',
        false,
        req
      );
      expect(mockCodeAssistantApp.invoke).toHaveBeenCalledWith(
        { userInput: 'auth query', history: [{ role: 'user', content: 'auth query' }] },
        { configurable: { thread_id: 'conv-new-123' } }
      );
      expect(mockCodeService.addCodeResultMessage).toHaveBeenCalledWith(
        'conv-new-123',
        'user-123',
        'AI generated code',
        {},
        false,
        req
      );
      expect(mockCodeHelpers.formatCodeResponse).toHaveBeenCalledWith(
        'AI generated code',
        'conv-new-123',
        2
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Code task completed successfully',
        data: {
          code: 'formatted code',
          conversationId: 'conv-new-123',
          messageCount: 2,
          userType: 'authenticated',
          userId: undefined,
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Code Assistant Result for conversation: conv-new-123 (authenticated user)'
      );
    });

    it('should handle authenticated user flow successfully with existing conversation', async () => {
      req.user = { _id: 'user-456' }; // Test with _id
      req.body = { message: 'existing conv query', conversationId: 'conv-existing-456' };
      mockSubscriptionModel.lean.mockResolvedValue({ usage: 10, createdAt: new Date() });
      mockConversationHelpers.getConversationById.mockResolvedValue({ messageCount: 5 });
      mockCodeService.handleCodeConversation.mockResolvedValue({
        conversationId: 'conv-existing-456',
        messageCount: 5,
      });

      await performCodeTask(req, res);

      expect(mockCodeService.generateGuestUserId).not.toHaveBeenCalled();
      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user-456' });
      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith(
        'conv-existing-456',
        'user-456',
        req
      );
      expect(mockCodeService.generateCodeConversationId).not.toHaveBeenCalled(); // Existing conversationId provided
      expect(mockCodeService.handleCodeConversation).toHaveBeenCalledWith(
        'user-456',
        'conv-existing-456',
        'existing conv query',
        false,
        req
      );
      expect(mockCodeService.addCodeQueryMessage).toHaveBeenCalledWith(
        'conv-existing-456',
        'user-456',
        'existing conv query',
        false,
        req
      );
      expect(mockCodeAssistantApp.invoke).toHaveBeenCalledWith(
        {
          userInput: 'existing conv query',
          history: [{ role: 'user', content: 'existing conv query' }],
        },
        { configurable: { thread_id: 'conv-existing-456' } }
      );
      expect(mockCodeService.addCodeResultMessage).toHaveBeenCalledWith(
        'conv-existing-456',
        'user-456',
        'AI generated code',
        {},
        false,
        req
      );
      expect(mockCodeHelpers.formatCodeResponse).toHaveBeenCalledWith(
        'AI generated code',
        'conv-existing-456',
        7 // 5 (existing) + 2 (user + assistant)
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Code task completed successfully',
        data: {
          code: 'formatted code',
          conversationId: 'conv-existing-456',
          messageCount: 7,
          userType: 'authenticated',
          userId: undefined,
        },
      });
    });

    it('should return FORBIDDEN if authenticated user exceeds code assistance limit', async () => {
      req.user = { userId: 'user-limit' };
      req.body = { message: 'limit query', conversationId: 'conv-limit' };
      mockSubscriptionModel.lean.mockResolvedValue({ usage: 5, createdAt: new Date() }); // Limit is 5
      mockConversationHelpers.getConversationById.mockResolvedValue({ messageCount: 5 }); // Already used 5

      await performCodeTask(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user-limit' });
      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith(
        'conv-limit',
        'user-limit',
        req
      );
      expect(mockCodeAssistantApp.invoke).not.toHaveBeenCalled(); // AI not invoked
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your code assistance limit for this month. Please upgrade your plan to continue.',
      });
    });

    it('should return FORBIDDEN if authenticated user has no subscription and tries to use code assistance', async () => {
      req.user = { userId: 'user-no-sub' };
      req.body = { message: 'no sub query' };
      mockSubscriptionModel.lean.mockResolvedValue(null); // No subscription found
      mockConversationHelpers.getConversationById.mockResolvedValue(0); // No existing conversation

      await performCodeTask(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user-no-sub' });
      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith(
        undefined,
        'user-no-sub',
        req
      );
      expect(mockCodeAssistantApp.invoke).not.toHaveBeenCalled(); // AI not invoked
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your code assistance limit for this month. Please upgrade your plan to continue.',
      });
    });

    it('should handle internal server error during AI invocation', async () => {
      req.user = { userId: 'user-error' };
      req.body = { message: 'error query', conversationId: 'conv-error' };
      mockSubscriptionModel.lean.mockResolvedValue({ usage: 10, createdAt: new Date() });
      mockConversationHelpers.getConversationById.mockResolvedValue({ messageCount: 0 });
      const aiError = new Error('AI service failed');
      mockCodeAssistantApp.invoke.mockRejectedValue(aiError);

      await performCodeTask(req, res);

      expect(mockCodeAssistantApp.invoke).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Code Assistant Error:', aiError);
      expect(mockCodeHelpers.formatErrorMessage).toHaveBeenCalledWith(aiError, 'error query');
      expect(mockCodeService.addErrorMessage).toHaveBeenCalledWith(
        'conv-error',
        'user-error',
        'formatted error message',
        aiError,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An internal error occurred while processing your code request',
        data: {
          conversationId: 'conv-error',
          userType: 'authenticated',
        },
      });
    });

    it('should handle internal server error during AI invocation and fail to save error to conversation', async () => {
      req.user = { userId: 'user-error-conv' };
      req.body = { message: 'error query', conversationId: 'conv-error-save' };
      mockSubscriptionModel.lean.mockResolvedValue({ usage: 10, createdAt: new Date() });
      mockConversationHelpers.getConversationById.mockResolvedValue({ messageCount: 0 });
      const aiError = new Error('AI service failed');
      mockCodeAssistantApp.invoke.mockRejectedValue(aiError);
      const convError = new Error('Failed to save conversation');
      mockCodeService.addErrorMessage.mockRejectedValue(convError);

      await performCodeTask(req, res);

      expect(mockCodeAssistantApp.invoke).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Code Assistant Error:', aiError);
      expect(mockCodeService.addErrorMessage).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to save error to conversation:', convError);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An internal error occurred while processing your code request',
        data: {
          conversationId: 'conv-error-save',
          userType: 'authenticated',
        },
      });
    });

    it('should generate new conversationId for error if not provided in request', async () => {
      req.user = { userId: 'user-error-new-conv' };
      req.body = { message: 'error query' }; // No conversationId
      mockSubscriptionModel.lean.mockResolvedValue({ usage: 10, createdAt: new Date() });
      mockConversationHelpers.getConversationById.mockResolvedValue(0);
      const aiError = new Error('AI service failed');
      mockCodeAssistantApp.invoke.mockRejectedValue(aiError);

      await performCodeTask(req, res);

      expect(mockCodeService.generateCodeConversationId).toHaveBeenCalled();
      expect(mockCodeService.addErrorMessage).toHaveBeenCalledWith(
        'conv-new-123', // Generated ID
        'user-error-new-conv',
        expect.any(String),
        aiError,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An internal error occurred while processing your code request',
        data: {
          conversationId: 'conv-new-123', // Generated ID
          userType: 'authenticated',
        },
      });
    });
  });

  describe('getCodeStats', () => {
    it('should return UNAUTHORIZED for guest users', async () => {
      req.isGuest = true;

      await getCodeStats(req, res);

      expect(mockCodeService.getCodeStats).not.toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'Statistics are only available for authenticated users',
      });
    });

    it('should return UNAUTHORIZED if authenticated user has no userId', async () => {
      req.user = {}; // Authenticated but no userId or _id

      await getCodeStats(req, res);

      expect(mockCodeService.getCodeStats).not.toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should successfully retrieve code statistics for authenticated user', async () => {
      req.user = { userId: 'user-stats' };
      const mockStats = { total: 10, used: 3, remaining: 7 };
      mockCodeService.getCodeStats.mockResolvedValue(mockStats);

      await getCodeStats(req, res);

      expect(mockCodeService.getCodeStats).toHaveBeenCalledWith('user-stats', req);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Code statistics retrieved successfully',
        data: mockStats,
      });
    });

    it('should handle errors during statistics retrieval', async () => {
      req.user = { userId: 'user-stats-error' };
      const serviceError = new Error('Failed to fetch stats');
      mockCodeService.getCodeStats.mockRejectedValue(serviceError);

      // Since catchAsync is mocked to re-throw, we expect the test runner to catch it.
      // In a real Express app, this would go to the error handling middleware.
      await expect(getCodeStats(req, res)).rejects.toThrow(serviceError);
      expect(mockCodeService.getCodeStats).toHaveBeenCalledWith('user-stats-error', req);
      expect(mockSendResponse).not.toHaveBeenCalled(); // sendResponse is not called if an error is thrown before it.
    });
  });

  describe('codeController export', () => {
    it('should export performCodeTask and getCodeStats', () => {
      expect(codeController.performCodeTask).toBe(performCodeTask);
      expect(codeController.getCodeStats).toBe(getCodeStats);
    });
  });
});