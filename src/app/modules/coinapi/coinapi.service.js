import axios from 'axios';
import WebSocket from 'ws';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { CacheService } from '../../../shared/cache.service.js';

/**
 * CoinAPI.io — Complete REST + WebSocket Client
 *
 * REST Base: https://rest.coinapi.io
 * WebSocket: wss://ws.coinapi.io/v1/
 * MCP:       https://mcp.coinapi.io (hosted MCP server)
 * Auth:      X-CoinAPI-Key header
 *
 * ┌──────────────────┬─────────────────────────────────────────────┐
 * │ Category         │ Endpoints                                   │
 * ├──────────────────┼─────────────────────────────────────────────┤
 * │ Metadata         │ /v1/exchanges, /v1/assets, /v1/symbols      │
 * │ Exchange Rates   │ /v1/exchangerate/{base}/{quote}              │
 * │ OHLCV            │ /v1/ohlcv/{symbol}/history                   │
 * │ Trades           │ /v1/trades/{symbol}/latest, /history         │
 * │ Quotes           │ /v1/quotes/{symbol}/current, /history        │
 * │ Order Books      │ /v1/orderbooks/{symbol}/current, /history    │
 * │ Indexes          │ /v1/indexes                                  │
 * │ Metrics          │ /v1/metrics/exchange, /v1/metrics/symbol     │
 * └──────────────────┴─────────────────────────────────────────────┘
 *
 * WebSocket Data Types: trade, quote, book5, book20, book50, ohlcv
 */

const API_KEY = config.coinapi?.apiKey || process.env.COINAPI_KEY || '';
const REST_BASE = 'https://rest.coinapi.io';
const WS_URL = 'wss://ws.coinapi.io/v1/';

const coinApi = axios.create({
  baseURL: REST_BASE,
  timeout: 30000,
  headers: { 'X-CoinAPI-Key': API_KEY },
});

async function cachedGet(path, config = {}) {
  return CacheService.getOrSet('coinapi', { path, params: config.params }, async () => {
    const { data } = await coinApi.get(path, config);
    return data;
  }, 300); // 5 min cache
}

export const CoinApiService = {

  // ═══════════════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v1/exchanges — list all supported exchanges */
  async getExchanges(params = {}) {
    const data = await cachedGet('/v1/exchanges', { params });
    return data;
  },

  /** GET /v1/exchanges/{exchange_id} — specific exchange info */
  async getExchange(exchangeId) {
    const data = await cachedGet(`/v1/exchanges/${exchangeId}`);
    return data;
  },

  /** GET /v1/exchanges/icons/{size} — exchange icons */
  async getExchangeIcons(size = 32) {
    const data = await cachedGet(`/v1/exchanges/icons/${size}`);
    return data;
  },

  /** GET /v1/assets — list all supported assets */
  async getAssets(params = {}) {
    const data = await cachedGet('/v1/assets', { params });
    return data;
  },

  /** GET /v1/assets/{asset_id} — specific asset info */
  async getAsset(assetId) {
    const data = await cachedGet(`/v1/assets/${assetId}`);
    return data;
  },

  /** GET /v1/assets/icons/{size} — asset icons */
  async getAssetIcons(size = 32) {
    const data = await cachedGet(`/v1/assets/icons/${size}`);
    return data;
  },

  /** GET /v1/symbols — list all supported symbols */
  async getSymbols(params = {}) {
    const data = await cachedGet('/v1/symbols', { params });
    return data;
  },

  /** GET /v1/symbols/map/{exchange_id} — symbol mapping for exchange */
  async getSymbolMap(exchangeId, params = {}) {
    const data = await cachedGet(`/v1/symbols/map/${exchangeId}`, { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // EXCHANGE RATES
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v1/exchangerate/{asset_id_base}/{asset_id_quote} — current rate */
  async getExchangeRate(base, quote) {
    const data = await cachedGet(`/v1/exchangerate/${base}/${quote}`);
    return data;
  },

  /** GET /v1/exchangerate/{base}/{quote}?time={time} — historical rate at specific time */
  async getExchangeRateAt(base, quote, time) {
    const data = await cachedGet(`/v1/exchangerate/${base}/${quote}`, { params: { time } });
    return data;
  },

  /** GET /v1/exchangerate/{base} — all current rates for a base asset */
  async getAllExchangeRates(base, params = {}) {
    const data = await cachedGet(`/v1/exchangerate/${base}`, { params });
    return data;
  },

  /** GET /v1/exchangerate/{base}/{quote}/history — time series of exchange rates */
  async getExchangeRateHistory(base, quote, params = {}) {
    const data = await cachedGet(`/v1/exchangerate/${base}/${quote}/history`, { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // OHLCV — Candlestick Data
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v1/ohlcv/periods — list available time periods (1SEC, 1MIN, 1HRS, 1DAY, etc.) */
  async getOhlcvPeriods() {
    const data = await cachedGet('/v1/ohlcv/periods');
    return data;
  },

  /** GET /v1/ohlcv/{symbol_id}/latest — latest OHLCV candles */
  async getOhlcvLatest(symbolId, params = {}) {
    const data = await cachedGet(`/v1/ohlcv/${symbolId}/latest`, { params });
    return data;
  },

  /** GET /v1/ohlcv/{symbol_id}/history — historical OHLCV candles */
  async getOhlcvHistory(symbolId, params = {}) {
    const data = await cachedGet(`/v1/ohlcv/${symbolId}/history`, { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TRADES
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v1/trades/latest — latest trades across all symbols */
  async getTradesLatest(params = {}) {
    const data = await cachedGet('/v1/trades/latest', { params });
    return data;
  },

  /** GET /v1/trades/{symbol_id}/latest — latest trades for symbol */
  async getTradesLatestBySymbol(symbolId, params = {}) {
    const data = await cachedGet(`/v1/trades/${symbolId}/latest`, { params });
    return data;
  },

  /** GET /v1/trades/{symbol_id}/history — historical trades */
  async getTradesHistory(symbolId, params = {}) {
    const data = await cachedGet(`/v1/trades/${symbolId}/history`, { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // QUOTES
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v1/quotes/current — current best bid/ask across all symbols */
  async getQuotesCurrent(params = {}) {
    const data = await cachedGet('/v1/quotes/current', { params });
    return data;
  },

  /** GET /v1/quotes/{symbol_id}/current — current quote for symbol */
  async getQuoteCurrentBySymbol(symbolId) {
    const data = await cachedGet(`/v1/quotes/${symbolId}/current`);
    return data;
  },

  /** GET /v1/quotes/latest — latest quotes across all symbols */
  async getQuotesLatest(params = {}) {
    const data = await cachedGet('/v1/quotes/latest', { params });
    return data;
  },

  /** GET /v1/quotes/{symbol_id}/latest — latest quotes for symbol */
  async getQuotesLatestBySymbol(symbolId, params = {}) {
    const data = await cachedGet(`/v1/quotes/${symbolId}/latest`, { params });
    return data;
  },

  /** GET /v1/quotes/{symbol_id}/history — historical quotes */
  async getQuotesHistory(symbolId, params = {}) {
    const data = await cachedGet(`/v1/quotes/${symbolId}/history`, { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ORDER BOOKS
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v1/orderbooks/current — current order books across all symbols */
  async getOrderbooksCurrent(params = {}) {
    const data = await cachedGet('/v1/orderbooks/current', { params });
    return data;
  },

  /** GET /v1/orderbooks/{symbol_id}/current — current order book for symbol */
  async getOrderbookCurrentBySymbol(symbolId, params = {}) {
    const data = await cachedGet(`/v1/orderbooks/${symbolId}/current`, { params });
    return data;
  },

  /** GET /v1/orderbooks/{symbol_id}/latest — latest order book snapshots */
  async getOrderbooksLatestBySymbol(symbolId, params = {}) {
    const data = await cachedGet(`/v1/orderbooks/${symbolId}/latest`, { params });
    return data;
  },

  /** GET /v1/orderbooks/{symbol_id}/history — historical order book snapshots */
  async getOrderbooksHistory(symbolId, params = {}) {
    const data = await cachedGet(`/v1/orderbooks/${symbolId}/history`, { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // INDEXES
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v1/indexes — list all indexes */
  async getIndexes(params = {}) {
    const data = await cachedGet('/v1/indexes', { params });
    return data;
  },

  /** GET /v1/indexes/{index_id} — specific index info */
  async getIndex(indexId) {
    const data = await cachedGet(`/v1/indexes/${indexId}`);
    return data;
  },

  /** GET /v1/indexes/{index_id}/history — index history */
  async getIndexHistory(indexId, params = {}) {
    const data = await cachedGet(`/v1/indexes/${indexId}/history`, { params });
    return data;
  },

  /** GET /v1/indexes/{index_id}/timeseries — index time series */
  async getIndexTimeseries(indexId, params = {}) {
    const data = await cachedGet(`/v1/indexes/${indexId}/timeseries`, { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // METRICS
  // ═══════════════════════════════════════════════════════════════════════

  /** GET /v1/metrics/listing — list available metrics */
  async getMetricsListing() {
    const data = await cachedGet('/v1/metrics/listing');
    return data;
  },

  /** GET /v1/metrics/exchange/listing — exchange metrics listing */
  async getExchangeMetricsListing() {
    const data = await cachedGet('/v1/metrics/exchange/listing');
    return data;
  },

  /** GET /v1/metrics/exchange/current — current exchange metrics */
  async getExchangeMetricsCurrent(params = {}) {
    const data = await cachedGet('/v1/metrics/exchange/current', { params });
    return data;
  },

  /** GET /v1/metrics/exchange/history — historical exchange metrics */
  async getExchangeMetricsHistory(params = {}) {
    const data = await cachedGet('/v1/metrics/exchange/history', { params });
    return data;
  },

  /** GET /v1/metrics/symbol/current — current symbol metrics */
  async getSymbolMetricsCurrent(params = {}) {
    const data = await cachedGet('/v1/metrics/symbol/current', { params });
    return data;
  },

  /** GET /v1/metrics/symbol/history — historical symbol metrics */
  async getSymbolMetricsHistory(params = {}) {
    const data = await cachedGet('/v1/metrics/symbol/history', { params });
    return data;
  },

  /** GET /v1/metrics/asset/current — current asset metrics */
  async getAssetMetricsCurrent(params = {}) {
    const data = await cachedGet('/v1/metrics/asset/current', { params });
    return data;
  },

  /** GET /v1/metrics/asset/history — historical asset metrics */
  async getAssetMetricsHistory(params = {}) {
    const data = await cachedGet('/v1/metrics/asset/history', { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // WEBSOCKET REAL-TIME STREAMING
  // ═══════════════════════════════════════════════════════════════════════

  _wsConnection: null,
  _wsCallbacks: {},
  _wsReconnectTimer: null,

  /**
   * Connect to CoinAPI WebSocket for real-time data.
   * @param {Object} opts
   * @param {string[]} opts.dataTypes - ['trade','quote','book20','ohlcv']
   * @param {string[]} [opts.symbols] - ['BITSTAMP_SPOT_BTC_USD']
   * @param {string[]} [opts.assets] - ['BTC','ETH']
   * @param {string[]} [opts.exchanges] - ['BINANCE','COINBASE']
   * @param {boolean} [opts.heartbeat=true]
   * @param {Function} onMessage - callback(parsedMsg) for each incoming message
   * @param {Function} [onError] - callback(err)
   */
  connectWebSocket(opts, onMessage, onError) {
    if (this._wsConnection) {
      logger.warn('[CoinAPI] WebSocket already connected');
      return;
    }

    logger.info(`[CoinAPI] Connecting WebSocket to ${WS_URL}`);
    const ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      logger.info('[CoinAPI] WebSocket connected, sending hello');
      const hello = {
        type: 'hello',
        apikey: API_KEY,
        heartbeat: opts.heartbeat !== false,
        subscribe_data_type: opts.dataTypes || ['trade'],
      };
      if (opts.symbols) hello.subscribe_filter_symbol_id = opts.symbols;
      if (opts.assets) hello.subscribe_filter_asset_id = opts.assets;
      if (opts.exchanges) hello.subscribe_filter_exchange_id = opts.exchanges;
      ws.send(JSON.stringify(hello));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'heartbeat') return;
        onMessage(msg);
      } catch (err) {
        logger.error(`[CoinAPI] WS parse error: ${err.message}`);
      }
    });

    ws.on('error', (err) => {
      logger.error(`[CoinAPI] WebSocket error: ${err.message}`);
      if (onError) onError(err);
    });

    ws.on('close', () => {
      logger.warn('[CoinAPI] WebSocket closed, reconnecting in 5s...');
      this._wsConnection = null;
      this._wsReconnectTimer = setTimeout(() => {
        this.connectWebSocket(opts, onMessage, onError);
      }, 5000);
    });

    this._wsConnection = ws;
    this._wsCallbacks = { onMessage, onError, opts };
  },

  /**
   * Send dynamic subscribe message to add new subscriptions without reconnecting.
   */
  subscribeAdditional(dataTypes, symbols) {
    if (!this._wsConnection) throw new Error('WebSocket not connected');
    const msg = { type: 'subscribe', subscribe_data_type: dataTypes };
    if (symbols) msg.subscribe_filter_symbol_id = symbols;
    this._wsConnection.send(JSON.stringify(msg));
  },

  /**
   * Disconnect WebSocket.
   */
  disconnectWebSocket() {
    if (this._wsReconnectTimer) clearTimeout(this._wsReconnectTimer);
    if (this._wsConnection) {
      this._wsConnection.close();
      this._wsConnection = null;
      logger.info('[CoinAPI] WebSocket disconnected');
    }
  },

  isWebSocketConnected() {
    return this._wsConnection?.readyState === WebSocket.OPEN;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // RAW PROXY
  // ═══════════════════════════════════════════════════════════════════════

  async rawGet(path, params = {}) {
    const data = await cachedGet(path, { params });
    return data;
  },
};

export default CoinApiService;
