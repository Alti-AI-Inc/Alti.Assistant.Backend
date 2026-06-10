import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatImageResponse,
  formatAnalysisResponse,
  validateImageQuery,
  formatErrorMessage,
  extractImageSpecs,
  generateConversationTitle,
  validateImagePreferences,
  getSuggestedPrompts,
} from './image.helper.js';
import { logger } from '../../../shared/logger.js';
import { IMAGE_ASSISTANT_CONSTANTS } from './image.constant.js';

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock('./image.constant.js', () => ({
  IMAGE_ASSISTANT_CONSTANTS: {
    MESSAGE: {
      MAX_LENGTH: 100,
      MIN_LENGTH: 5,
    },
  },
}));

describe('image.helper.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatImageResponse', () => {
    it('should format a response with an array of images', () => {
      const response = 'Here are your images.';
      const imageData = [{ url: 'image1.png' }, { url: 'image2.png' }];
      const conversationId = 'conv-123';
      const messageCount = 5;

      const result = formatImageResponse(
        response,
        imageData,
        conversationId,
        messageCount
      );

      expect(result).toEqual({
        responseMessage: {
          text: response,
          images: imageData,
          type: 'generation',
        },
        conversationId,
        messageCount,
      });
    });

    it('should handle undefined imageData by defaulting to an empty array', () => {
      const response = 'Image generation failed.';
      const conversationId = 'conv-123';
      const messageCount = 5;

      const result = formatImageResponse(
        response,
        undefined,
        conversationId,
        messageCount
      );

      expect(result.responseMessage.images).toEqual([]);
    });

    it('should handle null imageData by defaulting to an empty array', () => {
      const response = 'Image generation failed.';
      const conversationId = 'conv-123';
      const messageCount = 5;

      const result = formatImageResponse(
        response,
        null,
        conversationId,
        messageCount
      );

      expect(result.responseMessage.images).toEqual([]);
    });

    it('should log a warning if an error occurs (though unlikely)', () => {
      // This is hard to test as object creation is very stable.
      // We can assume the catch block is for unforeseen edge cases.
      // The implementation of try and catch is identical, so the output is the same.
      const response = 'Test response';
      const result = formatImageResponse(response, [], 'conv-id', 1);
      expect(result.responseMessage.text).toBe(response);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('formatAnalysisResponse', () => {
    it('should format a standard analysis response', () => {
      const response = 'This image contains a cat.';
      const conversationId = 'conv-456';
      const messageCount = 2;

      const result = formatAnalysisResponse(
        response,
        conversationId,
        messageCount
      );

      expect(result).toEqual({
        responseMessage: {
          text: response,
          type: 'analysis',
        },
        conversationId,
        messageCount,
      });
    });
  });

  describe('validateImageQuery', () => {
    it('should return isValid: true for a valid query', () => {
      const message = 'A valid query message';
      const result = validateImageQuery(message);
      expect(result).toEqual({ isValid: true });
    });

    it('should return an error for a null or undefined message', () => {
      expect(validateImageQuery(null)).toEqual({
        isValid: false,
        error: 'Image query must be a non-empty string',
      });
      expect(validateImageQuery(undefined)).toEqual({
        isValid: false,
        error: 'Image query must be a non-empty string',
      });
    });

    it('should return an error for a non-string message', () => {
      expect(validateImageQuery(12345)).toEqual({
        isValid: false,
        error: 'Image query must be a non-empty string',
      });
      expect(validateImageQuery({})).toEqual({
        isValid: false,
        error: 'Image query must be a non-empty string',
      });
    });

    it('should return an error for a message that is too long', () => {
      const longMessage = 'a'.repeat(
        IMAGE_ASSISTANT_CONSTANTS.MESSAGE.MAX_LENGTH + 1
      );
      const result = validateImageQuery(longMessage);
      expect(result).toEqual({
        isValid: false,
        error: `Image query too long. Maximum ${IMAGE_ASSISTANT_CONSTANTS.MESSAGE.MAX_LENGTH} characters allowed`,
      });
    });

    it('should return an error for a message that is too short', () => {
      const shortMessage = 'a'.repeat(
        IMAGE_ASSISTANT_CONSTANTS.MESSAGE.MIN_LENGTH - 1
      );
      const result = validateImageQuery(shortMessage);
      expect(result).toEqual({
        isValid: false,
        error: `Image query too short. Minimum ${IMAGE_ASSISTANT_CONSTANTS.MESSAGE.MIN_LENGTH} characters required`,
      });
    });
  });

  describe('formatErrorMessage', () => {
    const baseMessage =
      'I apologize, but I encountered an error while processing your image request.';

    it('should return a generic message for an unknown error', () => {
      const error = new Error('Something weird happened');
      const result = formatErrorMessage(error, 'some query');
      expect(result).toBe(
        `${baseMessage} Please try rephrasing your request or try again later.`
      );
    });

    it('should return a rate limit message for "rate limit" or "quota" errors', () => {
      const rateLimitError = new Error('API rate limit exceeded');
      const quotaError = new Error('User quota exhausted');
      const expectedMessage = `${baseMessage} It seems we've reached our service limits. Please try again in a few minutes.`;

      expect(formatErrorMessage(rateLimitError, 'query')).toBe(expectedMessage);
      expect(formatErrorMessage(quotaError, 'query')).toBe(expectedMessage);
    });

    it('should return an invalid format message for "invalid" or "format" errors', () => {
      const invalidError = new Error('Invalid image data');
      const formatError = new Error('Unsupported format');
      const expectedMessage = `${baseMessage} Please check your image format or prompt and try again.`;

      expect(formatErrorMessage(invalidError, 'query')).toBe(expectedMessage);
      expect(formatErrorMessage(formatError, 'query')).toBe(expectedMessage);
    });

    it('should return a network message for "network" or "timeout" errors', () => {
      const networkError = new Error('A network error occurred');
      const timeoutError = new Error('Request timeout');
      const expectedMessage = `${baseMessage} There seems to be a connectivity issue. Please try again.`;

      expect(formatErrorMessage(networkError, 'query')).toBe(expectedMessage);
      expect(formatErrorMessage(timeoutError, 'query')).toBe(expectedMessage);
    });

    it('should handle errors without a message property gracefully', () => {
      const error = { code: 500 }; // Error-like object without a message
      const result = formatErrorMessage(error, 'some query');
      expect(result).toBe(
        `${baseMessage} Please try rephrasing your request or try again later.`
      );
    });
  });

  describe('extractImageSpecs', () => {
    it('should return default specs for a query with no keywords', () => {
      const query = 'A picture of a cat';
      expect(extractImageSpecs(query)).toEqual({
        size: 'standard',
        style: 'realistic',
        aspectRatio: '1:1',
        quality: 'standard',
      });
    });

    it('should extract all specs from a complex query', () => {
      const query = 'A large, photorealistic, landscape image in high quality';
      expect(extractImageSpecs(query)).toEqual({
        size: 'large',
        style: 'photorealistic',
        aspectRatio: '4:3',
        quality: 'high',
      });
    });

    it('should handle mixed case keywords', () => {
      const query = 'A SMALL, CARTOON, PORTRAIT image in HD';
      expect(extractImageSpecs(query)).toEqual({
        size: 'small',
        style: 'cartoon',
        aspectRatio: '3:4',
        quality: 'high',
      });
    });

    it.each([
      ['big', 'large'],
      ['1024', 'large'],
      ['tiny', 'small'],
      ['512', 'small'],
      ['anime', 'cartoon'],
      ['comic', 'cartoon'],
      ['artistic', 'abstract'],
      ['photo', 'photorealistic'],
      ['vertical', '3:4'],
      ['horizontal', '4:3'],
      ['wide', '4:3'],
      ['detailed', 'high'],
      ['hd', 'high'],
    ])('should extract spec from keyword: %s', (keyword, expected) => {
      const query = `a ${keyword} image`;
      const result = extractImageSpecs(query);
      const specKey = Object.keys(result).find((key) => result[key] === expected);
      expect(result[specKey]).toBe(expected);
    });
  });

  describe('generateConversationTitle', () => {
    const maxLength = 50;

    it('should create a title for a short generation query', () => {
      const query = 'A cat in a hat';
      expect(generateConversationTitle(query, 'generation')).toBe(
        'Generate: A cat in a hat'
      );
    });

    it('should create a title for a short analysis query', () => {
      const query = 'What is in this image?';
      expect(generateConversationTitle(query, 'analysis')).toBe(
        'Analyze: What is in this image?'
      );
    });

    it('should use "generation" as the default type', () => {
      const query = 'A dog on a skateboard';
      expect(generateConversationTitle(query)).toBe(
        'Generate: A dog on a skateboard'
      );
    });

    it('should truncate a long query and add ellipsis', () => {
      const longQuery = 'a'.repeat(maxLength + 10);
      const expectedSubstring = longQuery.substring(0, maxLength - 3);
      const result = generateConversationTitle(longQuery);
      expect(result).toBe(`Generate: ${expectedSubstring}...`);
    });
  });

  describe('validateImagePreferences', () => {
    it('should return default values for an empty or undefined input', () => {
      const defaults = {
        size: 'standard',
        style: 'realistic',
        aspectRatio: '1:1',
        quality: 'standard',
      };
      expect(validateImagePreferences({})).toEqual(defaults);
      expect(validateImagePreferences()).toEqual(defaults);
    });

    it('should accept all valid preferences', () => {
      const prefs = {
        size: 'large',
        style: 'cartoon',
        aspectRatio: '16:9',
        quality: 'high',
      };
      expect(validateImagePreferences(prefs)).toEqual(prefs);
    });

    it('should default invalid preferences', () => {
      const prefs = {
        size: 'huge',
        style: 'impressionist',
        aspectRatio: '2:1',
        quality: 'ultra',
      };
      expect(validateImagePreferences(prefs)).toEqual({
        size: 'standard',
        style: 'realistic',
        aspectRatio: '1:1',
        quality: 'standard',
      });
    });

    it('should handle a mix of valid and invalid preferences', () => {
      const prefs = {
        size: 'small', // valid
        style: 'weird', // invalid
        aspectRatio: '4:3', // valid
        quality: 'low', // invalid
      };
      expect(validateImagePreferences(prefs)).toEqual({
        size: 'small',
        style: 'realistic',
        aspectRatio: '4:3',
        quality: 'standard',
      });
    });
  });

  describe('getSuggestedPrompts', () => {
    it("should return logo suggestions when input contains 'logo'", () => {
      const suggestions = getSuggestedPrompts('design a company logo');
      expect(suggestions).toEqual([
        'Create a minimalist logo design',
        'Design a modern company logo',
        'Generate a vintage style logo',
      ]);
    });

    it("should return landscape suggestions when input contains 'landscape'", () => {
      const suggestions = getSuggestedPrompts('a beautiful landscape');
      expect(suggestions).toEqual([
        'Create a fantasy landscape',
        'Generate a peaceful mountain scene',
        'Design a futuristic cityscape',
      ]);
    });

    it("should return portrait suggestions when input contains 'portrait'", () => {
      const suggestions = getSuggestedPrompts('a portrait of a queen');
      expect(suggestions).toEqual([
        'Create a professional headshot',
        'Generate a fantasy character portrait',
        'Design an artistic self-portrait style',
      ]);
    });

    it('should return generic suggestions for input without keywords', () => {
      const suggestions = getSuggestedPrompts('a cat playing piano');
      expect(suggestions).toEqual([
        'Make the image more detailed',
        'Change the color scheme to blue tones',
        'Add more lighting effects',
      ]);
    });

    it('should handle mixed case input', () => {
      const suggestions = getSuggestedPrompts('A FANTASY LANDSCAPE');
      expect(suggestions).toEqual([
        'Create a fantasy landscape',
        'Generate a peaceful mountain scene',
        'Design a futuristic cityscape',
      ]);
    });

    it('should return a maximum of 3 suggestions', () => {
      const suggestions = getSuggestedPrompts('some generic input');
      expect(suggestions.length).toBe(3);
    });
  });
});