import crypto from 'crypto';
import { logger } from './logger.js';
import { RedisClient } from './redis.js';

export const CacheService = {
  /**
   * Wraps an async function (e.g., external API call) with Redis caching.
   * Prevents rate limit exhaustion and improves latency for the "sovereign system".
   * 
   * @param {string} keyPrefix - Namespace for the cache key (e.g. 'apisports', 'coinapi')
   * @param {any} params - Parameters to hash into the cache key (object, string, etc.)
   * @param {Function} fetcher - Async function that returns the fresh data
   * @param {number} ttlSecs - Time-to-live in seconds (default: 300s = 5m)
   * @returns {Promise<any>}
   */
  async getOrSet(keyPrefix, params, fetcher, ttlSecs = 300) {
    if (!RedisClient.isEnabled) {
      return fetcher();
    }

    // Create a deterministic hash of the params for the cache key
    const paramString = typeof params === 'object' 
      ? JSON.stringify(params, Object.keys(params).sort()) 
      : String(params);
      
    const hash = crypto.createHash('sha256').update(paramString).digest('hex');
    const cacheKey = `cache:${keyPrefix}:${hash}`;

    try {
      const cached = await RedisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn(`Cache get error for ${cacheKey}: ${err.message}`);
    }

    // Cache miss, execute fetcher
    const data = await fetcher();

    // Cache the fresh data if it's valid
    if (data !== undefined && data !== null) {
      try {
        await RedisClient.set(cacheKey, JSON.stringify(data), { EX: ttlSecs });
      } catch (err) {
        logger.warn(`Cache set error for ${cacheKey}: ${err.message}`);
      }
    }

    return data;
  }
};

export default CacheService;
