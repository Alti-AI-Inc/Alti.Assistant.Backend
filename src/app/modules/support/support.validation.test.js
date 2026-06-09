import { describe, it, expect } from 'vitest';
import { supportValidationSchema } from './support.validation';

describe('supportValidationSchema', () => {
  describe('body validation', () => {
    it('should validate a valid body with all required fields', () => {
      const validBody = {
        subject: 'Issue with login',
        message: 'I cannot log in to my account.',
      };
      const result = supportValidationSchema.shape.body.safeParse(validBody);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validBody);
    });

    it('should validate a valid body with optional fields', () => {
      const validBody = {
        subject: 'Issue with login',
        message: 'I cannot log in to my account.',
        status: 'open',
        isRead: false,
      };
      const result = supportValidationSchema.shape.body.safeParse(validBody);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validBody);
    });

    it('should fail validation if subject is missing', () => {
      const invalidBody = {
        message: 'I cannot log in to my account.',
      };
      const result = supportValidationSchema.shape.body.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Subject is required');
      expect(result.error.issues[0].path).toEqual(['subject']);
    });

    it('should fail validation if message is missing', () => {
      const invalidBody = {
        subject: 'Issue with login',
      };
      const result = supportValidationSchema.shape.body.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Message is required');
      expect(result.error.issues[0].path).toEqual(['message']);
    });

    it('should fail validation if status is an invalid enum value', () => {
      const invalidBody = {
        subject: 'Issue with login',
        message: 'I cannot log in to my account.',
        status: 'invalid_status',
      };
      const result = supportValidationSchema.shape.body.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
      expect(result.error.issues[0].path).toEqual(['status']);
    });

    it('should fail validation if isRead is not a boolean', () => {
      const invalidBody = {
        subject: 'Issue with login',
        message: 'I cannot log in to my account.',
        isRead: 'true', // Should be boolean
      };
      const result = supportValidationSchema.shape.body.safeParse(invalidBody);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Expected boolean');
      expect(result.error.issues[0].path).toEqual(['isRead']);
    });
  });

  describe('params validation', () => {
    it('should validate a valid params object with an ID', () => {
      const validParams = { id: 'some-uuid-123' };
      const result = supportValidationSchema.shape.params.safeParse(validParams);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validParams);
    });

    it('should fail validation if id is missing from params', () => {
      const invalidParams = {};
      const result = supportValidationSchema.shape.params.safeParse(invalidParams);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Required');
      expect(result.error.issues[0].path).toEqual(['id']);
    });

    it('should fail validation if id is not a string', () => {
      const invalidParams = { id: 123 };
      const result = supportValidationSchema.shape.params.safeParse(invalidParams);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected string, received number');
      expect(result.error.issues[0].path).toEqual(['id']);
    });
  });

  describe('full schema validation (body and params)', () => {
    it('should validate a complete valid request object', () => {
      const validRequest = {
        body: {
          subject: 'Full test subject',
          message: 'Full test message',
          status: 'pending',
          isRead: true,
        },
        params: {
          id: 'ticket-id-456',
        },
      };
      const result = supportValidationSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validRequest);
    });

    it('should fail if body is invalid even if params is valid', () => {
      const invalidRequest = {
        body: {
          message: 'Missing subject', // Subject is missing
        },
        params: {
          id: 'ticket-id-456',
        },
      };
      const result = supportValidationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Subject is required');
      expect(result.error.issues[0].path).toEqual(['body', 'subject']);
    });

    it('should fail if params is invalid even if body is valid', () => {
      const invalidRequest = {
        body: {
          subject: 'Valid subject',
          message: 'Valid message',
        },
        params: {
          // id is missing
        },
      };
      const result = supportValidationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Required');
      expect(result.error.issues[0].path).toEqual(['params', 'id']);
    });
  });
});