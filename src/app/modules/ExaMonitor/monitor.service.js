import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import paginationHelpers from '../../helpers/paginationHelpers.js';
import pick from '../../middlewares/other/pick.js';
import { MonitorRun } from './monitorRun.model.js';
import { SpaceService } from './space.service.js';
import {
  MONITOR_FILTERABLE_FIELDS,
  MONITOR_PAGINATION_FIELDS,
  MONITOR_SEARCHABLE_FIELDS,
} from './monitor.constant.js';
import { Monitor } from './Monitor.model.js';

const createMonitorRecord = async (spaceId, userId, payload) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');

  try {
    const record = await Monitor.create({
      ...payload,
      space: spaceId,
      user: userId,
    });
    return record;
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(
        httpStatus.CONFLICT,
        'A monitor with this exaMonitorId is already stored'
      );
    }
    throw err;
  }
};

const getAllMonitorRecords = async (spaceId, userId, query) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'viewer');

  const filters = pick(query, MONITOR_FILTERABLE_FIELDS);
  const paginationOptions = pick(query, MONITOR_PAGINATION_FIELDS);
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  const { searchTerm, ...filtersData } = filters;
  const andConditions = [{ space: spaceId }];

  if (searchTerm) {
    andConditions.push({
      $or: MONITOR_SEARCHABLE_FIELDS.map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      })),
    });
  }

  if (Object.keys(filtersData).length) {
    Object.entries(filtersData).forEach(([key, value]) => {
      andConditions.push({ [key]: value });
    });
  }

  const whereConditions = { $and: andConditions };

  const [result, total] = await Promise.all([
    Monitor.find(whereConditions)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit),
    Monitor.countDocuments(whereConditions),
  ]);

  return {
    meta: { page, limit, total },
    data: result,
  };
};

const getSingleMonitorRecord = async (spaceId, monitorId, userId) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'viewer');

  const record = await Monitor.findOne({ _id: monitorId, space: spaceId });
  if (!record) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Monitor not found in this space');
  }
  return record;
};

const updateMonitorRecord = async (spaceId, monitorId, userId, payload) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');

  // exaMonitorId and webhookSecret are immutable after creation —
  // validation already excludes them, this is a defense-in-depth strip.
  const { exaMonitorId, webhookSecret, ...safePayload } = payload;

  const record = await Monitor.findOneAndUpdate(
    { _id: monitorId, space: spaceId },
    safePayload,
    { new: true, runValidators: true }
  );

  if (!record) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Monitor not found in this space');
  }
  return record;
};

const deleteMonitorRecord = async (spaceId, monitorId, userId) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');

  const record = await Monitor.findOneAndDelete({
    _id: monitorId,
    space: spaceId,
  });
  if (!record) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Monitor not found in this space');
  }

  // Cascade: a monitor's run history is meaningless once the monitor
  // itself is gone locally.
  await MonitorRun.deleteMany({ monitor: monitorId });

  return record;
};

export const MonitorService = {
  createMonitorRecord,
  getAllMonitorRecords,
  getSingleMonitorRecord,
  updateMonitorRecord,
  deleteMonitorRecord,
};
