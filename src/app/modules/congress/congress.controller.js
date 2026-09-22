import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import congressService from './congress.service.js';

export const getBill = catchAsync(async (req, res) => {
  const result = await congressService.getBill(req.body.congress, req.body.billType, req.body.billNumber);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Bill retrieved successfully', data: result });
});

export const getRecentBills = catchAsync(async (req, res) => {
  const result = await congressService.getRecentBills(req.body.options || {});
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Recent bills retrieved successfully', data: result });
});

export const getMembers = catchAsync(async (req, res) => {
  const result = await congressService.getMembers(req.body.options || {});
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Members retrieved successfully', data: result });
});

export default { getBill, getRecentBills, getMembers };
