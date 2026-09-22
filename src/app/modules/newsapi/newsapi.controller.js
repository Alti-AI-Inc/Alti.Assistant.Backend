import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { NewsApiService } from './newsapi.service.js';

// ── Articles ──────────────────────────────────────────────────────────

const searchArticles = catchAsync(async (req, res) => {
  const result = await NewsApiService.searchArticles(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Articles search results', data: result });
});

const getArticle = catchAsync(async (req, res) => {
  const { articleUri } = req.params;
  const result = await NewsApiService.getArticle(articleUri, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Article details', data: result });
});

const getArticlesForTopicPage = catchAsync(async (req, res) => {
  const { topicUri } = req.body;
  const result = await NewsApiService.getArticlesForTopicPage(topicUri, req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Topic page articles', data: result });
});

// ── Events ────────────────────────────────────────────────────────────

const searchEvents = catchAsync(async (req, res) => {
  const result = await NewsApiService.searchEvents(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Events search results', data: result });
});

const getEvent = catchAsync(async (req, res) => {
  const { eventUri } = req.params;
  const result = await NewsApiService.getEvent(eventUri, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Event details', data: result });
});

const getBreakingEvents = catchAsync(async (req, res) => {
  const result = await NewsApiService.getBreakingEvents(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Breaking events', data: result });
});

// ── Text Analytics ────────────────────────────────────────────────────

const annotate = catchAsync(async (req, res) => {
  const { text, lang } = req.body;
  const result = await NewsApiService.annotate(text, lang);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Semantic annotation', data: result });
});

const categorize = catchAsync(async (req, res) => {
  const { text, taxonomy } = req.body;
  const result = await NewsApiService.categorize(text, taxonomy);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Text categorization', data: result });
});

const sentiment = catchAsync(async (req, res) => {
  const { text, lang } = req.body;
  const result = await NewsApiService.sentiment(text, lang);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Sentiment analysis', data: result });
});

const extractArticleInfo = catchAsync(async (req, res) => {
  const { url } = req.body;
  const result = await NewsApiService.extractArticleInfo(url);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Extracted article info', data: result });
});

// ── Autosuggest ───────────────────────────────────────────────────────

const suggestConcepts = catchAsync(async (req, res) => {
  const { prefix } = req.query;
  const result = await NewsApiService.suggestConcepts(prefix, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Concept suggestions', data: result });
});

const suggestCategories = catchAsync(async (req, res) => {
  const { prefix } = req.query;
  const result = await NewsApiService.suggestCategories(prefix, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Category suggestions', data: result });
});

const suggestSources = catchAsync(async (req, res) => {
  const { prefix } = req.query;
  const result = await NewsApiService.suggestSources(prefix, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Source suggestions', data: result });
});

const suggestAuthors = catchAsync(async (req, res) => {
  const { prefix } = req.query;
  const result = await NewsApiService.suggestAuthors(prefix, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Author suggestions', data: result });
});

const suggestLocations = catchAsync(async (req, res) => {
  const { prefix } = req.query;
  const result = await NewsApiService.suggestLocations(prefix, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Location suggestions', data: result });
});

// ── Reference / Utility ───────────────────────────────────────────────

const getConceptInfo = catchAsync(async (req, res) => {
  const { conceptUri } = req.params;
  const result = await NewsApiService.getConceptInfo(conceptUri, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Concept info', data: result });
});

const getSourceInfo = catchAsync(async (req, res) => {
  const { sourceUri } = req.params;
  const result = await NewsApiService.getSourceInfo(sourceUri, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Source info', data: result });
});

const getMinuteStream = catchAsync(async (req, res) => {
  const result = await NewsApiService.getMinuteStreamArticles(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Minute stream', data: result });
});

const getRecentActivity = catchAsync(async (req, res) => {
  const result = await NewsApiService.getRecentActivityArticles(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Recent activity', data: result });
});

const getUsage = catchAsync(async (req, res) => {
  const result = await NewsApiService.getUsage();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'API usage stats', data: result });
});

const getTopCorrelations = catchAsync(async (req, res) => {
  const { conceptUri } = req.query;
  const result = await NewsApiService.getTopCorrelations(conceptUri, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Top correlations', data: result });
});

const getCounts = catchAsync(async (req, res) => {
  const result = await NewsApiService.getCounts(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Article/event counts', data: result });
});

// ── Generic proxy ─────────────────────────────────────────────────────

const rawProxy = catchAsync(async (req, res) => {
  const path = req.params[0];
  let result;
  if (req.method === 'POST') {
    result = await NewsApiService.rawPost(`/${path}`, req.body);
  } else {
    result = await NewsApiService.rawGet(`/${path}`, req.query);
  }
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `NewsAPI proxy: /${path}`, data: result });
});

export const NewsApiController = {
  searchArticles, getArticle, getArticlesForTopicPage,
  searchEvents, getEvent, getBreakingEvents,
  annotate, categorize, sentiment, extractArticleInfo,
  suggestConcepts, suggestCategories, suggestSources, suggestAuthors, suggestLocations,
  getConceptInfo, getSourceInfo,
  getMinuteStream, getRecentActivity, getUsage, getTopCorrelations, getCounts,
  rawProxy,
};

export default NewsApiController;
