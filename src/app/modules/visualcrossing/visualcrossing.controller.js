import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { VisualCrossingService } from './visualcrossing.service.js';

const getForecast = catchAsync(async (req, res) => {
  const result = await VisualCrossingService.getForecast(req.params.location, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Forecast', data: result });
});

const getTimeline = catchAsync(async (req, res) => {
  const { location, date1, date2 } = req.params;
  const result = await VisualCrossingService.getTimeline(location, date1, date2, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Timeline', data: result });
});

const getCurrentConditions = catchAsync(async (req, res) => {
  const result = await VisualCrossingService.getCurrentConditions(req.params.location, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Current conditions', data: result });
});

const getAlerts = catchAsync(async (req, res) => {
  const result = await VisualCrossingService.getAlerts(req.params.location, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Weather alerts', data: result });
});

const getHourly = catchAsync(async (req, res) => {
  const { location, date1, date2 } = req.params;
  const result = await VisualCrossingService.getHourly(location, date1, date2, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Hourly weather', data: result });
});

const getHistoricalDay = catchAsync(async (req, res) => {
  const result = await VisualCrossingService.getHistoricalDay(req.params.location, req.params.date, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Historical day', data: result });
});

const getDynamic = catchAsync(async (req, res) => {
  const result = await VisualCrossingService.getDynamic(req.params.location, req.params.dynamic, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Weather: ${req.params.dynamic}`, data: result });
});

const getEvents = catchAsync(async (req, res) => {
  const result = await VisualCrossingService.getEvents(req.params.location, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Weather events', data: result });
});

const getElements = catchAsync(async (req, res) => {
  const elements = req.query.elements ? req.query.elements.split(',') : ['temp', 'humidity', 'windspeed'];
  const result = await VisualCrossingService.getElements(req.params.location, elements, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Weather elements', data: result });
});

const getMapTileUrl = catchAsync(async (req, res) => {
  const { layer, z, x, y } = req.params;
  const url = VisualCrossingService.getMapTileUrl(layer, z, x, y);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Map tile URL', data: { url } });
});

const rawProxy = catchAsync(async (req, res) => {
  const path = '/' + req.params[0];
  const result = await VisualCrossingService.rawGet(path, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Proxy: ${path}`, data: result });
});

export const VisualCrossingController = {
  getForecast, getTimeline, getCurrentConditions, getAlerts,
  getHourly, getHistoricalDay, getDynamic, getEvents, getElements,
  getMapTileUrl, rawProxy,
};

export default VisualCrossingController;
