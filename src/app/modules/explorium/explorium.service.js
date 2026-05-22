/**
 * explorium.service.js — Explorium AgentSource B2B Data API — Complete Integration
 *
 * 80M+ businesses across 150+ countries. 800M+ professional profiles.
 * Full Match → Fetch → Enrich → Events workflow.
 *
 * Base URL: https://api.explorium.ai
 * Auth:     API_KEY: <key>  (header name is "API_KEY", not "Authorization: Bearer")
 * Docs:     https://developers.explorium.ai/llms.txt
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * BUSINESSES — /v1/businesses
 *   POST /v1/businesses                      Fetch / search businesses
 *   POST /v1/businesses/statistics           Audience count (free pre-check)
 *   POST /v1/businesses/match                Domain / name → business_id
 *   POST /v1/businesses/autocomplete         Autocomplete field values
 *
 * BUSINESS ENRICHMENTS — /v1/businesses/:business_id/enrich/*
 *   firmographics            Revenue, size, industry, HQ, ticker, NAICS
 *   technographics           Full tech stack + categorized usage
 *   webstack                 Website tech fingerprint (CMS, CDN, ads, etc.)
 *   funding_and_acquisitions Funding rounds, investors, M&A history
 *   financial_metrics        Public company P&L, market cap, EPS
 *   company_ratings          Employee review scores (Glassdoor-like)
 *   company_social_media     LinkedIn/Twitter/FB/Instagram presence
 *   competitive_landscape    Public company competitors & market positioning
 *   strategic_insights       Executive strategy & operational focus
 *   business_challenges      Legal/regulatory risks (public companies)
 *   workforce_trends         Dept-level headcount changes (12-month view)
 *   website_traffic          Monthly visits, bounce rate, top channels
 *   website_content_changes  Delta tracking of company website copy
 *   keyword_search           Keyword presence on company website
 *   lookalike_companies      AI-similar companies via Ocean.IO
 *   company_hierarchy        Parent/subsidiary/branch tree
 *   business_intent_topics   Bombora intent signals with composite score
 *
 * BUSINESS BULK ENRICHMENTS — /v1/businesses/bulk (up to 50 per call)
 *   Same 16 types, batched
 *
 * BUSINESS EVENTS
 *   POST /v1/businesses/events               Fetch events for businesses
 *   POST /v1/businesses/enrollments          Add enrollment (webhooks)
 *   GET  /v1/businesses/enrollments          List enrollments
 *   PUT  /v1/businesses/enrollments          Update enrollment
 *   DELETE /v1/businesses/enrollments        Remove enrollment
 *
 * PROSPECTS — /v1/prospects
 *   POST /v1/prospects                       Fetch / search prospects
 *   POST /v1/prospects/statistics            Audience count
 *   POST /v1/prospects/match                 Email → prospect_id
 *   POST /v1/prospects/autocomplete          Autocomplete field values
 *
 * PROSPECT ENRICHMENTS
 *   professional_profile     Contact + workplace (email, phone, company info)
 *   contacts_information     Verified email addresses + phone numbers
 *   social_media             LinkedIn, Twitter, GitHub, personal sites
 *
 * PROSPECT BULK ENRICHMENTS — /v1/prospects/bulk (up to 50 per call)
 *
 * PROSPECT EVENTS
 *   employee_job_changes       Prospect changed role (same company)
 *   recently_changed_company   Prospect moved to new company
 *   employee_workplace_anniversary  Work anniversary milestone
 *
 * WEBHOOKS — /v1/webhooks
 *   POST   Add webhook
 *   GET    Get webhook
 *   PUT    Update webhook
 *   DELETE Delete webhook
 *   POST   /check  Test connectivity
 *
 * CREDITS — /v1/credits
 *   GET /v1/credits/summary      Active credits summary
 *   GET /v1/credits/consumption  Aggregated consumption history
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import dotenv from 'dotenv';
import { logger } from '../../../shared/logger.js';

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.explorium.ai';

const getApiKey = () =>
  (process.env.EXPLORIUM_API_KEY || '').replace(/^\uFEFF+/, '').trim();

// ─── Valid Enum Constants (from real OpenAPI spec) ────────────────────────────

export const BUSINESS_FILTERS = {
  COMPANY_SIZES: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'],
  REVENUE_RANGES: ['0-500K', '500K-1M', '1M-5M', '5M-10M', '10M-25M', '25M-75M', '75M-200M', '200M-500M', '500M-1B', '1B-10B', '10B-100B', '100B-1T', '1T-10T', '10T+'],
  COMPANY_AGES: ['0-3', '3-6', '6-10', '10-20', '20+'],
  LOCATION_COUNTS: ['0-1', '2-5', '6-20', '21-50', '51-100', '101-1000', '1001+'],
  FETCH_MODES: ['full', 'preview'],
};

export const PROSPECT_FILTERS = {
  JOB_LEVELS: ['manager', 'president', 'senior manager', 'owner', 'advisor', 'freelancer', 'junior', 'director', 'c-suite', 'board member', 'senior non-managerial', 'non-managerial', 'partner', 'vice president', 'founder', 'cxo', 'vp', 'senior', 'training'],
  JOB_DEPARTMENTS: ['retail', 'engineering', 'customer success', 'administration', 'education', 'security', 'healthcare', 'public service', 'partnerships', 'creative', 'strategy', 'real estate', 'procurement', 'IT', 'data', 'c-suite', 'manufacturing', 'support', 'logistics', 'product', 'sales', 'design', 'marketing', 'finance', 'R&D', 'trade', 'human resources', 'legal', 'operations', 'customer service', 'media'],
};

export const BUSINESS_ENRICHMENT_TYPES = [
  'firmographics',
  'technographics',
  'webstack',
  'funding_and_acquisitions',
  'financial_metrics',
  'company_ratings',
  'company_social_media',
  'competitive_landscape',
  'strategic_insights',
  'business_challenges',
  'workforce_trends',
  'website_traffic',
  'website_content_changes',
  'keyword_search',
  'lookalike_companies',
  'company_hierarchy',
  'business_intent_topics',
];

export const PROSPECT_ENRICHMENT_TYPES = [
  'professional_profile',
  'contacts_information',
  'social_media',
];

export const BUSINESS_EVENT_TYPES = [
  'company_award', 'new_product', 'employee_joined_company',
  'merger_and_acquisitions', 'lawsuits_and_legal_issues',
  'outages_and_security_breaches', 'closing_office', 'new_investment',
  'new_office', 'new_partnership', 'cost_cutting', 'new_funding_round',
  'award', 'ipo_announcement',
  'increase_in_customer_service_department', 'hiring_in_finance_department',
  'hiring_in_support_department', 'increase_in_engineering_department',
  'decrease_in_customer_service_department', 'hiring_in_operations_department',
  'hiring_in_creative_department', 'decrease_in_engineering_department',
  'hiring_in_sales_department', 'increase_in_operations_department',
  'hiring_in_trade_department', 'decrease_in_marketing_department',
  'increase_in_marketing_department', 'hiring_in_marketing_department',
  'hiring_in_health_department', 'hiring_in_education_department',
  'increase_in_all_departments', 'decrease_in_all_departments',
  'decrease_in_sales_department', 'decrease_in_operations_department',
  'hiring_in_professional_service_department', 'hiring_in_human_resources_department',
  'increase_in_sales_department', 'hiring_in_legal_department',
  'hiring_in_unknown_department', 'hiring_in_engineering_department',
];

export const PROSPECT_EVENT_TYPES = [
  'employee_job_changes',
  'recently_changed_company',
  'employee_workplace_anniversary',
];

// ─── Core HTTP helpers ────────────────────────────────────────────────────────

async function expRequest(method, path, { body, params } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('[Explorium] EXPLORIUM_API_KEY not configured.');
    return null;
  }

  let url = `${BASE_URL}${path}`;
  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    url += `?${qs.toString()}`;
  }

  const opts = {
    method,
    headers: {
      'API_KEY': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  logger.info(`[Explorium] ${method} ${path}`);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[Explorium] ${res.status} ${method} ${path}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

const expGet  = (path, params)  => expRequest('GET',    path, { params });
const expPost = (path, body)    => expRequest('POST',   path, { body });
const expPut  = (path, body)    => expRequest('PUT',    path, { body });
const expDel  = (path, body)    => expRequest('DELETE', path, { body });

// ═══════════════════════════════════════════════════════════════════════════════
// BUSINESSES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch / search businesses with full filter support.
 *
 * @param {Object} opts
 * @param {Object} opts.filters          - See BUSINESS_FILTERS for valid values
 *   @param {Object} opts.filters.country_code              { values: ['us','ca'] }
 *   @param {Object} opts.filters.region_country_code       { values: ['us-ca','us-ny'] }
 *   @param {Object} opts.filters.city_region_country       { values: ['San Francisco, CA, US'] }
 *   @param {Object} opts.filters.city_region               { values: ['New York--Jersey City--Newark, NY--NJ'] }
 *   @param {Object} opts.filters.company_size              { values: ['11-50','51-200'] }
 *   @param {Object} opts.filters.company_revenue           { values: ['10M-25M'] }
 *   @param {Object} opts.filters.company_age               { values: ['3-6','6-10'] }
 *   @param {Object} opts.filters.company_name              { values: ['Google','Apple'] }
 *   @param {Object} opts.filters.google_category           { values: ['Retail'] }
 *   @param {Object} opts.filters.naics_category            { values: ['541512'] }
 *   @param {Object} opts.filters.linkedin_category         { values: ['software development'] }
 *   @param {Object} opts.filters.company_tech_stack_category { values: ['CRM','Marketing'] }
 *   @param {Object} opts.filters.company_tech_stack_tech   { values: ['Salesforce','HubSpot'] }
 *   @param {Object} opts.filters.number_of_locations       { values: ['2-5','6-20'] }
 *   @param {Object} opts.filters.website_keywords          { values: ['machine learning'] }
 *   @param {Object} opts.filters.business_intent_topics    { topics: [...], topic_intent_level: 'high_intent' }
 *   @param {Object} opts.filters.events                    { values: [...eventTypes], last_occurrence: 45 }
 *   @param {Object} opts.filters.has_website               { values: [true] }
 *   @param {Object} opts.filters.is_public_company         { values: [true] }
 *   @param {Object} opts.filters.business_id               { values: ['abc123...'] }
 * @param {string} opts.mode             - 'full' | 'preview'
 * @param {number} opts.page             - 1-based page number
 * @param {number} opts.page_size        - Max 500
 * @param {number} opts.size             - Total max results (≤60,000)
 * @param {string[]} opts.exclude        - Business IDs to exclude (max 1,000)
 * @param {string} opts.next_cursor      - For cursor pagination
 */
export const fetchBusinessesService = async ({
  filters = {},
  mode = 'full',
  page = 1,
  page_size = 20,
  size = 1000,
  exclude = [],
  next_cursor = null,
} = {}) => {
  const body = { mode, page: Number(page), page_size: Number(page_size), size: Number(size), filters };
  if (exclude.length > 0) body.exclude = exclude;
  if (next_cursor !== null) body.next_cursor = next_cursor;
  return (await expPost('/v1/businesses', body)) || {};
};

/**
 * Audience count for business filters.
 * ALWAYS call this before fetching large datasets — it's free/cheap.
 *
 * @param {Object} filters - Same structure as fetchBusinessesService filters
 */
export const businessStatisticsService = async (filters = {}) => {
  return (await expPost('/v1/businesses/statistics', { filters })) || {};
};

/**
 * Match businesses by domain, name, or other identifiers to get business_ids.
 * Provide multiple identifiers for higher match accuracy.
 *
 * @param {Array<Object>} businesses - Array of match requests:
 *   [{ domain, name, country, tax_id, phone }]
 *   Returns same-length array with matched business_ids.
 */
export const matchBusinessesService = async (businesses) => {
  const items = Array.isArray(businesses) ? businesses : [businesses];
  return (await expPost('/v1/businesses/match', { businesses: items })) || {};
};

/**
 * Single business match convenience wrapper.
 * @param {string} domain
 * @param {string} name
 * @param {string} country
 */
export const matchBusinessService = async ({ domain, name, country } = {}) => {
  const result = await matchBusinessesService([{ domain, name, country }]);
  return Array.isArray(result?.results) ? (result.results[0] || {}) : result;
};

/**
 * Autocomplete business fields for UI filters.
 *
 * @param {string} field - e.g. 'country_code', 'company_size', 'linkedin_category',
 *   'naics_category', 'google_category', 'company_tech_stack_category',
 *   'company_tech_stack_tech', 'company_revenue', 'company_age',
 *   'number_of_locations', 'business_intent_topics', 'city_region_country'
 * @param {string} query - Partial text to search
 * @param {boolean} semantic_search - Use semantic expansion (for intent topics)
 */
export const businessAutocompleteService = async (field, query, semantic_search = false) => {
  const params = { field, query };
  if (semantic_search) params.semantic_search = 'true';
  return (await expGet('/v1/businesses/autocomplete', params))?.results || [];
};

// ─── Business Single Enrichments ─────────────────────────────────────────────

/**
 * Enrich a single business with one specific enrichment type.
 *
 * @param {string} businessId - Explorium business_id (32-char hex)
 * @param {string} enrichmentType - One of BUSINESS_ENRICHMENT_TYPES
 * @param {Object} parameters - Type-specific parameters (e.g., { keywords: ['AI'] })
 */
export const enrichBusinessSingleService = async (businessId, enrichmentType, parameters = {}) => {
  const pathMap = {
    firmographics:            `/v1/businesses/${businessId}/enrich/firmographics`,
    technographics:           `/v1/businesses/${businessId}/enrich/technographics`,
    webstack:                 `/v1/businesses/${businessId}/enrich/webstack`,
    funding_and_acquisitions: `/v1/businesses/${businessId}/enrich/funding_and_acquisitions`,
    financial_metrics:        `/v1/businesses/${businessId}/enrich/financial_metrics`,
    company_ratings:          `/v1/businesses/${businessId}/enrich/company_ratings`,
    company_social_media:     `/v1/businesses/${businessId}/enrich/company_social_media`,
    competitive_landscape:    `/v1/businesses/${businessId}/enrich/competitive_landscape`,
    strategic_insights:       `/v1/businesses/${businessId}/enrich/strategic_insights`,
    business_challenges:      `/v1/businesses/${businessId}/enrich/business_challenges`,
    workforce_trends:         `/v1/businesses/${businessId}/enrich/workforce_trends`,
    website_traffic:          `/v1/businesses/${businessId}/enrich/website_traffic`,
    website_content_changes:  `/v1/businesses/${businessId}/enrich/website_content_changes`,
    keyword_search:           `/v1/businesses/${businessId}/enrich/keyword_search`,
    lookalike_companies:      `/v1/businesses/${businessId}/enrich/lookalike_companies`,
    company_hierarchy:        `/v1/businesses/${businessId}/enrich/company_hierarchy`,
    business_intent_topics:   `/v1/businesses/${businessId}/enrich/business_intent_topics`,
  };

  const path = pathMap[enrichmentType];
  if (!path) throw new Error(`Unknown business enrichment type: ${enrichmentType}`);
  logger.info(`[Explorium] Enrich business ${businessId}: ${enrichmentType}`);
  return (await expPost(path, { business_id: businessId, parameters })) || {};
};

// ─── Business Bulk Enrichments ────────────────────────────────────────────────

/**
 * Bulk enrich businesses — up to 50 per call.
 *
 * @param {string[]} businessIds     - Array of business_ids (max 50)
 * @param {string} enrichmentType    - One of BUSINESS_ENRICHMENT_TYPES
 * @param {Object} parameters        - Type-specific parameters
 */
export const bulkEnrichBusinessesService = async (businessIds, enrichmentType, parameters = {}) => {
  const ids = Array.isArray(businessIds) ? businessIds.slice(0, 50) : [businessIds];
  logger.info(`[Explorium] Bulk enrich ${ids.length} businesses: ${enrichmentType}`);

  const bulkPathMap = {
    firmographics:            '/v1/businesses/bulk/enrich/firmographics',
    technographics:           '/v1/businesses/bulk/enrich/technographics',
    webstack:                 '/v1/businesses/bulk/enrich/webstack',
    funding_and_acquisitions: '/v1/businesses/bulk/enrich/funding_and_acquisitions',
    financial_metrics:        '/v1/businesses/bulk/enrich/financial_metrics',
    company_ratings:          '/v1/businesses/bulk/enrich/company_ratings',
    company_social_media:     '/v1/businesses/bulk/enrich/company_social_media',
    competitive_landscape:    '/v1/businesses/bulk/enrich/competitive_landscape',
    strategic_insights:       '/v1/businesses/bulk/enrich/strategic_insights',
    business_challenges:      '/v1/businesses/bulk/enrich/business_challenges',
    workforce_trends:         '/v1/businesses/bulk/enrich/workforce_trends',
    website_traffic:          '/v1/businesses/bulk/enrich/website_traffic',
    website_content_changes:  '/v1/businesses/bulk/enrich/website_content_changes',
    keyword_search:           '/v1/businesses/bulk/enrich/keyword_search',
    lookalike_companies:      '/v1/businesses/bulk/enrich/lookalike_companies',
    company_hierarchy:        '/v1/businesses/bulk/enrich/company_hierarchy',
    business_intent_topics:   '/v1/businesses/bulk/enrich/business_intent_topics',
  };

  const path = bulkPathMap[enrichmentType];
  if (!path) throw new Error(`Unknown business enrichment type for bulk: ${enrichmentType}`);
  return (await expPost(path, { business_ids: ids, parameters })) || {};
};

/**
 * Full company intelligence by domain — match + enrich all available types.
 * The gold-standard "tell me everything about this company" endpoint.
 *
 * @param {string} domain
 * @param {string[]} enrichmentTypes - Subset to fetch (default: all)
 */
export const getCompanyIntelligenceService = async (domain, enrichmentTypes = BUSINESS_ENRICHMENT_TYPES) => {
  logger.info(`[Explorium] Full company intelligence: ${domain}`);
  const match = await matchBusinessService({ domain });
  const businessId = match?.business_id;
  if (!businessId) {
    return { domain, matched: false, error: 'No match found', data: null };
  }

  // Fetch all requested enrichment types in parallel
  const enrichmentResults = await Promise.allSettled(
    enrichmentTypes.map((type) => enrichBusinessSingleService(businessId, type))
  );

  const data = {};
  enrichmentTypes.forEach((type, idx) => {
    if (enrichmentResults[idx].status === 'fulfilled') {
      data[type] = enrichmentResults[idx].value;
    } else {
      data[type] = { error: enrichmentResults[idx].reason?.message || 'Failed' };
    }
  });

  return { domain, business_id: businessId, matched: true, data };
};

// ─── Business Events ──────────────────────────────────────────────────────────

/**
 * Fetch real-time business events for given business_ids.
 * Events cover: funding rounds, hiring, new products, M&A, IPO, awards, etc.
 *
 * @param {string[]} businessIds
 * @param {string[]} eventTypes  - Subset of BUSINESS_EVENT_TYPES (default: all)
 * @param {number}   lastDays    - Lookback window in days (30–90)
 * @param {number}   page
 * @param {number}   page_size
 */
export const fetchBusinessEventsService = async (businessIds, eventTypes = [], lastDays = 30, page = 1, page_size = 20) => {
  const ids = Array.isArray(businessIds) ? businessIds : [businessIds];
  logger.info(`[Explorium] Fetch business events: ${ids.length} businesses`);
  return (await expPost('/v1/businesses/events', {
    business_ids: ids,
    event_types: eventTypes.length > 0 ? eventTypes : BUSINESS_EVENT_TYPES,
    last_occurrence: Math.min(Math.max(lastDays, 30), 90),
    page: Number(page),
    page_size: Number(page_size),
  })) || {};
};

/**
 * Add business event enrollments (to receive webhook notifications).
 * @param {string[]} businessIds
 * @param {string[]} eventTypes
 * @param {string} webhookUrl - Your endpoint to receive events
 * @param {string} partnerId  - Your unique identifier for this enrollment
 */
export const addBusinessEnrollmentsService = async (businessIds, eventTypes, webhookUrl, partnerId) => {
  return (await expPost('/v1/businesses/enrollments', {
    business_ids: Array.isArray(businessIds) ? businessIds : [businessIds],
    event_types: eventTypes,
    webhook_url: webhookUrl,
    partner_id: partnerId,
  })) || {};
};

export const getBusinessEnrollmentsService = async () => {
  return (await expGet('/v1/businesses/enrollments')) || {};
};

export const updateBusinessEnrollmentsService = async (partnerId, updates) => {
  return (await expPut('/v1/businesses/enrollments', { partner_id: partnerId, ...updates })) || {};
};

export const deleteBusinessEnrollmentsService = async (partnerId) => {
  return (await expDel('/v1/businesses/enrollments', { partner_id: partnerId })) || {};
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROSPECTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch / search prospects with full filter support.
 *
 * @param {Object} opts
 * @param {Object} opts.filters
 *   @param {Object} opts.filters.has_email                 { value: true }
 *   @param {Object} opts.filters.has_phone_number          { value: true }
 *   @param {Object} opts.filters.job_title                 { values: ['CTO'], include_related_job_titles: true }
 *   @param {Object} opts.filters.job_level                 { values: ['director','c-suite','vp'] }
 *   @param {Object} opts.filters.job_department            { values: ['engineering','product'] }
 *   @param {Object} opts.filters.business_id               { values: ['abc123...'] }
 *   @param {Object} opts.filters.country_code              { values: ['us','gb'] }  (prospect location)
 *   @param {Object} opts.filters.region_country_code       { values: ['us-ca'] }    (prospect region)
 *   @param {Object} opts.filters.city_region_country       { values: ['San Francisco, CA, US'] }
 *   @param {Object} opts.filters.company_country_code      { values: ['us'] }       (company HQ)
 *   @param {Object} opts.filters.company_region_country_code { values: ['us-tx'] }  (company HQ region)
 *   @param {Object} opts.filters.company_size              { values: ['201-500','501-1000'] }
 *   @param {Object} opts.filters.company_revenue           { values: ['25M-75M'] }
 *   @param {Object} opts.filters.company_age               { values: ['3-6'] }
 *   @param {Object} opts.filters.company_name              { values: ['Stripe'] }
 *   @param {Object} opts.filters.google_category           { values: ['Financial Services'] }
 *   @param {Object} opts.filters.naics_category            { values: ['52'] }
 *   @param {Object} opts.filters.linkedin_category         { values: ['fintech'] }
 *   @param {Object} opts.filters.total_experience_months   { gte: 60 }    (5+ years experience)
 *   @param {Object} opts.filters.current_role_months       { gte: 12 }    (1+ year in role)
 *   @param {Object} opts.filters.prospect_id               { values: ['...'] }
 *   @param {Object} opts.filters.has_website               { values: [true] }
 *   @param {Object} opts.filters.is_public_company         { values: [false] }
 *   @param {Object} opts.filters.company_number_of_locations { values: ['2-5'] }
 * @param {string} opts.mode       - 'full'
 * @param {number} opts.page
 * @param {number} opts.page_size  - Max 100
 * @param {number} opts.size       - Total max (≤60,000)
 * @param {string[]} opts.exclude  - Prospect IDs to exclude
 */
export const fetchProspectsService = async ({
  filters = {},
  mode = 'full',
  page = 1,
  page_size = 20,
  size = 1000,
  exclude = [],
} = {}) => {
  const body = { mode, page: Number(page), page_size: Number(page_size), size: Number(size), filters };
  if (exclude.length > 0) body.exclude = exclude;
  return (await expPost('/v1/prospects', body)) || {};
};

/**
 * Audience count for prospect filters.
 * @param {Object} filters
 */
export const prospectStatisticsService = async (filters = {}) => {
  return (await expPost('/v1/prospects/statistics', { filters })) || {};
};

/**
 * Match prospects by email to get prospect_ids.
 * Accepts a batch of prospects.
 *
 * @param {Array<Object>} prospects - [{ email, first_name?, last_name?, company? }]
 */
export const matchProspectsService = async (prospects) => {
  const items = Array.isArray(prospects) ? prospects : [prospects];
  return (await expPost('/v1/prospects/match', { prospects: items })) || {};
};

/**
 * Single prospect match convenience wrapper.
 * @param {string} email
 */
export const matchProspectService = async (email) => {
  const result = await matchProspectsService([{ email }]);
  return Array.isArray(result?.results) ? (result.results[0] || {}) : result;
};

/**
 * Autocomplete prospect field values.
 *
 * @param {string} field - e.g. 'job_level', 'job_department', 'job_title',
 *   'country_code', 'company_size', 'company_revenue', 'linkedin_category',
 *   'naics_category', 'google_category'
 * @param {string} query
 */
export const prospectAutocompleteService = async (field, query) => {
  return (await expGet('/v1/prospects/autocomplete', { field, query }))?.results || [];
};

// ─── Prospect Single Enrichments ──────────────────────────────────────────────

/**
 * Enrich a single prospect with a specific enrichment type.
 *
 * @param {string} prospectId
 * @param {string} enrichmentType - 'professional_profile' | 'contacts_information' | 'social_media'
 */
export const enrichProspectSingleService = async (prospectId, enrichmentType) => {
  const pathMap = {
    professional_profile: `/v1/prospects/${prospectId}/enrich/professional_profile`,
    contacts_information:  `/v1/prospects/${prospectId}/enrich/contacts_information`,
    social_media:          `/v1/prospects/${prospectId}/enrich/social_media`,
  };
  const path = pathMap[enrichmentType];
  if (!path) throw new Error(`Unknown prospect enrichment type: ${enrichmentType}`);
  logger.info(`[Explorium] Enrich prospect ${prospectId}: ${enrichmentType}`);
  return (await expPost(path, { prospect_id: prospectId })) || {};
};

// ─── Prospect Bulk Enrichments ────────────────────────────────────────────────

/**
 * Bulk enrich prospects — up to 50 per call.
 *
 * @param {string[]} prospectIds
 * @param {string} enrichmentType - 'professional_profile' | 'contacts_information' | 'social_media'
 */
export const bulkEnrichProspectsService = async (prospectIds, enrichmentType) => {
  const ids = Array.isArray(prospectIds) ? prospectIds.slice(0, 50) : [prospectIds];
  logger.info(`[Explorium] Bulk enrich ${ids.length} prospects: ${enrichmentType}`);

  const bulkPathMap = {
    professional_profile: '/v1/prospects/bulk/enrich/professional_profile',
    contacts_information:  '/v1/prospects/bulk/enrich/contacts_information',
    social_media:          '/v1/prospects/bulk/enrich/social_media',
  };
  const path = bulkPathMap[enrichmentType];
  if (!path) throw new Error(`Unknown prospect enrichment type for bulk: ${enrichmentType}`);
  return (await expPost(path, { prospect_ids: ids })) || {};
};

/**
 * Full prospect intelligence by email — match + all enrichments.
 * @param {string} email
 */
export const getProspectIntelligenceService = async (email) => {
  logger.info(`[Explorium] Full prospect intelligence: ${email}`);
  const match = await matchProspectService(email);
  const prospectId = match?.prospect_id;
  if (!prospectId) {
    return { email, matched: false, error: 'No match found', data: null };
  }

  const [profile, contacts, social] = await Promise.allSettled([
    enrichProspectSingleService(prospectId, 'professional_profile'),
    enrichProspectSingleService(prospectId, 'contacts_information'),
    enrichProspectSingleService(prospectId, 'social_media'),
  ]);

  return {
    email,
    prospect_id: prospectId,
    matched: true,
    data: {
      professional_profile: profile.status === 'fulfilled' ? profile.value : { error: profile.reason?.message },
      contacts_information:  contacts.status === 'fulfilled' ? contacts.value : { error: contacts.reason?.message },
      social_media:          social.status === 'fulfilled' ? social.value : { error: social.reason?.message },
    },
  };
};

// ─── Prospect Events ──────────────────────────────────────────────────────────

/**
 * Fetch prospect events (job changes, company changes, anniversaries).
 *
 * @param {string[]} prospectIds
 * @param {string[]} eventTypes  - Subset of PROSPECT_EVENT_TYPES
 * @param {number}   lastDays    - 30–90
 * @param {number}   page
 * @param {number}   page_size
 */
export const fetchProspectEventsService = async (prospectIds, eventTypes = [], lastDays = 30, page = 1, page_size = 20) => {
  const ids = Array.isArray(prospectIds) ? prospectIds : [prospectIds];
  logger.info(`[Explorium] Fetch prospect events: ${ids.length} prospects`);
  return (await expPost('/v1/prospects/events', {
    prospect_ids: ids,
    event_types: eventTypes.length > 0 ? eventTypes : PROSPECT_EVENT_TYPES,
    last_occurrence: Math.min(Math.max(lastDays, 30), 90),
    page: Number(page),
    page_size: Number(page_size),
  })) || {};
};

export const addProspectEnrollmentsService = async (prospectIds, eventTypes, webhookUrl, partnerId) => {
  return (await expPost('/v1/prospects/enrollments', {
    prospect_ids: Array.isArray(prospectIds) ? prospectIds : [prospectIds],
    event_types: eventTypes,
    webhook_url: webhookUrl,
    partner_id: partnerId,
  })) || {};
};

export const getProspectEnrollmentsService = async () => {
  return (await expGet('/v1/prospects/enrollments')) || {};
};

export const updateProspectEnrollmentsService = async (partnerId, updates) => {
  return (await expPut('/v1/prospects/enrollments', { partner_id: partnerId, ...updates })) || {};
};

export const deleteProspectEnrollmentsService = async (partnerId) => {
  return (await expDel('/v1/prospects/enrollments', { partner_id: partnerId })) || {};
};

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register a webhook endpoint to receive real-time event notifications.
 * @param {string} url       - Your HTTPS endpoint
 * @param {string} partnerId - Your unique identifier
 * @param {string[]} eventTypes
 * @param {string} secret    - Optional HMAC signing secret
 */
export const addWebhookService = async (url, partnerId, eventTypes = [], secret = null) => {
  const body = { url, partner_id: partnerId };
  if (eventTypes.length > 0) body.event_types = eventTypes;
  if (secret) body.secret = secret;
  return (await expPost('/v1/webhooks', body)) || {};
};

export const getWebhookService = async (partnerId) => {
  return (await expGet('/v1/webhooks', { partner_id: partnerId })) || {};
};

export const updateWebhookService = async (partnerId, updates) => {
  return (await expPut('/v1/webhooks', { partner_id: partnerId, ...updates })) || {};
};

export const deleteWebhookService = async (partnerId) => {
  return (await expDel('/v1/webhooks', { partner_id: partnerId })) || {};
};

/**
 * Test webhook connectivity — sends a ping to verify the endpoint is reachable.
 * @param {string} url
 */
export const checkWebhookConnectivityService = async (url) => {
  return (await expPost('/v1/webhooks/check', { url })) || {};
};

// ═══════════════════════════════════════════════════════════════════════════════
// CREDITS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get active credits summary (balance, plan, expiry). */
export const getCreditsSummaryService = async () => {
  return (await expGet('/v1/credits/summary')) || {};
};

/**
 * Get credit consumption history.
 * @param {string} from         - ISO date string (e.g. '2025-01-01')
 * @param {string} to           - ISO date string (e.g. '2025-12-31')
 * @param {string} resolution   - 'day' | 'week' | 'month'
 */
export const getCreditConsumptionService = async (from, to, resolution = 'day') => {
  return (await expGet('/v1/credits/consumption', { from, to, resolution })) || {};
};

// ═══════════════════════════════════════════════════════════════════════════════
// HIGH-LEVEL INTELLIGENCE WORKFLOWS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TAM (Total Addressable Market) analysis.
 * Counts businesses and prospects for a given ICP without consuming enrichment credits.
 *
 * @param {Object} businessFilters
 * @param {Object} prospectFilters
 */
export const getTAMAnalysisService = async (businessFilters = {}, prospectFilters = {}) => {
  logger.info('[Explorium] TAM Analysis');
  const [bizStats, prospectStats] = await Promise.allSettled([
    businessStatisticsService(businessFilters),
    Object.keys(prospectFilters).length > 0
      ? prospectStatisticsService(prospectFilters)
      : Promise.resolve(null),
  ]);

  return {
    timestamp: new Date().toISOString(),
    businesses: {
      filters: businessFilters,
      count: bizStats.value?.count ?? bizStats.value?.total_results ?? 0,
      status: bizStats.status,
    },
    prospects: {
      filters: prospectFilters,
      count: prospectStats.value?.count ?? prospectStats.value?.total_results ?? null,
      status: prospectStats.status,
    },
  };
};

/**
 * Find decision-makers at a company by domain.
 * Domain → business_id → fetch high-level contacts.
 *
 * @param {string} domain
 * @param {string[]} jobLevels      - e.g. ['c-suite','vp','director']
 * @param {string[]} departments    - e.g. ['engineering','product']
 * @param {boolean} requireEmail    - Only return prospects with verified email
 * @param {boolean} requirePhone    - Only return prospects with phone
 * @param {number} limit
 */
export const getDecisionMakersService = async (
  domain,
  jobLevels = ['c-suite', 'vp', 'director'],
  departments = [],
  requireEmail = true,
  requirePhone = false,
  limit = 10
) => {
  logger.info(`[Explorium] Decision makers: ${domain}`);
  const match = await matchBusinessService({ domain });
  const businessId = match?.business_id;
  if (!businessId) return { domain, matched: false, prospects: [] };

  const filters = {
    business_id: { values: [businessId] },
    job_level: { values: jobLevels },
  };
  if (departments.length > 0) filters.job_department = { values: departments };
  if (requireEmail) filters.has_email = { value: true };
  if (requirePhone) filters.has_phone_number = { value: true };

  const result = await fetchProspectsService({ filters, size: limit, page_size: limit });
  return {
    domain,
    business_id: businessId,
    total: result?.total_results || 0,
    prospects: result?.data || [],
  };
};

/**
 * Intent-based account discovery.
 * Finds companies actively researching specific topics (Bombora intent data).
 *
 * @param {string[]} intentTopics  - Bombora topic strings e.g. ['Security:Cloud Security']
 * @param {string} intentLevel     - 'high_intent' | 'medium_intent'
 * @param {Object} additionalFilters - Other business filters to combine
 * @param {number} page_size
 */
export const getIntentSignalsService = async (
  intentTopics,
  intentLevel = 'high_intent',
  additionalFilters = {},
  page_size = 50
) => {
  logger.info(`[Explorium] Intent signals: ${intentTopics.join(', ')}`);
  const filters = {
    ...additionalFilters,
    business_intent_topics: {
      topics: intentTopics,
      topic_intent_level: intentLevel,
    },
  };

  // First get count
  const stats = await businessStatisticsService(filters);
  const count = stats?.count ?? 0;

  // Then fetch
  const results = await fetchBusinessesService({ filters, mode: 'full', page_size });
  return {
    intent_topics: intentTopics,
    intent_level: intentLevel,
    total_accounts: count,
    data: results?.data || [],
    timestamp: new Date().toISOString(),
  };
};

/**
 * Competitive intelligence for a public company.
 * Returns: competitive landscape, strategic insights, business challenges,
 * financial metrics, funding history in one call.
 *
 * @param {string} domain
 */
export const getCompetitiveIntelligenceService = async (domain) => {
  logger.info(`[Explorium] Competitive intelligence: ${domain}`);
  return getCompanyIntelligenceService(domain, [
    'firmographics',
    'competitive_landscape',
    'strategic_insights',
    'business_challenges',
    'financial_metrics',
    'funding_and_acquisitions',
    'workforce_trends',
  ]);
};

/**
 * Sales intelligence for a prospect by email.
 * Returns: full profile, verified contacts, social presence.
 * @param {string} email
 */
export const getSalesIntelligenceService = async (email) => {
  return getProspectIntelligenceService(email);
};

/**
 * Website intelligence (monitoring) for a company.
 * Returns: website traffic, content changes, keyword presence, tech stack.
 *
 * @param {string} domain
 * @param {string[]} keywords - Keywords to check for on the website
 */
export const getWebsiteIntelligenceService = async (domain, keywords = []) => {
  logger.info(`[Explorium] Website intelligence: ${domain}`);
  const match = await matchBusinessService({ domain });
  const businessId = match?.business_id;
  if (!businessId) return { domain, matched: false, data: null };

  const enrichmentTypes = ['website_traffic', 'website_content_changes', 'technographics', 'webstack'];

  const [traffic, changes, tech, webstack] = await Promise.allSettled([
    enrichBusinessSingleService(businessId, 'website_traffic'),
    enrichBusinessSingleService(businessId, 'website_content_changes'),
    enrichBusinessSingleService(businessId, 'technographics'),
    enrichBusinessSingleService(businessId, 'webstack'),
  ]);

  let keywordResult = null;
  if (keywords.length > 0) {
    keywordResult = await enrichBusinessSingleService(businessId, 'keyword_search', { keywords }).catch(() => null);
  }

  return {
    domain,
    business_id: businessId,
    matched: true,
    data: {
      website_traffic:         traffic.status === 'fulfilled' ? traffic.value : null,
      website_content_changes: changes.status === 'fulfilled' ? changes.value : null,
      technographics:          tech.status === 'fulfilled' ? tech.value : null,
      webstack:                webstack.status === 'fulfilled' ? webstack.value : null,
      keyword_search:          keywordResult,
    },
  };
};

/**
 * Funding radar — finds companies with recent funding rounds.
 * Combines event filtering + firmographic enrichment.
 *
 * @param {Object} filters    - Additional filters (size, industry, etc.)
 * @param {number} lastDays   - Lookback window (30–90)
 * @param {number} page_size
 */
export const getFundingRadarService = async (filters = {}, lastDays = 30, page_size = 50) => {
  logger.info(`[Explorium] Funding radar: last ${lastDays} days`);
  const fundingFilters = {
    ...filters,
    events: {
      values: ['new_funding_round', 'new_investment', 'ipo_announcement'],
      last_occurrence: Math.min(Math.max(lastDays, 30), 90),
    },
  };

  const stats = await businessStatisticsService(fundingFilters);
  const results = await fetchBusinessesService({ filters: fundingFilters, page_size, size: page_size });
  return {
    total_accounts: stats?.count ?? 0,
    last_days: lastDays,
    data: results?.data || [],
  };
};

/**
 * Hiring signals — find companies actively hiring in specific departments.
 *
 * @param {string[]} departments  - e.g. ['engineering', 'sales']
 * @param {Object} filters        - Additional company filters
 * @param {number} lastDays
 * @param {number} page_size
 */
export const getHiringSignalsService = async (departments = [], filters = {}, lastDays = 30, page_size = 50) => {
  logger.info(`[Explorium] Hiring signals: ${departments.join(', ')}`);
  const eventTypes = departments.length > 0
    ? departments.map((d) => `hiring_in_${d.toLowerCase().replace(/\s+/g, '_')}_department`)
    : ['hiring_in_engineering_department', 'hiring_in_sales_department', 'hiring_in_marketing_department', 'increase_in_all_departments'];

  const hiringFilters = {
    ...filters,
    events: {
      values: eventTypes,
      last_occurrence: Math.min(Math.max(lastDays, 30), 90),
    },
  };

  const results = await fetchBusinessesService({ filters: hiringFilters, page_size, size: page_size });
  return {
    departments,
    last_days: lastDays,
    data: results?.data || [],
    total: results?.total_results || 0,
  };
};

/**
 * Lookalike prospecting — find companies similar to a seed domain.
 * Uses Ocean.IO AI similarity.
 *
 * @param {string} seedDomain - The reference company domain
 * @param {Object} filters    - Additional filters to narrow lookalikes
 */
export const getLookalikeCompaniesService = async (seedDomain, filters = {}) => {
  logger.info(`[Explorium] Lookalike companies for: ${seedDomain}`);
  const match = await matchBusinessService({ domain: seedDomain });
  const businessId = match?.business_id;
  if (!businessId) return { seed_domain: seedDomain, matched: false, lookalikes: [] };

  const lookalike = await enrichBusinessSingleService(businessId, 'lookalike_companies');
  const lookalikeDomains = lookalike?.results?.map((c) => c.domain).filter(Boolean) || [];

  // If we have additional filters, search by those lookalike domains
  let enrichedLookalikes = lookalike?.results || [];
  if (Object.keys(filters).length > 0 && lookalikeDomains.length > 0) {
    const lookalikeBizIds = lookalike?.results?.map((c) => c.business_id).filter(Boolean) || [];
    if (lookalikeBizIds.length > 0) {
      const refined = await fetchBusinessesService({
        filters: { ...filters, business_id: { values: lookalikeBizIds } },
        page_size: 50,
      });
      enrichedLookalikes = refined?.data || enrichedLookalikes;
    }
  }

  return {
    seed_domain: seedDomain,
    seed_business_id: businessId,
    matched: true,
    lookalike_count: enrichedLookalikes.length,
    lookalikes: enrichedLookalikes,
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// NAMED EXPORT OBJECT (for routes to import cleanly)
// ═══════════════════════════════════════════════════════════════════════════════

export const exploriumService = {
  // Enum constants
  BUSINESS_FILTERS,
  PROSPECT_FILTERS,
  BUSINESS_ENRICHMENT_TYPES,
  PROSPECT_ENRICHMENT_TYPES,
  BUSINESS_EVENT_TYPES,
  PROSPECT_EVENT_TYPES,

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
};
