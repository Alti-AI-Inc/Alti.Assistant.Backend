/**
 * explorium.route.js — Explorium AgentSource Complete REST API Router
 *
 * Every Explorium capability exposed as a clean REST endpoint.
 * Mounted at: /api/v1/explorium
 */

import express from 'express';
import {
  // Enum constants
  BUSINESS_ENRICHMENT_TYPES,
  PROSPECT_ENRICHMENT_TYPES,
  BUSINESS_EVENT_TYPES,
  PROSPECT_EVENT_TYPES,
  BUSINESS_FILTERS,
  PROSPECT_FILTERS,

  // Businesses core
  fetchBusinessesService,
  businessStatisticsService,
  matchBusinessesService,
  matchBusinessService,
  businessAutocompleteService,

  // Business enrichments
  enrichBusinessSingleService,
  bulkEnrichBusinessesService,
  getCompanyIntelligenceService,

  // Business events
  fetchBusinessEventsService,
  addBusinessEnrollmentsService,
  getBusinessEnrollmentsService,
  updateBusinessEnrollmentsService,
  deleteBusinessEnrollmentsService,

  // Prospects core
  fetchProspectsService,
  prospectStatisticsService,
  matchProspectsService,
  matchProspectService,
  prospectAutocompleteService,

  // Prospect enrichments
  enrichProspectSingleService,
  bulkEnrichProspectsService,
  getProspectIntelligenceService,

  // Prospect events
  fetchProspectEventsService,
  addProspectEnrollmentsService,
  getProspectEnrollmentsService,
  updateProspectEnrollmentsService,
  deleteProspectEnrollmentsService,

  // Webhooks
  addWebhookService,
  getWebhookService,
  updateWebhookService,
  deleteWebhookService,
  checkWebhookConnectivityService,

  // Credits
  getCreditsSummaryService,
  getCreditConsumptionService,

  // Intelligence workflows
  getTAMAnalysisService,
  getDecisionMakersService,
  getIntentSignalsService,
  getCompetitiveIntelligenceService,
  getSalesIntelligenceService,
  getWebsiteIntelligenceService,
  getFundingRadarService,
  getHiringSignalsService,
  getLookalikeCompaniesService,
} from './explorium.service.js';
import { logger } from '../../../shared/logger.js';

const router = express.Router();

// ─── Helper: async error wrapper ─────────────────────────────────────────────
const handleAsync = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    logger.error('[Explorium Route]', err.message);
    res.status(500).json({ success: false, error: err.message });
  });

// ─── Helper: require body fields ─────────────────────────────────────────────
const requireFields = (body, fields) => {
  const missing = fields.filter((f) => !body[f] && body[f] !== 0);
  return missing.length > 0 ? `Missing required fields: ${missing.join(', ')}` : null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA / INFO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /explorium/info
 * Full capability manifest with all valid enum values.
 */
router.get('/info', (req, res) => {
  res.json({
    provider: 'Explorium AgentSource',
    description: 'B2B intelligence API — 80M+ companies, 800M+ professionals, real-time events & intent data',
    website: 'https://www.explorium.ai',
    docs: 'https://developers.explorium.ai',
    scale: { businesses: '80M+ across 150+ countries', professionals: '800M+' },
    workflow: ['1. Statistics (count audience)', '2. Match (get IDs)', '3. Fetch (bulk discover)', '4. Enrich (detailed data)', '5. Events (real-time signals)'],
    auth: { header: 'API_KEY', env_var: 'EXPLORIUM_API_KEY', portal: 'https://admin.explorium.ai' },
    enums: {
      business_enrichment_types: BUSINESS_ENRICHMENT_TYPES,
      prospect_enrichment_types: PROSPECT_ENRICHMENT_TYPES,
      business_event_types: BUSINESS_EVENT_TYPES,
      prospect_event_types: PROSPECT_EVENT_TYPES,
      company_sizes: BUSINESS_FILTERS.COMPANY_SIZES,
      revenue_ranges: BUSINESS_FILTERS.REVENUE_RANGES,
      company_ages: BUSINESS_FILTERS.COMPANY_AGES,
      job_levels: PROSPECT_FILTERS.JOB_LEVELS,
      job_departments: PROSPECT_FILTERS.JOB_DEPARTMENTS,
    },
    endpoints: {
      '─── BUSINESSES ───': '',
      'POST /businesses/fetch':                'Search/filter businesses (80M+ records)',
      'POST /businesses/statistics':           'Count audience before fetching (free check)',
      'POST /businesses/match':                'Match domain/name/tax_id → business_id',
      'GET  /businesses/autocomplete':         'Autocomplete any filter field',
      'POST /businesses/:id/enrich/:type':     'Enrich single business with specific type',
      'POST /businesses/bulk-enrich/:type':    'Bulk enrich up to 50 businesses',
      'GET  /businesses/company/:domain':      'Full company profile by domain (all enrichments)',

      '─── BUSINESS EVENTS ───': '',
      'POST /businesses/events':               'Fetch real-time events for businesses',
      'POST /businesses/enrollments':          'Add webhook enrollment for business events',
      'GET  /businesses/enrollments':          'List business event enrollments',
      'PUT  /businesses/enrollments':          'Update business enrollment',
      'DELETE /businesses/enrollments':        'Remove business enrollment',

      '─── PROSPECTS ───': '',
      'POST /prospects/fetch':                 'Search/filter prospects (800M+ profiles)',
      'POST /prospects/statistics':            'Count prospects matching filters',
      'POST /prospects/match':                 'Match email → prospect_id (batch)',
      'GET  /prospects/autocomplete':          'Autocomplete job titles, departments, etc.',
      'POST /prospects/:id/enrich/:type':      'Enrich single prospect',
      'POST /prospects/bulk-enrich/:type':     'Bulk enrich up to 50 prospects',
      'GET  /prospects/email/:email':          'Full prospect profile by email',

      '─── PROSPECT EVENTS ───': '',
      'POST /prospects/events':                'Fetch prospect events (job changes, anniversaries)',
      'POST /prospects/enrollments':           'Add webhook enrollment for prospect events',
      'GET  /prospects/enrollments':           'List prospect event enrollments',
      'PUT  /prospects/enrollments':           'Update prospect enrollment',
      'DELETE /prospects/enrollments':         'Remove prospect enrollment',

      '─── WEBHOOKS ───': '',
      'POST /webhooks':                        'Register a webhook endpoint',
      'GET  /webhooks':                        'Get webhook config',
      'PUT  /webhooks':                        'Update webhook',
      'DELETE /webhooks':                      'Remove webhook',
      'POST /webhooks/check':                  'Test webhook connectivity',

      '─── CREDITS ───': '',
      'GET  /credits/summary':                 'Active credits balance and plan',
      'GET  /credits/consumption':             'Credit usage history with time range',

      '─── INTELLIGENCE WORKFLOWS ───': '',
      'POST /intelligence/tam':                'TAM sizing: count businesses + prospects for ICP',
      'GET  /intelligence/decision-makers/:domain': 'Find C-Suite/VP/Director contacts at a company',
      'POST /intelligence/intent-signals':     'Bombora intent — find companies researching your topics',
      'GET  /intelligence/competitive/:domain':'Competitive landscape + strategy + challenges + financials',
      'GET  /intelligence/sales/:email':       'Sales profile: full contact + social + employment',
      'GET  /intelligence/website/:domain':    'Website intel: traffic + tech + changes + keywords',
      'POST /intelligence/funding-radar':      'Companies with recent funding rounds (30-90 day lookback)',
      'POST /intelligence/hiring-signals':     'Companies actively hiring by department',
      'GET  /intelligence/lookalikes/:domain': 'Find similar companies (Ocean.IO AI lookalike)',
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUSINESSES — CORE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /explorium/businesses/fetch
 * Search businesses with full filter support.
 *
 * Body: {
 *   filters: {
 *     country_code?: { values: ['us','ca'] },
 *     region_country_code?: { values: ['us-ca'] },
 *     city_region_country?: { values: ['San Francisco, CA, US'] },
 *     company_size?: { values: ['11-50','51-200'] },
 *     company_revenue?: { values: ['10M-25M','25M-75M'] },
 *     company_age?: { values: ['3-6','6-10'] },
 *     company_name?: { values: ['Stripe','Brex'] },
 *     google_category?: { values: ['Fintech'] },
 *     naics_category?: { values: ['541512'] },
 *     linkedin_category?: { values: ['software development'] },
 *     company_tech_stack_category?: { values: ['CRM','Marketing'] },
 *     company_tech_stack_tech?: { values: ['Salesforce','HubSpot'] },
 *     number_of_locations?: { values: ['2-5'] },
 *     website_keywords?: { values: ['AI','machine learning'] },
 *     business_intent_topics?: { topics: ['Security:Cloud Security'], topic_intent_level: 'high_intent' },
 *     events?: { values: ['new_funding_round'], last_occurrence: 45 },
 *     has_website?: { values: [true] },
 *     is_public_company?: { values: [false] },
 *     business_id?: { values: ['abc123...'] }
 *   },
 *   mode?: 'full' | 'preview',
 *   page?: number,
 *   page_size?: number,
 *   size?: number,
 *   exclude?: string[],
 *   next_cursor?: string
 * }
 */
router.post('/businesses/fetch', handleAsync(async (req, res) => {
  const { filters = {}, mode = 'full', page = 1, page_size = 20, size = 1000, exclude = [], next_cursor } = req.body;
  const data = await fetchBusinessesService({ filters, mode, page, page_size, size, exclude, next_cursor });
  res.json(data);
}));

/**
 * POST /explorium/businesses/statistics
 * Count businesses matching filters (call before fetch — free pre-check).
 * Body: { filters: { ... } }
 */
router.post('/businesses/statistics', handleAsync(async (req, res) => {
  const { filters = {} } = req.body;
  const data = await businessStatisticsService(filters);
  res.json(data);
}));

/**
 * POST /explorium/businesses/match
 * Match companies to Explorium business_ids. Supports batching.
 *
 * Body: {
 *   businesses: [{ domain?, name?, country?, tax_id?, phone? }]
 * }
 * OR (single shorthand):
 * Body: { domain?, name?, country? }
 */
router.post('/businesses/match', handleAsync(async (req, res) => {
  const { businesses, domain, name, country } = req.body;

  if (!businesses && !domain && !name) {
    return res.status(400).json({ error: 'Provide businesses[] array or domain/name.' });
  }

  if (businesses) {
    const data = await matchBusinessesService(businesses);
    return res.json(data);
  }

  const data = await matchBusinessService({ domain, name, country });
  res.json(data);
}));

/**
 * GET /explorium/businesses/autocomplete
 * Autocomplete valid values for any business filter field.
 *
 * Query: field=linkedin_category&q=fin&semantic_search=true
 * Valid fields: country_code, company_size, company_revenue, company_age,
 *   linkedin_category, naics_category, google_category, company_tech_stack_category,
 *   company_tech_stack_tech, number_of_locations, business_intent_topics,
 *   city_region_country, website_keywords
 */
router.get('/businesses/autocomplete', handleAsync(async (req, res) => {
  const { field, q, semantic_search } = req.query;
  if (!field || !q) return res.status(400).json({ error: 'field and q are required.' });
  const data = await businessAutocompleteService(field, q, semantic_search === 'true');
  res.json({ field, query: q, results: data });
}));

// ─── Business Enrichments — Single ───────────────────────────────────────────

/**
 * POST /explorium/businesses/:id/enrich/:type
 * Enrich a single business with a specific data type.
 *
 * Params:
 *   :id   - Explorium business_id (32-char hex)
 *   :type - One of: firmographics, technographics, webstack, funding_and_acquisitions,
 *           financial_metrics, company_ratings, company_social_media, competitive_landscape,
 *           strategic_insights, business_challenges, workforce_trends, website_traffic,
 *           website_content_changes, keyword_search, lookalike_companies,
 *           company_hierarchy, business_intent_topics
 *
 * Body: { parameters?: {} }  (optional type-specific params)
 */
router.post('/businesses/:id/enrich/:type', handleAsync(async (req, res) => {
  const { id, type } = req.params;
  const { parameters = {} } = req.body;

  if (!BUSINESS_ENRICHMENT_TYPES.includes(type)) {
    return res.status(400).json({
      error: `Invalid enrichment type: '${type}'`,
      valid_types: BUSINESS_ENRICHMENT_TYPES,
    });
  }

  const data = await enrichBusinessSingleService(id, type, parameters);
  res.json(data);
}));

/**
 * POST /explorium/businesses/bulk-enrich/:type
 * Bulk enrich up to 50 businesses with one enrichment type.
 *
 * Params: :type - One of BUSINESS_ENRICHMENT_TYPES
 * Body: { business_ids: string[], parameters?: {} }
 */
router.post('/businesses/bulk-enrich/:type', handleAsync(async (req, res) => {
  const { type } = req.params;
  const { business_ids, parameters = {} } = req.body;

  if (!business_ids?.length) return res.status(400).json({ error: 'business_ids[] is required.' });
  if (!BUSINESS_ENRICHMENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid enrichment type: '${type}'`, valid_types: BUSINESS_ENRICHMENT_TYPES });
  }

  const data = await bulkEnrichBusinessesService(business_ids, type, parameters);
  res.json(data);
}));

/**
 * GET /explorium/businesses/company/:domain
 * Full company intelligence by domain — match + all enrichment types.
 * This is the "tell me everything" endpoint.
 *
 * Query: enrichment_types=firmographics,technographics (comma-separated, default: all)
 */
router.get('/businesses/company/:domain', handleAsync(async (req, res) => {
  const { domain } = req.params;
  const { enrichment_types } = req.query;

  const types = enrichment_types
    ? enrichment_types.split(',').map((t) => t.trim()).filter((t) => BUSINESS_ENRICHMENT_TYPES.includes(t))
    : BUSINESS_ENRICHMENT_TYPES;

  const data = await getCompanyIntelligenceService(domain, types);
  res.json(data);
}));

// ─── Business Events ──────────────────────────────────────────────────────────

/**
 * POST /explorium/businesses/events
 * Fetch real-time events for given business_ids.
 *
 * Body: {
 *   business_ids: string[],
 *   event_types?: string[],   (from BUSINESS_EVENT_TYPES)
 *   last_days?: number,       (30–90, default 30)
 *   page?: number,
 *   page_size?: number
 * }
 */
router.post('/businesses/events', handleAsync(async (req, res) => {
  const { business_ids, event_types = [], last_days = 30, page = 1, page_size = 20 } = req.body;
  if (!business_ids?.length) return res.status(400).json({ error: 'business_ids[] is required.' });
  const data = await fetchBusinessEventsService(business_ids, event_types, last_days, page, page_size);
  res.json(data);
}));

/**
 * POST /explorium/businesses/enrollments
 * Add webhook enrollment to receive real-time business events.
 *
 * Body: { business_ids, event_types, webhook_url, partner_id }
 */
router.post('/businesses/enrollments', handleAsync(async (req, res) => {
  const { business_ids, event_types, webhook_url, partner_id } = req.body;
  const err = requireFields(req.body, ['business_ids', 'event_types', 'webhook_url', 'partner_id']);
  if (err) return res.status(400).json({ error: err });
  const data = await addBusinessEnrollmentsService(business_ids, event_types, webhook_url, partner_id);
  res.json(data);
}));

router.get('/businesses/enrollments', handleAsync(async (req, res) => {
  const data = await getBusinessEnrollmentsService();
  res.json(data);
}));

router.put('/businesses/enrollments', handleAsync(async (req, res) => {
  const { partner_id, ...updates } = req.body;
  if (!partner_id) return res.status(400).json({ error: 'partner_id is required.' });
  const data = await updateBusinessEnrollmentsService(partner_id, updates);
  res.json(data);
}));

router.delete('/businesses/enrollments', handleAsync(async (req, res) => {
  const { partner_id } = req.body;
  if (!partner_id) return res.status(400).json({ error: 'partner_id is required.' });
  const data = await deleteBusinessEnrollmentsService(partner_id);
  res.json(data);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// PROSPECTS — CORE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /explorium/prospects/fetch
 * Search prospects with full filter support.
 *
 * Body: {
 *   filters: {
 *     has_email?: { value: true },
 *     has_phone_number?: { value: true },
 *     job_level?: { values: ['director','c-suite','vp'] },
 *     job_department?: { values: ['engineering','product'] },
 *     job_title?: { values: ['CTO'], include_related_job_titles: true },
 *     business_id?: { values: ['abc123...'] },
 *     country_code?: { values: ['us','gb'] },          (prospect location)
 *     region_country_code?: { values: ['us-ca'] },
 *     city_region_country?: { values: ['New York, NY, US'] },
 *     company_country_code?: { values: ['us'] },       (company HQ)
 *     company_region_country_code?: { values: ['us-tx'] },
 *     company_size?: { values: ['201-500'] },
 *     company_revenue?: { values: ['25M-75M'] },
 *     company_age?: { values: ['3-6'] },
 *     company_name?: { values: ['Stripe'] },
 *     google_category?: { values: ['Fintech'] },
 *     naics_category?: { values: ['52'] },
 *     linkedin_category?: { values: ['fintech'] },
 *     total_experience_months?: { gte: 60 },
 *     current_role_months?: { gte: 12 },
 *     prospect_id?: { values: ['...'] },
 *     has_website?: { values: [true] },
 *     is_public_company?: { values: [false] },
 *     company_number_of_locations?: { values: ['2-5'] }
 *   },
 *   mode?: 'full',
 *   page?: number,
 *   page_size?: number,
 *   size?: number,
 *   exclude?: string[]
 * }
 */
router.post('/prospects/fetch', handleAsync(async (req, res) => {
  const { filters = {}, mode = 'full', page = 1, page_size = 20, size = 1000, exclude = [] } = req.body;
  const data = await fetchProspectsService({ filters, mode, page, page_size, size, exclude });
  res.json(data);
}));

/**
 * POST /explorium/prospects/statistics
 * Count prospects matching filters (free pre-check before bulk fetch).
 * Body: { filters: { ... } }
 */
router.post('/prospects/statistics', handleAsync(async (req, res) => {
  const { filters = {} } = req.body;
  const data = await prospectStatisticsService(filters);
  res.json(data);
}));

/**
 * POST /explorium/prospects/match
 * Match prospects to Explorium prospect_ids. Supports batching.
 *
 * Body: {
 *   prospects: [{ email, first_name?, last_name?, company? }]
 * }
 * OR (single shorthand):
 * Body: { email: string }
 */
router.post('/prospects/match', handleAsync(async (req, res) => {
  const { prospects, email } = req.body;

  if (!prospects && !email) return res.status(400).json({ error: 'Provide prospects[] or email.' });

  if (prospects) {
    const data = await matchProspectsService(prospects);
    return res.json(data);
  }

  const data = await matchProspectService(email);
  res.json(data);
}));

/**
 * GET /explorium/prospects/autocomplete
 * Autocomplete valid values for prospect filter fields.
 *
 * Query: field=job_level&q=dir
 * Valid fields: job_level, job_department, job_title, country_code,
 *   company_size, company_revenue, linkedin_category, naics_category,
 *   google_category, region_country_code
 */
router.get('/prospects/autocomplete', handleAsync(async (req, res) => {
  const { field, q } = req.query;
  if (!field || !q) return res.status(400).json({ error: 'field and q are required.' });
  const data = await prospectAutocompleteService(field, q);
  res.json({ field, query: q, results: data });
}));

// ─── Prospect Enrichments — Single ───────────────────────────────────────────

/**
 * POST /explorium/prospects/:id/enrich/:type
 * Enrich a single prospect with a specific data type.
 *
 * Params:
 *   :id   - Explorium prospect_id (40-char hex)
 *   :type - One of: professional_profile, contacts_information, social_media
 */
router.post('/prospects/:id/enrich/:type', handleAsync(async (req, res) => {
  const { id, type } = req.params;

  if (!PROSPECT_ENRICHMENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid type: '${type}'`, valid_types: PROSPECT_ENRICHMENT_TYPES });
  }

  const data = await enrichProspectSingleService(id, type);
  res.json(data);
}));

/**
 * POST /explorium/prospects/bulk-enrich/:type
 * Bulk enrich up to 50 prospects with one enrichment type.
 *
 * Params: :type - One of PROSPECT_ENRICHMENT_TYPES
 * Body: { prospect_ids: string[] }
 */
router.post('/prospects/bulk-enrich/:type', handleAsync(async (req, res) => {
  const { type } = req.params;
  const { prospect_ids } = req.body;

  if (!prospect_ids?.length) return res.status(400).json({ error: 'prospect_ids[] is required.' });
  if (!PROSPECT_ENRICHMENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid type: '${type}'`, valid_types: PROSPECT_ENRICHMENT_TYPES });
  }

  const data = await bulkEnrichProspectsService(prospect_ids, type);
  res.json(data);
}));

/**
 * GET /explorium/prospects/email/:email
 * Full prospect intelligence by email — match + all enrichment types.
 * URL-encode the email.
 */
router.get('/prospects/email/:email', handleAsync(async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const data = await getProspectIntelligenceService(email);
  res.json(data);
}));

// ─── Prospect Events ──────────────────────────────────────────────────────────

/**
 * POST /explorium/prospects/events
 * Fetch prospect events (job changes, company changes, anniversaries).
 *
 * Body: {
 *   prospect_ids: string[],
 *   event_types?: string[],   (from PROSPECT_EVENT_TYPES)
 *   last_days?: number,       (30–90, default 30)
 *   page?: number,
 *   page_size?: number
 * }
 */
router.post('/prospects/events', handleAsync(async (req, res) => {
  const { prospect_ids, event_types = [], last_days = 30, page = 1, page_size = 20 } = req.body;
  if (!prospect_ids?.length) return res.status(400).json({ error: 'prospect_ids[] is required.' });
  const data = await fetchProspectEventsService(prospect_ids, event_types, last_days, page, page_size);
  res.json(data);
}));

/**
 * POST /explorium/prospects/enrollments
 * Subscribe to prospect events via webhook.
 * Body: { prospect_ids, event_types, webhook_url, partner_id }
 */
router.post('/prospects/enrollments', handleAsync(async (req, res) => {
  const { prospect_ids, event_types, webhook_url, partner_id } = req.body;
  const err = requireFields(req.body, ['prospect_ids', 'event_types', 'webhook_url', 'partner_id']);
  if (err) return res.status(400).json({ error: err });
  const data = await addProspectEnrollmentsService(prospect_ids, event_types, webhook_url, partner_id);
  res.json(data);
}));

router.get('/prospects/enrollments', handleAsync(async (req, res) => {
  const data = await getProspectEnrollmentsService();
  res.json(data);
}));

router.put('/prospects/enrollments', handleAsync(async (req, res) => {
  const { partner_id, ...updates } = req.body;
  if (!partner_id) return res.status(400).json({ error: 'partner_id is required.' });
  const data = await updateProspectEnrollmentsService(partner_id, updates);
  res.json(data);
}));

router.delete('/prospects/enrollments', handleAsync(async (req, res) => {
  const { partner_id } = req.body;
  if (!partner_id) return res.status(400).json({ error: 'partner_id is required.' });
  const data = await deleteProspectEnrollmentsService(partner_id);
  res.json(data);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /explorium/webhooks
 * Register a webhook endpoint to receive real-time event notifications.
 * Body: { url, partner_id, event_types?, secret? }
 */
router.post('/webhooks', handleAsync(async (req, res) => {
  const { url, partner_id, event_types = [], secret } = req.body;
  const err = requireFields(req.body, ['url', 'partner_id']);
  if (err) return res.status(400).json({ error: err });
  const data = await addWebhookService(url, partner_id, event_types, secret);
  res.json(data);
}));

/**
 * GET /explorium/webhooks
 * Query: partner_id=your_id
 */
router.get('/webhooks', handleAsync(async (req, res) => {
  const { partner_id } = req.query;
  if (!partner_id) return res.status(400).json({ error: 'partner_id query param is required.' });
  const data = await getWebhookService(partner_id);
  res.json(data);
}));

/**
 * PUT /explorium/webhooks
 * Body: { partner_id, url?, event_types?, secret? }
 */
router.put('/webhooks', handleAsync(async (req, res) => {
  const { partner_id, ...updates } = req.body;
  if (!partner_id) return res.status(400).json({ error: 'partner_id is required.' });
  const data = await updateWebhookService(partner_id, updates);
  res.json(data);
}));

/**
 * DELETE /explorium/webhooks
 * Body: { partner_id }
 */
router.delete('/webhooks', handleAsync(async (req, res) => {
  const { partner_id } = req.body;
  if (!partner_id) return res.status(400).json({ error: 'partner_id is required.' });
  const data = await deleteWebhookService(partner_id);
  res.json(data);
}));

/**
 * POST /explorium/webhooks/check
 * Test that a webhook URL is reachable.
 * Body: { url }
 */
router.post('/webhooks/check', handleAsync(async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required.' });
  const data = await checkWebhookConnectivityService(url);
  res.json(data);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// CREDITS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /explorium/credits/summary
 * Returns active credits, plan info, and expiry.
 */
router.get('/credits/summary', handleAsync(async (req, res) => {
  const data = await getCreditsSummaryService();
  res.json(data);
}));

/**
 * GET /explorium/credits/consumption
 * Credit usage history.
 * Query: from=2025-01-01&to=2025-12-31&resolution=day|week|month
 */
router.get('/credits/consumption', handleAsync(async (req, res) => {
  const { from, to, resolution = 'day' } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to date params are required.' });
  const data = await getCreditConsumptionService(from, to, resolution);
  res.json(data);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// INTELLIGENCE WORKFLOWS — High-level, AI-ready combinations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /explorium/intelligence/tam
 * Total Addressable Market sizing — no enrichment credits consumed.
 * Returns business count + prospect count for a given ICP definition.
 *
 * Body: { business_filters: {}, prospect_filters: {} }
 */
router.post('/intelligence/tam', handleAsync(async (req, res) => {
  const { business_filters = {}, prospect_filters = {} } = req.body;
  const data = await getTAMAnalysisService(business_filters, prospect_filters);
  res.json(data);
}));

/**
 * GET /explorium/intelligence/decision-makers/:domain
 * Find decision-makers (C-Suite, VP, Director) at a company by domain.
 *
 * Query:
 *   job_levels=c-suite,vp,director    (CSV, default: c-suite,vp,director)
 *   departments=engineering,product   (CSV, optional)
 *   require_email=true                (default: true)
 *   require_phone=false               (default: false)
 *   limit=10                          (default: 10)
 */
router.get('/intelligence/decision-makers/:domain', handleAsync(async (req, res) => {
  const { domain } = req.params;
  const {
    job_levels = 'c-suite,vp,director',
    departments = '',
    require_email = 'true',
    require_phone = 'false',
    limit = '10',
  } = req.query;

  const data = await getDecisionMakersService(
    domain,
    job_levels.split(',').map((j) => j.trim()).filter(Boolean),
    departments ? departments.split(',').map((d) => d.trim()).filter(Boolean) : [],
    require_email !== 'false',
    require_phone === 'true',
    parseInt(limit, 10)
  );
  res.json(data);
}));

/**
 * POST /explorium/intelligence/intent-signals
 * Find companies actively researching your topics (Bombora intent data).
 * Returns accounts with composite score >60 on the specified topics.
 *
 * Body: {
 *   intent_topics: ['Security:Cloud Security', 'HR:Employee Benefits'],
 *   intent_level?: 'high_intent' | 'medium_intent',
 *   additional_filters?: { company_size: { values: ['201-500'] }, ... },
 *   page_size?: number
 * }
 */
router.post('/intelligence/intent-signals', handleAsync(async (req, res) => {
  const { intent_topics, intent_level = 'high_intent', additional_filters = {}, page_size = 50 } = req.body;
  if (!intent_topics?.length) return res.status(400).json({ error: 'intent_topics[] is required.' });
  const data = await getIntentSignalsService(intent_topics, intent_level, additional_filters, page_size);
  res.json(data);
}));

/**
 * GET /explorium/intelligence/competitive/:domain
 * Full competitive intelligence for a company.
 * Returns: competitive landscape, strategic insights, business challenges,
 * financial metrics, funding history, workforce trends, firmographics.
 */
router.get('/intelligence/competitive/:domain', handleAsync(async (req, res) => {
  const { domain } = req.params;
  const data = await getCompetitiveIntelligenceService(domain);
  res.json(data);
}));

/**
 * GET /explorium/intelligence/sales/:email
 * Full sales intelligence for a prospect by email.
 * Returns: professional profile, verified contacts, social media presence.
 * URL-encode the email.
 */
router.get('/intelligence/sales/:email', handleAsync(async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const data = await getSalesIntelligenceService(email);
  res.json(data);
}));

/**
 * GET /explorium/intelligence/website/:domain
 * Website intelligence for a company — traffic, tech stack, content changes, keyword presence.
 *
 * Query: keywords=AI,machine+learning  (CSV, optional)
 */
router.get('/intelligence/website/:domain', handleAsync(async (req, res) => {
  const { domain } = req.params;
  const { keywords = '' } = req.query;
  const kws = keywords ? keywords.split(',').map((k) => k.trim()).filter(Boolean) : [];
  const data = await getWebsiteIntelligenceService(domain, kws);
  res.json(data);
}));

/**
 * POST /explorium/intelligence/funding-radar
 * Find companies with recent funding rounds, IPOs, or new investments.
 *
 * Body: {
 *   filters?: { company_size: ..., linkedin_category: ..., country_code: ... },
 *   last_days?: number,   (30–90, default 30)
 *   page_size?: number
 * }
 */
router.post('/intelligence/funding-radar', handleAsync(async (req, res) => {
  const { filters = {}, last_days = 30, page_size = 50 } = req.body;
  const data = await getFundingRadarService(filters, last_days, page_size);
  res.json(data);
}));

/**
 * POST /explorium/intelligence/hiring-signals
 * Find companies actively hiring by department.
 *
 * Body: {
 *   departments?: ['engineering','sales','marketing'],
 *   filters?: { country_code: { values: ['us'] }, ... },
 *   last_days?: number,   (30–90, default 30)
 *   page_size?: number
 * }
 */
router.post('/intelligence/hiring-signals', handleAsync(async (req, res) => {
  const { departments = [], filters = {}, last_days = 30, page_size = 50 } = req.body;
  const data = await getHiringSignalsService(departments, filters, last_days, page_size);
  res.json(data);
}));

/**
 * GET /explorium/intelligence/lookalikes/:domain
 * Find companies similar to a reference domain using Ocean.IO AI similarity.
 *
 * Query: country_code=us&company_size=11-50,51-200  (optional additional filters)
 */
router.get('/intelligence/lookalikes/:domain', handleAsync(async (req, res) => {
  const { domain } = req.params;
  const { country_code, company_size, linkedin_category } = req.query;

  const additionalFilters = {};
  if (country_code) additionalFilters.country_code = { values: country_code.split(',').map((c) => c.trim()) };
  if (company_size) additionalFilters.company_size = { values: company_size.split(',').map((s) => s.trim()) };
  if (linkedin_category) additionalFilters.linkedin_category = { values: linkedin_category.split(',').map((c) => c.trim()) };

  const data = await getLookalikeCompaniesService(domain, additionalFilters);
  res.json(data);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// AI AGENT ROUTES — LLM-powered B2B intelligence
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /explorium/agent/research
 * Answer a natural-language question about any company.
 * Uses Explorium data as grounding context for Gemini AI.
 * Body: { domain: "stripe.com", question: "What is their go-to-market strategy?" }
 */
router.post('/agent/research', handleAsync(async (req, res) => {
  const { domain, question } = req.body;
  if (!domain || !question) return res.status(400).json({ error: 'domain and question are required.' });
  const { researchCompany } = await import('./explorium.agent.js');
  const data = await researchCompany(domain, question);
  res.json(data);
}));

/**
 * POST /explorium/agent/build-icp
 * Convert natural language ICP description → API filters + live audience count.
 * Body: { description: "Series B SaaS companies in the US with 50-500 employees using Salesforce" }
 */
router.post('/agent/build-icp', handleAsync(async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: 'description is required.' });
  const { buildICP } = await import('./explorium.agent.js');
  const data = await buildICP(description);
  res.json(data);
}));

/**
 * POST /explorium/agent/analyze-prospect
 * Pre-meeting sales intelligence brief for a prospect by email.
 * Body: { email: "john@stripe.com", context: "selling CRM software" }
 */
router.post('/agent/analyze-prospect', handleAsync(async (req, res) => {
  const { email, context = '' } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required.' });
  const { analyzeProspect } = await import('./explorium.agent.js');
  const data = await analyzeProspect(email, context);
  res.json(data);
}));

/**
 * POST /explorium/agent/score-leads
 * AI lead scoring (0-100) for a list of business objects from fetchBusinesses.
 * Body: { businesses: [...], icp_description: "Mid-market SaaS companies..." }
 */
router.post('/agent/score-leads', handleAsync(async (req, res) => {
  const { businesses, icp_description } = req.body;
  if (!businesses?.length)  return res.status(400).json({ error: 'businesses[] is required.' });
  if (!icp_description)     return res.status(400).json({ error: 'icp_description is required.' });
  const { scoreLeads } = await import('./explorium.agent.js');
  const data = await scoreLeads(businesses, icp_description);
  res.json(data);
}));

/**
 * POST /explorium/agent/outreach-email
 * Generate hyper-personalized cold outreach email using Explorium contact data.
 * Body: {
 *   prospect: { full_name, job_title, company_name, ... },
 *   sender: { name, company, product, value_prop },
 *   context?: "They just raised Series B"
 * }
 */
router.post('/agent/outreach-email', handleAsync(async (req, res) => {
  const { prospect, sender, context = '' } = req.body;
  if (!prospect) return res.status(400).json({ error: 'prospect object is required.' });
  if (!sender)   return res.status(400).json({ error: 'sender object is required.' });
  const { generateOutreachEmail } = await import('./explorium.agent.js');
  const data = await generateOutreachEmail(prospect, sender, context);
  res.json(data);
}));

/**
 * POST /explorium/agent/search
 * Natural language company search — converts query → filters → results.
 * Body: { query: "fast-growing AI startups in NYC under 200 employees", limit?: 20 }
 */
router.post('/agent/search', handleAsync(async (req, res) => {
  const { query, limit = 20 } = req.body;
  if (!query) return res.status(400).json({ error: 'query is required.' });
  const { naturalLanguageSearch } = await import('./explorium.agent.js');
  const data = await naturalLanguageSearch(query, limit);
  res.json(data);
}));

/**
 * GET /explorium/agent/summarize/:domain
 * Executive one-paragraph company summary with key facts.
 */
router.get('/agent/summarize/:domain', handleAsync(async (req, res) => {
  const { domain } = req.params;
  const { summarizeCompany } = await import('./explorium.agent.js');
  const data = await summarizeCompany(domain);
  res.json(data);
}));

/**
 * GET /explorium/agent/timeline/:domain
 * Fetch and narrate a company's recent event timeline.
 * Query: last_days=30 (30-90, default 30)
 */
router.get('/agent/timeline/:domain', handleAsync(async (req, res) => {
  const { domain } = req.params;
  const last_days = Math.min(90, Math.max(30, parseInt(req.query.last_days || '30', 10)));
  const { getCompanyTimeline } = await import('./explorium.agent.js');
  const data = await getCompanyTimeline(domain, last_days);
  res.json(data);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK INBOUND — Real-time event receiver from Explorium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /explorium/webhook/inbound
 * Receives real-time events from Explorium AgentSource.
 * Verifies HMAC-SHA256 signature (X-Explorium-Signature header).
 * Uses express.raw() to capture raw body for signature verification.
 *
 * Configure in Explorium admin: https://admin.explorium.ai
 * Set env var: EXPLORIUM_WEBHOOK_SECRET=<your_secret>
 */
router.post(
  '/webhook/inbound',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const { webhookHandler } = await import('./explorium.webhook.handler.js');
    return webhookHandler(req, res);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /explorium/cache/stats
 * Returns cache hit rate, total requests, sets, and error counts.
 * Useful for monitoring credit spend efficiency.
 */
router.get('/cache/stats', handleAsync(async (req, res) => {
  const { getCacheStats } = await import('./explorium.cache.js');
  res.json(getCacheStats());
}));

/**
 * DELETE /explorium/cache/reset
 * Resets in-memory cache statistics (not the actual cache entries).
 */
router.delete('/cache/reset', handleAsync(async (req, res) => {
  const { resetCacheStats } = await import('./explorium.cache.js');
  resetCacheStats();
  res.json({ success: true, message: 'Cache stats reset.' });
}));

export { router as exploriumRoutes };
