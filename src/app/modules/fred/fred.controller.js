import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import fredService from './fred.service.js';

const createHandler = (serviceFn, successMessage) => catchAsync(async (req, res) => {
  const result = await serviceFn(req.body.series_id || req.body.search_text, req.body.options || {});
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: successMessage,
    data: result,
  });
});

export default {
  getSeriesObservations: createHandler(fredService.getSeriesObservations, 'Series observations retrieved successfully'),
  searchSeries: createHandler(fredService.searchSeries, 'Series search retrieved successfully'),
  getSeriesInfo: createHandler(fredService.getSeriesInfo, 'Series info retrieved successfully'),
};
