import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const {
  mockRedisClient,
  mockLogger
} = vi.hoisted(() => {
  // Mock dependencies
  const mockRedisClient = {
    get: vi.fn(),
    set: vi.fn(),
    mget: vi.fn(),
    del: vi.fn(),
    pipeline: vi.fn().mockImplementation(() => ({
      set: vi.fn(),
      exec: vi.fn(),
    })),
  };

  const mockLogger = {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    mockRedisClient,
    mockLogger
  };
});

// Mock the modules that export RedisClient and logger
vi.mock('../../../shared/redis.js', () => ({
  RedisClient: mockRedisClient,
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

// Import the module under test AFTER mocks are set up
import {
  TTL,
  withCache,
  withCacheBatch,
  invalidateCache,
  getCacheStats,
  resetCacheStats,
  ExploriumCache,
} from './explorium.cache.js';

// Helper to generate a consistent hash for testing cacheKey logic
function generateTestHash(params) {
  return createHash('sha256')
    .update(JSON.stringify(params ?? {}))
    .digest('hex')
    .slice(0, 16);
}

describe('explorium.cache', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Reset internal stats before each test
    resetCacheStats();
  });

  // Test TTL values
  it('should export correct TTL values', () => {
    expect(TTL).toBeDefined();
    expect(TTL.firmographics).toBe(86400);
    expect(TTL.financial_metrics).toBe(3600);
    expect(TTL.business_intent_topics).toBe(900);
    expect(TTL.match_business).toBe(604800);
    expect(TTL.credits_summary).toBe(600);
    expect(TTL.default).toBe(3600);
  });

  // Test cacheKey generation logic (indirectly via RedisClient calls)
  describe('cacheKey generation', () => {
    it('should generate a consistent cache key for identical params', async () => {
      const type = 'test_type';
      const params1 = { id: 1, name: 'Test' };
      const params2 = { id: 1, name: 'Test' };
      const expectedKey = `explorium:${type}:${generateTestHash(params1)}`;

      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');
      await withCache(type, params1, vi.fn().mockImplementation(() => Promise.resolve('data')));
      expect(mockRedisClient.get).toHaveBeenCalledWith(expectedKey);
      expect(mockRedisClient.set).toHaveBeenCalledWith(expectedKey, expect.any(String), expect.any(Object));

      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');
      await withCache(type, params2, vi.fn().mockImplementation(() => Promise.resolve('data')));
      expect(mockRedisClient.get).toHaveBeenCalledWith(expectedKey);
    });

    it('should generate different keys for different params', async () => {
      const type = 'test_type';
      const params1 = { id: 1 };
      const params2 = { id: 2 };
      const expectedKey1 = `explorium:${type}:${generateTestHash(params1)}`;
      const expectedKey2 = `explorium:${type}:${generateTestHash(params2)}`;

      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');
      await withCache(type, params1, vi.fn().mockImplementation(() => Promise.resolve('data')));
      expect(mockRedisClient.get).toHaveBeenCalledWith(expectedKey1);

      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');
      await withCache(type, params2, vi.fn().mockImplementation(() => Promise.resolve('data')));
      expect(mockRedisClient.get).toHaveBeenCalledWith(expectedKey2);
      expect(expectedKey1).not.toBe(expectedKey2);
    });

    it('should handle null or undefined params by hashing an empty object', async () => {
      const type = 'test_type';
      const expectedKeyNull = `explorium:${type}:${generateTestHash(null)}`;
      const expectedKeyUndefined = `explorium:${type}:${generateTestHash(undefined)}`;

      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');
      await withCache(type, null, vi.fn().mockImplementation(() => Promise.resolve('data')));
      expect(mockRedisClient.get).toHaveBeenCalledWith(expectedKeyNull);

      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');
      await withCache(type, undefined, vi.fn().mockImplementation(() => Promise.resolve('data')));
      expect(mockRedisClient.get).toHaveBeenCalledWith(expectedKeyUndefined);
      expect(expectedKeyNull).toBe(expectedKeyUndefined);
    });
  });

  describe('withCache', () => {
    const type = 'firmographics';
    const params = { companyId: '123' };
    const key = `explorium:${type}:${generateTestHash(params)}`;
    const freshData = { companyName: 'Test Co' };
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(freshData));

    it('should return cached data on a cache hit', async () => {
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(freshData));

      const result = await withCache(type, params, fetcher);

      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
      expect(fetcher).not.toHaveBeenCalled();
      expect(mockRedisClient.set).not.toHaveBeenCalled();
      expect(result).toEqual(freshData);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 1, misses: 0, sets: 0 }));
      expect(mockLogger.debug).toHaveBeenCalledWith(`[Explorium Cache] HIT  ${type}`);
    });

    it('should call fetcher, store data, and return fresh data on a cache miss', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');

      const result = await withCache(type, params, fetcher);

      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.set).toHaveBeenCalledWith(key, JSON.stringify(freshData), { EX: TTL[type] });
      expect(result).toEqual(freshData);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 1, sets: 1 }));
      expect(mockLogger.debug).toHaveBeenCalledWith(`[Explorium Cache] MISS ${type}`);
    });

    it('should use default TTL if type is not in TTL map', async () => {
      const unknownType = 'unknown_type';
      const unknownKey = `explorium:${unknownType}:${generateTestHash(params)}`;
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');

      await withCache(unknownType, params, fetcher);

      expect(mockRedisClient.set).toHaveBeenCalledWith(unknownKey, JSON.stringify(freshData), { EX: TTL.default });
    });

    it('should use provided TTL override', async () => {
      const customTtl = 100;
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');

      await withCache(type, params, fetcher, customTtl);

      expect(mockRedisClient.set).toHaveBeenCalledWith(key, JSON.stringify(freshData), { EX: customTtl });
    });

    it('should handle Redis get errors gracefully and proceed to fetch', async () => {
      const redisError = new Error('Redis GET failed');
      mockRedisClient.get.mockRejectedValueOnce(redisError);
      mockRedisClient.set.mockResolvedValueOnce('OK');

      const result = await withCache(type, params, fetcher);

      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.set).toHaveBeenCalledWith(key, JSON.stringify(freshData), { EX: TTL[type] });
      expect(result).toEqual(freshData);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 1, sets: 1, errors: 1 }));
      expect(mockLogger.warn).toHaveBeenCalledWith(`[Explorium Cache] get error: ${redisError.message}`);
    });

    it('should handle fetcher errors and return null without caching', async () => {
      const fetcherError = new Error('Fetcher failed');
      fetcher.mockRejectedValueOnce(fetcherError);
      mockRedisClient.get.mockResolvedValueOnce(null);

      const result = await withCache(type, params, fetcher);

      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.set).not.toHaveBeenCalled(); // Should not set if fetcher fails
      expect(result).toBeNull();
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 1, sets: 0, errors: 1 }));
      expect(mockLogger.error).toHaveBeenCalledWith(`[Explorium Cache] Fetcher error for type ${type}: ${fetcherError.message}`);
    });

    it('should handle Redis set errors gracefully', async () => {
      const redisError = new Error('Redis SET failed');
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockRejectedValueOnce(redisError);

      const result = await withCache(type, params, fetcher);

      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.set).toHaveBeenCalledWith(key, JSON.stringify(freshData), { EX: TTL[type] });
      expect(result).toEqual(freshData); // Still returns data even if set fails
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 1, sets: 0, errors: 1 }));
      expect(mockLogger.warn).toHaveBeenCalledWith(`[Explorium Cache] set error: ${redisError.message}`);
    });

    it('should not cache null or undefined data returned by fetcher', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      const nullFetcher = vi.fn().mockImplementation(() => Promise.resolve(null));
      const undefinedFetcher = vi.fn().mockImplementation(() => Promise.resolve(undefined));

      let result = await withCache(type, params, nullFetcher);
      expect(result).toBeNull();
      expect(mockRedisClient.set).not.toHaveBeenCalled();
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 1, sets: 0 }));

      resetCacheStats();
      mockRedisClient.get.mockResolvedValueOnce(null); // Reset get mock for second call
      result = await withCache(type, params, undefinedFetcher);
      expect(result).toBeUndefined();
      expect(mockRedisClient.set).not.toHaveBeenCalled();
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 1, sets: 0 }));
    });
  });

  describe('withCacheBatch', () => {
    const type = 'technographics';
    const paramsList = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const keys = paramsList.map(p => `explorium:${type}:${generateTestHash(p)}`);
    const freshData = [{ tech: 'A' }, { tech: 'B' }, { tech: 'C' }];
    const fetcher = vi.fn().mockImplementation(
      missedParams => Promise.resolve(missedParams.map((p, i) => ({ tech: `Fresh ${p.id}` })))
    );

    it('should return all cached data on a full cache hit', async () => {
      mockRedisClient.mget.mockResolvedValueOnce(freshData.map(d => JSON.stringify(d)));

      const result = await withCacheBatch(type, paramsList, fetcher);

      expect(mockRedisClient.mget).toHaveBeenCalledWith(keys);
      expect(fetcher).not.toHaveBeenCalled();
      expect(mockRedisClient.pipeline().set).not.toHaveBeenCalled();
      expect(mockRedisClient.pipeline().exec).not.toHaveBeenCalled();
      expect(result).toEqual(freshData);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 3, misses: 0, sets: 0 }));
    });

    it('should call fetcher for all items and store on a full cache miss', async () => {
      mockRedisClient.mget.mockResolvedValueOnce([null, null, null]);
      mockRedisClient.pipeline().exec.mockResolvedValueOnce([['OK'], ['OK'], ['OK']]);

      const result = await withCacheBatch(type, paramsList, fetcher);

      expect(mockRedisClient.mget).toHaveBeenCalledWith(keys);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith(paramsList);
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledTimes(3);
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledWith(keys[0], JSON.stringify({ tech: 'Fresh 1' }), { EX: TTL[type] });
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledWith(keys[1], JSON.stringify({ tech: 'Fresh 2' }), { EX: TTL[type] });
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledWith(keys[2], JSON.stringify({ tech: 'Fresh 3' }), { EX: TTL[type] });
      expect(mockRedisClient.pipeline().exec).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ tech: 'Fresh 1' }, { tech: 'Fresh 2' }, { tech: 'Fresh 3' }]);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 3, sets: 3 }));
      expect(mockLogger.debug).toHaveBeenCalledWith(`[Explorium Cache] Batch MISS for 3 items of type ${type}`);
    });

    it('should handle mixed cache hits and misses', async () => {
      const cachedData = { tech: 'Cached 2' };
      mockRedisClient.mget.mockResolvedValueOnce([null, JSON.stringify(cachedData), null]);
      mockRedisClient.pipeline().exec.mockResolvedValueOnce([['OK'], ['OK']]);

      const result = await withCacheBatch(type, paramsList, fetcher);

      expect(mockRedisClient.mget).toHaveBeenCalledWith(keys);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith([{ id: 1 }, { id: 3 }]); // Only missed params
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledWith(keys[0], JSON.stringify({ tech: 'Fresh 1' }), { EX: TTL[type] });
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledWith(keys[2], JSON.stringify({ tech: 'Fresh 3' }), { EX: TTL[type] });
      expect(mockRedisClient.pipeline().exec).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ tech: 'Fresh 1' }, cachedData, { tech: 'Fresh 3' }]);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 1, misses: 2, sets: 2 }));
    });

    it('should use provided TTL override', async () => {
      const customTtl = 100;
      mockRedisClient.mget.mockResolvedValueOnce([null, null, null]);
      mockRedisClient.pipeline().exec.mockResolvedValueOnce([['OK'], ['OK'], ['OK']]);

      await withCacheBatch(type, paramsList, fetcher, customTtl);

      expect(mockRedisClient.pipeline().set).toHaveBeenCalledWith(keys[0], expect.any(String), { EX: customTtl });
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledWith(keys[1], expect.any(String), { EX: customTtl });
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledWith(keys[2], expect.any(String), { EX: customTtl });
    });

    it('should handle Redis mget errors gracefully and treat all as misses', async () => {
      const redisError = new Error('Redis MGET failed');
      mockRedisClient.mget.mockRejectedValueOnce(redisError);
      mockRedisClient.pipeline().exec.mockResolvedValueOnce([['OK'], ['OK'], ['OK']]);

      const result = await withCacheBatch(type, paramsList, fetcher);

      expect(mockRedisClient.mget).toHaveBeenCalledWith(keys);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith(paramsList); // All treated as misses
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledTimes(3);
      expect(result).toEqual([{ tech: 'Fresh 1' }, { tech: 'Fresh 2' }, { tech: 'Fresh 3' }]);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 3, sets: 3, errors: 1 }));
      expect(mockLogger.warn).toHaveBeenCalledWith(`[Explorium Cache] mget error: ${redisError.message}`);
    });

    it('should handle fetcher errors and return null for all missed items', async () => {
      const fetcherError = new Error('Batch fetcher failed');
      fetcher.mockRejectedValueOnce(fetcherError);
      mockRedisClient.mget.mockResolvedValueOnce([null, null, null]);

      const result = await withCacheBatch(type, paramsList, fetcher);

      expect(mockRedisClient.mget).toHaveBeenCalledWith(keys);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.pipeline().set).not.toHaveBeenCalled();
      expect(mockRedisClient.pipeline().exec).not.toHaveBeenCalled();
      expect(result).toEqual([null, null, null]); // All missed items should be null
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 3, sets: 0, errors: 1 }));
      expect(mockLogger.error).toHaveBeenCalledWith(`[Explorium Cache] Batch fetcher error: ${fetcherError.message}`);
    });

    it('should handle fetcher returning non-array and return null for all missed items', async () => {
      fetcher.mockResolvedValueOnce('not an array');
      mockRedisClient.mget.mockResolvedValueOnce([null, null, null]);

      const result = await withCacheBatch(type, paramsList, fetcher);

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.pipeline().set).not.toHaveBeenCalled();
      expect(result).toEqual([null, null, null]);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 3, sets: 0, errors: 1 }));
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Batch fetcher did not return an array'));
    });

    it('should handle fetcher returning array of different length', async () => {
      const partialFreshData = [{ tech: 'Fresh 1' }]; // Only one item for 3 misses
      fetcher.mockResolvedValueOnce(partialFreshData);
      mockRedisClient.mget.mockResolvedValueOnce([null, null, null]);
      mockRedisClient.pipeline().exec.mockResolvedValueOnce([['OK']]);

      const result = await withCacheBatch(type, paramsList, fetcher);

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledTimes(1); // Only for the first item
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledWith(keys[0], JSON.stringify({ tech: 'Fresh 1' }), { EX: TTL[type] });
      expect(result).toEqual([{ tech: 'Fresh 1' }, null, null]); // First item cached, others null
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 3, sets: 1 }));
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Batch fetcher returned 1 items for 3 requests.'));
    });

    it('should handle Redis pipeline exec errors gracefully', async () => {
      const redisError = new Error('Redis Pipeline EXEC failed');
      mockRedisClient.mget.mockResolvedValueOnce([null, null, null]);
      mockRedisClient.pipeline().exec.mockRejectedValueOnce(redisError);

      const result = await withCacheBatch(type, paramsList, fetcher);

      expect(mockRedisClient.mget).toHaveBeenCalledWith(keys);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledTimes(3);
      expect(mockRedisClient.pipeline().exec).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ tech: 'Fresh 1' }, { tech: 'Fresh 2' }, { tech: 'Fresh 3' }]); // Still returns data
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 3, sets: 0, errors: 1 })); // Sets count not incremented
      expect(mockLogger.warn).toHaveBeenCalledWith(`[Explorium Cache] pipeline.exec error: ${redisError.message}`);
    });

    it('should return empty array for empty paramsList', async () => {
      const result = await withCacheBatch(type, [], fetcher);
      expect(result).toEqual([]);
      expect(mockRedisClient.mget).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 0, sets: 0 }));
    });

    it('should return empty array for non-array paramsList', async () => {
      const result = await withCacheBatch(type, null, fetcher);
      expect(result).toEqual([]);
      expect(mockRedisClient.mget).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 0, sets: 0 }));
    });

    it('should not cache null/undefined items returned by fetcher in batch', async () => {
      const mixedFreshData = [{ tech: 'Fresh 1' }, null, { tech: 'Fresh 3' }];
      fetcher.mockResolvedValueOnce(mixedFreshData);
      mockRedisClient.mget.mockResolvedValueOnce([null, null, null]);
      mockRedisClient.pipeline().exec.mockResolvedValueOnce([['OK'], ['OK']]);

      const result = await withCacheBatch(type, paramsList, fetcher);

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledTimes(2); // Only for non-null items
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledWith(keys[0], JSON.stringify(mixedFreshData[0]), { EX: TTL[type] });
      expect(mockRedisClient.pipeline().set).toHaveBeenCalledWith(keys[2], JSON.stringify(mixedFreshData[2]), { EX: TTL[type] });
      expect(result).toEqual(mixedFreshData);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 3, sets: 2 }));
    });
  });

  describe('invalidateCache', () => {
    const type = 'firmographics';
    const params = { companyId: '123' };
    const key = `explorium:${type}:${generateTestHash(params)}`;

    it('should delete the specified key from cache', async () => {
      mockRedisClient.del.mockResolvedValueOnce(1); // 1 indicates key was deleted

      await invalidateCache(type, params);

      expect(mockRedisClient.del).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(`[Explorium Cache] INVALIDATED ${key}`);
    });

    it('should handle Redis del errors gracefully', async () => {
      const redisError = new Error('Redis DEL failed');
      mockRedisClient.del.mockRejectedValueOnce(redisError);

      await invalidateCache(type, params);

      expect(mockRedisClient.del).toHaveBeenCalledWith(key);
      expect(mockLogger.warn).toHaveBeenCalledWith(`[Explorium Cache] del error: ${redisError.message}`);
    });
  });

  describe('Cache Stats', () => {
    it('should correctly track hits, misses, sets, and errors', async () => {
      const type = 'firmographics';
      const params1 = { id: 1 };
      const params2 = { id: 2 };
      const params3 = { id: 3 };
      const fetcher = vi.fn().mockImplementation(() => Promise.resolve({ data: 'fresh' }));

      // Miss -> Set
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');
      await withCache(type, params1, fetcher);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 0, misses: 1, sets: 1, errors: 0, total_requests: 1, hit_rate: '0.0%' }));

      // Hit
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({ data: 'cached' }));
      await withCache(type, params2, fetcher);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 1, misses: 1, sets: 1, errors: 0, total_requests: 2, hit_rate: '50.0%' }));

      // Miss -> Fetcher Error
      mockRedisClient.get.mockResolvedValueOnce(null);
      fetcher.mockRejectedValueOnce(new Error('Fetcher fail'));
      await withCache(type, params3, fetcher);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 1, misses: 2, sets: 1, errors: 1, total_requests: 3, hit_rate: '33.3%' }));

      // Redis get error -> Miss -> Set
      mockRedisClient.get.mockRejectedValueOnce(new Error('Redis get fail'));
      fetcher.mockResolvedValueOnce({ data: 'fresh again' });
      mockRedisClient.set.mockResolvedValueOnce('OK');
      await withCache(type, { id: 4 }, fetcher);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 1, misses: 3, sets: 2, errors: 2, total_requests: 4, hit_rate: '25.0%' }));

      // Redis set error -> Miss
      mockRedisClient.get.mockResolvedValueOnce(null);
      fetcher.mockResolvedValueOnce({ data: 'fresh again 2' });
      mockRedisClient.set.mockRejectedValueOnce(new Error('Redis set fail'));
      await withCache(type, { id: 5 }, fetcher);
      expect(getCacheStats()).toEqual(expect.objectContaining({ hits: 1, misses: 4, sets: 2, errors: 3, total_requests: 5, hit_rate: '20.0%' }));
    });

    it('should reset stats correctly', async () => {
      // Perform some operations to accumulate stats
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({ data: 'cached' }));
      await withCache('firmographics', { id: 1 }, vi.fn());
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');
      await withCache('firmographics', { id: 2 }, vi.fn().mockImplementation(() => Promise.resolve({ data: 'fresh' })));

      expect(getCacheStats().hits).toBe(1);
      expect(getCacheStats().misses).toBe(1);
      expect(getCacheStats().sets).toBe(1);
      expect(getCacheStats().errors).toBe(0);

      resetCacheStats();

      expect(getCacheStats()).toEqual({
        hits: 0,
        misses: 0,
        sets: 0,
        errors: 0,
        total_requests: 0,
        hit_rate: 'N/A',
      });
    });

    it('should calculate hit rate correctly, including N/A for no requests', async () => {
      resetCacheStats();
      expect(getCacheStats().hit_rate).toBe('N/A');

      // 1 hit, 0 miss
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({ data: 'cached' }));
      await withCache('firmographics', { id: 1 }, vi.fn());
      expect(getCacheStats().hit_rate).toBe('100.0%');

      // 1 hit, 1 miss
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');
      await withCache('firmographics', { id: 2 }, vi.fn().mockImplementation(() => Promise.resolve({ data: 'fresh' })));
      expect(getCacheStats().hit_rate).toBe('50.0%');

      // 1 hit, 2 misses
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.set.mockResolvedValueOnce('OK');
      await withCache('firmographics', { id: 3 }, vi.fn().mockImplementation(() => Promise.resolve({ data: 'fresh' })));
      expect(getCacheStats().hit_rate).toBe('33.3%');
    });
  });

  describe('ExploriumCache export', () => {
    it('should export all public functions and TTL via ExploriumCache object', () => {
      expect(ExploriumCache).toBeDefined();
      expect(ExploriumCache.withCache).toBe(withCache);
      expect(ExploriumCache.withCacheBatch).toBe(withCacheBatch);
      expect(ExploriumCache.invalidateCache).toBe(invalidateCache);
      expect(ExploriumCache.getCacheStats).toBe(getCacheStats);
      expect(ExploriumCache.resetCacheStats).toBe(resetCacheStats);
      expect(ExploriumCache.TTL).toBe(TTL);
    });
  });
});