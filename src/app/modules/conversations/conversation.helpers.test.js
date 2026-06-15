import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { conversationHelpers } from './conversation.helpers.js';
import ApiError from '../../../errors/ApiError.js';
import Conversation from './conversation.model.js';
import { logger } from '../../../shared/logger.js';
import { withTenantFilter } from '../../helpers/tenantQuery.js';

// Mock external modules
vi.mock('http-status', () => ({ default: { NOT_FOUND: 404, INTERNAL_SERVER_ERROR: 500 } }));
vi.mock('../../../errors/ApiError.js', () => ({
  default: class ApiError extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = true;
    }
  },
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('./conversation.model.js'); // Mocks the entire module, we'll define specific mocks later
vi.mock('../../helpers/tenantQuery.js', () => ({
  withTenantFilter: vi.fn().mockImplementation((req, query) => {
    if (req && req.user && req.user.currentTenantId) {
      return { ...query, tenantId: req.user.currentTenantId };
    }
    return query;
  }),
  withTenantPipeline: vi.fn().mockImplementation((req, pipeline) => {
    if (req && req.user && req.user.currentTenantId) {
      return [{ $match: { tenantId: req.user.currentTenantId } }, ...pipeline];
    }
    return pipeline;
  }),
}));

// Mock Mongoose chainable methods
const mockMongooseQuery = {
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockReturnThis(),
  exec: vi.fn(), // For when a query needs to be executed
};

describe('conversationHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations for Conversation model
    Conversation.findOne.mockReset();
    Conversation.find.mockReset();
    Conversation.countDocuments.mockReset();
    Conversation.aggregate.mockReset();

    // Reset mock implementations for chainable methods
    mockMongooseQuery.sort.mockReturnThis();
    mockMongooseQuery.limit.mockReturnThis();
    mockMongooseQuery.skip.mockReturnThis();
    mockMongooseQuery.select.mockReturnThis();
    mockMongooseQuery.lean.mockReturnThis();
    mockMongooseQuery.exec.mockResolvedValue(null); // Default for exec

    // Default mock for findOne and find to return chainable methods
    Conversation.findOne.mockReturnValue(mockMongooseQuery);
    Conversation.find.mockReturnValue(mockMongooseQuery);
    Conversation.countDocuments.mockResolvedValue(0);
    Conversation.aggregate.mockResolvedValue([]);
  });

  // --- getConversationById ---
  describe('getConversationById', () => {
    const mockConversation = {
      _id: 'mongo_id_1',
      conversationId: 'conv123',
      userId: 'user1',
      title: 'Test Conversation',
      messages: [],
    };

    it('should retrieve a conversation by conversationId', async () => {
      mockMongooseQuery.exec.mockResolvedValue(mockConversation);
      const result = await conversationHelpers.getConversationById('conv123');
      expect(Conversation.findOne).toHaveBeenCalledWith({ conversationId: 'conv123' });
      expect(result).toEqual(mockConversation);
    });

    it('should retrieve a conversation by conversationId and userId', async () => {
      mockMongooseQuery.exec.mockResolvedValue(mockConversation);
      const result = await conversationHelpers.getConversationById('conv123', 'user1');
      expect(Conversation.findOne).toHaveBeenCalledWith({ conversationId: 'conv123', userId: 'user1' });
      expect(result).toEqual(mockConversation);
    });

    it('should retrieve a conversation with tenant filtering', async () => {
      const req = { user: { currentTenantId: 'tenant1' } };
      mockMongooseQuery.exec.mockResolvedValue(mockConversation);
      const result = await conversationHelpers.getConversationById('conv123', 'user1', req);
      expect(withTenantFilter).toHaveBeenCalledWith(req, { conversationId: 'conv123', userId: 'user1' });
      expect(Conversation.findOne).toHaveBeenCalledWith({ conversationId: 'conv123', userId: 'user1', tenantId: 'tenant1' });
      expect(result).toEqual(mockConversation);
    });

    it('should throw ApiError if conversation not found', async () => {
      mockMongooseQuery.exec.mockResolvedValue(null);
      await expect(conversationHelpers.getConversationById('nonexistent')).rejects.toThrow(ApiError);
      await expect(conversationHelpers.getConversationById('nonexistent')).rejects.toHaveProperty('statusCode', httpStatus.NOT_FOUND);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should rethrow generic errors and log them', async () => {
      const mockError = new Error('Database connection failed');
      mockMongooseQuery.exec.mockRejectedValue(mockError);
      await expect(conversationHelpers.getConversationById('conv123')).rejects.toThrow(mockError);
      expect(logger.error).toHaveBeenCalledWith('Error fetching conversation by ID:', mockError);
    });
  });

  // --- getUserConversations ---
  describe('getUserConversations', () => {
    const mockConversations = [
      { conversationId: 'conv1', userId: 'user1', title: 'Conv 1', status: 'active', lastActivity: new Date(), metadata: { category: 'work' } },
      { conversationId: 'conv2', userId: 'user1', title: 'Conv 2', status: 'active', lastActivity: new Date(), metadata: { category: 'personal' } },
    ];

    it('should retrieve conversations for a user with default options', async () => {
      mockMongooseQuery.exec.mockResolvedValue(mockConversations);
      Conversation.countDocuments.mockResolvedValue(mockConversations.length);

      const result = await conversationHelpers.getUserConversations('user1');

      expect(Conversation.find).toHaveBeenCalledWith({ userId: 'user1', status: 'active' });
      expect(mockMongooseQuery.sort).toHaveBeenCalledWith({ lastActivity: -1 });
      expect(mockMongooseQuery.limit).toHaveBeenCalledWith(20);
      expect(mockMongooseQuery.skip).toHaveBeenCalledWith(0);
      expect(mockMongooseQuery.select).toHaveBeenCalledWith('-messages');
      expect(result.conversations).toEqual(mockConversations);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        pages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('should apply pagination options', async () => {
      mockMongooseQuery.exec.mockResolvedValue([mockConversations[0]]);
      Conversation.countDocuments.mockResolvedValue(mockConversations.length);

      const options = { page: 2, limit: 1 };
      const result = await conversationHelpers.getUserConversations('user1', options);

      expect(mockMongooseQuery.limit).toHaveBeenCalledWith(1);
      expect(mockMongooseQuery.skip).toHaveBeenCalledWith(1);
      expect(result.conversations).toEqual([mockConversations[0]]); // Assuming the mock returns the correct slice
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(1);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.hasNext).toBe(false); // 1 + 1 < 2 is false
      expect(result.pagination.hasPrev).toBe(true);
    });

    it('should apply search filter', async () => {
      mockMongooseQuery.exec.mockResolvedValue([mockConversations[0]]);
      Conversation.countDocuments.mockResolvedValue(1);

      const options = { search: 'Conv 1' };
      await conversationHelpers.getUserConversations('user1', options);

      expect(Conversation.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user1',
          status: 'active',
          $or: [
            { title: { $regex: 'Conv 1', $options: 'i' } },
            { 'metadata.tags': { $in: [new RegExp('Conv 1', 'i')] } },
          ],
        })
      );
    });

    it('should apply category filter', async () => {
      mockMongooseQuery.exec.mockResolvedValue([mockConversations[0]]);
      Conversation.countDocuments.mockResolvedValue(1);

      const options = { category: 'work' };
      await conversationHelpers.getUserConversations('user1', options);

      expect(Conversation.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user1',
          status: 'active',
          'metadata.category': 'work',
        })
      );
    });

    it('should apply is_deep_search filter', async () => {
      mockMongooseQuery.exec.mockResolvedValue([mockConversations[0]]);
      Conversation.countDocuments.mockResolvedValue(1);

      const options = { is_deep_search: true };
      await conversationHelpers.getUserConversations('user1', options);

      expect(Conversation.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user1',
          status: 'active',
          is_deep_search: true,
        })
      );
    });

    it('should apply tenant filtering', async () => {
      const req = { user: { currentTenantId: 'tenant1' } };
      mockMongooseQuery.exec.mockResolvedValue(mockConversations);
      Conversation.countDocuments.mockResolvedValue(mockConversations.length);

      await conversationHelpers.getUserConversations('user1', {}, req);

      expect(withTenantFilter).toHaveBeenCalledWith(req, { userId: 'user1', status: 'active' });
      expect(Conversation.find).toHaveBeenCalledWith({ userId: 'user1', status: 'active', tenantId: 'tenant1' });
      expect(Conversation.countDocuments).toHaveBeenCalledWith({ userId: 'user1', status: 'active', tenantId: 'tenant1' });
    });

    it('should throw ApiError on generic error and log it', async () => {
      const mockError = new Error('DB connection lost');
      mockMongooseQuery.exec.mockRejectedValue(mockError);

      await expect(conversationHelpers.getUserConversations('user1')).rejects.toThrow(ApiError);
      await expect(conversationHelpers.getUserConversations('user1')).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error fetching user conversations:', mockError);
    });
  });

  // --- getConversationMessages ---
  describe('getConversationMessages', () => {
    const mockMessages = [
      { id: 'msg1', content: 'Hello', timestamp: new Date('2023-01-01T10:00:00Z') },
      { id: 'msg2', content: 'Hi there', timestamp: new Date('2023-01-01T10:05:00Z') },
      { id: 'msg3', content: 'How are you?', timestamp: new Date('2023-01-01T10:10:00Z') },
      { id: 'msg4', content: 'I am good', timestamp: new Date('2023-01-01T10:15:00Z') },
    ];
    const mockConversationWithMessages = {
      _id: 'mongo_id_1',
      conversationId: 'conv123',
      userId: 'user1',
      title: 'Test Conversation',
      messages: mockMessages,
    };

    it('should retrieve conversation messages with default options', async () => {
      mockMongooseQuery.exec.mockResolvedValue(mockConversationWithMessages);

      const result = await conversationHelpers.getConversationMessages('conv123', 'user1');

      expect(Conversation.findOne).toHaveBeenCalledWith({ conversationId: 'conv123', userId: 'user1' });
      expect(result.conversationId).toBe('conv123');
      expect(result.messages).toEqual(mockMessages); // Should be oldest first
      expect(result.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 4,
        pages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('should apply pagination to messages', async () => {
      mockMongooseQuery.exec.mockResolvedValue(mockConversationWithMessages);

      const options = { page: 2, limit: 2 };
      const result = await conversationHelpers.getConversationMessages('conv123', 'user1', options);

      expect(result.messages).toEqual([mockMessages[2], mockMessages[3]]); // Should be oldest first
      expect(result.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 4,
        pages: 2,
        hasNext: false,
        hasPrev: true,
      });
    });

    it('should filter messages by beforeDate', async () => {
      mockMongooseQuery.exec.mockResolvedValue(mockConversationWithMessages);

      const options = { beforeDate: new Date('2023-01-01T10:10:00Z').toISOString() }; // Messages before 10:10:00Z
      const result = await conversationHelpers.getConversationMessages('conv123', 'user1', options);

      expect(result.messages).toEqual([mockMessages[0], mockMessages[1]]);
      expect(result.pagination.total).toBe(2);
    });

    it('should throw ApiError if conversation not found', async () => {
      mockMongooseQuery.exec.mockResolvedValue(null);
      await expect(conversationHelpers.getConversationMessages('nonexistent', 'user1')).rejects.toThrow(ApiError);
      await expect(conversationHelpers.getConversationMessages('nonexistent', 'user1')).rejects.toHaveProperty('statusCode', httpStatus.NOT_FOUND);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should apply tenant filtering', async () => {
      const req = { user: { currentTenantId: 'tenant1' } };
      mockMongooseQuery.exec.mockResolvedValue(mockConversationWithMessages);

      await conversationHelpers.getConversationMessages('conv123', 'user1', {}, req);

      expect(withTenantFilter).toHaveBeenCalledWith(req, { conversationId: 'conv123', userId: 'user1' });
      expect(Conversation.findOne).toHaveBeenCalledWith({ conversationId: 'conv123', userId: 'user1', tenantId: 'tenant1' });
    });

    it('should rethrow generic errors and log them', async () => {
      const mockError = new Error('DB error');
      mockMongooseQuery.exec.mockRejectedValue(mockError);
      await expect(conversationHelpers.getConversationMessages('conv123', 'user1')).rejects.toThrow(mockError);
      expect(logger.error).toHaveBeenCalledWith('Error fetching conversation messages:', mockError);
    });
  });

  // --- searchConversations ---
  describe('searchConversations', () => {
    const mockSearchResults = [
      { conversationId: 'conv1', title: 'Search Result 1', messages: [{ content: 'found term' }] },
      { conversationId: 'conv2', title: 'Another Result', metadata: { tags: ['found term'] } },
    ];

    it('should search conversations by searchTerm', async () => {
      mockMongooseQuery.lean.mockReturnThis(); // Ensure lean is chained
      mockMongooseQuery.exec.mockResolvedValue(mockSearchResults);

      const result = await conversationHelpers.searchConversations('user1', 'found term');

      expect(Conversation.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user1',
          status: 'active',
          $or: [
            { title: { $regex: 'found term', $options: 'i' } },
            { 'messages.content': { $regex: 'found term', $options: 'i' } },
            { 'metadata.tags': { $in: [new RegExp('found term', 'i')] } },
          ],
        })
      );
      expect(mockMongooseQuery.sort).toHaveBeenCalledWith({ lastActivity: -1 });
      expect(mockMongooseQuery.limit).toHaveBeenCalledWith(10);
      expect(mockMongooseQuery.lean).toHaveBeenCalled();
      expect(result).toEqual(mockSearchResults);
    });

    it('should apply category filter to search', async () => {
      mockMongooseQuery.lean.mockReturnThis();
      mockMongooseQuery.exec.mockResolvedValue([mockSearchResults[0]]);

      const options = { category: 'work' };
      await conversationHelpers.searchConversations('user1', 'term', options);

      expect(Conversation.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user1',
          status: 'active',
          'metadata.category': 'work',
        })
      );
    });

    it('should apply tenant filtering', async () => {
      const req = { user: { currentTenantId: 'tenant1' } };
      mockMongooseQuery.lean.mockReturnThis();
      mockMongooseQuery.exec.mockResolvedValue(mockSearchResults);

      await conversationHelpers.searchConversations('user1', 'term', {}, req);

      expect(withTenantFilter).toHaveBeenCalledWith(req, expect.any(Object));
      expect(Conversation.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user1',
          status: 'active',
          tenantId: 'tenant1',
        })
      );
    });

    it('should throw ApiError on generic error and log it', async () => {
      const mockError = new Error('Search failed');
      mockMongooseQuery.exec.mockRejectedValue(mockError);

      await expect(conversationHelpers.searchConversations('user1', 'term')).rejects.toThrow(ApiError);
      await expect(conversationHelpers.searchConversations('user1', 'term')).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error searching conversations:', mockError);
    });
  });

  // --- getAllSavedConversations ---
  describe('getAllSavedConversations', () => {
    const mockSavedConversations = [
      { conversationId: 'saved1', userId: 'user1', is_saved: true, lastActivity: new Date() },
      { conversationId: 'saved2', userId: 'user1', is_saved: true, lastActivity: new Date() },
    ];

    it('should retrieve all saved conversations for a user with default pagination', async () => {
      mockMongooseQuery.exec.mockResolvedValue(mockSavedConversations);
      Conversation.countDocuments.mockResolvedValue(mockSavedConversations.length);

      const result = await conversationHelpers.getAllSavedConversations('user1');

      expect(Conversation.find).toHaveBeenCalledWith({ userId: 'user1', is_saved: true });
      expect(mockMongooseQuery.sort).toHaveBeenCalledWith({ lastActivity: -1 });
      expect(mockMongooseQuery.limit).toHaveBeenCalledWith(20);
      expect(mockMongooseQuery.skip).toHaveBeenCalledWith(0);
      expect(result.conversations).toEqual(mockSavedConversations);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.pages).toBe(1);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(false);
    });

    it('should apply custom pagination', async () => {
      mockMongooseQuery.exec.mockResolvedValue([mockSavedConversations[0]]);
      Conversation.countDocuments.mockResolvedValue(mockSavedConversations.length);

      const result = await conversationHelpers.getAllSavedConversations('user1', 1, 2); // limit 1, page 2

      expect(mockMongooseQuery.limit).toHaveBeenCalledWith(1);
      expect(mockMongooseQuery.skip).toHaveBeenCalledWith(1);
      expect(result.conversations).toEqual([mockSavedConversations[0]]); // Assuming mock returns correct slice
      expect(result.page).toBe(2);
      expect(result.limit).toBe(1);
      expect(result.total).toBe(2);
      expect(result.pages).toBe(2);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(true);
    });

    it('should apply tenant filtering', async () => {
      const req = { user: { currentTenantId: 'tenant1' } };
      mockMongooseQuery.exec.mockResolvedValue(mockSavedConversations);
      Conversation.countDocuments.mockResolvedValue(mockSavedConversations.length);

      await conversationHelpers.getAllSavedConversations('user1', 20, 1, req);

      expect(withTenantFilter).toHaveBeenCalledWith(req, { userId: 'user1', is_saved: true });
      expect(Conversation.find).toHaveBeenCalledWith({ userId: 'user1', is_saved: true, tenantId: 'tenant1' });
      expect(Conversation.countDocuments).toHaveBeenCalledWith({ userId: 'user1', is_saved: true, tenantId: 'tenant1' });
    });

    it('should throw ApiError on generic error and log it', async () => {
      const mockError = new Error('Saved conversations fetch failed');
      mockMongooseQuery.exec.mockRejectedValue(mockError);

      await expect(conversationHelpers.getAllSavedConversations('user1')).rejects.toThrow(ApiError);
      await expect(conversationHelpers.getAllSavedConversations('user1')).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error fetching all saved conversations:', mockError);
    });
  });

  // --- getConversationStats ---
  describe('getConversationStats', () => {
    it('should retrieve conversation statistics', async () => {
      const mockStats = [
        { _id: 'active', count: 5, totalMessages: 50 },
        { _id: 'archived', count: 2, totalMessages: 10 },
      ];
      Conversation.aggregate.mockResolvedValue(mockStats);

      const result = await conversationHelpers.getConversationStats('user1');

      expect(Conversation.aggregate).toHaveBeenCalledWith([
        { $match: { userId: 'user1' } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalMessages: { $sum: '$messageCount' },
          },
        },
      ]);
      expect(result).toEqual({
        total: 7,
        active: 5,
        archived: 2,
        deleted: 0,
        totalMessages: 60,
      });
    });

    it('should apply tenant filtering to aggregation pipeline', async () => {
      const req = { user: { currentTenantId: 'tenant1' } };
      const mockStats = [{ _id: 'active', count: 3, totalMessages: 30 }];
      Conversation.aggregate.mockResolvedValue(mockStats);

      await conversationHelpers.getConversationStats('user1', req);

      const expectedPipeline = [
        { $match: { tenantId: 'tenant1' } },
        { $match: { userId: 'user1' } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalMessages: { $sum: '$messageCount' },
          },
        },
      ];
      // The withTenantPipeline mock adds the $match at the beginning
      expect(Conversation.aggregate).toHaveBeenCalledWith(expectedPipeline);
    });

    it('should handle empty stats gracefully', async () => {
      Conversation.aggregate.mockResolvedValue([]);
      const result = await conversationHelpers.getConversationStats('user1');
      expect(result).toEqual({
        total: 0,
        active: 0,
        archived: 0,
        deleted: 0,
        totalMessages: 0,
      });
    });

    it('should throw ApiError on generic error and log it', async () => {
      const mockError = new Error('Aggregation failed');
      Conversation.aggregate.mockRejectedValue(mockError);

      await expect(conversationHelpers.getConversationStats('user1')).rejects.toThrow(ApiError);
      await expect(conversationHelpers.getConversationStats('user1')).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error fetching conversation stats:', mockError);
    });
  });

  // --- getConversationsByCategory ---
  describe('getConversationsByCategory', () => {
    const mockCategoryConversations = [
      { conversationId: 'cat1', userId: 'user1', 'metadata.category': 'work', status: 'active', lastActivity: new Date() },
    ];

    it('should retrieve conversations by category', async () => {
      mockMongooseQuery.lean.mockReturnThis();
      mockMongooseQuery.exec.mockResolvedValue(mockCategoryConversations);

      const result = await conversationHelpers.getConversationsByCategory('user1', 'work');

      expect(Conversation.find).toHaveBeenCalledWith({
        userId: 'user1',
        'metadata.category': 'work',
        status: 'active',
      });
      expect(mockMongooseQuery.sort).toHaveBeenCalledWith({ lastActivity: -1 });
      expect(mockMongooseQuery.limit).toHaveBeenCalledWith(20);
      expect(mockMongooseQuery.select).toHaveBeenCalledWith('-messages');
      expect(mockMongooseQuery.lean).toHaveBeenCalled();
      expect(result).toEqual(mockCategoryConversations);
    });

    it('should apply custom options (limit, sortBy, sortOrder)', async () => {
      mockMongooseQuery.lean.mockReturnThis();
      mockMongooseQuery.exec.mockResolvedValue([]);

      const options = { limit: 5, sortBy: 'title', sortOrder: 1 };
      await conversationHelpers.getConversationsByCategory('user1', 'personal', options);

      expect(mockMongooseQuery.limit).toHaveBeenCalledWith(5);
      expect(mockMongooseQuery.sort).toHaveBeenCalledWith({ title: 1 });
    });

    it('should apply tenant filtering', async () => {
      const req = { user: { currentTenantId: 'tenant1' } };
      mockMongooseQuery.lean.mockReturnThis();
      mockMongooseQuery.exec.mockResolvedValue(mockCategoryConversations);

      await conversationHelpers.getConversationsByCategory('user1', 'work', {}, req);

      expect(withTenantFilter).toHaveBeenCalledWith(req, {
        userId: 'user1',
        'metadata.category': 'work',
        status: 'active',
      });
      expect(Conversation.find).toHaveBeenCalledWith({
        userId: 'user1',
        'metadata.category': 'work',
        status: 'active',
        tenantId: 'tenant1',
      });
    });

    it('should throw ApiError on generic error and log it', async () => {
      const mockError = new Error('Category fetch failed');
      mockMongooseQuery.exec.mockRejectedValue(mockError);

      await expect(conversationHelpers.getConversationsByCategory('user1', 'work')).rejects.toThrow(ApiError);
      await expect(conversationHelpers.getConversationsByCategory('user1', 'work')).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error fetching conversations by category:', mockError);
    });
  });

  // --- hasConversationAccess ---
  describe('hasConversationAccess', () => {
    it('should return true if conversation exists and user has access', async () => {
      mockMongooseQuery.select.mockReturnThis();
      mockMongooseQuery.exec.mockResolvedValue({ _id: 'someid' });

      const result = await conversationHelpers.hasConversationAccess('conv123', 'user1');
      expect(Conversation.findOne).toHaveBeenCalledWith({ conversationId: 'conv123', userId: 'user1' });
      expect(mockMongooseQuery.select).toHaveBeenCalledWith('_id');
      expect(result).toBe(true);
    });

    it('should return false if conversation does not exist', async () => {
      mockMongooseQuery.select.mockReturnThis();
      mockMongooseQuery.exec.mockResolvedValue(null);

      const result = await conversationHelpers.hasConversationAccess('nonexistent', 'user1');
      expect(result).toBe(false);
    });

    it('should apply tenant filtering', async () => {
      const req = { user: { currentTenantId: 'tenant1' } };
      mockMongooseQuery.select.mockReturnThis();
      mockMongooseQuery.exec.mockResolvedValue({ _id: 'someid' });

      const result = await conversationHelpers.hasConversationAccess('conv123', 'user1', req);
      expect(withTenantFilter).toHaveBeenCalledWith(req, { conversationId: 'conv123', userId: 'user1' });
      expect(Conversation.findOne).toHaveBeenCalledWith({ conversationId: 'conv123', userId: 'user1', tenantId: 'tenant1' });
      expect(result).toBe(true);
    });

    it('should return false and log error on generic error', async () => {
      const mockError = new Error('DB error');
      mockMongooseQuery.exec.mockRejectedValue(mockError);

      const result = await conversationHelpers.hasConversationAccess('conv123', 'user1');
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Error checking conversation access:', mockError);
    });
  });

  // --- getRecentConversations ---
  describe('getRecentConversations', () => {
    const mockRecentConversations = [
      { conversationId: 'rec1', title: 'Recent 1', lastActivity: new Date(), messageCount: 10 },
      { conversationId: 'rec2', title: 'Recent 2', lastActivity: new Date(), messageCount: 5 },
    ];

    it('should retrieve recent conversations for a user with default limit', async () => {
      mockMongooseQuery.select.mockReturnThis();
      mockMongooseQuery.exec.mockResolvedValue(mockRecentConversations);

      const result = await conversationHelpers.getRecentConversations('user1');

      expect(Conversation.find).toHaveBeenCalledWith({ userId: 'user1', status: 'active' });
      expect(mockMongooseQuery.sort).toHaveBeenCalledWith({ lastActivity: -1 });
      expect(mockMongooseQuery.limit).toHaveBeenCalledWith(5);
      expect(mockMongooseQuery.select).toHaveBeenCalledWith('conversationId title lastActivity messageCount');
      expect(result).toEqual(mockRecentConversations);
    });

    it('should apply custom limit', async () => {
      mockMongooseQuery.select.mockReturnThis();
      mockMongooseQuery.exec.mockResolvedValue([]);

      await conversationHelpers.getRecentConversations('user1', 3);
      expect(mockMongooseQuery.limit).toHaveBeenCalledWith(3);
    });

    it('should apply tenant filtering', async () => {
      const req = { user: { currentTenantId: 'tenant1' } };
      mockMongooseQuery.select.mockReturnThis();
      mockMongooseQuery.exec.mockResolvedValue(mockRecentConversations);

      await conversationHelpers.getRecentConversations('user1', 5, req);

      expect(withTenantFilter).toHaveBeenCalledWith(req, { userId: 'user1', status: 'active' });
      expect(Conversation.find).toHaveBeenCalledWith({ userId: 'user1', status: 'active', tenantId: 'tenant1' });
    });

    it('should throw ApiError on generic error and log it', async () => {
      const mockError = new Error('Recent conversations fetch failed');
      mockMongooseQuery.exec.mockRejectedValue(mockError);

      await expect(conversationHelpers.getRecentConversations('user1')).rejects.toThrow(ApiError);
      await expect(conversationHelpers.getRecentConversations('user1')).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error fetching recent conversations:', mockError);
    });
  });
});