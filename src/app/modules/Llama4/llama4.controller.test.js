import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { Llama4AiController } from './llama4.controller';

// Mock shared utilities and services
const mockCatchAsync = (fn) => fn; // catchAsync just wraps, so we can test the inner function directly
const mockSendResponse = vi.fn();
const mockValidatePromptRequest = vi.fn();

// Mock the service layer
const mockLlama4AiServices = {
  Llama4AiGetResponseService: vi.fn(),
};

// Mock the modules that are imported
vi.mock('../../../shared/catchAsync.js', () => ({
  default: mockCatchAsync,
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: mockSendResponse,
}));

vi.mock('../../../shared/validatePromptRequest.js', () => ({
  default: mockValidatePromptRequest,
}));

vi.mock('./llama4.service.js', () => ({
  Llama4AiServices: mockLlama4AiServices,
}));

describe('Llama4AiController', () => {
  let req;
  let res;
  let next; // Although not directly used in this controller, good practice for Express mocks

  beforeEach(() => {
    // Reset mocks before each test
    mockSendResponse.mockClear();
    mockValidatePromptRequest.mockClear();
    mockLlama4AiServices.Llama4AiGetResponseService.mockClear();

    // Initialize mock req, res, next objects
    req = {}; // Request object can be empty for this controller as validatePromptRequest is mocked
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
    };
    next = vi.fn();
  });

  describe('Llama4AiGetResponse', () => {
    it('should process the prompt and send a successful response', async () => {
      const mockPrompt = 'Tell me a story.';
      const mockUserId = 'user123';
      const mockSessionId = 'session456';
      const mockServiceResult = {
        response: 'Once upon a time...',
        metadata: { tokens: 10 },
      };

      // Configure mocks for this test case
      mockValidatePromptRequest.mockResolvedValue({
        prompt: mockPrompt,
        userId: mockUserId,
        sessionId: mockSessionId,
      });
      mockLlama4AiServices.Llama4AiGetResponseService.mockResolvedValue(
        mockServiceResult
      );

      // Call the controller function (which is the inner function wrapped by catchAsync)
      await Llama4AiController.Llama4AiGetResponse(req, res, next);

      // Assertions
      expect(mockValidatePromptRequest).toHaveBeenCalledTimes(1);
      expect(mockValidatePromptRequest).toHaveBeenCalledWith(req);

      expect(
        mockLlama4AiServices.Llama4AiGetResponseService
      ).toHaveBeenCalledTimes(1);
      expect(
        mockLlama4AiServices.Llama4AiGetResponseService
      ).toHaveBeenCalledWith(mockPrompt, mockUserId, mockSessionId);

      expect(mockSendResponse).toHaveBeenCalledTimes(1);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: mockServiceResult,
      });
    });

    it('should propagate error if validatePromptRequest fails', async () => {
      const mockError = new Error('Validation failed');
      mockValidatePromptRequest.mockRejectedValue(mockError);

      // We expect the error to be thrown because catchAsync is mocked to just return the function
      // In a real scenario, catchAsync would pass it to the error middleware.
      await expect(
        Llama4AiController.Llama4AiGetResponse(req, res, next)
      ).rejects.toThrow(mockError);

      expect(mockValidatePromptRequest).toHaveBeenCalledTimes(1);
      expect(mockValidatePromptRequest).toHaveBeenCalledWith(req);
      expect(
        mockLlama4AiServices.Llama4AiGetResponseService
      ).not.toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('should propagate error if Llama4AiGetResponseService fails', async () => {
      const mockPrompt = 'Tell me a story.';
      const mockUserId = 'user123';
      const mockSessionId = 'session456';
      const mockError = new Error('AI service error');

      mockValidatePromptRequest.mockResolvedValue({
        prompt: mockPrompt,
        userId: mockUserId,
        sessionId: mockSessionId,
      });
      mockLlama4AiServices.Llama4AiGetResponseService.mockRejectedValue(
        mockError
      );

      await expect(
        Llama4AiController.Llama4AiGetResponse(req, res, next)
      ).rejects.toThrow(mockError);

      expect(mockValidatePromptRequest).toHaveBeenCalledTimes(1);
      expect(mockValidatePromptRequest).toHaveBeenCalledWith(req);
      expect(
        mockLlama4AiServices.Llama4AiGetResponseService
      ).toHaveBeenCalledTimes(1);
      expect(
        mockLlama4AiServices.Llama4AiGetResponseService
      ).toHaveBeenCalledWith(mockPrompt, mockUserId, mockSessionId);
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });
});