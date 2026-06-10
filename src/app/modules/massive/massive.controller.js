import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { massiveService } from './massive.service.js';

// Helper for date validation (YYYY-MM-DD format)
const isValidDate = (dateString) => /^\d{4}-\d{2}-\d{2}$/.test(dateString) && !isNaN(new Date(dateString));

// Common constants for validation
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100; // A reasonable maximum limit for data fetches
const ALLOWED_TIMESPAN_VALUES = ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];
const ALLOWED_OPTION_TYPES = ['call', 'put'];

const getStockQuote = catchAsync(async (req, res) => {
  const { ticker } = req.params;

  // Input validation: Ensure ticker is a non-empty string
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  const result = await massiveService.getStockQuoteService(ticker.trim().toUpperCase());

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

  // Input validation for ticker
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  // Input validation for multiplier
  const parsedMultiplier = parseInt(multiplier, 10);
  if (isNaN(parsedMultiplier) || parsedMultiplier <= 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Multiplier must be a positive integer',
      data: null,
    });
  }

  // Input validation for timespan
  if (!timespan || typeof timespan !== 'string' || !ALLOWED_TIMESPAN_VALUES.includes(timespan.toLowerCase())) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Timespan must be one of: ${ALLOWED_TIMESPAN_VALUES.join(', ')}`,
      data: null,
    });
  }

  // Input validation for 'from' date
  if (!from || typeof from !== 'string' || !isValidDate(from)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'From date is required and must be in YYYY-MM-DD format',
      data: null,
    });
  }

  // Input validation for 'to' date
  if (!to || typeof to !== 'string' || !isValidDate(to)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'To date is required and must be in YYYY-MM-DD format',
      data: null,
    });
  }

  const result = await massiveService.getStockAggregatesService({
    ticker: ticker.trim().toUpperCase(),
    multiplier: parsedMultiplier,
    timespan: timespan.toLowerCase(),
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

  // Input validation: Ensure ticker is a non-empty string
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  const result = await massiveService.getCryptoQuoteService(ticker.trim().toUpperCase());

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

  // Input validation for ticker
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  // Input validation for multiplier
  const parsedMultiplier = parseInt(multiplier, 10);
  if (isNaN(parsedMultiplier) || parsedMultiplier <= 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Multiplier must be a positive integer',
      data: null,
    });
  }

  // Input validation for timespan
  if (!timespan || typeof timespan !== 'string' || !ALLOWED_TIMESPAN_VALUES.includes(timespan.toLowerCase())) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Timespan must be one of: ${ALLOWED_TIMESPAN_VALUES.join(', ')}`,
      data: null,
    });
  }

  // Input validation for 'from' date
  if (!from || typeof from !== 'string' || !isValidDate(from)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'From date is required and must be in YYYY-MM-DD format',
      data: null,
    });
  }

  // Input validation for 'to' date
  if (!to || typeof to !== 'string' || !isValidDate(to)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'To date is required and must be in YYYY-MM-DD format',
      data: null,
    });
  }

  const result = await massiveService.getCryptoAggregatesService({
    ticker: ticker.trim().toUpperCase(),
    multiplier: parsedMultiplier,
    timespan: timespan.toLowerCase(),
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

  // Input validation: Ensure ticker is a non-empty string (e.g., C:EURUSD)
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string (e.g., C:EURUSD)',
      data: null,
    });
  }

  const result = await massiveService.getForexQuoteService(ticker.trim().toUpperCase());

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Forex quote retrieved successfully',
    data: result,
  });
});

const getOptionsChain = catchAsync(async (req, res) => {
  const { underlyingTicker } = req.params;

  // Input validation: Ensure underlyingTicker is a non-empty string
  if (!underlyingTicker || typeof underlyingTicker !== 'string' || underlyingTicker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Underlying ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  const result = await massiveService.getOptionsChainService(underlyingTicker.trim().toUpperCase());

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Options contract chain retrieved successfully',
    data: result,
  });
});

const getOptionsQuote = catchAsync(async (req, res) => {
  const { contractTicker } = req.params;

  // Input validation: Ensure contractTicker is a non-empty string
  if (!contractTicker || typeof contractTicker !== 'string' || contractTicker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Contract ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  const result = await massiveService.getOptionsQuoteService(contractTicker.trim().toUpperCase());

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

  // Input validation for ticker
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) { // If limit was provided but invalid
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getBenzingaNewsService(ticker.trim().toUpperCase(), effectiveLimit);

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

  // Input validation for ticker
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getBenzingaRatingsService(ticker.trim().toUpperCase(), effectiveLimit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Benzinga Analyst Ratings retrieved successfully',
    data: result,
  });
});

const getEtfProfiles = catchAsync(async (req, res) => {
  const { ticker } = req.params;

  // Input validation: Ensure ticker is a non-empty string
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  const result = await massiveService.getEtfProfilesService(ticker.trim().toUpperCase());

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

  // Input validation for ticker
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getEtfConstituentsService(ticker.trim().toUpperCase(), effectiveLimit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ETF Constituents retrieved successfully',
    data: result,
  });
});

const getFedInflation = catchAsync(async (req, res) => {
  const { limit } = req.query;

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getFedInflationService(effectiveLimit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fed Inflation statistics retrieved successfully',
    data: result,
  });
});

const getFedYields = catchAsync(async (req, res) => {
  const { limit } = req.query;

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getFedYieldsService(effectiveLimit);

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

  // Input validation: Ensure ticker is a non-empty string
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  const result = await massiveService.getStockFinancialsRatiosService(ticker.trim().toUpperCase());
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Stock financials & ratios retrieved', data: result });
});

const getStockIncomeStatement = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;

  // Input validation for ticker
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getStockIncomeStatementService(ticker.trim().toUpperCase(), effectiveLimit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Income statement retrieved', data: result });
});

const getStockBalanceSheet = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;

  // Input validation for ticker
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getStockBalanceSheetsService(ticker.trim().toUpperCase(), effectiveLimit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Balance sheet retrieved', data: result });
});

const getStockDividends = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;

  // Input validation for ticker
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getDividendsService(ticker.trim().toUpperCase(), effectiveLimit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Dividends retrieved', data: result });
});

const getStockSplits = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;

  // Input validation for ticker
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getStockSplitsService(ticker.trim().toUpperCase(), effectiveLimit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Stock splits retrieved', data: result });
});

const getStockFloat = catchAsync(async (req, res) => {
  const { ticker } = req.params;

  // Input validation: Ensure ticker is a non-empty string
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  const result = await massiveService.getStockFloatService(ticker.trim().toUpperCase());
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Stock float retrieved', data: result });
});

const getShortInterest = catchAsync(async (req, res) => {
  const { ticker } = req.params;

  // Input validation: Ensure ticker is a non-empty string
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  const result = await massiveService.getShortInterestDetailService(ticker.trim().toUpperCase());
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Short interest retrieved', data: result });
});

const getStock52Week = catchAsync(async (req, res) => {
  const { ticker } = req.params;

  // Input validation: Ensure ticker is a non-empty string
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  const result = await massiveService.getStock52WeekService(ticker.trim().toUpperCase());
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: '52-week high/low retrieved', data: result });
});

const getTickerDetails = catchAsync(async (req, res) => {
  const { ticker } = req.params;

  // Input validation: Ensure ticker is a non-empty string
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  const result = await massiveService.getTickerDetailsService(ticker.trim().toUpperCase());
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Ticker details retrieved', data: result });
});

// ─── News ─────────────────────────────────────────────────────────────────────

const getStockNews = catchAsync(async (req, res) => {
  const { ticker } = req.params;
  const { limit } = req.query;

  // Input validation for ticker
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getStockNewsService(ticker.trim().toUpperCase(), effectiveLimit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Stock news retrieved', data: result });
});

const getMarketNews = catchAsync(async (req, res) => {
  const { limit } = req.query;

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getMarketNewsService(effectiveLimit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Market news retrieved', data: result });
});

const getGlobalNews = catchAsync(async (req, res) => {
  const { limit } = req.query;

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getMarketNewsGlobalService(effectiveLimit);
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

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getFedLaborMarketService(effectiveLimit);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Fed labor market data retrieved', data: result });
});

const getFedInflationExpectations = catchAsync(async (req, res) => {
  const { limit } = req.query;

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = DEFAULT_LIMIT;
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getFedInflationExpectationsService(effectiveLimit);
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

  // Initial validation: Ensure tickers is a non-empty array
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Request body must include a non-empty "tickers" array',
      data: null,
    });
  }

  // Filter out non-string or empty string tickers, cap at 50, and normalize
  const safeTickers = tickers
    .filter(t => typeof t === 'string' && t.trim() !== '')
    .slice(0, 50)
    .map(t => t.toUpperCase().trim());

  if (safeTickers.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'No valid tickers provided in the request body after filtering',
      data: null,
    });
  }

  // Separate stocks, crypto (X:), and forex (C:) by prefix
  const stockTickers  = safeTickers.filter(t => !t.startsWith('X:') && !t.startsWith('C:'));
  const cryptoTickers = safeTickers.filter(t => t.startsWith('X:'));
  const forexTickers  = safeTickers.filter(t => t.startsWith('C:'));

  const results = await Promise.allSettled([
    stockTickers.length  > 0 ? massiveService.getStocksSnapshotTickersService(stockTickers)  : Promise.resolve(null),
    cryptoTickers.length > 0 ? massiveService.getStocksSnapshotTickersService(cryptoTickers) : Promise.resolve(null),
    // FIX: Handle multiple forex tickers by mapping and calling the service for each, then collecting results
    forexTickers.length  > 0
      ? Promise.allSettled(forexTickers.map(ticker => massiveService.getForexSnapshotService(ticker)))
      : Promise.resolve(null),
  ]);

  // Process forex results: if it was an array of results, flatten it and filter fulfilled ones
  const forexResults = results[2].status === 'fulfilled' && Array.isArray(results[2].value)
    ? results[2].value.filter(r => r.status === 'fulfilled').map(r => r.value)
    : null;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Watchlist quotes fetched for ${safeTickers.length} ticker(s)`,
    data: {
      stocks:    results[0].status === 'fulfilled' ? results[0].value : null,
      crypto:    results[1].status === 'fulfilled' ? results[1].value : null,
      forex:     forexResults, // Use the processed forex results
      tickers:   safeTickers,
      fetchedAt: new Date().toISOString(),
    },
  });
});

// ─── Options Filtered ─────────────────────────────────────────────────────────

const getOptionsFiltered = catchAsync(async (req, res) => {
  const { underlyingTicker } = req.params;
  const { type, expiry, strike_price_gte, strike_price_lte, limit } = req.query;

  // Input validation for underlyingTicker
  if (!underlyingTicker || typeof underlyingTicker !== 'string' || underlyingTicker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Underlying ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  // Input validation for type
  let effectiveType = type ? type.toLowerCase() : undefined;
  if (effectiveType && !ALLOWED_OPTION_TYPES.includes(effectiveType)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Option type must be one of: ${ALLOWED_OPTION_TYPES.join(', ')}`,
      data: null,
    });
  }

  // Input validation for expiry date
  if (expiry && (typeof expiry !== 'string' || !isValidDate(expiry))) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Expiry date must be in YYYY-MM-DD format',
      data: null,
    });
  }

  // Input validation for strike_price_gte
  let parsedStrikeGte = parseFloat(strike_price_gte);
  if (strike_price_gte !== undefined && (isNaN(parsedStrikeGte) || parsedStrikeGte < 0)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Strike price (GTE) must be a non-negative number',
      data: null,
    });
  }
  parsedStrikeGte = strike_price_gte !== undefined ? parsedStrikeGte : undefined;

  // Input validation for strike_price_lte
  let parsedStrikeLte = parseFloat(strike_price_lte);
  if (strike_price_lte !== undefined && (isNaN(parsedStrikeLte) || parsedStrikeLte < 0)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Strike price (LTE) must be a non-negative number',
      data: null,
    });
  }
  parsedStrikeLte = strike_price_lte !== undefined ? parsedStrikeLte : undefined;

  // Input validation for limit
  const parsedLimit = parseInt(limit, 10);
  let effectiveLimit = undefined; // Let service handle default if not provided
  if (!isNaN(parsedLimit) && parsedLimit > 0) {
    effectiveLimit = Math.min(parsedLimit, MAX_LIMIT);
  } else if (limit !== undefined) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Limit must be a positive integer, max ${MAX_LIMIT}`,
      data: null,
    });
  }

  const result = await massiveService.getOptionsChainFilteredService(
    underlyingTicker.trim().toUpperCase(),
    {
      type: effectiveType,
      expiry,
      strike_price_gte: parsedStrikeGte,
      strike_price_lte: parsedStrikeLte,
      limit: effectiveLimit
    }
  );
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Filtered options chain retrieved', data: result });
});

// ─── Forex Aggregates ─────────────────────────────────────────────────────────

const getForexAggregates = catchAsync(async (req, res) => {
  const { pair } = req.params;
  const { multiplier, timespan, from, to } = req.query;

  // Input validation for pair
  if (!pair || typeof pair !== 'string' || pair.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Pair parameter is required and must be a non-empty string (e.g., EURUSD)',
      data: null,
    });
  }

  // Input validation for multiplier
  const parsedMultiplier = parseInt(multiplier, 10);
  if (isNaN(parsedMultiplier) || parsedMultiplier <= 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Multiplier must be a positive integer',
      data: null,
    });
  }

  // Input validation for timespan
  if (!timespan || typeof timespan !== 'string' || !ALLOWED_TIMESPAN_VALUES.includes(timespan.toLowerCase())) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Timespan must be one of: ${ALLOWED_TIMESPAN_VALUES.join(', ')}`,
      data: null,
    });
  }

  // Input validation for 'from' date
  if (!from || typeof from !== 'string' || !isValidDate(from)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'From date is required and must be in YYYY-MM-DD format',
      data: null,
    });
  }

  // Input validation for 'to' date
  if (!to || typeof to !== 'string' || !isValidDate(to)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'To date is required and must be in YYYY-MM-DD format',
      data: null,
    });
  }

  const result = await massiveService.getForexAggregatesService({
    pair: pair.trim().toUpperCase(),
    multiplier: parsedMultiplier,
    timespan: timespan.toLowerCase(),
    from,
    to,
  });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Forex aggregates retrieved', data: result });
});

// ─── Currency Conversion ──────────────────────────────────────────────────────

const getCurrencyConversion = catchAsync(async (req, res) => {
  const { from, to } = req.params;
  const { amount } = req.query;

  // Input validation for 'from' currency
  if (!from || typeof from !== 'string' || from.trim().length !== 3) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'From currency code is required and must be a 3-letter string (e.g., USD)',
      data: null,
    });
  }

  // Input validation for 'to' currency
  if (!to || typeof to !== 'string' || to.trim().length !== 3) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'To currency code is required and must be a 3-letter string (e.g., EUR)',
      data: null,
    });
  }

  let result;
  if (amount !== undefined) {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Amount must be a positive number',
        data: null,
      });
    }
    result = await massiveService.getCurrencyConvertAmountService(from.trim().toUpperCase(), to.trim().toUpperCase(), parsedAmount);
  } else {
    result = await massiveService.getCurrencyConversionService(from.trim().toUpperCase(), to.trim().toUpperCase());
  }
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Currency conversion retrieved', data: result });
});

// ─── Previous Close ───────────────────────────────────────────────────────────

const getPreviousClose = catchAsync(async (req, res) => {
  const { ticker } = req.params;

  // Input validation: Ensure ticker is a non-empty string
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Ticker parameter is required and must be a non-empty string',
      data: null,
    });
  }

  const result = await massiveService.getPreviousCloseService(ticker.trim().toUpperCase());
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