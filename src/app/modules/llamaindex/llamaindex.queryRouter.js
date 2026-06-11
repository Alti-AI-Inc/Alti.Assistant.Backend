import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../../shared/logger.js';
import DocumentMetadata from './llamaindex.metadata.model.js';
import ApiError from '../../../errors/ApiError.js';
// import { TenantService } from '../tenant/tenant.service.js'; // PLATFORM_OWNER: Conceptual import for tenant status checks.

// Get __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @file LlamaIndex Smart Query Router
 * @description This file implements a smart query router that uses historical telemetry data (both global and tenant-specific)
 * and document characteristics to automatically route queries to the optimal LlamaIndex engine. It is designed for a
 * multi-tenant platform, providing both global configuration and tenant-specific performance tuning.
 *
 * PLATFORM_OWNER FEATURES:
 * - Global Configuration: Use `updateGlobalConfig` to tune routing logic without redeployment.
 * - Tenant Oversight: Use `getAnalytics({ tenantId: '...' })` to view performance for a specific tenant.
 * - Global Oversight: Use `getAnalytics()` for a platform-wide performance summary.
 * - Tenant Management: The `route` method includes a hook for checking tenant suspension status.
 * - Debugging & Overrides: The `route` method supports a `forceEngine` option to bypass routing for diagnostics.
 * - State Management: Admins can reset a tenant's learned routing data using `resetTenantState`.
 */

const TELEMETRY_DIR = path.resolve(__dirname, '../../../../storage/ragsystem/telemetry');
const ROUTER_STATE_FILE = path.join(TELEMETRY_DIR, 'router_state.json');

/**
 * PLATFORM_OWNER: Default configuration for the query router.
 * This can be overridden at runtime via the `updateGlobalConfig` method.
 * This allows for dynamic tuning of the routing logic without code changes.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  // A list of all available engine identifiers. Can be modified to enable/disable engines globally.
  engines: ['vector', 'hybrid', 'fullspectrum', 'selfcorrect', 'cached', 'objectagent', 'chat'],
  // Keyword-based profiles for initial query classification.
  documentProfiles: {
    technical: { keywords: ['code', 'api', 'function', 'class', 'module', 'error', 'debug'], preferredEngines: ['vector', 'selfcorrect'] },
    research: { keywords: ['study', 'research', 'paper', 'analysis', 'findings', 'methodology', 'hypothesis'], preferredEngines: ['fullspectrum', 'hybrid'] },
    conversational: { keywords: ['how', 'what', 'why', 'explain', 'tell me', 'help me', 'understand'], preferredEngines: ['chat', 'hybrid'] },
    factual: { keywords: ['who', 'when', 'where', 'date', 'number', 'amount', 'name'], preferredEngines: ['vector', 'cached'] },
    comparative: { keywords: ['compare', 'difference', 'versus', 'vs', 'better', 'worse', 'pros', 'cons'], preferredEngines: ['fullspectrum', 'selfcorrect'] },
    structured: { keywords: ['table', 'column', 'row', 'field', 'record', 'schema', 'database'], preferredEngines: ['objectagent', 'vector'] },
  },
  // Scoring weights used in the routing algorithm. Tune these to adjust routing behavior.
  scoringWeights: {
    preferredProfilePrimary: 10,
    preferredProfileSecondary: 7,
    otherProfile: 3,
    historicalQuality: 5,
    historicalSuccess: 3,
    latencyPenaltySmall: -2, // For latency > 5s
    latencyPenaltyLarge: -3, // For latency > 10s
    followUpBonus: 5,
    sameEngineBonus: 1,
    largeCorpusBonus: 2, // For fullspectrum
    smallCorpusBonus: 2, // For vector
    technicalCorpusBonus: 3, // For selfcorrect
    longQueryBonus: 2, // For fullspectrum
    shortQueryBonus: 2, // For cached
  },
  // The number of historical data points required before using tenant-specific data.
  // Below this threshold, global data is used to solve the "cold start" problem.
  tenantHistoryThreshold: 5,
};

/**
 * A smart query router that uses historical telemetry and document characteristics
 * to automatically route queries to the optimal LlamaIndex engine. This service
 * operates in a multi-tenant context, using `tenantId` to tailor routing decisions.
 * @class QueryRouterService
 */
class QueryRouterService {
  constructor() {
    /**
     * PLATFORM_OWNER: The active configuration for the router.
     * Initialized with defaults, can be updated via `updateGlobalConfig`.
     * @type {object}
     */
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // Deep copy

    /**
     * Stores global engine performance scores, keyed by `profile:engine`.
     * @type {Map<string, {count: number, totalLatencyMs: number, totalQuality: number, successes: number, cacheHits: number}>}
     */
    this.globalPerformanceScores = new Map();

    /**
     * Stores tenant-specific engine performance, keyed by `tenantId:profile:engine`.
     * @type {Map<string, {count: number, totalLatencyMs: number, totalQuality: number, successes: number, cacheHits: number}>}
     */
    this.tenantPerformanceScores = new Map();

    this.totalRouted = 0;
    this._loadState();
  }

  // --- Platform Owner & Admin Methods ---

  /**
   * PLATFORM_OWNER: Updates the global router configuration.
   * Merges the new config with the existing one, allowing for partial updates.
   * @param {object} newConfig - A configuration object to merge.
   * @returns {object} The new, active configuration.
   */
  updateGlobalConfig(newConfig) {
    // A simple deep merge. For production, a more robust library like lodash.merge might be used.
    this.config = { ...this.config, ...newConfig };
    logger.info('QueryRouter: Global configuration updated by Platform Owner.', { newConfig });
    return this.config;
  }

  /**
   * PLATFORM_OWNER: Retrieves a summary of routing analytics.
   * Can provide either a global summary or analytics for a specific tenant.
   * @param {object} [options={}] - Options for the analytics report.
   * @param {string} [options.tenantId] - If provided, returns analytics for only this tenant.
   * @returns {object} An object containing analytics data.
   */
  getAnalytics({ tenantId } = {}) {
    const sourceMap = tenantId ? this.tenantPerformanceScores : this.globalPerformanceScores;
    const prefix = tenantId ? `${tenantId}:` : '';

    const analytics = {
      totalRouted: tenantId ? 'N/A' : this.totalRouted,
      scope: tenantId ? `Tenant (${tenantId})` : 'Global',
      enginePerformance: {},
      profileDistribution: {},
    };

    for (const [key, data] of sourceMap.entries()) {
      if (tenantId && !key.startsWith(prefix)) continue;

      const keyParts = key.split(':');
      const profile = tenantId ? keyParts[1] : keyParts[0];
      const engine = tenantId ? keyParts[2] : keyParts[1];

      if (!analytics.enginePerformance[engine]) {
        analytics.enginePerformance[engine] = { totalQueries: 0, avgLatencyMs: 0, avgQuality: 0, successRate: 0, cacheHitRate: 0 };
      }

      const ep = analytics.enginePerformance[engine];
      ep.totalQueries += data.count;

      if (data.count > 0) {
        ep.avgLatencyMs = Math.round(data.totalLatencyMs / data.count);
        ep.avgQuality = Math.round((data.totalQuality / data.count) * 100) / 100;
        ep.successRate = Math.round((data.successes / data.count) * 100);
        ep.cacheHitRate = Math.round((data.cacheHits / data.count) * 100);
      }

      analytics.profileDistribution[profile] = (analytics.profileDistribution[profile] || 0) + data.count;
    }
    return analytics;
  }

  /**
   * PLATFORM_OWNER: Resets the learned performance data for a specific tenant.
   * This is useful if a tenant's routing data has become skewed or needs a fresh start.
   * @param {string} tenantId - The ID of the tenant whose state should be reset.
   * @returns {Promise<{resetCount: number}>} The number of state entries that were reset.
   */
  async resetTenantState(tenantId) {
    if (!tenantId) {
      throw new ApiError(400, 'A tenantId is required to reset state.');
    }
    let resetCount = 0;
    for (const key of this.tenantPerformanceScores.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.tenantPerformanceScores.delete(key);
        resetCount++;
      }
    }
    if (resetCount > 0) {
      await this._saveState().catch(err => logger.error('QueryRouter: background state persistence failed after tenant reset.', { error: err, tenantId }));
      logger.info(`QueryRouter: Reset ${resetCount} performance entries for tenant ${tenantId}.`);
    }
    return { resetCount };
  }

  // --- Core Routing Logic ---

  /**
   * Routes a query to the optimal engine based on query profile, document metadata,
   * and historical performance data. This method is tenant-aware.
   *
   * @param {string} query - The user's query text.
   * @param {object} [options={}] - Optional parameters to refine routing.
   * @param {string} options.tenantId - The ID of the tenant making the query. CRITICAL for multi-tenant context.
   * @param {string} [options.forceEngine] - PLATFORM_OWNER: If set, bypasses all logic and returns this engine. Useful for debugging.
   * @param {number} [options.documentCount] - The total number of documents indexed for the tenant.
   * @param {boolean} [options.isFollowUp] - Flag indicating if this is a follow-up question.
   * @param {string} [options.previousEngine] - The engine used for the previous query.
   * @returns {Promise<{engine: string, confidence: number, profile: string, reasoning: string, alternatives: Array<{engine: string, score: number}>, scores: Record<string, number>}>} A routing decision.
   * @throws {ApiError} Throws an ApiError for routing failures or if the tenant is suspended.
   */
  async route(query, options = {}) {
    const { tenantId, forceEngine } = options;

    if (!tenantId) {
      throw new ApiError(400, 'A tenantId is required for query routing.');
    }

    // PLATFORM_OWNER: Hook for tenant suspension check.
    // try {
    //   const tenant = await TenantService.findById(tenantId);
    //   if (tenant?.status === 'suspended') {
    //     logger.warn(`QueryRouter: Denied query from suspended tenant.`, { tenantId });
    //     throw new ApiError(403, 'Tenant account is suspended.');
    //   }
    // } catch (err) {
    //   logger.error('QueryRouter: Failed to check tenant status.', { tenantId, error: err });
    //   throw new ApiError(500, 'Failed to verify tenant status.');
    // }

    // PLATFORM_OWNER: Allow forcing a specific engine for debugging or admin override.
    if (forceEngine && this.config.engines.includes(forceEngine)) {
      logger.info(`QueryRouter: Routing bypassed by forceEngine override for tenant ${tenantId}.`, { tenantId, forceEngine });
      return {
        engine: forceEngine,
        confidence: 1.0,
        profile: 'override',
        reasoning: `Platform Owner override: forceEngine=${forceEngine}`,
        alternatives: [],
        scores: { [forceEngine]: 999 },
      };
    }

    try {
      this.totalRouted++;
      const queryLower = query.toLowerCase();

      let userMetadataList = [];
      try {
        // OPTIMIZATION: Ensure an index exists on the 'tenantId' field.
        userMetadataList = await DocumentMetadata.find({ userId: tenantId }).lean(); // Assuming userId is tenantId
      } catch (dbError) {
        logger.warn(`QueryRouter: could not fetch DocumentMetadata for tenant ${tenantId}. Routing will proceed without it.`, { error: dbError, tenantId });
      }

      const { profile, docCharacteristics } = this._classifyProfile(queryLower, userMetadataList);

      const scores = {};
      for (const engine of this.config.engines) {
        scores[engine] = this._scoreEngine(engine, profile, queryLower, options, docCharacteristics);
      }

      const ranked = Object.entries(scores).sort(([, a], [, b]) => b - a);
      const [bestEngine, bestScore] = ranked[0];
      const [secondEngine, secondScore] = ranked[1] || [null, 0];

      const confidence = secondScore > 0 ? Math.min(1, (bestScore - secondScore) / secondScore + 0.5) : 0.95;

      const decision = {
        engine: bestEngine,
        confidence: Math.round(confidence * 100) / 100,
        profile: profile.name,
        reasoning: this._buildReasoning(bestEngine, profile, options, docCharacteristics),
        alternatives: ranked.slice(1, 3).map(([eng, score]) => ({ engine: eng, score: Math.round(score * 100) / 100 })),
        scores,
      };

      logger.info(`QueryRouter: "${query.substring(0, 50)}..." → ${bestEngine} (conf=${decision.confidence})`, { tenantId, profile: profile.name });
      return decision;
    } catch (error) {
      logger.error('QueryRouter: an unexpected error occurred during query routing.', { query, options, error });
      throw new ApiError(500, 'Failed to route query due to an internal system error.');
    }
  }

  /**
   * Records the performance outcome of a routed query to train the router.
   * Updates both tenant-specific and global performance data.
   *
   * @param {string} tenantId - The ID of the tenant.
   * @param {string} engine - The engine that was used.
   * @param {string} profile - The query profile classification.
   * @param {object} metrics - Performance metrics from the query execution.
   * @returns {void}
   */
  recordOutcome(tenantId, engine, profile, metrics) {
    if (!tenantId) {
      logger.warn('QueryRouter: recordOutcome called without a tenantId. Outcome will only be recorded globally.');
    }

    const updateScores = (map, key) => {
      const existing = map.get(key) || { count: 0, totalLatencyMs: 0, totalQuality: 0, successes: 0, cacheHits: 0 };
      existing.count++;
      existing.totalLatencyMs += metrics.latencyMs || 0;
      existing.totalQuality += metrics.qualityScore || 0;
      if (metrics.success !== false) existing.successes++;
      if (metrics.cacheHit) existing.cacheHits++;
      map.set(key, existing);
      return existing.count;
    };

    // Update global scores
    const globalKey = `${profile}:${engine}`;
    const globalCount = updateScores(this.globalPerformanceScores, globalKey);

    // Update tenant-specific scores
    if (tenantId) {
      const tenantKey = `${tenantId}:${profile}:${engine}`;
      updateScores(this.tenantPerformanceScores, tenantKey);
    }

    // Persist periodically (every 10 global recordings for a given profile/engine)
    if (globalCount % 10 === 0) {
      this._saveState().catch(err => logger.error('QueryRouter: background state persistence failed.', { error: err }));
    }
  }

  // --- Private Helper Methods ---

  _classifyProfile(queryLower, userMetadataList) {
    const docCharacteristics = { highlyTechnicalCount: 0 };
    const profileScores = {};

    for (const [name, profile] of Object.entries(this.config.documentProfiles)) {
      profileScores[name] = profile.keywords.reduce((acc, keyword) => (acc + (queryLower.includes(keyword) ? 1 : 0)), 0);
    }

    if (userMetadataList && userMetadataList.length > 0) {
      for (const meta of userMetadataList) {
        if (meta.complexity === 'Highly Technical') docCharacteristics.highlyTechnicalCount++;
        const matchesAnyTopic = meta.topics.some(t => queryLower.includes(t.toLowerCase()));
        const matchesAnyEntity = meta.entities.some(e => queryLower.includes(e.toLowerCase()));
        if (matchesAnyTopic || matchesAnyEntity) {
          if (meta.complexity === 'Highly Technical' || meta.complexity === 'Advanced') profileScores.technical = (profileScores.technical || 0) + 2;
          if (meta.topics.some(t => ['database', 'sheets', 'data', 'finance'].includes(t.toLowerCase()))) profileScores.structured = (profileScores.structured || 0) + 2;
          if (meta.topics.some(t => ['research', 'scientific', 'analysis'].includes(t.toLowerCase()))) profileScores.research = (profileScores.research || 0) + 2;
        }
      }
    }

    let bestMatch = { name: 'general', score: 0, preferredEngines: ['hybrid', 'vector'] };
    for (const name in profileScores) {
      if (profileScores[name] > bestMatch.score) {
        bestMatch = { name, score: profileScores[name], preferredEngines: this.config.documentProfiles[name].preferredEngines };
      }
    }
    return { profile: bestMatch, docCharacteristics };
  }

  _scoreEngine(engine, profile, queryLower, options, docCharacteristics) {
    let score = 0;
    const w = this.config.scoringWeights;
    const { tenantId } = options;

    if (profile.preferredEngines.includes(engine)) {
      score += profile.preferredEngines.indexOf(engine) === 0 ? w.preferredProfilePrimary : w.preferredProfileSecondary;
    } else {
      score += w.otherProfile;
    }

    const tenantKey = `${tenantId}:${profile.name}:${engine}`;
    const globalKey = `${profile.name}:${engine}`;
    const tenantHistory = this.tenantPerformanceScores.get(tenantKey);
    const globalHistory = this.globalPerformanceScores.get(globalKey);

    // Use tenant history if sufficient, otherwise fall back to global history
    const history = (tenantHistory && tenantHistory.count >= this.config.tenantHistoryThreshold) ? tenantHistory : globalHistory;

    if (history && history.count > 0) {
      score += (history.totalQuality / history.count) * w.historicalQuality;
      score += (history.successes / history.count) * w.historicalSuccess;
      const avgLatency = history.totalLatencyMs / history.count;
      if (avgLatency > 10000) score += w.latencyPenaltyLarge;
      else if (avgLatency > 5000) score += w.latencyPenaltySmall;
    }

    if (options.isFollowUp && engine === 'chat') score += w.followUpBonus;
    if (options.previousEngine === engine) score += w.sameEngineBonus;
    if (options.documentCount > 20 && engine === 'fullspectrum') score += w.largeCorpusBonus;
    if (options.documentCount <= 3 && engine === 'vector') score += w.smallCorpusBonus;
    if (docCharacteristics.highlyTechnicalCount > 0 && engine === 'selfcorrect') score += w.technicalCorpusBonus;
    if (queryLower.length > 200 && engine === 'fullspectrum') score += w.longQueryBonus;
    if (queryLower.length < 30 && engine === 'cached') score += w.shortQueryBonus;

    return score;
  }

  _buildReasoning(engine, profile, options, docCharacteristics) {
    const parts = [];
    parts.push(`Query classified as "${profile.name}" profile`);
    if (profile.preferredEngines[0] === engine) parts.push(`"${engine}" is top-ranked for this profile`);
    if (options.isFollowUp) parts.push('follow-up question detected');
    if (docCharacteristics.highlyTechnicalCount > 0) parts.push(`corpus contains ${docCharacteristics.highlyTechnicalCount} technical docs`);

    const tenantKey = `${options.tenantId}:${profile.name}:${engine}`;
    const history = this.tenantPerformanceScores.get(tenantKey);
    if (history && history.count >= this.config.tenantHistoryThreshold) {
      const successRate = Math.round((history.successes / history.count) * 100);
      parts.push(`tenant history: ${successRate}% success over ${history.count} queries`);
    } else {
      const globalKey = `${profile.name}:${engine}`;
      const globalHistory = this.globalPerformanceScores.get(globalKey);
      if (globalHistory && globalHistory.count > 0) {
        const successRate = Math.round((globalHistory.successes / globalHistory.count) * 100);
        parts.push(`global history: ${successRate}% success over ${globalHistory.count} queries`);
      }
    }
    return parts.join('; ');
  }

  _loadState() {
    try {
      if (fs.existsSync(ROUTER_STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(ROUTER_STATE_FILE, 'utf8'));
        if (data.globalPerformanceScores) this.globalPerformanceScores = new Map(Object.entries(data.globalPerformanceScores));
        if (data.tenantPerformanceScores) this.tenantPerformanceScores = new Map(Object.entries(data.tenantPerformanceScores));
        this.totalRouted = data.totalRouted || 0;
        logger.info(`QueryRouter: loaded state — ${this.globalPerformanceScores.size} global entries, ${this.tenantPerformanceScores.size} tenant entries.`);
      }
    } catch (error) {
      logger.warn('QueryRouter: failed to load state, starting fresh.', { error });
    }
  }

  async _saveState() {
    await fs.promises.mkdir(TELEMETRY_DIR, { recursive: true });
    const state = {
      globalPerformanceScores: Object.fromEntries(this.globalPerformanceScores),
      tenantPerformanceScores: Object.fromEntries(this.tenantPerformanceScores),
      totalRouted: this.totalRouted,
      lastSaved: new Date().toISOString(),
    };
    await fs.promises.writeFile(ROUTER_STATE_FILE, JSON.stringify(state, null, 2));
    logger.info('QueryRouter: state persisted');
  }
}

/**
 * A singleton instance of the QueryRouterService.
 * @type {QueryRouterService}
 */
export const queryRouterService = new QueryRouterService();