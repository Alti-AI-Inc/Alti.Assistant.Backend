import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockLogger,
  mockVideoAssistantConstants,
  mockFormatVideoResponse,
  mockFormatAnalysisResponse
} = vi.hoisted(() => {
  // Mock external dependencies
  const mockLogger = {
    warn: vi.fn(),
  };

  const mockVideoAssistantConstants = {
    VIDEO_ASSISTANT_CONSTANTS: {
      MESSAGE: {
        MAX_LENGTH: 200,
        MIN_LENGTH: 10,
        DEFAULT_ERROR: 'An unexpected error occurred. Please try again later.',
      },
      VIDEO_SPECS: {
        STYLES: {
          REALISTIC: 'realistic',
          CARTOON: 'cartoon',
          CINEMATIC: 'cinematic',
          ABSTRACT: 'abstract',
        },
        RESOLUTIONS: {
          '1080P': '1080p',
          '720P': '720p',
          '4K': '4k',
        },
      },
      SUCCESS: {
        VIDEO_GENERATED: 'Your video has been successfully generated!',
      },
      ERRORS: {
        RATE_LIMIT: 'You have exceeded the rate limit. Please try again shortly.',
        QUOTA_EXCEEDED: 'Our service quota has been exceeded. Please try again later.',
        NETWORK_ERROR: 'There was a network issue. Please check your connection and try again.',
        INVALID_FORMAT: 'The video format or prompt is invalid. Please review and try again.',
        GENERATION_FAILED: 'Video generation failed due to an internal error. Please try again.',
      },
    },
  };

  // Define mocks for internal helper functions that formatAssistantResponse calls
  const mockFormatVideoResponse = vi.fn();
  const mockFormatAnalysisResponse = vi.fn();

  return {
    mockLogger,
    mockVideoAssistantConstants,
    mockFormatVideoResponse,
    mockFormatAnalysisResponse
  };
});

// Mock the external modules
vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('./video.constant.js', () => (mockVideoAssistantConstants));

// Mock the video.helper.js module itself to inject our spies for formatVideoResponse and formatAnalysisResponse
// This allows formatAssistantResponse to call our mocked versions when it's imported.
vi.mock('./video.helper.js', async (importOriginal) => {
  const actual = await importOriginal(); // Import actual implementations of all exports
  return {
    ...actual, // Export all actual functions
    formatVideoResponse: mockFormatVideoResponse, // Override with our mock
    formatAnalysisResponse: mockFormatAnalysisResponse, // Override with our mock
  };
});

// Import the functions from the (potentially mocked) module.
// formatAssistantResponse will now use the mocked internal functions.
// Other functions will use their actual implementations for direct testing.
import {
  formatVideoResponse, // Actual function for direct testing
  formatAnalysisResponse, // Actual function for direct testing
  validateVideoQuery,
  formatErrorMessage,
  extractVideoSpecs,
  validateVideoSpecs,
  getUserErrorMessage,
  formatAssistantResponse, // This one will use the mocked internal helpers
} from './video.helper.js';

describe('video.helper.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear mocks for formatAssistantResponse's internal calls specifically
    mockFormatVideoResponse.mockClear();
    mockFormatAnalysisResponse.mockClear();
  });

  describe('formatVideoResponse', () => {
    const conversationId = 'conv123';
    const messageCount = 5;

    it('should format response correctly with videoData as string', () => {
      const response = 'Video generated successfully.';
      const videoData = 'http://example.com/video.mp4';
      const expected = {
        responseMessage: {
          text: response,
          video: videoData,
          type: 'generation',
        },
        conversationId,
        messageCount,
      };
      expect(formatVideoResponse(response, videoData, conversationId, messageCount)).toEqual(expected);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should format response correctly with videoData as object', () => {
      const response = 'Video details.';
      const videoData = { url: 'http://example.com/video.mp4', duration: 10 };
      const expected = {
        responseMessage: {
          text: response,
          video: videoData,
          type: 'generation',
        },
        conversationId,
        messageCount,
      };
      expect(formatVideoResponse(response, videoData, conversationId, messageCount)).toEqual(expected);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should format response correctly when videoData is null', () => {
      const response = 'Video generation in progress.';
      const videoData = null;
      const expected = {
        responseMessage: {
          text: response,
          video: null,
          type: 'generation',
        },
        conversationId,
        messageCount,
      };
      expect(formatVideoResponse(response, videoData, conversationId, messageCount)).toEqual(expected);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should format response correctly when videoData is undefined', () => {
      const response = 'Video generation failed.';
      const videoData = undefined;
      const expected = {
        responseMessage: {
          text: response,
          video: null,
          type: 'generation',
        },
        conversationId,
        messageCount,
      };
      expect(formatVideoResponse(response, videoData, conversationId, messageCount)).toEqual(expected);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('formatAnalysisResponse', () => {
    const conversationId = 'conv456';
    const messageCount = 2;

    it('should format analysis response correctly', () => {
      const response = 'Analysis complete.';
      const expected = {
        responseMessage: {
          text: response,
          type: 'analysis',
        },
        conversationId,
        messageCount,
      };
      expect(formatAnalysisResponse(response, conversationId, messageCount)).toEqual(expected);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('validateVideoQuery', () => {
    const { MAX_LENGTH, MIN_LENGTH } = mockVideoAssistantConstants.VIDEO_ASSISTANT_CONSTANTS.MESSAGE;

    it('should return isValid: true for a valid message', () => {
      const message = 'This is a valid video query.';
      expect(validateVideoQuery(message)).toEqual({ isValid: true });
    });

    it('should return isValid: false for null message', () => {
      expect(validateVideoQuery(null)).toEqual({
        isValid: false,
        error: 'Video query must be a non-empty string',
      });
    });

    it('should return isValid: false for undefined message', () => {
      expect(validateVideoQuery(undefined)).toEqual({
        isValid: false,
        error: 'Video query must be a non-empty string',
      });
    });

    it('should return isValid: false for empty string message', () => {
      expect(validateVideoQuery('')).toEqual({
        isValid: false,
        error: 'Video query must be a non-empty string',
      });
    });

    it('should return isValid: false for non-string message', () => {
      expect(validateVideoQuery(123)).toEqual({
        isValid: false,
        error: 'Video query must be a non-empty string',
      });
      expect(validateVideoQuery({})).toEqual({
        isValid: false,
        error: 'Video query must be a non-empty string',
      });
    });

    it('should return isValid: false for a message that is too long', () => {
      const longMessage = 'a'.repeat(MAX_LENGTH + 1);
      expect(validateVideoQuery(longMessage)).toEqual({
        isValid: false,
        error: `Video query too long. Maximum ${MAX_LENGTH} characters allowed`,
      });
    });

    it('should return isValid: false for a message that is too short', () => {
      const shortMessage = 'a'.repeat(MIN_LENGTH - 1);
      expect(validateVideoQuery(shortMessage)).toEqual({
        isValid: false,
        error: `Video query too short. Minimum ${MIN_LENGTH} characters required`,
      });
    });

    it('should return isValid: true for a message at max length', () => {
      const message = 'a'.repeat(MAX_LENGTH);
      expect(validateVideoQuery(message)).toEqual({ isValid: true });
    });

    it('should return isValid: true for a message at min length', () => {
      const message = 'a'.repeat(MIN_LENGTH);
      expect(validateVideoQuery(message)).toEqual({ isValid: true });
    });
  });

  describe('formatErrorMessage', () => {
    const originalQuery = 'create a video about cats';
    const baseMessage = 'I apologize, but I encountered an error while processing your video request.';

    it('should return rate limit message for "rate limit" error', () => {
      const error = new Error('API rate limit exceeded');
      expect(formatErrorMessage(error, originalQuery)).toBe(
        `${baseMessage} It seems we've reached our service limits. Please try again in a few minutes.`
      );
    });

    it('should return quota message for "quota" error', () => {
      const error = new Error('Daily quota exceeded');
      expect(formatErrorMessage(error, originalQuery)).toBe(
        `${baseMessage} It seems we've reached our service limits. Please try again in a few minutes.`
      );
    });

    it('should return invalid format message for "invalid" error', () => {
      const error = new Error('Invalid video input');
      expect(formatErrorMessage(error, originalQuery)).toBe(
        `${baseMessage} Please check your video format or prompt and try again.`
      );
    });

    it('should return invalid format message for "format" error', () => {
      const error = new Error('Unsupported format');
      expect(formatErrorMessage(error, originalQuery)).toBe(
        `${baseMessage} Please check your video format or prompt and try again.`
      );
    });

    it('should return network issue message for "network" error', () => {
      const error = new Error('Network connection lost');
      expect(formatErrorMessage(error, originalQuery)).toBe(
        `${baseMessage} There seems to be a connectivity issue. Please try again.`
      );
    });

    it('should return network issue message for "timeout" error', () => {
      const error = new Error('Request timeout');
      expect(formatErrorMessage(error, originalQuery)).toBe(
        `${baseMessage} There seems to be a connectivity issue. Please try again.`
      );
    });

    it('should return generic message for unknown error', () => {
      const error = new Error('Something unexpected happened');
      expect(formatErrorMessage(error, originalQuery)).toBe(
        `${baseMessage} Please try rephrasing your request or try again later.`
      );
    });

    it('should return generic message when error.message is null', () => {
      const error = { message: null };
      expect(formatErrorMessage(error, originalQuery)).toBe(
        `${baseMessage} Please try rephrasing your request or try again later.`
      );
    });

    it('should return generic message when error.message is undefined', () => {
      const error = {}; // No message property
      expect(formatErrorMessage(error, originalQuery)).toBe(
        `${baseMessage} Please try rephrasing your request or try again later.`
      );
    });

    it('should return generic message when error is null', () => {
      expect(formatErrorMessage(null, originalQuery)).toBe(
        `${baseMessage} Please try rephrasing your request or try again later.`
      );
    });

    it('should return generic message when error is undefined', () => {
      expect(formatErrorMessage(undefined, originalQuery)).toBe(
        `${baseMessage} Please try rephrasing your request or try again later.`
      );
    });
  });

  describe('extractVideoSpecs', () => {
    it('should return default specs for an empty query', () => {
      const expected = {
        duration: 10,
        style: 'realistic',
        resolution: '1080p',
        aspectRatio: '16:9',
      };
      expect(extractVideoSpecs('')).toEqual(expected);
    });

    it('should return default specs for a query with no keywords', () => {
      const expected = {
        duration: 10,
        style: 'realistic',
        resolution: '1080p',
        aspectRatio: '16:9',
      };
      expect(extractVideoSpecs('a video about a cat')).toEqual(expected);
    });

    it('should extract duration preferences', () => {
      expect(extractVideoSpecs('make a short video')).toHaveProperty('duration', 5);
      expect(extractVideoSpecs('quick video')).toHaveProperty('duration', 5);
      expect(extractVideoSpecs('5 second video')).toHaveProperty('duration', 5);
      expect(extractVideoSpecs('make a long video')).toHaveProperty('duration', 30);
      expect(extractVideoSpecs('30 second video')).toHaveProperty('duration', 30);
      expect(extractVideoSpecs('half minute video')).toHaveProperty('duration', 30);
    });

    it('should extract style preferences', () => {
      expect(extractVideoSpecs('cartoon style')).toHaveProperty('style', 'cartoon');
      expect(extractVideoSpecs('animated video')).toHaveProperty('style', 'cartoon');
      expect(extractVideoSpecs('comic book style')).toHaveProperty('style', 'cartoon');
      expect(extractVideoSpecs('cinematic look')).toHaveProperty('style', 'cinematic');
      expect(extractVideoSpecs('movie like')).toHaveProperty('style', 'cinematic');
      expect(extractVideoSpecs('film noir')).toHaveProperty('style', 'cinematic');
      expect(extractVideoSpecs('abstract art')).toHaveProperty('style', 'abstract');
      expect(extractVideoSpecs('artistic video')).toHaveProperty('style', 'abstract');
    });

    it('should extract resolution preferences', () => {
      expect(extractVideoSpecs('in 4k')).toHaveProperty('resolution', '4k');
      expect(extractVideoSpecs('ultra hd video')).toHaveProperty('resolution', '4k');
      expect(extractVideoSpecs('uhd quality')).toHaveProperty('resolution', '4k');
      expect(extractVideoSpecs('720p resolution')).toHaveProperty('resolution', '720p');
      expect(extractVideoSpecs('hd video')).toHaveProperty('resolution', '720p');
    });

    it('should extract aspect ratio preferences', () => {
      expect(extractVideoSpecs('square video')).toHaveProperty('aspectRatio', '1:1');
      expect(extractVideoSpecs('1:1 ratio')).toHaveProperty('aspectRatio', '1:1');
      expect(extractVideoSpecs('portrait video')).toHaveProperty('aspectRatio', '9:16');
      expect(extractVideoSpecs('9:16 aspect')).toHaveProperty('aspectRatio', '9:16');
      expect(extractVideoSpecs('vertical video')).toHaveProperty('aspectRatio', '9:16');
      expect(extractVideoSpecs('widescreen film')).toHaveProperty('aspectRatio', '21:9');
      expect(extractVideoSpecs('21:9 aspect ratio')).toHaveProperty('aspectRatio', '21:9');
      expect(extractVideoSpecs('ultrawide monitor')).toHaveProperty('aspectRatio', '21:9');
    });

    it('should handle case insensitivity', () => {
      expect(extractVideoSpecs('MAKE A SHORT VIDEO IN 4K')).toHaveProperty('duration', 5);
      expect(extractVideoSpecs('MAKE A SHORT VIDEO IN 4K')).toHaveProperty('resolution', '4k');
    });

    it('should combine multiple preferences', () => {
      const query = 'create a 30 second cinematic 4k portrait video';
      const expected = {
        duration: 30,
        style: 'cinematic',
        resolution: '4k',
        aspectRatio: '9:16',
      };
      expect(extractVideoSpecs(query)).toEqual(expected);
    });

    it('should prioritize later keywords if overlapping (current implementation overwrites)', () => {
      expect(extractVideoSpecs('short long video')).toHaveProperty('duration', 30);
      expect(extractVideoSpecs('long short video')).toHaveProperty('duration', 5);
    });
  });

  describe('validateVideoSpecs', () => {
    const { STYLES, RESOLUTIONS } = mockVideoAssistantConstants.VIDEO_ASSISTANT_CONSTANTS.VIDEO_SPECS;
    const validStyles = Object.values(STYLES);
    const validResolutions = Object.values(RESOLUTIONS);

    it('should return isValid: true for valid specs', () => {
      const specs = {
        duration: 15,
        style: STYLES.REALISTIC,
        resolution: RESOLUTIONS['1080P'],
        aspectRatio: '16:9', // aspectRatio is not validated by this function
      };
      expect(validateVideoSpecs(specs)).toEqual({ isValid: true, errors: [] });
    });

    it('should return isValid: true for empty specs (no validation errors)', () => {
      expect(validateVideoSpecs({})).toEqual({ isValid: true, errors: [] });
    });

    it('should return error for duration too low', () => {
      const specs = { duration: 0 };
      expect(validateVideoSpecs(specs)).toEqual({
        isValid: false,
        errors: ['Duration must be between 1 and 60 seconds'],
      });
    });

    it('should return error for duration too high', () => {
      const specs = { duration: 61 };
      expect(validateVideoSpecs(specs)).toEqual({
        isValid: false,
        errors: ['Duration must be between 1 and 60 seconds'],
      });
    });

    it('should return error for invalid style', () => {
      const specs = { style: 'fantasy' };
      expect(validateVideoSpecs(specs)).toEqual({
        isValid: false,
        errors: [`Style must be one of: ${validStyles.join(', ')}`],
      });
    });

    it('should return error for invalid resolution', () => {
      const specs = { resolution: '8k' };
      expect(validateVideoSpecs(specs)).toEqual({
        isValid: false,
        errors: [`Resolution must be one of: ${validResolutions.join(', ')}`],
      });
    });

    it('should return multiple errors for multiple invalid specs', () => {
      const specs = {
        duration: 100,
        style: 'nonexistent',
        resolution: 'invalid',
      };
      expect(validateVideoSpecs(specs)).toEqual({
        isValid: false,
        errors: [
          'Duration must be between 1 and 60 seconds',
          `Style must be one of: ${validStyles.join(', ')}`,
          `Resolution must be one of: ${validResolutions.join(', ')}`,
        ],
      });
    });

    it('should not validate aspectRatio as it is not part of the validation logic', () => {
      const specs = { aspectRatio: 'invalid' };
      expect(validateVideoSpecs(specs)).toEqual({ isValid: true, errors: [] });
    });
  });

  describe('formatAssistantResponse', () => {
    const conversationId = 'conv789';
    const messageCount = 1;
    const VIDEO_GENERATED_MSG = mockVideoAssistantConstants.VIDEO_ASSISTANT_CONSTANTS.SUCCESS.VIDEO_GENERATED;

    it('should call mockFormatVideoResponse if result has videoUrl', () => {
      const result = {
        videoUrl: 'http://video.com/abc.mp4',
        response: 'Here is your video!',
      };
      const expectedVideoResponse = { some: 'video response' };
      mockFormatVideoResponse.mockReturnValue(expectedVideoResponse);

      const actual = formatAssistantResponse(result, conversationId, messageCount);

      expect(mockFormatVideoResponse).toHaveBeenCalledWith(
        result.response,
        result.videoUrl,
        conversationId,
        messageCount
      );
      expect(mockFormatAnalysisResponse).not.toHaveBeenCalled();
      expect(actual).toEqual(expectedVideoResponse);
    });

    it('should call mockFormatVideoResponse with default success message if result has videoUrl but no response', () => {
      const result = {
        videoUrl: 'http://video.com/abc.mp4',
      };
      const expectedVideoResponse = { some: 'video response' };
      mockFormatVideoResponse.mockReturnValue(expectedVideoResponse);

      const actual = formatAssistantResponse(result, conversationId, messageCount);

      expect(mockFormatVideoResponse).toHaveBeenCalledWith(
        VIDEO_GENERATED_MSG,
        result.videoUrl,
        conversationId,
        messageCount
      );
      expect(mockFormatAnalysisResponse).not.toHaveBeenCalled();
      expect(actual).toEqual(expectedVideoResponse);
    });

    it('should call mockFormatAnalysisResponse if result has responseMessage but no videoUrl', () => {
      const result = {
        responseMessage: 'Here is an analysis.',
      };
      const expectedAnalysisResponse = { some: 'analysis response' };
      mockFormatAnalysisResponse.mockReturnValue(expectedAnalysisResponse);

      const actual = formatAssistantResponse(result, conversationId, messageCount);

      expect(mockFormatAnalysisResponse).toHaveBeenCalledWith(
        result.responseMessage,
        conversationId,
        messageCount
      );
      expect(mockFormatVideoResponse).not.toHaveBeenCalled();
      expect(actual).toEqual(expectedAnalysisResponse);
    });

    it('should call mockFormatAnalysisResponse with default message if neither videoUrl nor responseMessage exist', () => {
      const result = {};
      const expectedAnalysisResponse = { some: 'default analysis response' };
      mockFormatAnalysisResponse.mockReturnValue(expectedAnalysisResponse);

      const actual = formatAssistantResponse(result, conversationId, messageCount);

      expect(mockFormatAnalysisResponse).toHaveBeenCalledWith(
        "I'm processing your video request. Could you provide more details?",
        conversationId,
        messageCount
      );
      expect(mockFormatVideoResponse).not.toHaveBeenCalled();
      expect(actual).toEqual(expectedAnalysisResponse);
    });

    it('should prioritize videoUrl over responseMessage if both exist', () => {
      const result = {
        videoUrl: 'http://video.com/abc.mp4',
        response: 'Video message',
        responseMessage: 'Analysis message',
      };
      const expectedVideoResponse = { some: 'video response' };
      mockFormatVideoResponse.mockReturnValue(expectedVideoResponse);

      const actual = formatAssistantResponse(result, conversationId, messageCount);

      expect(mockFormatVideoResponse).toHaveBeenCalledWith(
        result.response,
        result.videoUrl,
        conversationId,
        messageCount
      );
      expect(mockFormatAnalysisResponse).not.toHaveBeenCalled();
      expect(actual).toEqual(expectedVideoResponse);
    });
  });

  describe('getUserErrorMessage', () => {
    const { ERRORS, MESSAGE } = mockVideoAssistantConstants.VIDEO_ASSISTANT_CONSTANTS;

    it('should return rate limit error message', () => {
      expect(getUserErrorMessage('rate_limit')).toBe(ERRORS.RATE_LIMIT);
    });

    it('should return quota exceeded error message', () => {
      expect(getUserErrorMessage('quota_exceeded')).toBe(ERRORS.QUOTA_EXCEEDED);
    });

    it('should return network error message', () => {
      expect(getUserErrorMessage('network_error')).toBe(ERRORS.NETWORK_ERROR);
    });

    it('should return invalid format error message', () => {
      expect(getUserErrorMessage('invalid_format')).toBe(ERRORS.INVALID_FORMAT);
    });

    it('should return generation failed error message', () => {
      expect(getUserErrorMessage('generation_failed')).toBe(ERRORS.GENERATION_FAILED);
    });

    it('should return default error message for unknown error type', () => {
      expect(getUserErrorMessage('unknown_error')).toBe(MESSAGE.DEFAULT_ERROR);
    });

    it('should return default error message for null error type', () => {
      expect(getUserErrorMessage(null)).toBe(MESSAGE.DEFAULT_ERROR);
    });

    it('should return default error message for undefined error type', () => {
      expect(getUserErrorMessage(undefined)).toBe(MESSAGE.DEFAULT_ERROR);
    });

    it('should return default error message for empty string error type', () => {
      expect(getUserErrorMessage('')).toBe(MESSAGE.DEFAULT_ERROR);
    });
  });
});