import { describe, it, expect } from 'vitest';
import { LegalContractReviewValidation } from './legal_contract_review.validation.js';

describe('LegalContractReviewValidation', () => {
  describe('conversationalRequestSchema', () => {
    it('should validate a correct payload with only required fields', () => {
      const payload = {
        body: {
          message: 'Hello, I need help with this contract.',
        },
      };
      const result = LegalContractReviewValidation.conversationalRequestSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body.outputFormat).toBe('text');
    });

    it('should validate a correct payload with all fields', () => {
      const payload = {
        body: {
          message: 'Hello',
          conversationId: 'conv-123',
          userId: 'user-456',
          outputFormat: 'markdown',
        },
      };
      const result = LegalContractReviewValidation.conversationalRequestSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body.outputFormat).toBe('markdown');
    });

    it('should fail validation if message is missing', () => {
      const payload = {
        body: {},
      };
      const result = LegalContractReviewValidation.conversationalRequestSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.format().body?.message?._errors;
        expect(issues).toContain('Message is required');
      }
    });

    it('should fail validation if message is empty', () => {
      const payload = {
        body: {
          message: '',
        },
      };
      const result = LegalContractReviewValidation.conversationalRequestSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.format().body?.message?._errors;
        expect(issues).toContain('Message cannot be empty');
      }
    });

    it('should fail validation if message is too long', () => {
      const payload = {
        body: {
          message: 'a'.repeat(5001),
        },
      };
      const result = LegalContractReviewValidation.conversationalRequestSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.format().body?.message?._errors;
        expect(issues).toContain('Message too long');
      }
    });

    it('should fail validation if outputFormat is invalid', () => {
      const payload = {
        body: {
          message: 'Hello',
          outputFormat: 'invalid_format',
        },
      };
      const result = LegalContractReviewValidation.conversationalRequestSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('reviewContractSchema', () => {
    it('should validate an empty body since all fields are optional', () => {
      const payload = {
        body: {},
      };
      const result = LegalContractReviewValidation.reviewContractSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body.outputFormat).toBe('text');
    });

    it('should validate a correct payload with all fields', () => {
      const payload = {
        body: {
          reviewType: 'clause_analysis',
          reviewDepth: 'detailed',
          contractType: 'nda',
          aspects: ['confidentiality', 'termination'],
          additionalInstructions: 'Focus on the IP clause.',
          outputFormat: 'pdf',
        },
      };
      const result = LegalContractReviewValidation.reviewContractSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body.reviewType).toBe('clause_analysis');
      expect(result.data.body.aspects).toEqual(['confidentiality', 'termination']);
    });

    it('should fail validation if reviewType is invalid', () => {
      const payload = {
        body: {
          reviewType: 'invalid_review_type',
        },
      };
      const result = LegalContractReviewValidation.reviewContractSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail validation if reviewDepth is invalid', () => {
      const payload = {
        body: {
          reviewDepth: 'super_deep',
        },
      };
      const result = LegalContractReviewValidation.reviewContractSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail validation if contractType is invalid', () => {
      const payload = {
        body: {
          contractType: 'invalid_contract_type',
        },
      };
      const result = LegalContractReviewValidation.reviewContractSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail validation if aspects contains an invalid value', () => {
      const payload = {
        body: {
          aspects: ['confidentiality', 'invalid_aspect'],
        },
      };
      const result = LegalContractReviewValidation.reviewContractSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should fail validation if outputFormat is invalid', () => {
      const payload = {
        body: {
          outputFormat: 'html',
        },
      };
      const result = LegalContractReviewValidation.reviewContractSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('getConversationHistorySchema', () => {
    it('should validate a correct payload with conversationId', () => {
      const payload = {
        params: {
          conversationId: 'conv-12345',
        },
      };
      const result = LegalContractReviewValidation.getConversationHistorySchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.params.conversationId).toBe('conv-12345');
    });

    it('should fail validation if conversationId is missing', () => {
      const payload = {
        params: {},
      };
      const result = LegalContractReviewValidation.getConversationHistorySchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.format().params?.conversationId?._errors;
        expect(issues).toContain('Conversation ID is required');
      }
    });

    it('should fail validation if conversationId is not a string', () => {
      const payload = {
        params: {
          conversationId: 12345,
        },
      };
      const result = LegalContractReviewValidation.getConversationHistorySchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
});