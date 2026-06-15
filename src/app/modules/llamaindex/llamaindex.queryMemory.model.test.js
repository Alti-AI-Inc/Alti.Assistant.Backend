import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import QueryMemory from './llamaindex.queryMemory.model.js';

describe('QueryMemory Mongoose Model', () => {
  let validQueryMemoryData;

  beforeEach(() => {
    validQueryMemoryData = {
      tenantId: 'tenant-abc-123',
      userId: 'user-def-456',
      query: 'What is the capital of France?',
      answer: 'The capital of France is Paris.',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Expires in 30 days
    };
  });

  it('should create a valid QueryMemory document with all required fields', () => {
    const queryMemory = new QueryMemory(validQueryMemoryData);
    const validationError = queryMemory.validateSync();
    expect(validationError).toBeUndefined();
    expect(queryMemory.tenantId).toBe(validQueryMemoryData.tenantId);
    expect(queryMemory.userId).toBe(validQueryMemoryData.userId);
    expect(queryMemory.query).toBe(validQueryMemoryData.query);
    expect(queryMemory.answer).toBe(validQueryMemoryData.answer);
    expect(queryMemory.expiresAt).toEqual(validQueryMemoryData.expiresAt);
  });

  it.each([
    ['tenantId', 'Path `tenantId` is required.'],
    ['userId', 'Path `userId` is required.'],
    ['query', 'Path `query` is required.'],
    ['answer', 'Path `answer` is required.'],
    ['expiresAt', 'Path `expiresAt` is required.'],
  ])('should fail validation if required field "%s" is missing', (field, expectedMessage) => {
    const invalidData = { ...validQueryMemoryData };
    delete invalidData[field];
    const queryMemory = new QueryMemory(invalidData);
    const validationError = queryMemory.validateSync();
    expect(validationError.errors[field]).toBeDefined();
    expect(validationError.errors[field].message).toBe(expectedMessage);
  });

  it('should apply default values for optional fields', () => {
    const queryMemory = new QueryMemory(validQueryMemoryData);
    expect(queryMemory.engine).toBe('vector');
    expect(queryMemory.topics).toEqual([]);
    expect(queryMemory.queryTokens).toEqual([]);
    expect(queryMemory.confidence).toBe(0.0);
  });

  it('should allow overriding default values', () => {
    const customData = {
      ...validQueryMemoryData,
      engine: 'chat',
      topics: ['geography', 'france'],
      queryTokens: ['what', 'capital', 'france'],
      confidence: 0.98,
    };
    const queryMemory = new QueryMemory(customData);
    const validationError = queryMemory.validateSync();

    expect(validationError).toBeUndefined();
    expect(queryMemory.engine).toBe('chat');
    expect(queryMemory.topics).toEqual(['geography', 'france']);
    expect(queryMemory.queryTokens).toEqual(['what', 'capital', 'france']);
    expect(queryMemory.confidence).toBe(0.98);
  });

  it('should have timestamps enabled in the schema', () => {
    const schemaPaths = Object.keys(QueryMemory.schema.paths);
    expect(schemaPaths).toContain('createdAt');
    expect(schemaPaths).toContain('updatedAt');
    expect(QueryMemory.schema.options.timestamps).toBe(true);
  });

  describe('Schema Indexes', () => {
    let indexes;

    beforeAll(() => {
      indexes = QueryMemory.schema.indexes();
    });

    it('should have a compound index on tenantId, userId, and createdAt for history fetching', () => {
      const expectedIndexKey = { tenantId: 1, userId: 1, createdAt: -1 };
      const hasIndex = indexes.some(
        (indexPair) => JSON.stringify(indexPair[0]) === JSON.stringify(expectedIndexKey)
      );
      expect(hasIndex, 'Index for { tenantId: 1, userId: 1, createdAt: -1 } not found').toBe(true);
    });

    it('should have a compound multikey index on tenantId, userId, and queryTokens for Jaccard pre-filtering', () => {
      const expectedIndexKey = { tenantId: 1, userId: 1, queryTokens: 1 };
      const hasIndex = indexes.some(
        (indexPair) => JSON.stringify(indexPair[0]) === JSON.stringify(expectedIndexKey)
      );
      expect(hasIndex, 'Index for { tenantId: 1, userId: 1, queryTokens: 1 } not found').toBe(true);
    });

    it('should have a compound multikey index on tenantId, userId, and topics for relevance matching', () => {
      const expectedIndexKey = { tenantId: 1, userId: 1, topics: 1 };
      const hasIndex = indexes.some(
        (indexPair) => JSON.stringify(indexPair[0]) === JSON.stringify(expectedIndexKey)
      );
      expect(hasIndex, 'Index for { tenantId: 1, userId: 1, topics: 1 } not found').toBe(true);
    });

    it('should have a TTL index on expiresAt for data retention', () => {
      const expectedIndexKey = { expiresAt: 1 };
      const expectedIndexOptions = { expireAfterSeconds: 0 };
      const hasIndex = indexes.some(
        (indexPair) =>
          JSON.stringify(indexPair[0]) === JSON.stringify(expectedIndexKey) &&
          indexPair[1].expireAfterSeconds === expectedIndexOptions.expireAfterSeconds
      );
      expect(hasIndex, 'TTL Index for { expiresAt: 1 } with expireAfterSeconds: 0 not found').toBe(true);
    });
  });
});