/**
 * sportsDataCache.js — Incremental Sports Data Cache
 *
 * Keeps Redis caches warm for high-priority leagues using the PredictionData.io
 * `since` parameter for delta updates. Instead of full re-fetches, we only pull
 * records that changed since the last successful update — drastically reducing
 * API quota consumption while keeping data fresh.
 *
 * Architecture:
 *   - Stores a "last_updated" Unix timestamp per league+bet_type in Redis
 *   - On each refresh cycle, fetches only records with updated_at > last_updated
 *   - Merges delta records into the existing cached array by market ID
 *   - Tracks all active leagues separately from on-demand queries
 *
 * Usage:
 *   import { warmSportsCache, getSportsCacheStatus } from './sportsDataCache.js';
 *   warmSportsCache(); // call once on server start
 */

import { getMarketsService, getFixturesService, getPlayerPropsService, getFuturesMarketsService } from '../modules/predictiondata/predictiondata.service.js';
import { logger } from '../../shared/logger.js';
import { RedisClient } from '../../shared/redis.js';

// ─── Priority leagues to keep warm ───────────────────────────────────────────
// These are fetched proactively on a timer rather than waiting for a user query.
const PRIORITY_LEAGUES = ['NFL', 'NBA', 'MLB', 'NHL'];
const SECONDARY_LEAGUES = ['NCAAB', 'NCAAF', 'UFC', 'EPL', 'MLS'];

// ─── Refresh intervals (ms) ───────────────────────────────────────────────────
const INTERVALS = {
  LIVE_ODDS:    15_000,   // 15s — live lines during games
  STANDARD_ODDS:60_000,  // 60s — pre-game lines
  PROPS:        90_000,  // 90s — player props
  FUTURES:     300_000,  // 5min — futures/championship odds
  FIXTURES:     60_000,  // 60s — schedules / live scores
};

// Book IDs for warm cache — priority books only
const WARM_BOOKS = '100,200,300,400,250';

// ─── In-memory state (per-process) ───────────────────────────────────────────
const cacheState = {
  lastUpdated: {},   // `${league}:${type}` → Unix epoch seconds
  running: false,
  timers: [],
  startedAt: null,
};

// ─── Redis helpers ────────────────────────────────────────────────────────────
async function rcGet(key) {
  try {
    const v = await RedisClient.get(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}
async function rcSet(key, data, ttlSec) {
  try {
    await RedisClient.set(key, JSON.stringify(data), { EX: ttlSec });
  } catch { /* non-fatal */ }
}
async function rcGetTimestamp(key) {
  try {
    const v = await RedisClient.get(`ts:${key}`);
    return v ? Number(v) : null;
  } catch { return null; }
}
async function rcSetTimestamp(key) {
  const now = Math.floor(Date.now() / 1000);
  try {
    await RedisClient.set(`ts:${key}`, String(now), { EX: 86400 });
  } catch {}
  return now;
}

// ─── Merge delta into existing array by market ID ────────────────────────────
function mergeDeltas(existing = [], deltas = []) {
  if (!deltas.length) return existing;
  const map = new Map(existing.map((m) => [m.id, m]));
  deltas.forEach((m) => { if (m.id) map.set(m.id, m); });
  return Array.from(map.values());
}

// ─── Generic incremental refresh ─────────────────────────────────────────────
async function incrementalRefresh(league, betTypes, cacheKey, ttlSec, isLive = false) {
  try {
    const sinceKey = `${league}:${cacheKey}`;
    const lastTs = (await rcGetTimestamp(sinceKey)) || Math.floor(Date.now() / 1000) - 3600;

    const opts = {
      timedelta: isLive ? 6 : 48,
      isLive,
      since: lastTs,
    };

    const delta = await getMarketsService(league, betTypes, 'FT', WARM_BOOKS, opts);

    if (delta && delta.length > 0) {
      const existing = (await rcGet(`sports:${cacheKey}`)) || [];
      const merged = mergeDeltas(existing, delta);
      await rcSet(`sports:${cacheKey}`, merged, ttlSec);
      logger.info(`[SportsCache] ${league} ${cacheKey}: +${delta.length} delta → ${merged.length} total`);
    }

    await rcSetTimestamp(sinceKey);
  } catch (err) {
    logger.warn(`[SportsCache] ${league} ${cacheKey} refresh failed: ${err.message}`);
  }
}

// ─── Fixtures incremental refresh ────────────────────────────────────────────
async function refreshFixtures(league) {
  try {
    const sinceKey = `${league}:fixtures`;
    const lastTs = await rcGetTimestamp(sinceKey);
    const fixtures = await getFixturesService(league, 72, false, lastTs || undefined);
    if (fixtures && fixtures.length > 0) {
      const existing = (await rcGet(`sports:fixtures:${league}`)) || [];
      const merged = mergeDeltas(existing, fixtures);
      await rcSet(`sports:fixtures:${league}`, merged, 120);
      logger.info(`[SportsCache] ${league} fixtures: +${fixtures.length} delta → ${merged.length} total`);
    }
    await rcSetTimestamp(sinceKey);
  } catch (err) {
    logger.warn(`[SportsCache] ${league} fixtures refresh failed: ${err.message}`);
  }
}

// ─── Props incremental refresh ────────────────────────────────────────────────
async function refreshProps(league) {
  try {
    const cacheKey = `odds:props:${league}`;
    const sinceKey = `${league}:props`;
    const lastTs = (await rcGetTimestamp(sinceKey)) || Math.floor(Date.now() / 1000) - 3600;
    const delta = await getPlayerPropsService(league, '', '100,200,400', false);
    if (delta && delta.length > 0) {
      await rcSet(`sports:${cacheKey}`, delta, 90);
      logger.info(`[SportsCache] ${league} props: ${delta.length} records warmed`);
    }
    await rcSetTimestamp(sinceKey);
  } catch (err) {
    logger.warn(`[SportsCache] ${league} props refresh failed: ${err.message}`);
  }
}

// ─── Futures refresh (full, slow-moving) ─────────────────────────────────────
async function refreshFutures(league) {
  try {
    const futures = await getFuturesMarketsService(league, '100,200,300,400,250');
    if (futures && futures.length > 0) {
      await rcSet(`sports:futures:${league}`, futures, 300);
      logger.info(`[SportsCache] ${league} futures: ${futures.length} records warmed`);
    }
  } catch (err) {
    logger.warn(`[SportsCache] ${league} futures refresh failed: ${err.message}`);
  }
}

// ─── Single league full warm cycle ───────────────────────────────────────────
async function warmLeague(league) {
  const now = Date.now();
  logger.info(`[SportsCache] Warming ${league}...`);

  await Promise.allSettled([
    // Standard pre-game odds
    incrementalRefresh(league, 'moneyline,spread,total', `odds:${league}`, 60, false),
    // Fixtures / live scores
    refreshFixtures(league),
    // Props (priority leagues only)
    PRIORITY_LEAGUES.includes(league) ? refreshProps(league) : Promise.resolve(),
  ]);

  logger.info(`[SportsCache] ${league} warm cycle complete in ${Date.now() - now}ms`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start background cache warming for all priority + secondary leagues.
 * Call once on server startup.
 */
export function warmSportsCache() {
  if (cacheState.running) {
    logger.warn('[SportsCache] Already running, skipping duplicate start');
    return;
  }

  // Check Redis is available
  if (!RedisClient || typeof RedisClient.get !== 'function') {
    logger.warn('[SportsCache] Redis not available, skipping cache warm');
    return;
  }

  // Check API key
  const apiKey = (process.env.PREDICTIONDATA_API_KEY || '').trim();
  if (!apiKey) {
    logger.warn('[SportsCache] PREDICTIONDATA_API_KEY not set, skipping cache warm');
    return;
  }

  cacheState.running = true;
  cacheState.startedAt = new Date().toISOString();

  logger.info(`[SportsCache] Starting background warm for ${PRIORITY_LEAGUES.length + SECONDARY_LEAGUES.length} leagues`);

  // ── Initial warm — stagger to avoid hammering the API ─────────────────────
  const allLeagues = [...PRIORITY_LEAGUES, ...SECONDARY_LEAGUES];
  allLeagues.forEach((league, i) => {
    setTimeout(() => warmLeague(league), i * 800);
  });

  // ── Futures warm — once per 5 minutes ─────────────────────────────────────
  PRIORITY_LEAGUES.forEach((league, i) => {
    setTimeout(async () => {
      await refreshFutures(league);
    }, 5000 + i * 500);
  });

  // ── Recurring standard odds refresh ───────────────────────────────────────
  const standardTimer = setInterval(() => {
    PRIORITY_LEAGUES.forEach((league, i) => {
      setTimeout(() => {
        incrementalRefresh(league, 'moneyline,spread,total', `odds:${league}`, 60, false).catch(() => {});
        refreshFixtures(league).catch(() => {});
      }, i * 400);
    });

    SECONDARY_LEAGUES.forEach((league, i) => {
      setTimeout(() => {
        incrementalRefresh(league, 'moneyline,spread,total', `odds:${league}`, 90, false).catch(() => {});
      }, 2000 + i * 500);
    });
  }, INTERVALS.STANDARD_ODDS);

  // ── Recurring props refresh (priority leagues only) ────────────────────────
  const propsTimer = setInterval(() => {
    PRIORITY_LEAGUES.forEach((league, i) => {
      setTimeout(() => refreshProps(league).catch(() => {}), i * 600);
    });
  }, INTERVALS.PROPS);

  // ── Recurring futures refresh ──────────────────────────────────────────────
  const futuresTimer = setInterval(() => {
    PRIORITY_LEAGUES.forEach((league, i) => {
      setTimeout(() => refreshFutures(league).catch(() => {}), i * 1000);
    });
  }, INTERVALS.FUTURES);

  cacheState.timers = [standardTimer, propsTimer, futuresTimer];

  logger.info('[SportsCache] Background cache warming active ✅');
}

/**
 * Stop background cache warming (for clean shutdown).
 */
export function stopSportsCache() {
  cacheState.timers.forEach((t) => clearInterval(t));
  cacheState.timers = [];
  cacheState.running = false;
  logger.info('[SportsCache] Background warming stopped');
}

/**
 * Get cache status — useful for health check endpoints.
 */
export async function getSportsCacheStatus() {
  const allLeagues = [...PRIORITY_LEAGUES, ...SECONDARY_LEAGUES];
  const status = {};

  for (const league of allLeagues) {
    const oddsTs = await rcGetTimestamp(`${league}:odds:${league}`).catch(() => null);
    const fixturesTs = await rcGetTimestamp(`${league}:fixtures`).catch(() => null);
    const propsTs = await rcGetTimestamp(`${league}:props`).catch(() => null);

    status[league] = {
      odds: oddsTs ? new Date(oddsTs * 1000).toISOString() : null,
      fixtures: fixturesTs ? new Date(fixturesTs * 1000).toISOString() : null,
      props: propsTs ? new Date(propsTs * 1000).toISOString() : null,
    };
  }

  return {
    running: cacheState.running,
    startedAt: cacheState.startedAt,
    leagues: status,
    priorityLeagues: PRIORITY_LEAGUES,
    secondaryLeagues: SECONDARY_LEAGUES,
  };
}

/**
 * Force-refresh a specific league immediately (useful for manual trigger).
 */
export async function forceRefreshLeague(league) {
  logger.info(`[SportsCache] Force refreshing ${league}...`);
  await warmLeague(league);
  await refreshFutures(league);
  return { success: true, league, refreshedAt: new Date().toISOString() };
}

export const sportsDataCache = {
  warmSportsCache,
  stopSportsCache,
  getSportsCacheStatus,
  forceRefreshLeague,
  PRIORITY_LEAGUES,
  SECONDARY_LEAGUES,
};
