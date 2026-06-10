import { describe, it, expect } from 'vitest';
import { DocumentAnalysisValidation } from './document_analysis.validation';

describe('DocumentAnalysisValidation', () => {
  describe('analyzeRequestSchema', () => {
    const { analyzeRequestSchema } = DocumentAnalysisValidation;

    it('should validate a minimal valid request body', () => {
      const result = analyzeRequestSchema.safeParse({ body: {} });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ body: {} });
    });

    it('should validate a request body with all optional fields', () => {
      const validBody = {
        body: {
          message: 'This is a test message.',
          conversationId: 'conv-123',
          userId: 'user-456',
          analysisType: 'sentiment',
          outputFormat: 'structured',
        },
      };
      const result = analyzeRequestSchema.safeParse(validBody);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validBody);
    });

    it('should validate a request body with only message', () => {
      const result = analyzeRequestSchema.safeParse({ body: { message: 'Hello' } });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ body: { message: 'Hello' } });
    });

    it('should validate a request body with only conversationId', () => {
      const result = analyzeRequestSchema.safeParse({ body: { conversationId: 'abc' } });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ body: { conversationId: 'abc' } });
    });

    it('should invalidate a request body with message exceeding max length', () => {
      const longMessage = 'a'.repeat(10001);
      const result = analyzeRequestSchema.safeParse({ body: { message: longMessage } });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Message too long (max 10000 characters)');
    });

    it('should invalidate a request body with an invalid analysisType', () => {
      const result = analyzeRequestSchema.safeParse({ body: { analysisType: 'invalid_type' } });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('Invalid enum value');
    });

    it('should invalidate a request body with an invalid outputFormat', () => {
      const result = analyzeRequestSchema.safeParse({ body: { outputFormat: 'json' } });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('Invalid enum value');
    });

    it('should invalidate a request without a body object', () => {
      const result = analyzeRequestSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Required');
    });

    it('should invalidate a request with body as null', () => {
      const result = analyzeRequestSchema.safeParse({ body: null });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Expected object, received null');
    });

    it('should invalidate a request with body as a string', () => {
      const result = analyzeRequestSchema.safeParse({ body: 'not an object' });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Expected object, received string');
    });

    it('should invalidate a request with userId not a string', () => {
      const result = analyzeRequestSchema.safeParse({ body: { userId: 123 } });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Expected string, received number');
    });
  });

  describe('getConversationHistorySchema', () => {
    const { getConversationHistorySchema } = DocumentAnalysisValidation;

    it('should validate a request with a valid conversationId in params', () => {
      const validParams = {
        params: {
          conversationId: 'conv-abc-123',
        },
      };
      const result = getConversationHistorySchema.safeParse(validParams);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validParams);
    });

    it('should invalidate a request with missing conversationId in params', () => {
      const result = getConversationHistorySchema.safeParse({ params: {} });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Conversation ID is required');
    });

    it('should invalidate a request with conversationId as null', () => {
      const result = getConversationHistorySchema.safeParse({ params: { conversationId: null } });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Expected string, received null');
    });

    it('should invalidate a request with conversationId not a string', () => {
      const result = getConversationHistorySchema.safeParse({ params: { conversationId: 123 } });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Expected string, received number');
    });

    it('should invalidate a request with missing params object', () => {
      const result = getConversationHistorySchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Required');
    });

    it('should invalidate a request with params as null', () => {
      const result = getConversationHistorySchema.safeParse({ params: null });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Expected object, received null');
    });
  });
});