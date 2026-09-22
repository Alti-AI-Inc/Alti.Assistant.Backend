import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { MassiveService } from './massive.service.js';

const getRealtimeTick = catchAsync(async (req, res) => {
  const { assetClass, ticker } = req.params;
  const result = MassiveService.getRealtimeTick(assetClass, ticker);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result ? 'Realtime tick retrieved' : 'No tick available (ensure subscribed)',
    data: result || {}
  });
});

const subscribeRealtime = catchAsync(async (req, res) => {
  const { assetClass } = req.params;
  const { tickers } = req.body;
  const result = MassiveService.subscribeRealtime(assetClass, tickers);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: result.message, data: result });
});

const getHistoricalAggregates = catchAsync(async (req, res) => {
  const { assetClass, ticker } = req.params;
  const { fromDate, toDate, timespan } = req.query;
  const result = await MassiveService.getHistoricalAggregates(assetClass, ticker, fromDate, toDate, timespan);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Historical aggregates retrieved', data: result });
});

const getTickerDetails = catchAsync(async (req, res) => {
  const { assetClass, ticker } = req.params;
  const result = await MassiveService.getTickerDetails(assetClass, ticker);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Ticker details retrieved', data: result });
});

const getMarketStatus = catchAsync(async (req, res) => {
  const result = await MassiveService.getMarketStatus();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Market status retrieved', data: result });
});

export const MassiveController = {
  getRealtimeTick,
  subscribeRealtime,
  getHistoricalAggregates,
  getTickerDetails,
  getMarketStatus
};

export default MassiveController;
