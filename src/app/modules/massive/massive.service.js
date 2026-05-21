import { restClient } from '@massive.com/client-js';
import dotenv from 'dotenv';
import { logger } from '../../../shared/logger.js';

dotenv.config();

const apiKey = process.env.MASSIVE_API_KEY;
if (!apiKey) {
  logger.warn(
    '[Massive.com] WARNING: MASSIVE_API_KEY env var not set. Real-time financial data will be unavailable. Set this in your .env and Cloud Run secrets.'
  );
}
const rest = restClient(apiKey || '', 'https://api.massive.com');

// ─── STOCKS ───────────────────────────────────────

const getStockQuoteService = async (ticker) => {
  const formattedTicker = ticker.toUpperCase().trim();
  logger.info(`[Massive] Stock Quote: ${formattedTicker}`);
  const [quote, trade] = await Promise.all([
    rest.getLastStocksQuote({ stocksTicker: formattedTicker }),
    rest.getLastStocksTrade({ stocksTicker: formattedTicker }),
  ]);
  return {
    ticker: formattedTicker,
    quote: quote?.results || quote || {},
    trade: trade?.results || trade || {},
    timestamp: Date.now(),
  };
};

const getStockSnapshotService = async (ticker) => {
  const formattedTicker = ticker.toUpperCase().trim();
  logger.info(`[Massive] Stock Snapshot: ${formattedTicker}`);
  const response = await rest.getSnapshotAllTickers({
    tickers: formattedTicker,
  });
  return response?.tickers?.[0] || response;
};

const getStockTickerDetailsService = async (ticker) => {
  const formattedTicker = ticker.toUpperCase().trim();
  logger.info(`[Massive] Stock Ticker Details: ${formattedTicker}`);
  const response = await rest.getTickerDetails({ ticker: formattedTicker });
  return response?.results || response;
};

const getStockAggregatesService = async (params) => {
  const { ticker, multiplier = 1, timespan = 'day', from, to } = params;
  const formattedTicker = ticker.toUpperCase().trim();
  const dateTo = to || new Date().toISOString().split('T')[0];
  const dateFrom =
    from ||
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
  logger.info(
    `[Massive] Stock Aggregates: ${formattedTicker} (${dateFrom} to ${dateTo})`
  );
  return rest.getStocksAggregates({
    stocksTicker: formattedTicker,
    multiplier: Number(multiplier),
    timespan,
    from: dateFrom,
    to: dateTo,
  });
};

const getPreviousCloseService = async (ticker) => {
  const formattedTicker = ticker.toUpperCase().trim();
  logger.info(`[Massive] Previous Close: ${formattedTicker}`);
  const response = await rest.getPreviousClose({ stocksTicker: formattedTicker });
  return response?.results?.[0] || response;
};

const getStockFinancialsService = async (ticker) => {
  const formattedTicker = ticker.toUpperCase().trim();
  logger.info(`[Massive] Stock Financials: ${formattedTicker}`);
  const response = await rest.getStockFinancials({
    ticker: formattedTicker,
    limit: 4,
  });
  return response?.results || response;
};

const getRelatedCompaniesService = async (ticker) => {
  const formattedTicker = ticker.toUpperCase().trim();
  logger.info(`[Massive] Related Companies: ${formattedTicker}`);
  const response = await rest.getRelatedCompanies({ ticker: formattedTicker });
  return response?.results || response;
};

const getDividendsService = async (ticker) => {
  const formattedTicker = ticker.toUpperCase().trim();
  logger.info(`[Massive] Dividends: ${formattedTicker}`);
  const response = await rest.getStockDividends({
    ticker: formattedTicker,
    limit: 8,
  });
  return response?.results || response;
};

const getStockSplitsService = async (ticker) => {
  const formattedTicker = ticker.toUpperCase().trim();
  logger.info(`[Massive] Stock Splits: ${formattedTicker}`);
  const response = await rest.getStockSplits({
    ticker: formattedTicker,
    limit: 5,
  });
  return response?.results || response;
};

const getIndicesSnapshotService = async () => {
  logger.info('[Massive] Fetching Indices Snapshot (DJIA, SPX, NASDAQ)');
  const response = await rest.getIndicesSnapshot({
    tickers: 'I:DJI,I:SPX,I:NDX,I:VIX,I:RUT',
  });
  return response?.results || response;
};

// ─── OPTIONS ───────────────────────────────────────

const getOptionsChainService = async (underlyingTicker, limit = 50) => {
  const formattedTicker = underlyingTicker.toUpperCase().trim();
  logger.info(`[Massive] Options Chain: ${formattedTicker}`);
  const response = await rest.getOptionsChain({
    underlyingAsset: formattedTicker,
    limit: Number(limit),
  });
  return response;
};

const getOptionsSnapshotService = async (underlyingTicker) => {
  const formattedTicker = underlyingTicker.toUpperCase().trim();
  logger.info(`[Massive] Options Snapshot: ${formattedTicker}`);
  const response = await rest.getOptionsContractSnapshot({
    underlyingAsset: formattedTicker,
    limit: 20,
  });
  return response?.results || response;
};

const getOptionsQuoteService = async (contractTicker) => {
  const formattedTicker = contractTicker.replace('O:', '').toUpperCase().trim();
  logger.info(`[Massive] Options Quote: ${formattedTicker}`);
  const quote = await rest.getLastOptionsTrade({
    optionsTicker: formattedTicker,
  });
  return {
    contractTicker: formattedTicker,
    quote: quote?.results || quote || {},
    timestamp: Date.now(),
  };
};

// ─── CRYPTO ───────────────────────────────────────

const getCryptoQuoteService = async (ticker) => {
  const cleanTicker = ticker.replace('X:', '').toUpperCase().trim();
  const from = cleanTicker.substring(0, 3);
  const to = cleanTicker.substring(3) || 'USD';
  logger.info(`[Massive] Crypto Trade: ${from}/${to}`);
  const trade = await rest.getLastCryptoTrade({ from, to });
  return {
    ticker: `${from}${to}`,
    trade: trade?.results || trade || {},
    timestamp: Date.now(),
  };
};

const getCryptoSnapshotAllService = async () => {
  logger.info('[Massive] Fetching All Crypto Snapshots');
  const response = await rest.getSnapshotAllCryptoTickers({
    locale: 'global',
    market: 'crypto',
  });
  return response?.tickers?.slice(0, 50) || [];
};

const getCryptoAggregatesService = async (params) => {
  const { ticker, multiplier = 1, timespan = 'day', from, to } = params;
  let formattedTicker = ticker.toUpperCase().trim();
  if (!formattedTicker.startsWith('X:')) formattedTicker = `X:${formattedTicker}`;
  const dateTo = to || new Date().toISOString().split('T')[0];
  const dateFrom =
    from ||
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  logger.info(`[Massive] Crypto Aggregates: ${formattedTicker}`);
  return rest.getCryptoAggregates({
    cryptoTicker: formattedTicker,
    multiplier: Number(multiplier),
    timespan,
    from: dateFrom,
    to: dateTo,
  });
};

// ─── FOREX ───────────────────────────────────────

const getForexQuoteService = async (ticker) => {
  const cleanTicker = ticker.replace('C:', '').toUpperCase().trim();
  const from = cleanTicker.substring(0, 3);
  const to = cleanTicker.substring(3) || 'USD';
  logger.info(`[Massive] Forex Quote: ${from}/${to}`);
  const quote = await rest.getLastCurrencyQuote({ from, to });
  return {
    ticker: `${from}${to}`,
    quote: quote?.results || quote || {},
    timestamp: Date.now(),
  };
};

const getForexSnapshotAllService = async () => {
  logger.info('[Massive] Fetching All Forex Snapshots');
  const response = await rest.getSnapshotAllForexTickers({
    locale: 'global',
    market: 'fx',
  });
  return response?.tickers?.slice(0, 100) || [];
};

const getForexAggregatesService = async (params) => {
  const { ticker, multiplier = 1, timespan = 'day', from, to } = params;
  let formattedTicker = ticker.toUpperCase().trim();
  if (!formattedTicker.startsWith('C:')) formattedTicker = `C:${formattedTicker}`;
  const dateTo = to || new Date().toISOString().split('T')[0];
  const dateFrom =
    from ||
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  logger.info(`[Massive] Forex Aggregates: ${formattedTicker}`);
  return rest.getForexAggregates({
    forexTicker: formattedTicker,
    multiplier: Number(multiplier),
    timespan,
    from: dateFrom,
    to: dateTo,
  });
};

// ─── BENZINGA (NEWS & RATINGS) ───────────────────

const getBenzingaNewsService = async (ticker, limit = 5) => {
  const formattedTicker = ticker.toUpperCase().trim();
  logger.info(`[Massive] Benzinga News: ${formattedTicker}`);
  return rest.getBenzingaV2News({ ticker: formattedTicker, limit: Number(limit) });
};

const getBenzingaRatingsService = async (ticker, limit = 5) => {
  const formattedTicker = ticker.toUpperCase().trim();
  logger.info(`[Massive] Benzinga Ratings: ${formattedTicker}`);
  return rest.getBenzingaV1Ratings({ ticker: formattedTicker, limit: Number(limit) });
};

// ─── ETF ───────────────────────────────────────

const getEtfProfilesService = async (ticker) => {
  const formattedTicker = ticker.toUpperCase().trim();
  logger.info(`[Massive] ETF Profile: ${formattedTicker}`);
  return rest.getEtfGlobalV1Profiles({ compositeTicker: formattedTicker });
};

const getEtfConstituentsService = async (ticker, limit = 10) => {
  const formattedTicker = ticker.toUpperCase().trim();
  logger.info(`[Massive] ETF Constituents: ${formattedTicker}`);
  return rest.getEtfGlobalV1Constituents({
    compositeTicker: formattedTicker,
    limit: Number(limit),
  });
};

// ─── FEDERAL RESERVE / MACRO ───────────────────

const getFedInflationService = async (limit = 6) => {
  logger.info('[Massive] Fed Inflation Stats');
  return rest.getFedV1Inflation({ limit: Number(limit) });
};

const getFedYieldsService = async (limit = 6) => {
  logger.info('[Massive] Fed Treasury Yields');
  return rest.getFedV1TreasuryYields({ limit: Number(limit) });
};

// ─── MARKET STATUS & HOLIDAYS ───────────────────

const getMarketStatusService = async () => {
  logger.info('[Massive] Global Market Status');
  return rest.getMarketStatus();
};

const getMarketHolidaysService = async () => {
  logger.info('[Massive] Global Market Holidays');
  return rest.getMarketHolidays();
};

export const massiveService = {
  // Stocks
  getStockQuoteService,
  getStockSnapshotService,
  getStockTickerDetailsService,
  getStockAggregatesService,
  getPreviousCloseService,
  getStockFinancialsService,
  getRelatedCompaniesService,
  getDividendsService,
  getStockSplitsService,
  getIndicesSnapshotService,
  // Options
  getOptionsChainService,
  getOptionsSnapshotService,
  getOptionsQuoteService,
  // Crypto
  getCryptoQuoteService,
  getCryptoSnapshotAllService,
  getCryptoAggregatesService,
  // Forex
  getForexQuoteService,
  getForexSnapshotAllService,
  getForexAggregatesService,
  // News & Ratings
  getBenzingaNewsService,
  getBenzingaRatingsService,
  // ETF
  getEtfProfilesService,
  getEtfConstituentsService,
  // Fed / Macro
  getFedInflationService,
  getFedYieldsService,
  // Market
  getMarketStatusService,
  getMarketHolidaysService,
};
