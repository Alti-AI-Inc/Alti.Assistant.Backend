import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import paginationHelpers from '../../helpers/paginationHelpers.js';
import pick from '../../middlewares/other/pick.js';
import { Space } from '../Space/space.model.js';
import { SpaceService } from '../Space/space.service.js';
import {
  MONITOR_FILTERABLE_FIELDS,
  MONITOR_PAGINATION_FIELDS,
  MONITOR_RUN_FILTERABLE_FIELDS,
  MONITOR_RUN_PAGINATION_FIELDS,
  MONITOR_SEARCHABLE_FIELDS,
} from './monitor.constant.js';
import { Monitor } from './Monitor.model.js';
import { MonitorRun } from './monitorRun.model.js';
import { MonitorSession } from './Monitorsession.model.js';
// import { MonitorSession } from './monitorSession.model.js';

/**
 * Resolves which monitor-session a newly created monitor should join.
 * - monitorSessionId given -> must already belong to this space.
 * - monitorSessionId omitted -> a new session is created and linked
 *   onto the space.
 * Returns the session document.
 */
const resolveMonitorSession = async (spaceId, userId, monitorSessionId) => {
  if (monitorSessionId) {
    const session = await MonitorSession.findOne({
      _id: monitorSessionId,
      space: spaceId,
    });
    if (!session) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Monitor session not found in this space'
      );
    }
    return session;
  }

  const session = await MonitorSession.create({
    space: spaceId,
    user: userId,
  });
  await Space.findByIdAndUpdate(spaceId, {
    $addToSet: { monitorSessions: session._id },
  });
  return session;
};

const createMonitorRecord = async (spaceId, userId, payload) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');

  const { monitorSessionId, ...monitorPayload } = payload;

  let record;
  try {
    record = await Monitor.create({
      ...monitorPayload,
      space: spaceId,
      user: userId,
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(
        httpStatus.CONFLICT,
        'A monitor with this exaMonitorId is already stored'
      );
    }
    throw err;
  }

  try {
    const session = await resolveMonitorSession(
      spaceId,
      userId,
      monitorSessionId
    );
    await MonitorSession.findByIdAndUpdate(session._id, {
      $addToSet: { monitors: record._id },
    });
    // Idempotent — covers the case where the session was passed in
    // explicitly but was somehow not yet linked on the space.
    await Space.findByIdAndUpdate(spaceId, {
      $addToSet: { monitorSessions: session._id },
    });
  } catch (err) {
    // Roll back the orphaned monitor rather than leaving it unlinked
    // from any session.
    await Monitor.findByIdAndDelete(record._id);
    throw err;
  }

  return record;
};

const getAllMonitorRecords = async (spaceId, userId, query) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'viewer');

  const filters = pick(query, MONITOR_FILTERABLE_FIELDS);
  const paginationOptions = pick(query, MONITOR_PAGINATION_FIELDS);
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  const { searchTerm, ...filtersData } = filters;

  // Filters/search describe individual monitors, not sessions — they're
  // applied as the populate `match` below, scoped to each session's
  // `monitors` array.
  const monitorMatch = {};
  if (searchTerm) {
    monitorMatch.$or = MONITOR_SEARCHABLE_FIELDS.map((field) => ({
      [field]: { $regex: searchTerm, $options: 'i' },
    }));
  }
  if (Object.keys(filtersData).length) {
    Object.assign(monitorMatch, filtersData);
  }

  const whereConditions = { space: spaceId };

  // Pagination is applied at the session level — page/limit select
  // which monitor-sessions come back, each fully populated with its
  // (optionally filtered) monitors.
  const [sessions, total] = await Promise.all([
    MonitorSession.find(whereConditions)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'monitors', match: monitorMatch }),
    MonitorSession.countDocuments(whereConditions),
  ]);

  return {
    meta: { page, limit, total },
    data: sessions,
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
  // monitorSessionId is not editable here — moving a monitor between
  // sessions isn't supported by this endpoint.
  const { exaMonitorId, webhookSecret, monitorSessionId, ...safePayload } =
    payload;

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

  // Pull the monitor out of whichever session held it. If that empties
  // the session, delete the session and unlink it from the space too.
  const session = await MonitorSession.findOneAndUpdate(
    { space: spaceId, monitors: monitorId },
    { $pull: { monitors: monitorId } },
    { new: true }
  );

  if (session && session.monitors.length === 0) {
    await MonitorSession.findByIdAndDelete(session._id);
    await Space.findByIdAndUpdate(spaceId, {
      $pull: { monitorSessions: session._id },
    });
  }

  return record;
};

// -----------------------------------------------------------------------
// Monitor Run Service
// -----------------------------------------------------------------------

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

export const MonitorService = {
  createMonitorRecord,
  getAllMonitorRecords,
  getSingleMonitorRecord,
  updateMonitorRecord,
  deleteMonitorRecord,
  assertMonitorInSpace,
  createMonitorRunRecord,
  getAllMonitorRunRecords,
  getSingleMonitorRunRecord,
  updateMonitorRunRecord,
  deleteMonitorRunRecord,
};
