import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { massiveService } from './massive.service.js';

const getStockQuote = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await massiveService.getStockQuoteService(ticker);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Stock quote retrieved successfully',
    data: result,
  });
});

const getStockAggregates = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { multiplier, timespan, from, to } = req.query;

  const result = await massiveService.getStockAggregatesService({
    ticker,
    multiplier,
    timespan,
    from,
    to,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Stock aggregates retrieved successfully',
    data: result,
  });
});

const getCryptoQuote = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await massiveService.getCryptoQuoteService(ticker);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Crypto quote retrieved successfully',
    data: result,
  });
});

const getCryptoAggregates = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { multiplier, timespan, from, to } = req.query;

  const result = await massiveService.getCryptoAggregatesService({
    ticker,
    multiplier,
    timespan,
    from,
    to,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Crypto aggregates retrieved successfully',
    data: result,
  });
});

const getForexQuote = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await massiveService.getForexQuoteService(ticker);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Forex quote retrieved successfully',
    data: result,
  });
});

const getOptionsChain = catchAsync(async (req, res) => {
  const { underlyingTicker } = req.params;
  const result = await massiveService.getOptionsChainService(underlyingTicker);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Options contract chain retrieved successfully',
    data: result,
  });
});

const getOptionsQuote = catchAsync(async (req, res) => {
  const { contractTicker } = req.params;
  const result = await massiveService.getOptionsQuoteService(contractTicker);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Options contract quote retrieved successfully',
    data: result,
  });
});

const getBenzingaNews = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;
  const result = await massiveService.getBenzingaNewsService(ticker, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Benzinga News feed retrieved successfully',
    data: result,
  });
});

const getBenzingaRatings = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;
  const result = await massiveService.getBenzingaRatingsService(ticker, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Benzinga Analyst Ratings retrieved successfully',
    data: result,
  });
});

const getEtfProfiles = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await massiveService.getEtfProfilesService(ticker);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ETF Profiles retrieved successfully',
    data: result,
  });
});

const getEtfConstituents = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;
  const result = await massiveService.getEtfConstituentsService(ticker, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ETF Constituents retrieved successfully',
    data: result,
  });
});

const getFedInflation = catchAsync(async (req, res) => {
  const { limit } = req.query;
  const result = await massiveService.getFedInflationService(limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fed Inflation statistics retrieved successfully',
    data: result,
  });
});

const getFedYields = catchAsync(async (req, res) => {
  const { limit } = req.query;
  const result = await massiveService.getFedYieldsService(limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fed Treasury Yields retrieved successfully',
    data: result,
  });
});

const getMarketStatus = catchAsync(async (req, res) => {
  const result = await massiveService.getMarketStatusService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Market Status retrieved successfully',
    data: result,
  });
});

const getMarketHolidays = catchAsync(async (req, res) => {
  const result = await massiveService.getMarketHolidaysService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Market Holidays retrieved successfully',
    data: result,
  });
});

// ─── Stock Fundamentals ───────────────────────────────────────────────────────

const getStockFinancials = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await massiveService.getStockFinancialsRatiosService(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Stock financials & ratios retrieved', data: result });
});

const getStockIncomeStatement = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;
  const result = await massiveService.getStockIncomeStatementService(ticker, limit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Income statement retrieved', data: result });
});

const getStockBalanceSheet = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;
  const result = await massiveService.getStockBalanceSheetsService(ticker, limit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Balance sheet retrieved', data: result });
});

const getStockDividends = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;
  const result = await massiveService.getDividendsService(ticker, limit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Dividends retrieved', data: result });
});

const getStockSplits = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;
  const result = await massiveService.getStockSplitsService(ticker, limit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Stock splits retrieved', data: result });
});

const getStockFloat = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await massiveService.getStockFloatService(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Stock float retrieved', data: result });
});

const getShortInterest = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await massiveService.getShortInterestDetailService(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Short interest retrieved', data: result });
});

const getStock52Week = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await massiveService.getStock52WeekService(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: '52-week high/low retrieved', data: result });
});

const getTickerDetails = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await massiveService.getTickerDetailsService(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Ticker details retrieved', data: result });
});

// ─── News ─────────────────────────────────────────────────────────────────────

const getStockNews = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;
  const result = await massiveService.getStockNewsService(ticker, limit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Stock news retrieved', data: result });
});

const getMarketNews = catchAsync(async (req, res) => {
  const { limit } = req.query;
  const result = await massiveService.getMarketNewsService(limit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Market news retrieved', data: result });
});

const getGlobalNews = catchAsync(async (req, res) => {
  const { limit } = req.query;
  const result = await massiveService.getMarketNewsGlobalService(limit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Global market news retrieved', data: result });
});

// ─── Market-wide ──────────────────────────────────────────────────────────────

const getTopMovers = catchAsync(async (req, res) => {
  const result = await massiveService.getTopMoversService();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Top movers retrieved', data: result });
});

const getIPOs = catchAsync(async (req, res) => {
  const result = await massiveService.getIPOsService();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'IPO calendar retrieved', data: result });
});

const getFedLaborMarket = catchAsync(async (req, res) => {
  const { limit } = req.query;
  const result = await massiveService.getFedLaborMarketService(limit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Fed labor market data retrieved', data: result });
});

const getFedInflationExpectations = catchAsync(async (req, res) => {
  const { limit } = req.query;
  const result = await massiveService.getFedInflationExpectationsService(limit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Inflation expectations retrieved', data: result });
});

// ─── Market Overview Dashboard ────────────────────────────────────────────────
// Single endpoint: indices + BTC + gold + oil + VIX + top movers + market status
// all fetched in parallel — ideal for a dashboard widget or home screen

const getMarketOverview = catchAsync(async (req, res) => {
  const INDEX_TICKERS  = ['SPY', 'QQQ', 'DIA', 'IWM'];
  const ASSET_TICKERS  = ['BTC-USD', 'GLD', 'USO', 'VIXY'];

  const [indexSnapshots, assetSnapshots, marketStatus, topMovers, marketNews] =
    await Promise.allSettled([
      massiveService.getStocksSnapshotTickersService(INDEX_TICKERS),
      massiveService.getStocksSnapshotTickersService(ASSET_TICKERS),
      massiveService.getMarketStatusService(),
      massiveService.getTopMoversService(),
      massiveService.getMarketNewsService(5),
    ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Market overview retrieved',
    data: {
      indices:      indexSnapshots.status  === 'fulfilled' ? indexSnapshots.value  : null,
      assets:       assetSnapshots.status  === 'fulfilled' ? assetSnapshots.value  : null,
      marketStatus: marketStatus.status    === 'fulfilled' ? marketStatus.value    : null,
      topMovers:    topMovers.status       === 'fulfilled' ? topMovers.value       : null,
      news:         marketNews.status      === 'fulfilled' ? marketNews.value      : null,
      fetchedAt:    new Date().toISOString(),
    },
  });
});

// ─── Watchlist Batch Quote ─────────────────────────────────────────────────────
// POST body: { tickers: ['AAPL', 'MSFT', 'NVDA', ...] } (max 50)
// Returns live snapshots for all tickers in a single parallel batch fetch.

const getWatchlistQuotes = catchAsync(async (req, res) => {
  const { tickers } = req.body;

  if (!Array.isArray(tickers) || tickers.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Request body must include a non-empty "tickers" array',
      data: null,
    });
  }

  // Cap at 50 tickers per request to protect against abuse
  const safeTickers = tickers.slice(0, 50).map(t => t.toUpperCase().trim());

  // Separate stocks, crypto (X:), and forex (C:) by prefix
  const stockTickers  = safeTickers.filter(t => !t.startsWith('X:') && !t.startsWith('C:'));
  const cryptoTickers = safeTickers.filter(t => t.startsWith('X:'));
  const forexTickers  = safeTickers.filter(t => t.startsWith('C:'));

  const results = await Promise.allSettled([
    stockTickers.length  > 0 ? massiveService.getStocksSnapshotTickersService(stockTickers)  : Promise.resolve(null),
    cryptoTickers.length > 0 ? massiveService.getStocksSnapshotTickersService(cryptoTickers) : Promise.resolve(null),
    forexTickers.length  > 0 ? massiveService.getForexSnapshotService(forexTickers[0])       : Promise.resolve(null),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Watchlist quotes fetched for ${safeTickers.length} ticker(s)`,
    data: {
      stocks:    results[0].status === 'fulfilled' ? results[0].value : null,
      crypto:    results[1].status === 'fulfilled' ? results[1].value : null,
      forex:     results[2].status === 'fulfilled' ? results[2].value : null,
      tickers:   safeTickers,
      fetchedAt: new Date().toISOString(),
    },
  });
});

// ─── Options Filtered ─────────────────────────────────────────────────────────

const getOptionsFiltered = catchAsync(async (req, res) => {
  const { underlyingTicker } = req.params;
  const { type, expiry, strike_price_gte, strike_price_lte, limit } = req.query;
  const result = await massiveService.getOptionsChainFilteredService(
    underlyingTicker, { type, expiry, strike_price_gte, strike_price_lte, limit }
  );
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Filtered options chain retrieved', data: result });
});

// ─── Forex Aggregates ─────────────────────────────────────────────────────────

const getForexAggregates = catchAsync(async (req, res) => {
  const { pair } = req.params;
  const { multiplier, timespan, from, to } = req.query;
  const result = await massiveService.getForexAggregatesService({ pair, multiplier, timespan, from, to });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Forex aggregates retrieved', data: result });
});

// ─── Currency Conversion ──────────────────────────────────────────────────────

const getCurrencyConversion = catchAsync(async (req, res) => {
  const { from, to } = req.params;
  const { amount } = req.query;
  const result = amount
    ? await massiveService.getCurrencyConvertAmountService(from, to, amount)
    : await massiveService.getCurrencyConversionService(from, to);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Currency conversion retrieved', data: result });
});

// ─── Previous Close ───────────────────────────────────────────────────────────

const getPreviousClose = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const result = await massiveService.getPreviousCloseService(ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Previous close retrieved', data: result });
});

export const MassiveController = {
  // Existing
  getStockQuote,
  getStockAggregates,
  getCryptoQuote,
  getCryptoAggregates,
  getForexQuote,
  getOptionsChain,
  getOptionsQuote,
  getBenzingaNews,
  getBenzingaRatings,
  getEtfProfiles,
  getEtfConstituents,
  getFedInflation,
  getFedYields,
  getMarketStatus,
  getMarketHolidays,
  // Stock fundamentals
  getStockFinancials,
  getStockIncomeStatement,
  getStockBalanceSheet,
  getStockDividends,
  getStockSplits,
  getStockFloat,
  getShortInterest,
  getStock52Week,
  getTickerDetails,
  getPreviousClose,
  // News
  getStockNews,
  getMarketNews,
  getGlobalNews,
  // Market-wide
  getTopMovers,
  getIPOs,
  getFedLaborMarket,
  getFedInflationExpectations,
  // Dashboard & watchlist
  getMarketOverview,
  getWatchlistQuotes,
  // Options & forex extras
  getOptionsFiltered,
  getForexAggregates,
  getCurrencyConversion,
};
