/**
 * predictiondata.service.js — PredictionData.io API Service Layer v2
 *
 * REST client for the PredictionData Markets API.
 * Base URL: https://api.predictiondata.io
 * Stream URL: https://stream.predictiondata.io
 * Auth:     X-API-KEY header
 * Rate:     4 RPS default, monthly quota per plan
 *
 * API Key: env var PREDICTIONDATA_API_KEY
 *
 * Covered endpoints (all of them):
 *   GET  /api/markets          ✅ moneyline, spread, total, player_prop, game_prop, future
 *   GET  /api/players          ✅ reference data by league (list or map)
 *   GET  /api/teams            ✅ reference data by league (list or map)
 *   GET  /api/fixtures         ✅ games with start times, scores, status, clock
 *   GET  /api/seasons          ✅ seasons/tournaments per league
 *   GET  /api/market_summaries ✅ active market slugs for orderbook integration
 *   GET  /api/orderbook        ✅ Polymarket/Kalshi bid-ask depth
 *   POST /api/deeplink         ✅ generate sportsbook bet deeplink URLs
 *   POST /api/sgp              ✅ Same Game Parlay pricing from multiple books
 *   SSE  /v1/markets           ✅ real-time streaming via Server-Sent Events
 */

import dotenv from 'dotenv';
import { logger } from '../../../shared/logger.js';

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL = 'https://api.predictiondata.io';
const STREAM_URL = 'https://stream.predictiondata.io';

const getApiKey = () =>
  (process.env.PREDICTIONDATA_API_KEY || '').replace(/^\uFEFF+/, '').trim();

// ─── Corrected Book IDs (from official spec) ─────────────────────────────────
const BOOK_IDS = {
  FANDUEL:     100,
  DRAFTKINGS:  200,
  CAESARS:     300,
  BETMGM:      400,
  KAMBI:       500,  // BetRivers, Unibet, etc.
  PINNACLE:    250,
  ESPNBET:     700,
  BET365:      365,
  BETWAY:      555,
  BOVADA:      643,
  DRAFTKINGS_PICK6: 201,
  FANATICS:    722,
  FLIFF:       800,
  POINTSBET:   600,
  HARDROCK_IL: 850,
  BARSTOOL_BETONLINE: 613,
  LOWVIG:      617,
  NOVIG:       192,
  POLYMARKET:  193,
  KALSHI:      194,
  SPORTTRADE:  448,
  PRIZEPICKS:  385,
  UNDERDOG_FANTASY: 387,
  UNDERDOG_SPORTSBOOK: 388,
  SLEEPER:     595,
  CIRCA:       150,
  TOONIEBET:   345,
  STAKE:       446,
};

// ─── Core HTTP helper (GET) ───────────────────────────────────────────────────
async function pdFetch(path, params = {}, baseUrl = BASE_URL) {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('[PredictionData] PREDICTIONDATA_API_KEY not set. Real-time sports data unavailable.');
    return null;
  }

  const url = new URL(`${baseUrl}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  logger.info(`[PredictionData] GET ${path} ${url.searchParams.toString()}`);

  const response = await fetch(url.toString(), {
    headers: {
      'X-API-KEY': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`PredictionData API ${response.status}: ${body.slice(0, 200)}`);
  }

  return response.json();
}

// ─── Core HTTP helper (POST) ──────────────────────────────────────────────────
async function pdPost(path, body = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('[PredictionData] PREDICTIONDATA_API_KEY not set.');
    return null;
  }

  logger.info(`[PredictionData] POST ${path}`);

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`PredictionData API POST ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKETS — Core odds feed
// Bet types: moneyline | spread | total | player_prop | game_prop | future
// Periods: FT | 1H | 2H | 1P | 2P | 3P | 1Q | 2Q | 3Q | 4Q | F1 | F3 | F5 |
//          F7 | 1I-9I | 1S | 2S | REG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get markets with full parameter support.
 *
 * @param {string} league        - e.g. 'NFL', 'NBA', 'NHL', 'MLB', 'UFC', 'EPL', 'GOLF'
 * @param {string} betTypes      - comma-separated: 'moneyline,spread,total,player_prop,game_prop,future'
 * @param {string} periods       - comma-separated: 'FT' | '1H' | '1Q' | 'FT,1H' etc.
 * @param {string} bookIds       - comma-separated book IDs
 * @param {Object} opts
 * @param {string}  opts.propTypes    - comma-separated prop type names
 * @param {boolean} opts.isLive       - live markets only (default false)
 * @param {number}  opts.timedelta    - hours window (default 24)
 * @param {boolean} opts.includeAlts  - include alternate lines (default false)
 * @param {number}  opts.since        - Unix epoch seconds — only records after this time
 * @returns {Promise<Array>}
 */
const getMarketsService = async (
  league,
  betTypes = 'moneyline,spread,total',
  periods = 'FT',
  bookIds = '100,200,300,400,250,700',
  opts = {}
) => {
  logger.info(`[PredictionData] Markets: ${league} / ${betTypes} / periods=${periods}`);
  const params = {
    league,
    bet_types: betTypes,
    periods,
    book_ids: bookIds,
  };
  if (opts.propTypes)    params.prop_types   = opts.propTypes;
  if (opts.isLive)       params.is_live      = 'true';
  if (opts.timedelta != null) params.timedelta = opts.timedelta;
  if (opts.includeAlts)  params.include_alts = 'true';
  if (opts.since)        params.since        = opts.since;

  const data = await pdFetch('/api/markets', params);
  return data?.markets || [];
};

/** Live markets only (is_live=true, short timedelta) */
const getLiveMarketsService = async (
  league,
  betTypes = 'moneyline,spread,total',
  bookIds = '100,200,300,400,250,700'
) => {
  return getMarketsService(league, betTypes, 'FT', bookIds, { isLive: true, timedelta: 6 });
};

/**
 * Player props — all player_prop markets for a league.
 * @param {string} league
 * @param {string} propTypes  - specific prop type filter (optional)
 * @param {string} bookIds
 * @param {boolean} isLive
 */
const getPlayerPropsService = async (
  league,
  propTypes = '',
  bookIds = '100,200,400',
  isLive = false
) => {
  logger.info(`[PredictionData] Player Props: ${league} / ${propTypes || 'all'}`);
  return getMarketsService(
    league,
    'player_prop',
    'FT',
    bookIds,
    { propTypes, timedelta: 24, isLive }
  );
};

/**
 * Game props — in-game events (score first, both teams to score, UFC rounds, etc.)
 * Note: ALL UFC and TENNIS markets are game_props.
 * @param {string} league
 * @param {string} propTypes
 * @param {string} bookIds
 */
const getGamePropsService = async (
  league,
  propTypes = '',
  bookIds = '100,200,400'
) => {
  logger.info(`[PredictionData] Game Props: ${league} / ${propTypes || 'all'}`);
  return getMarketsService(league, 'game_prop', 'FT', bookIds, { propTypes, timedelta: 24 });
};

/**
 * Futures markets — championship odds, award odds, etc.
 * NOTE: timedelta must be large (up to 8760 for season-level fixtures)
 * @param {string} league
 * @param {string} bookIds
 * @param {string} propTypes  - specific future type (e.g. 'Super Bowl Winner')
 */
const getFuturesMarketsService = async (
  league,
  bookIds = '100,200,300,400,250',
  propTypes = ''
) => {
  logger.info(`[PredictionData] Futures: ${league}`);
  return getMarketsService(league, 'future', 'FT', bookIds, { propTypes, timedelta: 8760 });
};

/**
 * Half/Quarter markets — 1st half, 1st quarter, etc.
 * @param {string} league
 * @param {string} period   - e.g. '1H', '1Q', '1P'
 * @param {string} bookIds
 */
const getPeriodMarketsService = async (
  league,
  period = '1H',
  bookIds = '100,200,400'
) => {
  logger.info(`[PredictionData] Period Markets: ${league} / ${period}`);
  return getMarketsService(league, 'moneyline,spread,total', period, bookIds, { timedelta: 24 });
};

/**
 * Alt lines — alternate spreads and totals
 * @param {string} league
 * @param {string} bookIds
 */
const getAltLinesService = async (
  league,
  bookIds = '100,200,400'
) => {
  logger.info(`[PredictionData] Alt Lines: ${league}`);
  return getMarketsService(league, 'spread,total', 'FT', bookIds, {
    timedelta: 24,
    includeAlts: true,
  });
};

/**
 * Full market pull — all bet types at once (moneyline + spread + total + props + game_props)
 * Useful for comprehensive odds context injection.
 * @param {string} league
 * @param {string} bookIds
 */
const getFullMarketService = async (
  league,
  bookIds = '100,200,300,400,250,700'
) => {
  logger.info(`[PredictionData] Full Market: ${league}`);
  return getMarketsService(
    league,
    'moneyline,spread,total,player_prop,game_prop',
    'FT',
    bookIds,
    { timedelta: 24, includeAlts: false }
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURES — Game schedule & live scores
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get upcoming and recent fixtures (games).
 * Returns: id, date, home_abbr, away_abbr, home_id, away_id, league,
 *          status, home_score, away_score, current_clock, current_period_text,
 *          current_period_number, finish_type
 * @param {string} leagues    - comma-separated, e.g. 'NFL' or 'NFL,NBA'
 * @param {number} timedelta  - hours window (default 48)
 * @param {boolean} returnMap - return as ID-keyed map
 * @param {number} since      - Unix epoch seconds
 */
const getFixturesService = async (
  leagues,
  timedelta = 48,
  returnMap = false,
  since = undefined
) => {
  logger.info(`[PredictionData] Fixtures: ${leagues}`);
  const params = { leagues, timedelta, return_map: returnMap ? 'true' : 'false' };
  if (since) params.since = since;
  const data = await pdFetch('/api/fixtures', params);
  if (returnMap) return data?.fixtures || {};
  return data?.fixtures || [];
};

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYERS — Reference data
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get players for one or more leagues.
 * Returns: id, full_name, league, position, status, team_id, team_abbr, team_full_name
 * @param {string} leagues  - e.g. 'NBA' or 'NFL,NBA'
 * @param {boolean} returnMap
 * @param {number} since
 */
const getPlayersService = async (leagues, returnMap = true, since = undefined) => {
  logger.info(`[PredictionData] Players: ${leagues}`);
  const params = { leagues, return_map: returnMap ? 'true' : 'false' };
  if (since) params.since = since;
  const data = await pdFetch('/api/players', params);
  return data?.players || (returnMap ? {} : []);
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEAMS — Reference data
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get teams for one or more leagues.
 * Returns: id, abbr, full_name, league
 * @param {string} leagues
 * @param {boolean} returnMap
 * @param {number} since
 */
const getTeamsService = async (leagues, returnMap = true, since = undefined) => {
  logger.info(`[PredictionData] Teams: ${leagues}`);
  const params = { leagues, return_map: returnMap ? 'true' : 'false' };
  if (since) params.since = since;
  const data = await pdFetch('/api/teams', params);
  return data?.teams || (returnMap ? {} : []);
};

// ═══════════════════════════════════════════════════════════════════════════════
// SEASONS — Tournament/season reference
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get seasons/tournaments for a league.
 * Returns: id, name, league, start_date, end_date, is_active, in_progress,
 *          fixture_group, sub_league
 * @param {string} league
 */
const getSeasonsService = async (league) => {
  logger.info(`[PredictionData] Seasons: ${league}`);
  const data = await pdFetch('/api/seasons', { league });
  return Array.isArray(data) ? data : [];
};

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET SUMMARIES — Active market slugs for orderbook
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get active market summaries with slugs for a league.
 * Used to discover market slugs for the orderbook endpoint.
 * Returns: id, slug, fixture_id, league, created_at, entity_id,
 *          period, is_active, bet_type, number, outcome
 * @param {string} league
 */
const getMarketSummariesService = async (league) => {
  logger.info(`[PredictionData] Market Summaries: ${league}`);
  const data = await pdFetch('/api/market_summaries', { league });
  return Array.isArray(data) ? data : [];
};

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERBOOK — Exchange bid/ask depth (Polymarket, Kalshi)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get exchange orderbook for a specific market.
 * Used with Polymarket (193) or Kalshi (194) provider IDs.
 * Returns: id, market_slug, contracts, provider_id, created_at, price, is_ask
 *
 * @param {string} marketSlug  - from market_summaries endpoint
 * @param {number} providerId  - 193 = Polymarket, 194 = Kalshi
 */
const getOrderbookService = async (marketSlug, providerId = 193) => {
  logger.info(`[PredictionData] Orderbook: ${marketSlug} (provider ${providerId})`);
  const data = await pdFetch('/api/orderbook', {
    market_slug: marketSlug,
    provider_id: providerId,
  });
  return Array.isArray(data) ? data : [];
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEEPLINK — Generate sportsbook bet URLs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a sportsbook deeplink URL from provider_deeplink_string fields on markets.
 * Supported sportsbooks: fanduel, draftkings, betmgm, caesars, betrivers, pinnacle,
 *   betway, bovada, tooniebet, bc.game, stake, 888sport, kalshi, polymarket, etc.
 *
 * @param {string} sportsbook       - e.g. 'fanduel', 'draftkings'
 * @param {string[]} deeplinkStrings - array of provider_deeplink_string values from markets
 * @param {string} betType          - 'single' | 'parlay'
 * @param {string} region           - e.g. 'nj', 'pa' (for geo-specific US books)
 * @returns {Promise<{url: string}>}
 */
const buildDeeplinkService = async (
  sportsbook,
  deeplinkStrings,
  betType = 'single',
  region = ''
) => {
  logger.info(`[PredictionData] Deeplink: ${sportsbook} / ${betType}`);
  const body = {
    sportsbook,
    bet_type: betType,
    deeplink_strings: Array.isArray(deeplinkStrings) ? deeplinkStrings : [deeplinkStrings],
  };
  if (region) body.region = region;
  return pdPost('/api/deeplink', body);
};

// ═══════════════════════════════════════════════════════════════════════════════
// SGP — Same Game Parlay pricing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get Same Game Parlay pricing for 2+ legs from the SAME fixture.
 * Returns a map of sportsbook → { american, decimal, deeplink } or { error }
 *
 * Supported sportsbooks: draftkings, fanduel, betrivers, betmgm, betway,
 *   tooniebet, bc.game, stake, 888sport
 *
 * @param {Array<Object>} legs - array of leg objects:
 *   { fixture_id, league, bet_type, prop_name, side_type, player_id, team_id, period, is_live, number }
 * @param {string[]} sportsbooks - books to price (defaults to all supported)
 * @returns {Promise<Object>} - { draftkings: { american, decimal, deeplink }, fanduel: {...}, ... }
 */
const getSGPOddsService = async (
  legs,
  sportsbooks = ['draftkings', 'fanduel', 'betrivers', 'betmgm']
) => {
  logger.info(`[PredictionData] SGP: ${legs.length} legs / ${sportsbooks.join(',')}`);
  if (!Array.isArray(legs) || legs.length < 2) {
    throw new Error('SGP requires at least 2 legs');
  }
  return pdPost('/api/sgp', { sportsbooks, legs });
};

// ═══════════════════════════════════════════════════════════════════════════════
// SSE STREAM — Real-time market updates
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the SSE stream URL for market updates.
 * Use with EventSource in the client or Node's fetch with a streaming body.
 * Each SSE message is a single Market JSON object.
 *
 * @param {string} league       - optional league filter
 * @param {string} bookIds      - optional comma-separated book ID filter
 * @param {boolean} includeAlts - include alternate lines
 * @returns {string} - fully formed SSE URL with auth embedded
 */
const buildStreamUrl = (league = '', bookIds = '', includeAlts = false) => {
  const apiKey = getApiKey();
  const url = new URL(`${STREAM_URL}/v1/markets`);
  url.searchParams.set('X-API-KEY', apiKey);
  if (league)      url.searchParams.set('league', league);
  if (bookIds)     url.searchParams.set('book_ids', bookIds);
  if (includeAlts) url.searchParams.set('include_alts', 'true');
  return url.toString();
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Markets
  getMarketsService,
  getLiveMarketsService,
  getPlayerPropsService,
  getGamePropsService,
  getFuturesMarketsService,
  getPeriodMarketsService,
  getAltLinesService,
  getFullMarketService,
  // Reference
  getFixturesService,
  getPlayersService,
  getTeamsService,
  getSeasonsService,
  // Exchange/Orderbook
  getMarketSummariesService,
  getOrderbookService,
  // Actions (POST)
  buildDeeplinkService,
  getSGPOddsService,
  // Streaming
  buildStreamUrl,
  // Constants
  BOOK_IDS,
};

export const predictionDataService = {
  getMarketsService,
  getLiveMarketsService,
  getPlayerPropsService,
  getGamePropsService,
  getFuturesMarketsService,
  getPeriodMarketsService,
  getAltLinesService,
  getFullMarketService,
  getFixturesService,
  getPlayersService,
  getTeamsService,
  getSeasonsService,
  getMarketSummariesService,
  getOrderbookService,
  buildDeeplinkService,
  getSGPOddsService,
  buildStreamUrl,
  BOOK_IDS,
};
