import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';

const {
  mockSendMessage,
  mockStartChat,
  mockGetGenerativeModel,
} = vi.hoisted(() => {
  const mockSendMessage = vi.fn().mockResolvedValue({
    response: {
      candidates: [
        {
          content: {
            parts: [
              { text: 'Mocked Gemini response text' }
            ]
          }
        }
      ]
    }
  });

  const mockStartChat = vi.fn().mockReturnValue({
    sendMessage: mockSendMessage,
  });

  const mockGetGenerativeModel = vi.fn().mockReturnValue({
    startChat: mockStartChat,
  });

  return {
    mockSendMessage,
    mockStartChat,
    mockGetGenerativeModel,
  };
});

vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: class {
    constructor() {
      this.getGenerativeModel = mockGetGenerativeModel;
    }
  },
  HarmCategory: {
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  },
  HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
  },
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gcp: {
      projectId: 'test-project',
      location: 'us-central1',
    },
  },
}));

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

// Import controllers AFTER mocking dependencies
import { QwenAiController } from './qwen.controller.js';

describe('QwenAiController (Vertex AI under the hood)', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      body: {},
      headers: {},
      user: { id: 'user-123', role: 'user' },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();

    validatePromptRequest.mockResolvedValue({
      prompt: 'Hello world',
      sessionId: 'session-123',
    });
  });

  describe('QwenAiGetResponse (VertexAiGetResponse shim)', () => {
    it('should process prompt successfully and mask PII', async () => {
      validatePromptRequest.mockResolvedValue({
        prompt: 'My email is test@example.com and phone is 123-456-7890.',
        sessionId: 'session-123',
      });

      await QwenAiController.QwenAiGetResponse(req, res, next);

      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(mockStartChat).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith(
        'My email is [EMAIL_REDACTED] and phone is [PHONE_REDACTED].'
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: { response: 'Mocked Gemini response text' },
      });
    });

    it('should call next with error if validation fails', async () => {
      const valError = new Error('Validation error');
      validatePromptRequest.mockRejectedValue(valError);

      await QwenAiController.QwenAiGetResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(valError);
      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it('should call next with error if Vertex AI call fails', async () => {
      const apiError = new Error('Vertex AI Timeout');
      mockSendMessage.mockRejectedValueOnce(apiError);

      await QwenAiController.QwenAiGetResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(apiError);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('QwenQWQAiGetResponse (VertexAiSpecializedGetResponse shim)', () => {
    it('should process specialized prompt successfully', async () => {
      await QwenAiController.QwenQWQAiGetResponse(req, res, next);

      expect(validatePromptRequest).toHaveBeenCalledWith(req);
      expect(mockStartChat).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith('Hello world');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Response processed successfully.',
        data: { response: 'Mocked Gemini response text' },
      });
    });

    it('should call next with error if validation fails', async () => {
      const valError = new Error('Validation error');
      validatePromptRequest.mockRejectedValue(valError);

      await QwenAiController.QwenQWQAiGetResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(valError);
    });
  });
});