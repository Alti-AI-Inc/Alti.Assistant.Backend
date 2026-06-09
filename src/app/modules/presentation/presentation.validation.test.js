import { describe, it, expect } from 'vitest';
import { PresentationValidation } from './presentation.validation';

describe('PresentationValidation Schemas', () => {
  describe('conversationalRequestSchema', () => {
    it('should validate a correct conversational request', () => {
      const validRequest = {
        body: {
          message: 'Hello, how are you?',
          conversationId: 'conv-123',
          userId: 'user-456',
        },
      };
      const result = PresentationValidation.conversationalRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validRequest);
    });

    it('should validate a conversational request with only required fields', () => {
      const validRequest = {
        body: {
          message: 'Short message.',
        },
      };
      const result = PresentationValidation.conversationalRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validRequest);
    });

    it('should fail if message is missing', () => {
      const invalidRequest = {
        body: {
          conversationId: 'conv-123',
        },
      };
      const result = PresentationValidation.conversationalRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Message is required');
      expect(result.error?.issues[0].path).toEqual(['body', 'message']);
    });

    it('should fail if message is empty', () => {
      const invalidRequest = {
        body: {
          message: '',
        },
      };
      const result = PresentationValidation.conversationalRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Message cannot be empty');
      expect(result.error?.issues[0].path).toEqual(['body', 'message']);
    });

    it('should fail if message is too long', () => {
      const longMessage = 'a'.repeat(5001);
      const invalidRequest = {
        body: {
          message: longMessage,
        },
      };
      const result = PresentationValidation.conversationalRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Message too long');
      expect(result.error?.issues[0].path).toEqual(['body', 'message']);
    });

    it('should fail if message is not a string', () => {
      const invalidRequest = {
        body: {
          message: 123,
        },
      };
      const result = PresentationValidation.conversationalRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
      expect(result.error?.issues[0].path).toEqual(['body', 'message']);
    });

    it('should allow conversationId and userId to be optional', () => {
      const validRequest = {
        body: {
          message: 'Test message',
        },
      };
      const result = PresentationValidation.conversationalRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('generatePresentationSchema', () => {
    it('should validate a correct generate presentation request', () => {
      const validRequest = {
        body: {
          content: 'This is the content for the presentation.',
          n_slides: 5,
          language: 'en',
          template: 'modern',
          theme: 'dark',
          export_as: 'pptx',
          tone: 'professional',
          verbosity: 'medium',
          image_type: 'abstract',
          web_search: true,
          include_table_of_contents: true,
          include_title_slide: true,
          async: false,
        },
      };
      const result = PresentationValidation.generatePresentationSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validRequest);
    });

    it('should validate a generate presentation request with only required fields', () => {
      const validRequest = {
        body: {
          content: 'Minimal content.',
        },
      };
      const result = PresentationValidation.generatePresentationSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validRequest);
    });

    it('should fail if content is missing', () => {
      const invalidRequest = {
        body: {
          n_slides: 10,
        },
      };
      const result = PresentationValidation.generatePresentationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Content is required');
      expect(result.error?.issues[0].path).toEqual(['body', 'content']);
    });

    it('should fail if content is empty', () => {
      const invalidRequest = {
        body: {
          content: '',
        },
      };
      const result = PresentationValidation.generatePresentationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Content is required');
      expect(result.error?.issues[0].path).toEqual(['body', 'content']);
    });

    it('should fail if n_slides is less than 1', () => {
      const invalidRequest = {
        body: {
          content: 'Some content',
          n_slides: 0,
        },
      };
      const result = PresentationValidation.generatePresentationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Number must be greater than or equal to 1');
      expect(result.error?.issues[0].path).toEqual(['body', 'n_slides']);
    });

    it('should fail if n_slides is greater than 50', () => {
      const invalidRequest = {
        body: {
          content: 'Some content',
          n_slides: 51,
        },
      };
      const result = PresentationValidation.generatePresentationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Number must be less than or equal to 50');
      expect(result.error?.issues[0].path).toEqual(['body', 'n_slides']);
    });

    it('should fail if export_as is not "pptx" or "pdf"', () => {
      const invalidRequest = {
        body: {
          content: 'Some content',
          export_as: 'docx',
        },
      };
      const result = PresentationValidation.generatePresentationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain("Invalid enum value. Expected 'pptx' | 'pdf', received 'docx'");
      expect(result.error?.issues[0].path).toEqual(['body', 'export_as']);
    });

    it('should allow all optional fields to be omitted', () => {
      const validRequest = {
        body: {
          content: 'Content for presentation.',
        },
      };
      const result = PresentationValidation.generatePresentationSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('checkStatusSchema', () => {
    it('should validate a correct check status request', () => {
      const validRequest = {
        params: {
          taskId: 'task-123',
        },
        query: {
          conversationId: 'conv-456',
        },
      };
      const result = PresentationValidation.checkStatusSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validRequest);
    });

    it('should validate a check status request with only required fields', () => {
      const validRequest = {
        params: {
          taskId: 'task-123',
        },
      };
      const result = PresentationValidation.checkStatusSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validRequest);
    });

    it('should fail if taskId is missing', () => {
      const invalidRequest = {
        params: {},
      };
      const result = PresentationValidation.checkStatusSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Task ID is required');
      expect(result.error?.issues[0].path).toEqual(['params', 'taskId']);
    });

    it('should fail if taskId is not a string', () => {
      const invalidRequest = {
        params: {
          taskId: 123,
        },
      };
      const result = PresentationValidation.checkStatusSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
      expect(result.error?.issues[0].path).toEqual(['params', 'taskId']);
    });

    it('should allow query to be optional', () => {
      const validRequest = {
        params: {
          taskId: 'task-123',
        },
      };
      const result = PresentationValidation.checkStatusSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should allow conversationId in query to be optional', () => {
      const validRequest = {
        params: {
          taskId: 'task-123',
        },
        query: {},
      };
      const result = PresentationValidation.checkStatusSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validRequest);
    });
  });

  describe('editPresentationSchema', () => {
    it('should validate a correct edit presentation request', () => {
      const validRequest = {
        body: {
          presentationId: 'pres-123',
          slides: [
            { index: 0, content: { title: 'Intro', text: 'Welcome' } },
            { index: 1, content: { image: 'url', caption: 'Description' } },
          ],
          export_as: 'pdf',
        },
      };
      const result = PresentationValidation.editPresentationSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validRequest);
    });

    it('should validate an edit presentation request with only required fields', () => {
      const validRequest = {
        body: {
          presentationId: 'pres-123',
          slides: [{ index: 0, content: { title: 'Only one slide' } }],
        },
      };
      const result = PresentationValidation.editPresentationSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validRequest);
    });

    it('should fail if presentationId is missing', () => {
      const invalidRequest = {
        body: {
          slides: [{ index: 0, content: { title: 'Slide' } }],
        },
      };
      const result = PresentationValidation.editPresentationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Presentation ID is required');
      expect(result.error?.issues[0].path).toEqual(['body', 'presentationId']);
    });

    it('should fail if slides array is empty', () => {
      const invalidRequest = {
        body: {
          presentationId: 'pres-123',
          slides: [],
        },
      };
      const result = PresentationValidation.editPresentationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('At least one slide edit is required');
      expect(result.error?.issues[0].path).toEqual(['body', 'slides']);
    });

    it('should fail if slide index is negative', () => {
      const invalidRequest = {
        body: {
          presentationId: 'pres-123',
          slides: [{ index: -1, content: { title: 'Invalid' } }],
        },
      };
      const result = PresentationValidation.editPresentationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Number must be greater than or equal to 0');
      expect(result.error?.issues[0].path).toEqual(['body', 'slides', 0, 'index']);
    });

    it('should fail if export_as is invalid', () => {
      const invalidRequest = {
        body: {
          presentationId: 'pres-123',
          slides: [{ index: 0, content: { title: 'Slide' } }],
          export_as: 'docx',
        },
      };
      const result = PresentationValidation.editPresentationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toContain("Invalid enum value. Expected 'pptx' | 'pdf', received 'docx'");
      expect(result.error?.issues[0].path).toEqual(['body', 'export_as']);
    });

    it('should allow content to be any record', () => {
      const validRequest = {
        body: {
          presentationId: 'pres-123',
          slides: [{ index: 0, content: { complex: { data: [1, 2, { key: 'value' }] } } }],
        },
      };
      const result = PresentationValidation.editPresentationSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('getPresentationSchema', () => {
    it('should validate a correct get presentation request', () => {
      const validRequest = {
        params: {
          presentationId: 'pres-123',
        },
      };
      const result = PresentationValidation.getPresentationSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validRequest);
    });

    it('should fail if presentationId is missing', () => {
      const invalidRequest = {
        params: {},
      };
      const result = PresentationValidation.getPresentationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Presentation ID is required');
      expect(result.error?.issues[0].path).toEqual(['params', 'presentationId']);
    });

    it('should fail if presentationId is not a string', () => {
      const invalidRequest = {
        params: {
          presentationId: 123,
        },
      };
      const result = PresentationValidation.getPresentationSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Expected string, received number');
      expect(result.error?.issues[0].path).toEqual(['params', 'presentationId']);
    });
  });
});