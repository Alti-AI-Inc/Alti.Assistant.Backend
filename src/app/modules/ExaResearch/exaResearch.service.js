import crypto from 'crypto';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { Space } from '../Space/space.model.js';
import { SpaceService } from '../Space/space.service.js';
import { ExaResearch } from './exaResearch.model.js';
import { SearchSession } from './Searchresearch.model.js';
// import { SearchSession } from './searchResearch.model.js';

const EXA_WEBSETS_BASE_URL = 'https://api.exa.ai/websets/v0';

const getExaApiKey = () => {
  const key = process.env.EXA_API_KEY || process.env.EXA_KEY;

  if (!key) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'EXA_API_KEY is not configured. Set EXA_API_KEY before using Exa Websets.'
    );
  }

  return key;
};

/** Shared fetch wrapper for every Websets API call — auth header, JSON parsing, error shape. */
const exaWebsetsRequest = async (method, path, body) => {
  let response;
  try {
    response = await fetch(`${EXA_WEBSETS_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${getExaApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      `Exa Websets request failed: ${error.message}`
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

  return { ok: response.ok, status: response.status, body: responseBody };
};

// ---------------------------------------------------------------------------
// Normalizers: Exa's Webset/WebsetSearch/WebsetItem shapes -> our subdocuments
// ---------------------------------------------------------------------------

const normalizeReferences = (references = []) =>
  references.map((reference) => ({
    title: reference.title,
    snippet: reference.snippet,
    url: reference.url,
  }));

const normalizeEvaluations = (evaluations = []) =>
  evaluations.map((evaluation) => ({
    criterion: evaluation.criterion,
    reasoning: evaluation.reasoning,
    satisfied: evaluation.satisfied,
    references: normalizeReferences(evaluation.references || []),
  }));

const normalizeEnrichmentResults = (enrichments = []) =>
  enrichments.map((enrichment) => ({
    enrichmentId: enrichment.enrichmentId,
    format: enrichment.format,
    result: enrichment.result ?? undefined,
    reasoning: enrichment.reasoning,
    references: normalizeReferences(enrichment.references || []),
  }));

const normalizeItemProperties = (properties = {}) => ({
  type: properties.type,
  url: properties.url,
  description: properties.description,
  content: properties.content,
  company: properties.company,
  person: properties.person,
  article: properties.article,
  researchPaper: properties.researchPaper,
  custom: properties.custom,
});

const normalizeWebsetItem = (item = {}) => ({
  itemId: item.id,
  source: item.source,
  sourceId: item.sourceId,
  properties: normalizeItemProperties(item.properties || {}),
  evaluations: normalizeEvaluations(item.evaluations || []),
  enrichments: normalizeEnrichmentResults(item.enrichments || []),
  exaCreatedAt: item.createdAt,
  exaUpdatedAt: item.updatedAt,
});

const normalizeCriteria = (criteria = []) =>
  criteria.map((criterion) => ({
    description: criterion.description,
    successRate: criterion.successRate,
  }));

const normalizeWebsetSearch = (search = {}) => ({
  searchId: search.id,
  status: search.status,
  query: search.query,
  entity: search.entity,
  criteria: normalizeCriteria(search.criteria || []),
  count: search.count,
  maxPeoplePerCompany: search.maxPeoplePerCompany,
  progress: search.progress
    ? { found: search.progress.found, completion: search.progress.completion }
    : undefined,
  canceledAt: search.canceledAt,
  canceledReason: search.canceledReason,
  exaCreatedAt: search.createdAt,
  exaUpdatedAt: search.updatedAt,
});

const normalizeWebsetEnrichmentConfig = (enrichment = {}) => ({
  enrichmentId: enrichment.id,
  status: enrichment.status,
  title: enrichment.title,
  description: enrichment.description,
  format: enrichment.format,
  options: enrichment.options,
  instructions: enrichment.instructions,
});

/**
 * Request body for POST /websets/v0/websets/. Intentionally minimal —
 * criteria / entity / enrichments are not exposed to callers yet, so Exa
 * auto-detects entity type and criteria from the query.
 */
const buildCreateWebsetRequestBody = ({
  query,
  count,
  externalId,
  metadata,
}) => {
  const request = {
    search: {
      query,
      count: count || 10,
    },
    externalId,
    metadata,
  };

  Object.keys(request).forEach((key) => {
    if (request[key] === undefined) {
      delete request[key];
    }
  });

  return request;
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

const attachSearchToSession = async (spaceId, searchSessionId, researchId) => {
  await Promise.all([
    SearchSession.findByIdAndUpdate(searchSessionId, {
      // FIX: the schema field is `researches`, not `searches`.
      $addToSet: { researches: researchId },
      $set: { lastSearchAt: new Date() },
    }),
    Space.findByIdAndUpdate(spaceId, {
      $addToSet: { searchSessions: searchSessionId },
    }),
  ]);
};

/**
 * Creates a Webset on Exa and returns immediately — Websets are async, so
 * this does not block waiting for results. The record starts at status
 * 'running'; it's brought up to date later via `syncSearchRecord` (manual
 * poll) or the webhook handler (real time).
 */
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
  const count = payload.count ? Number(payload.count) : undefined;

  // Create the DB record first so its own _id can be sent to Exa as
  // `externalId` — this makes retried/duplicate client requests safe
  // (Exa returns 409 on a duplicate externalId) and gives us a stable
  // handle even before the webset exists on Exa's side.
  const record = await ExaResearch.create({
    space: spaceId,
    user: userId,
    searchSession: searchSession._id,
    query,
    count,
    status: 'running',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    isFavorite: Boolean(payload.isFavorite),
  });

  const exaPayload = buildCreateWebsetRequestBody({
    query,
    count,
    externalId: record._id.toString(),
    metadata: payload.metadata,
  });

  const { ok, body: responseBody } = await exaWebsetsRequest(
    'POST',
    '/websets/',
    exaPayload
  );

  let updated;
  if (!ok) {
    const errorMessage = responseBody?.message || 'Exa webset creation failed.';
    updated = await ExaResearch.findByIdAndUpdate(
      record._id,
      { $set: { status: 'failed', errorMessage, requestParams: exaPayload } },
      { new: true }
    );
  } else {
    updated = await ExaResearch.findByIdAndUpdate(
      record._id,
      {
        $set: {
          websetId: responseBody.id,
          externalId: responseBody.externalId,
          status: responseBody.status || 'running',
          searches: (responseBody.searches || []).map(normalizeWebsetSearch),
          enrichments: (responseBody.enrichments || []).map(
            normalizeWebsetEnrichmentConfig
          ),
          requestParams: exaPayload,
        },
      },
      { new: true }
    );
  }

  await Promise.all([
    attachSearchToSession(spaceId, searchSession._id, updated._id),
    Space.findByIdAndUpdate(spaceId, { $inc: { searchCount: 1 } }),
  ]);

  return updated;
};

/**
 * Pulls the current webset state (status, searches, items, enrichments)
 * from Exa and writes it onto the record. Fallback/reconciliation path for
 * when the webhook hasn't fired yet (or isn't configured, e.g. local dev).
 */
const syncSearchRecord = async (spaceId, recordId, userId) => {
  await SpaceService.assertSpaceAccess(spaceId, userId, 'viewer');

  const record = await ExaResearch.findOne({ _id: recordId, space: spaceId });
  if (!record) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Search record not found in this space.'
    );
  }
  if (!record.websetId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This record has no associated webset to sync yet.'
    );
  }

  const { ok, body: responseBody } = await exaWebsetsRequest(
    'GET',
    `/websets/${record.websetId}?expand=items`
  );

  if (!ok) {
    const errorMessage =
      responseBody?.message || 'Failed to sync webset from Exa.';
    return ExaResearch.findByIdAndUpdate(
      recordId,
      { $set: { errorMessage } },
      { new: true }
    );
  }

  return ExaResearch.findByIdAndUpdate(
    recordId,
    {
      $set: {
        status: responseBody.status,
        searches: (responseBody.searches || []).map(normalizeWebsetSearch),
        enrichments: (responseBody.enrichments || []).map(
          normalizeWebsetEnrichmentConfig
        ),
        items: (responseBody.items || []).map(normalizeWebsetItem),
        lastSyncedAt: new Date(),
      },
      $unset: { errorMessage: '' },
    },
    { new: true }
  );
};

/** HMAC SHA256 verification per Exa's `Exa-Signature: t=...,v1=...` header. */
const verifyWebhookSignature = (rawBody, signatureHeader, secret) => {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    String(signatureHeader)
      .split(',')
      .map((part) => part.split('=', 2))
  );
  const { t: timestamp, v1: expectedSignature } = parts;
  if (!timestamp || !expectedSignature) return false;

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false; // length mismatch etc. -> not a match
  }
};

/**
 * Applies one already-verified webhook event to the matching record.
 * `webset.*` events are matched by websetId; search events don't carry a
 * websetId in Exa's schema, so they're matched by the embedded searchId
 * instead; item events do carry websetId.
 */
const applyWebsetWebhookEvent = async (eventType, data = {}) => {
  switch (eventType) {
    case 'webset.created':
    case 'webset.idle':
    case 'webset.paused': {
      await ExaResearch.findOneAndUpdate(
        { websetId: data.id },
        {
          $set: {
            status: data.status,
            searches: (data.searches || []).map(normalizeWebsetSearch),
            enrichments: (data.enrichments || []).map(
              normalizeWebsetEnrichmentConfig
            ),
          },
        }
      );
      break;
    }

    case 'webset.search.created':
    case 'webset.search.updated':
    case 'webset.search.completed':
    case 'webset.search.canceled': {
      const normalizedSearch = normalizeWebsetSearch(data);
      const existing = await ExaResearch.findOne({
        'searches.searchId': data.id,
      });
      if (existing) {
        await ExaResearch.updateOne(
          { _id: existing._id, 'searches.searchId': data.id },
          { $set: { 'searches.$': normalizedSearch } }
        );
      }
      break;
    }

    case 'webset.item.created':
    case 'webset.item.enriched': {
      const normalizedItem = normalizeWebsetItem(data);
      const record = await ExaResearch.findOne({ websetId: data.websetId });
      if (record) {
        const alreadyExists = record.items?.some(
          (item) => item.itemId === data.id
        );
        if (alreadyExists) {
          await ExaResearch.updateOne(
            { _id: record._id, 'items.itemId': data.id },
            { $set: { 'items.$': normalizedItem } }
          );
        } else {
          await ExaResearch.findByIdAndUpdate(record._id, {
            $push: { items: normalizedItem },
          });
        }
      }
      break;
    }

    default:
      // webset.deleted / webset.export.* / import.* / monitor.* — not
      // tracked on this record yet; safe to ignore.
      break;
  }
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
      // FIX: the schema field is `researches`, not `searches`.
      .populate({ path: 'researches', options: { sort: { createdAt: -1 } } })
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

  const record = await ExaResearch.findOne({ _id: recordId, space: spaceId });

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

  const record = await ExaResearch.findOneAndUpdate(
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

  const record = await ExaResearch.findOneAndDelete({
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
    // FIX: the schema field is `researches`, not `searches`.
    $pull: { researches: recordId },
  });

  return record;
};

export const ExaResearchService = {
  createSearchRecord: runSearch,
  runSearch,
  syncSearchRecord,
  applyWebsetWebhookEvent,
  verifyWebhookSignature,
  getAllSearchRecords,
  getSingleSearchRecord,
  updateSearchRecord,
  deleteSearchRecord,
  normalizeWebsetItem,
  normalizeWebsetSearch,
  buildCreateWebsetRequestBody,
  resolveSearchSession,
};

export default ExaResearchService;
