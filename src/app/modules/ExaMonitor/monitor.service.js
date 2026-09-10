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
import { MonitorExa } from './monitor.exa.js'; 


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

// const createMonitorRecord = async (spaceId, userId, payload) => {
//   await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');

//   const { monitorSessionId, ...monitorPayload } = payload;

//   let record;
//   try {
//     record = await Monitor.create({
//       ...monitorPayload,
//       space: spaceId,
//       user: userId,
//     });
//   } catch (err) {
//     if (err?.code === 11000) {
//       throw new ApiError(
//         httpStatus.CONFLICT,
//         'A monitor with this exaMonitorId is already stored'
//       );
//     }
//     throw err;
//   }
//   console.log(record, 'recorddddddd');
//   try {
//     const session = await resolveMonitorSession(
//       spaceId,
//       userId,
//       monitorSessionId
//     );
//     await MonitorSession.findByIdAndUpdate(session._id, {
//       $addToSet: { monitors: record._id },
//     });
//     // Idempotent — covers the case where the session was passed in
//     // explicitly but was somehow not yet linked on the space.
//     await Space.findByIdAndUpdate(spaceId, {
//       $addToSet: { monitorSessions: session._id },
//     });
//   } catch (err) {
//     // Roll back the orphaned monitor rather than leaving it unlinked
//     // from any session.
//     await Monitor.findByIdAndDelete(record._id);
//     throw err;
//   }

//   return record;
// };


/**
 * CHANGED: this used to just save whatever exaMonitorId/webhookSecret
 * the caller sent in the request body — meaning a client could type in
 * fake values and nothing would ever actually run on Exa.
 *
 * Now: this function calls Exa itself first, and only stores the real
 * id/secret Exa hands back. The caller no longer sends exaMonitorId or
 * webhookSecret at all — just name/search/trigger/outputSchema/
 * metadata/webhook/monitorSessionId. Update your Zod validation
 * schema (MonitorValidation.createMonitorZodSchema) to match: drop
 * exaMonitorId and webhookSecret from the expected request body.
 */
const createMonitorRecord = async (spaceId, userId, payload) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');
 
  const { monitorSessionId, ...monitorPayload } = payload;
 
  // 1. Actually create the monitor on Exa's servers first.
  const exaMonitor = await MonitorExa.createExaMonitor({
    name: monitorPayload.name,
    search: monitorPayload.search,
    trigger: monitorPayload.trigger,
    outputSchema: monitorPayload.outputSchema,
    metadata: monitorPayload.metadata,
    webhook: monitorPayload.webhook,
  });
  // exaMonitor.id and exaMonitor.webhookSecret are REAL, from Exa —
  // never invented locally, never taken from client input.
 
  let record;
  try {
    record = await Monitor.create({
      ...monitorPayload,
      exaMonitorId: exaMonitor.id,
      webhookSecret: exaMonitor.webhookSecret,
      nextRunAt: exaMonitor.nextRunAt,
      exaCreatedAt: exaMonitor.createdAt,
      exaUpdatedAt: exaMonitor.updatedAt,
      space: spaceId,
      user: userId,
    });
  } catch (err) {
    // We already created the monitor on Exa's side — if the local save
    // fails, clean up the Exa monitor too, or you'll get an orphaned
    // monitor running on Exa's servers with nowhere local to track it.
    await MonitorExa.deleteExaMonitor(exaMonitor.id).catch(() => {});
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
    // from any session. Also roll back on Exa's side.
    await Monitor.findByIdAndDelete(record._id);
    await MonitorExa.deleteExaMonitor(exaMonitor.id).catch(() => {});
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
/**
 * NEW: starts a run on Exa right now, instead of waiting for the
 * schedule. This is the piece your route/controller never had.
 */
const triggerMonitor = async (spaceId, monitorId, userId) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');
 
  const monitor = await Monitor.findOne({ _id: monitorId, space: spaceId });
  if (!monitor) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Monitor not found in this space');
  }
 
  await MonitorExa.triggerExaMonitor(monitor.exaMonitorId);
  return { triggered: true };
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

// const createMonitorRunRecord = async (spaceId, monitorId, userId, payload) => {
//   await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');
//   await assertMonitorInSpace(spaceId, monitorId);

//   try {
//     const record = await MonitorRun.create({
//       ...payload,
//       space: spaceId,
//       monitor: monitorId,
//     });
//     return record;
//   } catch (err) {
//     if (err?.code === 11000) {
//       throw new ApiError(
//         httpStatus.CONFLICT,
//         'A run with this exaRunId is already stored for this monitor'
//       );
//     }
//     throw err;
//   }
// };

const createMonitorRunRecord = async (spaceId, monitorId, userId, payload) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');
  await assertMonitorInSpace(spaceId, monitorId);

  const record = await MonitorRun.findOneAndUpdate(
    { space: spaceId, monitor: monitorId, exaRunId: payload.exaRunId },
    { $set: payload },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
  return record;
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
  triggerMonitor,
  createMonitorRunRecord,
  getAllMonitorRunRecords,
  getSingleMonitorRunRecord,
  updateMonitorRunRecord,
  deleteMonitorRunRecord,
};
