import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import censusService from './census.service.js';

export const getPopulationData = catchAsync(async (req, res) => {
  const result = await censusService.getPopulationData(req.body.year || '2021', req.body.state, req.body.county);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Population data retrieved successfully', data: result });
});

export const getEconomicData = catchAsync(async (req, res) => {
  const result = await censusService.getEconomicData(req.body.year || '2021', req.body.state);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Economic data retrieved successfully', data: result });
});

export default { getPopulationData, getEconomicData };
