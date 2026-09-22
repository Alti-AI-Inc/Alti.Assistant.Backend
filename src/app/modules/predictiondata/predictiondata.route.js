import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { PredictionDataController } from './predictiondata.controller.js';

const router = express.Router();

router.use(auth());

// ═══════════════════════════════════════════════════════════════════════
// MARKETS — betting odds from 200+ sportsbooks + prediction markets
// ═══════════════════════════════════════════════════════════════════════

router.get('/markets', PredictionDataController.getMarkets);
router.get('/markets/moneylines', PredictionDataController.getMoneylines);
router.get('/markets/spreads', PredictionDataController.getSpreads);
router.get('/markets/totals', PredictionDataController.getTotals);
router.get('/markets/props', PredictionDataController.getProps);
router.get('/markets/futures', PredictionDataController.getFutures);
router.get('/markets/live', PredictionDataController.getLiveMarkets);
router.get('/markets/pregame', PredictionDataController.getPregameMarkets);
router.get('/markets/alt-lines', PredictionDataController.getAltLineMarkets);

// ═══════════════════════════════════════════════════════════════════════
// REFERENCE DATA
// ═══════════════════════════════════════════════════════════════════════

router.get('/players', PredictionDataController.getPlayers);
router.get('/teams', PredictionDataController.getTeams);
router.get('/fixtures', PredictionDataController.getFixtures);

// ═══════════════════════════════════════════════════════════════════════
// SSE REAL-TIME STREAM — pass-through to client
// ═══════════════════════════════════════════════════════════════════════

router.get('/stream', PredictionDataController.connectStream);
router.get('/stream/list', PredictionDataController.listStreams);
router.post('/stream/disconnect-all', PredictionDataController.disconnectAllStreams);

// ═══════════════════════════════════════════════════════════════════════
// MARKET POLLING — cached live market data
// ═══════════════════════════════════════════════════════════════════════

router.post('/polling/:league/start', PredictionDataController.startMarketPolling);
router.post('/polling/:league/stop', PredictionDataController.stopMarketPolling);
router.get('/polling/:league/cached', PredictionDataController.getCachedMarkets);
router.get('/polling/all', PredictionDataController.getAllCachedMarkets);

// ═══════════════════════════════════════════════════════════════════════
// RAW PROXY
// ═══════════════════════════════════════════════════════════════════════

router.get('/proxy/*', PredictionDataController.rawProxy);

export const PredictionDataRoutes = router;
export default PredictionDataRoutes;
