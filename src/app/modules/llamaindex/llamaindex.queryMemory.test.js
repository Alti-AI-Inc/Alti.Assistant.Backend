import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryMemoryService } from './llamaindex.queryMemory.js';

// Mock external dependencies
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

const mockQueryMemoryModel = {
  find: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  lean: vi.fn(),
  create: vi.fn(),
  countDocuments: vi.fn(),
  aggregate: vi.fn(),
  findOne: vi.fn().mockReturnThis(),
};
vi.mock('./llamaindex.queryMemory.model.js', () => ({
  default: mockQueryMemoryModel,
}));

// Helper to access private functions for direct testing
// In a real scenario, if these were truly private and not exported,
// you might test them indirectly via the public functions that use them.
// For this exercise, we'll assume they are accessible for direct unit testing.
const { tokenize, jaccardSimilarity } = await import('./llamaindex.queryMemory.js');

describe('llamaindex.queryMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tokenize', () => {
    it('should return an empty array for null, undefined, or empty string', () => {
      expect(tokenize(null)).toEqual([]);
      expect(tokenize(undefined)).toEqual([]);
      expect(tokenize('')).toEqual([]);
      expect(tokenize('   ')).toEqual([]);
    });

    it('should convert text to lowercase and remove punctuation', () => {
      expect(tokenize('Hello, World!')).toEqual(['hello', 'world']);
      expect(tokenize('This is a Test.')).toEqual(['test']); // 'this', 'is', 'a' are stopwords or too short
    });

    it('should remove stopwords and words shorter than 3 characters', () => {
      expect(tokenize('The quick brown fox jumps over the lazy dog')).toEqual(['quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog']);
      expect(tokenize('a an the is are')).toEqual([]);
      expect(tokenize('go do me')).toEqual([]);
    });

    it('should handle numbers and mixed alphanumeric strings', () => {
      expect(tokenize('Query 123 for user456')).toEqual(['query', '123', 'user456']);
    });

    it('should handle multiple spaces correctly', () => {
      expect(tokenize('  test   string  ')).toEqual(['test', 'string']);
    });
  });

  describe('jaccardSimilarity', () => {
    it('should return 1 for identical token arrays', () => {
      const tokens = ['apple', 'banana', 'orange'];
      expect(jaccardSimilarity(tokens, tokens)).toBe(1);
    });

    it('should return 0 for completely different token arrays', () => {
      const tokensA = ['apple', 'banana'];
      const tokensB = ['grape', 'kiwi'];
      expect(jaccardSimilarity(tokensA, tokensB)).toBe(0);
    });

    it('should return correct similarity for overlapping token arrays', () => {
      const tokensA = ['apple', 'banana', 'orange'];
      const tokensB = ['banana', 'orange', 'grape'];
      // Intersection: ['banana', 'orange'] (size 2)
      // Union: ['apple', 'banana', 'orange', 'grape'] (size 4)
      expect(jaccardSimilarity(tokensA, tokensB)).toBe(2 / 4); // 0.5
    });

    it('should return 0 if one or both token arrays are empty', () => {
      expect(jaccardSimilarity([], ['apple', 'banana'])).toBe(0);
      expect(jaccardSimilarity(['apple', 'banana'], [])).toBe(0);
      expect(jaccardSimilarity([], [])).toBe(0);
    });

    it('should handle duplicate tokens within an array correctly (sets are used)', () => {
      const tokensA = ['apple', 'banana', 'apple'];
      const tokensB = ['banana', 'orange', 'banana'];
      // SetA: ['apple', 'banana']
      // SetB: ['banana', 'orange']
      // Intersection: ['banana'] (size 1)
      // Union: ['apple', 'banana', 'orange'] (size 3)
      expect(jaccardSimilarity(tokensA, tokensB)).toBe(1 / 3);
    });
  });

  describe('queryMemoryService.recordQuery', () => {
    const userId = 'user123';
    const query = 'What is the capital of France?';
    const answer = 'Paris is the capital of France.';
    const queryTokens = ['capital', 'france']; // from tokenize('What is the capital of France?')

    it('should record a query if no duplicates are found', async () => {
      mockQueryMemoryModel.find.mockReturnThis();
      mockQueryMemoryModel.lean.mockResolvedValueOnce([]); // No recent entries
      mockQueryMemoryModel.create.mockResolvedValueOnce({});

      await queryMemoryService.recordQuery(userId, query, answer);

      expect(mockQueryMemoryModel.find).toHaveBeenCalledWith({ userId });
      expect(mockQueryMemoryModel.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockQueryMemoryModel.limit).toHaveBeenCalledWith(20);
      expect(mockQueryMemoryModel.select).toHaveBeenCalledWith('queryTokens');
      expect(mockQueryMemoryModel.lean).toHaveBeenCalled();
      expect(mockQueryMemoryModel.create).toHaveBeenCalledWith({
        userId,
        query,
        answer: answer.substring(0, 2000),
        engine: 'vector',
        queryTokens,
        confidence: 0.0,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(`QueryMemory: recorded query for user ${userId}`);
    });

    it('should skip recording if answer is too short', async () => {
      await queryMemoryService.recordQuery(userId, query, 'short');
      expect(mockQueryMemoryModel.create).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should skip recording if answer is null or empty', async () => {
      await queryMemoryService.recordQuery(userId, query, null);
      expect(mockQueryMemoryModel.create).not.toHaveBeenCalled();
      await queryMemoryService.recordQuery(userId, query, '');
      expect(mockQueryMemoryModel.create).not.toHaveBeenCalled();
    });

    it('should skip recording if a similar query (Jaccard > 0.85) is found', async () => {
      const similarQueryTokens = ['capital', 'france', 'paris']; // Jaccard with ['capital', 'france'] is 2/3 = 0.66, not > 0.85. Let's make it more similar.
      const verySimilarQueryTokens = ['capital', 'france', 'city']; // Jaccard with ['capital', 'france'] is 2/3 = 0.66
      const exactMatchTokens = ['capital', 'france']; // Jaccard is 1.0

      mockQueryMemoryModel.find.mockReturnThis();
      mockQueryMemoryModel.lean.mockResolvedValueOnce([
        { queryTokens: exactMatchTokens },
      ]); // Simulate a very similar recent entry

      await queryMemoryService.recordQuery(userId, query, answer);

      expect(mockQueryMemoryModel.create).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('QueryMemory: skipping duplicate record'));
    });

    it('should handle errors gracefully and log them', async () => {
      const errorMessage = 'Database error';
      mockQueryMemoryModel.find.mockReturnThis();
      mockQueryMemoryModel.lean.mockRejectedValueOnce(new Error(errorMessage));

      await queryMemoryService.recordQuery(userId, query, answer);

      expect(mockQueryMemoryModel.create).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('QueryMemory.recordQuery failed:', errorMessage);
    });

    it('should cap the stored answer length at 2000 characters', async () => {
      const longAnswer = 'A'.repeat(2500);
      mockQueryMemoryModel.find.mockReturnThis();
      mockQueryMemoryModel.lean.mockResolvedValueOnce([]);
      mockQueryMemoryModel.create.mockResolvedValueOnce({});

      await queryMemoryService.recordQuery(userId, query, longAnswer);

      expect(mockQueryMemoryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          answer: longAnswer.substring(0, 2000),
        })
      );
    });

    it('should use provided engine and confidence', async () => {
      mockQueryMemoryModel.find.mockReturnThis();
      mockQueryMemoryModel.lean.mockResolvedValueOnce([]);
      mockQueryMemoryModel.create.mockResolvedValueOnce({});

      await queryMemoryService.recordQuery(userId, query, answer, 'custom_engine', 0.9);

      expect(mockQueryMemoryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          engine: 'custom_engine',
          confidence: 0.9,
        })
      );
    });
  });

  describe('queryMemoryService.getRelevantHistory', () => {
    const userId = 'user123';
    const currentQuery = 'What is the capital of Germany?';
    const currentTokens = ['capital', 'germany'];

    const mockCandidates = [
      {
        query: 'What is the capital of France?',
        answer: 'Paris.',
        engine: 'vector',
        createdAt: new Date('2023-01-01T10:00:00Z'),
        queryTokens: ['capital', 'france'],
      },
      {
        query: 'Tell me about Germany.',
        answer: 'Germany is a country in Central Europe.',
        engine: 'vector',
        createdAt: new Date('2023-01-01T11:00:00Z'),
        queryTokens: ['tell', 'germany'],
      },
      {
        query: 'Capital of Germany?',
        answer: 'Berlin.',
        engine: 'vector',
        createdAt: new Date('2023-01-01T12:00:00Z'),
        queryTokens: ['capital', 'germany'], // High similarity
      },
      {
        query: 'Completely unrelated query.',
        answer: 'Unrelated answer.',
        engine: 'vector',
        createdAt: new Date('2023-01-01T09:00:00Z'),
        queryTokens: ['completely', 'unrelated', 'query'], // Low similarity
      },
    ];

    it('should return an empty array if currentQuery tokens are empty', async () => {
      const result = await queryMemoryService.getRelevantHistory(userId, 'a an the'); // Only stopwords
      expect(result).toEqual([]);
      expect(mockQueryMemoryModel.find).not.toHaveBeenCalled();
    });

    it('should return an empty array if no candidates are found', async () => {
      mockQueryMemoryModel.find.mockReturnThis();
      mockQueryMemoryModel.lean.mockResolvedValueOnce([]);

      const result = await queryMemoryService.getRelevantHistory(userId, currentQuery);
      expect(result).toEqual([]);
      expect(mockQueryMemoryModel.find).toHaveBeenCalledWith({ userId });
      expect(mockQueryMemoryModel.limit).toHaveBeenCalledWith(100);
    });

    it('should return relevant history sorted by similarity and limited', async () => {
      mockQueryMemoryModel.find.mockReturnThis();
      mockQueryMemoryModel.lean.mockResolvedValueOnce(mockCandidates);

      const result = await queryMemoryService.getRelevantHistory(userId, currentQuery, 2, 0.2);

      expect(result.length).toBe(2);
      expect(result[0].query).toBe('Capital of Germany?'); // Similarity 1.0
      expect(result[0].similarity).toBe(1.0);
      expect(result[1].query).toBe('Tell me about Germany.'); // Similarity 1/3 = 0.33
      expect(result[1].similarity).toBeCloseTo(0.333);
      expect(result.some(entry => entry.query === 'What is the capital of France?')).toBeFalsy(); // Similarity 1/3 = 0.33, but only 2 results
      expect(result.some(entry => entry.query === 'Completely unrelated query.')).toBeFalsy(); // Similarity 0
    });

    it('should respect the minSimilarity threshold', async () => {
      mockQueryMemoryModel.find.mockReturnThis();
      mockQueryMemoryModel.lean.mockResolvedValueOnce(mockCandidates);

      const result = await queryMemoryService.getRelevantHistory(userId, currentQuery, 3, 0.5);

      expect(result.length).toBe(1);
      expect(result[0].query).toBe('Capital of Germany?');
      expect(result[0].similarity).toBe(1.0);
    });

    it('should use tokenize(entry.query) if queryTokens is missing from entry', async () => {
      const candidatesWithoutTokens = [
        {
          query: 'Capital of Germany?',
          answer: 'Berlin.',
          engine: 'vector',
          createdAt: new Date('2023-01-01T12:00:00Z'),
          // queryTokens is missing
        },
      ];
      mockQueryMemoryModel.find.mockReturnThis();
      mockQueryMemoryModel.lean.mockResolvedValueOnce(candidatesWithoutTokens);

      const result = await queryMemoryService.getRelevantHistory(userId, currentQuery, 1, 0.2);
      expect(result.length).toBe(1);
      expect(result[0].query).toBe('Capital of Germany?');
      expect(result[0].similarity).toBe(1.0);
    });

    it('should handle errors gracefully and log them, returning an empty array', async () => {
      const errorMessage = 'DB connection lost';
      mockQueryMemoryModel.find.mockReturnThis();
      mockQueryMemoryModel.lean.mockRejectedValueOnce(new Error(errorMessage));

      const result = await queryMemoryService.getRelevantHistory(userId, currentQuery);
      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith('QueryMemory.getRelevantHistory failed:', errorMessage);
    });
  });

  describe('queryMemoryService.buildMemoryEnrichedQuery', () => {
    const userId = 'user123';
    const currentQuery = 'What is the current weather?';

    it('should return the original query if no relevant history is found', async () => {
      // Mock getRelevantHistory to return an empty array
      vi.spyOn(queryMemoryService, 'getRelevantHistory').mockResolvedValueOnce([]);

      const result = await queryMemoryService.buildMemoryEnrichedQuery(userId, currentQuery);
      expect(result).toBe(currentQuery);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should return an enriched query with relevant history prepended', async () => {
      const mockHistory = [
        {
          query: 'What was the weather yesterday?',
          answer: 'It was sunny and warm.',
          engine: 'vector',
          similarity: 0.75,
          createdAt: new Date(),
        },
        {
          query: 'Is it going to rain tomorrow?',
          answer: 'The forecast predicts light rain.',
          engine: 'vector',
          similarity: 0.6,
          createdAt: new Date(),
        },
      ];
      vi.spyOn(queryMemoryService, 'getRelevantHistory').mockResolvedValueOnce(mockHistory);

      const result = await queryMemoryService.buildMemoryEnrichedQuery(userId, currentQuery);

      expect(result).toContain('[Cross-Session Memory Context]');
      expect(result).toContain('Prior Q1 [vector, similarity: 0.75]:');
      expect(result).toContain('Q: What was the weather yesterday?');
      expect(result).toContain('A: It was sunny and warm.');
      expect(result).toContain('Prior Q2 [vector, similarity: 0.60]:');
      expect(result).toContain('Q: Is it going to rain tomorrow?');
      expect(result).toContain('A: The forecast predicts light rain.');
      expect(result).toContain('Current Query:\nWhat is the current weather?');
      expect(mockLogger.info).toHaveBeenCalledWith(`QueryMemory: enriched query with ${mockHistory.length} prior memory entries`);
    });

    it('should truncate answers in the history block to 400 characters', async () => {
      const longAnswer = 'A'.repeat(500);
      const mockHistory = [
        {
          query: 'Long answer test',
          answer: longAnswer,
          engine: 'vector',
          similarity: 0.9,
          createdAt: new Date(),
        },
      ];
      vi.spyOn(queryMemoryService, 'getRelevantHistory').mockResolvedValueOnce(mockHistory);

      const result = await queryMemoryService.buildMemoryEnrichedQuery(userId, currentQuery);
      expect(result).toContain(`A: ${longAnswer.substring(0, 400)}...`);
    });

    it('should handle errors gracefully and log them, returning the original query', async () => {
      const errorMessage = 'History retrieval failed';
      vi.spyOn(queryMemoryService, 'getRelevantHistory').mockRejectedValueOnce(new Error(errorMessage));

      const result = await queryMemoryService.buildMemoryEnrichedQuery(userId, currentQuery);
      expect(result).toBe(currentQuery);
      expect(mockLogger.error).toHaveBeenCalledWith('QueryMemory.buildMemoryEnrichedQuery failed:', errorMessage);
    });
  });

  describe('queryMemoryService.getMemorySummary', () => {
    const userId = 'user123';

    it('should return a summary for a user with entries', async () => {
      mockQueryMemoryModel.countDocuments.mockResolvedValueOnce(5);
      mockQueryMemoryModel.aggregate.mockResolvedValueOnce([
        { _id: 'vector', count: 3 },
        { _id: 'hybrid', count: 2 },
      ]);
      mockQueryMemoryModel.findOne
        .mockResolvedValueOnce({ createdAt: new Date('2023-01-01'), query: 'Oldest query example' }) // Oldest
        .mockResolvedValueOnce({ createdAt: new Date('2023-01-05'), query: 'Newest query example' }); // Newest

      const summary = await queryMemoryService.getMemorySummary(userId);

      expect(summary).toEqual({
        success: true,
        totalEntries: 5,
        byEngine: [
          { engine: 'vector', count: 3 },
          { engine: 'hybrid', count: 2 },
        ],
        oldestEntry: { createdAt: new Date('2023-01-01'), queryPreview: 'Oldest query example' },
        newestEntry: { createdAt: new Date('2023-01-05'), queryPreview: 'Newest query example' },
      });

      expect(mockQueryMemoryModel.countDocuments).toHaveBeenCalledWith({ userId });
      expect(mockQueryMemoryModel.aggregate).toHaveBeenCalledWith([
        { $match: { userId } },
        { $group: { _id: '$engine', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
      expect(mockQueryMemoryModel.findOne).toHaveBeenCalledTimes(2);
      expect(mockQueryMemoryModel.findOne).toHaveBeenCalledWith({ userId });
      expect(mockQueryMemoryModel.sort).toHaveBeenCalledWith({ createdAt: 1 });
      expect(mockQueryMemoryModel.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockQueryMemoryModel.select).toHaveBeenCalledWith('createdAt query');
    });

    it('should return a summary for a user with no entries', async () => {
      mockQueryMemoryModel.countDocuments.mockResolvedValueOnce(0);
      mockQueryMemoryModel.aggregate.mockResolvedValueOnce([]);
      mockQueryMemoryModel.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const summary = await queryMemoryService.getMemorySummary(userId);

      expect(summary).toEqual({
        success: true,
        totalEntries: 0,
        byEngine: [],
        oldestEntry: null,
        newestEntry: null,
      });
    });

    it('should handle errors gracefully and log them', async () => {
      const errorMessage = 'Summary DB error';
      mockQueryMemoryModel.countDocuments.mockRejectedValueOnce(new Error(errorMessage));

      const summary = await queryMemoryService.getMemorySummary(userId);

      expect(summary).toEqual({
        success: false,
        error: errorMessage,
      });
      expect(mockLogger.error).toHaveBeenCalledWith('QueryMemory.getMemorySummary failed:', errorMessage);
    });

    it('should truncate query previews to 80 characters', async () => {
      const longQuery = 'This is a very long query that should be truncated when displayed in the memory summary preview.';
      mockQueryMemoryModel.countDocuments.mockResolvedValueOnce(1);
      mockQueryMemoryModel.aggregate.mockResolvedValueOnce([]);
      mockQueryMemoryModel.findOne
        .mockResolvedValueOnce({ createdAt: new Date('2023-01-01'), query: longQuery })
        .mockResolvedValueOnce({ createdAt: new Date('2023-01-01'), query: longQuery });

      const summary = await queryMemoryService.getMemorySummary(userId);

      expect(summary.oldestEntry.queryPreview).toBe(longQuery.substring(0, 80));
      expect(summary.newestEntry.queryPreview).toBe(longQuery.substring(0, 80));
    });
  });
});