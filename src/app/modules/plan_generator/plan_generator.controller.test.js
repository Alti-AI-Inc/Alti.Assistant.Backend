import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { planGeneratorController } from './plan_generator.controller.js';

// Mock external dependencies
const mockCatchAsync = (fn) => fn; // Simply return the function to test the inner logic directly
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

const mockPlanGeneratorService = {
  generateGuestUserId: vi.fn(() => 'guest-123'),
  conversationalAssistant: vi.fn(),
  generatePlanDirect: vi.fn(),
  getConversationHistory: vi.fn(),
  exportPlan: vi.fn(),
};
vi.mock('./plan_generator.service.js', () => ({
  planGeneratorService: mockPlanGeneratorService,
}));

const mockTaskManager = {
  createTask: vi.fn(),
  processTask: vi.fn(),
  getTask: vi.fn(),
};
vi.mock('./plan_generator.taskmanager.js', () => ({
  taskManager: mockTaskManager,
}));

// Mock dynamic imports for brainstormIdea
const mockIdeaAnalyzer = {
  analyzeIdea: vi.fn(),
};
vi.mock('./services/ideaAnalyzer.js', () => ({
  ideaAnalyzer: mockIdeaAnalyzer,
}));

const mockBrainstormEngine = {
  generateBrainstorm: vi.fn(),
};
vi.mock('./services/brainstormEngine.js', () => ({
  brainstormEngine: mockBrainstormEngine,
}));

describe('planGeneratorController', () => {
  let req, res, next;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock Express req and res objects
    req = {
      body: {},
      params: {},
      user: null,
      isGuest: false,
      file: null,
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
    };
    next = vi.fn();
  });

  describe('conversationalAssistant', () => {
    it('should handle authenticated user request without file', async () => {
      req.user = { userId: 'user-123', _id: 'user-123' };
      req.body = { message: 'Hello', conversationId: 'conv-456' };
      const serviceResult = { response: 'Generated plan' };
      mockPlanGeneratorService.conversationalAssistant.mockResolvedValue(serviceResult);

      await planGeneratorController.conversationalAssistant(req, res, next);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plan generator request from authenticated user user-123',
        { hasFile: false, conversationId: 'conv-456' }
      );
      expect(mockPlanGeneratorService.conversationalAssistant).toHaveBeenCalledWith(
        'user-123',
        'Hello',
        'conv-456',
        false,
        null,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Plan generation response generated successfully',
        data: serviceResult,
      });
    });

    it('should handle guest user request with file', async () => {
      req.isGuest = true;
      req.body = { message: 'Guest message', conversationId: 'conv-guest' };
      req.file = {
        filename: 'test.pdf',
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        path: '/uploads/test.pdf',
        location: 's3://bucket/test.pdf',
      };
      const serviceResult = { response: 'Guest plan' };
      mockPlanGeneratorService.conversationalAssistant.mockResolvedValue(serviceResult);
      mockPlanGeneratorService.generateGuestUserId.mockReturnValue('guest-789');

      await planGeneratorController.conversationalAssistant(req, res, next);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plan generator request from guest user guest-789',
        { hasFile: true, conversationId: 'conv-guest' }
      );
      expect(mockPlanGeneratorService.generateGuestUserId).toHaveBeenCalled();
      expect(mockPlanGeneratorService.conversationalAssistant).toHaveBeenCalledWith(
        'guest-789',
        'Guest message',
        'conv-guest',
        true,
        expect.objectContaining({ filename: 'test.pdf' }),
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Plan generation response generated successfully',
        data: { ...serviceResult, userId: 'guest-789' },
      });
    });

    it('should use userId from body if provided', async () => {
      req.user = { userId: 'user-123' };
      req.body = { message: 'Hello', conversationId: 'conv-456', userId: 'override-user' };
      const serviceResult = { response: 'Generated plan' };
      mockPlanGeneratorService.conversationalAssistant.mockResolvedValue(serviceResult);

      await planGeneratorController.conversationalAssistant(req, res, next);

      expect(mockPlanGeneratorService.conversationalAssistant).toHaveBeenCalledWith(
        'override-user',
        'Hello',
        'conv-456',
        false,
        null,
        req
      );
    });
  });

  describe('conversationalAssistantAsync', () => {
    it('should handle authenticated user request and return task ID', async () => {
      req.user = { userId: 'user-123' };
      req.body = { message: 'Async message', conversationId: 'conv-async' };
      mockTaskManager.createTask.mockReturnValue({ taskId: 'task-1', status: 'PENDING' });
      mockTaskManager.processTask.mockResolvedValue({}); // Mock async processing

      await planGeneratorController.conversationalAssistantAsync(req, res, next);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Async plan generator request from authenticated user user-123',
        { hasFile: false, conversationId: 'conv-async' }
      );
      expect(mockTaskManager.createTask).toHaveBeenCalledWith('user-123', 'conv-async');
      expect(mockTaskManager.processTask).toHaveBeenCalledWith(
        'task-1',
        'user-123',
        'Async message',
        'conv-async',
        false,
        null
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.ACCEPTED,
        success: true,
        message: 'Plan generation started successfully',
        data: {
          taskId: 'task-1',
          status: 'PENDING',
          message: 'Plan generation started. Use /task/:taskId to check progress.',
          userId: undefined,
        },
      });
    });

    it('should handle guest user request with file and return task ID', async () => {
      req.isGuest = true;
      req.body = { message: 'Guest async', conversationId: 'conv-guest-async' };
      req.file = {
        filename: 'image.png',
        originalname: 'image.png',
        mimetype: 'image/png',
        size: 512,
        path: '/uploads/image.png',
      };
      mockPlanGeneratorService.generateGuestUserId.mockReturnValue('guest-async-id');
      mockTaskManager.createTask.mockReturnValue({ taskId: 'task-2', status: 'PENDING' });
      mockTaskManager.processTask.mockResolvedValue({});

      await planGeneratorController.conversationalAssistantAsync(req, res, next);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Async plan generator request from guest user guest-async-id',
        { hasFile: true, conversationId: 'conv-guest-async' }
      );
      expect(mockTaskManager.createTask).toHaveBeenCalledWith('guest-async-id', 'conv-guest-async');
      expect(mockTaskManager.processTask).toHaveBeenCalledWith(
        'task-2',
        'guest-async-id',
        'Guest async',
        'conv-guest-async',
        true,
        expect.objectContaining({ filename: 'image.png' })
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.ACCEPTED,
        success: true,
        message: 'Plan generation started successfully',
        data: {
          taskId: 'task-2',
          status: 'PENDING',
          message: 'Plan generation started. Use /task/:taskId to check progress.',
          userId: 'guest-async-id',
        },
      });
    });

    it('should log error if processTask fails', async () => {
      req.user = { userId: 'user-123' };
      req.body = { message: 'Async message', conversationId: 'conv-async' };
      mockTaskManager.createTask.mockReturnValue({ taskId: 'task-error', status: 'PENDING' });
      const processError = new Error('Task processing failed');
      mockTaskManager.processTask.mockRejectedValue(processError);

      await planGeneratorController.conversationalAssistantAsync(req, res, next);

      // The controller returns immediately, so sendResponse is called
      expect(mockSendResponse).toHaveBeenCalled();
      // The error should be caught and logged by the .catch block
      expect(mockLogger.error).toHaveBeenCalledWith('Async task processing error:', processError);
    });
  });

  describe('getTaskStatus', () => {
    it('should return task status if task is found', async () => {
      req.params.taskId = 'task-found';
      const taskData = {
        taskId: 'task-found',
        status: 'COMPLETED',
        stage: 'finalizing',
        progress: 100,
        message: 'Task completed',
        result: { plan: 'final plan' },
        error: null,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
      };
      mockTaskManager.getTask.mockReturnValue(taskData);

      await planGeneratorController.getTaskStatus(req, res, next);

      expect(mockTaskManager.getTask).toHaveBeenCalledWith('task-found');
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Task status retrieved successfully',
        data: taskData,
      });
    });

    it('should return 404 if task is not found', async () => {
      req.params.taskId = 'task-not-found';
      mockTaskManager.getTask.mockReturnValue(null);

      await planGeneratorController.getTaskStatus(req, res, next);

      expect(mockTaskManager.getTask).toHaveBeenCalledWith('task-not-found');
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Task not found',
        data: null,
      });
    });
  });

  describe('generatePlan', () => {
    it('should generate plan for authenticated user', async () => {
      req.user = { userId: 'user-123' };
      req.body = { topic: 'AI', length: 'short' };
      const serviceResult = { generatedPlan: 'AI plan' };
      mockPlanGeneratorService.generatePlanDirect.mockResolvedValue(serviceResult);

      await planGeneratorController.generatePlan(req, res, next);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Direct plan generation from authenticated user user-123'
      );
      expect(mockPlanGeneratorService.generatePlanDirect).toHaveBeenCalledWith(
        { topic: 'AI', length: 'short' },
        'user-123',
        false
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Plan generated successfully',
        data: serviceResult,
      });
    });

    it('should generate plan for guest user', async () => {
      req.isGuest = true;
      req.body = { topic: 'Guest topic' };
      const serviceResult = { generatedPlan: 'Guest plan' };
      mockPlanGeneratorService.generatePlanDirect.mockResolvedValue(serviceResult);
      mockPlanGeneratorService.generateGuestUserId.mockReturnValue('guest-direct-id');

      await planGeneratorController.generatePlan(req, res, next);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Direct plan generation from guest user guest-direct-id'
      );
      expect(mockPlanGeneratorService.generateGuestUserId).toHaveBeenCalled();
      expect(mockPlanGeneratorService.generatePlanDirect).toHaveBeenCalledWith(
        { topic: 'Guest topic' },
        'guest-direct-id',
        true
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Plan generated successfully',
        data: serviceResult,
      });
    });
  });

  describe('getConversationHistory', () => {
    it('should retrieve conversation history for authenticated user', async () => {
      req.params.conversationId = 'conv-history-1';
      req.user = { userId: 'user-123' };
      const historyResult = [{ message: 'Hi', role: 'user' }];
      mockPlanGeneratorService.getConversationHistory.mockResolvedValue(historyResult);

      await planGeneratorController.getConversationHistory(req, res, next);

      expect(mockLogger.info).toHaveBeenCalledWith('Fetching conversation history: conv-history-1');
      expect(mockPlanGeneratorService.getConversationHistory).toHaveBeenCalledWith(
        'conv-history-1',
        'user-123',
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation history retrieved successfully',
        data: historyResult,
      });
    });
  });

  describe('exportPlan', () => {
    it('should export plan for authenticated user in default markdown format', async () => {
      req.user = { userId: 'user-123' };
      req.body = { conversationId: 'conv-export-1' };
      const exportResult = '# My Plan';
      mockPlanGeneratorService.exportPlan.mockResolvedValue(exportResult);

      await planGeneratorController.exportPlan(req, res, next);

      expect(mockLogger.info).toHaveBeenCalledWith('Exporting plan: conv-export-1 in markdown format');
      expect(mockPlanGeneratorService.exportPlan).toHaveBeenCalledWith(
        'conv-export-1',
        'user-123',
        'markdown',
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Plan exported successfully',
        data: exportResult,
      });
    });

    it('should export plan for guest user in specified format', async () => {
      req.isGuest = true;
      req.body = { userId: 'guest-export-id', conversationId: 'conv-export-2', format: 'pdf' };
      const exportResult = Buffer.from('PDF_DATA');
      mockPlanGeneratorService.exportPlan.mockResolvedValue(exportResult);

      await planGeneratorController.exportPlan(req, res, next);

      expect(mockLogger.info).toHaveBeenCalledWith('Exporting plan: conv-export-2 in pdf format');
      expect(mockPlanGeneratorService.exportPlan).toHaveBeenCalledWith(
        'conv-export-2',
        'guest-export-id',
        'pdf',
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Plan exported successfully',
        data: exportResult,
      });
    });
  });

  describe('brainstormIdea', () => {
    it('should brainstorm idea for authenticated user', async () => {
      req.user = { userId: 'user-123' };
      req.body = {
        idea: 'New app idea',
        aspects: ['features', 'monetization'],
        context: { industry: 'tech' },
      };
      const analysisResult = { sentiment: 'positive' };
      const brainstormResult = { ideas: ['feature A', 'feature B'] };

      mockIdeaAnalyzer.analyzeIdea.mockResolvedValue(analysisResult);
      mockBrainstormEngine.generateBrainstorm.mockResolvedValue(brainstormResult);

      await planGeneratorController.brainstormIdea(req, res, next);

      expect(mockLogger.info).toHaveBeenCalledWith('Brainstorm request from authenticated user');
      expect(mockIdeaAnalyzer.analyzeIdea).toHaveBeenCalledWith('New app idea');
      expect(mockBrainstormEngine.generateBrainstorm).toHaveBeenCalledWith(
        'New app idea',
        analysisResult,
        ['features', 'monetization'],
        { industry: 'tech' }
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Brainstorming completed successfully',
        data: {
          analysis: analysisResult,
          brainstorm: brainstormResult,
        },
      });
    });

    it('should brainstorm idea for guest user with minimal parameters', async () => {
      req.isGuest = true;
      req.body = { idea: 'Guest idea' };
      const analysisResult = { sentiment: 'neutral' };
      const brainstormResult = { ideas: ['guest idea 1'] };

      mockPlanGeneratorService.generateGuestUserId.mockReturnValue('guest-brainstorm-id');
      mockIdeaAnalyzer.analyzeIdea.mockResolvedValue(analysisResult);
      mockBrainstormEngine.generateBrainstorm.mockResolvedValue(brainstormResult);

      await planGeneratorController.brainstormIdea(req, res, next);

      expect(mockLogger.info).toHaveBeenCalledWith('Brainstorm request from guest user');
      expect(mockPlanGeneratorService.generateGuestUserId).toHaveBeenCalled();
      expect(mockIdeaAnalyzer.analyzeIdea).toHaveBeenCalledWith('Guest idea');
      expect(mockBrainstormEngine.generateBrainstorm).toHaveBeenCalledWith(
        'Guest idea',
        analysisResult,
        [], // default aspects
        {} // default context
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Brainstorming completed successfully',
        data: {
          analysis: analysisResult,
          brainstorm: brainstormResult,
        },
      });
    });
  });
});