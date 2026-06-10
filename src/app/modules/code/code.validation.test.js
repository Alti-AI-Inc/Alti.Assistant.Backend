import { describe, it, expect } from 'vitest';
import { CodeValidation } from './code.validation.js';

const VALID_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const INVALID_UUID = 'not-a-uuid';

describe('CodeValidation', () => {
  describe('uuidParamsSchema', () => {
    it('should create a schema with a default param name "id"', () => {
      const schema = CodeValidation.uuidParamsSchema();
      const result = schema.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('should create a schema with a custom param name', () => {
      const schema = CodeValidation.uuidParamsSchema('workspaceId');
      const result = schema.safeParse({ workspaceId: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('should fail if the default param "id" is not a valid UUID', () => {
      const schema = CodeValidation.uuidParamsSchema();
      const result = schema.safeParse({ id: INVALID_UUID });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid id format');
    });

    it('should fail if the custom param is not a valid UUID', () => {
      const schema = CodeValidation.uuidParamsSchema('customId');
      const result = schema.safeParse({ customId: INVALID_UUID });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid customId format');
    });

    it('should fail if the param is missing', () => {
      const schema = CodeValidation.uuidParamsSchema('requiredId');
      const result = schema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues[0].code).toBe('invalid_type');
    });

    it('should fail if the wrong param name is provided', () => {
      const schema = CodeValidation.uuidParamsSchema('workspaceId');
      const result = schema.safeParse({ id: VALID_UUID });
      expect(result.success).toBe(false);
    });
  });

  describe('codeQuerySchema', () => {
    it('should pass with a valid message and no conversationId', () => {
      const result = CodeValidation.codeQuerySchema.safeParse({
        message: 'Generate a function to sum two numbers.',
      });
      expect(result.success).toBe(true);
    });

    it('should pass with a valid message and a valid conversationId', () => {
      const result = CodeValidation.codeQuerySchema.safeParse({
        message: 'Now add error handling.',
        conversationId: VALID_UUID,
      });
      expect(result.success).toBe(true);
    });

    it('should fail if message is missing', () => {
      const result = CodeValidation.codeQuerySchema.safeParse({
        conversationId: VALID_UUID,
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Code query is required');
    });

    it('should fail if message is not a string', () => {
      const result = CodeValidation.codeQuerySchema.safeParse({
        message: 12345,
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].code).toBe('invalid_type');
    });

    it('should fail if message is empty', () => {
      const result = CodeValidation.codeQuerySchema.safeParse({
        message: '',
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Code query cannot be empty');
    });

    it('should fail if message is too long', () => {
      const longMessage = 'a'.repeat(5001);
      const result = CodeValidation.codeQuerySchema.safeParse({
        message: longMessage,
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Code query too long');
    });

    it('should fail if conversationId is present but not a valid UUID', () => {
      const result = CodeValidation.codeQuerySchema.safeParse({
        message: 'Some message',
        conversationId: INVALID_UUID,
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid conversation ID format');
    });

    it('should pass if conversationId is null or undefined', () => {
      const result1 = CodeValidation.codeQuerySchema.safeParse({
        message: 'Some message',
        conversationId: undefined,
      });
      expect(result1.success).toBe(true);

      const result2 = CodeValidation.codeQuerySchema.safeParse({
        message: 'Some message',
        conversationId: null,
      });
      // Zod's .optional() makes it accept undefined, but not null unless .nullable() is also used.
      expect(result2.success).toBe(false);
      expect(result2.error.issues[0].code).toBe('invalid_type');
    });
  });

  describe('guestRateLimitSchema', () => {
    it('should pass with an empty object as all fields are optional', () => {
      const result = CodeValidation.guestRateLimitSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should pass with a valid x-guest-id', () => {
      const result = CodeValidation.guestRateLimitSchema.safeParse({
        'x-guest-id': VALID_UUID,
      });
      expect(result.success).toBe(true);
    });

    it('should pass with a valid x-forwarded-for', () => {
      const result = CodeValidation.guestRateLimitSchema.safeParse({
        'x-forwarded-for': '192.168.1.1',
      });
      expect(result.success).toBe(true);
    });

    it('should pass with both valid headers', () => {
      const result = CodeValidation.guestRateLimitSchema.safeParse({
        'x-guest-id': VALID_UUID,
        'x-forwarded-for': '192.168.1.1, 10.0.0.1',
      });
      expect(result.success).toBe(true);
    });

    it('should fail if x-guest-id is not a valid UUID', () => {
      const result = CodeValidation.guestRateLimitSchema.safeParse({
        'x-guest-id': INVALID_UUID,
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid guest ID format');
    });

    it('should ignore extra properties', () => {
      const result = CodeValidation.guestRateLimitSchema.safeParse({
        'x-guest-id': VALID_UUID,
        'some-other-header': 'value',
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ 'x-guest-id': VALID_UUID });
    });
  });
});