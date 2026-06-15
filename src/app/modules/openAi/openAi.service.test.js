import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openAIAiServices } from './openAi.service.js';

const {
  mockGeminiAiService,
  mockLogger
} = vi.hoisted(() => {
  // Mock external dependencies
  const mockGeminiAiService = {
    geminiService: vi.fn(),
  };

  const mockLogger = {
    info: vi.fn(),
  };

  return {
    mockGeminiAiService,
    mockLogger
  };
});

// Mock the modules
vi.mock('../gemini/gemini.service.js', () => ({
  GeminiAiService: mockGeminiAiService,
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

describe('openAIAiServices', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('openAiResponseService', () => {
    it('should call GeminiAiService.geminiService with correct arguments and log info', async () => {
      const mockPrompt = 'What is the capital of France?';
      const mockUserId = 'user-123';
      const mockSessionId = 'session-abc';
      const mockGeminiResponse = { text: 'Paris' };

      mockGeminiAiService.geminiService.mockResolvedValue(mockGeminiResponse);

      const result = await openAIAiServices.openAiResponseService(
        mockPrompt,
        mockUserId,
        mockSessionId
      );

      // Expect logger.info to be called
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Redirecting OpenAI GPT-4o Request to Google Gemini 3.1 Flash exclusively.'
      );

      // Expect GeminiAiService.geminiService to be called with the correct arguments
      expect(mockGeminiAiService.geminiService).toHaveBeenCalledTimes(1);
      expect(mockGeminiAiService.geminiService).toHaveBeenCalledWith(
        mockSessionId,
        mockPrompt,
        mockUserId
      );

      // Expect the service to return the response from GeminiAiService
      expect(result).toEqual(mockGeminiResponse);
    });

    it('should handle errors from GeminiAiService.geminiService', async () => {
      const mockPrompt = 'Error test';
      const mockUserId = 'user-error';
      const mockSessionId = 'session-error';
      const mockError = new Error('Gemini service failed');

      mockGeminiAiService.geminiService.mockRejectedValue(mockError);

      await expect(
        openAIAiServices.openAiResponseService(
          mockPrompt,
          mockUserId,
          mockSessionId
        )
      ).rejects.toThrow(mockError);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockGeminiAiService.geminiService).toHaveBeenCalledTimes(1);
    });
  });

  describe('openAi4NanoResponseService', () => {
    it('should call GeminiAiService.geminiService with correct arguments and log info', async () => {
      const mockPrompt = 'Generate a short story.';
      const mockUserId = 'user-456';
      const mockSessionId = 'session-def';
      const mockGeminiResponse = { text: 'Once upon a time...' };

      mockGeminiAiService.geminiService.mockResolvedValue(mockGeminiResponse);

      const result = await openAIAiServices.openAi4NanoResponseService(
        mockPrompt,
        mockUserId,
        mockSessionId
      );

      // Expect logger.info to be called
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Redirecting OpenAI GPT-4.1 Nano Request to Google Gemini 3.1 Flash exclusively.'
      );

      // Expect GeminiAiService.geminiService to be called with the correct arguments
      expect(mockGeminiAiService.geminiService).toHaveBeenCalledTimes(1);
      expect(mockGeminiAiService.geminiService).toHaveBeenCalledWith(
        mockSessionId,
        mockPrompt,
        mockUserId
      );

      // Expect the service to return the response from GeminiAiService
      expect(result).toEqual(mockGeminiResponse);
    });

    it('should handle errors from GeminiAiService.geminiService', async () => {
      const mockPrompt = 'Error test nano';
      const mockUserId = 'user-error-nano';
      const mockSessionId = 'session-error-nano';
      const mockError = new Error('Gemini nano service failed');

      mockGeminiAiService.geminiService.mockRejectedValue(mockError);

      await expect(
        openAIAiServices.openAi4NanoResponseService(
          mockPrompt,
          mockUserId,
          mockSessionId
        )
      ).rejects.toThrow(mockError);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockGeminiAiService.geminiService).toHaveBeenCalledTimes(1);
    });
  });
});