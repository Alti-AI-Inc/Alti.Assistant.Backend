import express from 'express';
import {
  getMarketsService,
  getFixturesService,
  getPlayersService,
  getTeamsService,
  getSeasonsService,
  getFuturesMarketsService,
} from './predictiondata.service.js';
import { logger } from '../../../shared/logger.js';

const router = express.Router();

// ─── Helper ───────────────────────────────────────────────────────────────────
const handleAsync = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    logger.error('[PredictionData Route]', err.message);
    res.status(500).json({ error: err.message });
  });

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /predictiondata/markets
 * Query: league, bet_types, periods, book_ids, is_live, timedelta
 */
router.get(
  '/markets',
  handleAsync(async (req, res) => {
    const {
      league = 'NFL',
      bet_types = 'moneyline,spread,total',
      periods = 'FT',
      book_ids = '100,400,117',
      is_live = 'false',
      timedelta = 24,
    } = req.query;
    const data = await getMarketsService(
      league,
      bet_types,
      periods,
      book_ids,
      { isLive: is_live === 'true', timedelta: Number(timedelta) }
    );
    res.json({ markets: data, count: data.length });
  })
);

/**
 * GET /predictiondata/futures/:league
 */
router.get(
  '/futures/:league',
  handleAsync(async (req, res) => {
    const { league } = req.params;
    const { book_ids = '100,400,117' } = req.query;
    const data = await getFuturesMarketsService(league.toUpperCase(), book_ids);
    res.json({ futures: data, count: data.length });
  })
);

/**
 * GET /predictiondata/fixtures
 * Query: leagues (comma-separated), timedelta (hours)
 */
router.get(
  '/fixtures',
  handleAsync(async (req, res) => {
    const { leagues = 'NFL', timedelta = 48 } = req.query;
    const data = await getFixturesService(leagues, Number(timedelta));
    res.json({ fixtures: data, count: data.length });
  })
);

/**
 * GET /predictiondata/players/:league
 */
router.get(
  '/players/:league',
  handleAsync(async (req, res) => {
    const { league } = req.params;
    const { return_map = 'true' } = req.query;
    const data = await getPlayersService(league.toUpperCase(), return_map === 'true');
    res.json({ players: data });
  })
);

/**
 * GET /predictiondata/teams/:league
 */
router.get(
  '/teams/:league',
  handleAsync(async (req, res) => {
    const { league } = req.params;
    const { return_map = 'true' } = req.query;
    const data = await getTeamsService(league.toUpperCase(), return_map === 'true');
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

export const predictionDataRoutes = router;
