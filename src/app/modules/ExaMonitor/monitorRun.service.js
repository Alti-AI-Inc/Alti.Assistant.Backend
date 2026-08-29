import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import paginationHelpers from '../../helpers/paginationHelpers.js';
import pick from '../../middlewares/other/pick.js';
import { Monitor } from './Monitor.model.js';
import { SpaceService } from './space.service.js';
import {
  MONITOR_RUN_FILTERABLE_FIELDS,
  MONITOR_RUN_PAGINATION_FIELDS,
} from './monitorRun.constant.js';
import { MonitorRun } from './monitorRun.model.js';

const assertMonitorInSpace = async (spaceId, monitorId) => {
  const monitor = await Monitor.findOne({ _id: monitorId, space: spaceId });
  if (!monitor) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Monitor not found in this space');
  }
  return monitor;
};

const createMonitorRunRecord = async (spaceId, monitorId, userId, payload) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');
  await assertMonitorInSpace(spaceId, monitorId);

  try {
    const record = await MonitorRun.create({
      ...payload,
      space: spaceId,
      monitor: monitorId,
    });
    return record;
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(
        httpStatus.CONFLICT,
        'A run with this exaRunId is already stored for this monitor'
      );
    }
    throw err;
  }
};

const getAllMonitorRunRecords = async (spaceId, monitorId, userId, query) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'viewer');
  await assertMonitorInSpace(spaceId, monitorId);

  const filters = pick(query, MONITOR_RUN_FILTERABLE_FIELDS);
  const paginationOptions = pick(query, MONITOR_RUN_PAGINATION_FIELDS);
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  const andConditions = [{ space: spaceId, monitor: monitorId }];

  if (Object.keys(filters).length) {
    Object.entries(filters).forEach(([key, value]) => {
      andConditions.push({ [key]: value });
    });
  }

  const whereConditions = { $and: andConditions };

  const [result, total] = await Promise.all([
    MonitorRun.find(whereConditions)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit),
    MonitorRun.countDocuments(whereConditions),
  ]);

  return {
    meta: { page, limit, total },
    data: result,
  };
};

const getSingleMonitorRunRecord = async (spaceId, monitorId, runId, userId) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'viewer');
  await assertMonitorInSpace(spaceId, monitorId);

  const record = await MonitorRun.findOne({
    _id: runId,
    space: spaceId,
    monitor: monitorId,
  });
  if (!record) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Run not found for this monitor');
  }
  return record;
};

const updateMonitorRunRecord = async (
  spaceId,
  monitorId,
  runId,
  userId,
  payload
) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');
  await assertMonitorInSpace(spaceId, monitorId);

  const record = await MonitorRun.findOneAndUpdate(
    { _id: runId, space: spaceId, monitor: monitorId },
    payload,
    { new: true, runValidators: true }
  );

  if (!record) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Run not found for this monitor');
  }
  return record;
};

const deleteMonitorRunRecord = async (spaceId, monitorId, runId, userId) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');
  await assertMonitorInSpace(spaceId, monitorId);

  const record = await MonitorRun.findOneAndDelete({
    _id: runId,
    space: spaceId,
    monitor: monitorId,
  });
  if (!record) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Run not found for this monitor');
  }
  return record;
};

export const MonitorRunService = {
  assertMonitorInSpace,
  createMonitorRunRecord,
  getAllMonitorRunRecords,
  getSingleMonitorRunRecord,
  updateMonitorRunRecord,
  deleteMonitorRunRecord,
};
