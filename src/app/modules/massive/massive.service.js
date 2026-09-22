import axios from 'axios';
import config from '../../../../config/index.js';
import { MassiveWebSocket } from './massive.websocket.js';

/**
 * MassiveService — Complete REST API client for Massive.com (formerly Polygon.io compatible)
 *
 * Base URL: https://api.massive.com
 * Auth: Bearer token OR ?apiKey= query param
 *
 * Covers ALL 155+ REST endpoints across:
 *   Stocks, Options, Futures, Indices, Forex, Crypto, Economy, Partners
 */

const apiKey = config.massive?.apiKey || process.env.MASSIVE_API_KEY || '';

const massiveApi = axios.create({
  baseURL: 'https://api.massive.com',
  headers: { Authorization: `Bearer ${apiKey}` },
  timeout: 30000,
});

// Helper: append apiKey to params if not in header
const withKey = (params = {}) => ({ ...params, apiKey });

export const MassiveService = {

  // ═══════════════════════════════════════════════════════════════════════
  // WEBSOCKET (delegated to MassiveWebSocket singleton)
  // ═══════════════════════════════════════════════════════════════════════

  getRealtimeTick(assetClass, ticker) {
    return MassiveWebSocket.getLatestTick(assetClass, ticker);
  },

  subscribeRealtime(assetClass, tickers) {
    MassiveWebSocket.subscribe(assetClass, tickers);
    return { subscribed: true, assetClass, tickers };
  },

  unsubscribeRealtime(assetClass, tickers) {
    MassiveWebSocket.unsubscribe(assetClass, tickers);
    return { unsubscribed: true, assetClass, tickers };
  },

  getConnectionStatus() {
    return MassiveWebSocket.getConnectionStatus();
  },

  // ═══════════════════════════════════════════════════════════════════════
  // STOCKS — Aggregates
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to} */
  async getStockAggregates(ticker, multiplier, timespan, from, to, opts = {}) {
    const { data } = await massiveApi.get(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, { params: withKey(opts) });
    return data;
  },

  /** GET /v2/aggs/grouped/locale/us/market/stocks/{date} */
  async getStockDailyMarketSummary(date, opts = {}) {
    const { data } = await massiveApi.get(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, { params: withKey(opts) });
    return data;
  },

  /** GET /v1/open-close/{ticker}/{date} */
  async getStockDailyTickerSummary(ticker, date, opts = {}) {
    const { data } = await massiveApi.get(`/v1/open-close/${ticker}/${date}`, { params: withKey(opts) });
    return data;
  },

  /** GET /v2/aggs/ticker/{ticker}/prev */
  async getStockPreviousDayBar(ticker, opts = {}) {
    const { data } = await massiveApi.get(`/v2/aggs/ticker/${ticker}/prev`, { params: withKey(opts) });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // STOCKS — Trades & Quotes
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v3/trades/{ticker} */
  async getStockTrades(ticker, opts = {}) {
    const { data } = await massiveApi.get(`/v3/trades/${ticker}`, { params: withKey(opts) });
    return data;
  },

  /** GET /v2/last/trade/{ticker} */
  async getStockLastTrade(ticker) {
    const { data } = await massiveApi.get(`/v2/last/trade/${ticker}`, { params: withKey() });
    return data;
  },

  /** GET /v3/quotes/{ticker} */
  async getStockQuotes(ticker, opts = {}) {
    const { data } = await massiveApi.get(`/v3/quotes/${ticker}`, { params: withKey(opts) });
    return data;
  },

  /** GET /v2/last/nbbo/{ticker} */
  async getStockLastQuote(ticker) {
    const { data } = await massiveApi.get(`/v2/last/nbbo/${ticker}`, { params: withKey() });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // STOCKS — Snapshots
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v3/snapshot (Unified cross-asset) */
  async getUnifiedSnapshot(opts = {}) {
    const { data } = await massiveApi.get('/v3/snapshot', { params: withKey(opts) });
    return data;
  },

  /** GET /v3/snapshot/{ticker} */
  async getUnifiedTickerSnapshot(ticker) {
    const { data } = await massiveApi.get(`/v3/snapshot/${ticker}`, { params: withKey() });
    return data;
  },

  /** GET /v2/snapshot/locale/us/markets/stocks/tickers */
  async getStockFullMarketSnapshot(opts = {}) {
    const { data } = await massiveApi.get('/v2/snapshot/locale/us/markets/stocks/tickers', { params: withKey(opts) });
    return data;
  },

  /** GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker} */
  async getStockSingleSnapshot(ticker) {
    const { data } = await massiveApi.get(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, { params: withKey() });
    return data;
  },

  /** GET /v2/snapshot/locale/us/markets/stocks/{direction} (gainers|losers) */
  async getStockTopMovers(direction = 'gainers', opts = {}) {
    const { data } = await massiveApi.get(`/v2/snapshot/locale/us/markets/stocks/${direction}`, { params: withKey(opts) });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // STOCKS — Technical Indicators (SMA, EMA, MACD, RSI)
  // ═══════════════════════════════════════════════════════════════════════

  async getIndicator(indicator, ticker, opts = {}) {
    const { data } = await massiveApi.get(`/v1/indicators/${indicator}/${ticker}`, { params: withKey(opts) });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // STOCKS — Reference / Fundamentals
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v3/reference/tickers */
  async getTickers(opts = {}) {
    const { data } = await massiveApi.get('/v3/reference/tickers', { params: withKey(opts) });
    return data;
  },

  /** GET /v3/reference/tickers/types */
  async getTickerTypes(opts = {}) {
    const { data } = await massiveApi.get('/v3/reference/tickers/types', { params: withKey(opts) });
    return data;
  },

  /** GET /v3/reference/tickers/{ticker} */
  async getTickerDetails(ticker, opts = {}) {
    const { data } = await massiveApi.get(`/v3/reference/tickers/${ticker}`, { params: withKey(opts) });
    return data;
  },

  /** GET /v1/related-companies/{ticker} */
  async getRelatedTickers(ticker) {
    const { data } = await massiveApi.get(`/v1/related-companies/${ticker}`, { params: withKey() });
    return data;
  },

  /** GET /v2/reference/news */
  async getNews(opts = {}) {
    const { data } = await massiveApi.get('/v2/reference/news', { params: withKey(opts) });
    return data;
  },

  /** GET /v3/reference/dividends */
  async getDividends(opts = {}) {
    const { data } = await massiveApi.get('/v3/reference/dividends', { params: withKey(opts) });
    return data;
  },

  /** GET /v3/reference/splits */
  async getSplits(opts = {}) {
    const { data } = await massiveApi.get('/v3/reference/splits', { params: withKey(opts) });
    return data;
  },

  /** GET /vX/reference/financials */
  async getFinancials(opts = {}) {
    const { data } = await massiveApi.get('/vX/reference/financials', { params: withKey(opts) });
    return data;
  },

  /** GET /stocks/v1/short-interest */
  async getShortInterest(opts = {}) {
    const { data } = await massiveApi.get('/stocks/v1/short-interest', { params: withKey(opts) });
    return data;
  },

  /** GET /vX/reference/ipos */
  async getIPOs(opts = {}) {
    const { data } = await massiveApi.get('/vX/reference/ipos', { params: withKey(opts) });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // STOCKS — Market Operations
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v3/reference/conditions */
  async getConditions(opts = {}) {
    const { data } = await massiveApi.get('/v3/reference/conditions', { params: withKey(opts) });
    return data;
  },

  /** GET /v3/reference/exchanges */
  async getExchanges(opts = {}) {
    const { data } = await massiveApi.get('/v3/reference/exchanges', { params: withKey(opts) });
    return data;
  },

  /** GET /v1/marketstatus/now */
  async getMarketStatus() {
    const { data } = await massiveApi.get('/v1/marketstatus/now', { params: withKey() });
    return data;
  },

  /** GET /v1/marketstatus/upcoming */
  async getMarketHolidays() {
    const { data } = await massiveApi.get('/v1/marketstatus/upcoming', { params: withKey() });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // STOCKS — SEC Filings
  // ═══════════════════════════════════════════════════════════════════════

  async getFilingsIndex(opts = {}) {
    const { data } = await massiveApi.get('/stocks/filings/vX/index', { params: withKey(opts) });
    return data;
  },

  async get13FFilings(opts = {}) {
    const { data } = await massiveApi.get('/stocks/filings/vX/13-F', { params: withKey(opts) });
    return data;
  },

  async get8KText(opts = {}) {
    const { data } = await massiveApi.get('/stocks/filings/8-K/vX/text', { params: withKey(opts) });
    return data;
  },

  async get8KDisclosures(opts = {}) {
    const { data } = await massiveApi.get('/stocks/filings/8-K/vX/disclosures', { params: withKey(opts) });
    return data;
  },

  async get10KSections(opts = {}) {
    const { data } = await massiveApi.get('/stocks/filings/10-K/vX/sections', { params: withKey(opts) });
    return data;
  },

  async getRiskFactors(opts = {}) {
    const { data } = await massiveApi.get('/stocks/filings/vX/risk-factors', { params: withKey(opts) });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // OPTIONS
  // ═══════════════════════════════════════════════════════════════════════

  async getOptionsAggregates(ticker, multiplier, timespan, from, to, opts = {}) {
    const { data } = await massiveApi.get(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, { params: withKey(opts) });
    return data;
  },

  async getOptionsChainSnapshot(underlying, opts = {}) {
    const { data } = await massiveApi.get(`/v3/snapshot/options/${underlying}`, { params: withKey(opts) });
    return data;
  },

  async getOptionsContractSnapshot(underlying, contract) {
    const { data } = await massiveApi.get(`/v3/snapshot/options/${underlying}/${contract}`, { params: withKey() });
    return data;
  },

  async getOptionsContracts(opts = {}) {
    const { data } = await massiveApi.get('/v3/reference/options/contracts', { params: withKey(opts) });
    return data;
  },

  async getOptionsContractDetails(optionsTicker, opts = {}) {
    const { data } = await massiveApi.get(`/v3/reference/options/contracts/${optionsTicker}`, { params: withKey(opts) });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FUTURES
  // ═══════════════════════════════════════════════════════════════════════

  async getFuturesContracts(opts = {}) {
    const { data } = await massiveApi.get('/futures/v1/contracts', { params: withKey(opts) });
    return data;
  },

  async getFuturesContract(ticker, opts = {}) {
    const { data } = await massiveApi.get(`/futures/v1/contracts/${ticker}`, { params: withKey(opts) });
    return data;
  },

  async getFuturesProducts(opts = {}) {
    const { data } = await massiveApi.get('/futures/v1/products', { params: withKey(opts) });
    return data;
  },

  async getFuturesProduct(productCode) {
    const { data } = await massiveApi.get(`/futures/v1/products/${productCode}`, { params: withKey() });
    return data;
  },

  async getFuturesSchedules(opts = {}) {
    const { data } = await massiveApi.get('/futures/v1/schedules', { params: withKey(opts) });
    return data;
  },

  async getFuturesMarketStatus() {
    const { data } = await massiveApi.get('/futures/v1/market-status', { params: withKey() });
    return data;
  },

  async getFuturesQuotes(ticker, opts = {}) {
    const { data } = await massiveApi.get(`/futures/v1/quotes/${ticker}`, { params: withKey(opts) });
    return data;
  },

  async getFuturesTrades(ticker, opts = {}) {
    const { data } = await massiveApi.get(`/futures/v1/trades/${ticker}`, { params: withKey(opts) });
    return data;
  },

  async getFuturesAggregates(ticker, opts = {}) {
    const { data } = await massiveApi.get(`/futures/v1/aggs/${ticker}`, { params: withKey(opts) });
    return data;
  },

  async getFuturesExchanges() {
    const { data } = await massiveApi.get('/futures/v1/exchanges', { params: withKey() });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // INDICES
  // ═══════════════════════════════════════════════════════════════════════

  async getIndicesAggregates(ticker, multiplier, timespan, from, to, opts = {}) {
    const { data } = await massiveApi.get(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, { params: withKey(opts) });
    return data;
  },

  async getIndicesSnapshot(opts = {}) {
    const { data } = await massiveApi.get('/v3/snapshot/indices', { params: withKey(opts) });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FOREX
  // ═══════════════════════════════════════════════════════════════════════

  async getForexAggregates(ticker, multiplier, timespan, from, to, opts = {}) {
    const { data } = await massiveApi.get(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, { params: withKey(opts) });
    return data;
  },

  async getForexDailyMarketSummary(date, opts = {}) {
    const { data } = await massiveApi.get(`/v2/aggs/grouped/locale/global/market/forex/${date}`, { params: withKey(opts) });
    return data;
  },

  async getCurrencyConversion(from, to, opts = {}) {
    const { data } = await massiveApi.get(`/v1/conversion/${from}/${to}`, { params: withKey(opts) });
    return data;
  },

  async getForexSnapshot(opts = {}) {
    const { data } = await massiveApi.get('/v2/snapshot/locale/global/markets/forex/tickers', { params: withKey(opts) });
    return data;
  },

  async getForexTopMovers(direction = 'gainers') {
    const { data } = await massiveApi.get(`/v2/snapshot/locale/global/markets/forex/${direction}`, { params: withKey() });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CRYPTO
  // ═══════════════════════════════════════════════════════════════════════

  async getCryptoAggregates(ticker, multiplier, timespan, from, to, opts = {}) {
    const { data } = await massiveApi.get(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, { params: withKey(opts) });
    return data;
  },

  async getCryptoDailyMarketSummary(date, opts = {}) {
    const { data } = await massiveApi.get(`/v2/aggs/grouped/locale/global/market/crypto/${date}`, { params: withKey(opts) });
    return data;
  },

  async getCryptoOpenClose(from, to, date, opts = {}) {
    const { data } = await massiveApi.get(`/v1/open-close/crypto/${from}/${to}/${date}`, { params: withKey(opts) });
    return data;
  },

  async getCryptoLastTrade(from, to) {
    const { data } = await massiveApi.get(`/v1/last/crypto/${from}/${to}`, { params: withKey() });
    return data;
  },

  async getCryptoSnapshot(opts = {}) {
    const { data } = await massiveApi.get('/v2/snapshot/locale/global/markets/crypto/tickers', { params: withKey(opts) });
    return data;
  },

  async getCryptoSingleSnapshot(ticker) {
    const { data } = await massiveApi.get(`/v2/snapshot/locale/global/markets/crypto/tickers/${ticker}`, { params: withKey() });
    return data;
  },

  async getCryptoTopMovers(direction = 'gainers') {
    const { data } = await massiveApi.get(`/v2/snapshot/locale/global/markets/crypto/${direction}`, { params: withKey() });
    return data;
  },

  async getCryptoOrderBook(ticker) {
    const { data } = await massiveApi.get(`/v2/snapshot/locale/global/markets/crypto/tickers/${ticker}/book`, { params: withKey() });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ECONOMY
  // ═══════════════════════════════════════════════════════════════════════

  async getTreasuryYields(opts = {}) {
    const { data } = await massiveApi.get('/economy/v1/treasury-yields', { params: withKey(opts) });
    return data;
  },

  async getInflation(opts = {}) {
    const { data } = await massiveApi.get('/economy/v1/inflation', { params: withKey(opts) });
    return data;
  },

  async getLaborMarket(opts = {}) {
    const { data } = await massiveApi.get('/economy/v1/labor-market', { params: withKey(opts) });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GENERIC passthrough for any endpoint not explicitly mapped
  // ═══════════════════════════════════════════════════════════════════════

  async rawGet(path, opts = {}) {
    const { data } = await massiveApi.get(path, { params: withKey(opts) });
    return data;
  },
};

export default MassiveService;
