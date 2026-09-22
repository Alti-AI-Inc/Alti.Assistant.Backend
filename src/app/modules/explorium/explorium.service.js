import axios from 'axios';
import withRetry from '../../../shared/axiosRetry.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Explorium AgentSource v2 — Complete B2B Data Intelligence REST Client
 *
 * Base: https://api.explorium.ai
 * Auth: api_key header
 * MCP:  https://mcp.explorium.ai/mcp (hosted MCP server)
 *
 * ┌──────────────────────┬──────────────────────────────────────────────────────────┐
 * │ Service              │ Endpoint                                                 │
 * ├──────────────────────┼──────────────────────────────────────────────────────────┤
 * │ Business Match       │ POST /v2/businesses/match                                │
 * │ Business Enrich      │ POST /v2/businesses/enrich                               │
 * │ Business Search      │ POST /v2/businesses/search                               │
 * │ Business Research    │ POST /v2/businesses/research                             │
 * │ Business Lookup      │ GET  /v2/businesses/{business_id}                        │
 * │ Prospect Match       │ POST /v2/prospects/match                                 │
 * │ Prospect Enrich      │ POST /v2/prospects/enrich                                │
 * │ Prospect Search      │ POST /v2/prospects/search                                │
 * │ Prospect Lookup      │ GET  /v2/prospects/{prospect_id}                         │
 * │ Events / Signals     │ POST /v2/events                                          │
 * │ Autocomplete         │ POST /v2/autocomplete                                    │
 * │ Audience Stats       │ POST /v2/audience/stats                                  │
 * │ Jobs                 │ POST /v2/jobs, GET /v2/jobs/{job_id}                     │
 * │ Credits              │ GET  /v2/credits/balance                                 │
 * └──────────────────────┴──────────────────────────────────────────────────────────┘
 *
 * Bulk: All POST endpoints accept arrays of records (up to 50 per call)
 */

const API_KEY = config.explorium?.apiKey || process.env.EXPLORIUM_API_KEY || '';
const BASE_URL = 'https://api.explorium.ai';

const expApi = withRetry(axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: {
    'api_key': API_KEY,
    'Content-Type': 'application/json',
  },
}), 'explorium');

export const ExploriumService = {

  // ═══════════════════════════════════════════════════════════════════════
  // BUSINESSES — Match, Enrich, Search, Research
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * POST /v2/businesses/match — Resolve company name/domain → business_id
   * @param {Object|Object[]} input — { name, domain, url } or array of such
   */
  async matchBusinesses(input) {
    const records = Array.isArray(input) ? input : [input];
    const { data } = await expApi.post('/v2/businesses/match', { records });
    return data;
  },

  /**
   * POST /v2/businesses/enrich — Get firmographic, technographic, financial data
   * @param {Object|Object[]} input — { business_id } or { name, domain } or array
   * @param {string[]} [bundles] — data bundles to include
   */
  async enrichBusinesses(input, bundles) {
    const records = Array.isArray(input) ? input : [input];
    const body = { records };
    if (bundles) body.bundles = bundles;
    const { data } = await expApi.post('/v2/businesses/enrich', body);
    return data;
  },

  /**
   * POST /v2/businesses/search — Advanced filtered company discovery
   * @param {Object} filters — { industry, size, location, technologies, etc. }
   * @param {Object} [pagination] — { page, page_size }
   */
  async searchBusinesses(filters, pagination = {}) {
    const { data } = await expApi.post('/v2/businesses/search', { filters, ...pagination });
    return data;
  },

  /**
   * POST /v2/businesses/research — Deep AI-powered research on a company
   * @param {Object} input — { business_id, query }
   */
  async researchBusiness(input) {
    const { data } = await expApi.post('/v2/businesses/research', input);
    return data;
  },

  /**
   * GET /v2/businesses/{business_id} — Direct lookup by ID
   */
  async getBusiness(businessId) {
    const { data } = await expApi.get(`/v2/businesses/${businessId}`);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PROSPECTS — Match, Enrich, Search
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * POST /v2/prospects/match — Resolve contact to prospect_id
   * @param {Object|Object[]} input — { name, email, linkedin_url, company } or array
   */
  async matchProspects(input) {
    const records = Array.isArray(input) ? input : [input];
    const { data } = await expApi.post('/v2/prospects/match', { records });
    return data;
  },

  /**
   * POST /v2/prospects/enrich — Enhance lead data with professional history, contact info
   * @param {Object|Object[]} input — { prospect_id } or { email } or array
   * @param {string[]} [bundles]
   */
  async enrichProspects(input, bundles) {
    const records = Array.isArray(input) ? input : [input];
    const body = { records };
    if (bundles) body.bundles = bundles;
    const { data } = await expApi.post('/v2/prospects/enrich', body);
    return data;
  },

  /**
   * POST /v2/prospects/search — Find prospects matching filters
   * @param {Object} filters — { job_title, company, location, seniority, etc. }
   * @param {Object} [pagination] — { page, page_size }
   */
  async searchProspects(filters, pagination = {}) {
    const { data } = await expApi.post('/v2/prospects/search', { filters, ...pagination });
    return data;
  },

  /**
   * GET /v2/prospects/{prospect_id} — Direct lookup by ID
   */
  async getProspect(prospectId) {
    const { data } = await expApi.get(`/v2/prospects/${prospectId}`);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // EVENTS / SIGNALS — Real-time business signals
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * POST /v2/events — Track funding rounds, hiring, office changes, product launches
   * @param {Object} filters — { business_id, event_type, date_range, etc. }
   */
  async getEvents(filters) {
    const { data } = await expApi.post('/v2/events', filters);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AUTOCOMPLETE — Normalized value suggestions
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * POST /v2/autocomplete — Find normalized values for job titles, industries, locations
   * @param {Object} input — { field, query }
   */
  async autocomplete(input) {
    const { data } = await expApi.post('/v2/autocomplete', input);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AUDIENCE STATS — Aggregate counts before fetching
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * POST /v2/audience/stats — Get counts/distributions for a filter set
   * @param {Object} filters
   */
  async getAudienceStats(filters) {
    const { data } = await expApi.post('/v2/audience/stats', filters);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ASYNC JOBS — Long-running enrichment/research jobs
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * POST /v2/jobs — Create an async data job
   * @param {Object} jobSpec — { type, records, bundles, callback_url }
   */
  async createJob(jobSpec) {
    const { data } = await expApi.post('/v2/jobs', jobSpec);
    return data;
  },

  /**
   * GET /v2/jobs/{job_id} — Get job status and results
   */
  async getJobStatus(jobId) {
    const { data } = await expApi.get(`/v2/jobs/${jobId}`);
    return data;
  },

  /**
   * GET /v2/jobs — List all jobs
   */
  async listJobs(params = {}) {
    const { data } = await expApi.get('/v2/jobs', { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CREDITS — Account usage
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /v2/credits/balance — Check credit balance
   */
  async getCreditBalance() {
    const { data } = await expApi.get('/v2/credits/balance');
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // RAW PROXY
  // ═══════════════════════════════════════════════════════════════════════

  async rawPost(path, body = {}) {
    const { data } = await expApi.post(path, body);
    return data;
  },

  async rawGet(path, params = {}) {
    const { data } = await expApi.get(path, { params });
    return data;
  },
};

export default ExploriumService;
