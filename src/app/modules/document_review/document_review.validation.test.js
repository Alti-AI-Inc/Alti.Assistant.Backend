import { describe, it, expect } from 'vitest';
import { DocumentReviewValidation } from './document_review.validation';

describe('DocumentReviewValidation', () => {
  describe('conversationalRequestSchema', () => {
    it('should validate a correct conversational request', () => {
      const validData = {
        body: {
          message: 'Hello, please review this document.',
          conversationId: 'conv-123',
          userId: 'user-456',
        },
      };
      const result = DocumentReviewValidation.conversationalRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.body.message).toBe('Hello, please review this document.');
        expect(result.data.body.conversationId).toBe('conv-123');
        expect(result.data.body.userId).toBe('user-456');
      }
    });

    it('should validate when optional fields are missing', () => {
      const validData = {
        body: {
          message: 'Hello!',
        },
      };
      const result = DocumentReviewValidation.conversationalRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail if message is missing', () => {
      const invalidData = {
        body: {
          conversationId: 'conv-123',
        },
      };
      const result = DocumentReviewValidation.conversationalRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Message is required');
      }
    });

    it('should fail if message is empty', () => {
      const invalidData = {
        body: {
          message: '',
        },
      };
      const result = DocumentReviewValidation.conversationalRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Message cannot be empty');
      }
    });

    it('should fail if message exceeds 5000 characters', () => {
      const longMessage = 'a'.repeat(5001);
      const invalidData = {
        body: {
          message: longMessage,
        },
      };
      const result = DocumentReviewValidation.conversationalRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Message too long');
      }
    });

    it('should enforce context boundaries by stripping out unauthorized role injection attempts', () => {
      const maliciousData = {
        body: {
          message: 'Analyze this',
          role: 'super_admin', // Attempted privilege escalation / role injection
          isAdmin: true,
          accessLevel: 'manager',
        },
      };
      const result = DocumentReviewValidation.conversationalRequestSchema.safeParse(maliciousData);
      expect(result.success).toBe(true);
      if (result.success) {
        // Ensure extra fields outside the schema boundary are stripped
        expect(result.data.body).not.toHaveProperty('role');
        expect(result.data.body).not.toHaveProperty('isAdmin');
        expect(result.data.body).not.toHaveProperty('accessLevel');
        expect(result.data.body.message).toBe('Analyze this');
      }
    });
  });

  describe('reviewDocumentSchema', () => {
    it('should validate an empty body since all fields are optional', () => {
      const validData = {
        body: {},
      };
      const result = DocumentReviewValidation.reviewDocumentSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate a fully populated valid body', () => {
      const validData = {
        body: {
          reviewType: 'grammar_check',
          reviewDepth: 'detailed',
          documentType: 'technical',
          aspects: ['grammar', 'clarity', 'formatting'],
          additionalInstructions: 'Please focus on passive voice.',
        },
      };
      const result = DocumentReviewValidation.reviewDocumentSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail if reviewType is invalid', () => {
      const invalidData = {
        body: {
          reviewType: 'invalid_type_value',
        },
      };
      const result = DocumentReviewValidation.reviewDocumentSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should fail if reviewDepth is invalid', () => {
      const invalidData = {
        body: {
          reviewDepth: 'deep_search',
        },
      };
      const result = DocumentReviewValidation.reviewDocumentSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should fail if documentType is invalid', () => {
      const invalidData = {
        body: {
          documentType: 'sci-fi',
        },
      };
      const result = DocumentReviewValidation.reviewDocumentSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should fail if aspects contains an invalid enum value', () => {
      const invalidData = {
        body: {
          aspects: ['grammar', 'invalid_aspect_value'],
        },
      };
      const result = DocumentReviewValidation.reviewDocumentSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should fail if aspects is not an array', () => {
      const invalidData = {
        body: {
          aspects: 'grammar',
        },
      };
      const result = DocumentReviewValidation.reviewDocumentSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should strip out unauthorized fields to maintain context boundaries across roles', () => {
      const dataWithRoles = {
        body: {
          reviewType: 'general_review',
          userRole: 'admin', // Attempted role injection
          bypassValidation: true,
        },
      };
      const result = DocumentReviewValidation.reviewDocumentSchema.safeParse(dataWithRoles);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.body).not.toHaveProperty('userRole');
        expect(result.data.body).not.toHaveProperty('bypassValidation');
        expect(result.data.body.reviewType).toBe('general_review');
      }
    });
  });

  describe('getConversationHistorySchema', () => {
    it('should validate a correct params object', () => {
      const validData = {
        params: {
          conversationId: 'conv-12345',
        },
      };
      const result = DocumentReviewValidation.getConversationHistorySchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.params.conversationId).toBe('conv-12345');
      }
    });

    it('should fail if conversationId is missing in params', () => {
      const invalidData = {
        params: {},
      };
      const result = DocumentReviewValidation.getConversationHistorySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Conversation ID is required');
      }
    });

    it('should strip out extra parameters to prevent parameter pollution', () => {
      const dataWithExtraParams = {
        params: {
          conversationId: 'conv-999',
          injectedParam: 'malicious-value',
        },
      };
      const result = DocumentReviewValidation.getConversationHistorySchema.safeParse(dataWithExtraParams);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.params).not.toHaveProperty('injectedParam');
        expect(result.data.params.conversationId).toBe('conv-999');
      }
    });
  });
});