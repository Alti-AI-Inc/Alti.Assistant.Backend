import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * NewsAPI.ai (Event Registry) — Complete REST Client
 *
 * Base URL: https://eventregistry.org/api/v1
 * Auth: apiKey query param on every request
 * Methods: GET and POST supported (POST recommended for complex queries)
 *
 * Endpoints (all discovered from official docs):
 *
 *   ARTICLES:
 *     POST /article/getArticles       — Search articles by keyword, concept, category, source, location, date
 *     GET  /article/getArticle        — Get a single article by URI
 *     POST /article/getArticlesForTopicPage — Articles for a curated topic page
 *
 *   EVENTS:
 *     POST /event/getEvents           — Search clustered news events
 *     GET  /event/getEvent            — Get a single event by URI
 *     GET  /event/getBreakingEvents   — Currently trending/breaking events
 *
 *   TEXT ANALYTICS:
 *     POST /annotate                  — Semantic annotation (NER: people, orgs, locations, concepts)
 *     POST /categorize                — Classify text into taxonomies (DMOZ, IPTC, News)
 *     POST /sentiment                 — Sentiment analysis on text
 *     POST /extractArticleInfo        — Extract structured article data from a URL
 *
 *   AUTOSUGGEST / LOOKUP:
 *     GET  /suggestConcepts           — Suggest concept URIs from prefix
 *     GET  /suggestConceptsFast       — Fast concept suggestion
 *     GET  /suggestCategories         — Suggest category URIs
 *     GET  /suggestSources            — Suggest news source URIs
 *     GET  /suggestAuthors            — Suggest author URIs
 *     GET  /suggestLocations          — Suggest location URIs
 *     GET  /suggestEventTypes         — Suggest event type URIs
 *
 *   REFERENCE / UTILITY:
 *     GET  /concept/getConceptInfo    — Get detailed info about a concept
 *     GET  /source/getSourceInfo      — Get detailed info about a source
 *     GET  /category/getCategoryInfo  — Get detailed info about a category
 *     GET  /dailyShares               — Daily article share counts
 *     GET  /minuteStreamArticles      — Stream most recent articles (polling)
 *     GET  /recentActivityArticles    — Recent activity feed
 *     GET  /usage                     — API quota and usage stats
 *     GET  /topCorrelations           — Top correlated concepts
 *     GET  /counts                    — Article/event counts over time
 */

const API_KEY = config.newsapi?.apiKey || process.env.NEWSAPI_AI_KEY || '';
const BASE_URL = 'https://eventregistry.org/api/v1';

const newsApi = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

import CacheService from '../../../shared/cache.service.js';

// Inject apiKey into every request
newsApi.interceptors.request.use((cfg) => {
  if (cfg.method === 'get') {
    cfg.params = { ...(cfg.params || {}), apiKey: API_KEY };
  } else if (cfg.method === 'post') {
    cfg.data = { ...(cfg.data || {}), apiKey: API_KEY };
  }
  return cfg;
});

async function cachedGet(path, config = {}) {
  return CacheService.getOrSet('newsapi', { path, params: config.params }, async () => {
    const { data } = await newsApi.get(path, config);
    return data;
  }, 300); // 5 min cache
}

async function cachedPost(path, body = {}) {
  return CacheService.getOrSet('newsapi', { path, body }, async () => {
    const { data } = await newsApi.post(path, body);
    return data;
  }, 300); // 5 min cache
}

export const NewsApiService = {

  // ═══════════════════════════════════════════════════════════════════════
  // ARTICLES
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Search articles. Supports complex query objects.
   * Body: { keyword, conceptUri, categoryUri, sourceUri, locationUri, lang, dateStart, dateEnd,
   *         isDuplicateFilter, hasDuplicateFilter, eventFilter, dataType, resultType,
   *         articlesSortBy, articlesSortByAsc, articlesCount, articlesPage, ... }
   */
  async searchArticles(query = {}) {
    const data = await cachedPost('/article/getArticles', query);
    return data;
  },

  /**
   * Get a single article by URI.
   * Params: { articleUri, resultType, includeArticleConcepts, ... }
   */
  async getArticle(articleUri, opts = {}) {
    const data = await cachedGet('/article/getArticle', { params: { articleUri, ...opts } });
    return data;
  },

  /**
   * Get articles for a specific topic page.
   * Body: { uri, resultType, articlesCount, articlesPage, ... }
   */
  async getArticlesForTopicPage(topicUri, opts = {}) {
    const data = await cachedPost('/article/getArticlesForTopicPage', { uri: topicUri, ...opts });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // EVENTS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Search events. Supports complex query objects.
   * Body: { keyword, conceptUri, categoryUri, sourceUri, locationUri, lang, dateStart, dateEnd,
   *         minArticlesInEvent, resultType, eventsSortBy, eventsSortByAsc, eventsCount, eventsPage, ... }
   */
  async searchEvents(query = {}) {
    const data = await cachedPost('/event/getEvents', query);
    return data;
  },

  /**
   * Get a single event by URI.
   * Params: { eventUri, resultType, includeEventConcepts, ... }
   */
  async getEvent(eventUri, opts = {}) {
    const data = await cachedGet('/event/getEvent', { params: { eventUri, ...opts } });
    return data;
  },

  /**
   * Get currently breaking/trending events.
   * Params: { minArticlesInEvent, lang, ... }
   */
  async getBreakingEvents(opts = {}) {
    const data = await cachedGet('/event/getBreakingEvents', { params: opts });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TEXT ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Semantic annotation — extract entities (people, orgs, locations, concepts) from text.
   * Body: { text, lang }
   */
  async annotate(text, lang = 'eng') {
    const data = await cachedPost('/annotate', { text, lang });
    return data;
  },

  /**
   * Categorize text into taxonomies (DMOZ, IPTC, or News).
   * Body: { text, taxonomy }  — taxonomy: 'dmoz' | 'iab-qag' | 'news' | 'iptc'
   */
  async categorize(text, taxonomy = 'news') {
    const data = await cachedPost('/categorize', { text, taxonomy });
    return data;
  },

  /**
   * Sentiment analysis on text.
   * Body: { text, lang }
   */
  async sentiment(text, lang = 'eng') {
    const data = await cachedPost('/sentiment', { text, lang });
    return data;
  },

  /**
   * Extract structured article data from a URL.
   * Body: { url, ... }
   */
  async extractArticleInfo(url) {
    const data = await cachedPost('/extractArticleInfo', { url });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AUTOSUGGEST / LOOKUP
  // ═══════════════════════════════════════════════════════════════════════

  async suggestConcepts(prefix, opts = {}) {
    const data = await cachedGet('/suggestConcepts', { params: { prefix, ...opts } });
    return data;
  },

  async suggestConceptsFast(prefix, opts = {}) {
    const data = await cachedGet('/suggestConceptsFast', { params: { prefix, ...opts } });
    return data;
  },

  async suggestCategories(prefix, opts = {}) {
    const data = await cachedGet('/suggestCategories', { params: { prefix, ...opts } });
    return data;
  },

  async suggestSources(prefix, opts = {}) {
    const data = await cachedGet('/suggestSources', { params: { prefix, ...opts } });
    return data;
  },

  async suggestAuthors(prefix, opts = {}) {
    const data = await cachedGet('/suggestAuthors', { params: { prefix, ...opts } });
    return data;
  },

  async suggestLocations(prefix, opts = {}) {
    const data = await cachedGet('/suggestLocations', { params: { prefix, ...opts } });
    return data;
  },

  async suggestEventTypes(prefix, opts = {}) {
    const data = await cachedGet('/suggestEventTypes', { params: { prefix, ...opts } });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // REFERENCE / UTILITY
  // ═══════════════════════════════════════════════════════════════════════

  async getConceptInfo(conceptUri, opts = {}) {
    const data = await cachedGet('/concept/getConceptInfo', { params: { uri: conceptUri, ...opts } });
    return data;
  },

  async getSourceInfo(sourceUri, opts = {}) {
    const data = await cachedGet('/source/getSourceInfo', { params: { uri: sourceUri, ...opts } });
    return data;
  },

  async getCategoryInfo(categoryUri, opts = {}) {
    const data = await cachedGet('/category/getCategoryInfo', { params: { uri: categoryUri, ...opts } });
    return data;
  },

  async getDailyShares(opts = {}) {
    const data = await cachedGet('/dailyShares', { params: opts });
    return data;
  },

  async getMinuteStreamArticles(opts = {}) {
    const data = await cachedGet('/minuteStreamArticles', { params: opts });
    return data;
  },

  async getRecentActivityArticles(opts = {}) {
    const data = await cachedGet('/recentActivityArticles', { params: opts });
    return data;
  },

  async getUsage() {
    const data = await cachedGet('/usage');
    return data;
  },

  async getTopCorrelations(conceptUri, opts = {}) {
    const data = await cachedGet('/topCorrelations', { params: { conceptUri, ...opts } });
    return data;
  },

  async getCounts(opts = {}) {
    const data = await cachedGet('/counts', { params: opts });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ARTICLE MAPPER
  // ═══════════════════════════════════════════════════════════════════════

  /** Map article URL to Event Registry article URI */
  async articleMapper(articleUrl, opts = {}) {
    const data = await cachedGet('/articleMapper', { params: { articleUrl, ...opts } });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // MENTIONS (event type mentions)
  // ═══════════════════════════════════════════════════════════════════════

  /** Query mentions of event types in articles */
  async getMentions(query = {}) {
    const data = await cachedPost('/eventType/mention', query);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // STORIES (clustered story groups)
  // ═══════════════════════════════════════════════════════════════════════

  /** Query story clusters */
  async getStory(storyUri, opts = {}) {
    const data = await cachedGet('/story', { params: { storyUri, ...opts } });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TRENDS — trending topics over time
  // ═══════════════════════════════════════════════════════════════════════

  async getTrends(query = {}) {
    const data = await cachedPost('/trends', query);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // COUNTERS — article/event counts over time
  // ═══════════════════════════════════════════════════════════════════════

  async getCounters(query = {}) {
    const data = await cachedPost('/counters', query);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // EVENT TYPES — SASB, SDG, industries
  // ═══════════════════════════════════════════════════════════════════════

  /** SASB materiality event types */
  async getSasbItems(opts = {}) {
    const data = await cachedGet('/eventType/sasb/getItems', { params: opts });
    return data;
  },

  /** UN Sustainable Development Goal event types */
  async getSdgItems(opts = {}) {
    const data = await cachedGet('/eventType/sdg/getItems', { params: opts });
    return data;
  },

  async suggestEventTypeTaxonomies(prefix, opts = {}) {
    const data = await cachedGet('/eventType/suggestEventTypes', { params: { prefix, ...opts } });
    return data;
  },

  async suggestIndustries(prefix, opts = {}) {
    const data = await cachedGet('/eventType/suggestIndustries', { params: { prefix, ...opts } });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE GROUPS
  // ═══════════════════════════════════════════════════════════════════════

  async getSourceGroups(opts = {}) {
    const data = await cachedGet('/sourceGroup/getSourceGroups', { params: opts });
    return data;
  },

  async getSourceGroupInfo(uri, opts = {}) {
    const data = await cachedGet('/sourceGroup/getSourceGroupInfo', { params: { uri, ...opts } });
    return data;
  },

  async suggestSourceGroups(prefix, opts = {}) {
    const data = await cachedGet('/suggestSourceGroups', { params: { prefix, ...opts } });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FAST SUGGEST VARIANTS (lower latency, fewer fields)
  // ═══════════════════════════════════════════════════════════════════════

  async suggestAuthorsFast(prefix, opts = {}) {
    const data = await cachedGet('/suggestAuthorsFast', { params: { prefix, ...opts } });
    return data;
  },

  async suggestCategoriesFast(prefix, opts = {}) {
    const data = await cachedGet('/suggestCategoriesFast', { params: { prefix, ...opts } });
    return data;
  },

  async suggestConceptClasses(prefix, opts = {}) {
    const data = await cachedGet('/suggestConceptClasses', { params: { prefix, ...opts } });
    return data;
  },

  async suggestLocationsFast(prefix, opts = {}) {
    const data = await cachedGet('/suggestLocationsFast', { params: { prefix, ...opts } });
    return data;
  },

  async suggestSourcesFast(prefix, opts = {}) {
    const data = await cachedGet('/suggestSourcesFast', { params: { prefix, ...opts } });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // MINUTE STREAMS (real-time polling feeds)
  // ═══════════════════════════════════════════════════════════════════════

  async getMinuteStreamEvents(opts = {}) {
    const data = await cachedGet('/minuteStreamEvents', { params: opts });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SERVICE STATUS
  // ═══════════════════════════════════════════════════════════════════════

  async getServiceStatus() {
    const data = await cachedGet('/getServiceStatus');
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GENERIC PROXY
  // ═══════════════════════════════════════════════════════════════════════

  async rawGet(path, params = {}) {
    const data = await cachedGet(path, { params });
    return data;
  },

  async rawPost(path, body = {}) {
    const data = await cachedPost(path, body);
    return data;
  },
};

export default NewsApiService;
