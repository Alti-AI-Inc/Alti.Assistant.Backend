import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { DeepseekAiController } from './deepseek.controller.js';

// Mock external dependencies
const catchAsync = vi.fn((fn) => fn); // catchAsync just passes the function through for testing
const sendResponse = vi.fn();
const validatePromptRequest = vi.fn();
const deepseekServices = {
  deepseekResponseService: vi.fn(),
};

// Mock the modules that are imported
vi.mock('../../../shared/catchAsync.js', () => ({ default: catchAsync }));
vi.mock('../../../shared/sendResponse.js', () => ({ default: sendResponse }));
vi.mock('../../../shared/validatePromptRequest.js', () => ({ default: validatePromptRequest }));
vi.mock('./deepseek.service.js', () => ({ deepseekServices }));

describe('DeepseekAiController', () => {
  let req;
  let res;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock request and response objects
    req = {
      body: {
        prompt: 'Test prompt',
        userId: 'body-user-id', // This should be ignored by the controller
        sessionId: 'test-session-id',
      },
      user: {
        id: 'authenticated-user-id', // This should be used by the controller
      },
    };
    res = {}; // Response object is not directly used, sendResponse handles it
  });

  describe('DeepseekAiGetResponse', () => {
    it('should successfully get a Deepseek AI response with authenticated user ID', async () => {
      // Arrange
      const mockValidatedData = {
        prompt: 'Test prompt',
        userId: 'body-user-id', // This userId is from the body, but controller uses req.user.id
        sessionId: 'test-session-id',
      };
      const mockServiceResult = {
        response: 'AI generated response',
        model: 'deepseek-chat',
      };

      validatePromptRequest.mockResolvedValue(mockValidatedData);
      deepseekServices.deepseekResponseService.mockResolvedValue(mockServiceResult);

      // Act
      await DeepseekAiController.DeepseekAiGetResponse(req, res);

      // Assert
      expect(validatePromptRequest).toHaveBeenCalledTimes(1);
      expect(validatePromptRequest).toHaveBeenCalledWith(req);

      expect(deepseekServices.deepseekResponseService).toHaveBeenCalledTimes(1);
      expect(deepseekServices.deepseekResponseService).toHaveBeenCalledWith(
        mockValidatedData.prompt,
        req.user.id, // Ensure authenticated user ID is used
        mockValidatedData.sessionId
      );

      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: mockServiceResult,
      });
    });

    it('should return UNAUTHORIZED if authenticated user ID is missing', async () => {
      // Arrange
      const mockValidatedData = {
        prompt: 'Test prompt',
        userId: 'body-user-id',
        sessionId: 'test-session-id',
      };

      // Simulate missing authenticated user ID
      req.user = undefined;
      validatePromptRequest.mockResolvedValue(mockValidatedData);

      // Act
      await DeepseekAiController.DeepseekAiGetResponse(req, res);

      // Assert
      expect(validatePromptRequest).toHaveBeenCalledTimes(1);
      expect(validatePromptRequest).toHaveBeenCalledWith(req);

      // deepseekResponseService should NOT be called
      expect(deepseekServices.deepseekResponseService).not.toHaveBeenCalled();

      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'Authentication required or authenticated user ID missing.',
      });
    });

    it('should handle cases where req.user exists but req.user.id is missing', async () => {
      // Arrange
      const mockValidatedData = {
        prompt: 'Test prompt',
        userId: 'body-user-id',
        sessionId: 'test-session-id',
      };

      // Simulate req.user existing but id missing
      req.user = {};
      validatePromptRequest.mockResolvedValue(mockValidatedData);

      // Act
      await DeepseekAiController.DeepseekAiGetResponse(req, res);

      // Assert
      expect(validatePromptRequest).toHaveBeenCalledTimes(1);
      expect(validatePromptRequest).toHaveBeenCalledWith(req);

      expect(deepseekServices.deepseekResponseService).not.toHaveBeenCalled();

      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'Authentication required or authenticated user ID missing.',
      });
    });

    it('should propagate errors from validatePromptRequest (handled by catchAsync)', async () => {
      // Arrange
      const validationError = new Error('Validation failed');
      validatePromptRequest.mockRejectedValue(validationError);

      // Act & Assert
      // Since catchAsync wraps the function, it will catch the error.
      // For unit testing the controller's direct logic, we expect it to throw
      // if validatePromptRequest rejects, and catchAsync would handle it.
      // We are testing the function passed to catchAsync.
      await expect(DeepseekAiController.DeepseekAiGetResponse(req, res)).rejects.toThrow(validationError);

      expect(validatePromptRequest).toHaveBeenCalledTimes(1);
      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(deepseekServices.deepseekResponseService).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it('should propagate errors from deepseekResponseService (handled by catchAsync)', async () => {
      // Arrange
      const mockValidatedData = {
        prompt: 'Test prompt',
        userId: 'body-user-id',
        sessionId: 'test-session-id',
      };
      const serviceError = new Error('Deepseek service failed');

      validatePromptRequest.mockResolvedValue(mockValidatedData);
      deepseekServices.deepseekResponseService.mockRejectedValue(serviceError);

      // Act & Assert
      await expect(DeepseekAiController.DeepseekAiGetResponse(req, res)).rejects.toThrow(serviceError);

      expect(validatePromptRequest).toHaveBeenCalledTimes(1);
      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(deepseekServices.deepseekResponseService).toHaveBeenCalledTimes(1);
      expect(deepseekServices.deepseekResponseService).toHaveBeenCalledWith(
        mockValidatedData.prompt,
        req.user.id,
        mockValidatedData.sessionId
      );
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });
});