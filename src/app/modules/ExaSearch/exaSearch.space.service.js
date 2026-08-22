import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import paginationHelpers from '../../helpers/paginationHelpers.js';
import pick from '../../middlewares/other/pick.js';
import { ExaSearch } from './search.model.js';
import { Space } from './space.model.js';

const SPACE_SEARCHABLE_FIELDS = ['name', 'description'];
const SPACE_FILTERABLE_FIELDS = ['status', 'isPrivate', 'searchTerm'];
const SPACE_PAGINATION_FIELDS = ['page', 'limit', 'sortBy', 'sortOrder'];

/**
 * Central access guard. Every space-scoped operation in this module,
 * and every search operation in the search module, must resolve
 * through here so isolation is enforced in exactly one place.
 *
 * @param {string} spaceId
 * @param {string} userId
 * @param {'owner'|'editor'|'viewer'} minRole - minimum role required
 * @returns {Promise<import('mongoose').Document>} the space document
 */
const assertSpaceAccess = async (spaceId, userId, minRole = 'viewer') => {
  const space = await Space.findById(spaceId);

  if (!space) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Space not found');
  }

  if (space.owner.toString() === userId.toString()) {
    return space;
  }

  const member = space.members.find(
    (m) => m.user.toString() === userId.toString()
  );

  if (!member) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You do not have access to this space'
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
  if (!userId) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Authenticated user ID is required to create a space'
    );
  }

  const space = await Space.create({ ...payload, owner: userId });
  return space;
};

const getAllSpaces = async (userId, query) => {
  const filters = pick(query, SPACE_FILTERABLE_FIELDS);
  const paginationOptions = pick(query, SPACE_PAGINATION_FIELDS);
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  const { searchTerm, ...filtersData } = filters;
  const andConditions = [
    { $or: [{ owner: userId }, { 'members.user': userId }] },
  ];

  if (searchTerm) {
    andConditions.push({
      $or: SPACE_SEARCHABLE_FIELDS.map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      })),
    });
  }

  if (Object.keys(filtersData).length) {
    andConditions.push(
      ...Object.entries(filtersData).map(([key, value]) => ({ [key]: value }))
    );
  }

  const whereConditions =
    andConditions.length > 1
      ? { $and: andConditions }
      : { $or: [{ owner: userId }, { 'members.user': userId }] };

  const [result, total] = await Promise.all([
    Space.find(whereConditions)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit),
    Space.countDocuments(whereConditions),
  ]);

  return {
    meta: { page, limit, total },
    data: result,
  };
};

const getSingleSpace = async (spaceId, userId) => {
  return assertSpaceAccess(spaceId, userId, 'viewer');
};

const updateSpace = async (spaceId, userId, payload) => {
  await assertSpaceAccess(spaceId, userId, 'editor');

  const updated = await Space.findByIdAndUpdate(spaceId, payload, {
    new: true,
    runValidators: true,
  });

  return updated;
};

const addMember = async (spaceId, userId, payload) => {
  const space = await Space.findById(spaceId);
  if (!space) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Space not found');
  }
  if (space.owner.toString() !== userId.toString()) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only the owner can manage members'
    );
  }

  const alreadyMember = space.members.some(
    (m) => m.user.toString() === payload.user.toString()
  );
  if (alreadyMember) {
    throw new ApiError(
      httpStatus.CONFLICT,
      'User is already a member of this space'
    );
  }

  space.members.push(payload);
  await space.save();
  return space;
};

const removeMember = async (spaceId, userId, memberUserId) => {
  const space = await Space.findById(spaceId);
  if (!space) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Space not found');
  }
  if (space.owner.toString() !== userId.toString()) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only the owner can manage members'
    );
  }

  space.members = space.members.filter(
    (m) => m.user.toString() !== memberUserId.toString()
  );
  await space.save();
  return space;
};

const deleteSpace = async (spaceId, userId) => {
  const space = await Space.findById(spaceId);

  if (!space) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Space not found');
  }
  if (space.owner.toString() !== userId.toString()) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only the owner can delete this space'
    );
  }

  // Cascade delete keeps ExaSearch documents from becoming orphaned
  // once their owning space is gone.
  await ExaSearch.deleteMany({ space: spaceId });
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
