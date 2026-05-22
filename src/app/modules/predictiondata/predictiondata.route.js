import express from 'express';
import {
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
} from './predictiondata.service.js';
import { logger } from '../../../shared/logger.js';
import { getSportsCacheStatus, forceRefreshLeague } from '../../helpers/sportsDataCache.js';

const router = express.Router();

// ─── Helper ───────────────────────────────────────────────────────────────────
const handleAsync = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    logger.error('[PredictionData Route]', err.message);
    res.status(500).json({ error: err.message });
  });

// ─── Markets ─────────────────────────────────────────────────────────────────

/**
 * GET /predictiondata/markets
 * Query: league, bet_types, periods, book_ids, prop_types, is_live, timedelta, include_alts, since
 */
router.get(
  '/markets',
  handleAsync(async (req, res) => {
    const {
      league = 'NFL',
      bet_types = 'moneyline,spread,total',
      periods = 'FT',
      book_ids = '100,200,300,400,250',
      prop_types = '',
      is_live = 'false',
      timedelta = 24,
      include_alts = 'false',
      since,
    } = req.query;
    const data = await getMarketsService(
      league, bet_types, periods, book_ids,
      {
        propTypes: prop_types,
        isLive: is_live === 'true',
        timedelta: Number(timedelta),
        includeAlts: include_alts === 'true',
        since: since ? Number(since) : undefined,
      }
    );
    res.json({ markets: data, count: data.length });
  })
);

/**
 * GET /predictiondata/markets/live
 * Query: league, bet_types, book_ids
 */
router.get(
  '/markets/live',
  handleAsync(async (req, res) => {
    const {
      league = 'NFL',
      bet_types = 'moneyline,spread,total',
      book_ids = '100,200,300,400,250',
    } = req.query;
    const data = await getLiveMarketsService(league, bet_types, book_ids);
    res.json({ markets: data, count: data.length });
  })
);

/**
 * GET /predictiondata/markets/props
 * Query: league, prop_types, book_ids, is_live
 */
router.get(
  '/markets/props',
  handleAsync(async (req, res) => {
    const {
      league = 'NFL',
      prop_types = '',
      book_ids = '100,200,400',
      is_live = 'false',
    } = req.query;
    const data = await getPlayerPropsService(league, prop_types, book_ids, is_live === 'true');
    res.json({ markets: data, count: data.length });
  })
);

/**
 * GET /predictiondata/markets/game-props
 * Query: league, prop_types, book_ids
 * Note: ALL UFC and TENNIS markets are game_props
 */
router.get(
  '/markets/game-props',
  handleAsync(async (req, res) => {
    const {
      league = 'UFC',
      prop_types = '',
      book_ids = '100,200,400',
    } = req.query;
    const data = await getGamePropsService(league, prop_types, book_ids);
    res.json({ markets: data, count: data.length });
  })
);

/**
 * GET /predictiondata/markets/alt-lines
 * Query: league, book_ids
 */
router.get(
  '/markets/alt-lines',
  handleAsync(async (req, res) => {
    const { league = 'NFL', book_ids = '100,200,400' } = req.query;
    const data = await getAltLinesService(league, book_ids);
    const altOnly = data.filter((m) => m.is_alt === true);
    res.json({ markets: altOnly, count: altOnly.length });
  })
);

/**
 * GET /predictiondata/markets/period
 * Query: league, period (1H|1Q|1P|F5|etc.), book_ids
 */
router.get(
  '/markets/period',
  handleAsync(async (req, res) => {
    const { league = 'NFL', period = '1H', book_ids = '100,200,400' } = req.query;
    const data = await getPeriodMarketsService(league, period, book_ids);
    res.json({ markets: data, count: data.length });
  })
);

/**
 * GET /predictiondata/markets/full
 * All bet types for a league (moneyline+spread+total+player_prop+game_prop)
 * Query: league, book_ids
 */
router.get(
  '/markets/full',
  handleAsync(async (req, res) => {
    const { league = 'NFL', book_ids = '100,200,300,400,250,700' } = req.query;
    const data = await getFullMarketService(league, book_ids);
    res.json({ markets: data, count: data.length });
  })
);

// ─── Futures ─────────────────────────────────────────────────────────────────

/**
 * GET /predictiondata/futures/:league
 * Query: book_ids, prop_types
 */
router.get(
  '/futures/:league',
  handleAsync(async (req, res) => {
    const { league } = req.params;
    const { book_ids = '100,200,300,400,250', prop_types = '' } = req.query;
    const data = await getFuturesMarketsService(league.toUpperCase(), book_ids, prop_types);
    res.json({ futures: data, count: data.length });
  })
);

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * GET /predictiondata/fixtures
 * Query: leagues (comma-separated), timedelta (hours), return_map, since
 */
router.get(
  '/fixtures',
  handleAsync(async (req, res) => {
    const { leagues = 'NFL', timedelta = 48, return_map = 'false', since } = req.query;
    const data = await getFixturesService(
      leagues, Number(timedelta), return_map === 'true',
      since ? Number(since) : undefined
    );
    if (return_map === 'true') {
      res.json({ fixtures: data });
    } else {
      res.json({ fixtures: data, count: data.length });
    }
  })
);

// ─── Reference Data ──────────────────────────────────────────────────────────

/**
 * GET /predictiondata/players/:league
 * Query: return_map, since
 */
router.get(
  '/players/:league',
  handleAsync(async (req, res) => {
    const { league } = req.params;
    const { return_map = 'true', since } = req.query;
    const data = await getPlayersService(
      league.toUpperCase(), return_map === 'true',
      since ? Number(since) : undefined
    );
    res.json({ players: data });
  })
);

/**
 * GET /predictiondata/teams/:league
 * Query: return_map, since
 */
router.get(
  '/teams/:league',
  handleAsync(async (req, res) => {
    const { league } = req.params;
    const { return_map = 'true', since } = req.query;
    const data = await getTeamsService(
      league.toUpperCase(), return_map === 'true',
      since ? Number(since) : undefined
    );
    res.json({ teams: data });
  })
);

/**
 * GET /predictiondata/seasons/:league
 */
router.get(
  '/seasons/:league',
  handleAsync(async (req, res) => {
    const { league } = req.params;
    const data = await getSeasonsService(league.toUpperCase());
    res.json({ seasons: data });
  })
);

// ─── Market Summaries & Orderbook ────────────────────────────────────────────

/**
 * GET /predictiondata/market-summaries/:league
 * Returns active market slugs for orderbook integration
 */
router.get(
  '/market-summaries/:league',
  handleAsync(async (req, res) => {
    const { league } = req.params;
    const data = await getMarketSummariesService(league.toUpperCase());
    res.json({ summaries: data, count: data.length });
  })
);

/**
 * GET /predictiondata/orderbook
 * Query: market_slug, provider_id (193=Polymarket, 194=Kalshi)
 */
router.get(
  '/orderbook',
  handleAsync(async (req, res) => {
    const { market_slug, provider_id = '193' } = req.query;
    if (!market_slug) {
      return res.status(400).json({ error: 'market_slug is required' });
    }
    const data = await getOrderbookService(market_slug, Number(provider_id));
    const bids = data.filter((o) => !o.is_ask);
    const asks = data.filter((o) => o.is_ask);
    res.json({ bids, asks, total: data.length });
  })
);

// ─── Deeplink ────────────────────────────────────────────────────────────────

/**
 * POST /predictiondata/deeplink
 * Body: { sportsbook, deeplink_strings[], bet_type, region }
 */
router.post(
  '/deeplink',
  handleAsync(async (req, res) => {
    const { sportsbook, deeplink_strings, bet_type = 'single', region = '' } = req.body;
    if (!sportsbook || !deeplink_strings) {
      return res.status(400).json({ error: 'sportsbook and deeplink_strings are required' });
    }
    const data = await buildDeeplinkService(sportsbook, deeplink_strings, bet_type, region);
    res.json(data);
  })
);

// ─── SGP Pricing ─────────────────────────────────────────────────────────────

/**
 * POST /predictiondata/sgp
 * Body: { legs[], sportsbooks[] }
 * Returns: map of sportsbook → { american, decimal, deeplink }
 */
router.post(
  '/sgp',
  handleAsync(async (req, res) => {
    const { legs, sportsbooks = ['draftkings', 'fanduel', 'betrivers', 'betmgm'] } = req.body;
    if (!Array.isArray(legs) || legs.length < 2) {
      return res.status(400).json({ error: 'At least 2 legs are required for SGP' });
    }
    const data = await getSGPOddsService(legs, sportsbooks);
    res.json(data);
  })
);

// ─── Streaming ───────────────────────────────────────────────────────────────

/**
 * GET /predictiondata/stream-url
 * Returns the SSE stream URL (client uses this to connect directly to stream.predictiondata.io)
 * Query: league, book_ids, include_alts
 *
 * NOTE: The actual SSE stream connects to stream.predictiondata.io/v1/markets
 * This endpoint returns the authenticated URL for the frontend to connect to.
 */
router.get(
  '/stream-url',
  handleAsync(async (req, res) => {
    const { league = '', book_ids = '', include_alts = 'false' } = req.query;
    const url = buildStreamUrl(league, book_ids, include_alts === 'true');
    res.json({ stream_url: url, protocol: 'SSE', description: 'Connect via EventSource' });
  })
);

// ─── Info / Capabilities ─────────────────────────────────────────────────────

/**
 * GET /predictiondata/info
 * Returns full API capability manifest
 */
router.get('/info', (req, res) => {
  res.json({
    provider: 'PredictionData.io',
    description: 'Real-time sports betting & prediction market data API',
    leagues: ['NFL', 'NCAAF', 'FB_US_M_UFL', 'NHL', 'MLB', 'NBA', 'NCAAB', 'UFC', 'MLS', 'EPL', 'SERA', 'LIGA', 'LIG1', 'BUND', 'UCL', 'GOLF', 'TENNIS'],
    bet_types: ['moneyline', 'spread', 'total', 'player_prop', 'game_prop', 'future'],
    periods: ['FT', '1H', '2H', '1P', '2P', '3P', '1Q', '2Q', '3Q', '4Q', 'F1', 'F3', 'F5', 'F7', '1I-9I', '1S', '2S', 'REG'],
    endpoints: {
      'GET /markets':            'Standard odds (moneyline, spread, total)',
      'GET /markets/live':       'Live in-game odds only',
      'GET /markets/props':      'Player prop markets',
      'GET /markets/game-props': 'Game event props (UFC, soccer events)',
      'GET /markets/alt-lines':  'Alternate spread & total lines',
      'GET /markets/period':     'Period-specific odds (1H, 1Q, F5, etc.)',
      'GET /markets/full':       'All bet types for a league',
      'GET /futures/:league':    'Championship & award futures',
      'GET /fixtures':           'Game schedules, live scores',
      'GET /players/:league':    'Player reference data',
      'GET /teams/:league':      'Team reference data',
      'GET /seasons/:league':    'Season/tournament data',
      'GET /market-summaries/:league': 'Active market slugs for orderbook',
      'GET /orderbook':          'Polymarket/Kalshi bid-ask depth',
      'POST /deeplink':          'Generate sportsbook bet deeplinks',
      'POST /sgp':               'Same Game Parlay pricing (2+ legs)',
      'GET /stream-url':         'SSE stream URL for real-time updates',
    },
    book_ids: BOOK_IDS,
    prediction_market_books: { Polymarket: 193, Kalshi: 194 },
    streaming: {
      url: 'https://stream.predictiondata.io/v1/markets',
      protocol: 'Server-Sent Events (SSE)',
      format: 'JSON market objects prefixed with data:',
    },
  });
});

// ─── Cache Management ─────────────────────────────────────────────────────────

/**
 * GET /predictiondata/cache/status
 * Returns current cache warm status for all leagues
 */
router.get(
  '/cache/status',
  handleAsync(async (req, res) => {
    const status = await getSportsCacheStatus();
    res.json(status);
  })
);

/**
 * POST /predictiondata/cache/refresh/:league
 * Force-refresh a specific league immediately
 * e.g. POST /predictiondata/cache/refresh/NFL
 */
router.post(
  '/cache/refresh/:league',
  handleAsync(async (req, res) => {
    const { league } = req.params;
    const result = await forceRefreshLeague(league.toUpperCase());
    res.json(result);
  })
);

/**
 * POST /predictiondata/cache/refresh-all
 * Force-refresh all priority leagues
 */
router.post(
  '/cache/refresh-all',
  handleAsync(async (req, res) => {
    const leagues = ['NFL', 'NBA', 'MLB', 'NHL'];
    const results = await Promise.allSettled(
      leagues.map((l) => forceRefreshLeague(l))
    );
    res.json({
      results: results.map((r, i) => ({
        league: leagues[i],
        status: r.status,
        value: r.value || r.reason?.message,
      })),
    });
  })
);

export const predictionDataRoutes = router;
