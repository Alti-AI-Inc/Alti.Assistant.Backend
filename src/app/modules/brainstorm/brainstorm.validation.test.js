import { describe, it, expect } from 'vitest';
import { BrainstormValidation } from './brainstorm.validation.js';

// A valid CUID for testing purposes
const VALID_CUID = 'clwxa6y1o000008l32628v1jx';

describe('BrainstormValidation', () => {
  describe('conversationalBrainstormSchema', () => {
    const validPayload = {
      body: {
        message: 'This is a valid message for the brainstorm session.',
      },
    };

    it('should pass with a valid message', () => {
      const result =
        BrainstormValidation.conversationalBrainstormSchema.safeParse(
          validPayload
        );
      expect(result.success).toBe(true);
    });

    it('should pass with a valid message and optional conversationId', () => {
      const payload = {
        body: {
          ...validPayload.body,
          conversationId: VALID_CUID,
        },
      };
      const result =
        BrainstormValidation.conversationalBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should pass with a valid message and optional workspaceId for context', () => {
      const payload = {
        body: {
          ...validPayload.body,
          workspaceId: VALID_CUID,
        },
      };
      const result =
        BrainstormValidation.conversationalBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should fail if message is missing', () => {
      const payload = { body: {} };
      const result =
        BrainstormValidation.conversationalBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Message is required');
    });

    it('should fail if message is too short', () => {
      const payload = { body: { message: 'short' } };
      const result =
        BrainstormValidation.conversationalBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Message must be at least 10 characters'
      );
    });

    it('should fail if message is too long', () => {
      const payload = { body: { message: 'a'.repeat(5001) } };
      const result =
        BrainstormValidation.conversationalBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Message too long');
    });

    it('should fail if conversationId has an invalid format', () => {
      const payload = {
        body: {
          ...validPayload.body,
          conversationId: 'invalid-id',
        },
      };
      const result =
        BrainstormValidation.conversationalBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Invalid Conversation ID format'
      );
    });

    it('should fail if workspaceId has an invalid format', () => {
      const payload = {
        body: {
          ...validPayload.body,
          workspaceId: 'invalid-id',
        },
      };
      const result =
        BrainstormValidation.conversationalBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Invalid Workspace ID format'
      );
    });
  });

  describe('structuredBrainstormSchema', () => {
    const validPayload = {
      body: {
        workspaceId: VALID_CUID,
        idea: 'Develop a new AI-powered QA testing framework.',
      },
    };

    it('should pass with only required fields (workspaceId, idea)', () => {
      const result =
        BrainstormValidation.structuredBrainstormSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should pass with all valid optional fields', () => {
      const payload = {
        body: {
          ...validPayload.body,
          brainstormType: 'technical_solution',
          perspective: ['technical', 'business'],
          technique: 'swot',
          depth: 'deep',
          iterations: 3,
          focusAreas: ['feasibility', 'scalability'],
          constraints: {
            timeline: '6 months',
            technology: ['Node.js', 'Vitest'],
          },
          additionalInstructions: 'Focus on integration with CI/CD pipelines.',
        },
      };
      const result =
        BrainstormValidation.structuredBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should fail if workspaceId is missing (context boundary check)', () => {
      const payload = { body: { idea: 'An idea without a workspace.' } };
      const result =
        BrainstormValidation.structuredBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Workspace ID is required');
    });

    it('should fail if workspaceId is not a valid CUID (context boundary check)', () => {
      const payload = {
        body: { workspaceId: 'invalid-ws', idea: validPayload.body.idea },
      };
      const result =
        BrainstormValidation.structuredBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Invalid Workspace ID format'
      );
    });

    it('should fail if idea is missing', () => {
      const payload = { body: { workspaceId: VALID_CUID } };
      const result =
        BrainstormValidation.structuredBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Idea is required');
    });

    it('should fail if idea is too short', () => {
      const payload = { body: { ...validPayload.body, idea: 'short' } };
      const result =
        BrainstormValidation.structuredBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Idea must be at least 10 characters'
      );
    });

    it('should fail with an invalid brainstormType enum', () => {
      const payload = {
        body: { ...validPayload.body, brainstormType: 'invalid_type' },
      };
      const result =
        BrainstormValidation.structuredBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].code).toBe('invalid_enum_value');
    });

    it('should fail if iterations is out of range (too high)', () => {
      const payload = { body: { ...validPayload.body, iterations: 6 } };
      const result =
        BrainstormValidation.structuredBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Number must be less than or equal to 5'
      );
    });
  });

  describe('getConversationHistorySchema', () => {
    const validPayload = {
      params: {
        workspaceId: VALID_CUID,
        conversationId: VALID_CUID,
      },
    };

    it('should pass with valid workspaceId and conversationId in params', () => {
      const result =
        BrainstormValidation.getConversationHistorySchema.safeParse(
          validPayload
        );
      expect(result.success).toBe(true);
    });

    it('should fail if workspaceId is missing (context boundary check)', () => {
      const payload = { params: { conversationId: VALID_CUID } };
      const result =
        BrainstormValidation.getConversationHistorySchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Workspace ID is required');
    });

    it('should fail if conversationId is missing', () => {
      const payload = { params: { workspaceId: VALID_CUID } };
      const result =
        BrainstormValidation.getConversationHistorySchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Conversation ID is required');
    });

    it('should fail if workspaceId is not a valid CUID (context boundary check)', () => {
      const payload = {
        params: { workspaceId: 'invalid-ws', conversationId: VALID_CUID },
      };
      const result =
        BrainstormValidation.getConversationHistorySchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Invalid Workspace ID format'
      );
    });

    it('should fail if conversationId is not a valid CUID', () => {
      const payload = {
        params: { workspaceId: VALID_CUID, conversationId: 'invalid-convo' },
      };
      const result =
        BrainstormValidation.getConversationHistorySchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'Invalid Conversation ID format'
      );
    });
  });

  describe('exportBrainstormSchema', () => {
    const validPayload = {
      body: {
        workspaceId: VALID_CUID,
        conversationId: VALID_CUID,
      },
    };

    it('should pass with only required fields', () => {
      const result =
        BrainstormValidation.exportBrainstormSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should apply default values for optional fields', () => {
      const result =
        BrainstormValidation.exportBrainstormSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      expect(result.data.body.format).toBe('markdown');
      expect(result.data.body.includeHistory).toBe(true);
    });

    it('should pass with all fields specified', () => {
      const payload = {
        body: {
          ...validPayload.body,
          format: 'pdf',
          includeHistory: false,
        },
      };
      const result =
        BrainstormValidation.exportBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(true);
      expect(result.data.body.format).toBe('pdf');
      expect(result.data.body.includeHistory).toBe(false);
    });

    it('should fail if workspaceId is missing (context boundary check)', () => {
      const payload = { body: { conversationId: VALID_CUID } };
      const result =
        BrainstormValidation.exportBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Workspace ID is required');
    });

    it('should fail if conversationId is missing', () => {
      const payload = { body: { workspaceId: VALID_CUID } };
      const result =
        BrainstormValidation.exportBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Conversation ID is required');
    });

    it('should fail with an invalid format enum', () => {
      const payload = { body: { ...validPayload.body, format: 'word' } };
      const result =
        BrainstormValidation.exportBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].code).toBe('invalid_enum_value');
    });
  });

  describe('refineBrainstormSchema', () => {
    const validPayload = {
      body: {
        workspaceId: VALID_CUID,
        conversationId: VALID_CUID,
        message: 'Let us refine the previous idea about the QA framework.',
      },
    };

    it('should pass with required fields', () => {
      const result =
        BrainstormValidation.refineBrainstormSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should pass with optional focusOn field', () => {
      const payload = {
        body: {
          ...validPayload.body,
          focusOn: ['scalability', 'cost-effectiveness'],
        },
      };
      const result =
        BrainstormValidation.refineBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should fail if workspaceId is missing (context boundary check)', () => {
      const payload = {
        body: {
          conversationId: VALID_CUID,
          message: 'Refine this without a workspace.',
        },
      };
      const result =
        BrainstormValidation.refineBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Workspace ID is required');
    });

    it('should fail if conversationId is missing', () => {
      const payload = {
        body: {
          workspaceId: VALID_CUID,
          message: 'Refine this without a conversation ID.',
        },
      };
      const result =
        BrainstormValidation.refineBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Conversation ID is required');
    });

    it('should fail if message is too short', () => {
      const payload = {
        body: {
          ...validPayload.body,
          message: 'short',
        },
      };
      const result =
        BrainstormValidation.refineBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(
        'String must contain at least 10 character(s)'
      );
    });

    it('should fail if focusOn is not an array of strings', () => {
      const payload = {
        body: {
          ...validPayload.body,
          focusOn: ['valid', 123], // 123 is not a string
        },
      };
      const result =
        BrainstormValidation.refineBrainstormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toEqual(['body', 'focusOn', 1]);
      expect(result.error.issues[0].message).toBe(
        'Expected string, received number'
      );
    });
  });
});