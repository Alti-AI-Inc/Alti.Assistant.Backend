import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { CoinApiService } from './coinapi.service.js';

// ── Metadata ──────────────────────────────────────────────────────────

const getExchanges = catchAsync(async (req, res) => {
  const result = await CoinApiService.getExchanges(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Exchanges', data: result });
});

const getExchange = catchAsync(async (req, res) => {
  const result = await CoinApiService.getExchange(req.params.exchangeId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Exchange', data: result });
});

const getExchangeIcons = catchAsync(async (req, res) => {
  const result = await CoinApiService.getExchangeIcons(req.params.size || 32);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Exchange icons', data: result });
});

const getAssets = catchAsync(async (req, res) => {
  const result = await CoinApiService.getAssets(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Assets', data: result });
});

const getAsset = catchAsync(async (req, res) => {
  const result = await CoinApiService.getAsset(req.params.assetId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Asset', data: result });
});

const getAssetIcons = catchAsync(async (req, res) => {
  const result = await CoinApiService.getAssetIcons(req.params.size || 32);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Asset icons', data: result });
});

const getSymbols = catchAsync(async (req, res) => {
  const result = await CoinApiService.getSymbols(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Symbols', data: result });
});

// ── Exchange Rates ────────────────────────────────────────────────────

const getExchangeRate = catchAsync(async (req, res) => {
  const { base, quote } = req.params;
  const result = await CoinApiService.getExchangeRate(base, quote);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Rate: ${base}/${quote}`, data: result });
});

const getAllExchangeRates = catchAsync(async (req, res) => {
  const result = await CoinApiService.getAllExchangeRates(req.params.base, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'All rates', data: result });
});

const getExchangeRateHistory = catchAsync(async (req, res) => {
  const { base, quote } = req.params;
  const result = await CoinApiService.getExchangeRateHistory(base, quote, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Rate history: ${base}/${quote}`, data: result });
});

// ── OHLCV ─────────────────────────────────────────────────────────────

const getOhlcvPeriods = catchAsync(async (req, res) => {
  const result = await CoinApiService.getOhlcvPeriods();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'OHLCV periods', data: result });
});

const getOhlcvLatest = catchAsync(async (req, res) => {
  const result = await CoinApiService.getOhlcvLatest(req.params.symbolId, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'OHLCV latest', data: result });
});

const getOhlcvHistory = catchAsync(async (req, res) => {
  const result = await CoinApiService.getOhlcvHistory(req.params.symbolId, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'OHLCV history', data: result });
});

// ── Trades ─────────────────────────────────────────────────────────────

const getTradesLatest = catchAsync(async (req, res) => {
  const result = await CoinApiService.getTradesLatest(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Latest trades', data: result });
});

const getTradesLatestBySymbol = catchAsync(async (req, res) => {
  const result = await CoinApiService.getTradesLatestBySymbol(req.params.symbolId, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Symbol trades', data: result });
});

const getTradesHistory = catchAsync(async (req, res) => {
  const result = await CoinApiService.getTradesHistory(req.params.symbolId, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Trade history', data: result });
});

// ── Quotes ─────────────────────────────────────────────────────────────

const getQuotesCurrent = catchAsync(async (req, res) => {
  const result = await CoinApiService.getQuotesCurrent(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Current quotes', data: result });
});

const getQuoteCurrentBySymbol = catchAsync(async (req, res) => {
  const result = await CoinApiService.getQuoteCurrentBySymbol(req.params.symbolId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Symbol quote', data: result });
});

const getQuotesHistory = catchAsync(async (req, res) => {
  const result = await CoinApiService.getQuotesHistory(req.params.symbolId, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Quote history', data: result });
});

// ── Order Books ───────────────────────────────────────────────────────

const getOrderbooksCurrent = catchAsync(async (req, res) => {
  const result = await CoinApiService.getOrderbooksCurrent(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Current orderbooks', data: result });
});

const getOrderbookBySymbol = catchAsync(async (req, res) => {
  const result = await CoinApiService.getOrderbookCurrentBySymbol(req.params.symbolId, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Symbol orderbook', data: result });
});

const getOrderbooksHistory = catchAsync(async (req, res) => {
  const result = await CoinApiService.getOrderbooksHistory(req.params.symbolId, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Orderbook history', data: result });
});

// ── Indexes ───────────────────────────────────────────────────────────

const getIndexes = catchAsync(async (req, res) => {
  const result = await CoinApiService.getIndexes(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Indexes', data: result });
});

const getIndex = catchAsync(async (req, res) => {
  const result = await CoinApiService.getIndex(req.params.indexId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Index', data: result });
});

const getIndexHistory = catchAsync(async (req, res) => {
  const result = await CoinApiService.getIndexHistory(req.params.indexId, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Index history', data: result });
});

// ── Metrics ───────────────────────────────────────────────────────────

const getMetricsListing = catchAsync(async (req, res) => {
  const result = await CoinApiService.getMetricsListing();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Metrics listing', data: result });
});

const getExchangeMetricsCurrent = catchAsync(async (req, res) => {
  const result = await CoinApiService.getExchangeMetricsCurrent(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Exchange metrics', data: result });
});

const getExchangeMetricsHistory = catchAsync(async (req, res) => {
  const result = await CoinApiService.getExchangeMetricsHistory(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Exchange metrics history', data: result });
});

const getSymbolMetricsCurrent = catchAsync(async (req, res) => {
  const result = await CoinApiService.getSymbolMetricsCurrent(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Symbol metrics', data: result });
});

const getAssetMetricsCurrent = catchAsync(async (req, res) => {
  const result = await CoinApiService.getAssetMetricsCurrent(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Asset metrics', data: result });
});

// ── WebSocket Controls ────────────────────────────────────────────────

const wsConnect = catchAsync(async (req, res) => {
  const { dataTypes, symbols, assets, exchanges } = req.body;
  // Connect and cache messages for polling
  if (!CoinApiService._wsMessageBuffer) CoinApiService._wsMessageBuffer = [];
  CoinApiService.connectWebSocket(
    { dataTypes: dataTypes || ['trade'], symbols, assets, exchanges },
    (msg) => {
      CoinApiService._wsMessageBuffer.push(msg);
      if (CoinApiService._wsMessageBuffer.length > 1000) CoinApiService._wsMessageBuffer.shift();
    },
    () => {}
  );
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'WebSocket connected', data: { status: 'connected', dataTypes } });
});

const wsDisconnect = catchAsync(async (req, res) => {
  CoinApiService.disconnectWebSocket();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'WebSocket disconnected', data: {} });
});

const wsStatus = catchAsync(async (req, res) => {
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'WebSocket status', data: { connected: CoinApiService.isWebSocketConnected(), bufferedMessages: CoinApiService._wsMessageBuffer?.length || 0 } });
});

const wsMessages = catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const msgs = (CoinApiService._wsMessageBuffer || []).slice(-limit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Recent WS messages', data: msgs });
});

// ── Raw Proxy ─────────────────────────────────────────────────────────

const rawProxy = catchAsync(async (req, res) => {
  const path = '/' + req.params[0];
  const result = await CoinApiService.rawGet(path, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Proxy: ${path}`, data: result });
});

export const CoinApiController = {
  getExchanges, getExchange, getExchangeIcons,
  getAssets, getAsset, getAssetIcons, getSymbols,
  getExchangeRate, getAllExchangeRates, getExchangeRateHistory,
  getOhlcvPeriods, getOhlcvLatest, getOhlcvHistory,
  getTradesLatest, getTradesLatestBySymbol, getTradesHistory,
  getQuotesCurrent, getQuoteCurrentBySymbol, getQuotesHistory,
  getOrderbooksCurrent, getOrderbookBySymbol, getOrderbooksHistory,
  getIndexes, getIndex, getIndexHistory,
  getMetricsListing, getExchangeMetricsCurrent, getExchangeMetricsHistory,
  getSymbolMetricsCurrent, getAssetMetricsCurrent,
  wsConnect, wsDisconnect, wsStatus, wsMessages,
  rawProxy,
};

export default CoinApiController;
