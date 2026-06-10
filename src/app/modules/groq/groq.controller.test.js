import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { LlamaAiController } from './groq.controller.js';
import { LlamaAiService } from './groq.service.js';
import sendResponse from '../../../shared/sendResponse.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import { logger } from '../../../shared/logger.js';

vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));

vi.mock('./groq.service.js', () => ({
  LlamaAiService: {
    getAiResponsesGroqService: vi.fn(),
    GroqAiGetResponseAnonymousService: vi.fn(),
    getAiResponsesByUserIdService: vi.fn(),
    getAiResponsesBySession: vi.fn(),
    deleteOneLlamaAiSession: vi.fn(),
    deleteAllAiSessionsService: vi.fn(),
  },
}));

vi.mock('../../../shared/validatePromptRequest.js', () => ({
  default: vi.fn(),
}));

vi.mock('crypto', () => ({
  randomUUID: () => 'mocked-uuid-1234-5678',
}));

describe('Groq AI Controller', () => {
  let req;
  let res;
  let next;

  const roles = ['user', 'manager', 'admin', 'super_admin'];

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      body: {},
      params: {},
      user: null,
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  describe('GroqAiGetResponse', () => {
    it('should successfully get AI response for authenticated users', async () => {
      const mockPromptData = {
        prompt: 'Hello AI',
        userId: 'user-123',
        sessionId: 'session-123',
      };
      const mockServiceResult = { response: 'Hello Human', sessionId: 'session-123', userId: 'user-123' };

      validatePromptRequest.mockResolvedValue(mockPromptData);
      LlamaAiService.getAiResponsesGroqService.mockResolvedValue(mockServiceResult);

      await LlamaAiController.GroqAiGetResponse(req, res, next);

      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(LlamaAiService.getAiResponsesGroqService).toHaveBeenCalledWith(
        'Hello AI',
        'user-123',
        'session-123'
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: mockServiceResult,
      });
    });

    it('should forward errors to next middleware if validation fails', async () => {
      const error = new Error('Validation failed');
      validatePromptRequest.mockRejectedValue(error);

      await LlamaAiController.GroqAiGetResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('GroqAiGetResponseAnonymously', () => {
    it('should successfully get AI response anonymously with a generated session ID', async () => {
      req.body = { prompt: 'Anonymous prompt' };
      const mockServiceResult = { response: 'Anonymous response', sessionId: 'mocked-uuid-1234-5678' };
      LlamaAiService.GroqAiGetResponseAnonymousService.mockResolvedValue(mockServiceResult);

      await LlamaAiController.GroqAiGetResponseAnonymously(req, res, next);

      expect(LlamaAiService.GroqAiGetResponseAnonymousService).toHaveBeenCalledWith(
        'Anonymous prompt',
        'mocked-uuid-1234-5678'
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: mockServiceResult,
      });
    });

    it('should successfully get AI response anonymously with a provided session ID', async () => {
      req.body = { prompt: 'Anonymous prompt', sessionId: 'custom-session-999' };
      const mockServiceResult = { response: 'Anonymous response', sessionId: 'custom-session-999' };
      LlamaAiService.GroqAiGetResponseAnonymousService.mockResolvedValue(mockServiceResult);

      await LlamaAiController.GroqAiGetResponseAnonymously(req, res, next);

      expect(LlamaAiService.GroqAiGetResponseAnonymousService).toHaveBeenCalledWith(
        'Anonymous prompt',
        'custom-session-999'
      );
    });

    it('should throw 400 Bad Request if prompt is missing', async () => {
      req.body = {};

      await LlamaAiController.GroqAiGetResponseAnonymously(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Prompt is required and must be a non-empty string.',
          statusCode: httpStatus.BAD_REQUEST,
        })
      );
    });

    it('should throw 400 Bad Request if prompt is not a string', async () => {
      req.body = { prompt: 12345 };

      await LlamaAiController.GroqAiGetResponseAnonymously(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Prompt is required and must be a non-empty string.',
          statusCode: httpStatus.BAD_REQUEST,
        })
      );
    });

    it('should throw 400 Bad Request if prompt is empty string', async () => {
      req.body = { prompt: '   ' };

      await LlamaAiController.GroqAiGetResponseAnonymously(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Prompt is required and must be a non-empty string.',
          statusCode: httpStatus.BAD_REQUEST,
        })
      );
    });
  });

  describe('LlamaAiGetResponseFromDbByUserId', () => {
    roles.forEach((role) => {
      it(`should successfully retrieve responses for authenticated user with role: ${role}`, async () => {
        req.user = { _id: 'user-id-123', role };
        const mockDbResponses = [{ prompt: 'Q', response: 'A' }];
        LlamaAiService.getAiResponsesByUserIdService.mockResolvedValue(mockDbResponses);

        await LlamaAiController.LlamaAiGetResponseFromDbByUserId(req, res, next);

        expect(LlamaAiService.getAiResponsesByUserIdService).toHaveBeenCalledWith('user-id-123');
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.OK,
          success: true,
          message: 'Get Response successfully',
          data: mockDbResponses,
        });
      });
    });

    it('should throw 401 Unauthorized if user is not authenticated', async () => {
      req.user = null;

      await LlamaAiController.LlamaAiGetResponseFromDbByUserId(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User ID is required for this operation.',
          statusCode: httpStatus.UNAUTHORIZED,
        })
      );
    });
  });

  describe('LlamaAiGetResponseFromDbBySessionId', () => {
    roles.forEach((role) => {
      it(`should successfully retrieve responses by session ID for role: ${role}`, async () => {
        req.params.sessionId = 'session-xyz';
        req.user = { _id: 'user-id-123', role };
        const mockDbResponses = [{ prompt: 'Q', response: 'A', sessionId: 'session-xyz' }];
        LlamaAiService.getAiResponsesBySession.mockResolvedValue(mockDbResponses);

        await LlamaAiController.LlamaAiGetResponseFromDbBySessionId(req, res, next);

        expect(LlamaAiService.getAiResponsesBySession).toHaveBeenCalledWith('session-xyz', 'user-id-123');
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.OK,
          success: true,
          message: 'Get Response successfully',
          data: mockDbResponses,
        });
      });
    });

    it('should throw 400 Bad Request if sessionId is missing', async () => {
      req.params = {};
      req.user = { _id: 'user-id-123' };

      await LlamaAiController.LlamaAiGetResponseFromDbBySessionId(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Session ID is required.',
          statusCode: httpStatus.BAD_REQUEST,
        })
      );
    });

    it('should throw 401 Unauthorized if user is missing', async () => {
      req.params.sessionId = 'session-xyz';
      req.user = null;

      await LlamaAiController.LlamaAiGetResponseFromDbBySessionId(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User ID is required for this operation.',
          statusCode: httpStatus.UNAUTHORIZED,
        })
      );
    });
  });

  describe('deleteOneAiSession', () => {
    roles.forEach((role) => {
      it(`should successfully delete a single session for role: ${role}`, async () => {
        req.params.objectId = 'object-id-789';
        req.user = { _id: 'user-id-123', role };
        const mockResult = { success: true, message: 'Session deleted successfully', deletedCount: 1 };
        LlamaAiService.deleteOneLlamaAiSession.mockResolvedValue(mockResult);

        await LlamaAiController.deleteOneAiSession(req, res, next);

        expect(LlamaAiService.deleteOneLlamaAiSession).toHaveBeenCalledWith('object-id-789', 'user-id-123');
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.OK,
          success: true,
          message: 'Session deleted successfully',
          data: mockResult,
        });
      });
    });

    it('should throw 400 Bad Request if objectId is missing', async () => {
      req.params = {};
      req.user = { _id: 'user-id-123' };

      await LlamaAiController.deleteOneAiSession(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Object ID is required.',
          statusCode: httpStatus.BAD_REQUEST,
        })
      );
    });

    it('should throw 401 Unauthorized if user is missing', async () => {
      req.params.objectId = 'object-id-789';
      req.user = null;

      await LlamaAiController.deleteOneAiSession(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User ID is required for this operation.',
          statusCode: httpStatus.UNAUTHORIZED,
        })
      );
    });

    it('should return 500 Internal Server Error if the service fails to delete', async () => {
      req.params.objectId = 'object-id-789';
      req.user = { _id: 'user-id-123' };
      const mockResult = { success: false, message: 'Database error or unauthorized deletion' };
      LlamaAiService.deleteOneLlamaAiSession.mockResolvedValue(mockResult);

      await LlamaAiController.deleteOneAiSession(req, res, next);

      expect(res.status).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        error: 'Database error or unauthorized deletion',
      });
    });
  });

  describe('deleteAllAiSessions', () => {
    roles.forEach((role) => {
      it(`should successfully delete all sessions for role: ${role}`, async () => {
        req.user = { _id: 'user-id-123', role };
        const mockResult = { success: true, deletedCount: 5 };
        LlamaAiService.deleteAllAiSessionsService.mockResolvedValue(mockResult);

        await LlamaAiController.deleteAllAiSessions(req, res, next);

        expect(LlamaAiService.deleteAllAiSessionsService).toHaveBeenCalledWith('user-id-123');
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.OK,
          success: true,
          message: 'Delete All Successfully',
          data: mockResult,
        });
      });
    });

    it('should throw 401 Unauthorized if user is missing', async () => {
      req.user = null;

      await LlamaAiController.deleteAllAiSessions(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User ID is required for this operation.',
          statusCode: httpStatus.UNAUTHORIZED,
        })
      );
    });

    it('should return 500 Internal Server Error if the service fails to delete all', async () => {
      req.user = { _id: 'user-id-123' };
      const mockResult = { success: false, message: 'Failed to delete sessions' };
      LlamaAiService.deleteAllAiSessionsService.mockResolvedValue(mockResult);

      await LlamaAiController.deleteAllAiSessions(req, res, next);

      expect(res.status).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        error: 'Failed to delete sessions',
      });
    });
  });
});