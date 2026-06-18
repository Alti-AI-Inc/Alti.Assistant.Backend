import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { userMemoryService } from './userMemory.service.js';
import UserMemory from './userMemory.model.js';
import { VertexAI } from '@google-cloud/vertexai';
import { logger } from '../../../shared/logger.js';

// Mock dependencies
vi.mock('./userMemory.model.js', () => ({
  default: {
    find: vi.fn(),
    deleteMany: vi.fn(),
    bulkWrite: vi.fn(),
  },
  decryptText: vi.fn().mockImplementation((text) => text),
}));

const mockGenerateContent = vi.fn();
const {
  mockGetGenerativeModel
} = vi.hoisted(() => {
  const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
    generateContent: mockGenerateContent,
  }));

  return {
    mockGetGenerativeModel
  };
});

vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: vi.fn().mockImplementation(function() {
    return {
      getGenerativeModel: mockGetGenerativeModel,
    };
  }),
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-gemini-key',
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('userMemory.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProfileBlock', () => {
    it('should return an empty string if no userId is provided', async () => {
      const result = await userMemoryService.getProfileBlock(null);
      expect(result).toBe('');
      expect(UserMemory.find).not.toHaveBeenCalled();
    });

    it('should return an empty string if no memories are found for the user', async () => {
      UserMemory.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
      const result = await userMemoryService.getProfileBlock('user1');
      expect(result).toBe('');
      expect(UserMemory.find).toHaveBeenCalledWith({ userId: 'user1' });
    });

    it('should return a formatted markdown block of user memories', async () => {
      const memories = [
        { key: 'location', value: 'Berlin', category: 'facts' },
        { key: 'tech_stack', value: 'Node.js, React', category: 'facts' },
        { key: 'writing_style', value: 'formal', category: 'preferences' },
      ];
      UserMemory.find.mockReturnValue({ lean: vi.fn().mockResolvedValue(memories) });

      const result = await userMemoryService.getProfileBlock('user1');

      expect(result).toContain('=== USER PROFILE & PERSISTENT MEMORY ===');
      expect(result).toContain('- Location: Berlin');
      expect(result).toContain('- Tech Stack: Node.js, React');
      expect(result).toContain('- Writing Style: formal');
      expect(result).toContain('========================================');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Compiling profile grounding block for user user1'));
    });

    it('should handle database errors gracefully and return an empty string', async () => {
      const dbError = new Error('Database connection failed');
      UserMemory.find.mockReturnValue({ lean: vi.fn().mockRejectedValue(dbError) });

      const result = await userMemoryService.getProfileBlock('user1');

      expect(result).toBe('');
      expect(logger.error).toHaveBeenCalledWith(
        '[UserMemory] Failed to compile profile block for user user1:',
        dbError
      );
    });
  });

  describe('asyncExtractFacts', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(global, 'setTimeout');
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should not run if userId, prompt, or reply is missing', () => {
      userMemoryService.asyncExtractFacts(null, 'prompt', 'reply');
      userMemoryService.asyncExtractFacts('user1', null, 'reply');
      userMemoryService.asyncExtractFacts('user1', 'prompt', null);

      expect(setTimeout).not.toHaveBeenCalled();
    });

    it('should process upserts and deletes correctly based on Gemini response', async () => {
      const userId = 'user-context-1';
      const existingMemories = [{ key: 'location', value: 'Berlin', category: 'facts' }];
      const geminiResponse = [
        { key: 'location', value: 'Munich', category: 'facts', action: 'upsert' },
        { key: 'company', value: 'Altiorem', category: 'facts', action: 'upsert' },
        { key: 'old_project', value: '', category: 'facts', action: 'delete' },
      ];

      UserMemory.find.mockReturnValue({ lean: vi.fn().mockResolvedValue(existingMemories) });
      mockGenerateContent.mockResolvedValue({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify(geminiResponse) }] } }] },
      });
      UserMemory.deleteMany.mockResolvedValue({ deletedCount: 1 });
      UserMemory.bulkWrite.mockResolvedValue({ upsertedCount: 1, modifiedCount: 1 });

      userMemoryService.asyncExtractFacts(userId, 'I moved to Munich and work at Altiorem', 'Got it.');
      await vi.runAllTimersAsync();

      expect(UserMemory.find).toHaveBeenCalledWith({ userId });
      expect(mockGenerateContent).toHaveBeenCalled();
      
      const generateContentCall = mockGenerateContent.mock.calls[0][0];
      expect(generateContentCall.contents[0].parts[0].text).toContain('EXISTING USER PROFILE & MEMORIES:');
      expect(generateContentCall.contents[0].parts[0].text).toContain('- key: "location", value: "Berlin"');

      expect(UserMemory.deleteMany).toHaveBeenCalledWith({ userId, key: { $in: ['old_project'] } });
      expect(UserMemory.bulkWrite).toHaveBeenCalledWith([
        {
          updateOne: {
            filter: { userId, key: 'location' },
            update: { $set: { value: 'Munich', category: 'facts', confidence: 1.0 } },
            upsert: true,
          },
        },
        {
          updateOne: {
            filter: { userId, key: 'company' },
            update: { $set: { value: 'Altiorem', category: 'facts', confidence: 1.0 } },
            upsert: true,
          },
        },
      ]);

      expect(logger.info).toHaveBeenCalledWith(`[UserMemory] Extracted 3 cognitive memory directives for user ${userId}.`);
      expect(logger.info).toHaveBeenCalledWith('[UserMemory] Successfully redacted 1 memory keys.');
      expect(logger.info).toHaveBeenCalledWith('[UserMemory] Consolidated 1 new facts and updated 1 existing facts.');
    });

    it('should handle empty array response from Gemini', async () => {
      const userId = 'user-context-2';
      UserMemory.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
      mockGenerateContent.mockResolvedValue({
        response: { candidates: [{ content: { parts: [{ text: '[]' }] } }] },
      });

      userMemoryService.asyncExtractFacts(userId, 'Hello there', 'Hi!');
      await vi.runAllTimersAsync();

      expect(UserMemory.find).toHaveBeenCalledWith({ userId });
      expect(mockGenerateContent).toHaveBeenCalled();
      expect(UserMemory.deleteMany).not.toHaveBeenCalled();
      expect(UserMemory.bulkWrite).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('[UserMemory] No updates, deletions, or new facts detected in this turn.');
    });

    it('should handle Gemini API errors gracefully', async () => {
      const userId = 'user-context-3';
      const geminiError = new Error('API limit reached');
      UserMemory.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
      mockGenerateContent.mockRejectedValue(geminiError);

      userMemoryService.asyncExtractFacts(userId, 'prompt', 'reply');
      await vi.runAllTimersAsync();

      expect(logger.error).toHaveBeenCalledWith(`[UserMemory] Gemini fact extraction failed: ${geminiError.message}`);
      expect(UserMemory.deleteMany).not.toHaveBeenCalled();
      expect(UserMemory.bulkWrite).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON from Gemini', async () => {
      const userId = 'user-context-4';
      UserMemory.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
      mockGenerateContent.mockResolvedValue({
        response: { candidates: [{ content: { parts: [{ text: 'not valid json' }] } }] },
      });

      userMemoryService.asyncExtractFacts(userId, 'prompt', 'reply');
      await vi.runAllTimersAsync();

      expect(logger.error).toHaveBeenCalledWith(
        '[UserMemory] Failed to parse extracted facts JSON:',
        expect.any(Error)
      );
      expect(UserMemory.deleteMany).not.toHaveBeenCalled();
      expect(UserMemory.bulkWrite).not.toHaveBeenCalled();
    });

    it('should handle database deletion errors', async () => {
        const userId = 'user-context-5';
        const dbError = new Error('DB delete failed');
        const geminiResponse = [{ key: 'old_project', action: 'delete' }];

        UserMemory.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
        mockGenerateContent.mockResolvedValue({
            response: { candidates: [{ content: { parts: [{ text: JSON.stringify(geminiResponse) }] } }] },
        });
        UserMemory.deleteMany.mockRejectedValue(dbError);

        userMemoryService.asyncExtractFacts(userId, 'prompt', 'reply');
        await vi.runAllTimersAsync();

        expect(UserMemory.deleteMany).toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(`[UserMemory] Failed to delete keys [old_project] from DB:`, dbError);
    });

    it('should handle database bulkWrite errors', async () => {
        const userId = 'user-context-6';
        const dbError = new Error('DB bulkWrite failed');
        const geminiResponse = [{ key: 'location', value: 'Berlin', category: 'facts', action: 'upsert' }];

        UserMemory.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
        mockGenerateContent.mockResolvedValue({
            response: { candidates: [{ content: { parts: [{ text: JSON.stringify(geminiResponse) }] } }] },
        });
        UserMemory.bulkWrite.mockRejectedValue(dbError);

        userMemoryService.asyncExtractFacts(userId, 'prompt', 'reply');
        await vi.runAllTimersAsync();

        expect(UserMemory.bulkWrite).toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(`[UserMemory] Failed to consolidate facts via bulkWrite for user ${userId}:`, dbError);
    });

    it('should correctly construct prompt when user has no existing memories', async () => {
        const userId = 'user-context-7';
        UserMemory.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
        mockGenerateContent.mockResolvedValue({
            response: { candidates: [{ content: { parts: [{ text: '[]' }] } }] },
        });

        userMemoryService.asyncExtractFacts(userId, 'prompt', 'reply');
        await vi.runAllTimersAsync();

        expect(mockGenerateContent).toHaveBeenCalled();
        const generateContentCall = mockGenerateContent.mock.calls[0][0];
        expect(generateContentCall.contents[0].parts[0].text).toContain('EXISTING USER PROFILE & MEMORIES:\nNone');
    });
  });
});