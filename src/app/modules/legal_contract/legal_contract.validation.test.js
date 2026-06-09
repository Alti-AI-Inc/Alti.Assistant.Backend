import { describe, it, expect } from 'vitest';
import { LegalContractValidation } from './legal_contract.validation';

describe('LegalContractValidation', () => {
  describe('conversationalRequestSchema', () => {
    it('should validate a correct conversational request', () => {
      const validRequest = {
        body: {
          message: 'I need a simple employment contract.',
          conversationId: 'conv-123',
          userId: 'user-456',
          outputFormat: 'docx',
        },
      };
      const result = LegalContractValidation.conversationalRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data.body.outputFormat).toBe('docx');
    });

    it('should validate a conversational request with minimal required fields', () => {
      const minimalRequest = {
        body: {
          message: 'Draft an NDA.',
        },
      };
      const result = LegalContractValidation.conversationalRequestSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
      expect(result.data.body.outputFormat).toBe('text'); // Default value
    });

    it('should fail if message is missing', () => {
      const invalidRequest = {
        body: {
          conversationId: 'conv-123',
        },
      };
      const result = LegalContractValidation.conversationalRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Message is required');
    });

    it('should fail if message is empty', () => {
      const invalidRequest = {
        body: {
          message: '',
        },
      };
      const result = LegalContractValidation.conversationalRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Message cannot be empty');
    });

    it('should fail if message is too long', () => {
      const longMessage = 'a'.repeat(5001);
      const invalidRequest = {
        body: {
          message: longMessage,
        },
      };
      const result = LegalContractValidation.conversationalRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Message too long');
    });

    it('should fail if outputFormat is invalid', () => {
      const invalidRequest = {
        body: {
          message: 'Test message',
          outputFormat: 'json',
        },
      };
      const result = LegalContractValidation.conversationalRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('Invalid enum value');
    });
  });

  describe('generateContractSchema', () => {
    it('should validate a correct direct contract generation request', () => {
      const validRequest = {
        body: {
          contractType: 'employment',
          complexity: 'detailed',
          jurisdiction: 'us_state',
          outputFormat: 'pdf',
          parties: [
            { name: 'Company Inc.', role: 'employer', email: 'company@example.com' },
            { name: 'John Doe', role: 'employee', address: '123 Main St' },
          ],
          terms: { salary: '100k', startDate: '2023-01-01' },
          additionalInstructions: 'Include non-compete clause.',
          includeBoilerplate: false,
        },
      };
      const result = LegalContractValidation.generateContractSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data.body.includeBoilerplate).toBe(false);
    });

    it('should validate a direct contract generation request with minimal fields', () => {
      const minimalRequest = {
        body: {},
      };
      const result = LegalContractValidation.generateContractSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
      expect(result.data.body.complexity).toBe('standard');
      expect(result.data.body.jurisdiction).toBe('international');
      expect(result.data.body.outputFormat).toBe('text');
      expect(result.data.body.includeBoilerplate).toBe(true);
    });

    it('should fail if contractType is invalid', () => {
      const invalidRequest = {
        body: {
          contractType: 'invalid_type',
        },
      };
      const result = LegalContractValidation.generateContractSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('Invalid enum value');
    });

    it('should fail if complexity is invalid', () => {
      const invalidRequest = {
        body: {
          complexity: 'very_complex',
        },
      };
      const result = LegalContractValidation.generateContractSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('Invalid enum value');
    });

    it('should fail if jurisdiction is invalid', () => {
      const invalidRequest = {
        body: {
          jurisdiction: 'mars',
        },
      };
      const result = LegalContractValidation.generateContractSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('Invalid enum value');
    });

    it('should fail if party email is invalid', () => {
      const invalidRequest = {
        body: {
          parties: [{ name: 'Test', role: 'test', email: 'invalid-email' }],
        },
      };
      const result = LegalContractValidation.generateContractSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Invalid email');
    });

    it('should fail if party name is missing', () => {
      const invalidRequest = {
        body: {
          parties: [{ role: 'test' }],
        },
      };
      const result = LegalContractValidation.generateContractSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Required');
    });
  });

  describe('answerQuestionsSchema', () => {
    it('should validate a correct answer questions request', () => {
      const validRequest = {
        body: {
          conversationId: 'conv-abc',
          answers: {
            q1: 'Answer to question 1',
            q2: true,
            q3: 123,
          },
          requestContract: true,
        },
      };
      const result = LegalContractValidation.answerQuestionsSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data.body.requestContract).toBe(true);
    });

    it('should validate an answer questions request with minimal fields', () => {
      const minimalRequest = {
        body: {
          conversationId: 'conv-abc',
          answers: {},
        },
      };
      const result = LegalContractValidation.answerQuestionsSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
      expect(result.data.body.requestContract).toBe(false); // Default value
    });

    it('should fail if conversationId is missing', () => {
      const invalidRequest = {
        body: {
          answers: { q1: 'Answer' },
        },
      };
      const result = LegalContractValidation.answerQuestionsSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Conversation ID is required');
    });

    it('should fail if answers is missing', () => {
      const invalidRequest = {
        body: {
          conversationId: 'conv-abc',
        },
      };
      const result = LegalContractValidation.answerQuestionsSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Required');
    });
  });

  describe('getConversationHistorySchema', () => {
    it('should validate a correct get conversation history request', () => {
      const validRequest = {
        params: {
          conversationId: 'conv-xyz',
        },
      };
      const result = LegalContractValidation.getConversationHistorySchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should fail if conversationId is missing from params', () => {
      const invalidRequest = {
        params: {},
      };
      const result = LegalContractValidation.getConversationHistorySchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Conversation ID is required');
    });
  });

  describe('downloadContractSchema', () => {
    it('should validate a correct download contract request', () => {
      const validRequest = {
        params: {
          conversationId: 'conv-download',
        },
        query: {
          format: 'docx',
        },
      };
      const result = LegalContractValidation.downloadContractSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      expect(result.data.query.format).toBe('docx');
    });

    it('should validate a download contract request with default format', () => {
      const minimalRequest = {
        params: {
          conversationId: 'conv-download',
        },
        query: {},
      };
      const result = LegalContractValidation.downloadContractSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
      expect(result.data.query.format).toBe('text'); // Default value
    });

    it('should fail if conversationId is missing from params', () => {
      const invalidRequest = {
        params: {},
        query: { format: 'pdf' },
      };
      const result = LegalContractValidation.downloadContractSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Conversation ID is required');
    });

    it('should fail if format is invalid', () => {
      const invalidRequest = {
        params: {
          conversationId: 'conv-download',
        },
        query: {
          format: 'html',
        },
      };
      const result = LegalContractValidation.downloadContractSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('Invalid enum value');
    });
  });

  describe('modifyContractSchema', () => {
    it('should validate a correct modify contract request', () => {
      const validRequest = {
        body: {
          conversationId: 'conv-modify',
          modifications: 'Change the start date to 2024-01-01 and increase salary by 10%.',
        },
      };
      const result = LegalContractValidation.modifyContractSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should fail if conversationId is missing', () => {
      const invalidRequest = {
        body: {
          modifications: 'Some changes.',
        },
      };
      const result = LegalContractValidation.modifyContractSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Conversation ID is required');
    });

    it('should fail if modifications are missing', () => {
      const invalidRequest = {
        body: {
          conversationId: 'conv-modify',
        },
      };
      const result = LegalContractValidation.modifyContractSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Modification instructions are required');
    });

    it('should fail if modifications are empty', () => {
      const invalidRequest = {
        body: {
          conversationId: 'conv-modify',
          modifications: '',
        },
      };
      const result = LegalContractValidation.modifyContractSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('String must contain at least 1 character(s)');
    });
  });
});