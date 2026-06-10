import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { composioSimpleController } from './composio.controller.js';
import Tool from '../composio_v2/tools.model.js';
import SubscriptionModel from '../subscription/subscription.model.js';
import { composioService } from './composio.service.js';
import { conversationService, generateConversationId } from './composio.conversation.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';

// Mock dependencies
vi.mock('../composio_v2/tools.model.js');
vi.mock('../subscription/subscription.model.js');
vi.mock('./composio.service.js');
vi.mock('./composio.conversation.js');
vi.mock('../../../shared/sendResponse.js');
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../composio_v2/composio.service.js', async () => ({
  executeComposio: vi.fn(),
}));


describe('Composio Simple Controller', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
      user: { _id: 'user123', userId: 'user123', role: 'user' },
      on: vi.fn(),
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };
    next = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- chatController ---
  describe('chatController', () => {
    it('should process a chat message successfully', async () => {
      req.body = { message: 'Hello', conversationId: 'conv123' };
      const mockSubscription = { userId: 'user123', usage: 10 };
      const mockConversation = { conversationId: 'conv123' };
      const mockServiceResult = {
        success: true,
        data: {
          response: 'Hi there!',
          toolsUsed: ['tool1'],
          executionTime: 100,
        },
      };

      const findOneMock = { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(mockSubscription) };
      SubscriptionModel.findOne.mockReturnValue(findOneMock);
      conversationService.getOrCreateConversation.mockResolvedValue(mockConversation);
      composioService.executeUserRequest.mockResolvedValue(mockServiceResult);

      await composioSimpleController.chatController(req, res, next);

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user123' });
      expect(conversationService.getOrCreateConversation).toHaveBeenCalledWith('user123', 'conv123', 'Hello');
      expect(conversationService.saveMessage).toHaveBeenCalledTimes(2);
      expect(composioService.executeUserRequest).toHaveBeenCalledWith('Hello', 'user123', 'conv123', undefined);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: {
          ...mockServiceResult.data,
          conversationId: 'conv123',
        },
      });
    });

    it('should return 400 if message is missing', async () => {
      req.body = {};
      await composioSimpleController.chatController(req, res, next);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Message is required',
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      req.user = null;
      req.body = { message: 'Hello' };
      await composioSimpleController.chatController(req, res, next);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return 403 if subscription usage limit is reached', async () => {
      req.body = { message: 'Hello' };
      const mockSubscription = { userId: 'user123', usage: 0 };
      const findOneMock = { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(mockSubscription) };
      SubscriptionModel.findOne.mockReturnValue(findOneMock);

      await composioSimpleController.chatController(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your usage limit. Please upgrade your plan.',
      });
    });

    it('should handle failed execution from composioService', async () => {
      req.body = { message: 'Hello' };
      const mockSubscription = { userId: 'user123', usage: 10 };
      const mockConversation = { conversationId: 'conv123' };
      const mockServiceResult = { success: false, error: 'Service failed', data: {} };

      const findOneMock = { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(mockSubscription) };
      SubscriptionModel.findOne.mockReturnValue(findOneMock);
      conversationService.getOrCreateConversation.mockResolvedValue(mockConversation);
      composioService.executeUserRequest.mockResolvedValue(mockServiceResult);

      await composioSimpleController.chatController(req, res, next);

      expect(conversationService.saveMessage).toHaveBeenCalledWith('conv123', 'user123', 'assistant', 'Error: Service failed', { error: true });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to process request',
        data: mockServiceResult.data,
      });
    });

    it('should handle unexpected errors in the try-catch block', async () => {
        req.body = { message: 'Hello' };
        const error = new Error('Unexpected error');
        const findOneMock = { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockRejectedValue(error) };
        SubscriptionModel.findOne.mockReturnValue(findOneMock);
  
        await composioSimpleController.chatController(req, res, next);
  
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          success: false,
          message: 'An unexpected error occurred',
          data: { error: 'Unexpected error' },
        });
      });
  });

  // --- initiateAuthController ---
  describe('initiateAuthController', () => {
    it('should initiate auth successfully', async () => {
      req.body = { app_name: 'google' };
      const mockResult = { success: true, data: { auth_url: 'http://auth.url' } };
      composioService.initiateAuth.mockResolvedValue(mockResult);

      await composioSimpleController.initiateAuthController(req, res, next);

      expect(composioService.initiateAuth).toHaveBeenCalledWith('google', 'user123');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Authentication initiated',
        data: mockResult.data,
      });
    });

    it('should return 400 if app_name is missing', async () => {
      req.body = {};
      await composioSimpleController.initiateAuthController(req, res, next);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'App name is required',
      });
    });

    it('should handle API key errors specifically', async () => {
      req.body = { app_name: 'google' };
      const mockResult = { success: false, error: 'Invalid API key provided' };
      composioService.initiateAuth.mockResolvedValue(mockResult);

      await composioSimpleController.initiateAuthController(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: "Failed to connect to Composio. Please verify that your COMPOSIO_API_KEY or COMPOSIO_ORG_API_KEY is valid and configured in the backend's .env file.",
        data: { error: mockResult.error },
      });
    });
  });

  // --- disconnectAppController ---
  describe('disconnectAppController', () => {
    it('should disconnect an app successfully', async () => {
      req.body = { app_name: 'google' };
      const mockResult = { success: true, message: 'App disconnected' };
      composioService.disconnectApp.mockResolvedValue(mockResult);

      await composioSimpleController.disconnectAppController(req, res, next);

      expect(composioService.disconnectApp).toHaveBeenCalledWith('user123', 'google');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'App disconnected',
      });
    });

    it('should return 400 if app_name is missing', async () => {
        req.body = {};
        await composioSimpleController.disconnectAppController(req, res, next);
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message: 'App name is required',
        });
      });

    it('should handle failure to disconnect', async () => {
      req.body = { app_name: 'google' };
      const mockResult = { success: false, error: 'Could not disconnect' };
      composioService.disconnectApp.mockResolvedValue(mockResult);

      await composioSimpleController.disconnectAppController(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Could not disconnect',
      });
    });
  });

  // --- getAppCapabilitiesController ---
  describe('getAppCapabilitiesController', () => {
    it('should retrieve app capabilities successfully', async () => {
      req.query = { app: 'google' };
      const mockCapabilities = [{ name: 'action1', description: 'desc1' }];
      const findMock = { lean: vi.fn().mockResolvedValue(mockCapabilities) };
      Tool.find.mockReturnValue(findMock);

      await composioSimpleController.getAppCapabilitiesController(req, res, next);

      expect(Tool.find).toHaveBeenCalledWith({ appName: /^google/i }, { name: 1, description: 1, _id: 0 });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Capabilities retrieved',
        data: mockCapabilities,
      });
    });

    it('should return 400 if app query param is missing', async () => {
        req.query = {};
        await composioSimpleController.getAppCapabilitiesController(req, res, next);
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message: 'App name query parameter is required',
        });
      });
  });

  // --- connectionStatusStreamController ---
  describe('connectionStatusStreamController', () => {
    vi.useFakeTimers();

    it('should set up SSE headers and stream status', async () => {
      const mockAccounts = { data: [{ app: 'google', status: 'connected' }] };
      composioService.getConnectedAccountsService.mockResolvedValue(mockAccounts);

      await composioSimpleController.connectionStatusStreamController(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.flushHeaders).toHaveBeenCalled();

      // Initial call
      await vi.runAllTimersAsync();
      expect(composioService.getConnectedAccountsService).toHaveBeenCalledWith('user123');
      expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ type: 'connected_apps', data: mockAccounts.data })}\n\n`);

      // Interval call
      vi.advanceTimersByTime(3000);
      await vi.runAllTimersAsync();
      expect(composioService.getConnectedAccountsService).toHaveBeenCalledTimes(2);
      expect(res.write).toHaveBeenCalledTimes(2);

      // Simulate client disconnect
      const closeCallback = req.on.mock.calls.find(call => call[0] === 'close')[1];
      closeCallback();
      vi.advanceTimersByTime(3000);
      expect(composioService.getConnectedAccountsService).toHaveBeenCalledTimes(2); // Should not be called again
      expect(res.end).toHaveBeenCalled();
    });

    it('should return 401 if user is not authenticated', async () => {
        req.user = null;
        await composioSimpleController.connectionStatusStreamController(req, res, next);
        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.UNAUTHORIZED,
            success: false,
            message: 'User authentication required for SSE stream',
        });
    });

    vi.useRealTimers();
  });

  // --- waitForConnectionController ---
  describe('waitForConnectionController', () => {
    it('should wait for connection successfully', async () => {
      req.body = { connected_account_id: 'acc123' };
      const mockResult = { success: true, data: { status: 'active' } };
      composioService.waitForConnection.mockResolvedValue(mockResult);

      await composioSimpleController.waitForConnectionController(req, res, next);

      expect(composioService.waitForConnection).toHaveBeenCalledWith('acc123');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Connection established',
        data: mockResult.data,
      });
    });

    it('should return 400 if connected_account_id is missing', async () => {
        req.body = {};
        await composioSimpleController.waitForConnectionController(req, res, next);
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message: 'Connected account ID is required',
        });
      });
  });

  // --- getConversationsController ---
  describe('getConversationsController', () => {
    it('should retrieve user conversations with default options', async () => {
      const mockConversations = { docs: [], totalDocs: 0 };
      conversationService.getUserConversations.mockResolvedValue(mockConversations);

      await composioSimpleController.getConversationsController(req, res, next);

      expect(conversationService.getUserConversations).toHaveBeenCalledWith('user123', {
        page: 1,
        limit: 20,
        sortBy: 'lastActivity',
        sortOrder: -1,
      });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversations retrieved successfully',
        data: mockConversations,
      });
    });
  });

  // --- getConversationController ---
  describe('getConversationController', () => {
    it('should retrieve a specific conversation', async () => {
      req.params = { conversationId: 'conv123' };
      const mockConversation = { _id: 'conv123', messages: [] };
      conversationService.getOrCreateConversation.mockResolvedValue(mockConversation);

      await composioSimpleController.getConversationController(req, res, next);

      expect(conversationService.getOrCreateConversation).toHaveBeenCalledWith('user123', 'conv123', '');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation retrieved successfully',
        data: mockConversation,
      });
    });
  });

  // --- getConnectedAccountsController ---
  describe('getConnectedAccountsController', () => {
    it('should retrieve connected accounts successfully', async () => {
      const mockResult = { success: true, data: [{ app: 'google' }] };
      composioService.getUserConnectedAccounts.mockResolvedValue(mockResult);

      await composioSimpleController.getConnectedAccountsController(req, res, next);

      expect(composioService.getUserConnectedAccounts).toHaveBeenCalledWith('user123');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Connected accounts retrieved successfully',
        data: mockResult.data,
      });
    });
  });

  // --- compareController ---
  describe('compareController', () => {
    it('should run comparison successfully when both systems succeed', async () => {
      req.body = { message: 'test message' };
      const simplifiedResult = { success: true, data: { response: 'simple response', toolsUsed: [] } };
      const v2Result = { success: true, data: { result: 'v2 response' } };
      
      composioService.executeUserRequest.mockResolvedValue(simplifiedResult);
      const { executeComposio } = await import('../composio_v2/composio.service.js');
      executeComposio.mockResolvedValue(v2Result);

      await composioSimpleController.compareController(req, res, next);

      expect(composioService.executeUserRequest).toHaveBeenCalledWith('test message', 'user123');
      expect(executeComposio).toHaveBeenCalledWith('test message', { userId: 'user123' });
      
      const response = sendResponse.mock.calls[0][1];
      expect(response.statusCode).toBe(httpStatus.OK);
      expect(response.data.simplified.success).toBe(true);
      expect(response.data.simplified.response).toBe('simple response');
      expect(response.data.v2.success).toBe(true);
      expect(response.data.v2.response).toBe('v2 response');
    });

    it('should handle errors in one or both systems', async () => {
        req.body = { message: 'test message' };
        
        composioService.executeUserRequest.mockRejectedValue(new Error('Simple failed'));
        const { executeComposio } = await import('../composio_v2/composio.service.js');
        executeComposio.mockRejectedValue(new Error('V2 failed'));
  
        await composioSimpleController.compareController(req, res, next);
  
        const response = sendResponse.mock.calls[0][1];
        expect(response.statusCode).toBe(httpStatus.OK);
        expect(response.data.simplified.success).toBe(false);
        expect(response.data.simplified.error).toBe('Simple failed');
        expect(response.data.v2.success).toBe(false);
        expect(response.data.v2.error).toBe('V2 failed');
      });

    it('should return 400 if message is missing', async () => {
        req.body = {};
        await composioSimpleController.compareController(req, res, next);
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message: 'Message is required',
        });
      });
  });
});