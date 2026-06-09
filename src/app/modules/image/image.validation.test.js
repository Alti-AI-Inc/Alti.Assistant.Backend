import { describe, it, expect } from 'vitest';
import { ImageValidation } from './image.validation';
import { ZodError } from 'zod';

describe('ImageValidation Schemas', () => {
  describe('imageGenerationSchema', () => {
    it('should validate a correct image generation request', () => {
      const validData = {
        body: {
          message: 'A beautiful sunset over the mountains',
          conversationId: 'conv123',
          imageSize: 'standard',
          imageStyle: 'photorealistic',
          imageModel: 'dall-e-3',
        },
      };
      const result = ImageValidation.imageGenerationSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate a correct image generation request with only required fields', () => {
      const validData = {
        body: {
          message: 'A simple prompt',
        },
      };
      const result = ImageValidation.imageGenerationSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should fail if message is missing', () => {
      const invalidData = {
        body: {
          conversationId: 'conv123',
        },
      };
      const result = ImageValidation.imageGenerationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Image prompt is required');
    });

    it('should fail if message is too short', () => {
      const invalidData = {
        body: {
          message: 'ab',
        },
      };
      const result = ImageValidation.imageGenerationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Image prompt must be at least 3 characters');
    });

    it('should fail if message is too long', () => {
      const invalidData = {
        body: {
          message: 'a'.repeat(2001),
        },
      };
      const result = ImageValidation.imageGenerationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Image prompt too long');
    });

    it('should fail if imageSize is invalid', () => {
      const invalidData = {
        body: {
          message: 'test',
          imageSize: 'extra-large',
        },
      };
      const result = ImageValidation.imageGenerationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail if imageStyle is invalid', () => {
      const invalidData = {
        body: {
          message: 'test',
          imageStyle: 'impressionist',
        },
      };
      const result = ImageValidation.imageGenerationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail if body is missing', () => {
      const invalidData = {};
      const result = ImageValidation.imageGenerationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Required');
    });
  });

  describe('imageAnalysisSchema', () => {
    it('should validate a correct image analysis request', () => {
      const validData = {
        body: {
          imageData: 'base64encodedstring',
          message: 'What is in this image?',
          conversationId: 'conv456',
          analysisType: 'describe',
        },
      };
      const result = ImageValidation.imageAnalysisSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate a correct image analysis request with only required fields', () => {
      const validData = {
        body: {
          imageData: 'base64encodedstring',
        },
      };
      const result = ImageValidation.imageAnalysisSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should fail if imageData is missing', () => {
      const invalidData = {
        body: {
          message: 'test',
        },
      };
      const result = ImageValidation.imageAnalysisSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Image data is required for analysis');
    });

    it('should fail if imageData is empty', () => {
      const invalidData = {
        body: {
          imageData: '',
        },
      };
      const result = ImageValidation.imageAnalysisSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Image data cannot be empty');
    });

    it('should fail if message is too long', () => {
      const invalidData = {
        body: {
          imageData: 'data',
          message: 'a'.repeat(1001),
        },
      };
      const result = ImageValidation.imageAnalysisSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('String must contain at most 1000 character(s)');
    });

    it('should fail if analysisType is invalid', () => {
      const invalidData = {
        body: {
          imageData: 'data',
          analysisType: 'invalid_type',
        },
      };
      const result = ImageValidation.imageAnalysisSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    });
  });

  describe('imagePreferencesSchema', () => {
    it('should validate correct image preferences', () => {
      const validData = {
        body: {
          size: 'large',
          style: 'cartoon',
          aspectRatio: '16:9',
          quality: 'high',
        },
      };
      const result = ImageValidation.imagePreferencesSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate empty image preferences (all optional)', () => {
      const validData = {
        body: {},
      };
      const result = ImageValidation.imagePreferencesSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should fail if size is invalid', () => {
      const invalidData = {
        body: {
          size: 'huge',
        },
      };
      const result = ImageValidation.imagePreferencesSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail if style is invalid', () => {
      const invalidData = {
        body: {
          style: 'cubist',
        },
      };
      const result = ImageValidation.imagePreferencesSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail if aspectRatio is invalid', () => {
      const invalidData = {
        body: {
          aspectRatio: '2:1',
        },
      };
      const result = ImageValidation.imagePreferencesSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail if quality is invalid', () => {
      const invalidData = {
        body: {
          quality: 'super-high',
        },
      };
      const result = ImageValidation.imagePreferencesSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    });
  });

  describe('guestRateLimitSchema', () => {
    it('should validate correct guest rate limit headers', () => {
      const validData = {
        headers: {
          'x-guest-id': 'guest123',
          'x-forwarded-for': '192.168.1.1',
        },
      };
      const result = ImageValidation.guestRateLimitSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate with only x-guest-id', () => {
      const validData = {
        headers: {
          'x-guest-id': 'guest123',
        },
      };
      const result = ImageValidation.guestRateLimitSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate with only x-forwarded-for', () => {
      const validData = {
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      };
      const result = ImageValidation.guestRateLimitSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate with empty headers object', () => {
      const validData = {
        headers: {},
      };
      const result = ImageValidation.guestRateLimitSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate with no headers object (optional)', () => {
      const validData = {};
      const result = ImageValidation.guestRateLimitSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should fail if x-guest-id is not a string', () => {
      const invalidData = {
        headers: {
          'x-guest-id': 123,
        },
      };
      const result = ImageValidation.guestRateLimitSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Expected string, received number');
    });
  });

  describe('imageFileSchema', () => {
    it('should validate a correct image file', () => {
      const validData = {
        file: {
          mimetype: 'image/png',
          size: 5 * 1024 * 1024, // 5MB
        },
      };
      const result = ImageValidation.imageFileSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate with no file (optional)', () => {
      const validData = {};
      const result = ImageValidation.imageFileSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should fail if mimetype is invalid', () => {
      const invalidData = {
        file: {
          mimetype: 'application/pdf',
          size: 1000,
        },
      };
      const result = ImageValidation.imageFileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Invalid image format. Only PNG, JPEG, GIF, BMP, and WebP are allowed.');
    });

    it('should fail if size is too large', () => {
      const invalidData = {
        file: {
          mimetype: 'image/jpeg',
          size: 10 * 1024 * 1024 + 1, // 10MB + 1 byte
        },
      };
      const result = ImageValidation.imageFileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Image file too large. Maximum size is 10MB.');
    });

    it('should fail if mimetype is missing', () => {
      const invalidData = {
        file: {
          size: 1000,
        },
      };
      const result = ImageValidation.imageFileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Required');
    });

    it('should fail if size is missing', () => {
      const invalidData = {
        file: {
          mimetype: 'image/png',
        },
      };
      const result = ImageValidation.imageFileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Required');
    });
  });

  describe('conversationSchema', () => {
    it('should validate a correct conversation ID', () => {
      const validData = {
        params: {
          conversationId: '60c72b2f9b1d8e001c8e4a7b',
        },
      };
      const result = ImageValidation.conversationSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should fail if conversationId is missing', () => {
      const invalidData = {
        params: {},
      };
      const result = ImageValidation.conversationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Conversation ID is required');
    });

    it('should fail if conversationId is not a string', () => {
      const invalidData = {
        params: {
          conversationId: 12345,
        },
      };
      const result = ImageValidation.conversationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Expected string, received number');
    });
  });

  describe('guestUserSchema', () => {
    it('should validate a correct guest user ID', () => {
      const validData = {
        params: {
          guestUserId: '60c72b2f9b1d8e001c8e4a7b',
        },
      };
      const result = ImageValidation.guestUserSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should fail if guestUserId is missing', () => {
      const invalidData = {
        params: {},
      };
      const result = ImageValidation.guestUserSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Guest user ID is required');
    });

    it('should fail if guestUserId is not a valid MongoDB ObjectId format', () => {
      const invalidData = {
        params: {
          guestUserId: 'invalid-id',
        },
      };
      const result = ImageValidation.guestUserSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Invalid guest user ID format');
    });

    it('should fail if guestUserId is too short', () => {
      const invalidData = {
        params: {
          guestUserId: '60c72b2f9b1d8e001c8e4a7', // 23 chars
        },
      };
      const result = ImageValidation.guestUserSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Invalid guest user ID format');
    });

    it('should fail if guestUserId is too long', () => {
      const invalidData = {
        params: {
          guestUserId: '60c72b2f9b1d8e001c8e4a7bC', // 25 chars
        },
      };
      const result = ImageValidation.guestUserSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(result.error.issues[0].message).toBe('Invalid guest user ID format');
    });
  });
});