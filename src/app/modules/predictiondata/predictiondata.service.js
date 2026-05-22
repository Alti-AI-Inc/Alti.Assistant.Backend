/**
 * predictiondata.service.js — PredictionData.io API Service Layer
 *
 * REST client for the PredictionData Markets API.
 * Base URL: https://api.predictiondata.io
 * Auth:     X-API-KEY header
 * Rate:     4 RPS default, monthly quota per plan
 *
 * API Key: env var PREDICTIONDATA_API_KEY
 *
 * Covered endpoints:
 *   /api/markets   ✅ moneyline, spread, total, player_prop, future
 *   /api/players   ✅ reference data by league
 *   /api/teams     ✅ reference data by league
 *   /api/fixtures  ✅ games with start times, scores, status
 *   /api/seasons   ✅ seasons/tournaments per league
 */

import dotenv from 'dotenv';
import { logger } from '../../../shared/logger.js';

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL = 'https://api.predictiondata.io';

const getApiKey = () =>
  (process.env.PREDICTIONDATA_API_KEY || '').replace(/^\uFEFF+/, '').trim();

// ─── Core HTTP helper ────────────────────────────────────────────────────────
async function pdFetch(path, params = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('[PredictionData] PREDICTIONDATA_API_KEY not set. Real-time sports data unavailable.');
    return null;
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
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

// ═══════════════════════════════════════════════════════════════════════════════
// MARKETS — Core odds feed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get markets for a league with specified bet types, periods, and books.
 *
 * @param {string} league        - e.g. 'NFL', 'NBA', 'NHL', 'MLB'
 * @param {string} betTypes      - comma-separated: 'moneyline,spread,total'
 * @param {string} periods       - comma-separated: 'FT' or 'FT,1H'
 * @param {string} bookIds       - comma-separated book IDs: '100,400,117'
 * @param {Object} opts
 * @param {boolean} opts.isLive       - live markets only (default false)
 * @param {number}  opts.timedelta    - hours window (default 24)
 * @param {boolean} opts.includeAlts  - include alternate lines (default false)
 * @returns {Promise<Array>}
 */
const getMarketsService = async (
  league,
  betTypes = 'moneyline,spread,total',
  periods = 'FT',
  bookIds = '100,400,117',
  opts = {}
) => {
  logger.info(`[PredictionData] Markets: ${league} / ${betTypes}`);
  const params = {
    league,
    bet_types: betTypes,
    periods,
    book_ids: bookIds,
    prop_types: opts.propTypes || '',
    is_live: opts.isLive ? 'true' : 'false',
    timedelta: opts.timedelta ?? 24,
    include_alts: opts.includeAlts ? 'true' : 'false',
  };
  const data = await pdFetch('/api/markets', params);
  return data?.markets || [];
};

/**
 * Get live markets only (is_live=true).
 */
const getLiveMarketsService = async (
  league,
  betTypes = 'moneyline,spread,total',
  bookIds = '100,400,117'
) => {
  return getMarketsService(league, betTypes, 'FT', bookIds, { isLive: true, timedelta: 6 });
};

/**
 * Get player prop markets for a specific league.
 * @param {string} league
 * @param {string} propTypes  - comma-separated prop types, e.g. 'points,rebounds'
 * @param {string} bookIds
 */
const getPlayerPropsService = async (
  league,
  propTypes = '',
  bookIds = '100,400,117'
) => {
  logger.info(`[PredictionData] Player Props: ${league} / ${propTypes}`);
  const params = {
    league,
    bet_types: 'player_prop',
    periods: 'FT',
    book_ids: bookIds,
    prop_types: propTypes,
    timedelta: 24,
  };
  const data = await pdFetch('/api/markets', params);
  return data?.markets || [];
};

/**
 * Get futures markets (championship odds, award odds, etc.)
 * @param {string} league
 * @param {string} bookIds
 */
const getFuturesMarketsService = async (league, bookIds = '100,400,117') => {
  logger.info(`[PredictionData] Futures: ${league}`);
  const params = {
    league,
    bet_types: 'future',
    periods: 'FT',
    book_ids: bookIds,
    prop_types: '',
    timedelta: 72,
  };
  const data = await pdFetch('/api/markets', params);
  return data?.markets || [];
};

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURES — Game schedule & scores
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get upcoming and recent fixtures for one or more leagues.
 * @param {string} leagues    - comma-separated, e.g. 'NFL' or 'NFL,NBA'
 * @param {number} timedelta  - hours window (default 48)
 * @param {boolean} returnMap - return as ID-keyed map
 */
const getFixturesService = async (leagues, timedelta = 48, returnMap = false) => {
  logger.info(`[PredictionData] Fixtures: ${leagues}`);
  const data = await pdFetch('/api/fixtures', {
    leagues,
    timedelta,
    return_map: returnMap ? 'true' : 'false',
  });
  if (returnMap) return data?.fixtures || {};
  return data?.fixtures || [];
};

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYERS — Reference data
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get players for one or more leagues.
 * @param {string} leagues  - e.g. 'NBA' or 'NFL,NBA'
 * @param {boolean} returnMap
 */
const getPlayersService = async (leagues, returnMap = true) => {
  logger.info(`[PredictionData] Players: ${leagues}`);
  const data = await pdFetch('/api/players', {
    leagues,
    return_map: returnMap ? 'true' : 'false',
  });
  return data?.players || (returnMap ? {} : []);
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEAMS — Reference data
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get teams for one or more leagues.
 * @param {string} leagues
 * @param {boolean} returnMap
 */
const getTeamsService = async (leagues, returnMap = true) => {
  logger.info(`[PredictionData] Teams: ${leagues}`);
  const data = await pdFetch('/api/teams', {
    leagues,
    return_map: returnMap ? 'true' : 'false',
  });
  return data?.teams || (returnMap ? {} : []);
};

// ═══════════════════════════════════════════════════════════════════════════════
// SEASONS — Tournament/season reference
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get seasons for a league.
 * @param {string} league
 */
const getSeasonsService = async (league) => {
  logger.info(`[PredictionData] Seasons: ${league}`);
  const data = await pdFetch('/api/seasons', { league });
  return Array.isArray(data) ? data : [];
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  getMarketsService,
  getLiveMarketsService,
  getPlayerPropsService,
  getFuturesMarketsService,
  getFixturesService,
  getPlayersService,
  getTeamsService,
  getSeasonsService,
};

export const predictionDataService = {
  getMarketsService,
  getLiveMarketsService,
  getPlayerPropsService,
  getFuturesMarketsService,
  getFixturesService,
  getPlayersService,
  getTeamsService,
  getSeasonsService,
};
