import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import openfdaService from './openfda.service.js';

export const searchDrugs = catchAsync(async (req, res) => {
  const result = await openfdaService.searchDrugs(req.body.search, req.body.options || {});
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Drugs retrieved successfully', data: result });
});

export const searchAdverseEvents = catchAsync(async (req, res) => {
  const result = await openfdaService.searchAdverseEvents(req.body.search, req.body.options || {});
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Adverse events retrieved successfully', data: result });
});

export default { searchDrugs, searchAdverseEvents };
