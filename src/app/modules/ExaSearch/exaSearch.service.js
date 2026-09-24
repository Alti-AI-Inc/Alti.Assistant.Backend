import httpStatus from 'http-status';
import * as cheerio from 'cheerio';
import ApiError from '../../../errors/ApiError.js';
import { Space } from '../Space/space.model.js';
import { SpaceService } from '../Space/space.service.js';
import { EXA_SEARCH_TYPE } from './exaSearch.contant.js';
import { ExaSearch } from './exaSearch.model.js';
import { SearchSession } from './searchSession.model.js';
import { llmChat } from '../../services/llm.client.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';


const fetchAndExtractHtml = async (url) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(url, { 
      signal: controller.signal, 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const html = await response.text();
    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, aside, iframe, noscript').remove();
    let text = $('body').text().replace(/\s+/g, ' ').trim();
    return text.slice(0, 4000);
  } catch (err) {
    return null;
  }
};

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
    contents: payload.contents || {
      text: { maxCharacters: 1500 },
      highlights: { numSentences: 3, highlightsPerUrl: 3 },
      summary: true,
    },
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

  // --- AGENTIC QUERY EXPANSION ---
  let queriesToRun = [query];
  if (query.split(' ').length > 4) {
    try {
      const expansionRes = await llmChat([
        { role: 'system', content: 'You are a search query optimizer. Given a complex user query, output exactly 2 distinct, highly optimized search queries (e.g. focusing on different entities or perspectives) separated by a newline. Do not use quotes or numbers. Output NOTHING else.' },
        { role: 'user', content: query }
      ], { model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', temperature: 0.1 });
      const subQueries = expansionRes?.choices?.[0]?.message?.content?.split('\n').map(q => q.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 2);
      if (subQueries && subQueries.length > 0) {
        queriesToRun.push(...subQueries);
      }
    } catch(e) {
      logger.warn(`[ExaSearch] Query expansion failed: ${e.message}`);
    }
  }

  let mergedResults = [];
  const seenUrls = new Set();
  let parsed = { results: [], status: 'completed' };
  let firstResponseInfo = {};

  const allSearches = await Promise.all(queriesToRun.map(async (q) => {
    const exaPayload = buildExaRequestBody({
      ...payload,
      query: q,
      searchType,
    });

    try {
      const response = await fetch(`${EXA_BASE_URL}/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getExaApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exaPayload),
      });
      const body = await response.json();
      if (response.ok) {
        const p = parseExaResponse(body);
        return { success: true, results: p.results, info: { resolvedSearchType: p.resolvedSearchType, requestId: p.requestId, costDollars: p.costDollars } };
      } else {
        return { success: false, message: body?.message || 'Failed' };
      }
    } catch(e) {
      return { success: false, message: e.message };
    }
  }));

  let hasSuccess = false;
  let firstError = '';
  let totalCost = 0;

  for (const res of allSearches) {
    if (res.success) {
      hasSuccess = true;
      if (!firstResponseInfo.requestId) firstResponseInfo = res.info;
      if (res.info.costDollars) totalCost += res.info.costDollars;
      
      for (const r of res.results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          mergedResults.push(r);
        }
      }
    } else {
      firstError = res.message;
    }
  }

  if (!hasSuccess) {
    const errorMessage = firstError || 'Exa search failed.';
    const record = await ExaSearch.create({
      space: spaceId,
      user: userId,
      searchSession: searchSession._id,
      query,
      searchType,
      requestParams: buildExaRequestBody({ ...payload, query, searchType }),
      status: 'failed',
      errorMessage,
      results: [],
      resultCount: 0,
    });
    await attachSearchToSession(spaceId, searchSession._id, record._id);
    return record;
  }

  parsed.results = mergedResults.slice(0, 10);
  parsed.resolvedSearchType = firstResponseInfo.resolvedSearchType || searchType;
  parsed.requestId = firstResponseInfo.requestId;
  parsed.costDollars = totalCost;
  // --- END AGENTIC QUERY EXPANSION ---


  // Deep Content Extraction for top 3 results
  const topResults = parsed.results.slice(0, 3);
  await Promise.all(topResults.map(async (r) => {
    const extractedText = await fetchAndExtractHtml(r.url);
    if (extractedText && extractedText.length > 300) {
      r.extractedContent = extractedText;
    }
  }));

  // Synthesize authoritative grounded answer with inline citations
  let answer = '';
  let followUps = [];
  try {
    const formattedSources = parsed.results.slice(0, 6).map((r, i) => {
      const highlights = Array.isArray(r.highlights) && r.highlights.length ? `\nHighlights: ${r.highlights.join(' ')}` : '';
      const textExcerpt = r.extractedContent ? `\nExtracted Full Text: ${r.extractedContent.slice(0, 2000)}` : (r.text ? `\nExcerpt: ${r.text.slice(0, 600)}` : (r.summary ? `\nSummary: ${r.summary}` : ''));
      return `[${i + 1}] Title: ${r.title}\nURL: ${r.url}\nPublished: ${r.publishedDate || 'Recent'}${highlights}${textExcerpt}`;
    }).join('\n\n');

    const promptMessages = [
      {
        role: 'system',
        content: `You are the Aphura Search Intelligence Engine. You MUST output your response as a pure JSON object. Do not wrap in markdown blocks.
Synthesize a comprehensive, authoritative, direct answer to the user query using ONLY the provided verified web sources.

JSON SCHEMA:
{
  "answer_segments": [
    {
      "text": "Direct factual sentence or markdown block.",
      "citations": [1] // Array of integer source IDs matching the exact source index
    }
  ],
  "follow_ups": ["Question 1?", "Question 2?", "Question 3?"] // Exactly 3 relevant follow-ups
}

STRICT GROUNDING RULES:
1. If the provided sources do NOT contain enough information, return exactly ONE segment: { "text": "Insufficient data in verified sources to answer.", "citations": [] }.
2. You MUST provide accurate integer citations for EVERY segment. Do not hallucinate citations.

ANTI-FLUFF RULES:
1. Lead with the direct answer in the very first segment.
2. ZERO preamble or meta-filler. ZERO concluding summaries.
3. Use markdown formatting (bullet points, structured sections) within the "text" fields where applicable for density.`
      },
      {
        role: 'user',
        content: `User Query: ${query}\n\nUser Context:\nTimezone: ${payload.timezone || 'UTC'}\nDate/Time: ${payload.localDate || ''} ${payload.localTime || ''}\n\nVERIFIED WEB SOURCES:\n${formattedSources}`
      }
    ];

    const synthesisRes = await llmChat(promptMessages, {
      model: config.llm?.model || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    let rawContent = synthesisRes?.choices?.[0]?.message?.content || '{}';
    
    // Strip markdown code blocks if the model accidentally included them
    if (rawContent.startsWith('```json')) {
      rawContent = rawContent.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (rawContent.startsWith('```')) {
      rawContent = rawContent.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const parsedJson = JSON.parse(rawContent);
    
    if (parsedJson.answer_segments && Array.isArray(parsedJson.answer_segments)) {
      answer = parsedJson.answer_segments.map(seg => {
        let text = seg.text;
        if (seg.citations && Array.isArray(seg.citations) && seg.citations.length > 0) {
          const validCitations = seg.citations.filter(c => Number.isInteger(c) && c > 0 && c <= parsed.results.length);
          if (validCitations.length > 0) {
            text += ` ${validCitations.map(c => `[${c}]`).join(' ')}`;
          }
        }
        return text;
      }).join(' ');
    } else {
      answer = "Insufficient data in verified sources to answer.";
    }

    if (parsedJson.follow_ups && Array.isArray(parsedJson.follow_ups)) {
      followUps = parsedJson.follow_ups.slice(0, 3);
    }
  } catch (synthErr) {
    logger.warn(`[ExaSearch] Synthesis error: ${synthErr.message}`);
  }

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
    answer,
    followUps,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    isFavorite: Boolean(payload.isFavorite),
  });

  await Promise.all([
    attachSearchToSession(spaceId, searchSession._id, saved._id),
    Space.findByIdAndUpdate(spaceId, { $inc: { searchCount: 1 } }),
  ]);

  const recordObj = saved.toObject ? saved.toObject() : saved;
  return {
    ...recordObj,
    answer,
    followUps,
    responseMessage: {
      answer,
      followUps,
      reference: parsed.results,
    },
  };
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

const findSimilar = async (url, options = {}) => {
  const request = { url, ...options };
  const response = await fetch(`${EXA_BASE_URL}/findSimilar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getExaApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(httpStatus.BAD_REQUEST, data?.message || 'Exa findSimilar failed');
  return data;
};

const contextSearch = async (query, options = {}) => {
  const request = { query, ...options };
  const response = await fetch(`${EXA_BASE_URL}/context`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getExaApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(httpStatus.BAD_REQUEST, data?.message || 'Exa context search failed');
  return data;
};

// ─── Exa Result Cache (LRU, 5-min TTL) ─────────────────────────────────
const _exaCache = new Map();
const EXA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const EXA_CACHE_MAX = 200;

function _getCached(key) {
  const entry = _exaCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > EXA_CACHE_TTL_MS) { _exaCache.delete(key); return null; }
  return entry.data;
}
function _setCache(key, data) {
  if (_exaCache.size >= EXA_CACHE_MAX) {
    const oldest = _exaCache.keys().next().value;
    _exaCache.delete(oldest);
  }
  _exaCache.set(key, { data, ts: Date.now() });
}

const searchDirectly = async (query, options = {}) => {
  const cacheKey = JSON.stringify({ q: query.toLowerCase().trim(), n: options.numResults || 5 });
  const cached = _getCached(cacheKey);
  if (cached) {
    logger.info(`[Exa] Cache HIT for: "${query.slice(0, 60)}"`);
    return cached;
  }

  const request = buildExaRequestBody({ query, ...options });
  const response = await fetch(`${EXA_BASE_URL}/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getExaApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(httpStatus.BAD_REQUEST, data?.message || 'Exa search failed');

  _setCache(cacheKey, data);
  return data;
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
  findSimilar,
  contextSearch,
  searchDirectly,
};

export default ExaSearchService;
