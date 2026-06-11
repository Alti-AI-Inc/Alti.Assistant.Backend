import { describe, it, expect } from 'vitest';
import { EnhancedImageValidation } from './enhanced_image.validation';

describe('EnhancedImageValidation Schemas', () => {
  const longString = 'a'.repeat(2001);

  // Test suite for generateImageSchema
  describe('generateImageSchema', () => {
    const schema = EnhancedImageValidation.generateImageSchema;

    it('should pass with a valid minimal body', () => {
      const result = schema.safeParse({ body: { prompt: 'A cat sitting on a mat' } });
      expect(result.success).toBe(true);
    });

    it('should pass with a valid full body', () => {
      const result = schema.safeParse({
        body: {
          prompt: 'A dog chasing a ball',
          conversationId: 'conv-123',
          aspectRatio: '16:9',
          negativePrompt: 'blurry, low quality',
          userId: 'user-456',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if prompt is missing', () => {
      const result = schema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Prompt is required');
    });

    it('should fail if prompt is empty', () => {
      const result = schema.safeParse({ body: { prompt: '' } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Prompt cannot be empty');
    });

    it('should fail if prompt is too long', () => {
      const result = schema.safeParse({ body: { prompt: longString } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Prompt too long');
    });

    it('should fail if prompt is not a string', () => {
      const result = schema.safeParse({ body: { prompt: 12345 } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected string, received number');
    });
  });

  // Test suite for editImageSchema
  describe('editImageSchema', () => {
    const schema = EnhancedImageValidation.editImageSchema;

    it('should pass with a valid minimal body', () => {
      const result = schema.safeParse({
        body: {
          prompt: 'Make the cat blue',
          gcsImagePath: 'images/cat.png',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should pass with a valid full body', () => {
      const result = schema.safeParse({
        body: {
          prompt: 'Add a hat to the dog',
          gcsImagePath: 'images/dog.png',
          conversationId: 'conv-123',
          aspectRatio: '1:1',
          userId: 'user-456',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if prompt is missing', () => {
      const result = schema.safeParse({ body: { gcsImagePath: 'images/cat.png' } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Prompt is required');
    });

    it('should fail if gcsImagePath is missing', () => {
      const result = schema.safeParse({ body: { prompt: 'Make it bigger' } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('GCS image path is required');
    });

    it('should fail if gcsImagePath is empty', () => {
      const result = schema.safeParse({ body: { prompt: 'Make it bigger', gcsImagePath: '' } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('GCS image path cannot be empty');
    });
  });

  // Test suite for analyzeIntentSchema
  describe('analyzeIntentSchema', () => {
    const schema = EnhancedImageValidation.analyzeIntentSchema;

    it('should pass with a valid body', () => {
      const result = schema.safeParse({ body: { prompt: 'What can you do?' } });
      expect(result.success).toBe(true);
    });

    it('should fail if prompt is missing', () => {
      const result = schema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Prompt is required');
    });

    it('should fail if prompt is empty', () => {
      const result = schema.safeParse({ body: { prompt: '' } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Prompt cannot be empty');
    });
  });

  // Test suite for analyzeImageIntentSchema
  describe('analyzeImageIntentSchema', () => {
    const schema = EnhancedImageValidation.analyzeImageIntentSchema;

    it('should pass with only request', () => {
      const result = schema.safeParse({ body: { request: 'Generate an image' } });
      expect(result.success).toBe(true);
    });

    it('should pass with only userMessage', () => {
      const result = schema.safeParse({ body: { userMessage: 'Create a picture for me' } });
      expect(result.success).toBe(true);
    });

    it('should pass with both request and userMessage', () => {
      const result = schema.safeParse({
        body: { request: 'Generate', userMessage: 'Create a picture' },
      });
      expect(result.success).toBe(true);
    });

    it('should pass with all optional fields', () => {
      const result = schema.safeParse({
        body: {
          request: 'Generate',
          hasImage: true,
          sessionId: 'session-123',
          conversationId: 'conv-456',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if both request and userMessage are missing', () => {
      const result = schema.safeParse({ body: { hasImage: true } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Either request or userMessage is required');
    });
  });

  // Test suite for evaluatePromptSchema
  describe('evaluatePromptSchema', () => {
    const schema = EnhancedImageValidation.evaluatePromptSchema;

    it('should pass with a valid minimal body', () => {
      const result = schema.safeParse({ body: { prompt: 'Is this a good prompt?' } });
      expect(result.success).toBe(true);
    });

    it('should pass with a valid full body', () => {
      const result = schema.safeParse({
        body: {
          prompt: 'Evaluate this prompt for me',
          conversationId: 'conv-123',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if prompt is missing', () => {
      const result = schema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Prompt is required');
    });
  });

  // Test suite for addDetailSchema
  describe('addDetailSchema', () => {
    const schema = EnhancedImageValidation.addDetailSchema;

    it('should pass with a valid body', () => {
      const result = schema.safeParse({
        body: {
          conversationId: 'conv-123',
          detail: 'The cat should be wearing a hat',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if conversationId is missing', () => {
      const result = schema.safeParse({ body: { detail: 'Add a hat' } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('ConversationId is required');
    });

    it('should fail if detail is missing', () => {
      const result = schema.safeParse({ body: { conversationId: 'conv-123' } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Detail is required');
    });

    it('should fail if detail is empty', () => {
      const result = schema.safeParse({ body: { conversationId: 'conv-123', detail: '' } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Detail cannot be empty');
    });
  });

  // Test suite for buildEnhancedPromptSchema
  describe('buildEnhancedPromptSchema', () => {
    const schema = EnhancedImageValidation.buildEnhancedPromptSchema;

    it('should pass with a valid body', () => {
      const result = schema.safeParse({ body: { conversationId: 'conv-123' } });
      expect(result.success).toBe(true);
    });

    it('should fail if conversationId is missing', () => {
      const result = schema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('ConversationId is required');
    });
  });

  // Test suite for finalizePromptSchema
  describe('finalizePromptSchema', () => {
    const schema = EnhancedImageValidation.finalizePromptSchema;

    it('should pass with a valid body', () => {
      const result = schema.safeParse({ body: { conversationId: 'conv-123' } });
      expect(result.success).toBe(true);
    });

    it('should fail if conversationId is missing', () => {
      const result = schema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('ConversationId is required');
    });
  });

  // Test suite for generateFromConversationSchema
  describe('generateFromConversationSchema', () => {
    const schema = EnhancedImageValidation.generateFromConversationSchema;

    it('should pass with a valid minimal body', () => {
      const result = schema.safeParse({ body: { conversationId: 'conv-123' } });
      expect(result.success).toBe(true);
    });

    it('should pass with a valid full body', () => {
      const result = schema.safeParse({
        body: {
          conversationId: 'conv-123',
          aspectRatio: '16:9',
          negativePrompt: 'blurry',
          userId: 'user-456',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if conversationId is missing', () => {
      const result = schema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('ConversationId is required');
    });
  });
});