import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { MonitorService } from './monitor.service.js';

const getAuthenticatedUserId = (req) =>
  req.user?.id || req.user?._id || req.user?.userId;

const createMonitorRecord = catchAsync(async (req, res) => {
  const result = await MonitorService.createMonitorRecord(
    req.params.spaceId,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Monitor stored successfully',
    data: result,
  });
});

const getAllMonitorRecords = catchAsync(async (req, res) => {
  const result = await MonitorService.getAllMonitorRecords(
    req.params.spaceId,
    getAuthenticatedUserId(req),
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Monitors retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getSingleMonitorRecord = catchAsync(async (req, res) => {
  const result = await MonitorService.getSingleMonitorRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Monitor retrieved successfully',
    data: result,
  });
});

const updateMonitorRecord = catchAsync(async (req, res) => {
  const result = await MonitorService.updateMonitorRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Monitor updated successfully',
    data: result,
  });
});

const deleteMonitorRecord = catchAsync(async (req, res) => {
  const result = await MonitorService.deleteMonitorRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Monitor deleted successfully',
    data: result,
  });
});

export const MonitorController = {
  createMonitorRecord,
  getAllMonitorRecords,
  getSingleMonitorRecord,
  updateMonitorRecord,
  deleteMonitorRecord,
};
