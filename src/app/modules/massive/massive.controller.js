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

export const MassiveController = {
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
};
