import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { chatController } from './chat.controller.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import { workflowCreationService } from '../services/workflowCreation.service.js';
import { limitService } from '../../billing/services/limit.service.js';

// Mock dependencies
vi.mock('../../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../services/workflowCreation.service.js', () => ({
  workflowCreationService: {
    createWorkflowFromPrompt: vi.fn(),
    confirmWorkflowCreation: vi.fn(),
    continueConversation: vi.fn(),
    getUserConversations: vi.fn(),
    getConversation: vi.fn(),
  },
}));

vi.mock('../../billing/services/limit.service.js', () => ({
  limitService: {
    canCreateWorkflow: vi.fn(),
    canContinueConversation: vi.fn(),
  },
}));

describe('Chat Controller', () => {
  let req;
  let res;
  const next = vi.fn();

  beforeEach(() => {
    req = {
      body: {},
      user: { _id: 'user-id-123', workspaceId: 'ws-id-456', role: 'user' },
      params: {},
      query: {},
    };
    res = {}; // sendResponse is mocked, so this object is a placeholder
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createWorkflowFromPromptController', () => {
    it('should return 400 if prompt is missing', async () => {
      req.body = {};
      await chatController.createWorkflowFromPromptController(req, res, next);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'A non-empty prompt is required',
      });
    });

    it('should return 400 if prompt is an empty string', async () => {
      req.body = { prompt: '   ' };
      await chatController.createWorkflowFromPromptController(req, res, next);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'A non-empty prompt is required',
      });
    });

    it('should return 403 if workspace has reached its workflow creation limit', async () => {
      req.body = { prompt: 'Create a new workflow' };
      limitService.canCreateWorkflow.mockResolvedValue({
        allowed: false,
        message: 'Limit reached',
      });

      await chatController.createWorkflowFromPromptController(req, res, next);

      expect(limitService.canCreateWorkflow).toHaveBeenCalledWith('ws-id-456');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'Limit reached',
      });
      expect(workflowCreationService.createWorkflowFromPrompt).not.toHaveBeenCalled();
    });

    it('should create a workflow plan successfully (needs confirmation)', async () => {
      req.body = { prompt: 'Create a new workflow', conversationId: 'conv-1' };
      const serviceResult = {
        needsConfirmation: true,
        plan: { steps: [] },
      };
      limitService.canCreateWorkflow.mockResolvedValue({ allowed: true });
      workflowCreationService.createWorkflowFromPrompt.mockResolvedValue(serviceResult);

      await chatController.createWorkflowFromPromptController(req, res, next);

      expect(limitService.canCreateWorkflow).toHaveBeenCalledWith('ws-id-456');
      expect(workflowCreationService.createWorkflowFromPrompt).toHaveBeenCalledWith(
        'user-id-123',
        'Create a new workflow',
        'conv-1'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Workflow creation initiated for user user-id-123 in workspace ws-id-456'
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow plan created, awaiting confirmation',
        data: serviceResult,
      });
    });

    it('should create a workflow directly (no confirmation needed)', async () => {
      req.body = { prompt: 'Create a simple workflow' };
      const serviceResult = {
        needsConfirmation: false,
        workflowId: 'wf-123',
      };
      limitService.canCreateWorkflow.mockResolvedValue({ allowed: true });
      workflowCreationService.createWorkflowFromPrompt.mockResolvedValue(serviceResult);

      await chatController.createWorkflowFromPromptController(req, res, next);

      expect(workflowCreationService.createWorkflowFromPrompt).toHaveBeenCalledWith(
        'user-id-123',
        'Create a simple workflow',
        undefined
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow created successfully',
        data: serviceResult,
      });
    });
  });

  describe('confirmWorkflowCreationController', () => {
    it('should return 400 if conversationId is missing', async () => {
      req.body = { approved: true };
      await chatController.confirmWorkflowCreationController(req, res, next);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Conversation ID is required',
      });
    });

    it('should process an approved workflow confirmation', async () => {
      req.body = { conversationId: 'conv-1', approved: true };
      const serviceResult = {
        message: 'Workflow created successfully.',
        workflowId: 'wf-123',
      };
      workflowCreationService.confirmWorkflowCreation.mockResolvedValue(serviceResult);

      await chatController.confirmWorkflowCreationController(req, res, next);

      expect(workflowCreationService.confirmWorkflowCreation).toHaveBeenCalledWith(
        'user-id-123',
        'conv-1',
        true,
        undefined
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Workflow confirmation processed for conversation conv-1 in workspace ws-id-456'
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: serviceResult.message,
        data: serviceResult,
      });
    });

    it('should process a rejected workflow confirmation with modifications', async () => {
      req.body = {
        conversationId: 'conv-1',
        approved: false,
        modifications: 'Change the trigger',
      };
      const serviceResult = {
        message: 'Plan updated based on your feedback.',
        plan: { steps: ['new step'] },
      };
      workflowCreationService.confirmWorkflowCreation.mockResolvedValue(serviceResult);

      await chatController.confirmWorkflowCreationController(req, res, next);

      expect(workflowCreationService.confirmWorkflowCreation).toHaveBeenCalledWith(
        'user-id-123',
        'conv-1',
        false,
        'Change the trigger'
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: serviceResult.message,
        data: serviceResult,
      });
    });
  });

  describe('continueConversationController', () => {
    it('should return 400 if conversationId is missing', async () => {
      req.body = { message: 'Hello' };
      await chatController.continueConversationController(req, res, next);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Conversation ID and a non-empty message are required',
      });
    });

    it('should return 400 if message is empty', async () => {
      req.body = { conversationId: 'conv-1', message: '  ' };
      await chatController.continueConversationController(req, res, next);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Conversation ID and a non-empty message are required',
      });
    });

    it('should return 403 if workspace has reached its message limit', async () => {
      req.body = { conversationId: 'conv-1', message: 'Hello' };
      limitService.canContinueConversation.mockResolvedValue({
        allowed: false,
        message: 'Message limit reached',
      });

      await chatController.continueConversationController(req, res, next);

      expect(limitService.canContinueConversation).toHaveBeenCalledWith('ws-id-456', 'conv-1');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'Message limit reached',
      });
      expect(workflowCreationService.continueConversation).not.toHaveBeenCalled();
    });

    it('should continue a conversation successfully', async () => {
      req.body = { conversationId: 'conv-1', message: 'Hello' };
      const serviceResult = { response: 'Hi there!' };
      limitService.canContinueConversation.mockResolvedValue({ allowed: true });
      workflowCreationService.continueConversation.mockResolvedValue(serviceResult);

      await chatController.continueConversationController(req, res, next);

      expect(limitService.canContinueConversation).toHaveBeenCalledWith('ws-id-456', 'conv-1');
      expect(workflowCreationService.continueConversation).toHaveBeenCalledWith(
        'user-id-123',
        'conv-1',
        'Hello'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Conversation conv-1 continued in workspace ws-id-456'
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation continued successfully',
        data: serviceResult,
      });
    });
  });

  describe('getUserConversationsController', () => {
    it('should retrieve conversations with default pagination', async () => {
      const serviceResult = { conversations: [{ id: 'conv-1' }], totalCount: 1 };
      workflowCreationService.getUserConversations.mockResolvedValue(serviceResult);

      await chatController.getUserConversationsController(req, res, next);

      expect(workflowCreationService.getUserConversations).toHaveBeenCalledWith('user-id-123', 50, 0);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversations retrieved successfully',
        data: {
          conversations: serviceResult.conversations,
          total: serviceResult.totalCount,
          limit: 50,
          offset: 0,
        },
      });
    });

    it('should retrieve conversations with custom pagination', async () => {
      req.query = { limit: '20', offset: '10' };
      const serviceResult = { conversations: [], totalCount: 0 };
      workflowCreationService.getUserConversations.mockResolvedValue(serviceResult);

      await chatController.getUserConversationsController(req, res, next);

      expect(workflowCreationService.getUserConversations).toHaveBeenCalledWith('user-id-123', 20, 10);
    });

    it('should sanitize pagination parameters', async () => {
      req.query = { limit: '200', offset: '-5' };
      const serviceResult = { conversations: [], totalCount: 0 };
      workflowCreationService.getUserConversations.mockResolvedValue(serviceResult);

      await chatController.getUserConversationsController(req, res, next);

      expect(workflowCreationService.getUserConversations).toHaveBeenCalledWith('user-id-123', 100, 0);
    });

    it('should return 400 for invalid pagination parameters', async () => {
      req.query = { limit: 'abc', offset: 'xyz' };
      await chatController.getUserConversationsController(req, res, next);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Invalid pagination parameters: limit and offset must be numbers.',
      });
    });
  });

  describe('getConversationController', () => {
    it('should return 400 if conversationId is missing', async () => {
      req.params = {};
      await chatController.getConversationController(req, res, next);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Conversation ID is required',
      });
    });

    it('should return 404 if conversation is not found or user does not have permission', async () => {
      req.params = { conversationId: 'conv-not-found' };
      workflowCreationService.getConversation.mockResolvedValue(null);

      await chatController.getConversationController(req, res, next);

      expect(workflowCreationService.getConversation).toHaveBeenCalledWith('conv-not-found', 'user-id-123');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found or you do not have permission to view it.',
      });
    });

    it('should retrieve a specific conversation successfully', async () => {
      req.params = { conversationId: 'conv-1' };
      const conversationData = { id: 'conv-1', messages: [] };
      workflowCreationService.getConversation.mockResolvedValue(conversationData);

      await chatController.getConversationController(req, res, next);

      expect(workflowCreationService.getConversation).toHaveBeenCalledWith('conv-1', 'user-id-123');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation retrieved successfully',
        data: conversationData,
      });
    });
  });
});