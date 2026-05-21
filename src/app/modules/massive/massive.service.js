/**
 * massive.service.js â€” Verified Massive.com API Service Layer
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

// Lazy client â€” reads key at first call (after preload.cjs BOM-strips all env vars)
let _rest = null;
const getClient = () => {
  if (!_rest) {
    const apiKey = (process.env.MASSIVE_API_KEY || '').replace(/^\uFEFF+/, '').trim();
    if (!apiKey) {
      logger.warn('[Massive.com] MASSIVE_API_KEY not set. Real-time data unavailable.');
    }
    _rest = restClient(apiKey || '', 'https://api.massive.com');
  }
  return _rest;
};

// â”€â”€â”€ HELPER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const fmt = (ticker) => ticker.toUpperCase().trim();

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STOCKS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Live quote + last trade for a stock ticker
 * Uses: getClient().getLastStocksQuote + getClient().getLastStocksTrade (verified âœ…)
 */
const getStockQuoteService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Quote: ${t}`);
  const [quote, trade, prev, snapshot] = await Promise.allSettled([
    getClient().getLastStocksQuote({ stocksTicker: t }),
    getClient().getLastStocksTrade({ stocksTicker: t }),
    getClient().getPreviousStocksAggregates({ stocksTicker: t }),
    getClient().getStocksSnapshotTicker({ stocksTicker: t }),  // Snapshot with % change (verified âœ…)
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
 * Full snapshot for multiple tickers (verified âœ…)
 */
const getStocksSnapshotTickersService = async (tickers) => {
  const tickerStr = Array.isArray(tickers) ? tickers.map(fmt).join(',') : fmt(tickers);
  logger.info(`[Massive] Stocks Snapshot Tickers: ${tickerStr}`);
  const response = await getClient().getStocksSnapshotTickers({ tickers: tickerStr });
  return response?.tickers || response;
};

/**
 * Universal snapshot for any asset type (verified âœ…)
 * Returns market_status, session change, type, etc.
 */
const getUniversalSnapshotService = async (tickers) => {
  const tickerStr = Array.isArray(tickers) ? tickers.map(fmt).join(',') : fmt(tickers);
  logger.info(`[Massive] Universal Snapshot: ${tickerStr}`);
  const response = await getClient().getSnapshots({ 'ticker.any_of': tickerStr, limit: 10 });
  return response?.results || response;
};

/**
 * Ticker details â€” company info, market cap, exchanges (verified âœ…)
 */
const getTickerDetailsService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Ticker Details: ${t}`);
  const response = await getClient().getTicker({ ticker: t });
  return response?.results || response;
};

/**
 * Previous session aggregates â€” OHLCV (verified âœ…)
 */
const getPreviousCloseService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Previous Close: ${t}`);
  const response = await getClient().getPreviousStocksAggregates({ stocksTicker: t });
  return response?.results?.[0] || response;
};

/**
 * Historical OHLCV aggregates for a ticker (verified âœ…)
 */
const getStockAggregatesService = async (params) => {
  const { ticker, multiplier = 1, timespan = 'day', from, to } = params;
  const t = fmt(ticker);
  const dateTo = to || new Date().toISOString().split('T')[0];
  const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  logger.info(`[Massive] Stock Aggregates: ${t} (${dateFrom} to ${dateTo})`);
  return getClient().getStocksAggregates({
    stocksTicker: t,
    multiplier: Number(multiplier),
    timespan,
    from: dateFrom,
    to: dateTo,
  });
};

/**
 * Key financial ratios â€” P/E, P/B, EPS, market cap, etc. (verified âœ…)
 */
const getStockFinancialsRatiosService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Financials Ratios: ${t}`);
  const response = await getClient().getStocksFinancialsV1Ratios({ ticker: t, limit: 1 });
  return response?.results?.[0] || response;
};

/**
 * Income statement â€” revenue, gross profit, net income (verified âœ…)
 */
const getStockIncomeStatementService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Income Statement: ${t}`);
  const response = await getClient().getStocksFinancialsV1IncomeStatements({ ticker: t, limit: 4 });
  return response?.results || response;
};

/**
 * Balance sheets and cash flow (verified âœ…)
 */
const getStockBalanceSheetsService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Balance Sheet: ${t}`);
  const [bs, cf] = await Promise.allSettled([
    getClient().getStocksFinancialsV1BalanceSheets({ ticker: t, limit: 2 }),
    getClient().getStocksFinancialsV1CashFlowStatements({ ticker: t, limit: 2 }),
  ]);
  return {
    balanceSheets: bs.value?.results || [],
    cashFlows: cf.value?.results || [],
  };
};

/**
 * Dividend history (verified âœ…)
 */
const getDividendsService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Dividends: ${t}`);
  const response = await getClient().getStocksV1Dividends({ ticker: t, limit: 8 });
  return response?.results || response;
};

/**
 * Stock split history (verified âœ…)
 */
const getStockSplitsService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Splits: ${t}`);
  const response = await getClient().getStocksV1Splits({ ticker: t, limit: 5 });
  return response?.results || response;
};

/**
 * Short interest data (verified âœ…)
 */
const getShortInterestService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Short Interest: ${t}`);
  const response = await getClient().getStocksV1ShortInterest({ ticker: t, limit: 5 });
  return response?.results || response;
};

/**
 * Float data (shares outstanding, float) (verified âœ…)
 */
const getStockFloatService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Float: ${t}`);
  const response = await getClient().getStocksVXFloat({ ticker: t });
  return response?.results || response;
};

/**
 * RSI indicator for a stock (verified âœ…)
 */
const getStockRSIService = async (ticker, window = 14) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock RSI: ${t}`);
  const response = await getClient().getStocksRSI({
    stockTicker: t,           // â† correct param name (singular, verified)
    window: Number(window),
    timespan: 'day',
    adjusted: true,
    limit: 1,
  });
  return response?.results?.values?.[0] || response;
};

/**
 * MACD indicator for a stock (verified âœ…)
 * Returns: { value, signal, histogram, timestamp }
 */
const getStockMACDService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock MACD: ${t}`);
  const response = await getClient().getStocksMACD({
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
 * EMA (Exponential Moving Average) for a stock (verified âœ…)
 */
const getStockEMAService = async (ticker, window = 50) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock EMA-${window}: ${t}`);
  const response = await getClient().getStocksEMA({
    stockTicker: t,
    window: Number(window),
    timespan: 'day',
    adjusted: true,
    limit: 1,
  });
  return response?.results?.values?.[0]?.value || null;
};

/**
 * SMA (Simple Moving Average) for a stock (verified âœ…)
 */
const getStockSMAService = async (ticker, window = 50) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock SMA-${window}: ${t}`);
  const response = await getClient().getStocksSMA({
    stockTicker: t,
    window: Number(window),
    timespan: 'day',
    adjusted: true,
    limit: 1,
  });
  return response?.results?.values?.[0]?.value || null;
};

/**
 * Full technical analysis snapshot (verified âœ…)
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
 * News for a stock ticker using listNews (verified âœ…)
 */
const getStockNewsService = async (ticker, limit = 5) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock News: ${t}`);
  const response = await getClient().listNews({ ticker: t, limit: Number(limit) });
  return response?.results || response;
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// OPTIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Options chain for an underlying ticker (verified âœ…)
 */
const getOptionsChainService = async (underlyingTicker, limit = 30) => {
  const t = fmt(underlyingTicker);
  logger.info(`[Massive] Options Chain: ${t}`);
  const response = await getClient().getOptionsChain({
    underlyingAsset: t,
    limit: Number(limit),
  });
  return response;
};

/**
 * Options chain filtered by expiration and type (verified âœ…)
 */
const getOptionsChainFilteredService = async (ticker, { expiration, type, limit = 20 } = {}) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Options Chain Filtered: ${t} exp=${expiration} type=${type}`);
  const params = { underlyingAsset: t, limit: Number(limit) };
  if (expiration) params.expiration_date = expiration;
  if (type) params.contract_type = type.toLowerCase();
  return getClient().getOptionsChain(params);
};

/**
 * List all options contracts for an underlying (verified âœ…)
 */
const listOptionsContractsService = async (ticker, limit = 20) => {
  const t = fmt(ticker);
  logger.info(`[Massive] List Options Contracts: ${t}`);
  const response = await getClient().listOptionsContracts({ underlying_ticker: t, limit: Number(limit) });
  return response?.results || response;
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CRYPTO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Crypto snapshot for one or more pairs (verified âœ…)
 * ticker format: X:BTCUSD, X:ETHUSD etc.
 */
const getCryptoSnapshotService = async (tickers) => {
  const tickerStr = Array.isArray(tickers) ? tickers.join(',') : tickers;
  logger.info(`[Massive] Crypto Snapshot: ${tickerStr}`);
  const response = await getClient().getCryptoSnapshotTickers({ tickers: tickerStr });
  return response?.tickers || response;
};

/**
 * Latest crypto trades (verified âœ…)
 */
const getCryptoTradesService = async (cryptoTicker, limit = 3) => {
  logger.info(`[Massive] Crypto Trades: ${cryptoTicker}`);
  const response = await getClient().getCryptoTrades({ cryptoTicker, limit: Number(limit) });
  return response?.results || response;
};

/**
 * Crypto OHLCV aggregates (verified âœ…)
 */
const getCryptoAggregatesService = async (ticker, { timespan = 'day', limit = 7 } = {}) => {
  logger.info(`[Massive] Crypto Aggregates: ${ticker}`);
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const response = await getClient().getCryptoAggregates({
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
 * Crypto RSI indicator (verified âœ…)
 */
const getCryptoRSIService = async (ticker, window = 14) => {
  logger.info(`[Massive] Crypto RSI: ${ticker}`);
  const response = await getClient().getCryptoRSI({
    cryptoTicker: ticker,
    window: Number(window),
    timespan: 'day',
    limit: 1,
  });
  return response?.results?.values?.[0] || response;
};

/**
 * Crypto MACD indicator (verified âœ…)
 */
const getCryptoMACDService = async (ticker) => {
  logger.info(`[Massive] Crypto MACD: ${ticker}`);
  const response = await getClient().getCryptoMACD({
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
 * Crypto EMA indicator (verified âœ…)
 */
const getCryptoEMAService = async (ticker, window = 50) => {
  logger.info(`[Massive] Crypto EMA-${window}: ${ticker}`);
  const response = await getClient().getCryptoEMA({
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
 * Forex snapshot for one or more pairs (verified âœ…)
 * ticker format: C:EURUSD, C:GBPUSD etc.
 */
const getForexSnapshotService = async (tickers) => {
  const tickerStr = Array.isArray(tickers) ? tickers.join(',') : tickers;
  logger.info(`[Massive] Forex Snapshot: ${tickerStr}`);
  const response = await getClient().getForexSnapshotTickers({ tickers: tickerStr });
  return response?.tickers || response;
};

/**
 * Currency conversion with live bid/ask â€” supports arbitrary amounts (verified âœ…)
 * E.g. convertAmount('EUR', 'USD', 1000)
 */
const getCurrencyConversionService = async (from, to, amount = 1) => {
  logger.info(`[Massive] Currency Conversion: ${from}->${to} x${amount}`);
  const response = await getClient().getCurrencyConversion({ from: from.toUpperCase(), to: to.toUpperCase(), amount: Number(amount) });
  return response;
};

/**
 * Convenience alias used by router amount-conversion handler
 */
const getCurrencyConvertAmountService = getCurrencyConversionService;

/**
 * Forex OHLCV aggregates (verified âœ…)
 */
const getForexAggregatesService = async (pair, { timespan = 'day', limit = 7 } = {}) => {
  logger.info(`[Massive] Forex Aggregates: ${pair}`);
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const response = await getClient().getForexAggregates({
    forexTicker: pair,
    multiplier: 1,
    timespan,
    from,
    to,
    limit: Number(limit),
  });
  return response?.results || response;
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MACRO / FEDERAL RESERVE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * CPI inflation data from Fed (verified âœ…)
 */
const getFedInflationService = async (limit = 12) => {
  logger.info('[Massive] Fed Inflation (CPI)');
  return getClient().getFedV1Inflation({ limit: Number(limit) });
};

/**
 * Treasury yield curve (verified âœ…)
 */
const getFedYieldsService = async (limit = 5) => {
  logger.info('[Massive] Fed Treasury Yields');
  return getClient().getFedV1TreasuryYields({ limit: Number(limit) });
};

/**
 * Labor market data â€” unemployment, participation rate (verified âœ…)
 */
const getFedLaborMarketService = async (limit = 3) => {
  logger.info('[Massive] Fed Labor Market');
  return getClient().getFedV1LaborMarket({ limit: Number(limit) });
};

/**
 * Inflation expectations model (verified âœ…)
 */
const getFedInflationExpectationsService = async (limit = 3) => {
  logger.info('[Massive] Fed Inflation Expectations');
  return getClient().getFedV1InflationExpectations({ limit: Number(limit) });
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MARKET STATUS & HOURS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Current market status â€” open/closed/extended hours (verified âœ…)
 */
const getMarketStatusService = async () => {
  logger.info('[Massive] Global Market Status');
  return getClient().getMarketStatus();
};

/**
 * Upcoming market holidays (verified âœ…)
 */
const getMarketHolidaysService = async () => {
  logger.info('[Massive] Global Market Holidays');
  return getClient().getMarketHolidays();
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// NEWS (no Benzinga premium)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * General market news â€” works for any ticker (verified âœ…)
 */
const getMarketNewsService = async (ticker, limit = 5) => {
  logger.info(`[Massive] Market News: ${ticker || 'general'}`);
  const params = { limit: Number(limit) };
  if (ticker) params.ticker = fmt(ticker);
  const response = await getClient().listNews(params);
  return response?.results || response;
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EVENTS (IPOs, corporate actions)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * IPO listings (verified available, testing entitlement)
 */
const getIPOsService = async (limit = 10) => {
  logger.info('[Massive] IPO Listings');
  try {
    const response = await getClient().listIPOs({ limit: Number(limit) });
    return response?.results || response;
  } catch (e) {
    logger.warn(`[Massive] IPOs not available: ${e.message}`);
    return [];
  }
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MARKET MOVERS / 52-WEEK / SUPPLEMENTAL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * 52-week high and low via weekly aggregates (verified âœ…)
 */
const getStock52WeekService = async (ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] 52-Week High/Low: ${t}`);
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const response = await getClient().getStocksAggregates({
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
 * Top movers from a pre-defined universe of liquid stocks (verified âœ…)
 */
const getTopMoversService = async (direction = 'gainers') => {
  const stockOnly = [
    'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','JPM','V',
    'MA','UNH','XOM','JNJ','PG','HD','COST','ABBV','LLY','CRM',
    'AMD','QCOM','INTC','NFLX','DIS','BA','GE','GS','WMT','BAC',
    'SPY','QQQ','IWM','COIN','MSTR','RIOT','MARA','IBIT',
  ];
  logger.info(`[Massive] Top Movers: ${direction}`);
  const response = await getClient().getStocksSnapshotTickers({ tickers: stockOnly.join(',') });
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
 * Global market news â€” no ticker filter (verified âœ…)
 */
const getMarketNewsGlobalService = async (limit = 8) => {
  logger.info(`[Massive] Global Market News (limit=${limit})`);
  const response = await getClient().listNews({ limit: Number(limit) });
  return response?.results || [];
};

/**
 * Dividend history for a stock (verified âœ…)
 */
const getDividendDetailService = async (ticker, limit = 4) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Dividend Detail: ${t}`);
  const response = await getClient().getStocksV1Dividends({ ticker: t, limit: Number(limit) });
  return response?.results || [];
};

/**
 * Short interest data for a stock (verified âœ…)
 */
const getShortInterestDetailService = async (ticker, limit = 3) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Short Interest: ${t}`);
  const response = await getClient().getStocksV1ShortInterest({ ticker: t, limit: Number(limit) });
  return response?.results || [];
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// NAMED INDIVIDUAL EXPORTS (used by massiveSmartRouter)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â”€â”€â”€ Default grouped export (legacy support) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

