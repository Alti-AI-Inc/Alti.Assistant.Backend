import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock http-status directly as it's just numbers
const httpStatus = {
  OK: 200,
  BAD_REQUEST: 400,
};

// Mock crypto's randomUUID
const mockRandomUUID = vi.fn();
vi.mock('crypto', () => ({
  randomUUID: mockRandomUUID,
}));

// Mock catchAsync to simply return the function it wraps,
// allowing us to test the async logic directly.
const mockCatchAsync = (fn) => fn;
vi.mock('../../../shared/catchAsync.js', () => ({
  default: mockCatchAsync,
}));

// Mock sendResponse
const mockSendResponse = vi.fn();
vi.mock('../../../shared/sendResponse.js', () => ({
  default: mockSendResponse,
}));

// Mock validatePromptRequest
const mockValidatePromptRequest = vi.fn();
vi.mock('../../../shared/validatePromptRequest.js', () => ({
  default: mockValidatePromptRequest,
}));

// Mock openAIAiServices
const mockOpenAiResponseService = vi.fn();
const mockOpenAi4NanoResponseService = vi.fn();
const mockOpenAiAnonymousResponseService = vi.fn();
vi.mock('./openAi.service.js', () => ({
  openAIAiServices: {
    openAiResponseService: mockOpenAiResponseService,
    openAi4NanoResponseService: mockOpenAi4NanoResponseService,
    openAiAnonymousResponseService: mockOpenAiAnonymousResponseService,
  },
}));

// Import the controller after mocks are set up
import { openAIAiController } from './openAi.controller.js';

describe('openAIAiController', () => {
  let req;
  let res;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock req and res objects
    req = {
      body: {},
    };
    res = {}; // sendResponse is mocked, so we don't need to mock res.status().json()

    // Default mock implementations for common utilities
    mockValidatePromptRequest.mockResolvedValue({
      prompt: 'Test prompt',
      userId: 'test-user-id',
      sessionId: 'test-session-id',
    });
    mockRandomUUID.mockReturnValue('generated-uuid');
  });

  describe('Gpt4oMiniGetResponse', () => {
    it('should process a GPT-4o mini request and send a successful response', async () => {
      const mockServiceResult = { text: 'GPT-4o mini response' };
      mockOpenAiResponseService.mockResolvedValue(mockServiceResult);

      await openAIAiController.Gpt4oMiniGetResponse(req, res);

      expect(mockValidatePromptRequest).toHaveBeenCalledWith(req);
      expect(mockOpenAiResponseService).toHaveBeenCalledWith(
        'Test prompt',
        'test-user-id',
        'test-session-id'
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: mockServiceResult,
      });
    });

    it('should handle errors from openAiResponseService', async () => {
      const errorMessage = 'Service error';
      mockOpenAiResponseService.mockRejectedValue(new Error(errorMessage));

      await expect(openAIAiController.Gpt4oMiniGetResponse(req, res)).rejects.toThrow(errorMessage);

      expect(mockValidatePromptRequest).toHaveBeenCalledWith(req);
      expect(mockOpenAiResponseService).toHaveBeenCalledWith(
        'Test prompt',
        'test-user-id',
        'test-session-id'
      );
      expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('should handle errors from validatePromptRequest', async () => {
      const validationError = new Error('Validation failed');
      mockValidatePromptRequest.mockRejectedValue(validationError);

      await expect(openAIAiController.Gpt4oMiniGetResponse(req, res)).rejects.toThrow('Validation failed');

      expect(mockValidatePromptRequest).toHaveBeenCalledWith(req);
      expect(mockOpenAiResponseService).not.toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });

  describe('Gpt4NanoGetResponse', () => {
    it('should process a GPT-4 nano request and send a successful response', async () => {
      const mockServiceResult = { text: 'GPT-4 nano response' };
      mockOpenAi4NanoResponseService.mockResolvedValue(mockServiceResult);

      await openAIAiController.Gpt4NanoGetResponse(req, res);

      expect(mockValidatePromptRequest).toHaveBeenCalledWith(req);
      expect(mockOpenAi4NanoResponseService).toHaveBeenCalledWith(
        'Test prompt',
        'test-user-id',
        'test-session-id'
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: mockServiceResult,
      });
    });

    it('should handle errors from openAi4NanoResponseService', async () => {
      const errorMessage = 'Nano service error';
      mockOpenAi4NanoResponseService.mockRejectedValue(new Error(errorMessage));

      await expect(openAIAiController.Gpt4NanoGetResponse(req, res)).rejects.toThrow(errorMessage);

      expect(mockValidatePromptRequest).toHaveBeenCalledWith(req);
      expect(mockOpenAi4NanoResponseService).toHaveBeenCalledWith(
        'Test prompt',
        'test-user-id',
        'test-session-id'
      );
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });

  describe('OpenAiGetResponseAnonymously', () => {
    it('should process an anonymous request with a provided sessionId and send a successful response', async () => {
      req.body = { prompt: 'Anonymous prompt', sessionId: 'anon-session-123' };
      const mockServiceResult = { text: 'Anonymous OpenAI response' };
      mockOpenAiAnonymousResponseService.mockResolvedValue(mockServiceResult);

      await openAIAiController.OpenAiGetResponseAnonymously(req, res);

      expect(mockRandomUUID).not.toHaveBeenCalled(); // sessionId was provided
      expect(mockOpenAiAnonymousResponseService).toHaveBeenCalledWith(
        'Anonymous prompt',
        'anon-session-123'
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: mockServiceResult,
      });
    });

    it('should process an anonymous request without a sessionId, generating one, and send a successful response', async () => {
      req.body = { prompt: 'Anonymous prompt without session' };
      const mockServiceResult = { text: 'Anonymous OpenAI response with generated session' };
      mockOpenAiAnonymousResponseService.mockResolvedValue(mockServiceResult);

      await openAIAiController.OpenAiGetResponseAnonymously(req, res);

      expect(mockRandomUUID).toHaveBeenCalledTimes(1); // sessionId was not provided, so it should be generated
      expect(mockOpenAiAnonymousResponseService).toHaveBeenCalledWith(
        'Anonymous prompt without session',
        'generated-uuid' // From mockRandomUUID
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: mockServiceResult,
      });
    });

    it('should return BAD_REQUEST if prompt is missing', async () => {
      req.body = { sessionId: 'anon-session-123' }; // No prompt

      await openAIAiController.OpenAiGetResponseAnonymously(req, res);

      expect(mockRandomUUID).not.toHaveBeenCalled(); // No need to generate UUID if prompt is missing
      expect(mockOpenAiAnonymousResponseService).not.toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Prompt is required.',
        data: null,
      });
    });

    it('should handle errors from openAiAnonymousResponseService', async () => {
      req.body = { prompt: 'Error prompt', sessionId: 'error-session' };
      const errorMessage = 'Anonymous service error';
      mockOpenAiAnonymousResponseService.mockRejectedValue(new Error(errorMessage));

      await expect(openAIAiController.OpenAiGetResponseAnonymously(req, res)).rejects.toThrow(errorMessage);

      expect(mockOpenAiAnonymousResponseService).toHaveBeenCalledWith(
        'Error prompt',
        'error-session'
      );
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });
});