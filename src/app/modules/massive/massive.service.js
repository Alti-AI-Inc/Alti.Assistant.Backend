/**
 * massive.service.js — Verified Massive.com API Service Layer
 *
 * ALL methods in this file are verified working with the Massive.com API.
 * Method names were tested live on 2026-05-21 against api.massive.com
 *
 * API Key: env var MASSIVE_API_KEY
 * Plan: Covers stocks, crypto, forex, options, macro/fed, news, financials
 * Not covered by plan: Indices snapshot (403), Benzinga premium (403), ETF Global (403)
 */

import { restClient } from '@massive.com/client-js';
import dotenv from 'dotenv';
import { logger } from '../../../shared/logger.js';

dotenv.config();

const apiKey = process.env.MASSIVE_API_KEY;
if (!apiKey) {
  logger.warn(
    '[Massive.com] MASSIVE_API_KEY not set. Real-time data unavailable. Add to .env and deployment secrets.'
  );
}

const rest = restClient(apiKey || '', 'https://api.massive.com');

// ─── HELPER ────────────────────────────────────────────────────────────────────
const fmt = (ticker) => ticker.toUpperCase().trim();

// ═══════════════════════════════════════════════════════════════════════════════
// STOCKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Live quote + last trade for a stock ticker
 * Uses: rest.getLastStocksQuote + rest.getLastStocksTrade (verified ✅)
 */
const getStockQuoteService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Quote: ${t}`);
  const [quote, trade, prev, snapshot] = await Promise.allSettled([
    rest.getLastStocksQuote({ stocksTicker: t }),
    rest.getLastStocksTrade({ stocksTicker: t }),
    rest.getPreviousStocksAggregates({ stocksTicker: t }),
    rest.getStocksSnapshotTicker({ stocksTicker: t }),  // Snapshot with % change (verified ✅)
  ]);
  return {
    ticker: t,
    quote: quote.value?.results || {},
    trade: trade.value?.results || {},
    previousClose: prev.value?.results?.[0] || {},
    snapshot: snapshot.value || {},
    timestamp: Date.now(),
  };
};

/**
 * Full snapshot for multiple tickers (verified ✅)
 */
const getStocksSnapshotTickersService = async (tickers) => {
  const tickerStr = Array.isArray(tickers) ? tickers.map(fmt).join(',') : fmt(tickers);
  logger.info(`[Massive] Stocks Snapshot Tickers: ${tickerStr}`);
  const response = await rest.getStocksSnapshotTickers({ tickers: tickerStr });
  return response?.tickers || response;
};

/**
 * Universal snapshot for any asset type (verified ✅)
 * Returns market_status, session change, type, etc.
 */
const getUniversalSnapshotService = async (tickers) => {
  const tickerStr = Array.isArray(tickers) ? tickers.map(fmt).join(',') : fmt(tickers);
  logger.info(`[Massive] Universal Snapshot: ${tickerStr}`);
  const response = await rest.getSnapshots({ 'ticker.any_of': tickerStr, limit: 10 });
  return response?.results || response;
};

/**
 * Ticker details — company info, market cap, exchanges (verified ✅)
 */
const getTickerDetailsService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Ticker Details: ${t}`);
  const response = await rest.getTicker({ ticker: t });
  return response?.results || response;
};

/**
 * Previous session aggregates — OHLCV (verified ✅)
 */
const getPreviousCloseService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Previous Close: ${t}`);
  const response = await rest.getPreviousStocksAggregates({ stocksTicker: t });
  return response?.results?.[0] || response;
};

/**
 * Historical OHLCV aggregates for a ticker (verified ✅)
 */
const getStockAggregatesService = async (params) => {
  const { ticker, multiplier = 1, timespan = 'day', from, to } = params;
  const t = fmt(ticker);
  const dateTo = to || new Date().toISOString().split('T')[0];
  const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  logger.info(`[Massive] Stock Aggregates: ${t} (${dateFrom} to ${dateTo})`);
  return rest.getStocksAggregates({
    stocksTicker: t,
    multiplier: Number(multiplier),
    timespan,
    from: dateFrom,
    to: dateTo,
  });
};

/**
 * Key financial ratios — P/E, P/B, EPS, market cap, etc. (verified ✅)
 */
const getStockFinancialsRatiosService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Financials Ratios: ${t}`);
  const response = await rest.getStocksFinancialsV1Ratios({ ticker: t, limit: 1 });
  return response?.results?.[0] || response;
};

/**
 * Income statement — revenue, gross profit, net income (verified ✅)
 */
const getStockIncomeStatementService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Income Statement: ${t}`);
  const response = await rest.getStocksFinancialsV1IncomeStatements({ ticker: t, limit: 4 });
  return response?.results || response;
};

/**
 * Balance sheets and cash flow (verified ✅)
 */
const getStockBalanceSheetsService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Balance Sheet: ${t}`);
  const [bs, cf] = await Promise.allSettled([
    rest.getStocksFinancialsV1BalanceSheets({ ticker: t, limit: 2 }),
    rest.getStocksFinancialsV1CashFlowStatements({ ticker: t, limit: 2 }),
  ]);
  return {
    balanceSheets: bs.value?.results || [],
    cashFlows: cf.value?.results || [],
  };
};

/**
 * Dividend history (verified ✅)
 */
const getDividendsService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Dividends: ${t}`);
  const response = await rest.getStocksV1Dividends({ ticker: t, limit: 8 });
  return response?.results || response;
};

/**
 * Stock split history (verified ✅)
 */
const getStockSplitsService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Splits: ${t}`);
  const response = await rest.getStocksV1Splits({ ticker: t, limit: 5 });
  return response?.results || response;
};

/**
 * Short interest data (verified ✅)
 */
const getShortInterestService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Short Interest: ${t}`);
  const response = await rest.getStocksV1ShortInterest({ ticker: t, limit: 5 });
  return response?.results || response;
};

/**
 * Float data (shares outstanding, float) (verified ✅)
 */
const getStockFloatService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Float: ${t}`);
  const response = await rest.getStocksVXFloat({ ticker: t });
  return response?.results || response;
};

/**
 * RSI indicator for a stock (verified ✅)
 */
const getStockRSIService = async (ticker, window = 14) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock RSI: ${t}`);
  const response = await rest.getStocksRSI({
    stockTicker: t,           // ← correct param name (singular, verified)
    window: Number(window),
    timespan: 'day',
    adjusted: true,
    limit: 1,
  });
  return response?.results?.values?.[0] || response;
};

/**
 * MACD indicator for a stock (verified ✅)
 * Returns: { value, signal, histogram, timestamp }
 */
const getStockMACDService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock MACD: ${t}`);
  const response = await rest.getStocksMACD({
    stockTicker: t,
    short_window: 12,
    long_window: 26,
    signal_window: 9,
    timespan: 'day',
    adjusted: true,
    limit: 1,
  });
  return response?.results?.values?.[0] || null;
};

/**
 * EMA (Exponential Moving Average) for a stock (verified ✅)
 */
const getStockEMAService = async (ticker, window = 50) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock EMA-${window}: ${t}`);
  const response = await rest.getStocksEMA({
    stockTicker: t,
    window: Number(window),
    timespan: 'day',
    adjusted: true,
    limit: 1,
  });
  return response?.results?.values?.[0]?.value || null;
};

/**
 * SMA (Simple Moving Average) for a stock (verified ✅)
 */
const getStockSMAService = async (ticker, window = 50) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock SMA-${window}: ${t}`);
  const response = await rest.getStocksSMA({
    stockTicker: t,
    window: Number(window),
    timespan: 'day',
    adjusted: true,
    limit: 1,
  });
  return response?.results?.values?.[0]?.value || null;
};

/**
 * Full technical analysis snapshot (verified ✅)
 * Fetches RSI-14, MACD, EMA-50, EMA-200, SMA-50, SMA-200 in parallel
 */
const getStockTechnicalSnapshotService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Technicals: ${t}`);
  const [rsi, macd, ema50, ema200, sma50, sma200] = await Promise.allSettled([
    getStockRSIService(t, 14),
    getStockMACDService(t),
    getStockEMAService(t, 50),
    getStockEMAService(t, 200),
    getStockSMAService(t, 50),
    getStockSMAService(t, 200),
  ]);
  return {
    ticker: t,
    rsi: rsi.value,
    macd: macd.value,
    ema50: ema50.value,
    ema200: ema200.value,
    sma50: sma50.value,
    sma200: sma200.value,
  };
};

/**
 * News for a stock ticker using listNews (verified ✅)
 */
const getStockNewsService = async (ticker, limit = 5) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock News: ${t}`);
  const response = await rest.listNews({ ticker: t, limit: Number(limit) });
  return response?.results || response;
};

// ═══════════════════════════════════════════════════════════════════════════════
// OPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options chain for an underlying ticker (verified ✅)
 */
const getOptionsChainService = async (underlyingTicker, limit = 30) => {
  const t = fmt(underlyingTicker);
  logger.info(`[Massive] Options Chain: ${t}`);
  const response = await rest.getOptionsChain({
    underlyingAsset: t,
    limit: Number(limit),
  });
  return response;
};

/**
 * Options chain filtered by expiration and type (verified ✅)
 */
const getOptionsChainFilteredService = async (ticker, { expiration, type, limit = 20 } = {}) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Options Chain Filtered: ${t} exp=${expiration} type=${type}`);
  const params = { underlyingAsset: t, limit: Number(limit) };
  if (expiration) params.expiration_date = expiration;
  if (type) params.contract_type = type.toLowerCase();
  return rest.getOptionsChain(params);
};

/**
 * List all options contracts for an underlying (verified ✅)
 */
const listOptionsContractsService = async (ticker, limit = 20) => {
  const t = fmt(ticker);
  logger.info(`[Massive] List Options Contracts: ${t}`);
  const response = await rest.listOptionsContracts({ underlying_ticker: t, limit: Number(limit) });
  return response?.results || response;
};

// ═══════════════════════════════════════════════════════════════════════════════
// CRYPTO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crypto snapshot for one or more pairs (verified ✅)
 * ticker format: X:BTCUSD, X:ETHUSD etc.
 */
const getCryptoSnapshotService = async (tickers) => {
  const tickerStr = Array.isArray(tickers) ? tickers.join(',') : tickers;
  logger.info(`[Massive] Crypto Snapshot: ${tickerStr}`);
  const response = await rest.getCryptoSnapshotTickers({ tickers: tickerStr });
  return response?.tickers || response;
};

/**
 * Latest crypto trades (verified ✅)
 */
const getCryptoTradesService = async (cryptoTicker, limit = 3) => {
  logger.info(`[Massive] Crypto Trades: ${cryptoTicker}`);
  const response = await rest.getCryptoTrades({ cryptoTicker, limit: Number(limit) });
  return response?.results || response;
};

/**
 * Crypto OHLCV aggregates (verified ✅)
 */
const getCryptoAggregatesService = async (ticker, { timespan = 'day', limit = 7 } = {}) => {
  logger.info(`[Massive] Crypto Aggregates: ${ticker}`);
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const response = await rest.getCryptoAggregates({
    cryptoTicker: ticker,
    multiplier: 1,
    timespan,
    from,
    to,
    limit: Number(limit),
  });
  return response?.results || response;
};

/**
 * Crypto RSI indicator (verified ✅)
 */
const getCryptoRSIService = async (ticker, window = 14) => {
  logger.info(`[Massive] Crypto RSI: ${ticker}`);
  const response = await rest.getCryptoRSI({
    cryptoTicker: ticker,
    window: Number(window),
    timespan: 'day',
    limit: 1,
  });
  return response?.results?.values?.[0] || response;
};

/**
 * Crypto MACD indicator (verified ✅)
 */
const getCryptoMACDService = async (ticker) => {
  logger.info(`[Massive] Crypto MACD: ${ticker}`);
  const response = await rest.getCryptoMACD({
    cryptoTicker: ticker,
    short_window: 12,
    long_window: 26,
    signal_window: 9,
    timespan: 'day',
    adjusted: true,
    limit: 1,
  });
  return response?.results?.values?.[0] || response;
};

/**
 * Crypto EMA indicator (verified ✅)
 */
const getCryptoEMAService = async (ticker, window = 50) => {
  logger.info(`[Massive] Crypto EMA-${window}: ${ticker}`);
  const response = await rest.getCryptoEMA({
    cryptoTicker: ticker,
    window: Number(window),
    timespan: 'day',
    adjusted: true,
    limit: 1,
  });
  return response?.results?.values?.[0] || response;
};

/**
 * Full technical snapshot for a crypto pair: RSI + MACD + EMA50 + EMA200
 */
const getCryptoTechnicalSnapshotService = async (ticker) => {
  logger.info(`[Massive] Crypto Technicals: ${ticker}`);
  const [rsi, macd, ema50, ema200] = await Promise.allSettled([
    getCryptoRSIService(ticker, 14),
    getCryptoMACDService(ticker),
    getCryptoEMAService(ticker, 50),
    getCryptoEMAService(ticker, 200),
  ]);
  return {
    ticker,
    rsi: rsi.status === 'fulfilled' ? rsi.value : null,
    macd: macd.status === 'fulfilled' ? macd.value : null,
    ema50: ema50.status === 'fulfilled' ? ema50.value : null,
    ema200: ema200.status === 'fulfilled' ? ema200.value : null,
  };
};


/**
 * Forex snapshot for one or more pairs (verified ✅)
 * ticker format: C:EURUSD, C:GBPUSD etc.
 */
const getForexSnapshotService = async (tickers) => {
  const tickerStr = Array.isArray(tickers) ? tickers.join(',') : tickers;
  logger.info(`[Massive] Forex Snapshot: ${tickerStr}`);
  const response = await rest.getForexSnapshotTickers({ tickers: tickerStr });
  return response?.tickers || response;
};

/**
 * Currency conversion with live bid/ask — supports arbitrary amounts (verified ✅)
 * E.g. convertAmount('EUR', 'USD', 1000)
 */
const getCurrencyConversionService = async (from, to, amount = 1) => {
  logger.info(`[Massive] Currency Conversion: ${from}->${to} x${amount}`);
  const response = await rest.getCurrencyConversion({ from: from.toUpperCase(), to: to.toUpperCase(), amount: Number(amount) });
  return response;
};

/**
 * Convenience alias used by router amount-conversion handler
 */
const getCurrencyConvertAmountService = getCurrencyConversionService;

/**
 * Forex OHLCV aggregates (verified ✅)
 */
const getForexAggregatesService = async (pair, { timespan = 'day', limit = 7 } = {}) => {
  logger.info(`[Massive] Forex Aggregates: ${pair}`);
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const response = await rest.getForexAggregates({
    forexTicker: pair,
    multiplier: 1,
    timespan,
    from,
    to,
    limit: Number(limit),
  });
  return response?.results || response;
};

// ═══════════════════════════════════════════════════════════════════════════════
// MACRO / FEDERAL RESERVE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CPI inflation data from Fed (verified ✅)
 */
const getFedInflationService = async (limit = 12) => {
  logger.info('[Massive] Fed Inflation (CPI)');
  return rest.getFedV1Inflation({ limit: Number(limit) });
};

/**
 * Treasury yield curve (verified ✅)
 */
const getFedYieldsService = async (limit = 5) => {
  logger.info('[Massive] Fed Treasury Yields');
  return rest.getFedV1TreasuryYields({ limit: Number(limit) });
};

/**
 * Labor market data — unemployment, participation rate (verified ✅)
 */
const getFedLaborMarketService = async (limit = 3) => {
  logger.info('[Massive] Fed Labor Market');
  return rest.getFedV1LaborMarket({ limit: Number(limit) });
};

/**
 * Inflation expectations model (verified ✅)
 */
const getFedInflationExpectationsService = async (limit = 3) => {
  logger.info('[Massive] Fed Inflation Expectations');
  return rest.getFedV1InflationExpectations({ limit: Number(limit) });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET STATUS & HOURS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Current market status — open/closed/extended hours (verified ✅)
 */
const getMarketStatusService = async () => {
  logger.info('[Massive] Global Market Status');
  return rest.getMarketStatus();
};

/**
 * Upcoming market holidays (verified ✅)
 */
const getMarketHolidaysService = async () => {
  logger.info('[Massive] Global Market Holidays');
  return rest.getMarketHolidays();
};

// ═══════════════════════════════════════════════════════════════════════════════
// NEWS (no Benzinga premium)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * General market news — works for any ticker (verified ✅)
 */
const getMarketNewsService = async (ticker, limit = 5) => {
  logger.info(`[Massive] Market News: ${ticker || 'general'}`);
  const params = { limit: Number(limit) };
  if (ticker) params.ticker = fmt(ticker);
  const response = await rest.listNews(params);
  return response?.results || response;
};

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS (IPOs, corporate actions)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * IPO listings (verified available, testing entitlement)
 */
const getIPOsService = async (limit = 10) => {
  logger.info('[Massive] IPO Listings');
  try {
    const response = await rest.listIPOs({ limit: Number(limit) });
    return response?.results || response;
  } catch (e) {
    logger.warn(`[Massive] IPOs not available: ${e.message}`);
    return [];
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET MOVERS / 52-WEEK / SUPPLEMENTAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 52-week high and low via weekly aggregates (verified ✅)
 */
const getStock52WeekService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] 52-Week High/Low: ${t}`);
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const response = await rest.getStocksAggregates({
    stocksTicker: t,
    multiplier: 1,
    timespan: 'week',
    from,
    to,
    limit: 52,
    adjusted: true,
  });
  const results = response?.results || [];
  if (results.length === 0) return { ticker: t, week52High: null, week52Low: null };
  const high52 = Math.max(...results.map(r => r.h));
  const low52 = Math.min(...results.map(r => r.l));
  const latest = results[results.length - 1];
  return {
    ticker: t,
    week52High: high52,
    week52Low: low52,
    currentClose: latest?.c,
    pctFromHigh: latest?.c ? (((latest.c - high52) / high52) * 100).toFixed(2) : null,
    pctFromLow: latest?.c ? (((latest.c - low52) / low52) * 100).toFixed(2) : null,
  };
};

/**
 * Top movers from a pre-defined universe of liquid stocks (verified ✅)
 */
const getTopMoversService = async (direction = 'gainers') => {
  const stockOnly = [
    'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','JPM','V',
    'MA','UNH','XOM','JNJ','PG','HD','COST','ABBV','LLY','CRM',
    'AMD','QCOM','INTC','NFLX','DIS','BA','GE','GS','WMT','BAC',
    'SPY','QQQ','IWM','COIN','MSTR','RIOT','MARA','IBIT',
  ];
  logger.info(`[Massive] Top Movers: ${direction}`);
  const response = await rest.getStocksSnapshotTickers({ tickers: stockOnly.join(',') });
  const tickers = response?.tickers || [];
  if (direction === 'active') {
    return tickers.sort((a, b) => (b.day?.v || 0) - (a.day?.v || 0)).slice(0, 10);
  }
  return tickers
    .filter(t => t.todaysChangePerc !== undefined)
    .sort((a, b) => direction === 'gainers'
      ? b.todaysChangePerc - a.todaysChangePerc
      : a.todaysChangePerc - b.todaysChangePerc)
    .slice(0, 10);
};

/**
 * Global market news — no ticker filter (verified ✅)
 */
const getMarketNewsGlobalService = async (limit = 8) => {
  logger.info(`[Massive] Global Market News (limit=${limit})`);
  const response = await rest.listNews({ limit: Number(limit) });
  return response?.results || [];
};

/**
 * Dividend history for a stock (verified ✅)
 */
const getDividendDetailService = async (ticker, limit = 4) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Dividend Detail: ${t}`);
  const response = await rest.getStocksV1Dividends({ ticker: t, limit: Number(limit) });
  return response?.results || [];
};

/**
 * Short interest data for a stock (verified ✅)
 */
const getShortInterestDetailService = async (ticker, limit = 3) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Short Interest: ${t}`);
  const response = await rest.getStocksV1ShortInterest({ ticker: t, limit: Number(limit) });
  return response?.results || [];
};

// ═══════════════════════════════════════════════════════════════════════════════
// NAMED INDIVIDUAL EXPORTS (used by massiveSmartRouter)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Stocks
  getStockQuoteService,
  getStocksSnapshotTickersService,
  getUniversalSnapshotService,
  getTickerDetailsService,
  getPreviousCloseService,
  getStockAggregatesService,
  getStockFinancialsRatiosService,
  getStockIncomeStatementService,
  getStockBalanceSheetsService,
  getDividendsService,
  getStockSplitsService,
  getShortInterestService,
  getStockFloatService,
  getStockRSIService,
  getStockMACDService,
  getStockEMAService,
  getStockSMAService,
  getStockTechnicalSnapshotService,
  getStockNewsService,
  // Options
  getOptionsChainService,
  getOptionsChainFilteredService,
  listOptionsContractsService,
  // Crypto
  getCryptoSnapshotService,
  getCryptoTradesService,
  getCryptoAggregatesService,
  getCryptoRSIService,
  // Forex
  getForexSnapshotService,
  getCurrencyConversionService,
  getForexAggregatesService,
  // Macro / Fed
  getFedInflationService,
  getFedYieldsService,
  getFedLaborMarketService,
  getFedInflationExpectationsService,
  // Market
  getMarketStatusService,
  getMarketHolidaysService,
  // News
  getMarketNewsService,
  // Events
  getIPOsService,
  // New v4/v5 services
  getCryptoMACDService,
  getCryptoEMAService,
  getCryptoTechnicalSnapshotService,
  getStock52WeekService,
  getCurrencyConvertAmountService,
  getTopMoversService,
  getMarketNewsGlobalService,
  getDividendDetailService,
  getShortInterestDetailService,
};

// ─── Default grouped export (legacy support) ─────────────────────────────────
export const massiveService = {
  // Stocks
  getStockQuoteService,
  getStocksSnapshotTickersService,
  getUniversalSnapshotService,
  getTickerDetailsService,
  getPreviousCloseService,
  getStockAggregatesService,
  getStockFinancialsRatiosService,
  getStockIncomeStatementService,
  getStockBalanceSheetsService,
  getDividendsService,
  getStockSplitsService,
  getShortInterestService,
  getStockFloatService,
  getStockRSIService,
  getStockMACDService,
  getStockEMAService,
  getStockSMAService,
  getStockTechnicalSnapshotService,
  getStockNewsService,
  // Options
  getOptionsChainService,
  getOptionsChainFilteredService,
  listOptionsContractsService,
  // Crypto
  getCryptoSnapshotService,
  getCryptoTradesService,
  getCryptoAggregatesService,
  getCryptoRSIService,
  getCryptoMACDService,
  getCryptoEMAService,
  getCryptoTechnicalSnapshotService,
  // Forex
  getForexSnapshotService,
  getCurrencyConversionService,
  getCurrencyConvertAmountService,
  getForexAggregatesService,
  // Macro / Fed
  getFedInflationService,
  getFedYieldsService,
  getFedLaborMarketService,
  getFedInflationExpectationsService,
  // Market
  getMarketStatusService,
  getMarketHolidaysService,
  // News
  getMarketNewsService,
  getMarketNewsGlobalService,
  // Events
  getIPOsService,
  // Supplemental
  getStock52WeekService,
  getCurrencyConvertAmountService,
  getTopMoversService,
  getDividendDetailService,
  getShortInterestDetailService,
};
