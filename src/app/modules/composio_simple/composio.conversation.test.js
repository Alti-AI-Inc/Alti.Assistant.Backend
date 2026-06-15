import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import xss from 'xss';
import Conversation from '../conversations/conversation.model.js';
import { conversationSummaryService } from '../conversations/conversationSummary.service.js';
import {
  generateConversationId,
  getOrCreateConversation,
  getRecentMessages,
  saveMessage,
  getUserConversations,
  getConversationWithContext,
  conversationService,
} from './composio.conversation.js';

// Mock dependencies
vi.mock('xss', () => ({
  default: vi.fn().mockImplementation((str) => str), // Simple pass-through mock
}));

vi.mock('../conversations/conversation.model.js', () => {
  const ConversationMock = vi.fn().mockImplementation(data => ({
    ...data,
    save: vi.fn().mockResolvedValue({ ...data, _id: 'new-mongo-id' }),
  }));

  ConversationMock.findByConversationId = vi.fn();
  ConversationMock.findOneAndUpdate = vi.fn();
  ConversationMock.countDocuments = vi.fn();

  const findOneChainable = {
    lean: vi.fn(),
  };
  ConversationMock.findOne = vi.fn().mockImplementation(() => findOneChainable);

  const findChainable = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn(),
  };
  ConversationMock.find = vi.fn().mockImplementation(() => findChainable);

  return { default: ConversationMock };
});

vi.mock('../conversations/conversationSummary.service.js', () => ({
  conversationSummaryService: {
    checkAndSummarizeIfNeeded: vi.fn().mockResolvedValue(undefined),
    getConversationContext: vi.fn().mockResolvedValue(null),
  },
}));

describe('Composio Conversation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateConversationId', () => {
    it('should generate a unique conversation ID with the correct format', () => {
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1678886400000);
      const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

      const id = generateConversationId();

      expect(id).toBe('composio-simple-1678886400000-4fzyo82m1');
      expect(id.startsWith('composio-simple-')).toBe(true);

      dateNowSpy.mockRestore();
      mathRandomSpy.mockRestore();
    });
  });

  describe('getOrCreateConversation', () => {
    const userId = 'user-123';
    const conversationId = 'composio-simple-abc';
    const initialMessage = 'Hello, world!';

    it('should return an existing conversation if found', async () => {
      const existingConversation = { conversationId, userId, messages: [] };
      Conversation.findByConversationId.mockResolvedValue(existingConversation);

      const result = await getOrCreateConversation(userId, conversationId, initialMessage);

      expect(Conversation.findByConversationId).toHaveBeenCalledWith(conversationId, userId);
      expect(result).toBe(existingConversation);
      expect(Conversation).not.toHaveBeenCalled(); // Constructor not called
    });

    it('should create a new conversation if conversationId is provided but not found', async () => {
      Conversation.findByConversationId.mockResolvedValue(null);
      const mockSave = vi.fn().mockResolvedValue({});
      Conversation.mockImplementation(data => ({ ...data, save: mockSave }));

      const result = await getOrCreateConversation(userId, conversationId, initialMessage);

      expect(Conversation.findByConversationId).toHaveBeenCalledWith(conversationId, userId);
      expect(xss).toHaveBeenCalledWith(initialMessage);
      expect(Conversation).toHaveBeenCalledWith(expect.objectContaining({
        userId,
        title: initialMessage,
        'metadata.category': 'composio_simple',
      }));
      expect(mockSave).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.conversationId).toMatch(/^composio-simple-/);
    });

    it('should create a new conversation if no conversationId is provided', async () => {
      const mockSave = vi.fn().mockResolvedValue({});
      Conversation.mockImplementation(data => ({ ...data, save: mockSave }));

      const result = await getOrCreateConversation(userId, undefined, initialMessage);

      expect(Conversation.findByConversationId).not.toHaveBeenCalled();
      expect(xss).toHaveBeenCalledWith(initialMessage);
      expect(Conversation).toHaveBeenCalledWith(expect.objectContaining({
        userId,
        title: initialMessage,
      }));
      expect(mockSave).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should truncate the title for long initial messages', async () => {
      const longMessage = 'a'.repeat(100);
      const mockSave = vi.fn().mockResolvedValue({});
      Conversation.mockImplementation(data => ({ ...data, save: mockSave }));

      await getOrCreateConversation(userId, undefined, longMessage);

      expect(Conversation).toHaveBeenCalledWith(expect.objectContaining({
        title: `${'a'.repeat(50)}...`,
      }));
    });
  });

  describe('getRecentMessages', () => {
    const userId = 'user-123';
    const conversationId = 'conv-456';

    it('should retrieve recent messages for a valid conversation', async () => {
      const messages = [
        { role: 'user', content: 'msg1', timestamp: new Date() },
        { role: 'assistant', content: 'msg2', timestamp: new Date() },
      ];
      Conversation.findOne().lean.mockResolvedValue({ messages });

      const result = await getRecentMessages(conversationId, userId, 2);

      expect(Conversation.findOne).toHaveBeenCalledWith(
        { conversationId, userId },
        { messages: { $slice: -2 }, _id: 0 }
      );
      expect(result).toEqual(messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })));
    });

    it('should use a default limit of 5 if not provided', async () => {
      Conversation.findOne().lean.mockResolvedValue({ messages: [] });
      await getRecentMessages(conversationId, userId);
      expect(Conversation.findOne).toHaveBeenCalledWith(
        { conversationId, userId },
        { messages: { $slice: -5 }, _id: 0 }
      );
    });

    it('should return an empty array if conversation is not found', async () => {
      Conversation.findOne().lean.mockResolvedValue(null);
      const result = await getRecentMessages(conversationId, userId);
      expect(result).toEqual([]);
    });

    it('should return an empty array if conversation has no messages', async () => {
      Conversation.findOne().lean.mockResolvedValue({ messages: null });
      const result = await getRecentMessages(conversationId, userId);
      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully and return an empty array', async () => {
      const error = new Error('DB Error');
      Conversation.findOne().lean.mockRejectedValue(error);
      const result = await getRecentMessages(conversationId, userId);
      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalledWith('Error getting recent messages:', error);
    });
  });

  describe('saveMessage', () => {
    const userId = 'user-123';
    const conversationId = 'conv-456';
    const message = { role: 'user', content: 'New message' };

    it('should save a message and update conversation metadata', async () => {
      const updatedConversation = { conversationId, userId, messageCount: 1 };
      Conversation.findOneAndUpdate.mockResolvedValue(updatedConversation);

      const result = await saveMessage(conversationId, userId, message.role, message.content);

      expect(xss).toHaveBeenCalledWith(message.role);
      expect(xss).toHaveBeenCalledWith(message.content);
      expect(Conversation.findOneAndUpdate).toHaveBeenCalledWith(
        { conversationId, userId },
        expect.objectContaining({
          $push: { messages: expect.any(Object) },
          $set: { lastActivity: expect.any(Date) },
          $inc: { messageCount: 1 },
        }),
        { new: true }
      );
      expect(result).toBe(updatedConversation);
    });

    it('should trigger background summarization check', async () => {
      Conversation.findOneAndUpdate.mockResolvedValue({});
      await saveMessage(conversationId, userId, message.role, message.content);
      expect(conversationSummaryService.checkAndSummarizeIfNeeded).toHaveBeenCalledWith(conversationId, userId);
    });

    it('should throw an error if conversation is not found', async () => {
      Conversation.findOneAndUpdate.mockResolvedValue(null);
      await expect(saveMessage(conversationId, userId, message.role, message.content))
        .rejects.toThrow('Conversation not found');
      expect(conversationSummaryService.checkAndSummarizeIfNeeded).not.toHaveBeenCalled();
    });

    it('should re-throw database errors', async () => {
      const dbError = new Error('Database connection failed');
      Conversation.findOneAndUpdate.mockRejectedValue(dbError);
      await expect(saveMessage(conversationId, userId, message.role, message.content))
        .rejects.toThrow(dbError);
      expect(console.error).toHaveBeenCalledWith('Error saving message:', dbError);
    });

    it('should not fail if background summarization throws an error', async () => {
      const summarizationError = new Error('Summarization failed');
      conversationSummaryService.checkAndSummarizeIfNeeded.mockRejectedValue(summarizationError);
      Conversation.findOneAndUpdate.mockResolvedValue({});

      // Use fake timers to ensure the async catch block is processed
      vi.useFakeTimers();
      const savePromise = saveMessage(conversationId, userId, message.role, message.content);
      await vi.runAllTimersAsync();
      await savePromise;
      vi.useRealTimers();

      expect(console.error).toHaveBeenCalledWith('Error in background summarization:', summarizationError);
    });
  });

  describe('getUserConversations', () => {
    const userId = 'user-123';
    const mockConversations = [{ title: 'Conv 1' }, { title: 'Conv 2' }];

    it('should fetch conversations with default pagination and sorting', async () => {
      const findChain = Conversation.find();
      findChain.lean.mockResolvedValue(mockConversations);
      Conversation.countDocuments.mockResolvedValue(2);

      const result = await getUserConversations(userId);

      expect(Conversation.find).toHaveBeenCalledWith({ userId, 'metadata.category': 'composio_simple' });
      expect(findChain.sort).toHaveBeenCalledWith({ lastActivity: -1 });
      expect(findChain.skip).toHaveBeenCalledWith(0);
      expect(findChain.limit).toHaveBeenCalledWith(20);
      expect(Conversation.countDocuments).toHaveBeenCalledWith({ userId, 'metadata.category': 'composio_simple' });
      expect(result).toEqual({
        conversations: mockConversations,
        pagination: { page: 1, limit: 20, total: 2, pages: 1 },
      });
    });

    it('should respect custom pagination and sorting options', async () => {
      const findChain = Conversation.find();
      findChain.lean.mockResolvedValue(mockConversations);
      Conversation.countDocuments.mockResolvedValue(50);
      const options = { page: 2, limit: 10, sortBy: 'title', sortOrder: 1 };

      await getUserConversations(userId, options);

      expect(findChain.sort).toHaveBeenCalledWith({ title: 1 });
      expect(findChain.skip).toHaveBeenCalledWith(10);
      expect(findChain.limit).toHaveBeenCalledWith(10);
    });

    it('should sanitize and use default values for invalid options', async () => {
      const findChain = Conversation.find();
      findChain.lean.mockResolvedValue([]);
      Conversation.countDocuments.mockResolvedValue(0);
      const options = { page: -1, limit: 0, sortBy: 'invalidField', sortOrder: 5 };

      await getUserConversations(userId, options);

      expect(findChain.sort).toHaveBeenCalledWith({ lastActivity: -1 });
      expect(findChain.skip).toHaveBeenCalledWith(0); // (1-1)*1 = 0
      expect(findChain.limit).toHaveBeenCalledWith(1);
    });
  });

  describe('getConversationWithContext', () => {
    const userId = 'user-123';
    const conversationId = 'conv-456';

    it('should delegate to conversationSummaryService to get context', async () => {
      const mockContext = { conversation: {}, summary: 'A summary' };
      conversationSummaryService.getConversationContext.mockResolvedValue(mockContext);

      const result = await getConversationWithContext(conversationId, userId);

      expect(conversationSummaryService.getConversationContext).toHaveBeenCalledWith(conversationId, userId);
      expect(result).toBe(mockContext);
    });

    it('should return null if the service returns null', async () => {
      conversationSummaryService.getConversationContext.mockResolvedValue(null);
      const result = await getConversationWithContext(conversationId, userId);
      expect(result).toBeNull();
    });
  });

  describe('conversationService object', () => {
    it('should export all functions in the service object', () => {
      expect(conversationService).toEqual({
        generateConversationId,
        getOrCreateConversation,
        getRecentMessages,
        saveMessage,
        getUserConversations,
        getConversationWithContext,
      });
    });
  });
});