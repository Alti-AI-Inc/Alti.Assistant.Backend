import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { codeController, performCodeTask, getCodeStats } from './code.controller.js';

const {
  mockCatchAsync,
  mockLogger,
  mockSendResponse,
  mockCodeService,
  mockSubscriptionModel,
  mockConversationHelpers,
  mockCodeHelpers,
  mockPublishMessage,
  mockTopic,
  mockNotificationService,
  mockConversationModel,
} = vi.hoisted(() => {
  // Mock external dependencies
  const mockCatchAsync = (fn) => async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      if (next) {
        next(error);
      } else {
        mockSendResponse(res, {
          statusCode: error.statusCode || 500,
          success: false,
          message: error.message,
        });
      }
    }
  };

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockSendResponse = vi.fn();

  const mockCodeService = {
    generateGuestUserId: vi.fn(),
    generateCodeConversationId: vi.fn(),
    handleCodeConversation: vi.fn(),
    addCodeQueryMessage: vi.fn(),
    addCodeResultMessage: vi.fn(),
    addErrorMessage: vi.fn(),
    getUserCodeStats: vi.fn(),
    getWorkspaceCodeStats: vi.fn(),
    getMonthlyMessageCountForWorkspace: vi.fn(),
    getDefaultFreeTierLimit: vi.fn(),
  };

  const mockSubscriptionModel = {
    findOne: vi.fn().mockReturnThis(),
    lean: vi.fn(),
  };

  const mockConversationHelpers = {
    getConversationById: vi.fn(),
  };

  const mockCodeHelpers = {
    formatCodeResponse: vi.fn(),
    formatErrorMessage: vi.fn(),
  };

  const mockPublishMessage = vi.fn().mockResolvedValue('pubsub-msg-id-123');
  const mockTopic = vi.fn().mockReturnValue({
    publishMessage: mockPublishMessage,
  });

  const mockNotificationService = {
    notifyAdminsOfLimitReached: vi.fn().mockResolvedValue(undefined),
  };

  const mockConversationModel = {
    findOne: vi.fn().mockReturnThis(),
    lean: vi.fn(),
  };

  return {
    mockCatchAsync,
    mockLogger,
    mockSendResponse,
    mockCodeService,
    mockSubscriptionModel,
    mockConversationHelpers,
    mockCodeHelpers,
    mockPublishMessage,
    mockTopic,
    mockNotificationService,
    mockConversationModel,
  };
});

vi.mock('../../../shared/catchAsync.js', () => ({
  default: mockCatchAsync,
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: mockSendResponse,
}));

vi.mock('./code.service.js', () => ({
  codeService: mockCodeService,
}));

vi.mock('../payment/payment.model.js', () => ({
  default: mockSubscriptionModel,
}));

vi.mock('../../helpers/conversationHelpers.js', () => ({
  default: mockConversationHelpers,
}));

vi.mock('./code.helper.js', () => ({
  codeHelpers: mockCodeHelpers,
}));

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: class {
    constructor() {
      this.topic = mockTopic;
    }
  }
}));

vi.mock('../notification/notification.service.js', () => ({
  notificationService: mockNotificationService,
}));

vi.mock('../conversations/conversation.model.js', () => ({
  default: mockConversationModel,
}));

describe('codeController', () => {
  let req;
  let res;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      body: {},
      params: {},
      query: {},
      isGuest: false,
      user: null,
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
    mockCodeService.getUserCodeStats.mockResolvedValue({ total: 5, used: 2 });
    mockCodeService.getWorkspaceCodeStats.mockResolvedValue({ total: 20, used: 10 });
    mockCodeService.getMonthlyMessageCountForWorkspace.mockResolvedValue(0);
    mockCodeService.getDefaultFreeTierLimit.mockReturnValue(5);

    mockCodeHelpers.formatCodeResponse.mockReturnValue({
      code: 'formatted code',
      conversationId: 'conv-123',
      messageCount: 2,
    });
    mockCodeHelpers.formatErrorMessage.mockReturnValue('formatted error message');

    mockSubscriptionModel.lean.mockResolvedValue(null);
    mockConversationHelpers.getConversationById.mockResolvedValue(0);
    mockConversationModel.lean.mockResolvedValue({});
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
      expect(mockSubscriptionModel.findOne).not.toHaveBeenCalled();
      expect(mockConversationHelpers.getConversationById).not.toHaveBeenCalled();
      expect(mockCodeService.handleCodeConversation).toHaveBeenCalledWith(
        'guest-123',
        null,
        undefined,
        'guest query',
        true
      );
      expect(mockCodeService.addCodeQueryMessage).toHaveBeenCalledWith(
        'conv-123',
        'guest-123',
        null,
        'guest query',
        true
      );

      const expectedPayload = {
        conversationId: 'conv-123',
        userId: 'guest-123',
        workspaceId: null,
        userRole: 'guest',
        message: 'guest query',
        isGuest: true,
      };

      expect(mockTopic).toHaveBeenCalledWith('code-assistant-requests');
      expect(mockPublishMessage).toHaveBeenCalledWith({
        data: Buffer.from(JSON.stringify(expectedPayload)),
      });

      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.ACCEPTED,
        success: true,
        message: 'Your request has been accepted and is being processed.',
        data: {
          conversationId: 'conv-123',
          userType: 'guest',
          userId: 'guest-123',
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Queued code assistant task pubsub-msg-id-123 for conversation: conv-123 in workspace: null'
      );
    });

    it('should handle authenticated user flow successfully with new conversation', async () => {
      req.user = { userId: 'user-123', workspaceId: 'workspace-123', role: 'user' };
      req.body = { message: 'auth query' };
      mockSubscriptionModel.lean.mockResolvedValue({ usageLimit: 10, createdAt: new Date() });
      mockCodeService.handleCodeConversation.mockResolvedValue({
        conversationId: 'conv-new-123',
        messageCount: 0,
      });

      await performCodeTask(req, res);

      expect(mockCodeService.generateGuestUserId).not.toHaveBeenCalled();
      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ workspaceId: 'workspace-123', status: 'active' });
      expect(mockCodeService.handleCodeConversation).toHaveBeenCalledWith(
        'user-123',
        'workspace-123',
        undefined,
        'auth query',
        false
      );
      expect(mockCodeService.addCodeQueryMessage).toHaveBeenCalledWith(
        'conv-new-123',
        'user-123',
        'workspace-123',
        'auth query',
        false
      );

      const expectedPayload = {
        conversationId: 'conv-new-123',
        userId: 'user-123',
        workspaceId: 'workspace-123',
        userRole: 'user',
        message: 'auth query',
        isGuest: false,
      };

      expect(mockTopic).toHaveBeenCalledWith('code-assistant-requests');
      expect(mockPublishMessage).toHaveBeenCalledWith({
        data: Buffer.from(JSON.stringify(expectedPayload)),
      });

      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.ACCEPTED,
        success: true,
        message: 'Your request has been accepted and is being processed.',
        data: {
          conversationId: 'conv-new-123',
          userType: 'authenticated',
          userId: undefined,
        },
      });
    });

    it('should handle authenticated user flow successfully with existing conversation', async () => {
      req.user = { userId: 'user-456', _id: 'user-456', workspaceId: 'workspace-456', role: 'user' };
      req.body = { message: 'existing conv query', conversationId: 'conv-existing-456' };
      mockSubscriptionModel.lean.mockResolvedValue({ usageLimit: 10, createdAt: new Date() });
      mockConversationHelpers.getConversationById.mockResolvedValue({ messageCount: 5 });
      mockCodeService.handleCodeConversation.mockResolvedValue({
        conversationId: 'conv-existing-456',
        messageCount: 5,
      });

      await performCodeTask(req, res);

      expect(mockCodeService.generateGuestUserId).not.toHaveBeenCalled();
      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ workspaceId: 'workspace-456', status: 'active' });
      expect(mockCodeService.handleCodeConversation).toHaveBeenCalledWith(
        'user-456',
        'workspace-456',
        'conv-existing-456',
        'existing conv query',
        false
      );
      expect(mockCodeService.addCodeQueryMessage).toHaveBeenCalledWith(
        'conv-existing-456',
        'user-456',
        'workspace-456',
        'existing conv query',
        false
      );
    });

    it('should return FORBIDDEN if authenticated user exceeds code assistance limit', async () => {
      req.user = { userId: 'user-limit', workspaceId: 'workspace-limit', role: 'user' };
      req.body = { message: 'limit query', conversationId: 'conv-limit' };
      mockSubscriptionModel.lean.mockResolvedValue({ usageLimit: 5, createdAt: new Date() });
      mockCodeService.getMonthlyMessageCountForWorkspace.mockResolvedValue(5); // already used 5, limit is 5

      await performCodeTask(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ workspaceId: 'workspace-limit', status: 'active' });
      expect(mockPublishMessage).not.toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'Your workspace has reached its code assistance limit for this month. Please contact your administrator to upgrade the plan.',
      });
    });

    it('should return FORBIDDEN if authenticated user has no subscription and tries to use code assistance', async () => {
      req.user = { userId: 'user-no-sub', workspaceId: 'workspace-no-sub', role: 'user' };
      req.body = { message: 'no sub query' };
      mockSubscriptionModel.lean.mockResolvedValue(null);
      mockCodeService.getMonthlyMessageCountForWorkspace.mockResolvedValue(5); // free limit is 5

      await performCodeTask(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ workspaceId: 'workspace-no-sub', status: 'active' });
      expect(mockPublishMessage).not.toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'Your workspace has reached its code assistance limit for this month. Please contact your administrator to upgrade the plan.',
      });
    });
  });

  describe('getCodeStats', () => {
    it('should return UNAUTHORIZED for guest users', async () => {
      req.isGuest = true;

      await getCodeStats(req, res);

      expect(mockCodeService.getUserCodeStats).not.toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'Statistics are only available for authenticated users',
      });
    });

    it('should return UNAUTHORIZED if authenticated user has incomplete credentials', async () => {
      req.user = { userId: 'user-incomplete' }; // Incomplete credentials (no workspaceId)

      await expect(getCodeStats(req, res, (err) => { throw err; })).rejects.toThrow('User authentication details are incomplete.');

      expect(mockCodeService.getUserCodeStats).not.toHaveBeenCalled();
      expect(mockCodeService.getWorkspaceCodeStats).not.toHaveBeenCalled();
    });

    it('should successfully retrieve code statistics for authenticated user (regular user role)', async () => {
      req.user = { userId: 'user-stats', workspaceId: 'workspace-stats', role: 'user' };
      const mockStats = { total: 10, used: 3, remaining: 7 };
      mockCodeService.getUserCodeStats.mockResolvedValue(mockStats);

      await getCodeStats(req, res);

      expect(mockCodeService.getUserCodeStats).toHaveBeenCalledWith('user-stats');
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Code statistics retrieved successfully',
        data: mockStats,
      });
    });

    it('should successfully retrieve code statistics for workspace (admin role)', async () => {
      req.user = { userId: 'admin-stats', workspaceId: 'workspace-stats', role: 'admin' };
      const mockStats = { total: 50, used: 20, remaining: 30 };
      mockCodeService.getWorkspaceCodeStats.mockResolvedValue(mockStats);

      await getCodeStats(req, res);

      expect(mockCodeService.getWorkspaceCodeStats).toHaveBeenCalledWith('workspace-stats');
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Code statistics retrieved successfully',
        data: mockStats,
      });
    });

    it('should handle errors during statistics retrieval', async () => {
      req.user = { userId: 'user-stats-error', workspaceId: 'workspace-stats', role: 'user' };
      const serviceError = new Error('Failed to fetch stats');
      mockCodeService.getUserCodeStats.mockRejectedValue(serviceError);

      await expect(getCodeStats(req, res, (err) => { throw err; })).rejects.toThrow(serviceError);
      expect(mockCodeService.getUserCodeStats).toHaveBeenCalledWith('user-stats-error');
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });

  describe('codeController export', () => {
    it('should export performCodeTask and getCodeStats', () => {
      expect(codeController.performCodeTask).toBe(performCodeTask);
      expect(codeController.getCodeStats).toBe(getCodeStats);
    });
  });
});