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
 *   business_statistics      300    (5m  — counts shift)
 *   prospect_statistics      300    (5m)
 *   fetch_businesses         300    (5m)
 *   fetch_prospects          300    (5m)
 *   business_events          300    (5m  — real-time signals)
 *   prospect_events          300    (5m)
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
  business_statistics:      300,
  prospect_statistics:      300,
  fetch_businesses:         300,
  fetch_prospects:          300,
  business_events:          300,
  prospect_events:          300,
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

export const ExploriumCache = { withCache, invalidateCache, getCacheStats, resetCacheStats, TTL };
