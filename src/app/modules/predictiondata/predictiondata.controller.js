import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { PredictionDataService } from './predictiondata.service.js';

// ── Markets ───────────────────────────────────────────────────────────

const getMarkets = catchAsync(async (req, res) => {
  const result = await PredictionDataService.getMarkets(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Markets', data: result });
});

const getMoneylines = catchAsync(async (req, res) => {
  const result = await PredictionDataService.getMoneylines(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Moneylines', data: result });
});

const getSpreads = catchAsync(async (req, res) => {
  const result = await PredictionDataService.getSpreads(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Spreads', data: result });
});

const getTotals = catchAsync(async (req, res) => {
  const result = await PredictionDataService.getTotals(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Totals', data: result });
});

const getProps = catchAsync(async (req, res) => {
  const result = await PredictionDataService.getProps(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Props', data: result });
});

const getFutures = catchAsync(async (req, res) => {
  const result = await PredictionDataService.getFutures(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Futures', data: result });
});

const getLiveMarkets = catchAsync(async (req, res) => {
  const result = await PredictionDataService.getLiveMarkets(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Live markets', data: result });
});

const getPregameMarkets = catchAsync(async (req, res) => {
  const result = await PredictionDataService.getPregameMarkets(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Pre-game markets', data: result });
});

const getAltLineMarkets = catchAsync(async (req, res) => {
  const result = await PredictionDataService.getAltLineMarkets(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Alternate line markets', data: result });
});

// ── Reference Data ────────────────────────────────────────────────────

const getPlayers = catchAsync(async (req, res) => {
  const result = await PredictionDataService.getPlayers(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Players', data: result });
});

const getTeams = catchAsync(async (req, res) => {
  const result = await PredictionDataService.getTeams(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Teams', data: result });
});

const getFixtures = catchAsync(async (req, res) => {
  const result = await PredictionDataService.getFixtures(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Fixtures', data: result });
});

// ── SSE Stream Controls ───────────────────────────────────────────────

const connectStream = catchAsync(async (req, res) => {
  // For SSE pass-through: pipe the SSE stream directly to the client
  const params = req.query;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const streamId = PredictionDataService.connectStream(
    params,
    (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    (error) => {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    }
  );

  // Cleanup on client disconnect
  req.on('close', () => {
    PredictionDataService.disconnectStream(streamId);
  });
});

const listStreams = catchAsync(async (req, res) => {
  const result = PredictionDataService.listActiveStreams();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Active streams', data: result });
});

const disconnectAllStreams = catchAsync(async (req, res) => {
  PredictionDataService.disconnectAllStreams();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'All streams disconnected', data: {} });
});

// ── Market Polling Controls ───────────────────────────────────────────

const startMarketPolling = catchAsync(async (req, res) => {
  const { league } = req.params;
  const intervalMs = parseInt(req.query.interval) || 15000;
  PredictionDataService.startMarketPolling(league, intervalMs);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Polling started: ${league}`, data: { league, intervalMs } });
});

const stopMarketPolling = catchAsync(async (req, res) => {
  const { league } = req.params;
  PredictionDataService.stopMarketPolling(league);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Polling stopped: ${league}`, data: { league } });
});

const getCachedMarkets = catchAsync(async (req, res) => {
  const { league } = req.params;
  const result = PredictionDataService.getCachedMarkets(league);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Cached markets: ${league}`, data: result });
});

const getAllCachedMarkets = catchAsync(async (req, res) => {
  const result = PredictionDataService.getAllCachedMarkets();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'All cached markets', data: result });
});

// ── Raw proxy ─────────────────────────────────────────────────────────

const rawProxy = catchAsync(async (req, res) => {
  const path = '/' + req.params[0];
  const result = await PredictionDataService.rawGet(path, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Proxy: ${path}`, data: result });
});

export const PredictionDataController = {
  getMarkets, getMoneylines, getSpreads, getTotals, getProps, getFutures,
  getLiveMarkets, getPregameMarkets, getAltLineMarkets,
  getPlayers, getTeams, getFixtures,
  connectStream, listStreams, disconnectAllStreams,
  startMarketPolling, stopMarketPolling, getCachedMarkets, getAllCachedMarkets,
  rawProxy,
};

export default PredictionDataController;
