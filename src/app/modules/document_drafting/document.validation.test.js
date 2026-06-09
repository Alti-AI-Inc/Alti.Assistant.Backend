import { describe, it, expect } from 'vitest';
import { DocumentValidation } from './document.validation';

describe('DocumentValidation Schemas', () => {
  // --- conversationalRequestSchema ---
  describe('conversationalRequestSchema', () => {
    const schema = DocumentValidation.conversationalRequestSchema;

    it('should validate a minimal valid conversational request', () => {
      const result = schema.safeParse({ body: { message: 'Hello, draft a document.' } });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ body: { message: 'Hello, draft a document.' } });
    });

    it('should validate a conversational request with all optional fields', () => {
      const result = schema.safeParse({
        body: {
          message: 'Hello, draft a document.',
          conversationId: 'conv-123',
          userId: 'user-456',
        },
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        body: {
          message: 'Hello, draft a document.',
          conversationId: 'conv-123',
          userId: 'user-456',
        },
      });
    });

    it('should fail if message is missing', () => {
      const result = schema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Message is required');
    });

    it('should fail if message is empty', () => {
      const result = schema.safeParse({ body: { message: '' } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Message cannot be empty');
    });

    it('should fail if message is too long', () => {
      const longMessage = 'a'.repeat(10001);
      const result = schema.safeParse({ body: { message: longMessage } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Message too long');
    });

    it('should fail if message is not a string', () => {
      const result = schema.safeParse({ body: { message: 123 } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
    });

    it('should fail if conversationId is not a string', () => {
      const result = schema.safeParse({
        body: { message: 'test', conversationId: 123 },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
    });

    it('should fail if userId is not a string', () => {
      const result = schema.safeParse({
        body: { message: 'test', userId: true },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received boolean');
    });
  });

  // --- generateDocumentSchema ---
  describe('generateDocumentSchema', () => {
    const schema = DocumentValidation.generateDocumentSchema;

    it('should validate a minimal valid document generation request', () => {
      const result = schema.safeParse({
        body: { content: 'This is some content for a document.' },
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        body: { content: 'This is some content for a document.' },
      });
    });

    it('should validate a document generation request with all optional fields', () => {
      const result = schema.safeParse({
        body: {
          content: 'This is some content for a document, it needs to be long enough.',
          documentType: 'essay',
          outputFormat: 'pdf',
          tone: 'academic',
          length: 'medium',
          wordCount: 500,
          includeTitle: true,
          includeDate: false,
          language: 'en-US',
          template: 'academic_paper',
          additionalInstructions: 'Please ensure proper citations.',
        },
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        body: {
          content: 'This is some content for a document, it needs to be long enough.',
          documentType: 'essay',
          outputFormat: 'pdf',
          tone: 'academic',
          length: 'medium',
          wordCount: 500,
          includeTitle: true,
          includeDate: false,
          language: 'en-US',
          template: 'academic_paper',
          additionalInstructions: 'Please ensure proper citations.',
        },
      });
    });

    it('should fail if content is missing', () => {
      const result = schema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Content or topic is required');
    });

    it('should fail if content is too short', () => {
      const result = schema.safeParse({ body: { content: 'short' } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Content is too short');
    });

    it('should fail if content is too long', () => {
      const longContent = 'a'.repeat(50001);
      const result = schema.safeParse({ body: { content: longContent } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Content is too long');
    });

    it('should fail if content is not a string', () => {
      const result = schema.safeParse({ body: { content: 12345 } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
    });

    it('should fail for invalid documentType enum value', () => {
      const result = schema.safeParse({
        body: { content: 'valid content', documentType: 'invalid_type' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail for invalid outputFormat enum value', () => {
      const result = schema.safeParse({
        body: { content: 'valid content', outputFormat: 'json' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail for invalid tone enum value', () => {
      const result = schema.safeParse({
        body: { content: 'valid content', tone: 'sarcastic' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail for invalid length enum value', () => {
      const result = schema.safeParse({
        body: { content: 'valid content', length: 'extra_long' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail if wordCount is too low', () => {
      const result = schema.safeParse({
        body: { content: 'valid content', wordCount: 49 },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Number must be greater than or equal to 50');
    });

    it('should fail if wordCount is too high', () => {
      const result = schema.safeParse({
        body: { content: 'valid content', wordCount: 10001 },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Number must be less than or equal to 10000');
    });

    it('should fail if wordCount is not a number', () => {
      const result = schema.safeParse({
        body: { content: 'valid content', wordCount: '500' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected number, received string');
    });

    it('should fail if includeTitle is not a boolean', () => {
      const result = schema.safeParse({
        body: { content: 'valid content', includeTitle: 'true' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected boolean, received string');
    });

    it('should fail if includeDate is not a boolean', () => {
      const result = schema.safeParse({
        body: { content: 'valid content', includeDate: 1 },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected boolean, received number');
    });

    it('should fail if language is not a string', () => {
      const result = schema.safeParse({
        body: { content: 'valid content', language: 123 },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
    });

    it('should fail for invalid template enum value', () => {
      const result = schema.safeParse({
        body: { content: 'valid content', template: 'custom_template' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail if additionalInstructions is too long', () => {
      const longInstructions = 'a'.repeat(2001);
      const result = schema.safeParse({
        body: { content: 'valid content', additionalInstructions: longInstructions },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('String must contain at most 2000 character(s)');
    });
  });

  // --- editDocumentSchema ---
  describe('editDocumentSchema', () => {
    const schema = DocumentValidation.editDocumentSchema;

    it('should validate a minimal valid document editing request', () => {
      const result = schema.safeParse({
        body: { documentId: 'doc-123', editInstructions: 'Fix typos and grammar.' },
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        body: { documentId: 'doc-123', editInstructions: 'Fix typos and grammar.' },
      });
    });

    it('should validate a document editing request with optional outputFormat', () => {
      const result = schema.safeParse({
        body: {
          documentId: 'doc-123',
          editInstructions: 'Fix typos and grammar.',
          outputFormat: 'docx',
        },
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        body: {
          documentId: 'doc-123',
          editInstructions: 'Fix typos and grammar.',
          outputFormat: 'docx',
        },
      });
    });

    it('should fail if documentId is missing', () => {
      const result = schema.safeParse({ body: { editInstructions: 'Edit this.' } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Document ID is required');
    });

    it('should fail if documentId is not a string', () => {
      const result = schema.safeParse({
        body: { documentId: 123, editInstructions: 'Edit this.' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
    });

    it('should fail if editInstructions is missing', () => {
      const result = schema.safeParse({ body: { documentId: 'doc-123' } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Edit instructions are required');
    });

    it('should fail if editInstructions is too short', () => {
      const result = schema.safeParse({
        body: { documentId: 'doc-123', editInstructions: 'edit' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Instructions are too short');
    });

    it('should fail if editInstructions is too long', () => {
      const longInstructions = 'a'.repeat(5001);
      const result = schema.safeParse({
        body: { documentId: 'doc-123', editInstructions: longInstructions },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Instructions are too long');
    });

    it('should fail if editInstructions is not a string', () => {
      const result = schema.safeParse({
        body: { documentId: 'doc-123', editInstructions: 123 },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
    });

    it('should fail for invalid outputFormat enum value', () => {
      const result = schema.safeParse({
        body: {
          documentId: 'doc-123',
          editInstructions: 'valid instructions',
          outputFormat: 'json',
        },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
    });
  });

  // --- exportDocumentSchema ---
  describe('exportDocumentSchema', () => {
    const schema = DocumentValidation.exportDocumentSchema;

    it('should validate a valid document export request', () => {
      const result = schema.safeParse({
        body: { documentId: 'doc-456', outputFormat: 'pdf' },
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        body: { documentId: 'doc-456', outputFormat: 'pdf' },
      });
    });

    it('should fail if documentId is missing', () => {
      const result = schema.safeParse({ body: { outputFormat: 'pdf' } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Document ID is required');
    });

    it('should fail if documentId is not a string', () => {
      const result = schema.safeParse({
        body: { documentId: 123, outputFormat: 'pdf' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
    });

    it('should fail if outputFormat is missing', () => {
      const result = schema.safeParse({ body: { documentId: 'doc-456' } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Output format is required');
    });

    it('should fail for invalid outputFormat enum value', () => {
      const result = schema.safeParse({
        body: { documentId: 'doc-456', outputFormat: 'json' },
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain('Invalid enum value');
    });
  });

  // --- getDocumentSchema ---
  describe('getDocumentSchema', () => {
    const schema = DocumentValidation.getDocumentSchema;

    it('should validate a valid get document request', () => {
      const result = schema.safeParse({ params: { documentId: 'doc-789' } });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ params: { documentId: 'doc-789' } });
    });

    it('should fail if documentId is missing', () => {
      const result = schema.safeParse({ params: {} });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Document ID is required');
    });

    it('should fail if documentId is not a string', () => {
      const result = schema.safeParse({ params: { documentId: 123 } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
    });
  });

  // --- checkStatusSchema ---
  describe('checkStatusSchema', () => {
    const schema = DocumentValidation.checkStatusSchema;

    it('should validate a valid check status request', () => {
      const result = schema.safeParse({ params: { taskId: 'task-abc' } });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ params: { taskId: 'task-abc' } });
    });

    it('should fail if taskId is missing', () => {
      const result = schema.safeParse({ params: {} });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Task ID is required');
    });

    it('should fail if taskId is not a string', () => {
      const result = schema.safeParse({ params: { taskId: 123 } });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
    });
  });
});