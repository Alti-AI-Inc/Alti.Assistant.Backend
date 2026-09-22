import axios from 'axios';
import { EventSource } from 'eventsource';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * PredictionData.io — Complete REST + SSE Streaming Client
 *
 * Base URL: https://api.predictiondata.io (inferred from docs)
 * Auth: X-API-KEY header on every request
 *
 * Endpoints:
 *   GET /markets   — betting odds from 200+ sportsbooks (Moneylines, Spreads, Totals, Props, Futures)
 *   GET /players   — player reference data
 *   GET /teams     — team reference data
 *   GET /fixtures  — event/schedule reference data
 *   GET /stream    — SSE real-time market data streaming
 *
 * Coverage: NFL, NCAAF, NBA, NCAAB, MLB, NHL, UFC, MLS,
 *   Premier League, Serie A, LaLiga, Ligue 1, Bundesliga,
 *   Champions League, Golf, Politics, Crypto
 *
 * Sportsbooks: DraftKings, FanDuel, Pinnacle, BetMGM, Caesars,
 *   Polymarket, Kalshi, PredictIt, Betfair, 200+ more
 */

const API_KEY = config.predictiondata?.apiKey || process.env.PREDICTION_DATA_KEY || '';
const BASE_URL = 'https://api.predictiondata.io';

const pdApi = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'X-API-KEY': API_KEY,
    'Content-Type': 'application/json',
  },
});

export const PredictionDataService = {

  // ═══════════════════════════════════════════════════════════════════════
  // MARKETS — The core endpoint for betting odds and prediction markets
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get markets with comprehensive filtering.
   *
   * @param {Object} params
   * @param {string} [params.league]    — NFL, NBA, NCAAF, NCAAB, MLB, NHL, UFC, MLS, EPL, etc.
   * @param {string} [params.book]      — Sportsbook: draftkings, fanduel, pinnacle, polymarket, kalshi, etc.
   * @param {string} [params.bet_type]  — Moneylines, Spreads, Totals, Props, Futures
   * @param {string} [params.period]    — full_game, first_half, first_quarter, etc.
   * @param {string} [params.live]      — true/false — live in-play markets only
   * @param {string} [params.pregame]   — true/false — pre-game markets only
   * @param {string} [params.alt_lines] — true/false — include alternate lines
   * @param {string} [params.fixture_id] — specific fixture/event ID
   * @param {string} [params.team_id]   — filter by team
   * @param {string} [params.player_id] — filter by player (for props)
   * @param {string} [params.date]      — filter by date
   * @param {string} [params.format]    — list | map
   */
  async getMarkets(params = {}) {
    const { data } = await pdApi.get('/markets', { params });
    return data;
  },

  /** Moneyline markets only */
  async getMoneylines(params = {}) {
    return this.getMarkets({ ...params, bet_type: 'Moneylines' });
  },

  /** Spread markets only */
  async getSpreads(params = {}) {
    return this.getMarkets({ ...params, bet_type: 'Spreads' });
  },

  /** Totals (over/under) markets only */
  async getTotals(params = {}) {
    return this.getMarkets({ ...params, bet_type: 'Totals' });
  },

  /** Player and game props */
  async getProps(params = {}) {
    return this.getMarkets({ ...params, bet_type: 'Props' });
  },

  /** Futures markets (championship, MVP, etc.) */
  async getFutures(params = {}) {
    return this.getMarkets({ ...params, bet_type: 'Futures' });
  },

  /** Live in-play markets only */
  async getLiveMarkets(params = {}) {
    return this.getMarkets({ ...params, live: 'true' });
  },

  /** Pre-game markets only */
  async getPregameMarkets(params = {}) {
    return this.getMarkets({ ...params, pregame: 'true' });
  },

  /** Markets with alternate lines included */
  async getAltLineMarkets(params = {}) {
    return this.getMarkets({ ...params, alt_lines: 'true' });
  },

  // ═══════════════════════════════════════════════════════════════════════
  // REFERENCE DATA — Players, Teams, Fixtures
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get player reference data.
   * @param {Object} params - { league, team_id, player_id, format }
   */
  async getPlayers(params = {}) {
    const { data } = await pdApi.get('/players', { params });
    return data;
  },

  /**
   * Get team reference data.
   * @param {Object} params - { league, team_id, format }
   */
  async getTeams(params = {}) {
    const { data } = await pdApi.get('/teams', { params });
    return data;
  },

  /**
   * Get fixture/event reference data.
   * @param {Object} params - { league, fixture_id, date, format }
   */
  async getFixtures(params = {}) {
    const { data } = await pdApi.get('/fixtures', { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SSE REAL-TIME STREAMING — Server-Sent Events for live odds movement
  // ═══════════════════════════════════════════════════════════════════════

  _activeStreams: {},

  /**
   * Connect to the SSE market stream for real-time odds updates.
   * @param {Object} params - { league, book, bet_type, live }
   * @param {Function} onMessage - callback(event) called for each SSE message
   * @param {Function} [onError] - callback(error) called on stream errors
   * @returns {string} streamId for managing the stream
   */
  connectStream(params = {}, onMessage, onError) {
    const queryString = new URLSearchParams(params).toString();
    const url = `${BASE_URL}/stream${queryString ? '?' + queryString : ''}`;
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    logger.info(`[PredictionData] Connecting SSE stream: ${streamId} → ${url}`);

    const eventSource = new EventSource(url, {
      headers: { 'X-API-KEY': API_KEY },
    });

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        onMessage(parsed);
      } catch (err) {
        onMessage(event.data);
      }
    };

    eventSource.onerror = (err) => {
      logger.error(`[PredictionData] SSE stream error (${streamId}): ${err.message || 'unknown'}`);
      if (onError) onError(err);
    };

    this._activeStreams[streamId] = { eventSource, params, connectedAt: new Date().toISOString() };
    return streamId;
  },

  /**
   * Disconnect a specific SSE stream.
   */
  disconnectStream(streamId) {
    const stream = this._activeStreams[streamId];
    if (stream) {
      stream.eventSource.close();
      delete this._activeStreams[streamId];
      logger.info(`[PredictionData] SSE stream disconnected: ${streamId}`);
      return true;
    }
    return false;
  },

  /**
   * Disconnect all active SSE streams.
   */
  disconnectAllStreams() {
    for (const streamId of Object.keys(this._activeStreams)) {
      this.disconnectStream(streamId);
    }
  },

  /**
   * List active SSE stream connections.
   */
  listActiveStreams() {
    return Object.entries(this._activeStreams).map(([id, s]) => ({
      streamId: id,
      params: s.params,
      connectedAt: s.connectedAt,
    }));
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CACHED LIVE MARKETS — polling-based cache for instant access
  // ═══════════════════════════════════════════════════════════════════════

  _marketCache: {},
  _marketPollers: {},

  /**
   * Start polling live markets for a league every N seconds.
   */
  startMarketPolling(league, intervalMs = 15000) {
    if (this._marketPollers[league]) return;
    logger.info(`[PredictionData] Starting market poller for ${league} every ${intervalMs}ms`);

    const poll = async () => {
      try {
        const result = await this.getMarkets({ league, live: 'true' });
        this._marketCache[league] = {
          data: result,
          lastUpdated: new Date().toISOString(),
        };
      } catch (err) {
        logger.error(`[PredictionData] Market poll error (${league}): ${err.message}`);
      }
    };

    poll();
    this._marketPollers[league] = setInterval(poll, intervalMs);
  },

  stopMarketPolling(league) {
    if (this._marketPollers[league]) {
      clearInterval(this._marketPollers[league]);
      delete this._marketPollers[league];
    }
  },

  getCachedMarkets(league) {
    return this._marketCache[league] || { data: null, lastUpdated: null };
  },

  getAllCachedMarkets() {
    return this._marketCache;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // RAW PROXY
  // ═══════════════════════════════════════════════════════════════════════

  async rawGet(path, params = {}) {
    const { data } = await pdApi.get(path, { params });
    return data;
  },
};

export default PredictionDataService;
