import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { BrowserUseController } from './browserUse.controller.js';

// Mock dependencies
const sendResponse = vi.fn();
vi.mock('../../../shared/sendResponse.js', () => ({
  default: sendResponse,
}));

// Mock catchAsync to simply return the function it wraps,
// allowing us to test the async logic directly.
vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn,
}));

const {
  mockInitiateTaskInSessionService,
  mockUpdateTaskStatusService,
  mockGetSessionsForUserService,
  mockGetSessionByIdService
} = vi.hoisted(() => {
  const mockInitiateTaskInSessionService = vi.fn();
  const mockUpdateTaskStatusService = vi.fn();
  const mockGetSessionsForUserService = vi.fn();
  const mockGetSessionByIdService = vi.fn();

  return {
    mockInitiateTaskInSessionService,
    mockUpdateTaskStatusService,
    mockGetSessionsForUserService,
    mockGetSessionByIdService
  };
});

vi.mock('./browserUse.service.js', () => ({
  BrowserUseServices: {
    initiateTaskInSessionService: mockInitiateTaskInSessionService,
    updateTaskStatusService: mockUpdateTaskStatusService,
    getSessionsForUserService: mockGetSessionsForUserService,
    getSessionByIdService: mockGetSessionByIdService,
  },
}));

describe('BrowserUseController', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock Express req, res, next objects
    req = {
      body: {},
      params: {},
      user: {},
    };
    res = {}; // sendResponse handles the actual response, so a minimal res is fine
    next = vi.fn();
  });

  describe('runTaskController', () => {
    it('should initiate a task successfully with userId from req.user', async () => {
      const mockPrompt = 'Test prompt';
      const mockSessionId = 'session123';
      const mockUserId = 'user456';
      const mockStructuredOutputJson = { key: 'value' };
      const mockResult = {
        sessionId: mockSessionId,
        taskId: 'task789',
        status: 'pending',
      };

      req.body = {
        prompt: mockPrompt,
        sessionId: mockSessionId,
        structured_output_json: mockStructuredOutputJson,
      };
      req.user = { _id: mockUserId };

      mockInitiateTaskInSessionService.mockResolvedValue(mockResult);

      await BrowserUseController.runTaskController(req, res, next);

      expect(mockInitiateTaskInSessionService).toHaveBeenCalledWith(
        mockUserId,
        mockSessionId,
        mockPrompt,
        mockStructuredOutputJson,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Task initiated successfully.',
        data: mockResult,
      });
    });

    it('should initiate a task successfully with userId from req.body', async () => {
      const mockPrompt = 'Test prompt 2';
      const mockSessionId = null; // New session
      const mockUserId = 'user789';
      const mockResult = {
        sessionId: 'newSessionId',
        taskId: 'newTask',
        status: 'pending',
      };

      req.body = {
        prompt: mockPrompt,
        sessionId: mockSessionId,
        userId: mockUserId, // userId from body
      };
      req.user = undefined; // No user in req.user

      mockInitiateTaskInSessionService.mockResolvedValue(mockResult);

      await BrowserUseController.runTaskController(req, res, next);

      expect(mockInitiateTaskInSessionService).toHaveBeenCalledWith(
        mockUserId,
        mockSessionId,
        mockPrompt,
        undefined, // structured_output_json was not provided
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Task initiated successfully.',
        data: mockResult,
      });
    });

    it('should throw ApiError if prompt is missing', async () => {
      req.body = {
        userId: 'user123',
      };
      req.user = { _id: 'user123' };

      await expect(
        BrowserUseController.runTaskController(req, res, next)
      ).rejects.toThrow(
        new ApiError(httpStatus.BAD_REQUEST, 'Missing required fields: prompt, userId')
      );
      expect(mockInitiateTaskInSessionService).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it('should throw ApiError if userId is missing from both req.user and req.body', async () => {
      req.body = {
        prompt: 'Some prompt',
      };
      req.user = undefined;

      await expect(
        BrowserUseController.runTaskController(req, res, next)
      ).rejects.toThrow(
        new ApiError(httpStatus.BAD_REQUEST, 'Missing required fields: prompt, userId')
      );
      expect(mockInitiateTaskInSessionService).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('getTaskStatusController', () => {
    it('should update task status successfully', async () => {
      const mockSessionId = 'session123';
      const mockTaskId = 'task456';
      const mockResult = {
        sessionId: mockSessionId,
        taskId: mockTaskId,
        status: 'completed',
      };

      req.params = {
        sessionId: mockSessionId,
        taskId: mockTaskId,
      };

      mockUpdateTaskStatusService.mockResolvedValue(mockResult);

      await BrowserUseController.getTaskStatusController(req, res, next);

      expect(mockUpdateTaskStatusService).toHaveBeenCalledWith(
        mockSessionId,
        mockTaskId,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Task status updated.',
        data: mockResult,
      });
    });
  });

  describe('getUserSessionsController', () => {
    it('should retrieve user sessions successfully with userId from req.user', async () => {
      const mockUserId = 'user123';
      const mockSessions = [{ id: 's1' }, { id: 's2' }];

      req.user = { _id: mockUserId };

      mockGetSessionsForUserService.mockResolvedValue(mockSessions);

      await BrowserUseController.getUserSessionsController(req, res, next);

      expect(mockGetSessionsForUserService).toHaveBeenCalledWith(mockUserId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Sessions retrieved successfully.',
        data: mockSessions,
      });
    });

    it('should retrieve user sessions successfully with userId from req.params', async () => {
      const mockUserId = 'user456';
      const mockSessions = [{ id: 's3' }];

      req.user = undefined;
      req.params = { userId: mockUserId };

      mockGetSessionsForUserService.mockResolvedValue(mockSessions);

      await BrowserUseController.getUserSessionsController(req, res, next);

      expect(mockGetSessionsForUserService).toHaveBeenCalledWith(mockUserId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Sessions retrieved successfully.',
        data: mockSessions,
      });
    });

    it('should throw ApiError if userId is missing from both req.user and req.params', async () => {
      req.user = undefined;
      req.params = {};

      await expect(
        BrowserUseController.getUserSessionsController(req, res, next)
      ).rejects.toThrow(
        new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated')
      );
      expect(mockGetSessionsForUserService).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('getSessionByIdController', () => {
    it('should retrieve a session by ID successfully with userId from req.user', async () => {
      const mockSessionId = 'session123';
      const mockUserId = 'user123';
      const mockSession = { id: mockSessionId, userId: mockUserId };

      req.params = { sessionId: mockSessionId };
      req.user = { _id: mockUserId };

      mockGetSessionByIdService.mockResolvedValue(mockSession);

      await BrowserUseController.getSessionByIdController(req, res, next);

      expect(mockGetSessionByIdService).toHaveBeenCalledWith(
        mockSessionId,
        mockUserId,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Session retrieved successfully.',
        data: mockSession,
      });
    });

    it('should retrieve a session by ID successfully with userId from req.params', async () => {
      const mockSessionId = 'session456';
      const mockUserId = 'user456';
      const mockSession = { id: mockSessionId, userId: mockUserId };

      req.params = { sessionId: mockSessionId, userId: mockUserId };
      req.user = undefined;

      mockGetSessionByIdService.mockResolvedValue(mockSession);

      await BrowserUseController.getSessionByIdController(req, res, next);

      expect(mockGetSessionByIdService).toHaveBeenCalledWith(
        mockSessionId,
        mockUserId,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Session retrieved successfully.',
        data: mockSession,
      });
    });

    it('should throw ApiError if userId is missing from both req.user and req.params', async () => {
      req.params = { sessionId: 'someId' };
      req.user = undefined;

      await expect(
        BrowserUseController.getSessionByIdController(req, res, next)
      ).rejects.toThrow(
        new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated')
      );
      expect(mockGetSessionByIdService).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });
});