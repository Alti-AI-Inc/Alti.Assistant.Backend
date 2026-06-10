import { describe, it, expect } from 'vitest';
import { TranslationValidation } from './translation.validation';

const {
  conversationalRequestSchema,
  translateTextSchema,
  detectLanguageSchema,
} = TranslationValidation;

describe('TranslationValidation Schemas', () => {
  describe('conversationalRequestSchema', () => {
    // Valid cases
    it('should pass with a valid message', () => {
      const input = { body: { message: 'Hello, how are you?' } };
      const result = conversationalRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should pass with a message and conversationId', () => {
      const input = {
        body: {
          message: 'Continuing the conversation.',
          conversationId: 'conv_12345',
        },
      };
      const result = conversationalRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should pass with a message and userId', () => {
      const input = {
        body: { message: 'A message from a guest.', userId: 'user_abcde' },
      };
      const result = conversationalRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should pass with all optional fields', () => {
      const input = {
        body: {
          message: 'Full context message.',
          conversationId: 'conv_12345',
          userId: 'user_abcde',
        },
      };
      const result = conversationalRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    // Invalid cases
    it('should fail if message is missing', () => {
      const input = { body: {} };
      const result = conversationalRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Message is required');
    });

    it('should fail if message is an empty string', () => {
      const input = { body: { message: '' } };
      const result = conversationalRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Message cannot be empty');
    });

    it('should fail if message is too long', () => {
      const longMessage = 'a'.repeat(50001);
      const input = { body: { message: longMessage } };
      const result = conversationalRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Message too long');
    });

    it('should fail if message is not a string', () => {
      const input = { body: { message: 12345 } };
      const result = conversationalRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected string, received number');
    });

    it('should fail if conversationId is not a string', () => {
      const input = { body: { message: 'test', conversationId: 123 } };
      const result = conversationalRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected string, received number');
    });

    it('should fail if userId is not a string', () => {
      const input = { body: { message: 'test', userId: true } };
      const result = conversationalRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected string, received boolean');
    });
  });

  describe('translateTextSchema', () => {
    // Valid cases
    it('should pass with required fields (text, targetLanguage)', () => {
      const input = { body: { text: 'Hello world', targetLanguage: 'es' } };
      const result = translateTextSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should pass with all fields', () => {
      const input = {
        body: {
          text: 'Hello world',
          targetLanguage: 'es',
          sourceLanguage: 'en',
          preserveFormatting: true,
        },
      };
      const result = translateTextSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    // Invalid cases
    it('should fail if text is missing', () => {
      const input = { body: { targetLanguage: 'es' } };
      const result = translateTextSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Text is required');
    });

    it('should fail if targetLanguage is missing', () => {
      const input = { body: { text: 'Hello world' } };
      const result = translateTextSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Target language is required');
    });

    it('should fail if text is an empty string', () => {
      const input = { body: { text: '', targetLanguage: 'es' } };
      const result = translateTextSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Text cannot be empty');
    });

    it('should fail if text is too long', () => {
      const longText = 'a'.repeat(100001);
      const input = { body: { text: longText, targetLanguage: 'es' } };
      const result = translateTextSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Text exceeds 100,000 character limit');
    });

    it('should fail if sourceLanguage is not a string', () => {
      const input = {
        body: {
          text: 'Hello',
          targetLanguage: 'es',
          sourceLanguage: 123,
        },
      };
      const result = translateTextSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected string, received number');
    });

    it('should fail if preserveFormatting is not a boolean', () => {
      const input = {
        body: {
          text: 'Hello',
          targetLanguage: 'es',
          preserveFormatting: 'yes',
        },
      };
      const result = translateTextSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected boolean, received string');
    });
  });

  describe('detectLanguageSchema', () => {
    // Valid cases
    it('should pass with valid text', () => {
      const input = { body: { text: 'Bonjour le monde' } };
      const result = detectLanguageSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    // Invalid cases
    it('should fail if text is missing', () => {
      const input = { body: {} };
      const result = detectLanguageSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Text is required');
    });

    it('should fail if text is an empty string', () => {
      const input = { body: { text: '' } };
      const result = detectLanguageSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Text cannot be empty');
    });

    it('should fail if text is too long', () => {
      const longText = 'a'.repeat(10001);
      const input = { body: { text: longText } };
      const result = detectLanguageSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Text too long for language detection');
    });

    it('should fail if text is not a string', () => {
      const input = { body: { text: 12345 } };
      const result = detectLanguageSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected string, received number');
    });
  });
});