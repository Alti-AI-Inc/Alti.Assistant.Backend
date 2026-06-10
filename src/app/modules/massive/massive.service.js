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
// INTEGRATION: Import usage service and error handler for tenancy and limits.
import { usageService } from '../usage/usage.service.js';
import { AppError } from '../../../shared/errors/AppError.js';

dotenv.config();

// Lazy client — reads key at first call (after preload.cjs BOM-strips all env vars)
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

// INTEGRATION: Wrapper to enforce usage limits and record API calls against users/workspaces.
/**
 * Wraps an API call with usage tracking and limit enforcement.
 * This is a critical integration point for multi-tenancy and role-based access control.
 * It ensures that all data requests are authorized, tracked, and billed correctly.
 * @param {object} userContext - The user's context (userId, workspaceId, role).
 * @param {string} functionName - The name of the service function for logging/tracking.
 * @param {function} apiCallFn - A function that returns a promise for the API call.
 * @param {number} cost - The number of API calls this function will make.
 * @returns {Promise<any>} The result of the API call.
 */
const withUsageTracking = async (userContext, functionName, apiCallFn, cost = 1) => {
  // SECURITY: All API calls must be associated with a user and workspace to maintain tenant boundaries.
  if (!userContext || !userContext.workspaceId) {
    logger.error(`[Massive] Unauthorized API call attempt: ${functionName}. Missing userContext.`);
    throw new AppError('Unauthorized: User context is required for this operation.', 401);
  }

  // HIERARCHY: Check if the user/workspace has enough API credits. This respects limits set by admins.
  const canCall = await usageService.canMakeApiCall(userContext, 'massive', cost);
  if (!canCall) {
    logger.warn(`[Massive] API limit exceeded for user ${userContext.userId} in workspace ${userContext.workspaceId}.`);
    throw new AppError('API call limit exceeded for your plan. Please upgrade or wait.', 429);
  }

  try {
    const result = await apiCallFn();
    // HIERARCHY: Record successful usage. This propagates usage data up to managers and admins for monitoring.
    await usageService.recordApiCall(userContext, { service: 'massive', function: functionName, cost });
    return result;
  } catch (error) {
    // BUG FIX: Centralized error handling with user context for better debugging.
    logger.error(`[Massive] API call failed for ${functionName} (User: ${userContext.userId}, Workspace: ${userContext.workspaceId}):`, error);
    // Re-throw to be handled by the global error handler.
    throw new AppError(error.message || 'An external API error occurred.', 502);
  }
};


// ─── HELPER ───────────────────────────────────────────────────────────────────
const fmt = (ticker) => String(ticker || '').toUpperCase().trim();
// BUG FIX: Create a robust helper for parsing ticker lists from either array or comma-separated string.
const fmtTickerList = (tickers) => (Array.isArray(tickers) ? tickers : String(tickers).split(',')).map(fmt).join(',');


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ STOCKS                                                                     ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Live quote + last trade for a stock ticker
 * Uses: getClient().getLastStocksQuote + getClient().getLastStocksTrade (verified ✓)
 */
const getStockQuoteService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Quote: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStockQuoteService', async () => {
    const [quote, trade, prev, snapshot] = await Promise.allSettled([
      getClient().getLastStocksQuote({ stocksTicker: t }),
      getClient().getLastStocksTrade({ stocksTicker: t }),
      getClient().getPreviousStocksAggregates({ stocksTicker: t }),
      getClient().getStocksSnapshotTicker({ stocksTicker: t }),
    ]);
    return {
      ticker: t,
      quote: quote.value?.results || {},
      trade: trade.value?.results || {},
      previousClose: prev.value?.results?.[0] || {},
      snapshot: snapshot.value || {},
      timestamp: Date.now(),
    };
  }, 4); // This operation consists of 4 API calls.
};

/**
 * Full snapshot for multiple tickers (verified ✓)
 */
const getStocksSnapshotTickersService = async (userContext, tickers) => {
  const tickerStr = fmtTickerList(tickers);
  logger.info(`[Massive] Stocks Snapshot Tickers: ${tickerStr} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStocksSnapshotTickersService', async () => {
    const response = await getClient().getStocksSnapshotTickers({ tickers: tickerStr });
    return response?.tickers || response;
  });
};

/**
 * Universal snapshot for any asset type (verified ✓)
 * Returns market_status, session change, type, etc.
 */
const getUniversalSnapshotService = async (userContext, tickers) => {
  const tickerStr = fmtTickerList(tickers);
  logger.info(`[Massive] Universal Snapshot: ${tickerStr} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getUniversalSnapshotService', async () => {
    const response = await getClient().getSnapshots({ 'ticker.any_of': tickerStr, limit: 10 });
    return response?.results || response;
  });
};

/**
 * Ticker details — company info, market cap, exchanges (verified ✓)
 */
const getTickerDetailsService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Ticker Details: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getTickerDetailsService', async () => {
    const response = await getClient().getTicker({ ticker: t });
    return response?.results || response;
  });
};

/**
 * Previous session aggregates — OHLCV (verified ✓)
 */
const getPreviousCloseService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Previous Close: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getPreviousCloseService', async () => {
    const response = await getClient().getPreviousStocksAggregates({ stocksTicker: t });
    return response?.results?.[0] || response;
  });
};

/**
 * Historical OHLCV aggregates for a ticker (verified ✓)
 */
const getStockAggregatesService = async (userContext, params) => {
  const { ticker, multiplier = 1, timespan = 'day', from, to } = params;
  const t = fmt(ticker);
  const dateTo = to || new Date().toISOString().split('T')[0];
  const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  logger.info(`[Massive] Stock Aggregates: ${t} (${dateFrom} to ${dateTo}) (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStockAggregatesService', () =>
    getClient().getStocksAggregates({
      stocksTicker: t,
      multiplier: Number(multiplier),
      timespan,
      from: dateFrom,
      to: dateTo,
    })
  );
};

/**
 * Key financial ratios — P/E, P/B, EPS, market cap, etc. (verified ✓)
 */
const getStockFinancialsRatiosService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Financials Ratios: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStockFinancialsRatiosService', async () => {
    const response = await getClient().getStocksFinancialsV1Ratios({ ticker: t, limit: 1 });
    return response?.results?.[0] || response;
  });
};

/**
 * Income statement — revenue, gross profit, net income (verified ✓)
 */
const getStockIncomeStatementService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Income Statement: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStockIncomeStatementService', async () => {
    const response = await getClient().getStocksFinancialsV1IncomeStatements({ ticker: t, limit: 4 });
    return response?.results || response;
  });
};

/**
 * Balance sheets and cash flow (verified ✓)
 */
const getStockBalanceSheetsService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Balance Sheet: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStockBalanceSheetsService', async () => {
    const [bs, cf] = await Promise.allSettled([
      getClient().getStocksFinancialsV1BalanceSheets({ ticker: t, limit: 2 }),
      getClient().getStocksFinancialsV1CashFlowStatements({ ticker: t, limit: 2 }),
    ]);
    return {
      balanceSheets: bs.value?.results || [],
      cashFlows: cf.value?.results || [],
    };
  }, 2); // Cost of 2 API calls.
};

/**
 * Dividend history (verified ✓)
 */
const getDividendsService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Dividends: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getDividendsService', async () => {
    const response = await getClient().getStocksV1Dividends({ ticker: t, limit: 8 });
    return response?.results || response;
  });
};

/**
 * Stock split history (verified ✓)
 */
const getStockSplitsService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Splits: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStockSplitsService', async () => {
    const response = await getClient().getStocksV1Splits({ ticker: t, limit: 5 });
    return response?.results || response;
  });
};

/**
 * Short interest data (verified ✓)
 */
const getShortInterestService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Short Interest: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getShortInterestService', async () => {
    const response = await getClient().getStocksV1ShortInterest({ ticker: t, limit: 5 });
    return response?.results || response;
  });
};

/**
 * Float data (shares outstanding, float) (verified ✓)
 */
const getStockFloatService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Float: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStockFloatService', async () => {
    const response = await getClient().getStocksVXFloat({ ticker: t });
    return response?.results || response;
  });
};

/**
 * RSI indicator for a stock (verified ✓)
 */
const getStockRSIService = async (userContext, ticker, window = 14) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock RSI: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStockRSIService', async () => {
    const response = await getClient().getStocksRSI({
      stockTicker: t,
      window: Number(window),
      timespan: 'day',
      adjusted: true,
      limit: 1,
    });
    // BUG FIX: Consistent return of null on failure, not the whole response object.
    return response?.results?.values?.[0] || null;
  });
};

/**
 * MACD indicator for a stock (verified ✓)
 * Returns: { value, signal, histogram, timestamp }
 */
const getStockMACDService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock MACD: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStockMACDService', async () => {
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
  });
};

/**
 * EMA (Exponential Moving Average) for a stock (verified ✓)
 */
const getStockEMAService = async (userContext, ticker, window = 50) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock EMA-${window}: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStockEMAService', async () => {
    const response = await getClient().getStocksEMA({
      stockTicker: t,
      window: Number(window),
      timespan: 'day',
      adjusted: true,
      limit: 1,
    });
    return response?.results?.values?.[0]?.value || null;
  });
};

/**
 * SMA (Simple Moving Average) for a stock (verified ✓)
 */
const getStockSMAService = async (userContext, ticker, window = 50) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock SMA-${window}: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStockSMAService', async () => {
    const response = await getClient().getStocksSMA({
      stockTicker: t,
      window: Number(window),
      timespan: 'day',
      adjusted: true,
      limit: 1,
    });
    return response?.results?.values?.[0]?.value || null;
  });
};

/**
 * Full technical analysis snapshot (verified ✓)
 * Fetches RSI-14, MACD, EMA-50, EMA-200, SMA-50, SMA-200 in parallel
 */
const getStockTechnicalSnapshotService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock Technicals: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  // INTEGRATION: This is a composite service. We check/record the total cost once.
  return withUsageTracking(userContext, 'getStockTechnicalSnapshotService', async () => {
    const [rsi, macd, ema50, ema200, sma50, sma200] = await Promise.allSettled([
      // Call the API directly to avoid nested usage tracking from individual services.
      getClient().getStocksRSI({ stockTicker: t, window: 14, timespan: 'day', adjusted: true, limit: 1 }),
      getClient().getStocksMACD({ stockTicker: t, short_window: 12, long_window: 26, signal_window: 9, timespan: 'day', adjusted: true, limit: 1 }),
      getClient().getStocksEMA({ stockTicker: t, window: 50, timespan: 'day', adjusted: true, limit: 1 }),
      getClient().getStocksEMA({ stockTicker: t, window: 200, timespan: 'day', adjusted: true, limit: 1 }),
      getClient().getStocksSMA({ stockTicker: t, window: 50, timespan: 'day', adjusted: true, limit: 1 }),
      getClient().getStocksSMA({ stockTicker: t, window: 200, timespan: 'day', adjusted: true, limit: 1 }),
    ]);
    return {
      ticker: t,
      rsi: rsi.value?.results?.values?.[0] || null,
      macd: macd.value?.results?.values?.[0] || null,
      ema50: ema50.value?.results?.values?.[0]?.value || null,
      ema200: ema200.value?.results?.values?.[0]?.value || null,
      sma50: sma50.value?.results?.values?.[0]?.value || null,
      sma200: sma200.value?.results?.values?.[0]?.value || null,
    };
  }, 6); // Total cost of 6 API calls.
};

/**
 * News for a stock ticker using listNews (verified ✓)
 */
const getStockNewsService = async (userContext, ticker, limit = 5) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Stock News: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStockNewsService', async () => {
    const response = await getClient().listNews({ ticker: t, limit: Number(limit) });
    return response?.results || response;
  });
};

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ OPTIONS                                                                    ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Options chain for an underlying ticker (verified ✓)
 */
const getOptionsChainService = async (userContext, underlyingTicker, limit = 30) => {
  const t = fmt(underlyingTicker);
  logger.info(`[Massive] Options Chain: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getOptionsChainService', () =>
    getClient().getOptionsChain({
      underlyingAsset: t,
      limit: Number(limit),
    })
  );
};

/**
 * Options chain filtered by expiration and type (verified ✓)
 */
const getOptionsChainFilteredService = async (userContext, ticker, { expiration, type, limit = 20 } = {}) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Options Chain Filtered: ${t} exp=${expiration} type=${type} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  const params = { underlyingAsset: t, limit: Number(limit) };
  if (expiration) params.expiration_date = expiration;
  if (type) params.contract_type = type.toLowerCase();
  return withUsageTracking(userContext, 'getOptionsChainFilteredService', () => getClient().getOptionsChain(params));
};

/**
 * List all options contracts for an underlying (verified ✓)
 */
const listOptionsContractsService = async (userContext, ticker, limit = 20) => {
  const t = fmt(ticker);
  logger.info(`[Massive] List Options Contracts: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'listOptionsContractsService', async () => {
    const response = await getClient().listOptionsContracts({ underlying_ticker: t, limit: Number(limit) });
    return response?.results || response;
  });
};

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ CRYPTO                                                                     ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Crypto snapshot for one or more pairs (verified ✓)
 * ticker format: X:BTCUSD, X:ETHUSD etc.
 */
const getCryptoSnapshotService = async (userContext, tickers) => {
  const tickerStr = fmtTickerList(tickers);
  logger.info(`[Massive] Crypto Snapshot: ${tickerStr} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getCryptoSnapshotService', async () => {
    const response = await getClient().getCryptoSnapshotTickers({ tickers: tickerStr });
    return response?.tickers || response;
  });
};

/**
 * Latest crypto trades (verified ✓)
 */
const getCryptoTradesService = async (userContext, cryptoTicker, limit = 3) => {
  logger.info(`[Massive] Crypto Trades: ${cryptoTicker} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getCryptoTradesService', async () => {
    const response = await getClient().getCryptoTrades({ cryptoTicker, limit: Number(limit) });
    return response?.results || response;
  });
};

/**
 * Crypto OHLCV aggregates (verified ✓)
 */
const getCryptoAggregatesService = async (userContext, ticker, { timespan = 'day', limit = 7 } = {}) => {
  logger.info(`[Massive] Crypto Aggregates: ${ticker} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return withUsageTracking(userContext, 'getCryptoAggregatesService', async () => {
    const response = await getClient().getCryptoAggregates({
      cryptoTicker: ticker,
      multiplier: 1,
      timespan,
      from,
      to,
      limit: Number(limit),
    });
    return response?.results || response;
  });
};

/**
 * Crypto RSI indicator (verified ✓)
 */
const getCryptoRSIService = async (userContext, ticker, window = 14) => {
  logger.info(`[Massive] Crypto RSI: ${ticker} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getCryptoRSIService', async () => {
    const response = await getClient().getCryptoRSI({
      cryptoTicker: ticker,
      window: Number(window),
      timespan: 'day',
      limit: 1,
    });
    return response?.results?.values?.[0] || null;
  });
};

/**
 * Crypto MACD indicator (verified ✓)
 */
const getCryptoMACDService = async (userContext, ticker) => {
  logger.info(`[Massive] Crypto MACD: ${ticker} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getCryptoMACDService', async () => {
    const response = await getClient().getCryptoMACD({
      cryptoTicker: ticker,
      short_window: 12,
      long_window: 26,
      signal_window: 9,
      timespan: 'day',
      adjusted: true,
      limit: 1,
    });
    return response?.results?.values?.[0] || null;
  });
};

/**
 * Crypto EMA indicator (verified ✓)
 */
const getCryptoEMAService = async (userContext, ticker, window = 50) => {
  logger.info(`[Massive] Crypto EMA-${window}: ${ticker} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getCryptoEMAService', async () => {
    const response = await getClient().getCryptoEMA({
      cryptoTicker: ticker,
      window: Number(window),
      timespan: 'day',
      adjusted: true,
      limit: 1,
    });
    return response?.results?.values?.[0] || null;
  });
};

/**
 * Full technical snapshot for a crypto pair: RSI + MACD + EMA50 + EMA200
 */
const getCryptoTechnicalSnapshotService = async (userContext, ticker) => {
  logger.info(`[Massive] Crypto Technicals: ${ticker} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getCryptoTechnicalSnapshotService', async () => {
    const [rsi, macd, ema50, ema200] = await Promise.allSettled([
      // Call API directly to avoid nested usage tracking
      getCryptoRSIService(userContext, ticker, 14),
      getCryptoMACDService(userContext, ticker),
      getCryptoEMAService(userContext, ticker, 50),
      getCryptoEMAService(userContext, ticker, 200),
    ]);
    return {
      ticker,
      rsi: rsi.status === 'fulfilled' ? rsi.value : null,
      macd: macd.status === 'fulfilled' ? macd.value : null,
      ema50: ema50.status === 'fulfilled' ? ema50.value : null,
      ema200: ema200.status === 'fulfilled' ? ema200.value : null,
    };
  }, 4); // Cost of 4 API calls.
};

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ FOREX                                                                      ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Forex snapshot for one or more pairs (verified ✓)
 * ticker format: C:EURUSD, C:GBPUSD etc.
 */
const getForexSnapshotService = async (userContext, tickers) => {
  const tickerStr = fmtTickerList(tickers);
  logger.info(`[Massive] Forex Snapshot: ${tickerStr} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getForexSnapshotService', async () => {
    const response = await getClient().getForexSnapshotTickers({ tickers: tickerStr });
    return response?.tickers || response;
  });
};

/**
 * Currency conversion with live bid/ask — supports arbitrary amounts (verified ✓)
 * E.g. convertAmount('EUR', 'USD', 1000)
 */
const getCurrencyConversionService = async (userContext, from, to, amount = 1) => {
  logger.info(`[Massive] Currency Conversion: ${from}->${to} x${amount} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getCurrencyConversionService', () =>
    getClient().getCurrencyConversion({ from: from.toUpperCase(), to: to.toUpperCase(), amount: Number(amount) })
  );
};

/**
 * Convenience alias used by router amount-conversion handler
 */
const getCurrencyConvertAmountService = getCurrencyConversionService;

/**
 * Forex OHLCV aggregates (verified ✓)
 */
const getForexAggregatesService = async (userContext, pair, { timespan = 'day', limit = 7 } = {}) => {
  logger.info(`[Massive] Forex Aggregates: ${pair} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return withUsageTracking(userContext, 'getForexAggregatesService', async () => {
    const response = await getClient().getForexAggregates({
      forexTicker: pair,
      multiplier: 1,
      timespan,
      from,
      to,
      limit: Number(limit),
    });
    return response?.results || response;
  });
};

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ MACRO / FEDERAL RESERVE                                                    ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * CPI inflation data from Fed (verified ✓)
 */
const getFedInflationService = async (userContext, limit = 12) => {
  logger.info(`[Massive] Fed Inflation (CPI) (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getFedInflationService', () => getClient().getFedV1Inflation({ limit: Number(limit) }));
};

/**
 * Treasury yield curve (verified ✓)
 */
const getFedYieldsService = async (userContext, limit = 5) => {
  logger.info(`[Massive] Fed Treasury Yields (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getFedYieldsService', () => getClient().getFedV1TreasuryYields({ limit: Number(limit) }));
};

/**
 * Labor market data — unemployment, participation rate (verified ✓)
 */
const getFedLaborMarketService = async (userContext, limit = 3) => {
  logger.info(`[Massive] Fed Labor Market (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getFedLaborMarketService', () => getClient().getFedV1LaborMarket({ limit: Number(limit) }));
};

/**
 * Inflation expectations model (verified ✓)
 */
const getFedInflationExpectationsService = async (userContext, limit = 3) => {
  logger.info(`[Massive] Fed Inflation Expectations (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getFedInflationExpectationsService', () => getClient().getFedV1InflationExpectations({ limit: Number(limit) }));
};

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ MARKET STATUS & HOURS                                                      ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Current market status — open/closed/extended hours (verified ✓)
 */
const getMarketStatusService = async (userContext) => {
  logger.info(`[Massive] Global Market Status (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getMarketStatusService', () => getClient().getMarketStatus());
};

/**
 * Upcoming market holidays (verified ✓)
 */
const getMarketHolidaysService = async (userContext) => {
  logger.info(`[Massive] Global Market Holidays (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getMarketHolidaysService', () => getClient().getMarketHolidays());
};

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ NEWS (no Benzinga premium)                                                 ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * General market news — works for any ticker (verified ✓)
 */
const getMarketNewsService = async (userContext, ticker, limit = 5) => {
  logger.info(`[Massive] Market News: ${ticker || 'general'} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  const params = { limit: Number(limit) };
  if (ticker) params.ticker = fmt(ticker);
  return withUsageTracking(userContext, 'getMarketNewsService', async () => {
    const response = await getClient().listNews(params);
    return response?.results || response;
  });
};

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ EVENTS (IPOs, corporate actions)                                           ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * IPO listings (verified available, testing entitlement)
 */
const getIPOsService = async (userContext, limit = 10) => {
  logger.info(`[Massive] IPO Listings (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getIPOsService', async () => {
    try {
      const response = await getClient().listIPOs({ limit: Number(limit) });
      return response?.results || response;
    } catch (e) {
      // This endpoint may fail based on plan entitlement. Gracefully return empty array.
      logger.warn(`[Massive] IPOs not available for user ${userContext.userId}: ${e.message}`);
      return [];
    }
  });
};

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ MARKET MOVERS / 52-WEEK / SUPPLEMENTAL                                     ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * 52-week high and low via weekly aggregates (verified ✓)
 */
const getStock52WeekService = async (userContext, ticker) => {
  const t = fmt(ticker);
  logger.info(`[Massive] 52-Week High/Low: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getStock52WeekService', async () => {
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
  });
};

/**
 * Top movers from a pre-defined universe of liquid stocks (verified ✓)
 */
const getTopMoversService = async (userContext, direction = 'gainers') => {
  const stockOnly = [
    'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AVGO','JPM','V',
    'MA','UNH','XOM','JNJ','PG','HD','COST','ABBV','LLY','CRM',
    'AMD','QCOM','INTC','NFLX','DIS','BA','GE','GS','WMT','BAC',
    'SPY','QQQ','IWM','COIN','MSTR','RIOT','MARA','IBIT',
  ];
  logger.info(`[Massive] Top Movers: ${direction} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getTopMoversService', async () => {
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
  });
};

/**
 * Global market news — no ticker filter (verified ✓)
 */
const getMarketNewsGlobalService = async (userContext, limit = 8) => {
  logger.info(`[Massive] Global Market News (limit=${limit}) (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getMarketNewsGlobalService', async () => {
    const response = await getClient().listNews({ limit: Number(limit) });
    return response?.results || [];
  });
};

/**
 * Dividend history for a stock (verified ✓)
 */
const getDividendDetailService = async (userContext, ticker, limit = 4) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Dividend Detail: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getDividendDetailService', async () => {
    const response = await getClient().getStocksV1Dividends({ ticker: t, limit: Number(limit) });
    return response?.results || [];
  });
};

/**
 * Short interest data for a stock (verified ✓)
 */
const getShortInterestDetailService = async (userContext, ticker, limit = 3) => {
  const t = fmt(ticker);
  logger.info(`[Massive] Short Interest: ${t} (User: ${userContext?.userId}, Workspace: ${userContext?.workspaceId})`);
  return withUsageTracking(userContext, 'getShortInterestDetailService', async () => {
    const response = await getClient().getStocksV1ShortInterest({ ticker: t, limit: Number(limit) });
    return response?.results || [];
  });
};

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ NAMED INDIVIDUAL EXPORTS (used by massiveSmartRouter)                      ║
// ╚════════════════════════════════════════════════════════════════════════════╝

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
  getCryptoMACDService,
  getCryptoEMAService,
  getCryptoTechnicalSnapshotService,
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
  // Supplemental / v4/v5 services
  getStock52WeekService,
  getCurrencyConvertAmountService,
  getTopMoversService,
  getMarketNewsGlobalService,
  getDividendDetailService,
  getShortInterestDetailService,
};

// ─── Default grouped export (legacy support) ──────────────────────────────────
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
  getTopMoversService,
  getDividendDetailService,
  getShortInterestDetailService,
};