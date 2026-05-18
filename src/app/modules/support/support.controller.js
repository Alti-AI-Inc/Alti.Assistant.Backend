import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { supportService } from './support.service.js';
import { logger } from '../../../shared/logger.js';

const reqForSupport = catchAsync(async (req, res) => {
  // logger.info(req.body, "blog dataaaa");
  const data = req.body;
  const userId = req.body.id;
  const result = await supportService.reqForSupportService(userId, data);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Support Req Add Successfully',
    data: result,
  });
});

const getAllSupportReq = catchAsync(async (req, res) => {
  const result = await supportService.getAllSupportService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully Get all Support Requests',
    data: result,
  });
});

const getSupportById = catchAsync(async (req, res) => {
  const id = req.params?.id;
  logger.info(id, 'idddddddd');
  const result = await supportService.getSupportServiceById(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Support Reqest by id successfully',
    data: result,
  });
});

const updateSupportReq = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await supportService.updateSupportReqService(id, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Support Request Update Successfully',
    data: result,
  });
});

const deleteSupportReq = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await supportService.deleteSupportReqService(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Support Request Delete Successfully',
    data: result,
  });
});

const bulkDeleteSupportReq = catchAsync(async (req, res) => {
  const ids = req.body?.ids || [];
  logger.info(ids, 'controller idddddddddddd');

  // Validate IDs
  if (!ids.every((id) => mongoose.Types.ObjectId.isValid(id))) {
    throw { message: 'Invalid IDs provided' };
  }

  const result = await supportService.bulkDeleteSupportReqService(ids);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All Support Request Delete Successfully ',
    data: result,
  });
});

export const SupportController = {
  reqForSupport,
  getAllSupportReq,
  getSupportById,
  updateSupportReq,
  deleteSupportReq,
  bulkDeleteSupportReq,
};
