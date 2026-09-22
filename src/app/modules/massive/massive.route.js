import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { MassiveController } from './massive.controller.js';

const router = express.Router();

router.use(auth());

// ═══════════════════════════════════════════════════════════════════════
// WEBSOCKET CONTROL (manage subscriptions from HTTP)
// ═══════════════════════════════════════════════════════════════════════

router.get('/ws/status', MassiveController.getConnectionStatus);
router.get('/ws/:assetClass/tick/:ticker', MassiveController.getRealtimeTick);
router.post('/ws/:assetClass/subscribe', MassiveController.subscribeRealtime);
router.post('/ws/:assetClass/unsubscribe', MassiveController.unsubscribeRealtime);

// ═══════════════════════════════════════════════════════════════════════
// MARKET STATUS & OPERATIONS
// ═══════════════════════════════════════════════════════════════════════

router.get('/market/status', MassiveController.getMarketStatus);
router.get('/market/holidays', MassiveController.getMarketHolidays);
router.get('/market/exchanges', MassiveController.getExchanges);

// ═══════════════════════════════════════════════════════════════════════
// UNIFIED SNAPSHOTS (cross-asset)
// ═══════════════════════════════════════════════════════════════════════

router.get('/snapshot', MassiveController.getUnifiedSnapshot);
router.get('/snapshot/:ticker', MassiveController.getUnifiedTickerSnapshot);

// ═══════════════════════════════════════════════════════════════════════
// STOCKS
// ═══════════════════════════════════════════════════════════════════════

// Aggregates
router.get('/stocks/aggs/:ticker/range/:multiplier/:timespan/:from/:to', MassiveController.getStockAggregates);
router.get('/stocks/aggs/market/:date', MassiveController.getStockDailyMarketSummary);
router.get('/stocks/aggs/:ticker/daily/:date', MassiveController.getStockDailyTickerSummary);
router.get('/stocks/aggs/:ticker/prev', MassiveController.getStockPreviousDayBar);
// Trades & Quotes
router.get('/stocks/trades/:ticker', MassiveController.getStockTrades);
router.get('/stocks/trades/:ticker/last', MassiveController.getStockLastTrade);
router.get('/stocks/quotes/:ticker', MassiveController.getStockQuotes);
router.get('/stocks/quotes/:ticker/last', MassiveController.getStockLastQuote);
// Snapshots
router.get('/stocks/snapshot', MassiveController.getStockFullMarketSnapshot);
router.get('/stocks/snapshot/:ticker', MassiveController.getStockSingleSnapshot);
router.get('/stocks/movers/:direction', MassiveController.getStockTopMovers);
// Technical Indicators
router.get('/stocks/indicators/:indicator/:ticker', MassiveController.getIndicator);
// Reference
router.get('/stocks/tickers', MassiveController.getTickers);
router.get('/stocks/tickers/:ticker', MassiveController.getTickerDetails);
router.get('/stocks/tickers/:ticker/related', MassiveController.getRelatedTickers);
router.get('/stocks/news', MassiveController.getNews);
router.get('/stocks/dividends', MassiveController.getDividends);
router.get('/stocks/splits', MassiveController.getSplits);
router.get('/stocks/financials', MassiveController.getFinancials);
router.get('/stocks/ipos', MassiveController.getIPOs);

// ═══════════════════════════════════════════════════════════════════════
// OPTIONS
// ═══════════════════════════════════════════════════════════════════════

router.get('/options/chain/:underlying', MassiveController.getOptionsChainSnapshot);
router.get('/options/contracts', MassiveController.getOptionsContracts);

// ═══════════════════════════════════════════════════════════════════════
// FUTURES
// ═══════════════════════════════════════════════════════════════════════

router.get('/futures/contracts', MassiveController.getFuturesContracts);
router.get('/futures/products', MassiveController.getFuturesProducts);
router.get('/futures/status', MassiveController.getFuturesMarketStatus);

// ═══════════════════════════════════════════════════════════════════════
// FOREX
// ═══════════════════════════════════════════════════════════════════════

router.get('/forex/convert/:from/:to', MassiveController.getCurrencyConversion);
router.get('/forex/snapshot', MassiveController.getForexSnapshot);
router.get('/forex/movers/:direction', MassiveController.getForexTopMovers);

// ═══════════════════════════════════════════════════════════════════════
// CRYPTO
// ═══════════════════════════════════════════════════════════════════════

router.get('/crypto/snapshot', MassiveController.getCryptoSnapshot);
router.get('/crypto/snapshot/:ticker', MassiveController.getCryptoSingleSnapshot);
router.get('/crypto/movers/:direction', MassiveController.getCryptoTopMovers);
router.get('/crypto/orderbook/:ticker', MassiveController.getCryptoOrderBook);

// ═══════════════════════════════════════════════════════════════════════
// RAW PROXY — Catch-all for any Massive API path not mapped above
//   e.g. GET /api/v1/massive/proxy/v3/reference/dividends?ticker=AAPL
// ═══════════════════════════════════════════════════════════════════════

router.get('/proxy/*', MassiveController.rawProxy);

export const MassiveRoutes = router;
export default MassiveRoutes;
