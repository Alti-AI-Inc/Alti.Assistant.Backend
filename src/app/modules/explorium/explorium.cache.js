/**
 * explorium.cache.js — Intelligent Caching Layer for Explorium AgentSource
 *
 * Credits are precious. Cache everything at the right TTL.
 *
 * TTL Strategy (seconds):
 *   firmographics            86400  (24h — company facts change rarely)
 *   technographics           86400  (24h)
 *   webstack                 86400  (24h)
 *   company_ratings          43200  (12h)
 *   company_social_media     43200  (12h)
 *   competitive_landscape    43200  (12h)
 *   strategic_insights       43200  (12h)
 *   business_challenges      43200  (12h)
 *   lookalike_companies      86400  (24h — similarity is stable)
 *   company_hierarchy        86400  (24h)
 *   funding_and_acquisitions 21600  (6h  — funding news moves fast)
 *   workforce_trends         21600  (6h)
 *   website_traffic          21600  (6h)
 *   financial_metrics        3600   (1h  — market data)
 *   website_content_changes  1800   (30m — changes frequently)
 *   keyword_search           1800   (30m)
 *   business_intent_topics   900    (15m — Bombora signals are real-time)
 *   match_business           604800 (7d  — IDs are stable)
 *   match_prospect           604800 (7d)
 *   business_statistics      3600   (1h  — counts shift)
 *   prospect_statistics      3600   (1h)
 *   fetch_businesses         3600   (1h)
 *   fetch_prospects          3600   (1h)
 *   business_events          3600   (1h  — real-time signals)
 *   prospect_events          3600   (1h)
 *   professional_profile     86400  (24h)
 *   contacts_information     21600  (6h  — contact data refreshes)
 *   social_media             43200  (12h)
 *   credits_summary          600    (10m)
 *
 * Cache key format: explorium:<type>:<sha256_of_params_first16>
 */

import { createHash } from 'crypto';
import { RedisClient } from '../../../shared/redis.js';
import { logger } from '../../../shared/logger.js';

// ─── TTL registry ─────────────────────────────────────────────────────────────
export const TTL = {
  firmographics:            86400,
  technographics:           86400,
  webstack:                 86400,
  company_ratings:          43200,
  company_social_media:     43200,
  competitive_landscape:    43200,
  strategic_insights:       43200,
  business_challenges:      43200,
  lookalike_companies:      86400,
  company_hierarchy:        86400,
  funding_and_acquisitions: 21600,
  workforce_trends:         21600,
  website_traffic:          21600,
  financial_metrics:        3600,
  website_content_changes:  1800,
  keyword_search:           1800,
  business_intent_topics:   900,
  match_business:           604800,
  match_prospect:           604800,
  business_statistics:      3600,
  prospect_statistics:      3600,
  fetch_businesses:         3600,
  fetch_prospects:          3600,
  business_events:          3600,
  prospect_events:          3600,
  professional_profile:     86400,
  contacts_information:     21600,
  social_media:             43200,
  credits_summary:          600,
  default:                  3600,
};

// ─── In-memory hit/miss tracking ─────────────────────────────────────────────
const _stats = { hits: 0, misses: 0, sets: 0, errors: 0 };

// ─── Key builder ─────────────────────────────────────────────────────────────
function cacheKey(type, params) {
  const hash = createHash('sha256')
    .update(JSON.stringify(params ?? {}))
    .digest('hex')
    .slice(0, 16);
  return `explorium:${type}:${hash}`;
}

/**
 * Cache-aside wrapper for any Explorium service call.
 * Checks cache first, calls fetcher on miss, stores result with correct TTL.
 *
 * @param {string}   type     - Cache type key (determines TTL)
 * @param {*}        params   - Params used to build cache key (JSON-serializable)
 * @param {Function} fetcher  - Async function that returns fresh data
 * @param {number}   [ttl]    - Optional TTL override in seconds
 * @returns {Promise<*>}
 */
export async function withCache(type, params, fetcher, ttl) {
  const key = cacheKey(type, params);
  const ttlSecs = ttl ?? TTL[type] ?? TTL.default;

  // ── Try cache read ──
  try {
    const cached = await RedisClient.get(key);
    if (cached) {
      _stats.hits++;
      logger.debug(`[Explorium Cache] HIT  ${type}`);
      return JSON.parse(cached);
    }
  } catch (err) {
    _stats.errors++;
    logger.warn(`[Explorium Cache] get error: ${err.message}`);
  }

  // ── Cache miss — fetch fresh ──
  _stats.misses++;
  logger.debug(`[Explorium Cache] MISS ${type}`);
  const data = await fetcher();

  // ── Store result ──
  if (data != null) {
    try {
      await RedisClient.set(key, JSON.stringify(data), { EX: ttlSecs });
      _stats.sets++;
    } catch (err) {
      _stats.errors++;
      logger.warn(`[Explorium Cache] set error: ${err.message}`);
    }
  }

  return data;
}

/**
 * Cache-aside wrapper for batch Explorium service calls.
 * Checks cache first in a single mget, calls fetcher on misses, stores results with correct TTL using mset.
 * Preserves the exact input order of paramsList.
 *
 * @param {string}   type        - Cache type key (determines TTL)
 * @param {Array<*>} paramsList  - List of parameter objects, one for each lookup
 * @param {Function} fetcher     - Async function that takes missed params list and returns ordered results array
 * @param {number}   [ttl]       - Optional TTL override in seconds
 * @returns {Promise<Array<*>>}
 */
export async function withCacheBatch(type, paramsList, fetcher, ttl) {
  if (!Array.isArray(paramsList) || paramsList.length === 0) {
    return [];
  }

  const ttlSecs = ttl ?? TTL[type] ?? TTL.default;
  const keys = paramsList.map(params => cacheKey(type, params));
  const results = new Array(paramsList.length);
  const missIndices = [];
  const missParams = [];

  // 1. Try batch cache read
  try {
    const cached = await RedisClient.mget(keys);
    for (let i = 0; i < keys.length; i++) {
      if (cached && cached[i] !== null && cached[i] !== undefined) {
        results[i] = JSON.parse(cached[i]);
        _stats.hits++;
      } else {
        missIndices.push(i);
        missParams.push(paramsList[i]);
        _stats.misses++;
      }
    }
  } catch (err) {
    _stats.errors++;
    logger.warn(`[Explorium Cache] mget error: ${err.message}`);
    // If mget fails, treat all as misses
    for (let i = 0; i < keys.length; i++) {
      missIndices.push(i);
      missParams.push(paramsList[i]);
      _stats.misses++;
    }
  }

  // 2. Resolve misses
  if (missParams.length > 0) {
    logger.debug(`[Explorium Cache] Batch MISS for ${missParams.length} items of type ${type}`);
    try {
      const freshData = await fetcher(missParams);
      
      if (!Array.isArray(freshData)) {
        throw new Error(`Batch fetcher did not return an array. Expected length: ${missParams.length}`);
      }

      const setsToCache = [];
      for (let j = 0; j < missParams.length; j++) {
        const originalIndex = missIndices[j];
        const data = freshData[j];
        results[originalIndex] = data;

        if (data !== null && data !== undefined) {
          setsToCache.push([keys[originalIndex], JSON.stringify(data)]);
        }
      }

      if (setsToCache.length > 0) {
        try {
          await RedisClient.mset(setsToCache, ttlSecs);
          _stats.sets += setsToCache.length;
        } catch (err) {
          _stats.errors++;
          logger.warn(`[Explorium Cache] mset error: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error(`[Explorium Cache] Batch fetcher error: ${err.message}`);
      // On fetcher error, make sure we return null or handle gracefully for missed items
      for (let j = 0; j < missParams.length; j++) {
        const originalIndex = missIndices[j];
        results[originalIndex] = null;
      }
    }
  }

  return results;
}


/**
 * Invalidate a single cached entry.
 * Call this after write operations (enrollments, webhook updates, etc.)
 */
export async function invalidateCache(type, params) {
  const key = cacheKey(type, params);
  try {
    await RedisClient.del(key);
    logger.debug(`[Explorium Cache] INVALIDATED ${key}`);
  } catch (err) {
    logger.warn(`[Explorium Cache] del error: ${err.message}`);
  }
}

/** Current cache stats with hit rate. */
export function getCacheStats() {
  const total = _stats.hits + _stats.misses;
  return {
    ..._stats,
    hit_rate: total > 0 ? `${((_stats.hits / total) * 100).toFixed(1)}%` : 'N/A',
    total_requests: total,
  };
}

/** Reset stats (for testing). */
export function resetCacheStats() {
  Object.assign(_stats, { hits: 0, misses: 0, sets: 0, errors: 0 });
}

export const ExploriumCache = { withCache, withCacheBatch, invalidateCache, getCacheStats, resetCacheStats, TTL };
