import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { composioService } from './composio.service.js';
import { composioController } from './composio.controller.js';

// Mock external dependencies
vi.mock('http-status', () => ({
  default: {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

// Mock catchAsync to simply return the function for direct testing
vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn,
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

vi.mock('./composio.service.js', () => ({
  composioService: {
    initiateComposioAuth: vi.fn(),
    waitForConnection: vi.fn(),
    generateGuestUserId: vi.fn(),
    generateComposioConversationId: vi.fn(),
    handleComposioConversation: vi.fn(),
    addComposioQueryMessage: vi.fn(),
    processComposioConversation: vi.fn(),
    addComposioResponseMessage: vi.fn(),
  },
}));

// NOTE: conversationHelpers is used in the controller but not explicitly imported.
// This mock assumes it's either a global or implicitly available.
// In a real-world scenario, this would indicate a missing import in the original file.
vi.mock('../../conversations/conversation.helpers.js', () => ({
  conversationHelpers: {
    getConversationById: vi.fn(),
    getUserConversations: vi.fn(),
  },
}));

const { conversationHelpers } = await import('../../conversations/conversation.helpers.js');

describe('composioController', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      query: {},
      user: {},
      isGuest: false,
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('composioInitiateController', () => {
    it('should return 400 if app_name is missing', async () => {
      req.body = { user_id: 'user123' };
      await composioController.composioInitiateController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'app_name is required' });
      expect(composioService.initiateComposioAuth).not.toHaveBeenCalled();
    });

    it('should return 400 if user_id is missing from all sources', async () => {
      req.body = { app_name: 'test_app' };
      req.user = undefined; // No user in req
      await composioController.composioInitiateController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'User must be authenticated' });
      expect(composioService.initiateComposioAuth).not.toHaveBeenCalled();
    });

    it('should successfully initiate Composio auth with userId from req.user.userId', async () => {
      req.body = { app_name: 'test_app' };
      req.user = { userId: 'auth_user_id' };
      composioService.initiateComposioAuth.mockResolvedValue('http://auth.url');

      await composioController.composioInitiateController(req, res);

      expect(composioService.initiateComposioAuth).toHaveBeenCalledWith(
        { app_name: 'test_app', user_id: 'auth_user_id' },
        req
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ authConfig: 'http://auth.url' });
    });

    it('should successfully initiate Composio auth with userId from req.user._id', async () => {
      req.body = { app_name: 'test_app' };
      req.user = { _id: 'auth_user_id_from_id' };
      composioService.initiateComposioAuth.mockResolvedValue('http://auth.url');

      await composioController.composioInitiateController(req, res);

      expect(composioService.initiateComposioAuth).toHaveBeenCalledWith(
        { app_name: 'test_app', user_id: 'auth_user_id_from_id' },
        req
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ authConfig: 'http://auth.url' });
    });

    it('should successfully initiate Composio auth with userId from req.body.userId', async () => {
      req.body = { app_name: 'test_app', userId: 'body_user_id' };
      req.user = undefined; // No user in req
      composioService.initiateComposioAuth.mockResolvedValue('http://auth.url');

      await composioController.composioInitiateController(req, res);

      expect(composioService.initiateComposioAuth).toHaveBeenCalledWith(
        { app_name: 'test_app', user_id: 'body_user_id' },
        req
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ authConfig: 'http://auth.url' });
    });

    it('should successfully initiate Composio auth with userId from req.body.user_id', async () => {
      req.body = { app_name: 'test_app', user_id: 'body_user_id_underscore' };
      req.user = undefined; // No user in req
      composioService.initiateComposioAuth.mockResolvedValue('http://auth.url');

      await composioController.composioInitiateController(req, res);

      expect(composioService.initiateComposioAuth).toHaveBeenCalledWith(
        { app_name: 'test_app', user_id: 'body_user_id_underscore' },
        req
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ authConfig: 'http://auth.url' });
    });

    it('should handle errors from composioService.initiateComposioAuth', async () => {
      req.body = { app_name: 'test_app' };
      req.user = { userId: 'auth_user_id' };
      const serviceError = new Error('Service failed');
      composioService.initiateComposioAuth.mockRejectedValue(serviceError);

      await composioController.composioInitiateController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to initiate authentication',
        details: serviceError.message,
      });
      expect(console.error).toHaveBeenCalledWith('Error initiating Composio auth:', serviceError);
    });
  });

  describe('composioWaitForConnectionController', () => {
    it('should successfully wait for connection', async () => {
      req.body = { connected_account_id: 'account123' };
      const mockConnection = { id: 'account123', status: 'connected' };
      composioService.waitForConnection.mockResolvedValue(mockConnection);

      await composioController.composioWaitForConnectionController(req, res);

      expect(composioService.waitForConnection).toHaveBeenCalledWith('account123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ connection: mockConnection });
    });

    it('should handle errors from composioService.waitForConnection', async () => {
      req.body = { connected_account_id: 'account123' };
      const serviceError = new Error('Connection timed out');
      composioService.waitForConnection.mockRejectedValue(serviceError);

      await composioController.composioWaitForConnectionController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to establish connection' });
    });
  });

  describe('composioConversationController', () => {
    it('should return BAD_REQUEST if message is missing', async () => {
      req.body = { userId: 'user123' };
      await composioController.composioConversationController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'A message is required',
      });
      expect(composioService.handleComposioConversation).not.toHaveBeenCalled();
    });

    it('should return INTERNAL_SERVER_ERROR if userId cannot be determined', async () => {
      req.body = { message: 'Hello' };
      req.isGuest = true;
      req.user = undefined;
      composioService.generateGuestUserId.mockReturnValue(null); // Simulate failure to generate

      await composioController.composioConversationController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to generate user identifier',
      });
      expect(composioService.generateGuestUserId).toHaveBeenCalled();
      expect(composioService.handleComposioConversation).not.toHaveBeenCalled();
    });

    it('should handle a new conversation for a guest user', async () => {
      req.isGuest = true;
      req.user = undefined;
      req.body = { message: 'Guest message' };

      composioService.generateGuestUserId.mockReturnValue('guest123');
      composioService.generateComposioConversationId.mockReturnValue('new_conv_id');
      composioService.handleComposioConversation.mockResolvedValue({ conversationId: 'new_conv_id', messages: [] });
      composioService.addComposioQueryMessage.mockResolvedValue(true);
      composioService.processComposioConversation.mockResolvedValue({
        response: 'Guest response',
        metadata: { tool: 'test' },
        executionResult: { status: 'success' },
      });
      composioService.addComposioResponseMessage.mockResolvedValue(true);

      await composioController.composioConversationController(req, res);

      expect(composioService.generateGuestUserId).toHaveBeenCalled();
      expect(composioService.generateComposioConversationId).toHaveBeenCalled();
      expect(composioService.handleComposioConversation).toHaveBeenCalledWith(
        'guest123',
        undefined, // No conversationId in req.body
        'Guest message',
        true
      );
      expect(composioService.addComposioQueryMessage).toHaveBeenCalledWith(
        'new_conv_id',
        'guest123',
        'Guest message',
        true
      );
      expect(composioService.processComposioConversation).toHaveBeenCalledWith({
        query: 'Guest message',
        conversationContext: [],
        history: [{ role: 'user', content: 'Guest message' }],
        userId: 'guest123',
        conversationId: 'new_conv_id',
      });
      expect(composioService.addComposioResponseMessage).toHaveBeenCalledWith(
        'new_conv_id',
        'guest123',
        'Guest response',
        { tool: 'test' },
        true
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Composio automation processed successfully',
        data: {
          conversationId: 'new_conv_id',
          response: 'Guest response',
          metadata: { tool: 'test' },
          isGuest: true,
          executionResult: { status: 'success' },
        },
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Composio Automation Result for conversation: new_conv_id (guest user)'
      );
    });

    it('should handle an existing conversation for an authenticated user', async () => {
      req.isGuest = false;
      req.user = { userId: 'auth_user_id' };
      req.body = { message: 'Auth message', conversationId: 'existing_conv_id' };

      composioService.generateGuestUserId.mockReturnValue('guest123'); // Should not be called
      composioService.generateComposioConversationId.mockReturnValue('new_conv_id'); // Should not be called
      composioService.handleComposioConversation.mockResolvedValue({
        conversationId: 'existing_conv_id',
        messages: [
          { role: 'user', content: 'Old message 1' },
          { role: 'assistant', content: 'Old response 1' },
          { role: 'user', content: 'Old message 2' },
        ],
      });
      composioService.addComposioQueryMessage.mockResolvedValue(true);
      composioService.processComposioConversation.mockResolvedValue({
        response: 'Auth response',
        metadata: {},
        executionResult: { status: 'success' },
      });
      composioService.addComposioResponseMessage.mockResolvedValue(true);

      await composioController.composioConversationController(req, res);

      expect(composioService.generateGuestUserId).not.toHaveBeenCalled();
      expect(composioService.generateComposioConversationId).not.toHaveBeenCalled();
      expect(composioService.handleComposioConversation).toHaveBeenCalledWith(
        'auth_user_id',
        'existing_conv_id',
        'Auth message',
        false
      );
      expect(composioService.addComposioQueryMessage).toHaveBeenCalledWith(
        'existing_conv_id',
        'auth_user_id',
        'Auth message',
        false
      );
      expect(composioService.processComposioConversation).toHaveBeenCalledWith({
        query: 'Auth message',
        conversationContext: [
          { role: 'user', content: 'Old message 1' },
          { role: 'assistant', content: 'Old response 1' },
          { role: 'user', content: 'Old message 2' },
        ],
        history: [
          { role: 'user', content: 'Old message 1' },
          { role: 'assistant', content: 'Old response 1' },
          { role: 'user', content: 'Old message 2' },
          { role: 'user', content: 'Auth message' },
        ],
        userId: 'auth_user_id',
        conversationId: 'existing_conv_id',
      });
      expect(composioService.addComposioResponseMessage).toHaveBeenCalledWith(
        'existing_conv_id',
        'auth_user_id',
        'Auth response',
        {},
        false
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Composio automation processed successfully',
        data: {
          conversationId: 'existing_conv_id',
          response: 'Auth response',
          metadata: {},
          isGuest: false,
          executionResult: { status: 'success' },
        },
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Composio Automation Result for conversation: existing_conv_id (authenticated user)'
      );
    });

    it('should allow userId override from req.body', async () => {
      req.isGuest = false;
      req.user = { userId: 'auth_user_id' };
      req.body = { message: 'Message', userId: 'overridden_user_id' };

      composioService.generateComposioConversationId.mockReturnValue('new_conv_id');
      composioService.handleComposioConversation.mockResolvedValue({ conversationId: 'new_conv_id', messages: [] });
      composioService.addComposioQueryMessage.mockResolvedValue(true);
      composioService.processComposioConversation.mockResolvedValue({
        response: 'Response',
        metadata: {},
        executionResult: { status: 'success' },
      });
      composioService.addComposioResponseMessage.mockResolvedValue(true);

      await composioController.composioConversationController(req, res);

      expect(composioService.handleComposioConversation).toHaveBeenCalledWith(
        'overridden_user_id', // Should use overridden ID
        undefined,
        'Message',
        false
      );
      expect(composioService.addComposioQueryMessage).toHaveBeenCalledWith(
        'new_conv_id',
        'overridden_user_id',
        'Message',
        false
      );
      expect(composioService.processComposioConversation).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'overridden_user_id' })
      );
      expect(composioService.addComposioResponseMessage).toHaveBeenCalledWith(
        'new_conv_id',
        'overridden_user_id',
        'Response',
        {},
        false
      );
    });

    it('should handle errors during conversation processing', async () => {
      req.isGuest = false;
      req.user = { userId: 'auth_user_id' };
      req.body = { message: 'Error message' };

      composioService.generateComposioConversationId.mockReturnValue('new_conv_id');
      const serviceError = new Error('Processing failed');
      composioService.handleComposioConversation.mockRejectedValue(serviceError);

      await composioController.composioConversationController(req, res);

      expect(logger.error).toHaveBeenCalledWith(`Error in composio conversation: ${serviceError.message}`);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to process automation request',
        data: {
          conversationId: 'new_conv_id',
          error: serviceError.message,
        },
      });
    });
  });

  describe('getComposioConversationController', () => {
    it('should return BAD_REQUEST if conversationId is missing', async () => {
      req.params = {};
      await composioController.getComposioConversationController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Conversation ID is required',
      });
      expect(conversationHelpers.getConversationById).not.toHaveBeenCalled();
    });

    it('should successfully retrieve conversation for an authenticated user', async () => {
      req.params = { conversationId: 'conv123' };
      req.isGuest = false;
      req.user = { userId: 'auth_user_id' };
      const mockConversation = { id: 'conv123', messages: [] };
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      await composioController.getComposioConversationController(req, res);

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith('conv123', 'auth_user_id', req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation retrieved successfully',
        data: mockConversation,
      });
    });

    it('should successfully retrieve conversation for a guest user with userId in query', async () => {
      req.params = { conversationId: 'conv123' };
      req.isGuest = true;
      req.user = undefined;
      req.query = { userId: 'guest123' };
      const mockConversation = { id: 'conv123', messages: [] };
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      await composioController.getComposioConversationController(req, res);

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith('conv123', 'guest123', req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation retrieved successfully',
        data: mockConversation,
      });
    });

    it('should handle errors during conversation retrieval', async () => {
      req.params = { conversationId: 'conv123' };
      req.user = { userId: 'auth_user_id' };
      const serviceError = new Error('Conversation not found');
      conversationHelpers.getConversationById.mockRejectedValue(serviceError);

      await composioController.getComposioConversationController(req, res);

      expect(logger.error).toHaveBeenCalledWith(`Error retrieving composio conversation: ${serviceError.message}`);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to retrieve conversation',
      });
    });
  });

  describe('getUserComposioConversationsController', () => {
    it('should return BAD_REQUEST if userId is missing', async () => {
      req.isGuest = true;
      req.user = undefined;
      req.query = {}; // No userId in query
      await composioController.getUserComposioConversationsController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'User ID is required',
      });
      expect(conversationHelpers.getUserConversations).not.toHaveBeenCalled();
    });

    it('should successfully retrieve user conversations for an authenticated user', async () => {
      req.isGuest = false;
      req.user = { userId: 'auth_user_id' };
      const mockConversations = { data: [{ id: 'conv1' }], meta: { total: 1 } };
      conversationHelpers.getUserConversations.mockResolvedValue(mockConversations);

      await composioController.getUserComposioConversationsController(req, res);

      expect(conversationHelpers.getUserConversations).toHaveBeenCalledWith(
        'auth_user_id',
        {
          page: 1,
          limit: 20,
          category: 'composio',
          sortBy: 'lastActivity',
          sortOrder: -1,
          search: '',
        },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversations retrieved successfully',
        data: mockConversations,
      });
    });

    it('should successfully retrieve user conversations for a guest user with userId in query', async () => {
      req.isGuest = true;
      req.user = undefined;
      req.query = { userId: 'guest123', page: '2', limit: '10', sortBy: 'createdAt', sortOrder: '1', search: 'test' };
      const mockConversations = { data: [{ id: 'conv2' }], meta: { total: 1 } };
      conversationHelpers.getUserConversations.mockResolvedValue(mockConversations);

      await composioController.getUserComposioConversationsController(req, res);

      expect(conversationHelpers.getUserConversations).toHaveBeenCalledWith(
        'guest123',
        {
          page: 2,
          limit: 10,
          category: 'composio',
          sortBy: 'createdAt',
          sortOrder: 1,
          search: 'test',
        },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversations retrieved successfully',
        data: mockConversations,
      });
    });

    it('should handle errors during user conversations retrieval', async () => {
      req.user = { userId: 'auth_user_id' };
      const serviceError = new Error('Database error');
      conversationHelpers.getUserConversations.mockRejectedValue(serviceError);

      await composioController.getUserComposioConversationsController(req, res);

      expect(logger.error).toHaveBeenCalledWith(`Error retrieving user composio conversations: ${serviceError.message}`);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to retrieve conversations',
      });
    });
  });
});