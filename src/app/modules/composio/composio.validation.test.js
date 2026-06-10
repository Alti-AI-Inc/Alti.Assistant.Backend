import { describe, it, expect } from 'vitest';
import { composioValidation, linkedinPostSchema } from './composio.validation.js';

describe('Composio Validation Schemas', () => {
  describe('emailToolsValidation', () => {
    const schema = composioValidation.emailToolsValidation;

    it('should validate successfully with valid data', () => {
      const validData = {
        connectedAccountId: 'acc_12345',
        to: 'user@example.com',
        subject: 'Test Subject',
        body: 'This is a test email body.',
      };

      const result = schema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should fail validation if connectedAccountId is missing or empty', () => {
      const missingId = {
        to: 'user@example.com',
        subject: 'Test Subject',
        body: 'This is a test email body.',
      };
      const emptyId = { ...missingId, connectedAccountId: '' };

      const resultMissing = schema.safeParse(missingId);
      expect(resultMissing.success).toBe(false);
      expect(resultMissing.error.issues[0].message).toContain('connectedAccountId is required');

      const resultEmpty = schema.safeParse(emptyId);
      expect(resultEmpty.success).toBe(false);
      expect(resultEmpty.error.issues[0].message).toContain('connectedAccountId is required');
    });

    it('should fail validation if email format is invalid', () => {
      const invalidEmail = {
        connectedAccountId: 'acc_12345',
        to: 'not-an-email',
        subject: 'Test Subject',
        body: 'This is a test email body.',
      };

      const result = schema.safeParse(invalidEmail);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid email format');
    });

    it('should fail validation if subject is missing or empty', () => {
      const missingSubject = {
        connectedAccountId: 'acc_12345',
        to: 'user@example.com',
        body: 'This is a test email body.',
      };
      const emptySubject = { ...missingSubject, subject: '' };

      const resultMissing = schema.safeParse(missingSubject);
      expect(resultMissing.success).toBe(false);
      expect(resultMissing.error.issues[0].message).toContain('Subject is required');

      const resultEmpty = schema.safeParse(emptySubject);
      expect(resultEmpty.success).toBe(false);
      expect(resultEmpty.error.issues[0].message).toContain('Subject is required');
    });

    it('should fail validation if body is missing or empty', () => {
      const missingBody = {
        connectedAccountId: 'acc_12345',
        to: 'user@example.com',
        subject: 'Test Subject',
      };
      const emptyBody = { ...missingBody, body: '' };

      const resultMissing = schema.safeParse(missingBody);
      expect(resultMissing.success).toBe(false);
      expect(resultMissing.error.issues[0].message).toContain('Body is required');

      const resultEmpty = schema.safeParse(emptyBody);
      expect(resultEmpty.success).toBe(false);
      expect(resultEmpty.error.issues[0].message).toContain('Body is required');
    });
  });

  describe('linkedinPostSchema', () => {
    it('should validate successfully with valid data', () => {
      const validData = {
        connectedAccountId: 'acc_12345',
        content: 'Hello, this is a LinkedIn post!',
      };

      const resultDirect = linkedinPostSchema.safeParse(validData);
      expect(resultDirect.success).toBe(true);
      expect(resultDirect.data).toEqual(validData);

      const resultNamespace = composioValidation.linkedinPostSchema.safeParse(validData);
      expect(resultNamespace.success).toBe(true);
    });

    it('should fail validation if connectedAccountId is missing or empty', () => {
      const missingId = {
        content: 'Hello, this is a LinkedIn post!',
      };
      const emptyId = { ...missingId, connectedAccountId: '' };

      const resultMissing = linkedinPostSchema.safeParse(missingId);
      expect(resultMissing.success).toBe(false);
      expect(resultMissing.error.issues[0].message).toContain('connectedAccountId is required');

      const resultEmpty = linkedinPostSchema.safeParse(emptyId);
      expect(resultEmpty.success).toBe(false);
      expect(resultEmpty.error.issues[0].message).toContain('connectedAccountId is required');
    });

    it('should fail validation if content is missing or empty', () => {
      const missingContent = {
        connectedAccountId: 'acc_12345',
      };
      const emptyContent = { ...missingContent, content: '' };

      const resultMissing = linkedinPostSchema.safeParse(missingContent);
      expect(resultMissing.success).toBe(false);
      expect(resultMissing.error.issues[0].message).toContain('Content is required');

      const resultEmpty = linkedinPostSchema.safeParse(emptyContent);
      expect(resultEmpty.success).toBe(false);
      expect(resultEmpty.error.issues[0].message).toContain('Content is required');
    });
  });
});