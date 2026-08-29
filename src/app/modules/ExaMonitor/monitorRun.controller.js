import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { MonitorRunService } from './monitorRun.service.js';

const getAuthenticatedUserId = (req) =>
  req.user?.id || req.user?._id || req.user?.userId;

const createMonitorRunRecord = catchAsync(async (req, res) => {
  const result = await MonitorRunService.createMonitorRunRecord(
    req.params.spaceId,
    req.params.monitorId,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Run stored successfully',
    data: result,
  });
});

const getAllMonitorRunRecords = catchAsync(async (req, res) => {
  const result = await MonitorRunService.getAllMonitorRunRecords(
    req.params.spaceId,
    req.params.monitorId,
    getAuthenticatedUserId(req),
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Runs retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getSingleMonitorRunRecord = catchAsync(async (req, res) => {
  const result = await MonitorRunService.getSingleMonitorRunRecord(
    req.params.spaceId,
    req.params.monitorId,
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Run retrieved successfully',
    data: result,
  });
});

const updateMonitorRunRecord = catchAsync(async (req, res) => {
  const result = await MonitorRunService.updateMonitorRunRecord(
    req.params.spaceId,
    req.params.monitorId,
    req.params.id,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Run updated successfully',
    data: result,
  });
});

const deleteMonitorRunRecord = catchAsync(async (req, res) => {
  const result = await MonitorRunService.deleteMonitorRunRecord(
    req.params.spaceId,
    req.params.monitorId,
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Run deleted successfully',
    data: result,
  });
});

export const MonitorRunController = {
  createMonitorRunRecord,
  getAllMonitorRunRecords,
  getSingleMonitorRunRecord,
  updateMonitorRunRecord,
  deleteMonitorRunRecord,
};
