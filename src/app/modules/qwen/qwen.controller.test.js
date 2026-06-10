import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QwenAiController } from './qwen.controller.js';
import { QwenAiServices } from './qwen.service.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import httpStatus from 'http-status';

// Mock dependencies
vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));

vi.mock('../../../shared/validatePromptRequest.js', () => ({
  default: vi.fn(),
}));

vi.mock('./qwen.service.js', () => ({
  QwenAiServices: {
    QwenAiGetResponseService: vi.fn(),
    QwenQWQAiGetResponseService: vi.fn(),
  },
}));

describe('QwenAiController', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      body: {},
      headers: {},
      user: null, // Will be populated in role-based tests
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  const roles = ['super_admin', 'admin', 'manager', 'user'];

  describe('QwenAiGetResponse', () => {
    it('should successfully process prompt and return response for all roles', async () => {
      const mockPromptRequest = {
        prompt: 'Hello Qwen',
        userId: 'user-123',
        sessionId: 'session-123',
      };
      const mockServiceResult = { response: 'Hello! How can I help you today?' };

      validatePromptRequest.mockResolvedValue(mockPromptRequest);
      QwenAiServices.QwenAiGetResponseService.mockResolvedValue(mockServiceResult);

      for (const role of roles) {
        req.user = { id: 'user-123', role };

        await QwenAiController.QwenAiGetResponse(req, res, next);

        expect(validatePromptRequest).toHaveBeenCalledWith(req);
        expect(QwenAiServices.QwenAiGetResponseService).toHaveBeenCalledWith(
          mockPromptRequest.prompt,
          mockPromptRequest.userId,
          mockPromptRequest.sessionId
        );
        expect(logger.info).toHaveBeenCalledWith('✅ Service result:', mockServiceResult);
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.OK,
          success: true,
          message: 'Response processed successfully.',
          data: mockServiceResult,
        });
      }
    });

    it('should call next middleware with error if validatePromptRequest fails', async () => {
      const validationError = new Error('Invalid prompt request');
      validatePromptRequest.mockRejectedValue(validationError);

      await QwenAiController.QwenAiGetResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(validationError);
      expect(QwenAiServices.QwenAiGetResponseService).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it('should call next middleware with error if QwenAiGetResponseService fails', async () => {
      const mockPromptRequest = {
        prompt: 'Hello Qwen',
        userId: 'user-123',
        sessionId: 'session-123',
      };
      const serviceError = new Error('Service unavailable');

      validatePromptRequest.mockResolvedValue(mockPromptRequest);
      QwenAiServices.QwenAiGetResponseService.mockRejectedValue(serviceError);

      await QwenAiController.QwenAiGetResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(serviceError);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('QwenQWQAiGetResponse', () => {
    it('should successfully process prompt and return response for all roles', async () => {
      const mockPromptRequest = {
        prompt: 'Solve this math problem',
        userId: 'user-456',
        sessionId: 'session-456',
      };
      const mockServiceResult = { response: 'The answer is 42.' };

      validatePromptRequest.mockResolvedValue(mockPromptRequest);
      QwenAiServices.QwenQWQAiGetResponseService.mockResolvedValue(mockServiceResult);

      for (const role of roles) {
        req.user = { id: 'user-456', role };

        await QwenAiController.QwenQWQAiGetResponse(req, res, next);

        expect(validatePromptRequest).toHaveBeenCalledWith(req);
        expect(QwenAiServices.QwenQWQAiGetResponseService).toHaveBeenCalledWith(
          mockPromptRequest.prompt,
          mockPromptRequest.userId,
          mockPromptRequest.sessionId
        );
        expect(logger.info).toHaveBeenCalledWith('✅ Service result:', mockServiceResult);
        expect(sendResponse).toHaveBeenCalledWith(res, {
          statusCode: httpStatus.OK,
          success: true,
          message: 'Response processed successfully.',
          data: mockServiceResult,
        });
      }
    });

    it('should call next middleware with error if validatePromptRequest fails', async () => {
      const validationError = new Error('Invalid prompt request');
      validatePromptRequest.mockRejectedValue(validationError);

      await QwenAiController.QwenQWQAiGetResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(validationError);
      expect(QwenAiServices.QwenQWQAiGetResponseService).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it('should call next middleware with error if QwenQWQAiGetResponseService fails', async () => {
      const mockPromptRequest = {
        prompt: 'Solve this math problem',
        userId: 'user-456',
        sessionId: 'session-456',
      };
      const serviceError = new Error('Service unavailable');

      validatePromptRequest.mockResolvedValue(mockPromptRequest);
      QwenAiServices.QwenQWQAiGetResponseService.mockRejectedValue(serviceError);

      await QwenAiController.QwenQWQAiGetResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(serviceError);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });
});