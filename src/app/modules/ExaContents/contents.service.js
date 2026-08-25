import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import paginationHelpers from '../../helpers/paginationHelpers.js';
import pick from '../../middlewares/other/pick.js';
import { SpaceService } from '../ExaSearch/exaSearch.space.service.js';
import { ExaSearch } from '../ExaSearch/search.model.js';
import {
  CONTENT_FILTERABLE_FIELDS,
  CONTENT_PAGINATION_FIELDS,
  CONTENT_SEARCHABLE_FIELDS,
} from './contents.constant.js';
import { ExaContent } from './contents.model.js';

const EXA_BASE_URL = 'https://api.exa.ai';

const getExaApiKey = () => {
  const key = process.env.EXA_API_KEY || process.env.EXA_KEY;

  if (!key) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'EXA_API_KEY is not configured. Set EXA_API_KEY before using Exa contents.'
    );
  }

  return key;
};

const buildExaContentsRequestBody = (payload = {}) => {
  const request = {
    ids: payload.ids,
    text: payload.text,
    highlights: payload.highlights,
    summary: payload.summary,
    livecrawl: payload.livecrawl,
    livecrawlTimeout: payload.livecrawlTimeout,
    subpages: payload.subpages,
    subpageTarget: payload.subpageTarget,
    context: payload.context,
  };

  Object.keys(request).forEach((key) => {
    if (request[key] === undefined) {
      delete request[key];
    }
  });

  return request;
};

const normalizeContentResult = (result = {}) => ({
  id: result.id,
  url: result.url,
  title: result.title || undefined,
  author: result.author || undefined,
  publishedDate: result.publishedDate || undefined,
  text: result.text || undefined,
  highlights: Array.isArray(result.highlights) ? result.highlights : undefined,
  highlightScores: Array.isArray(result.highlightScores)
    ? result.highlightScores
    : undefined,
  summary: typeof result.summary === 'string' ? result.summary : undefined,
  structuredSummary:
    result.summary && typeof result.summary === 'object'
      ? result.summary
      : undefined,
  image: result.image || undefined,
  favicon: result.favicon || undefined,
});

const normalizeStatusItem = (item = {}) => ({
  id: item.id,
  status: item.status,
  errorTag: item.error?.tag || item.errorTag || undefined,
  httpStatusCode:
    item.error?.httpStatusCode || item.httpStatusCode || undefined,
});

/**
 * If a sourceSearch is supplied, it must belong to the same space —
 * otherwise a caller could link content into a space it doesn't
 * otherwise have visibility into via a search record from elsewhere.
 */
const assertSourceSearchInSpace = async (spaceId, sourceSearchId) => {
  if (!sourceSearchId) return;

  const search = await ExaSearch.findOne({
    _id: sourceSearchId,
    space: spaceId,
  });
  if (!search) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'sourceSearch must reference a search record within this same space'
    );
  }
};

/**
 * Calls Exa's POST /contents with the caller-supplied ids/options, then
 * persists the response (or the failure) as a new ExaContent record
 * isolated to this space — this is the real Exa API integration point.
 */
const createContentRecord = async (spaceId, userId, payload = {}) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');
  await assertSourceSearchInSpace(spaceId, payload.sourceSearch);

  const requestOptions = buildExaContentsRequestBody(payload);

  let response;
  try {
    response = await fetch(`${EXA_BASE_URL}/contents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getExaApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestOptions),
    });
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      `Exa contents request failed: ${error.message}`
    );
  }

  let responseBody;
  try {
    responseBody = await response.json();
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      'Exa returned an invalid JSON response.'
    );
  }

  if (!response.ok) {
    const errorMessage =
      responseBody?.message || 'Exa contents request failed.';
    return ExaContent.create({
      space: spaceId,
      user: userId,
      sourceSearch: payload.sourceSearch,
      requestIds: payload.ids,
      requestOptions,
      results: [],
      statuses: [],
      status: 'failed',
      errorMessage,
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      isFavorite: Boolean(payload.isFavorite),
    });
  }

  const results = Array.isArray(responseBody.results)
    ? responseBody.results.map(normalizeContentResult)
    : [];
  const statuses = Array.isArray(responseBody.statuses)
    ? responseBody.statuses.map(normalizeStatusItem)
    : [];

  return ExaContent.create({
    space: spaceId,
    user: userId,
    sourceSearch: payload.sourceSearch,
    requestIds: payload.ids,
    requestOptions,
    results,
    statuses,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    isFavorite: Boolean(payload.isFavorite),
  });
};

const getAllContentRecords = async (spaceId, userId, query) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'viewer');

  const filters = pick(query, CONTENT_FILTERABLE_FIELDS);
  const paginationOptions = pick(query, CONTENT_PAGINATION_FIELDS);
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  const { searchTerm, tags, ...filtersData } = filters;
  const andConditions = [{ space: spaceId }];

  if (searchTerm) {
    andConditions.push({
      $or: CONTENT_SEARCHABLE_FIELDS.map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      })),
    });
  }

  if (tags) {
    const tagList = Array.isArray(tags) ? tags : [tags];
    andConditions.push({ tags: { $in: tagList } });
  }

  if (Object.keys(filtersData).length) {
    Object.entries(filtersData).forEach(([key, value]) => {
      andConditions.push({ [key]: value });
    });
  }

  const whereConditions = { $and: andConditions };

  const [result, total] = await Promise.all([
    ExaContent.find(whereConditions)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit),
    ExaContent.countDocuments(whereConditions),
  ]);

  return {
    meta: { page, limit, total },
    data: result,
  };
};

const getSingleContentRecord = async (spaceId, contentId, userId) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'viewer');

  const record = await ExaContent.findOne({ _id: contentId, space: spaceId });
  if (!record) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Content record not found in this space'
    );
  }
  return record;
};

const updateContentRecord = async (
  spaceId,
  contentId,
  userId,
  payload = {}
) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');

  if (payload.sourceSearch) {
    await assertSourceSearchInSpace(spaceId, payload.sourceSearch);
  }

  const allowedFields = ['isFavorite', 'tags', 'sourceSearch'];
  const update = {};
  Object.keys(payload).forEach((key) => {
    if (allowedFields.includes(key)) {
      update[key] = payload[key];
    }
  });

  if (Object.keys(update).length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'No valid fields supplied for update.'
    );
  }

  const record = await ExaContent.findOneAndUpdate(
    { _id: contentId, space: spaceId },
    { $set: update },
    { new: true, runValidators: true }
  );

  if (!record) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Content record not found in this space'
    );
  }
  return record;
};

const deleteContentRecord = async (spaceId, contentId, userId) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');

  const record = await ExaContent.findOneAndDelete({
    _id: contentId,
    space: spaceId,
  });
  if (!record) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Content record not found in this space'
    );
  }
  return record;
};

export const ContentService = {
  createContentRecord,
  getAllContentRecords,
  getSingleContentRecord,
  updateContentRecord,
  deleteContentRecord,
};
