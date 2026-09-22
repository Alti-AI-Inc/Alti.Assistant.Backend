import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * API-Sports.io — Complete Multi-Sport REST Client
 *
 * Auth: x-apisports-key header on every request (GET only)
 * 12 Sports × ~15 endpoints each = 180+ total endpoints
 *
 * ┌──────────────────────┬────────────────────────────────────────────────┐
 * │ Sport                │ Base URL                                       │
 * ├──────────────────────┼────────────────────────────────────────────────┤
 * │ Football (Soccer)    │ https://v3.football.api-sports.io              │
 * │ Basketball           │ https://v1.basketball.api-sports.io            │
 * │ Baseball             │ https://v1.baseball.api-sports.io              │
 * │ Hockey               │ https://v1.hockey.api-sports.io                │
 * │ Handball             │ https://v1.handball.api-sports.io              │
 * │ Rugby                │ https://v1.rugby.api-sports.io                 │
 * │ Volleyball           │ https://v1.volleyball.api-sports.io            │
 * │ AFL                  │ https://v1.afl.api-sports.io                   │
 * │ Formula 1            │ https://v1.formula-1.api-sports.io             │
 * │ MMA                  │ https://v1.mma.api-sports.io                   │
 * │ NBA                  │ https://v2.nba.api-sports.io                   │
 * │ NFL / NCAA           │ https://v1.american-football.api-sports.io     │
 * └──────────────────────┴────────────────────────────────────────────────┘
 *
 * Common Endpoints (available across most sports):
 *   /status, /timezone, /seasons, /countries, /leagues, /teams,
 *   /fixtures (or /games), /standings, /players, /statistics,
 *   /odds, /bookmakers, /predictions, /events, /lineups, /h2h
 *
 * Football-specific extras:
 *   /coachs, /transfers, /trophies, /sidelined, /injuries, /venues
 */

const API_KEY = config.apisports?.apiKey || process.env.API_SPORTS_KEY || '';

const SPORT_HOSTS = {
  football:    'https://v3.football.api-sports.io',
  basketball:  'https://v1.basketball.api-sports.io',
  baseball:    'https://v1.baseball.api-sports.io',
  hockey:      'https://v1.hockey.api-sports.io',
  handball:    'https://v1.handball.api-sports.io',
  rugby:       'https://v1.rugby.api-sports.io',
  volleyball:  'https://v1.volleyball.api-sports.io',
  afl:         'https://v1.afl.api-sports.io',
  formula1:    'https://v1.formula-1.api-sports.io',
  mma:         'https://v1.mma.api-sports.io',
  nba:         'https://v2.nba.api-sports.io',
  nfl:         'https://v1.american-football.api-sports.io',
};

// Create axios instances per sport, all sharing the same API key header
const clients = {};
for (const [sport, baseURL] of Object.entries(SPORT_HOSTS)) {
  clients[sport] = axios.create({
    baseURL,
    headers: { 'x-apisports-key': API_KEY },
    timeout: 20000,
  });
}

// Generic GET helper — all API-Sports endpoints are GET-only
async function sportGet(sport, path, params = {}) {
  const client = clients[sport];
  if (!client) throw new Error(`Unknown sport: ${sport}. Valid: ${Object.keys(SPORT_HOSTS).join(', ')}`);
  const { data } = await client.get(path, { params });
  return data;
}

export const ApiSportsService = {

  getSportsList() {
    return Object.keys(SPORT_HOSTS);
  },

  // ═══════════════════════════════════════════════════════════════════════
  // UNIVERSAL ENDPOINTS (work across all 12 sports)
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /status — API health + quota info (does NOT count against daily limit) */
  async getStatus(sport) {
    return sportGet(sport, '/status');
  },

  /** GET /timezone — available timezone list */
  async getTimezones(sport) {
    return sportGet(sport, '/timezone');
  },

  /** GET /seasons — available seasons */
  async getSeasons(sport) {
    return sportGet(sport, '/seasons');
  },

  /** GET /countries */
  async getCountries(sport, params = {}) {
    return sportGet(sport, '/countries', params);
  },

  /** GET /leagues — all leagues/cups with season info */
  async getLeagues(sport, params = {}) {
    return sportGet(sport, '/leagues', params);
  },

  /** GET /teams — team info, search, statistics */
  async getTeams(sport, params = {}) {
    return sportGet(sport, '/teams', params);
  },

  /** GET /teams/statistics — team season stats */
  async getTeamStatistics(sport, params = {}) {
    return sportGet(sport, '/teams/statistics', params);
  },

  /** GET /standings */
  async getStandings(sport, params = {}) {
    return sportGet(sport, '/standings', params);
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FIXTURES / GAMES — The core real-time scoring data
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /fixtures (football) or /games (others) — live scores, results, schedules */
  async getFixtures(sport, params = {}) {
    // Football uses /fixtures, most others use /games
    const path = sport === 'football' ? '/fixtures' : '/games';
    return sportGet(sport, path, params);
  },

  /** GET /fixtures?live=all — LIVE fixtures only (real-time scores) */
  async getLiveFixtures(sport) {
    const path = sport === 'football' ? '/fixtures' : '/games';
    return sportGet(sport, path, { live: 'all' });
  },

  /** GET /fixtures/rounds (football) */
  async getFixtureRounds(sport, params = {}) {
    return sportGet(sport, '/fixtures/rounds', params);
  },

  /** GET /fixtures/headtohead (football) or /games/h2h */
  async getHeadToHead(sport, params = {}) {
    const path = sport === 'football' ? '/fixtures/headtohead' : '/games/h2h';
    return sportGet(sport, path, params);
  },

  /** GET /fixtures/statistics or /games/statistics */
  async getFixtureStatistics(sport, params = {}) {
    const path = sport === 'football' ? '/fixtures/statistics' : '/games/statistics';
    return sportGet(sport, path, params);
  },

  /** GET /fixtures/events (football — goals, cards, subs) or /games/events */
  async getFixtureEvents(sport, params = {}) {
    const path = sport === 'football' ? '/fixtures/events' : '/games/events';
    return sportGet(sport, path, params);
  },

  /** GET /fixtures/lineups (football) or /games/lineups */
  async getLineups(sport, params = {}) {
    const path = sport === 'football' ? '/fixtures/lineups' : '/games/lineups';
    return sportGet(sport, path, params);
  },

  /** GET /fixtures/players (football) — player stats per fixture */
  async getFixturePlayers(sport, params = {}) {
    return sportGet(sport, '/fixtures/players', params);
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PLAYERS
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /players — player profiles and stats */
  async getPlayers(sport, params = {}) {
    return sportGet(sport, '/players', params);
  },

  /** GET /players/squads — full team squad */
  async getSquads(sport, params = {}) {
    return sportGet(sport, '/players/squads', params);
  },

  /** GET /players/topscorers */
  async getTopScorers(sport, params = {}) {
    return sportGet(sport, '/players/topscorers', params);
  },

  /** GET /players/topassists */
  async getTopAssists(sport, params = {}) {
    return sportGet(sport, '/players/topassists', params);
  },

  /** GET /players/topyellowcards */
  async getTopYellowCards(sport, params = {}) {
    return sportGet(sport, '/players/topyellowcards', params);
  },

  /** GET /players/topredcards */
  async getTopRedCards(sport, params = {}) {
    return sportGet(sport, '/players/topredcards', params);
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ODDS & PREDICTIONS
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /odds — pre-match betting odds */
  async getOdds(sport, params = {}) {
    return sportGet(sport, '/odds', params);
  },

  /** GET /odds/live — in-play live odds */
  async getLiveOdds(sport, params = {}) {
    return sportGet(sport, '/odds/live', params);
  },

  /** GET /odds/mapping */
  async getOddsMapping(sport, params = {}) {
    return sportGet(sport, '/odds/mapping', params);
  },

  /** GET /bookmakers */
  async getBookmakers(sport, params = {}) {
    return sportGet(sport, '/bookmakers', params);
  },

  /** GET /odds/bets — available bet types */
  async getBetTypes(sport, params = {}) {
    return sportGet(sport, '/odds/bets', params);
  },

  /** GET /predictions */
  async getPredictions(sport, params = {}) {
    return sportGet(sport, '/predictions', params);
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FOOTBALL-SPECIFIC ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /coachs — coach profiles and career history */
  async getCoaches(params = {}) {
    return sportGet('football', '/coachs', params);
  },

  /** GET /transfers — player transfer records */
  async getTransfers(params = {}) {
    return sportGet('football', '/transfers', params);
  },

  /** GET /trophies — player/coach trophies */
  async getTrophies(params = {}) {
    return sportGet('football', '/trophies', params);
  },

  /** GET /sidelined — player sidelined history */
  async getSidelined(params = {}) {
    return sportGet('football', '/sidelined', params);
  },

  /** GET /injuries — current injuries */
  async getInjuries(params = {}) {
    return sportGet('football', '/injuries', params);
  },

  /** GET /venues — stadium info */
  async getVenues(params = {}) {
    return sportGet('football', '/venues', params);
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FORMULA 1 SPECIFIC
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /circuits */
  async getCircuits(params = {}) {
    return sportGet('formula1', '/circuits', params);
  },

  /** GET /drivers */
  async getDrivers(params = {}) {
    return sportGet('formula1', '/drivers', params);
  },

  /** GET /races */
  async getRaces(params = {}) {
    return sportGet('formula1', '/races', params);
  },

  /** GET /rankings/drivers */
  async getDriverRankings(params = {}) {
    return sportGet('formula1', '/rankings/drivers', params);
  },

  /** GET /rankings/teams */
  async getTeamRankings(params = {}) {
    return sportGet('formula1', '/rankings/teams', params);
  },

  /** GET /rankings/races — race results */
  async getRaceRankings(params = {}) {
    return sportGet('formula1', '/rankings/races', params);
  },

  /** GET /pit-stops */
  async getPitStops(params = {}) {
    return sportGet('formula1', '/pit-stops', params);
  },

  // ═══════════════════════════════════════════════════════════════════════
  // MMA SPECIFIC
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /fighters */
  async getFighters(params = {}) {
    return sportGet('mma', '/fighters', params);
  },

  /** GET /fights */
  async getFights(params = {}) {
    return sportGet('mma', '/fights', params);
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GENERIC PASSTHROUGH — for any endpoint on any sport
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Raw GET for any sport + path combo.
   * e.g. rawGet('football', '/fixtures', { live: 'all' })
   */
  async rawGet(sport, path, params = {}) {
    return sportGet(sport, path, params);
  },
};

export default ApiSportsService;
