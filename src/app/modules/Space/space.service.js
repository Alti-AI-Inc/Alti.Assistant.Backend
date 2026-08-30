import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import paginationHelpers from '../../helpers/paginationHelpers.js';
import pick from '../../middlewares/other/pick.js';
import { ExaContent } from '../ExaContents/contents.model.js';
import { Monitor } from '../ExaMonitor/Monitor.model.js';
import { MonitorRun } from '../ExaMonitor/monitorRun.model.js';
import { ExaSearch } from '../ExaSearch/exaSearch.model.js';
import { Space } from './space.model.js';

const assertSpaceAccess = async (spaceId, userId, minRole = 'viewer') => {
  const space = await Space.findById(spaceId);
  if (!space) throw new ApiError(httpStatus.NOT_FOUND, 'Space not found');
  if (space.owner.toString() === userId.toString()) return space;

  const member = space.members.find(
    (item) => item.user.toString() === userId.toString()
  );
  if (!member)
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You do not have access to this space'
    );
  if (minRole === 'owner') {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only the owner can perform this action'
    );
  }
  if (minRole === 'editor' && member.role !== 'editor') {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Editor access required for this action'
    );
  }
  return space;
};

const createSpace = async (payload, userId) => {
  if (!userId)
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Authenticated user ID is required to create a space'
    );
  return Space.create({ ...payload, owner: userId });
};

const getAllSpaces = async (userId, query) => {
  const filters = pick(query, ['status', 'isPrivate', 'searchTerm']);
  const options = pick(query, ['page', 'limit', 'sortBy', 'sortOrder']);
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;
  const conditions = [{ $or: [{ owner: userId }, { 'members.user': userId }] }];
  if (searchTerm)
    conditions.push({
      $or: ['name', 'description'].map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      })),
    });
  if (Object.keys(filterData).length)
    conditions.push(
      ...Object.entries(filterData).map(([key, value]) => ({ [key]: value }))
    );
  const where = conditions.length > 1 ? { $and: conditions } : conditions[0];
  const [data, total] = await Promise.all([
    Space.find(where)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit),
    Space.countDocuments(where),
  ]);
  return { meta: { page, limit, total }, data };
};

const getSingleSpace = async (spaceId, userId) => {
  const space = await assertSpaceAccess(spaceId, userId);
  await space.populate([
    { path: 'searches', options: { sort: { createdAt: -1 } } },
    { path: 'monitors', options: { sort: { createdAt: -1 } } },
  ]);
  return space;
};

const updateSpace = async (spaceId, userId, payload) => {
  await assertSpaceAccess(spaceId, userId, 'editor');
  return Space.findByIdAndUpdate(spaceId, payload, {
    new: true,
    runValidators: true,
  });
};

const addMember = async (spaceId, userId, payload) => {
  const space = await assertSpaceAccess(spaceId, userId, 'owner');
  if (
    space.members.some(
      (member) => member.user.toString() === payload.user.toString()
    )
  )
    throw new ApiError(
      httpStatus.CONFLICT,
      'User is already a member of this space'
    );
  space.members.push(payload);
  await space.save();
  return space;
};

const removeMember = async (spaceId, userId, memberUserId) => {
  const space = await assertSpaceAccess(spaceId, userId, 'owner');
  space.members = space.members.filter(
    (member) => member.user.toString() !== memberUserId.toString()
  );
  await space.save();
  return space;
};

const deleteSpace = async (spaceId, userId) => {
  const space = await assertSpaceAccess(spaceId, userId, 'owner');
  await Promise.all([
    ExaSearch.deleteMany({ space: spaceId }),
    ExaContent.deleteMany({ space: spaceId }),
    MonitorRun.deleteMany({ space: spaceId }),
    Monitor.deleteMany({ space: spaceId }),
  ]);
  await space.deleteOne();
  return space;
};

export const SpaceService = {
  assertSpaceAccess,
  createSpace,
  getAllSpaces,
  getSingleSpace,
  updateSpace,
  addMember,
  removeMember,
  deleteSpace,
};
