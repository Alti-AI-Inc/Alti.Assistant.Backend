import express from 'express';
import { sportsSmartRouter } from '../../../helpers/sportsSmartRouter.js';
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




/**
 * GET /predictiondata/markets/futures
 * Query: league, book_ids, prop_types (optional specific future type filter)
 */
router.get(
  '/markets/futures',
  handleAsync(async (req, res) => {
    const {
      league = 'NFL',
      book_ids = '100,200,300,400,250',
      prop_types = '',
    } = req.query;
    const data = await getFuturesMarketsService(league, book_ids, prop_types);
    res.json({ markets: data, count: data.length, league, prop_types: prop_types || 'all' });
  })
);


// ─── Analysis Endpoints (powered by sportsSmartRouter analysis functions) ─────

/**
 * POST /predictiondata/analysis
 * Runs one of four analysis modes on live market data.
 * Body: { league, query_type: 'value_bets' | 'line_movers' | 'sharp_picks' | 'best_available' }
 */
router.post(
  '/analysis',
  handleAsync(async (req, res) => {
    const {
      league = 'NFL',
      query_type = 'value_bets',
      book_ids = '100,200,300,400,250,700',
      timedelta = 24,
    } = req.body;

    const allBooksStr = book_ids + ',250'; // Always include Pinnacle for sharp analysis
    const markets = await getMarketsService(
      league,
      'moneyline,spread,total,player_prop',
      'FT',
      allBooksStr,
      { timedelta: Number(timedelta) }
    );

    let result;
    switch (query_type) {
      case 'value_bets':
        result = sportsSmartRouter.buildValueBets(markets);
        break;
      case 'line_movers':
        result = sportsSmartRouter.detectLineMovers(markets, 20);
        break;
      case 'sharp_picks':
        result = sportsSmartRouter.buildSharpAnalysis(markets, league);
        break;
      case 'best_available':
        result = sportsSmartRouter.pickBestLine(markets);
        break;
      default:
        return res.status(400).json({ error: 'query_type must be one of: value_bets, line_movers, sharp_picks, best_available' });
    }

    res.json({
      league,
      query_type,
      markets_analyzed: markets.length,
      results: result,
      result_count: result.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /predictiondata/markets/value-bets
 * Returns markets with positive EV (book odds better than no-vig fair value).
 * Query: league, min_edge (default 1.5, as percentage)
 */
router.get(
  '/markets/value-bets',
  handleAsync(async (req, res) => {
    const {
      league = 'NFL',
      min_edge = '1.5',
      book_ids = '100,200,300,400,250',
      timedelta = '24',
    } = req.query;
    const markets = await getMarketsService(league, 'moneyline,spread,total,player_prop', 'FT', book_ids, { timedelta: Number(timedelta) });
    const valueBets = sportsSmartRouter.buildValueBets(markets, Number(min_edge));
    res.json({
      league,
      min_edge: Number(min_edge),
      markets_checked: markets.length,
      value_bets: valueBets,
      count: valueBets.length,
    });
  })
);

/**
 * GET /predictiondata/markets/line-movers
 * Returns markets with largest open → current odds movement (steam detection).
 * Query: league, top (default 15)
 */
router.get(
  '/markets/line-movers',
  handleAsync(async (req, res) => {
    const {
      league = 'NFL',
      top = '15',
      book_ids = '100,200,300,400,250',
      timedelta = '24',
    } = req.query;
    const markets = await getMarketsService(league, 'moneyline,spread,total', 'FT', book_ids, { timedelta: Number(timedelta) });
    const movers = sportsSmartRouter.detectLineMovers(markets, Number(top));
    res.json({
      league,
      markets_checked: markets.length,
      line_movers: movers,
      count: movers.length,
    });
  })
);

/**
 * GET /predictiondata/markets/sharp-picks
 * Returns markets where Pinnacle's line diverges from the public book average.
 * Divergence = sharp money signal. Requires Pinnacle access.
 * Query: league
 */
router.get(
  '/markets/sharp-picks',
  handleAsync(async (req, res) => {
    const {
      league = 'NFL',
      book_ids = '100,200,300,400,250,700,365,500',
      timedelta = '24',
    } = req.query;
    // Always include Pinnacle (250) for the reference
    const allBooks = book_ids.includes('250') ? book_ids : book_ids + ',250';
    const markets = await getMarketsService(league, 'moneyline,spread,total', 'FT', allBooks, { timedelta: Number(timedelta) });
    const sharpPicks = sportsSmartRouter.buildSharpAnalysis(markets, league);
    res.json({
      league,
      markets_checked: markets.length,
      sharp_picks: sharpPicks,
      count: sharpPicks.length,
      pinnacle_reference: true,
    });
  })
);

/**
 * GET /predictiondata/markets/best-available
 * Returns the best odds across all books for every market side.
 * This is the classic "line shopping" endpoint.
 * Query: league, bet_types
 */
router.get(
  '/markets/best-available',
  handleAsync(async (req, res) => {
    const {
      league = 'NFL',
      bet_types = 'moneyline,spread,total',
      timedelta = '24',
    } = req.query;
    // Fetch from ALL major books simultaneously
    const allBooks = '100,200,300,400,250,700,365,500,555,617,150';
    const markets = await getMarketsService(league, bet_types, 'FT', allBooks, { timedelta: Number(timedelta) });
    const bestLines = sportsSmartRouter.pickBestLine(markets);
    res.json({
      league,
      bet_types,
      books_compared: 11,
      markets_input: markets.length,
      best_available: bestLines,
      count: bestLines.length,
    });
  })
);

// ─── Book Comparison (all books for a specific game) ──────────────────────────

/**
 * GET /predictiondata/markets/compare
 * Returns side-by-side odds from ALL books for a specific fixture or league.
 * Useful for line shopping across all major sportsbooks.
 * Query: league, fixture_id (optional), bet_types, periods
 */
router.get(
  '/markets/compare',
  handleAsync(async (req, res) => {
    const {
      league = 'NFL',
      bet_types = 'moneyline,spread,total',
      periods = 'FT',
      timedelta = 24,
    } = req.query;

    // Fetch from ALL books simultaneously
    const allBooks = '100,200,300,400,250,700,365,500,555,617,192,150';
    const data = await getMarketsService(
      league,
      bet_types,
      periods,
      allBooks,
      { timedelta: Number(timedelta) }
    );

    // Group by fixture_id + prop_name for easy comparison
    const grouped = {};
    for (const market of data) {
      const key = [market.fixture_id, market.bet_type, market.prop_name, market.side, market.period].filter(Boolean).join(':');
      if (!grouped[key]) grouped[key] = { key, markets: [] };
      grouped[key].markets.push({
        book_id: market.odd_provider_id,
        odds: market.odds,
        no_vig_odds: market.no_vig_odds,
        number: market.number,
        open_odds: market.open_odds,
        provider_url: market.provider_url,
        updated_at: market.updated_at,
      });
    }

    res.json({
      league,
      bet_types,
      markets_compared: data.length,
      fixture_groups: Object.values(grouped).length,
      comparisons: Object.values(grouped),
    });
  })
);

/**
 * POST /predictiondata/deeplink
 * Generate a bet slip deeplink URL from provider_deeplink_string values.
 * Body: { sportsbook: 'draftkings', deeplink_strings: ['...'], bet_type: 'single', region: 'nj' }
 */
router.post(
  '/deeplink',
  handleAsync(async (req, res) => {
    const { sportsbook = 'draftkings', deeplink_strings = [], bet_type = 'single', region = '' } = req.body;
    if (!Array.isArray(deeplink_strings) || deeplink_strings.length === 0) {
      return res.status(400).json({ error: 'deeplink_strings array is required' });
    }
    const result = await buildDeeplinkService(sportsbook, deeplink_strings, bet_type, region);
    res.json(result || { error: 'No deeplink generated' });
  })
);

/**
 * GET /predictiondata/markets/live-scores
 * Returns only live (in-progress) fixtures with current scores and period info.
 * Query: leagues (comma-separated, default NFL,NBA,MLB,NHL,UFC)
 */
router.get(
  '/markets/live-scores',
  handleAsync(async (req, res) => {
    const { leagues = 'NFL,NBA,MLB,NHL,UFC' } = req.query;
    const allFixtures = await getFixturesService(leagues, 6); // 6hr window
    const liveGames = allFixtures.filter((f) =>
      f.status === 'in_progress' || f.status === 'live' || f.status === 'inprogress'
    );
    res.json({
      live_games: liveGames.length,
      leagues: leagues.split(','),
      fixtures: liveGames.map((f) => ({
        id: f.id,
        league: f.league,
        home: f.home_abbr,
        away: f.away_abbr,
        home_score: f.home_score,
        away_score: f.away_score,
        current_period: f.current_period_text,
        current_clock: f.current_clock,
        current_period_number: f.current_period_number,
        status: f.status,
        date: f.date,
      })),
    });
  })
);

/**
 * GET /predictiondata/players/:league
 * Returns player reference data for a league.
 * Useful for populating player autocomplete and enriching prop displays.
 */
router.get(
  '/players/:league',
  handleAsync(async (req, res) => {
    const league = req.params.league.toUpperCase();
    const { return_map = 'false', search = '' } = req.query;
    const players = await getPlayersService(league, return_map === 'true');
    
    if (search && !return_map) {
      const s = search.toLowerCase();
      const filtered = Array.isArray(players)
        ? players.filter((p) => p.full_name?.toLowerCase().includes(s))
        : players;
      return res.json({ league, players: filtered, count: Array.isArray(filtered) ? filtered.length : Object.keys(filtered).length });
    }
    
    res.json({ league, players, count: Array.isArray(players) ? players.length : Object.keys(players).length });
  })
);

// ─── Real-Time SSE Streaming Proxy ───────────────────────────────────────────

/**
 * GET /predictiondata/stream
 * Proxies the PredictionData.io SSE stream to connected clients.
 * Query: league, book_ids, include_alts
 * Client usage: new EventSource('/api/v1/predictiondata/stream?league=NFL')
 * Events: 'market' (each market update), 'connected', 'error', 'done'
 */
router.get('/stream', async (req, res) => {
  const { league = '', book_ids = '', include_alts = 'false' } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const streamUrl = buildStreamUrl(league, book_ids, include_alts === 'true');
  logger.info(`[PredictionData Stream] Client connected — league=${league || 'all'}`);

  res.write('event: connected\ndata: {"status":"connected","league":"' + (league || 'all') + '"}\n\n');

  let buffer = '';

  try {
    const apiKey = (process.env.PREDICTIONDATA_API_KEY || '').replace(/^\uFEFF+/, '').trim();
    const response = await fetch(streamUrl, {
      headers: { 'X-API-KEY': apiKey, 'Accept': 'text/event-stream' },
    });

    if (!response.ok) {
      res.write(`event: error\ndata: {"error":"Upstream ${response.status}"}\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    req.on('close', () => {
      logger.info('[PredictionData Stream] Client disconnected');
      reader.cancel().catch(() => {});
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const json = line.slice(5).trim();
          if (json) {
            try {
              const market = JSON.parse(json);
              if (market && (market.id || market.fixture_id)) {
                res.write(`event: market\ndata: ${json}\n\n`);
              }
            } catch (_) {}
          }
        }
      }
    }
  } catch (err) {
    logger.error('[PredictionData Stream] Error:', err.message);
    if (!res.writableEnded) {
      res.write(`event: error\ndata: {"error":"${err.message.replace(/"/g, '\\"')}"}\n\n`);
    }
  }

  if (!res.writableEnded) {
    res.write('event: done\ndata: {"status":"stream_ended"}\n\n');
    res.end();
  }
});

/**
 * GET /predictiondata/stream/info
 * Returns SSE stream URL metadata (for direct client connections)
 */
router.get('/stream/info', (req, res) => {
  const { league = '', book_ids = '', include_alts = 'false' } = req.query;
  const streamUrl = buildStreamUrl(league, book_ids, include_alts === 'true');
  res.json({
    stream_url: streamUrl,
    protocol: 'Server-Sent Events (SSE)',
    format: 'event:market\ndata:{JSON market object}\n\n',
    event_types: ['market', 'connected', 'error', 'done'],
    market_fields: [
      'id', 'fixture_id', 'league', 'bet_type', 'period', 'side', 'side_type',
      'odds', 'open_odds', 'no_vig_odds', 'number', 'open_number', 'is_alt',
      'is_live', 'move_dir', 'prop_name', 'player_id', 'player_name',
      'team_id', 'odd_provider_id', 'provider_url', 'provider_deeplink_string',
      'updated_at',
    ],
  });
});

export const predictionDataRoutes = router;

