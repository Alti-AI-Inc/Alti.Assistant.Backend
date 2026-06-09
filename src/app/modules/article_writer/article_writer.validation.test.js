import { describe, it, expect } from 'vitest';
import { ArticleWriterValidation } from './article_writer.validation';

describe('ArticleWriterValidation', () => {
  describe('conversationalRequestSchema', () => {
    const schema = ArticleWriterValidation.conversationalRequestSchema;

    it('should validate a minimal valid conversational request', () => {
      const result = schema.safeParse({ body: { message: 'Hello AI' } });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ body: { message: 'Hello AI' } });
    });

    it('should validate a conversational request with all optional fields', () => {
      const result = schema.safeParse({
        body: {
          message: 'Write an article about AI.',
          conversationId: 'conv-123',
          userId: 'user-456',
          articleType: 'blog_post',
          tone: 'professional',
          length: 'medium',
        },
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        body: {
          message: 'Write an article about AI.',
          conversationId: 'conv-123',
          userId: 'user-456',
          articleType: 'blog_post',
          tone: 'professional',
          length: 'medium',
        },
      });
    });

    it('should reject a conversational request with missing message', () => {
      const result = schema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Message is required');
      expect(result.error?.issues[0].path).toEqual(['body', 'message']);
    });

    it('should reject a conversational request with an empty message', () => {
      const result = schema.safeParse({ body: { message: '' } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Message cannot be empty');
      expect(result.error?.issues[0].path).toEqual(['body', 'message']);
    });

    it('should reject a conversational request with a message that is too long', () => {
      const longMessage = 'a'.repeat(10001);
      const result = schema.safeParse({ body: { message: longMessage } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Message too long');
      expect(result.error?.issues[0].path).toEqual(['body', 'message']);
    });

    it('should reject a conversational request with an invalid articleType', () => {
      const result = schema.safeParse({
        body: { message: 'Test', articleType: 'invalid_type' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
      expect(result.error?.issues[0].path).toEqual(['body', 'articleType']);
    });

    it('should reject a conversational request with an invalid tone', () => {
      const result = schema.safeParse({
        body: { message: 'Test', tone: 'sarcastic' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
      expect(result.error?.issues[0].path).toEqual(['body', 'tone']);
    });

    it('should reject a conversational request with an invalid length', () => {
      const result = schema.safeParse({
        body: { message: 'Test', length: 'extra_long' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
      expect(result.error?.issues[0].path).toEqual(['body', 'length']);
    });

    it('should reject a conversational request if body is not an object', () => {
      const result = schema.safeParse({ body: 'not an object' });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected object, received string');
      expect(result.error?.issues[0].path).toEqual(['body']);
    });

    it('should reject a conversational request if message is not a string', () => {
      const result = schema.safeParse({ body: { message: 123 } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
      expect(result.error?.issues[0].path).toEqual(['body', 'message']);
    });
  });

  describe('writeArticleSchema', () => {
    const schema = ArticleWriterValidation.writeArticleSchema;

    it('should validate an empty write article request (all fields optional)', () => {
      const result = schema.safeParse({ body: {} });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ body: {} });
    });

    it('should validate a write article request with topic and content', () => {
      const result = schema.safeParse({
        body: { topic: 'AI Ethics', content: 'The ethical implications of AI.' },
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        body: { topic: 'AI Ethics', content: 'The ethical implications of AI.' },
      });
    });

    it('should validate a write article request with all optional fields', () => {
      const result = schema.safeParse({
        body: {
          topic: 'Quantum Computing',
          content: 'An introduction to quantum computing.',
          articleType: 'technical_article',
          tone: 'academic',
          length: 'comprehensive',
          userId: 'guest-789',
        },
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        body: {
          topic: 'Quantum Computing',
          content: 'An introduction to quantum computing.',
          articleType: 'technical_article',
          tone: 'academic',
          length: 'comprehensive',
          userId: 'guest-789',
        },
      });
    });

    it('should reject a write article request with an invalid articleType', () => {
      const result = schema.safeParse({
        body: { articleType: 'unsupported_type' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
      expect(result.error?.issues[0].path).toEqual(['body', 'articleType']);
    });

    it('should reject a write article request with an invalid tone', () => {
      const result = schema.safeParse({ body: { tone: 'humorous' } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
      expect(result.error?.issues[0].path).toEqual(['body', 'tone']);
    });

    it('should reject a write article request with an invalid length', () => {
      const result = schema.safeParse({ body: { length: 'super_long' } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
      expect(result.error?.issues[0].path).toEqual(['body', 'length']);
    });

    it('should reject a write article request if topic is not a string', () => {
      const result = schema.safeParse({ body: { topic: 123 } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
      expect(result.error?.issues[0].path).toEqual(['body', 'topic']);
    });
  });

  describe('getConversationHistorySchema', () => {
    const schema = ArticleWriterValidation.getConversationHistorySchema;

    it('should validate a valid get conversation history request', () => {
      const result = schema.safeParse({ params: { conversationId: 'conv-abc-123' } });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ params: { conversationId: 'conv-abc-123' } });
    });

    it('should reject a get conversation history request with missing conversationId', () => {
      const result = schema.safeParse({ params: {} });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Conversation ID is required');
      expect(result.error?.issues[0].path).toEqual(['params', 'conversationId']);
    });

    it('should reject a get conversation history request with conversationId not a string', () => {
      const result = schema.safeParse({ params: { conversationId: 12345 } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
      expect(result.error?.issues[0].path).toEqual(['params', 'conversationId']);
    });

    it('should reject a get conversation history request if params is not an object', () => {
      const result = schema.safeParse({ params: 'not an object' });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected object, received string');
      expect(result.error?.issues[0].path).toEqual(['params']);
    });
  });
});