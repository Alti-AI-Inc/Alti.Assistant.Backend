import { describe, it, expect } from 'vitest';
import { SummaryValidation } from './summary.validation.js';

const { summaryQuerySchema, guestRateLimitSchema } = SummaryValidation;

describe('SummaryValidation', () => {
  describe('summaryQuerySchema', () => {
    it('should successfully validate a request with only the required message field', () => {
      const validInput = { message: 'This is the content to summarize.' };
      const result = summaryQuerySchema.safeParse(validInput);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validInput);
    });

    it('should successfully validate a request with all optional fields present', () => {
      const validInput = {
        message: 'http://example.com/document.pdf',
        conversationId: 'conv-123-abc-456',
        fileType: 'pdf',
      };
      const result = summaryQuerySchema.safeParse(validInput);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validInput);
    });

    it('should successfully validate all possible fileType enum values', () => {
      const fileTypes = ['pdf', 'docx', 'txt', 'csv', 'url'];
      fileTypes.forEach(type => {
        const validInput = { message: 'some content', fileType: type };
        const result = summaryQuerySchema.safeParse(validInput);
        expect(result.success, `fileType "${type}" should be valid`).toBe(true);
      });
    });

    it('should fail validation if the message field is missing', () => {
      const invalidInput = { conversationId: 'conv-123' };
      const result = summaryQuerySchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['message']);
        expect(result.error.issues[0].message).toBe('Summary content or URL is required');
      }
    });

    it('should fail validation if the message field is an empty string', () => {
      const invalidInput = { message: '' };
      const result = summaryQuerySchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['message']);
        expect(result.error.issues[0].message).toBe('Summary content cannot be empty');
      }
    });

    it('should fail validation if the message field is not a string', () => {
      const invalidInput = { message: 12345 };
      const result = summaryQuerySchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['message']);
        expect(result.error.issues[0].message).toBe('Expected string, received number');
      }
    });

    it('should fail validation if conversationId is not a string', () => {
      const invalidInput = { message: 'valid message', conversationId: { id: '123' } };
      const result = summaryQuerySchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['conversationId']);
        expect(result.error.issues[0].message).toBe('Expected string, received object');
      }
    });

    it('should fail validation if fileType is not one of the allowed enum values', () => {
      const invalidInput = { message: 'valid message', fileType: 'png' };
      const result = summaryQuerySchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['fileType']);
        expect(result.error.issues[0].message).toContain("Invalid enum value. Expected 'pdf' | 'docx' | 'txt' | 'csv' | 'url'");
      }
    });
  });

  describe('guestRateLimitSchema', () => {
    it('should successfully validate an empty headers object', () => {
      const validInput = {};
      const result = guestRateLimitSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should successfully validate headers with only x-guest-id', () => {
      const validInput = { 'x-guest-id': 'guest-xyz-789' };
      const result = guestRateLimitSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validInput);
    });

    it('should successfully validate headers with only x-forwarded-for', () => {
      const validInput = { 'x-forwarded-for': '192.168.1.1' };
      const result = guestRateLimitSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validInput);
    });

    it('should successfully validate headers with both optional fields', () => {
      const validInput = {
        'x-guest-id': 'guest-abc-123',
        'x-forwarded-for': '10.0.0.1, 172.16.0.1',
      };
      const result = guestRateLimitSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validInput);
    });

    it('should fail validation if x-guest-id is not a string', () => {
      const invalidInput = { 'x-guest-id': 12345 };
      const result = guestRateLimitSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['x-guest-id']);
        expect(result.error.issues[0].message).toBe('Expected string, received number');
      }
    });

    it('should fail validation if x-forwarded-for is not a string', () => {
      const invalidInput = { 'x-forwarded-for': true };
      const result = guestRateLimitSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['x-forwarded-for']);
        expect(result.error.issues[0].message).toBe('Expected string, received boolean');
      }
    });
  });
});