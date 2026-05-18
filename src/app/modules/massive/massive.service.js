import { restClient } from '@massive.com/client-js';
import dotenv from 'dotenv';
import { logger } from '../../../shared/logger.js';

dotenv.config();

const apiKey = process.env.MASSIVE_API_KEY || 'gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3';
const rest = restClient(apiKey, 'https://api.massive.com');

/**
 * Get the latest stock quote for a ticker (e.g. AAPL)
 */
const getStockQuoteService = async (ticker) => {
  try {
    const formattedTicker = ticker.toUpperCase().trim();
    logger.info(`Fetching stock quote for: ${formattedTicker}`);

    const quote = await rest.getLastStocksQuote({
      stocksTicker: formattedTicker,
    });
    const trade = await rest.getLastStocksTrade({
      stocksTicker: formattedTicker,
    });

    return {
      ticker: formattedTicker,
      quote: quote?.results || quote || {},
      trade: trade?.results || trade || {},
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.error(`Error in getStockQuoteService for ${ticker}:`, error);
    throw new Error(error.message || 'Failed to fetch stock quote');
  }
};

/**
 * Get stock aggregates (historical bars/chart data)
 */
const getStockAggregatesService = async (params) => {
  try {
    const { ticker, multiplier = 1, timespan = 'day', from, to } = params;
    const formattedTicker = ticker.toUpperCase().trim();

    const dateTo = to || new Date().toISOString().split('T')[0];
    const dateFrom =
      from ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    logger.info(
      `Fetching stock aggregates for: ${formattedTicker} (${dateFrom} to ${dateTo})`
    );

    const response = await rest.getStocksAggregates({
      stocksTicker: formattedTicker,
      multiplier: Number(multiplier),
      timespan,
      from: dateFrom,
      to: dateTo,
    });

    return response;
  } catch (error) {
    logger.error('Error in getStockAggregatesService:', error);
    throw new Error(error.message || 'Failed to fetch stock aggregates');
  }
};

/**
 * Get the latest cryptocurrency trade/price (e.g. BTCUSD)
 */
const getCryptoQuoteService = async (ticker) => {
  try {
    const cleanTicker = ticker.replace('X:', '').toUpperCase().trim();
    const from = cleanTicker.substring(0, 3);
    const to = cleanTicker.substring(3) || 'USD';

    logger.info(`Fetching crypto trade for: ${from} to ${to}`);

    const trade = await rest.getLastCryptoTrade({ from, to });

    return {
      ticker: `${from}${to}`,
      trade: trade?.results || trade || {},
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.error(`Error in getCryptoQuoteService for ${ticker}:`, error);
    throw new Error(error.message || 'Failed to fetch crypto quote');
  }
};

/**
 * Get crypto aggregates (historical bars/chart data)
 */
const getCryptoAggregatesService = async (params) => {
  try {
    const { ticker, multiplier = 1, timespan = 'day', from, to } = params;
    let formattedTicker = ticker.toUpperCase().trim();
    if (!formattedTicker.startsWith('X:')) {
      formattedTicker = `X:${formattedTicker}`;
    }

    const dateTo = to || new Date().toISOString().split('T')[0];
    const dateFrom =
      from ||
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    logger.info(
      `Fetching crypto aggregates for: ${formattedTicker} (${dateFrom} to ${dateTo})`
    );

    const response = await rest.getCryptoAggregates({
      cryptoTicker: formattedTicker,
      multiplier: Number(multiplier),
      timespan,
      from: dateFrom,
      to: dateTo,
    });

    return response;
  } catch (error) {
    logger.error('Error in getCryptoAggregatesService:', error);
    throw new Error(error.message || 'Failed to fetch crypto aggregates');
  }
};

/**
 * Get the latest forex currency quote (e.g. EURUSD)
 */
const getForexQuoteService = async (ticker) => {
  try {
    const cleanTicker = ticker.replace('C:', '').toUpperCase().trim();
    const from = cleanTicker.substring(0, 3);
    const to = cleanTicker.substring(3) || 'USD';

    logger.info(`Fetching forex quote for: ${from} to ${to}`);

    const quote = await rest.getLastCurrencyQuote({ from, to });

    return {
      ticker: `${from}${to}`,
      quote: quote?.results || quote || {},
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.error(`Error in getForexQuoteService for ${ticker}:`, error);
    throw new Error(error.message || 'Failed to fetch forex currency quote');
  }
};

/**
 * Get options contract chain for a stock underlying ticker
 */
const getOptionsChainService = async (underlyingTicker) => {
  try {
    const formattedTicker = underlyingTicker.toUpperCase().trim();
    logger.info(`Fetching options contracts chain for: ${formattedTicker}`);

    const response = await rest.getOptionsChain({
      underlyingAsset: formattedTicker,
      limit: 50,
    });

    return response;
  } catch (error) {
    logger.error(
      `Error in getOptionsChainService for ${underlyingTicker}:`,
      error
    );
    throw new Error(error.message || 'Failed to fetch options chain');
  }
};

/**
 * Get real-time options quote for a specific contract (e.g. O:AAPL230616C00150000)
 */
const getOptionsQuoteService = async (contractTicker) => {
  try {
    const formattedTicker = contractTicker
      .replace('O:', '')
      .toUpperCase()
      .trim();
    logger.info(`Fetching options quote for: ${formattedTicker}`);

    const quote = await rest.getLastOptionsTrade({
      optionsTicker: formattedTicker,
    });

    return {
      contractTicker: formattedTicker,
      quote: quote?.results || quote || {},
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.error(
      `Error in getOptionsQuoteService for ${contractTicker}:`,
      error
    );
    throw new Error(error.message || 'Failed to fetch options quote');
  }
};

/**
 * Get Benzinga news feed for a ticker (e.g. AAPL)
 */
const getBenzingaNewsService = async (ticker, limit = 10) => {
  try {
    const formattedTicker = ticker.toUpperCase().trim();
    logger.info(
      `Fetching Benzinga News for: ${formattedTicker} (Limit: ${limit})`
    );

    const response = await rest.getBenzingaV2News({
      ticker: formattedTicker,
      limit: Number(limit),
    });
    return response;
  } catch (error) {
    logger.error(`Error in getBenzingaNewsService for ${ticker}:`, error);
    throw new Error(error.message || 'Failed to fetch Benzinga News');
  }
};

/**
 * Get Benzinga analyst ratings & consensus for a ticker
 */
const getBenzingaRatingsService = async (ticker, limit = 10) => {
  try {
    const formattedTicker = ticker.toUpperCase().trim();
    logger.info(
      `Fetching Benzinga Analyst Ratings for: ${formattedTicker} (Limit: ${limit})`
    );

    const response = await rest.getBenzingaV1Ratings({
      ticker: formattedTicker,
      limit: Number(limit),
    });
    return response;
  } catch (error) {
    logger.error(`Error in getBenzingaRatingsService for ${ticker}:`, error);
    throw new Error(
      error.message || 'Failed to fetch Benzinga Analyst Ratings'
    );
  }
};

/**
 * Get ETF profile details for an ETF composite ticker (e.g. SPY)
 */
const getEtfProfilesService = async (ticker) => {
  try {
    const formattedTicker = ticker.toUpperCase().trim();
    logger.info(`Fetching ETF Profile for: ${formattedTicker}`);

    const response = await rest.getEtfGlobalV1Profiles({
      compositeTicker: formattedTicker,
    });
    return response;
  } catch (error) {
    logger.error(`Error in getEtfProfilesService for ${ticker}:`, error);
    throw new Error(error.message || 'Failed to fetch ETF Profiles');
  }
};

/**
 * Get ETF constituents (top holdings) for an ETF composite ticker
 */
const getEtfConstituentsService = async (ticker, limit = 50) => {
  try {
    const formattedTicker = ticker.toUpperCase().trim();
    logger.info(
      `Fetching ETF Constituents for: ${formattedTicker} (Limit: ${limit})`
    );

    const response = await rest.getEtfGlobalV1Constituents({
      compositeTicker: formattedTicker,
      limit: Number(limit),
    });
    return response;
  } catch (error) {
    logger.error(`Error in getEtfConstituentsService for ${ticker}:`, error);
    throw new Error(error.message || 'Failed to fetch ETF Constituents');
  }
};

/**
 * Get Federal Reserve inflation statistics (CPI, etc.)
 */
const getFedInflationService = async (limit = 12) => {
  try {
    logger.info(`Fetching Fed Inflation stats (Limit: ${limit})`);
    const response = await rest.getFedV1Inflation({ limit: Number(limit) });
    return response;
  } catch (error) {
    logger.error(`Error in getFedInflationService:`, error);
    throw new Error(
      error.message || 'Failed to fetch Fed Inflation Statistics'
    );
  }
};

/**
 * Get Federal Reserve treasury yields statistics (10Y, etc.)
 */
const getFedYieldsService = async (limit = 12) => {
  try {
    logger.info(`Fetching Fed Treasury Yields stats (Limit: ${limit})`);
    const response = await rest.getFedV1TreasuryYields({
      limit: Number(limit),
    });
    return response;
  } catch (error) {
    logger.error(`Error in getFedYieldsService:`, error);
    throw new Error(error.message || 'Failed to fetch Fed Treasury Yields');
  }
};

/**
 * Get the current global market trading status (open, closed, pre-market)
 */
const getMarketStatusService = async () => {
  try {
    logger.info(`Fetching global market status`);
    const response = await rest.getMarketStatus();
    return response;
  } catch (error) {
    logger.error(`Error in getMarketStatusService:`, error);
    throw new Error(error.message || 'Failed to fetch global market status');
  }
};

/**
 * Get list of global market trading holidays
 */
const getMarketHolidaysService = async () => {
  try {
    logger.info(`Fetching global market holidays`);
    const response = await rest.getMarketHolidays();
    return response;
  } catch (error) {
    logger.error(`Error in getMarketHolidaysService:`, error);
    throw new Error(error.message || 'Failed to fetch global market holidays');
  }
};

export const massiveService = {
  getStockQuoteService,
  getStockAggregatesService,
  getCryptoQuoteService,
  getCryptoAggregatesService,
  getForexQuoteService,
  getOptionsChainService,
  getOptionsQuoteService,
  getBenzingaNewsService,
  getBenzingaRatingsService,
  getEtfProfilesService,
  getEtfConstituentsService,
  getFedInflationService,
  getFedYieldsService,
  getMarketStatusService,
  getMarketHolidaysService,
};
