import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAiController } from './gemini.controller.js';

// Mock external dependencies
const httpStatus = {
  OK: 200,
  BAD_REQUEST: 400,
};
vi.mock('http-status', () => ({ default: httpStatus }));

// Mock catchAsync to simply return the function for direct testing of controller logic
const catchAsync = (fn) => fn;
vi.mock('../../../shared/catchAsync.js', () => ({ default: catchAsync }));

const sendResponse = vi.fn();
vi.mock('../../../shared/sendResponse.js', () => ({ default: sendResponse }));

const GeminiAiService = {
  geminiService: vi.fn(),
  gemini25PreviewService: vi.fn(),
};
vi.mock('./gemini.service.js', () => ({ GeminiAiService }));

const validatePromptRequest = vi.fn();
vi.mock('../../../shared/validatePromptRequest.js', () => ({ default: validatePromptRequest }));

describe('GeminiAiController', () => {
  let req;
  let res;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock req and res objects
    req = {
      body: {
        prompt: 'Test prompt',
        userId: 'user123',
        sessionId: 'session456',
      },
    };
    // The `res` object is passed to `sendResponse`, but its internal methods
    // like `.status()` or `.json()` are handled by `sendResponse` itself.
    // So, a simple empty object is sufficient for `res` in these tests.
    res = {};
  });

  describe('GeminiAiGetResponse', () => {
    it('should send a success response when validation passes and service returns data', async () => {
      const mockPromptData = {
        prompt: 'Test prompt',
        userId: 'user123',
        sessionId: 'session456',
        errorResponse: null, // Indicates validation success
      };
      const mockServiceResult = { text: 'AI response from geminiService' };

      validatePromptRequest.mockResolvedValue(mockPromptData);
      GeminiAiService.geminiService.mockResolvedValue(mockServiceResult);

      await GeminiAiController.GeminiAiGetResponse(req, res);

      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(GeminiAiService.geminiService).toHaveBeenCalledWith(
        mockPromptData.sessionId,
        mockPromptData.prompt,
        mockPromptData.userId
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: mockServiceResult,
      });
    });

    it('should send an error response when validation fails', async () => {
      const mockErrorResponse = {
        statusCode: httpStatus.BAD_REQUEST,
        message: 'Validation failed: prompt is required.',
      };
      validatePromptRequest.mockResolvedValue({ errorResponse: mockErrorResponse });

      await GeminiAiController.GeminiAiGetResponse(req, res);

      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(GeminiAiService.geminiService).not.toHaveBeenCalled(); // Service should not be called on validation failure
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: mockErrorResponse.statusCode,
        success: false,
        message: mockErrorResponse.message,
        data: null,
      });
    });

    it('should send an error response with default status if errorResponse lacks statusCode', async () => {
      const mockErrorResponse = { message: 'Generic validation error.' }; // Missing statusCode
      validatePromptRequest.mockResolvedValue({ errorResponse: mockErrorResponse });

      await GeminiAiController.GeminiAiGetResponse(req, res);

      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(GeminiAiService.geminiService).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST, // Default status
        success: false,
        message: mockErrorResponse.message,
        data: null,
      });
    });

    it('should send an error response with default message if errorResponse lacks message', async () => {
      const mockErrorResponse = { statusCode: httpStatus.BAD_REQUEST }; // Missing message
      validatePromptRequest.mockResolvedValue({ errorResponse: mockErrorResponse });

      await GeminiAiController.GeminiAiGetResponse(req, res);

      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(GeminiAiService.geminiService).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: mockErrorResponse.statusCode,
        success: false,
        message: 'Validation failed.', // Default message
        data: null,
      });
    });
  });

  describe('Gemini25PreviewAiGetResponse', () => {
    it('should send a success response when validation passes and service returns data', async () => {
      const mockPromptData = {
        prompt: 'Test prompt for preview',
        userId: 'user123',
        sessionId: 'session456',
        errorResponse: null, // Indicates validation success
      };
      const mockServiceResult = { text: 'AI preview response from gemini25PreviewService' };

      validatePromptRequest.mockResolvedValue(mockPromptData);
      GeminiAiService.gemini25PreviewService.mockResolvedValue(mockServiceResult);

      await GeminiAiController.Gemini25PreviewAiGetResponse(req, res);

      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(GeminiAiService.gemini25PreviewService).toHaveBeenCalledWith(
        mockPromptData.sessionId,
        mockPromptData.prompt,
        mockPromptData.userId
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: mockServiceResult,
      });
    });

    it('should send an error response when validation fails', async () => {
      const mockErrorResponse = {
        statusCode: httpStatus.BAD_REQUEST,
        message: 'Validation failed for preview: prompt is required.',
      };
      validatePromptRequest.mockResolvedValue({ errorResponse: mockErrorResponse });

      await GeminiAiController.Gemini25PreviewAiGetResponse(req, res);

      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(GeminiAiService.gemini25PreviewService).not.toHaveBeenCalled(); // Service should not be called
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: mockErrorResponse.statusCode,
        success: false,
        message: mockErrorResponse.message,
        data: null,
      });
    });

    it('should send an error response with default status if errorResponse lacks statusCode', async () => {
      const mockErrorResponse = { message: 'Generic validation error for preview.' }; // Missing statusCode
      validatePromptRequest.mockResolvedValue({ errorResponse: mockErrorResponse });

      await GeminiAiController.Gemini25PreviewAiGetResponse(req, res);

      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(GeminiAiService.gemini25PreviewService).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST, // Default status
        success: false,
        message: mockErrorResponse.message,
        data: null,
      });
    });

    it('should send an error response with default message if errorResponse lacks message', async () => {
      const mockErrorResponse = { statusCode: httpStatus.BAD_REQUEST }; // Missing message
      validatePromptRequest.mockResolvedValue({ errorResponse: mockErrorResponse });

      await GeminiAiController.Gemini25PreviewAiGetResponse(req, res);

      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(GeminiAiService.gemini25PreviewService).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: mockErrorResponse.statusCode,
        success: false,
        message: 'Validation failed.', // Default message
        data: null,
      });
    });
  });
});