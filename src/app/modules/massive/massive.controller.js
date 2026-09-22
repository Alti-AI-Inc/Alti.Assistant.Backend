import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { MassiveService } from './massive.service.js';

// ── WebSocket / Real-time ─────────────────────────────────────────────

const getRealtimeTick = catchAsync(async (req, res) => {
  const { assetClass, ticker } = req.params;
  const result = MassiveService.getRealtimeTick(assetClass, ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: result ? 'Realtime tick' : 'No data (subscribe first)', data: result || {} });
});

const subscribeRealtime = catchAsync(async (req, res) => {
  const { assetClass } = req.params;
  const { tickers } = req.body; // e.g. ["T.AAPL","Q.AAPL"]
  const result = MassiveService.subscribeRealtime(assetClass, tickers);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Subscribed', data: result });
});

const unsubscribeRealtime = catchAsync(async (req, res) => {
  const { assetClass } = req.params;
  const { tickers } = req.body;
  const result = MassiveService.unsubscribeRealtime(assetClass, tickers);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Unsubscribed', data: result });
});

const getConnectionStatus = catchAsync(async (req, res) => {
  const result = MassiveService.getConnectionStatus();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'WebSocket status', data: result });
});

// ── Stocks — Aggregates ───────────────────────────────────────────────

const getStockAggregates = catchAsync(async (req, res) => {
  const { ticker, multiplier, timespan, from, to } = req.params;
  const result = await MassiveService.getStockAggregates(ticker, multiplier, timespan, from, to, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Stock aggregates', data: result });
});

const getStockDailyMarketSummary = catchAsync(async (req, res) => {
  const { date } = req.params;
  const result = await MassiveService.getStockDailyMarketSummary(date, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Daily market summary', data: result });
});

const getStockDailyTickerSummary = catchAsync(async (req, res) => {
  const { ticker, date } = req.params;
  const result = await MassiveService.getStockDailyTickerSummary(ticker, date, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Daily ticker summary', data: result });
});

const getStockPreviousDayBar = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await MassiveService.getStockPreviousDayBar(ticker, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Previous day bar', data: result });
});

// ── Stocks — Trades & Quotes ──────────────────────────────────────────

const getStockTrades = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await MassiveService.getStockTrades(ticker, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Stock trades', data: result });
});

const getStockLastTrade = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await MassiveService.getStockLastTrade(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Last trade', data: result });
});

const getStockQuotes = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await MassiveService.getStockQuotes(ticker, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Stock quotes', data: result });
});

const getStockLastQuote = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await MassiveService.getStockLastQuote(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Last NBBO quote', data: result });
});

// ── Snapshots ─────────────────────────────────────────────────────────

const getUnifiedSnapshot = catchAsync(async (req, res) => {
  const result = await MassiveService.getUnifiedSnapshot(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Unified snapshot', data: result });
});

const getUnifiedTickerSnapshot = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await MassiveService.getUnifiedTickerSnapshot(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Ticker snapshot', data: result });
});

const getStockFullMarketSnapshot = catchAsync(async (req, res) => {
  const result = await MassiveService.getStockFullMarketSnapshot(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Full market snapshot', data: result });
});

const getStockSingleSnapshot = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await MassiveService.getStockSingleSnapshot(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Stock snapshot', data: result });
});

const getStockTopMovers = catchAsync(async (req, res) => {
  const { direction } = req.params;
  const result = await MassiveService.getStockTopMovers(direction, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Top ${direction}`, data: result });
});

// ── Technical Indicators ──────────────────────────────────────────────

const getIndicator = catchAsync(async (req, res) => {
  const { indicator, ticker } = req.params;
  const result = await MassiveService.getIndicator(indicator, ticker, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `${indicator.toUpperCase()} indicator`, data: result });
});

// ── Reference / Fundamentals ──────────────────────────────────────────

const getTickers = catchAsync(async (req, res) => {
  const result = await MassiveService.getTickers(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Tickers', data: result });
});

const getTickerDetails = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await MassiveService.getTickerDetails(ticker, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Ticker details', data: result });
});

const getRelatedTickers = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await MassiveService.getRelatedTickers(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Related tickers', data: result });
});

const getNews = catchAsync(async (req, res) => {
  const result = await MassiveService.getNews(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'News', data: result });
});

const getDividends = catchAsync(async (req, res) => {
  const result = await MassiveService.getDividends(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Dividends', data: result });
});

const getSplits = catchAsync(async (req, res) => {
  const result = await MassiveService.getSplits(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Splits', data: result });
});

const getFinancials = catchAsync(async (req, res) => {
  const result = await MassiveService.getFinancials(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Financials', data: result });
});

const getIPOs = catchAsync(async (req, res) => {
  const result = await MassiveService.getIPOs(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'IPOs', data: result });
});

// ── Market Operations ─────────────────────────────────────────────────

const getMarketStatus = catchAsync(async (req, res) => {
  const result = await MassiveService.getMarketStatus();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Market status', data: result });
});

const getMarketHolidays = catchAsync(async (req, res) => {
  const result = await MassiveService.getMarketHolidays();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Market holidays', data: result });
});

const getExchanges = catchAsync(async (req, res) => {
  const result = await MassiveService.getExchanges(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Exchanges', data: result });
});

// ── Options ───────────────────────────────────────────────────────────

const getOptionsChainSnapshot = catchAsync(async (req, res) => {
  const { underlying } = req.params;
  const result = await MassiveService.getOptionsChainSnapshot(underlying, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Options chain', data: result });
});

const getOptionsContracts = catchAsync(async (req, res) => {
  const result = await MassiveService.getOptionsContracts(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Options contracts', data: result });
});

// ── Futures ───────────────────────────────────────────────────────────

const getFuturesContracts = catchAsync(async (req, res) => {
  const result = await MassiveService.getFuturesContracts(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Futures contracts', data: result });
});

const getFuturesProducts = catchAsync(async (req, res) => {
  const result = await MassiveService.getFuturesProducts(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Futures products', data: result });
});

const getFuturesMarketStatus = catchAsync(async (req, res) => {
  const result = await MassiveService.getFuturesMarketStatus();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Futures market status', data: result });
});

// ── Forex ─────────────────────────────────────────────────────────────

const getCurrencyConversion = catchAsync(async (req, res) => {
  const { from, to } = req.params;
  const result = await MassiveService.getCurrencyConversion(from, to, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Currency conversion', data: result });
});

const getForexSnapshot = catchAsync(async (req, res) => {
  const result = await MassiveService.getForexSnapshot(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Forex snapshot', data: result });
});

const getForexTopMovers = catchAsync(async (req, res) => {
  const { direction } = req.params;
  const result = await MassiveService.getForexTopMovers(direction);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Forex ${direction}`, data: result });
});

// ── Crypto ────────────────────────────────────────────────────────────

const getCryptoSnapshot = catchAsync(async (req, res) => {
  const result = await MassiveService.getCryptoSnapshot(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Crypto snapshot', data: result });
});

const getCryptoSingleSnapshot = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await MassiveService.getCryptoSingleSnapshot(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Crypto ticker snapshot', data: result });
});

const getCryptoTopMovers = catchAsync(async (req, res) => {
  const { direction } = req.params;
  const result = await MassiveService.getCryptoTopMovers(direction);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Crypto ${direction}`, data: result });
});

const getCryptoOrderBook = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await MassiveService.getCryptoOrderBook(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Crypto order book', data: result });
});

// ── Generic passthrough ───────────────────────────────────────────────

const rawProxy = catchAsync(async (req, res) => {
  const massivePath = req.params[0]; // wildcard capture
  const result = await MassiveService.rawGet(`/${massivePath}`, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Massive proxy: /${massivePath}`, data: result });
});

export const MassiveController = {
  // WebSocket
  getRealtimeTick, subscribeRealtime, unsubscribeRealtime, getConnectionStatus,
  // Stocks Aggregates
  getStockAggregates, getStockDailyMarketSummary, getStockDailyTickerSummary, getStockPreviousDayBar,
  // Stocks Trades/Quotes
  getStockTrades, getStockLastTrade, getStockQuotes, getStockLastQuote,
  // Snapshots
  getUnifiedSnapshot, getUnifiedTickerSnapshot, getStockFullMarketSnapshot, getStockSingleSnapshot, getStockTopMovers,
  // Indicators
  getIndicator,
  // Reference
  getTickers, getTickerDetails, getRelatedTickers, getNews, getDividends, getSplits, getFinancials, getIPOs,
  // Market Ops
  getMarketStatus, getMarketHolidays, getExchanges,
  // Options
  getOptionsChainSnapshot, getOptionsContracts,
  // Futures
  getFuturesContracts, getFuturesProducts, getFuturesMarketStatus,
  // Forex
  getCurrencyConversion, getForexSnapshot, getForexTopMovers,
  // Crypto
  getCryptoSnapshot, getCryptoSingleSnapshot, getCryptoTopMovers, getCryptoOrderBook,
  // Proxy
  rawProxy,
};

export default MassiveController;
