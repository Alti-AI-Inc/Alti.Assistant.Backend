import { describe, it, expect } from 'vitest';
import { VideoValidation } from './video.validation';
import { z } from 'zod';

describe('VideoValidation Schemas', () => {
  describe('videoGenerationSchema', () => {
    it('should validate a minimal valid video generation request body', () => {
      const validBody = {
        body: {
          message: 'This is a test message for video generation.',
        },
      };
      const result = VideoValidation.videoGenerationSchema.safeParse(validBody);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validBody);
    });

    it('should validate a video generation request body with all optional fields', () => {
      const validBody = {
        body: {
          message: 'Generate a video about AI.',
          conversationId: '65e9b3c1a7d0f2e8c1b3a5d7',
          aspectRatio: '16:9',
          durationSeconds: 30,
          resolution: '1080p',
          model: 'advanced-model-v2',
        },
      };
      const result = VideoValidation.videoGenerationSchema.safeParse(validBody);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validBody);
    });

    it('should reject a video generation request body with missing message', () => {
      const invalidBody = {
        body: {
          conversationId: 'someId',
        },
      };
      const result = VideoValidation.videoGenerationSchema.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Video prompt is required');
      expect(result.error?.issues[0].path).toEqual(['body', 'message']);
    });

    it('should reject a video generation request body with message too short', () => {
      const invalidBody = {
        body: {
          message: 'hi',
        },
      };
      const result = VideoValidation.videoGenerationSchema.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Video prompt must be at least 3 characters');
      expect(result.error?.issues[0].path).toEqual(['body', 'message']);
    });

    it('should reject a video generation request body with message too long', () => {
      const longMessage = 'a'.repeat(2001);
      const invalidBody = {
        body: {
          message: longMessage,
        },
      };
      const result = VideoValidation.videoGenerationSchema.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Video prompt too long');
      expect(result.error?.issues[0].path).toEqual(['body', 'message']);
    });

    it('should reject a video generation request body with invalid aspectRatio', () => {
      const invalidBody = {
        body: {
          message: 'Valid message.',
          aspectRatio: 'invalid-ratio',
        },
      };
      const result = VideoValidation.videoGenerationSchema.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe("Invalid enum value. Expected '1:1' | '16:9' | '9:16' | '4:3', received 'invalid-ratio'");
      expect(result.error?.issues[0].path).toEqual(['body', 'aspectRatio']);
    });

    it('should reject a video generation request body with durationSeconds too low', () => {
      const invalidBody = {
        body: {
          message: 'Valid message.',
          durationSeconds: 0,
        },
      };
      const result = VideoValidation.videoGenerationSchema.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Number must be greater than or equal to 1');
      expect(result.error?.issues[0].path).toEqual(['body', 'durationSeconds']);
    });

    it('should reject a video generation request body with durationSeconds too high', () => {
      const invalidBody = {
        body: {
          message: 'Valid message.',
          durationSeconds: 61,
        },
      };
      const result = VideoValidation.videoGenerationSchema.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Number must be less than or equal to 60');
      expect(result.error?.issues[0].path).toEqual(['body', 'durationSeconds']);
    });

    it('should reject a video generation request body with non-integer durationSeconds', () => {
      const invalidBody = {
        body: {
          message: 'Valid message.',
          durationSeconds: 10.5,
        },
      };
      const result = VideoValidation.videoGenerationSchema.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected integer, received float');
      expect(result.error?.issues[0].path).toEqual(['body', 'durationSeconds']);
    });

    it('should reject a video generation request body with invalid resolution', () => {
      const invalidBody = {
        body: {
          message: 'Valid message.',
          resolution: '4K',
        },
      };
      const result = VideoValidation.videoGenerationSchema.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe("Invalid enum value. Expected '720p' | '1080p', received '4K'");
      expect(result.error?.issues[0].path).toEqual(['body', 'resolution']);
    });

    it('should reject a video generation request body with wrong type for conversationId', () => {
      const invalidBody = {
        body: {
          message: 'Valid message.',
          conversationId: 123,
        },
      };
      const result = VideoValidation.videoGenerationSchema.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
      expect(result.error?.issues[0].path).toEqual(['body', 'conversationId']);
    });

    it('should reject a video generation request body with wrong type for model', () => {
      const invalidBody = {
        body: {
          message: 'Valid message.',
          model: 123,
        },
      };
      const result = VideoValidation.videoGenerationSchema.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
      expect(result.error?.issues[0].path).toEqual(['body', 'model']);
    });

    it('should reject an empty body object', () => {
      const invalidBody = { body: {} };
      const result = VideoValidation.videoGenerationSchema.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Video prompt is required');
      expect(result.error?.issues[0].path).toEqual(['body', 'message']);
    });

    it('should reject a request without a body object', () => {
      const invalidRequest = { message: 'test' };
      const result = VideoValidation.videoGenerationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Required');
      expect(result.error?.issues[0].path).toEqual(['body']);
    });
  });

  describe('conversationSchema', () => {
    it('should validate a request with a valid conversationId in params', () => {
      const validParams = {
        params: {
          conversationId: '65e9b3c1a7d0f2e8c1b3a5d7',
        },
      };
      const result = VideoValidation.conversationSchema.safeParse(validParams);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validParams);
    });

    it('should reject a request with missing conversationId in params', () => {
      const invalidParams = {
        params: {},
      };
      const result = VideoValidation.conversationSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Conversation ID is required');
      expect(result.error?.issues[0].path).toEqual(['params', 'conversationId']);
    });

    it('should reject a request with conversationId of wrong type in params', () => {
      const invalidParams = {
        params: {
          conversationId: 12345,
        },
      };
      const result = VideoValidation.conversationSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
      expect(result.error?.issues[0].path).toEqual(['params', 'conversationId']);
    });

    it('should reject a request without a params object', () => {
      const invalidRequest = { conversationId: 'someId' };
      const result = VideoValidation.conversationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Required');
      expect(result.error?.issues[0].path).toEqual(['params']);
    });
  });

  describe('guestUserSchema', () => {
    it('should validate a request with a valid guestUserId in params', () => {
      const validParams = {
        params: {
          guestUserId: '65e9b3c1a7d0f2e8c1b3a5d7', // 24-char hex string
        },
      };
      const result = VideoValidation.guestUserSchema.safeParse(validParams);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validParams);
    });

    it('should reject a request with missing guestUserId in params', () => {
      const invalidParams = {
        params: {},
      };
      const result = VideoValidation.guestUserSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Guest user ID is required');
      expect(result.error?.issues[0].path).toEqual(['params', 'guestUserId']);
    });

    it('should reject a request with guestUserId of wrong type in params', () => {
      const invalidParams = {
        params: {
          guestUserId: 12345,
        },
      };
      const result = VideoValidation.guestUserSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
      expect(result.error?.issues[0].path).toEqual(['params', 'guestUserId']);
    });

    it('should reject a request with an invalid guestUserId format (too short)', () => {
      const invalidParams = {
        params: {
          guestUserId: '65e9b3c1a7d0f2e8c1b3a5d', // 23 chars
        },
      };
      const result = VideoValidation.guestUserSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Invalid guest user ID format');
      expect(result.error?.issues[0].path).toEqual(['params', 'guestUserId']);
    });

    it('should reject a request with an invalid guestUserId format (too long)', () => {
      const invalidParams = {
        params: {
          guestUserId: '65e9b3c1a7d0f2e8c1b3a5d78', // 25 chars
        },
      };
      const result = VideoValidation.guestUserSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Invalid guest user ID format');
      expect(result.error?.issues[0].path).toEqual(['params', 'guestUserId']);
    });

    it('should reject a request with an invalid guestUserId format (non-hex characters)', () => {
      const invalidParams = {
        params: {
          guestUserId: '65e9b3c1a7d0f2e8c1b3a5dX', // 'X' is not hex
        },
      };
      const result = VideoValidation.guestUserSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Invalid guest user ID format');
      expect(result.error?.issues[0].path).toEqual(['params', 'guestUserId']);
    });

    it('should reject a request without a params object', () => {
      const invalidRequest = { guestUserId: '65e9b3c1a7d0f2e8c1b3a5d7' };
      const result = VideoValidation.guestUserSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Required');
      expect(result.error?.issues[0].path).toEqual(['params']);
    });
  });
});