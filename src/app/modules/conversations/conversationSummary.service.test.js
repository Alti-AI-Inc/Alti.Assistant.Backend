import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import {
  checkAndSummarizeIfNeeded,
  getConversationContext,
  getFormattedContextForLLM,
  conversationSummaryService,
} from './conversationSummary.service.js'; // Import the named exports

// Mock external dependencies
vi.mock('@google/generative-ai');
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key',
  },
}));

// Mock Mongoose models
const mockConversationSummarySave = vi.fn();
const mockConversationSummaryLean = vi.fn().mockReturnThis(); // For .lean() calls
const mockConversationSummary = {
  findActiveForConversation: vi.fn(() => ({
    lean: mockConversationSummaryLean,
  })),
  // Mock the constructor for new ConversationSummary()
  // This mock will return an object that mimics a Mongoose document
  // with a .save() method.
  mockImplementation: vi.fn((data) => ({
    ...data,
    save: mockConversationSummarySave,
  })),
};
// Assign the mockImplementation to the actual ConversationSummary mock
vi.mock('./conversationSummary.model.js', () => ({
  default: vi.fn((data) => mockConversationSummary.mockImplementation(data)),
}));
// Re-assign static methods to the default export after mocking the constructor
// This is a common pattern when mocking Mongoose models with both static and instance methods
const ConversationSummary = (await import('./conversationSummary.model.js')).default;
ConversationSummary.findActiveForConversation = mockConversationSummary.findActiveForConversation;


const mockConversationLean = vi.fn().mockReturnThis(); // For .lean() calls
const mockConversation = {
  findByConversationId: vi.fn(() => ({
    lean: mockConversationLean,
  })),
};
vi.mock('./conversation.model.js', () => ({
  default: mockConversation,
}));

// Mock GoogleGenerativeAI methods
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));
const mockGoogleGenerativeAI = vi.fn(() => ({
  getGenerativeModel: mockGetGenerativeModel,
}));
GoogleGenerativeAI.mockImplementation(mockGoogleGenerativeAI);

describe('conversationSummaryService', () => {
  const userId = 'user123';
  const conversationId = 'conv456';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset specific mock implementations if they were changed in tests
    mockConversationSummarySave.mockResolvedValue(true);
    mockConversationSummary.findActiveForConversation.mockReturnValue({
      lean: mockConversationSummaryLean.mockResolvedValue(null),
    });
    mockConversation.findByConversationId.mockReturnValue({
      lean: mockConversationLean.mockResolvedValue(null),
    });
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => `SUMMARY: Test Summary
CONTEXT: Test Context
TOPICS: topic1, topic2
ENTITIES: entity1, entity2
APPS: app1, app2`,
      },
    });
  });

  describe('estimateTokenCount', () => {
    it('should estimate token count correctly for a short string', () => {
      const text = 'hello world'; // 11 chars
      expect(conversationSummaryService.estimateTokenCount(text)).toBe(3); // ceil(11/4) = 3
    });

    it('should estimate token count correctly for an empty string', () => {
      const text = '';
      expect(conversationSummaryService.estimateTokenCount(text)).toBe(0);
    });

    it('should estimate token count correctly for a longer string', () => {
      const text = 'This is a longer string to test token estimation.'; // 49 chars
      expect(conversationSummaryService.estimateTokenCount(text)).toBe(13); // ceil(49/4) = 13
    });
  });

  describe('calculateConversationTokens', () => {
    it('should calculate total tokens for an array of messages', () => {
      const messages = [
        { role: 'user', content: 'hello' }, // 5 chars -> 2 tokens
        { role: 'assistant', content: 'how are you?' }, // 12 chars -> 3 tokens
        { role: 'user', content: 'I am fine, thank you.' }, // 21 chars -> 6 tokens
      ];
      expect(conversationSummaryService.calculateConversationTokens(messages)).toBe(11); // 2 + 3 + 6
    });

    it('should handle messages with empty content', () => {
      const messages = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: '' },
        { role: 'user', content: 'world' },
      ];
      expect(conversationSummaryService.calculateConversationTokens(messages)).toBe(4); // 2 + 0 + 2
    });

    it('should return 0 for an empty message array', () => {
      const messages = [];
      expect(conversationSummaryService.calculateConversationTokens(messages)).toBe(0);
    });
  });

  describe('generateSummaryWithGemini (internal function)', () => {
    const messages = [
      { role: 'user', content: 'Hi, I need help with my account.' },
      { role: 'assistant', content: 'Sure, what seems to be the problem?' },
    ];

    it('should generate a summary with structured data from Gemini', async () => {
      const result = await conversationSummaryService.__get__('generateSummaryWithGemini')(messages);

      expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('mock-gemini-key');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-2.5-flash' });
      expect(mockGenerateContent).toHaveBeenCalledOnce();
      expect(mockGenerateContent.mock.calls[0][0]).toContain('SUMMARY: [summary text]');
      expect(mockGenerateContent.mock.calls[0][0]).toContain('CONVERSATION:\n[Message 1] USER: Hi, I need help with my account.\n\n[Message 2] ASSISTANT: Sure, what seems to be the problem?');

      expect(result).toEqual({
        summary: 'Test Summary',
        context: 'Test Context',
        keyTopics: ['topic1', 'topic2'],
        entities: ['entity1', 'entity2'],
        detectedApps: ['app1', 'app2'],
      });
    });

    it('should handle Gemini response with missing sections gracefully', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => `SUMMARY: Only summary provided.`,
        },
      });

      const result = await conversationSummaryService.__get__('generateSummaryWithGemini')(messages);
      expect(result).toEqual({
        summary: 'Only summary provided.',
        context: '',
        keyTopics: [],
        entities: [],
        detectedApps: [],
      });
    });

    it('should provide a fallback summary on Gemini API error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API error'));

      const result = await conversationSummaryService.__get__('generateSummaryWithGemini')(messages);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error generating summary with Gemini:', expect.any(Error));
      expect(result).toEqual({
        summary: `Conversation with ${messages.length} messages`,
        context: messages[messages.length - 1].content,
        keyTopics: [],
        entities: [],
        detectedApps: [],
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe('checkAndSummarizeIfNeeded', () => {
    const mockMessages = Array(3000).fill({ role: 'user', content: 'short message' }); // ~3000 * 3 = 9000 tokens
    const longMessages = Array(5000).fill({ role: 'user', content: 'a very long message that will exceed the token limit easily' }); // ~5000 * 12 = 60000 tokens

    it('should return null if conversation is not found', async () => {
      mockConversationLean.mockResolvedValueOnce(null);
      const result = await checkAndSummarizeIfNeeded(conversationId, userId);
      expect(result).toBeNull();
      expect(mockConversation.findByConversationId).toHaveBeenCalledWith(conversationId, userId);
    });

    it('should return null if conversation has no messages', async () => {
      mockConversationLean.mockResolvedValueOnce({ messages: [] });
      const result = await checkAndSummarizeIfNeeded(conversationId, userId);
      expect(result).toBeNull();
    });

    it('should return null if total tokens are below the threshold (12000)', async () => {
      mockConversationLean.mockResolvedValueOnce({ messages: mockMessages }); // 9000 tokens
      const result = await checkAndSummarizeIfNeeded(conversationId, userId);
      expect(result).toBeNull();
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return existing active summary if it is up-to-date', async () => {
      const existingSummary = {
        conversationId,
        userId,
        summary: 'Existing summary',
        messageRange: { startIndex: 0, endIndex: longMessages.length },
        status: 'active',
        save: vi.fn(),
      };
      mockConversationLean.mockResolvedValueOnce({ messages: longMessages });
      mockConversationSummaryLean.mockResolvedValueOnce(existingSummary);

      const result = await checkAndSummarizeIfNeeded(conversationId, userId);
      expect(result).toEqual(existingSummary);
      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(existingSummary.save).not.toHaveBeenCalled();
    });

    it('should generate a new summary if tokens exceed threshold and no active summary exists', async () => {
      mockConversationLean.mockResolvedValueOnce({ messages: longMessages }); // > 12000 tokens
      mockConversationSummaryLean.mockResolvedValueOnce(null); // No existing summary

      const result = await checkAndSummarizeIfNeeded(conversationId, userId);

      expect(mockGenerateContent).toHaveBeenCalledOnce();
      expect(ConversationSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId,
          userId,
          summary: 'Test Summary',
          context: 'Test Context',
          messageRange: {
            startIndex: 0,
            endIndex: longMessages.length,
            totalMessages: longMessages.length,
          },
          tokenCount: conversationSummaryService.calculateConversationTokens(longMessages),
          metadata: {
            keyTopics: ['topic1', 'topic2'],
            entities: ['entity1', 'entity2'],
            detectedApps: ['app1', 'app2'],
            summaryVersion: '1.0',
          },
          status: 'active',
        })
      );
      expect(mockConversationSummarySave).toHaveBeenCalledOnce();
      expect(result).toHaveProperty('summary', 'Test Summary');
      expect(result).toHaveProperty('status', 'active');
    });

    it('should generate a new summary and supersede an outdated active summary', async () => {
      const outdatedSummary = {
        conversationId,
        userId,
        summary: 'Old summary',
        messageRange: { startIndex: 0, endIndex: longMessages.length - 1 }, // Outdated
        status: 'active',
        save: vi.fn().mockResolvedValue(true),
      };
      mockConversationLean.mockResolvedValueOnce({ messages: longMessages });
      mockConversationSummary.findActiveForConversation.mockReturnValue({
        lean: vi.fn().mockResolvedValue(outdatedSummary), // Return the outdated summary for the first call
      });

      const result = await checkAndSummarizeIfNeeded(conversationId, userId);

      expect(outdatedSummary.status).toBe('superseded');
      expect(outdatedSummary.save).toHaveBeenCalledOnce();
      expect(mockGenerateContent).toHaveBeenCalledOnce();
      expect(ConversationSummary).toHaveBeenCalledOnce(); // New summary created
      expect(mockConversationSummarySave).toHaveBeenCalledOnce(); // New summary saved
      expect(result).toHaveProperty('summary', 'Test Summary');
      expect(result).toHaveProperty('status', 'active');
    });

    it('should handle errors during summarization gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockConversationLean.mockResolvedValueOnce({ messages: longMessages });
      mockConversationSummary.findActiveForConversation.mockReturnValue({
        lean: mockConversationSummaryLean.mockResolvedValue(null),
      });
      mockGenerateContent.mockRejectedValueOnce(new Error('Gemini error during summarization'));

      const result = await checkAndSummarizeIfNeeded(conversationId, userId);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in checkAndSummarizeIfNeeded:', expect.any(Error));
      expect(result).toBeNull();
      expect(mockConversationSummarySave).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getConversationContext', () => {
    const recentMessages = [
      { role: 'user', content: 'msg1', timestamp: new Date() },
      { role: 'assistant', content: 'msg2', timestamp: new Date() },
    ];
    const mockSummary = {
      summary: 'A brief summary',
      context: 'Key context info',
      metadata: {
        keyTopics: ['topicA', 'topicB'],
        entities: ['entityX'],
        detectedApps: ['appY'],
      },
      tokenCount: 1500,
    };
    const mockConversationWithMessages = {
      messages: [
        { role: 'user', content: 'old msg', timestamp: new Date() },
        ...recentMessages,
      ],
    };

    it('should return default context if no summary and no conversation found', async () => {
      mockConversationSummaryLean.mockResolvedValueOnce(null);
      mockConversationLean.mockResolvedValueOnce(null);

      const result = await getConversationContext(conversationId, userId);

      expect(result).toEqual({
        hasSummary: false,
        summary: null,
        context: null,
        keyTopics: [],
        entities: [],
        detectedApps: [],
        recentMessages: [],
        totalTokens: 0,
      });
    });

    it('should return recent messages even if no summary exists', async () => {
      mockConversationSummaryLean.mockResolvedValueOnce(null);
      mockConversationLean.mockResolvedValueOnce(mockConversationWithMessages);

      const result = await getConversationContext(conversationId, userId, 2);

      expect(result).toEqual({
        hasSummary: false,
        summary: null,
        context: null,
        keyTopics: [],
        entities: [],
        detectedApps: [],
        recentMessages: recentMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
        totalTokens: 0,
      });
    });

    it('should return full context with summary and recent messages', async () => {
      mockConversationSummaryLean.mockResolvedValueOnce(mockSummary);
      mockConversationLean.mockResolvedValueOnce(mockConversationWithMessages);

      const result = await getConversationContext(conversationId, userId, 2);

      expect(result).toEqual({
        hasSummary: true,
        summary: mockSummary.summary,
        context: mockSummary.context,
        keyTopics: mockSummary.metadata.keyTopics,
        entities: mockSummary.metadata.entities,
        detectedApps: mockSummary.metadata.detectedApps,
        recentMessages: recentMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
        totalTokens: mockSummary.tokenCount,
      });
    });

    it('should respect recentMessageLimit', async () => {
      mockConversationSummaryLean.mockResolvedValueOnce(mockSummary);
      mockConversationLean.mockResolvedValueOnce(mockConversationWithMessages);

      const result = await getConversationContext(conversationId, userId, 1);
      expect(result.recentMessages).toHaveLength(1);
      expect(result.recentMessages[0].content).toBe('msg2');
    });

    it('should handle errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockConversationSummaryLean.mockRejectedValueOnce(new Error('DB error'));

      const result = await getConversationContext(conversationId, userId);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error getting conversation context:', expect.any(Error));
      expect(result).toEqual({
        hasSummary: false,
        summary: null,
        context: null,
        keyTopics: [],
        entities: [],
        detectedApps: [],
        recentMessages: [],
        totalTokens: 0,
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getFormattedContextForLLM', () => {
    const mockContext = {
      hasSummary: true,
      summary: 'A brief summary for LLM.',
      context: 'Important context for LLM.',
      keyTopics: ['LLM', 'summarization'],
      entities: ['OpenAI', 'Google'],
      detectedApps: ['ChatGPT', 'Gemini'],
      recentMessages: [],
      totalTokens: 100,
    };

    it('should return an empty string if no summary exists', async () => {
      vi.spyOn(conversationSummaryService, 'getConversationContext').mockResolvedValueOnce({ hasSummary: false });
      const result = await getFormattedContextForLLM(conversationId, userId);
      expect(result).toBe('');
    });

    it('should return a fully formatted string when all context fields are present', async () => {
      vi.spyOn(conversationSummaryService, 'getConversationContext').mockResolvedValueOnce(mockContext);
      const result = await getFormattedContextForLLM(conversationId, userId);
      expect(result).toContain('=== CONVERSATION SUMMARY ===');
      expect(result).toContain('Summary: A brief summary for LLM.');
      expect(result).toContain('Context: Important context for LLM.');
      expect(result).toContain('Topics: LLM, summarization');
      expect(result).toContain('Apps Used: ChatGPT, Gemini');
      expect(result).toContain('===========================');
    });

    it('should omit fields that are empty or null', async () => {
      const partialContext = {
        ...mockContext,
        context: null,
        keyTopics: [],
        detectedApps: [],
      };
      vi.spyOn(conversationSummaryService, 'getConversationContext').mockResolvedValueOnce(partialContext);
      const result = await getFormattedContextForLLM(conversationId, userId);
      expect(result).toContain('Summary: A brief summary for LLM.');
      expect(result).not.toContain('Context:');
      expect(result).not.toContain('Topics:');
      expect(result).not.toContain('Apps Used:');
      expect(result).toContain('Entities: OpenAI, Google'); // Entities should still be there
    });
  });
});