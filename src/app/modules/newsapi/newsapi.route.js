import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { NewsApiController } from './newsapi.controller.js';

const router = express.Router();

router.use(auth());

// ═══════════════════════════════════════════════════════════════════════
// ARTICLES
// ═══════════════════════════════════════════════════════════════════════

router.post('/articles/search', NewsApiController.searchArticles);
router.get('/articles/:articleUri', NewsApiController.getArticle);
router.post('/articles/topic-page', NewsApiController.getArticlesForTopicPage);

// ═══════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════

router.post('/events/search', NewsApiController.searchEvents);
router.get('/events/breaking', NewsApiController.getBreakingEvents);
router.get('/events/:eventUri', NewsApiController.getEvent);

// ═══════════════════════════════════════════════════════════════════════
// TEXT ANALYTICS
// ═══════════════════════════════════════════════════════════════════════

router.post('/analytics/annotate', NewsApiController.annotate);
router.post('/analytics/categorize', NewsApiController.categorize);
router.post('/analytics/sentiment', NewsApiController.sentiment);
router.post('/analytics/extract', NewsApiController.extractArticleInfo);

// ═══════════════════════════════════════════════════════════════════════
// AUTOSUGGEST
// ═══════════════════════════════════════════════════════════════════════

router.get('/suggest/concepts', NewsApiController.suggestConcepts);
router.get('/suggest/categories', NewsApiController.suggestCategories);
router.get('/suggest/sources', NewsApiController.suggestSources);
router.get('/suggest/authors', NewsApiController.suggestAuthors);
router.get('/suggest/locations', NewsApiController.suggestLocations);

// ═══════════════════════════════════════════════════════════════════════
// REFERENCE / UTILITY
// ═══════════════════════════════════════════════════════════════════════

router.get('/concepts/:conceptUri', NewsApiController.getConceptInfo);
router.get('/sources/:sourceUri', NewsApiController.getSourceInfo);
router.get('/stream/minute', NewsApiController.getMinuteStream);
router.get('/stream/recent', NewsApiController.getRecentActivity);
router.get('/usage', NewsApiController.getUsage);
router.get('/correlations', NewsApiController.getTopCorrelations);
router.get('/counts', NewsApiController.getCounts);

// ═══════════════════════════════════════════════════════════════════════
// ARTICLE MAPPER
// ═══════════════════════════════════════════════════════════════════════

router.get('/article-mapper', NewsApiController.articleMapper);

// ═══════════════════════════════════════════════════════════════════════
// MENTIONS
// ═══════════════════════════════════════════════════════════════════════

router.post('/mentions', NewsApiController.getMentions);

// ═══════════════════════════════════════════════════════════════════════
// STORIES
// ═══════════════════════════════════════════════════════════════════════

router.get('/stories/:storyUri', NewsApiController.getStory);

// ═══════════════════════════════════════════════════════════════════════
// TRENDS & COUNTERS
// ═══════════════════════════════════════════════════════════════════════

router.post('/trends', NewsApiController.getTrends);
router.post('/counters', NewsApiController.getCounters);

// ═══════════════════════════════════════════════════════════════════════
// EVENT TYPES (SASB, SDG, Industries)
// ═══════════════════════════════════════════════════════════════════════

router.get('/event-types/sasb', NewsApiController.getSasbItems);
router.get('/event-types/sdg', NewsApiController.getSdgItems);
router.get('/suggest/event-types', NewsApiController.suggestEventTypes);
router.get('/suggest/industries', NewsApiController.suggestIndustries);

// ═══════════════════════════════════════════════════════════════════════
// SOURCE GROUPS
// ═══════════════════════════════════════════════════════════════════════

router.get('/source-groups', NewsApiController.getSourceGroups);
router.get('/source-groups/:uri', NewsApiController.getSourceGroupInfo);

// ═══════════════════════════════════════════════════════════════════════
// MINUTE STREAM EVENTS
// ═══════════════════════════════════════════════════════════════════════

router.get('/stream/events', NewsApiController.getMinuteStreamEvents);

// ═══════════════════════════════════════════════════════════════════════
// SERVICE STATUS
// ═══════════════════════════════════════════════════════════════════════

router.get('/status', NewsApiController.getServiceStatus);

// ═══════════════════════════════════════════════════════════════════════
// RAW PROXY — catch-all for any unmapped Event Registry endpoint
// ═══════════════════════════════════════════════════════════════════════

router.all('/proxy/*', NewsApiController.rawProxy);

export const NewsApiRoutes = router;
export default NewsApiRoutes;
