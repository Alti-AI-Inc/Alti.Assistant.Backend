import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { aiClassificationController } from './aiClassification.controller.js';

// Mock external dependencies
const sendResponse = vi.fn();
const catchAsync = vi.fn((fn) => fn); // Mock catchAsync to just return the function it wraps

vi.mock('../../../shared/sendResponse.js', () => ({
  default: sendResponse,
}));
vi.mock('../../../shared/catchAsync.js', () => ({
  default: catchAsync,
}));

// Mock internal service dependencies
const aiClassificationService = {
  processUserInputService: vi.fn(),
  getUserConnectedAccountsService: vi.fn(),
  getComposioConversationHistoryService: vi.fn(),
};
vi.mock('./aiClassification.service.js', () => ({
  aiClassificationService: aiClassificationService,
}));

// Mock dynamic imports
const mockToolFind = vi.fn();
vi.mock('./tools.model.js', () => ({
  default: {
    find: mockToolFind,
  },
}));

const mockClassifyUserIntent = vi.fn();
vi.mock('./services/aiClassificationService.js', () => ({
  classifyUserIntent: mockClassifyUserIntent,
}));

describe('aiClassificationController', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock Express req and res objects
    req = {
      body: {},
      query: {},
      user: null,
      isGuest: false,
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
  });

  describe('classifyAndExecuteController', () => {
    it('should return BAD_REQUEST if message is missing', async () => {
      req.body = { conversationId: 'conv123' };

      await aiClassificationController.classifyAndExecuteController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'User input is required',
      });
      expect(aiClassificationService.processUserInputService).not.toHaveBeenCalled();
    });

    it('should process input for an authenticated user successfully', async () => {
      req.user = { userId: 'authUserId123', _id: 'authUserId123' };
      req.body = { message: 'Hello AI', conversationId: 'conv123' };
      aiClassificationService.processUserInputService.mockResolvedValueOnce({
        success: true,
        message: 'Processed',
        data: { response: 'AI response' },
      });

      await aiClassificationController.classifyAndExecuteController(req, res);

      expect(aiClassificationService.processUserInputService).toHaveBeenCalledWith(
        'Hello AI',
        { userId: 'authUserId123', conversationId: 'conv123', isGuest: false },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Processed',
        data: { response: 'AI response' },
      });
    });

    it('should process input for a guest user with userId in body successfully', async () => {
      req.isGuest = true;
      req.body = { message: 'Hello AI', conversationId: 'conv123', userId: 'guestUserId456' };
      aiClassificationService.processUserInputService.mockResolvedValueOnce({
        success: true,
        message: 'Processed',
        data: { response: 'AI response' },
      });

      await aiClassificationController.classifyAndExecuteController(req, res);

      expect(aiClassificationService.processUserInputService).toHaveBeenCalledWith(
        'Hello AI',
        { userId: 'guestUserId456', conversationId: 'conv123', isGuest: true },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Processed',
        data: { response: 'AI response' },
      });
    });

    it('should process input for a guest user without userId in body successfully', async () => {
      req.isGuest = true;
      req.body = { message: 'Hello AI', conversationId: 'conv123' };
      aiClassificationService.processUserInputService.mockResolvedValueOnce({
        success: true,
        message: 'Processed',
        data: { response: 'AI response' },
      });

      await aiClassificationController.classifyAndExecuteController(req, res);

      expect(aiClassificationService.processUserInputService).toHaveBeenCalledWith(
        'Hello AI',
        { userId: null, conversationId: 'conv123', isGuest: true },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Processed',
        data: { response: 'AI response' },
      });
    });

    it('should handle service failure', async () => {
      req.user = { userId: 'authUserId123' };
      req.body = { message: 'Hello AI', conversationId: 'conv123' };
      aiClassificationService.processUserInputService.mockResolvedValueOnce({
        success: false,
        message: 'Service failed',
        data: { error: 'details' },
      });

      await aiClassificationController.classifyAndExecuteController(req, res);

      expect(aiClassificationService.processUserInputService).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Service failed',
        data: { error: 'details' },
      });
    });

    it('should handle service throwing an error', async () => {
      req.user = { userId: 'authUserId123' };
      req.body = { message: 'Hello AI', conversationId: 'conv123' };
      const errorMessage = 'Something went wrong in service';
      aiClassificationService.processUserInputService.mockRejectedValueOnce(new Error(errorMessage));

      await aiClassificationController.classifyAndExecuteController(req, res);

      expect(aiClassificationService.processUserInputService).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Internal server error while processing request',
        data: {
          responseMessage: {
            text: `Sorry, I encountered an unexpected error: ${errorMessage}`,
            type: 'error',
          },
          conversationId: 'conv123',
          messageCount: 1,
          userType: 'authenticated',
          userId: undefined,
        },
      });
    });
  });

  describe('getSupportedAppsController', () => {
    it('should return supported apps successfully', async () => {
      mockToolFind.mockResolvedValueOnce([
        { slug: 'app1_action1', name: 'Action 1', description: 'Desc 1', appName: 'App One' },
        { slug: 'app1_action2', name: 'Action 2', description: 'Desc 2', appName: 'App One' },
        { slug: 'app2_action1', name: 'Action 3', description: 'Desc 3', appName: 'App Two' },
        { slug: 'app3_action1', name: 'Action 4', description: 'Desc 4', appName: null }, // Test missing appName
        { slug: 'unknown_action', name: 'Action 5', description: 'Desc 5', appName: null }, // Test unknown app
      ]);

      await aiClassificationController.getSupportedAppsController(req, res);

      expect(mockToolFind).toHaveBeenCalledWith({}, { slug: 1, name: 1, description: 1, appName: 1 });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: '4 supported apps and actions retrieved successfully',
        data: {
          'app one': {
            name: 'App One',
            description: 'Integration with App One',
            actions: ['app1_action1', 'app1_action2'],
          },
          'app two': {
            name: 'App Two',
            description: 'Integration with App Two',
            actions: ['app2_action1'],
          },
          app3: {
            name: 'app3',
            description: 'Integration with app3',
            actions: ['app3_action1'],
          },
          unknown: {
            name: 'unknown',
            description: 'Integration with unknown',
            actions: ['unknown_action'],
          },
        },
      });
    });

    it('should return empty data if no tools are found', async () => {
      mockToolFind.mockResolvedValueOnce([]);

      await aiClassificationController.getSupportedAppsController(req, res);

      expect(mockToolFind).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: '0 supported apps and actions retrieved successfully',
        data: {},
      });
    });

    it('should handle errors during tool retrieval', async () => {
      const errorMessage = 'DB connection failed';
      mockToolFind.mockRejectedValueOnce(new Error(errorMessage));

      await aiClassificationController.getSupportedAppsController(req, res);

      expect(mockToolFind).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to load supported apps',
        data: {
          error: errorMessage,
        },
      });
    });
  });

  describe('testClassificationController', () => {
    it('should return BAD_REQUEST if userInput is missing', async () => {
      req.body = {};

      await aiClassificationController.testClassificationController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'User input is required',
      });
      expect(mockClassifyUserIntent).not.toHaveBeenCalled();
    });

    it('should classify user input successfully', async () => {
      req.body = { userInput: 'classify this' };
      mockClassifyUserIntent.mockResolvedValueOnce({ intent: 'test', confidence: 0.9 });

      await aiClassificationController.testClassificationController(req, res);

      expect(mockClassifyUserIntent).toHaveBeenCalledWith('classify this', []);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Classification completed successfully',
        data: { intent: 'test', confidence: 0.9 },
      });
    });

    it('should handle classification service throwing an error', async () => {
      req.body = { userInput: 'classify this' };
      const errorMessage = 'Classification model error';
      mockClassifyUserIntent.mockRejectedValueOnce(new Error(errorMessage));

      await aiClassificationController.testClassificationController(req, res);

      expect(mockClassifyUserIntent).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to classify user input',
        data: {
          error: errorMessage,
        },
      });
    });
  });

  describe('getUserConnectionsController', () => {
    it('should return BAD_REQUEST if userId is missing for guest user', async () => {
      req.isGuest = true;
      req.user = null; // Ensure no user object
      // req.body does not contain userId for this controller

      await aiClassificationController.getUserConnectionsController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'User ID is required',
      });
      expect(aiClassificationService.getUserConnectedAccountsService).not.toHaveBeenCalled();
    });

    it('should retrieve connections for an authenticated user successfully', async () => {
      req.user = { userId: 'authUserId123' };
      aiClassificationService.getUserConnectedAccountsService.mockResolvedValueOnce({
        success: true,
        data: [{ app: 'slack' }],
      });

      await aiClassificationController.getUserConnectionsController(req, res);

      expect(aiClassificationService.getUserConnectedAccountsService).toHaveBeenCalledWith(
        'authUserId123',
        null,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'User connections retrieved successfully',
        data: [{ app: 'slack' }],
      });
    });

    it('should handle service failure for connections', async () => {
      req.user = { userId: 'authUserId123' };
      aiClassificationService.getUserConnectedAccountsService.mockResolvedValueOnce({
        success: false,
        error: 'Failed to fetch',
      });

      await aiClassificationController.getUserConnectionsController(req, res);

      expect(aiClassificationService.getUserConnectedAccountsService).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to retrieve user connections',
        data: {
          error: 'Failed to fetch',
        },
      });
    });

    it('should handle service throwing an error for connections', async () => {
      req.user = { userId: 'authUserId123' };
      const errorMessage = 'DB error on connections';
      aiClassificationService.getUserConnectedAccountsService.mockRejectedValueOnce(new Error(errorMessage));

      await aiClassificationController.getUserConnectionsController(req, res);

      expect(aiClassificationService.getUserConnectedAccountsService).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Internal server error while retrieving connections',
        data: {
          error: errorMessage,
        },
      });
    });
  });

  describe('getConversationHistoryController', () => {
    it('should return BAD_REQUEST if userId is missing for guest user', async () => {
      req.isGuest = true;
      req.user = null;
      req.query = {}; // No userId in query

      await aiClassificationController.getConversationHistoryController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'User ID is required',
      });
      expect(aiClassificationService.getComposioConversationHistoryService).not.toHaveBeenCalled();
    });

    it('should retrieve conversation history for an authenticated user successfully', async () => {
      req.user = { userId: 'authUserId123' };
      req.query = { conversationId: 'conv123', limit: '10' };
      aiClassificationService.getComposioConversationHistoryService.mockResolvedValueOnce({
        success: true,
        data: [{ message: 'hi' }],
      });

      await aiClassificationController.getConversationHistoryController(req, res);

      expect(aiClassificationService.getComposioConversationHistoryService).toHaveBeenCalledWith(
        'authUserId123',
        { conversationId: 'conv123', limit: 10 },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation history retrieved successfully',
        data: [{ message: 'hi' }],
      });
    });

    it('should retrieve conversation stats for an authenticated user successfully (no conversationId)', async () => {
      req.user = { userId: 'authUserId123' };
      req.query = {}; // No conversationId, no limit
      aiClassificationService.getComposioConversationHistoryService.mockResolvedValueOnce({
        success: true,
        data: { totalConversations: 5 },
      });

      await aiClassificationController.getConversationHistoryController(req, res);

      expect(aiClassificationService.getComposioConversationHistoryService).toHaveBeenCalledWith(
        'authUserId123',
        { conversationId: undefined, limit: 20 }, // Default limit
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation stats retrieved successfully',
        data: { totalConversations: 5 },
      });
    });

    it('should retrieve conversation history for a guest user with userId in query successfully', async () => {
      req.isGuest = true;
      req.user = null;
      req.query = { userId: 'guestUserId456', conversationId: 'conv123' };
      aiClassificationService.getComposioConversationHistoryService.mockResolvedValueOnce({
        success: true,
        data: [{ message: 'guest hi' }],
      });

      await aiClassificationController.getConversationHistoryController(req, res);

      expect(aiClassificationService.getComposioConversationHistoryService).toHaveBeenCalledWith(
        'guestUserId456',
        { conversationId: 'conv123', limit: 20 },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation history retrieved successfully',
        data: [{ message: 'guest hi' }],
      });
    });

    it('should handle service failure for conversation history', async () => {
      req.user = { userId: 'authUserId123' };
      req.query = { conversationId: 'conv123' };
      aiClassificationService.getComposioConversationHistoryService.mockResolvedValueOnce({
        success: false,
        error: 'Failed to fetch history',
      });

      await aiClassificationController.getConversationHistoryController(req, res);

      expect(aiClassificationService.getComposioConversationHistoryService).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to retrieve conversation data',
        data: {
          error: 'Failed to fetch history',
        },
      });
    });

    it('should handle service throwing an error for conversation history', async () => {
      req.user = { userId: 'authUserId123' };
      req.query = { conversationId: 'conv123' };
      const errorMessage = 'DB error on history';
      aiClassificationService.getComposioConversationHistoryService.mockRejectedValueOnce(new Error(errorMessage));

      await aiClassificationController.getConversationHistoryController(req, res);

      expect(aiClassificationService.getComposioConversationHistoryService).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Internal server error while retrieving conversation data',
        data: {
          error: errorMessage,
        },
      });
    });
  });
});