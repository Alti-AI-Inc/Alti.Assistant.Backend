import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { CoinApiController } from './coinapi.controller.js';

const router = express.Router();

router.use(auth());

// ═══════════════════════════════════════════════════════════════════════
// METADATA
// ═══════════════════════════════════════════════════════════════════════

router.get('/exchanges', CoinApiController.getExchanges);
router.get('/exchanges/icons/:size', CoinApiController.getExchangeIcons);
router.get('/exchanges/:exchangeId', CoinApiController.getExchange);

router.get('/assets', CoinApiController.getAssets);
router.get('/assets/icons/:size', CoinApiController.getAssetIcons);
router.get('/assets/:assetId', CoinApiController.getAsset);

router.get('/symbols', CoinApiController.getSymbols);

// ═══════════════════════════════════════════════════════════════════════
// EXCHANGE RATES
// ═══════════════════════════════════════════════════════════════════════

router.get('/exchangerate/:base', CoinApiController.getAllExchangeRates);
router.get('/exchangerate/:base/:quote', CoinApiController.getExchangeRate);
router.get('/exchangerate/:base/:quote/history', CoinApiController.getExchangeRateHistory);

// ═══════════════════════════════════════════════════════════════════════
// OHLCV (Candlesticks)
// ═══════════════════════════════════════════════════════════════════════

router.get('/ohlcv/periods', CoinApiController.getOhlcvPeriods);
router.get('/ohlcv/:symbolId/latest', CoinApiController.getOhlcvLatest);
router.get('/ohlcv/:symbolId/history', CoinApiController.getOhlcvHistory);

// ═══════════════════════════════════════════════════════════════════════
// TRADES
// ═══════════════════════════════════════════════════════════════════════

router.get('/trades/latest', CoinApiController.getTradesLatest);
router.get('/trades/:symbolId/latest', CoinApiController.getTradesLatestBySymbol);
router.get('/trades/:symbolId/history', CoinApiController.getTradesHistory);

// ═══════════════════════════════════════════════════════════════════════
// QUOTES
// ═══════════════════════════════════════════════════════════════════════

router.get('/quotes/current', CoinApiController.getQuotesCurrent);
router.get('/quotes/:symbolId/current', CoinApiController.getQuoteCurrentBySymbol);
router.get('/quotes/:symbolId/history', CoinApiController.getQuotesHistory);

// ═══════════════════════════════════════════════════════════════════════
// ORDER BOOKS
// ═══════════════════════════════════════════════════════════════════════

router.get('/orderbooks/current', CoinApiController.getOrderbooksCurrent);
router.get('/orderbooks/:symbolId/current', CoinApiController.getOrderbookBySymbol);
router.get('/orderbooks/:symbolId/history', CoinApiController.getOrderbooksHistory);

// ═══════════════════════════════════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════════════════════════════════

router.get('/indexes', CoinApiController.getIndexes);
router.get('/indexes/:indexId', CoinApiController.getIndex);
router.get('/indexes/:indexId/history', CoinApiController.getIndexHistory);

// ═══════════════════════════════════════════════════════════════════════
// METRICS
// ═══════════════════════════════════════════════════════════════════════

router.get('/metrics/listing', CoinApiController.getMetricsListing);
router.get('/metrics/exchange/current', CoinApiController.getExchangeMetricsCurrent);
router.get('/metrics/exchange/history', CoinApiController.getExchangeMetricsHistory);
router.get('/metrics/symbol/current', CoinApiController.getSymbolMetricsCurrent);
router.get('/metrics/asset/current', CoinApiController.getAssetMetricsCurrent);

// ═══════════════════════════════════════════════════════════════════════
// WEBSOCKET CONTROLS
// ═══════════════════════════════════════════════════════════════════════

router.post('/ws/connect', CoinApiController.wsConnect);
router.post('/ws/disconnect', CoinApiController.wsDisconnect);
router.get('/ws/status', CoinApiController.wsStatus);
router.get('/ws/messages', CoinApiController.wsMessages);

// ═══════════════════════════════════════════════════════════════════════
// RAW PROXY — catch-all for any unmapped CoinAPI v1 endpoint
// ═══════════════════════════════════════════════════════════════════════

router.get('/proxy/*', CoinApiController.rawProxy);

export const CoinApiRoutes = router;
export default CoinApiRoutes;
