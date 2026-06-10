import { describe, it, expect } from 'vitest';
import { DeepResearchValidation } from './deep_research.validation';

describe('DeepResearchValidation', () => {
  describe('deepResearchQuerySchema', () => {
    it('should validate a request with minimum required fields', () => {
      const validBody = {
        message: 'What is the capital of France?',
      };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: validBody });
      expect(result.success).toBe(true);
      expect(result.data.body).toEqual({
        message: 'What is the capital of France?',
        generatePdf: false,
        maxDepth: 3,
        depth: 'thorough',
      });
    });

    it('should validate a request with all optional fields', () => {
      const validBody = {
        message: 'Research renewable energy sources.',
        generatePdf: true,
        conversationId: 'conv-123',
        maxDepth: 5,
        userId: 'user-abc',
        depth: 'fast',
        boardPersonas: ['CEO', 'CTO'],
        consensusLevel: 'unanimous',
      };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: validBody });
      expect(result.success).toBe(true);
      expect(result.data.body).toEqual(validBody);
    });

    it('should apply default values for optional fields when not provided', () => {
      const validBody = {
        message: 'Simple query.',
      };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: validBody });
      expect(result.success).toBe(true);
      expect(result.data.body.generatePdf).toBe(false);
      expect(result.data.body.maxDepth).toBe(3);
      expect(result.data.body.depth).toBe('thorough');
    });

    it('should trim the message field', () => {
      const validBody = {
        message: '  Trim this message  ',
      };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: validBody });
      expect(result.success).toBe(true);
      expect(result.data.body.message).toBe('Trim this message');
    });

    it('should fail validation if message is missing', () => {
      const invalidBody = {};
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: invalidBody });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Message is required');
      expect(result.error.issues[0].path).toEqual(['body', 'message']);
    });

    it('should fail validation if message is an empty string', () => {
      const invalidBody = { message: '' };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: invalidBody });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Message cannot be empty');
      expect(result.error.issues[0].path).toEqual(['body', 'message']);
    });

    it('should fail validation if message is too long', () => {
      const invalidBody = { message: 'a'.repeat(1001) };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: invalidBody });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Message must be less than 1000 characters');
      expect(result.error.issues[0].path).toEqual(['body', 'message']);
    });

    it('should fail validation if generatePdf is not a boolean', () => {
      const invalidBody = { message: 'test', generatePdf: 'true' };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: invalidBody });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected boolean, received string');
      expect(result.error.issues[0].path).toEqual(['body', 'generatePdf']);
    });

    it('should fail validation if conversationId is not a string', () => {
      const invalidBody = { message: 'test', conversationId: 123 };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: invalidBody });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected string, received number');
      expect(result.error.issues[0].path).toEqual(['body', 'conversationId']);
    });

    it('should fail validation if maxDepth is not an integer', () => {
      const invalidBody = { message: 'test', maxDepth: 3.5 };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: invalidBody });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected integer, received float');
      expect(result.error.issues[0].path).toEqual(['body', 'maxDepth']);
    });

    it('should fail validation if maxDepth is less than 1', () => {
      const invalidBody = { message: 'test', maxDepth: 0 };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: invalidBody });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Number must be greater than or equal to 1');
      expect(result.error.issues[0].path).toEqual(['body', 'maxDepth']);
    });

    it('should fail validation if maxDepth is greater than 5', () => {
      const invalidBody = { message: 'test', maxDepth: 6 };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: invalidBody });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Number must be less than or equal to 5');
      expect(result.error.issues[0].path).toEqual(['body', 'maxDepth']);
    });

    it('should fail validation if depth is not a valid enum value', () => {
      const invalidBody = { message: 'test', depth: 'medium' };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: invalidBody });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("Invalid enum value. Expected 'fast' | 'thorough', received 'medium'");
      expect(result.error.issues[0].path).toEqual(['body', 'depth']);
    });

    it('should fail validation if boardPersonas is not an array of strings', () => {
      const invalidBody = { message: 'test', boardPersonas: ['CEO', 123] };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: invalidBody });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected string, received number');
      expect(result.error.issues[0].path).toEqual(['body', 'boardPersonas', 1]);
    });

    it('should fail validation if consensusLevel is not a valid enum value', () => {
      const invalidBody = { message: 'test', consensusLevel: 'partial' };
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({ body: invalidBody });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("Invalid enum value. Expected 'majority' | 'unanimous', received 'partial'");
      expect(result.error.issues[0].path).toEqual(['body', 'consensusLevel']);
    });

    it('should fail validation if body is missing', () => {
      const result = DeepResearchValidation.deepResearchQuerySchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Required');
      expect(result.error.issues[0].path).toEqual(['body']);
    });
  });

  describe('getStatsSchema', () => {
    it('should validate a request with no query parameters (uses default timeRange)', () => {
      const result = DeepResearchValidation.getStatsSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.query).toEqual({ timeRange: '30d' });
    });

    it('should validate a request with a valid timeRange', () => {
      const validQuery = { timeRange: '7d' };
      const result = DeepResearchValidation.getStatsSchema.safeParse({ query: validQuery });
      expect(result.success).toBe(true);
      expect(result.data.query).toEqual(validQuery);
    });

    it('should validate with other valid timeRange values', () => {
      const validQuery1 = { timeRange: '90d' };
      const result1 = DeepResearchValidation.getStatsSchema.safeParse({ query: validQuery1 });
      expect(result1.success).toBe(true);
      expect(result1.data.query).toEqual(validQuery1);

      const validQuery2 = { timeRange: 'all' };
      const result2 = DeepResearchValidation.getStatsSchema.safeParse({ query: validQuery2 });
      expect(result2.success).toBe(true);
      expect(result2.data.query).toEqual(validQuery2);
    });

    it('should fail validation if timeRange is an invalid enum value', () => {
      const invalidQuery = { timeRange: '1year' };
      const result = DeepResearchValidation.getStatsSchema.safeParse({ query: invalidQuery });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe("Invalid enum value. Expected '7d' | '30d' | '90d' | 'all', received '1year'");
      expect(result.error.issues[0].path).toEqual(['query', 'timeRange']);
    });

    it('should fail validation if query is not an object', () => {
      const result = DeepResearchValidation.getStatsSchema.safeParse({ query: 'invalid' });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected object, received string');
      expect(result.error.issues[0].path).toEqual(['query']);
    });
  });

  describe('downloadPDFSchema', () => {
    it('should validate a request with a valid savedId', () => {
      const validParams = { savedId: 'report-xyz-123' };
      const result = DeepResearchValidation.downloadPDFSchema.safeParse({ params: validParams });
      expect(result.success).toBe(true);
      expect(result.data.params).toEqual(validParams);
    });

    it('should fail validation if savedId is missing', () => {
      const invalidParams = {};
      const result = DeepResearchValidation.downloadPDFSchema.safeParse({ params: invalidParams });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Saved ID is required');
      expect(result.error.issues[0].path).toEqual(['params', 'savedId']);
    });

    it('should fail validation if savedId is not a string', () => {
      const invalidParams = { savedId: 12345 };
      const result = DeepResearchValidation.downloadPDFSchema.safeParse({ params: invalidParams });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected string, received number');
      expect(result.error.issues[0].path).toEqual(['params', 'savedId']);
    });

    it('should fail validation if params is missing', () => {
      const result = DeepResearchValidation.downloadPDFSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Required');
      expect(result.error.issues[0].path).toEqual(['params']);
    });
  });
});