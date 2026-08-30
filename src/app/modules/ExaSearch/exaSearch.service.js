import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { Space } from '../Space/space.model.js';
import { SpaceService } from '../Space/space.service.js';
import { EXA_SEARCH_TYPE } from './exaSearch.contant.js';
import { ExaSearch } from './exaSearch.model.js';
import { SearchSession } from './searchSession.model.js';

const EXA_BASE_URL = 'https://api.exa.ai';

const normalizeExaResult = (result = {}) => ({
  exaId: result.id || result.exaId || undefined,
  title: result.title || result.name || undefined,
  url: result.url || result.link || undefined,
  author: result.author || result.authors?.[0] || undefined,
  publishedDate: result.publishedDate || result.date || undefined,
  score: typeof result.score === 'number' ? result.score : undefined,
  text: result.text || result.content || undefined,
  summary: result.summary || result.snippet || undefined,
  highlights: Array.isArray(result.highlights) ? result.highlights : undefined,
  highlightScores: Array.isArray(result.highlightScores)
    ? result.highlightScores
    : undefined,
  image: result.image || result.thumbnail || undefined,
  favicon: result.favicon || result.icon || undefined,
});

const getExaApiKey = () => {
  const key = process.env.EXA_API_KEY || process.env.EXA_KEY;

  if (!key) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'EXA_API_KEY is not configured. Set EXA_API_KEY before using Exa search.'
    );
  }

  return key;
};

const buildExaRequestBody = (payload = {}) => {
  const request = {
    query: payload.query,
    type: payload.searchType || 'auto',
    numResults: payload.numResults || 10,
    useAutoprompt: payload.useAutoprompt ?? false,
    includeDomains: payload.includeDomains || undefined,
    excludeDomains: payload.excludeDomains || undefined,
    startPublishedDate: payload.startPublishedDate || undefined,
    endPublishedDate: payload.endPublishedDate || undefined,
    category: payload.category || undefined,
    contents: payload.contents || { summary: true },
  };

  Object.keys(request).forEach((key) => {
    if (request[key] === undefined) {
      delete request[key];
    }
  });

  return request;
};

const parseExaResponse = (responseBody = {}) => {
  const rawResults = Array.isArray(responseBody.results)
    ? responseBody.results
    : Array.isArray(responseBody.data)
      ? responseBody.data
      : [];

  const results = rawResults
    .map((result) => normalizeExaResult(result))
    .filter((result) => result.url && typeof result.url === 'string');

  return {
    results,
    requestId: responseBody.requestId || responseBody.id || undefined,
    resolvedSearchType:
      responseBody.searchType || responseBody.type || undefined,
    costDollars: responseBody.costDollars ?? responseBody.cost ?? undefined,
    status: responseBody.status || 'completed',
  };
};

const resolveSearchSession = async (spaceId, userId, searchSessionId) => {
  if (!searchSessionId) {
    return SearchSession.create({ space: spaceId, user: userId });
  }

  const searchSession = await SearchSession.findOne({
    _id: searchSessionId,
    space: spaceId,
  });
  if (!searchSession) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Search session not found in this space.'
    );
  }
  return searchSession;
};

const attachSearchToSession = async (spaceId, searchSessionId, searchId) => {
  await Promise.all([
    SearchSession.findByIdAndUpdate(searchSessionId, {
      $addToSet: { searches: searchId },
      $set: { lastSearchAt: new Date() },
    }),
    Space.findByIdAndUpdate(spaceId, {
      $addToSet: { searchSessions: searchSessionId },
    }),
  ]);
};

const runSearch = async (spaceId, userId, payload = {}) => {
  if (!spaceId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Space ID is required.');
  }

  if (!payload || !payload.query || !String(payload.query).trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Search query is required.');
  }

  await SpaceService.assertSpaceAccess(spaceId, userId, 'viewer');
  const searchSession = await resolveSearchSession(
    spaceId,
    userId,
    payload.searchSessionId
  );

  const query = String(payload.query).trim();
  const searchType = EXA_SEARCH_TYPE.includes(payload.searchType)
    ? payload.searchType
    : 'auto';

  const exaPayload = buildExaRequestBody({
    ...payload,
    query,
    searchType,
  });

  let response;
  try {
    response = await fetch(`${EXA_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getExaApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(exaPayload),
    });
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      `Exa search request failed: ${error.message}`
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
    const errorMessage = responseBody?.message || 'Exa search failed.';
    const record = await ExaSearch.create({
      space: spaceId,
      user: userId,
      searchSession: searchSession._id,
      query,
      searchType,
      requestParams: exaPayload,
      status: 'failed',
      errorMessage,
      results: [],
      resultCount: 0,
    });

    await attachSearchToSession(spaceId, searchSession._id, record._id);

    return record;
  }

  const parsed = parseExaResponse(responseBody);
  const saved = await ExaSearch.create({
    space: spaceId,
    user: userId,
    searchSession: searchSession._id,
    query,
    searchType,
    category: payload.category,
    requestParams: exaPayload,
    results: parsed.results,
    resultCount: parsed.results.length,
    autopromptString: payload.autopromptString,
    resolvedSearchType: parsed.resolvedSearchType || searchType,
    requestId: parsed.requestId,
    costDollars: parsed.costDollars,
    status: parsed.status || 'completed',
    errorMessage:
      parsed.status === 'failed'
        ? 'Search completed with failed status.'
        : undefined,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    isFavorite: Boolean(payload.isFavorite),
  });

  await Promise.all([
    attachSearchToSession(spaceId, searchSession._id, saved._id),
    Space.findByIdAndUpdate(spaceId, { $inc: { searchCount: 1 } }),
  ]);

  return saved;
};

const getAllSearchRecords = async (spaceId, userId, query = {}) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'viewer');

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 10);
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [data, total] = await Promise.all([
    SearchSession.find({ space: spaceId })
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'searches', options: { sort: { createdAt: -1 } } })
      .lean(),
    SearchSession.countDocuments({ space: spaceId }),
  ]);

  return {
    meta: {
      page,
      limit,
      total,
    },
    data,
  };
};

const getSingleSearchRecord = async (spaceId, recordId, userId) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'viewer');

  const record = await ExaSearch.findOne({ _id: recordId, space: spaceId });

  if (!record) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Search record not found in this space.'
    );
  }

  return record;
};

const updateSearchRecord = async (spaceId, recordId, userId, payload = {}) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');

  const allowedFields = ['isFavorite', 'tags', 'status', 'errorMessage'];
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

  const record = await ExaSearch.findOneAndUpdate(
    { _id: recordId, space: spaceId },
    { $set: update },
    { new: true, runValidators: true }
  );

  if (!record) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Search record not found in this space.'
    );
  }

  return record;
};

const deleteSearchRecord = async (spaceId, recordId, userId) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'editor');

  const record = await ExaSearch.findOneAndDelete({
    _id: recordId,
    space: spaceId,
  });

  if (!record) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Search record not found in this space.'
    );
  }

  await Space.findByIdAndUpdate(spaceId, {
    $inc: { searchCount: -1 },
  });
  await SearchSession.findByIdAndUpdate(record.searchSession, {
    $pull: { searches: recordId },
  });

  return record;
};

export const ExaSearchService = {
  createSearchRecord: runSearch,
  runSearch,
  getAllSearchRecords,
  getSingleSearchRecord,
  updateSearchRecord,
  deleteSearchRecord,
  normalizeExaResult,
  buildExaRequestBody,
  resolveSearchSession,
};

export default ExaSearchService;
