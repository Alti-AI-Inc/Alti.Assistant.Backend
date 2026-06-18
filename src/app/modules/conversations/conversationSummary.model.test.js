import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import ConversationSummary from './conversationSummary.model.js';

describe('ConversationSummary Model', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Encryption and Decryption (Getters/Setters)', () => {
    it('should encrypt the summary and context when saving, and decrypt when retrieving', () => {
      const plainSummary = 'This is a highly confidential conversation summary.';
      const plainContext = 'User is seeking financial advice.';

      const doc = new ConversationSummary({
        conversationId: 'conv-123',
        userId: 'user-456',
        workspaceId: 'workspace-123',
        summary: plainSummary,
        context: plainContext,
        messageRange: {
          startIndex: 0,
          endIndex: 10,
          totalMessages: 11,
        },
        tokenCount: 150,
      });

      // Check that the underlying stored values are encrypted
      expect(doc._doc.summary).not.toBe(plainSummary);
      expect(doc._doc.summary).toContain(':');
      expect(doc._doc.summary.split(':')[0]).toHaveLength(32); // IV length in hex (16 bytes * 2)

      expect(doc._doc.context).not.toBe(plainContext);
      expect(doc._doc.context).toContain(':');
      expect(doc._doc.context.split(':')[0]).toHaveLength(32);

      // Check that accessing the properties decrypts them automatically
      expect(doc.summary).toBe(plainSummary);
      expect(doc.context).toBe(plainContext);
    });

    it('should not double-encrypt if the text already looks encrypted', () => {
      const fakeEncryptedText = '12345678901234567890123456789012:abcdef';
      const doc = new ConversationSummary({
        conversationId: 'conv-123',
        userId: 'user-456',
        workspaceId: 'workspace-123',
        summary: fakeEncryptedText,
        messageRange: { startIndex: 0, endIndex: 1, totalMessages: 2 },
        tokenCount: 50,
      });

      expect(doc._doc.summary).toBe(fakeEncryptedText);
    });

    it('should return the original value if input is not a string', () => {
      const schema = ConversationSummary.schema;
      const summarySetter = schema.path('summary').options.set;
      const summaryGetter = schema.path('summary').options.get;

      expect(summarySetter(null)).toBeNull();
      expect(summarySetter(undefined)).toBeUndefined();
      expect(summarySetter(12345)).toBe(12345);

      expect(summaryGetter(null)).toBeNull();
      expect(summaryGetter(undefined)).toBeUndefined();
      expect(summaryGetter(12345)).toBe(12345);
    });

    it('should return the original text if decryption fails or format is invalid', () => {
      const schema = ConversationSummary.schema;
      const summaryGetter = schema.path('summary').options.get;

      // Invalid format (no colon)
      expect(summaryGetter('notencrypted')).toBe('notencrypted');

      // Invalid format (colon but wrong IV length)
      expect(summaryGetter('shortiv:encrypted')).toBe('shortiv:encrypted');

      // Valid format but invalid hex/decryption failure
      expect(summaryGetter('12345678901234567890123456789012:invalidhex')).toBe('12345678901234567890123456789012:invalidhex');
    });
  });

  describe('Schema Validation and Context Boundaries', () => {
    it('should validate a correct document successfully', () => {
      const doc = new ConversationSummary({
        conversationId: 'conv-123',
        userId: 'user-456',
        workspaceId: 'workspace-123',
        summary: 'Valid summary',
        messageRange: {
          startIndex: 0,
          endIndex: 5,
          totalMessages: 6,
        },
        tokenCount: 100,
      });

      const err = doc.validateSync();
      expect(err).toBeUndefined();
      expect(doc.status).toBe('active'); // Default value
      expect(doc.context).toBe(''); // Default value
      expect(doc.metadata.summaryVersion).toBe('1.0'); // Default value
    });

    it('should fail validation if required fields are missing', () => {
      const doc = new ConversationSummary({});
      const err = doc.validateSync();

      expect(err).toBeDefined();
      expect(err.errors.conversationId).toBeDefined();
      expect(err.errors.userId).toBeDefined();
      expect(err.errors.summary).toBeDefined();
      expect(err.errors['messageRange.startIndex']).toBeDefined();
      expect(err.errors['messageRange.endIndex']).toBeDefined();
      expect(err.errors['messageRange.totalMessages']).toBeDefined();
      expect(err.errors.tokenCount).toBeDefined();
    });

    it('should fail validation if status is not in enum', () => {
      const doc = new ConversationSummary({
        conversationId: 'conv-123',
        userId: 'user-456',
        workspaceId: 'workspace-123',
        summary: 'Valid summary',
        messageRange: { startIndex: 0, endIndex: 5, totalMessages: 6 },
        tokenCount: 100,
        status: 'invalid-status',
      });

      const err = doc.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.status).toBeDefined();
    });

    it('should enforce strict context boundaries by requiring both conversationId and userId', () => {
      const docWithoutUser = new ConversationSummary({
        conversationId: 'conv-123',
        workspaceId: 'workspace-123',
        summary: 'Valid summary',
        messageRange: { startIndex: 0, endIndex: 5, totalMessages: 6 },
        tokenCount: 100,
      });
      const errUser = docWithoutUser.validateSync();
      expect(errUser.errors.userId).toBeDefined();

      const docWithoutConv = new ConversationSummary({
        userId: 'user-456',
        workspaceId: 'workspace-123',
        summary: 'Valid summary',
        messageRange: { startIndex: 0, endIndex: 5, totalMessages: 6 },
        tokenCount: 100,
      });
      const errConv = docWithoutConv.validateSync();
      expect(errConv.errors.conversationId).toBeDefined();
    });
  });

  describe('Static Methods', () => {
    it('should find the active conversation summary sorted by newest first', async () => {
      const mockQuery = {
        sort: vi.fn().mockReturnThis(),
      };
      const findOneSpy = vi.spyOn(ConversationSummary, 'findOne').mockReturnValue(mockQuery);

      ConversationSummary.findActiveForConversation('workspace-123', 'conv-123', 'user-456');

      expect(findOneSpy).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        userId: 'user-456',
        status: 'active',
        workspaceId: 'workspace-123',
      });
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should get all conversation summaries sorted by messageRange.startIndex', async () => {
      const mockQuery = {
        sort: vi.fn().mockReturnThis(),
      };
      const findSpy = vi.spyOn(ConversationSummary, 'find').mockReturnValue(mockQuery);

      ConversationSummary.getAllForConversation('workspace-123', 'conv-123', 'user-456');

      expect(findSpy).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        userId: 'user-456',
        workspaceId: 'workspace-123',
      });
      expect(mockQuery.sort).toHaveBeenCalledWith({ 'messageRange.startIndex': 1 });
    });
  });

  describe('Role-Based Access Control Simulation (Context Boundaries)', () => {
    // Since this is a Mongoose model, access control is typically handled in the middleware/controller layer.
    // However, we can verify that the model queries strictly partition data by userId to prevent cross-tenant access.
    it('should strictly partition queries by userId to prevent unauthorized cross-user data access', () => {
      const findSpy = vi.spyOn(ConversationSummary, 'find').mockReturnValue({
        sort: vi.fn().mockReturnThis(),
      });

      const targetUserId = 'user-regular';
      const targetConvId = 'conv-abc';

      ConversationSummary.getAllForConversation('workspace-123', targetConvId, targetUserId);

      // Verify that the query is strictly bound to the requesting user's ID
      const callArgs = findSpy.mock.calls[0][0];
      expect(callArgs.userId).toBe(targetUserId);
      expect(callArgs.userId).not.toBe('user-attacker');
    });
  });
});