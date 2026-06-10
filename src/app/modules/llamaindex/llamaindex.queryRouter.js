import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Added for __dirname equivalent
import { logger } from '../../../shared/logger.js';
import DocumentMetadata from './llamaindex.metadata.model.js';
import ApiError from '../../../shared/ApiError.js';

// Get __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LlamaIndex Smart Query Router
 *
 * Uses historical telemetry data and document characteristics to
 * automatically route queries to the optimal engine. Instead of
 * relying solely on LLM-based classification, this router uses
 * empirical performance data to make routing decisions.
 *
 * Engines ranked:
 *   - vector: Standard vector similarity (best for factual lookups)
 *   - hybrid: Vector + keyword fusion (best for mixed queries)
 *   - fullspectrum: 6 retriever types + RRF (best for broad research)
 *   - selfcorrect: Auto-retry on low eval (best for precision-critical queries)
 *   - cached: Semantic cache (best for repeated/similar queries)
 *   - objectagent: ObjectIndex agent (best for structured document queries)
 *   - chat: Condense question chat (best for conversational follow-ups)
 */

const ENGINES = [
  'vector', 'hybrid', 'fullspectrum', 'selfcorrect',
  'cached', 'objectagent', 'chat',
];

// Bug Fix: Resolve TELEMETRY_DIR relative to the current file's location
// This ensures the path is consistent regardless of the process's current working directory.
// The path C:\Users\hyper\workspace\Alti.Assistant\Alti.Assistant.Backend\src\app\modules\llamaindex\llamaindex.queryRouter.js
// requires going up 4 levels from 'src/app/modules/llamaindex' to reach 'Alti.Assistant.Backend',
// then navigating into 'storage/ragsystem/telemetry'.
const TELEMETRY_DIR = path.resolve(__dirname, '../../../../storage/ragsystem/telemetry');
const ROUTER_STATE_FILE = path.join(TELEMETRY_DIR, 'router_state.json');

const DOCUMENT_PROFILES = {
  technical: { keywords: ['code', 'api', 'function', 'class', 'module', 'error', 'debug'], preferredEngines: ['vector', 'selfcorrect'] },
  research: { keywords: ['study', 'research', 'paper', 'analysis', 'findings', 'methodology', 'hypothesis'], preferredEngines: ['fullspectrum', 'hybrid'] },
  conversational: { keywords: ['how', 'what', 'why', 'explain', 'tell me', 'help me', 'understand'], preferredEngines: ['chat', 'hybrid'] },
  factual: { keywords: ['who', 'when', 'where', 'date', 'number', 'amount', 'name'], preferredEngines: ['vector', 'cached'] },
  comparative: { keywords: ['compare', 'difference', 'versus', 'vs', 'better', 'worse', 'pros', 'cons'], preferredEngines: ['fullspectrum', 'selfcorrect'] },
  structured: { keywords: ['table', 'column', 'row', 'field', 'record', 'schema', 'database'], preferredEngines: ['objectagent', 'vector'] },
};

class QueryRouterService {
  constructor() {
    /** @type {Map<string, Object>} Engine performance scores per document profile */
    this.performanceScores = new Map();
    // Bug Fix: Removed unused 'this.cacheHits' property. Cache hit counts are stored within performanceScores.
    /** @type {number} Total routed queries */
    this.totalRouted = 0;

    // _loadState remains synchronous to ensure state is loaded before the first use
    // as the constructor cannot be async and await it without changing the service's instantiation pattern.
    this._loadState();
  }

  /**
   * Route a query to the optimal engine based on:
   * 1. Query profile classification (keyword matching)
   * 2. Semantic Document Metadata lookup (topics, complexity)
   * 3. Historical performance data (latency, quality)
   *
   * @param {string} query - The user's query text
   * @param {Object} [options]
   * @param {string} [options.userId] - User ID for personalized routing
   * @param {number} [options.documentCount] - Number of indexed documents
   * @param {boolean} [options.isFollowUp] - Whether this is a follow-up question
   * @param {string} [options.previousEngine] - Engine used for the previous query
   * @returns {Promise<Object>} Routing decision with engine, confidence, and reasoning
   */
  async route(query, options = {}) {
    // PATCH: Added a top-level try/catch block to handle any unexpected errors during routing logic.
    // This ensures all failures are logged centrally and a normalized ApiError is thrown.
    try {
      this.totalRouted++;
      const queryLower = query.toLowerCase();
      const userId = options.userId || 'default_user';

      // Fetch user's enriched document metadata for semantic alignment
      let userMetadataList = [];
      try {
        // OPTIMIZATION: Ensure an index exists on the 'userId' field in the 'DocumentMetadata'
        // collection for fast lookups, as this query runs for every routing request.
        // Example Mongoose schema index: DocumentMetadataSchema.index({ userId: 1 });
        userMetadataList = await DocumentMetadata.find({ userId }).lean();
      } catch (dbError) {
        // PATCH: Improved logging for non-fatal DB errors. Log the full error object for better diagnostics.
        // This is a non-fatal error for routing; log as a warning and continue with degraded accuracy.
        // GCP-AUDIT: Switched to single-object structured logging for GCP Cloud Logging compatibility.
        logger.warn({
          message: `QueryRouter: could not fetch DocumentMetadata for user ${userId}. Routing will proceed without it.`,
          error: dbError,
        });
      }

      // Step 1: Classify query profile and analyze user document corpus in one pass
      const { profile, docCharacteristics } = this._classifyProfile(queryLower, userMetadataList);

      // Step 2: Score each engine
      const scores = {};
      for (const engine of ENGINES) {
        scores[engine] = this._scoreEngine(engine, profile, queryLower, options, docCharacteristics);
      }

      // Step 3: Pick the winner
      const ranked = Object.entries(scores)
        .sort(([, a], [, b]) => b - a);

      const [bestEngine, bestScore] = ranked[0];
      const [secondEngine, secondScore] = ranked[1] || [null, 0];

      // Calculate confidence (how much better is the best vs second)
      const confidence = secondScore > 0
        ? Math.min(1, (bestScore - secondScore) / secondScore + 0.5)
        : 0.95;

      const decision = {
        engine: bestEngine,
        confidence: Math.round(confidence * 100) / 100,
        profile: profile.name,
        reasoning: this._buildReasoning(bestEngine, profile, options, docCharacteristics),
        alternatives: ranked.slice(1, 3).map(([eng, score]) => ({
          engine: eng,
          score: Math.round(score * 100) / 100,
        })),
        scores,
      };

      // GCP-AUDIT: Deconstructed log message into a structured JSON object for better filterability in GCP Cloud Logging.
      logger.info({
        message: `QueryRouter: Routed query to ${bestEngine}`,
        query: query.substring(0, 50),
        engine: bestEngine,
        profile: profile.name,
        confidence: decision.confidence,
      });

      return decision;
    } catch (error) {
      // PATCH: Catch any unexpected errors during the routing logic.
      // GCP-AUDIT: Switched to single-object structured logging for GCP Cloud Logging compatibility.
      logger.error({
        message: 'QueryRouter: an unexpected error occurred during query routing.',
        query,
        options,
        error,
      });
      // PATCH: Normalize the error for the controller/service layer to ensure a consistent error response format.
      throw new ApiError(500, 'Failed to route query due to an internal system error.');
    }
  }

  /**
   * Record the outcome of a routed query for learning.
   *
   * @param {string} engine - Engine that was used
   * @param {string} profile - Document profile classification
   * @param {Object} metrics - Performance metrics
   * @param {number} metrics.latencyMs
   * @param {number} [metrics.qualityScore] - 0-1 score
   * @param {boolean} [metrics.cacheHit]
   * @param {boolean} [metrics.success]
   */
  recordOutcome(engine, profile, metrics) {
    const key = `${profile}:${engine}`;
    const existing = this.performanceScores.get(key) || {
      count: 0,
      totalLatencyMs: 0,
      totalQuality: 0,
      successes: 0,
      cacheHits: 0,
    };

    existing.count++;
    existing.totalLatencyMs += metrics.latencyMs || 0;
    existing.totalQuality += metrics.qualityScore || 0;
    if (metrics.success !== false) existing.successes++;
    if (metrics.cacheHit) existing.cacheHits++;

    this.performanceScores.set(key, existing);

    // Persist periodically (every 10 recordings)
    if (existing.count % 10 === 0) {
      // Performance Fix & Unhandled Promise Fix:
      // Call _saveState asynchronously without awaiting, but attach a .catch() handler
      // to prevent unhandled promise rejections and avoid blocking the event loop.
      // PATCH: Improved log message and ensures the full error object is captured.
      // GCP-AUDIT: Switched to single-object structured logging for GCP Cloud Logging compatibility.
      this._saveState().catch(err => logger.error({ message: 'QueryRouter: background state persistence failed.', error: err }));
    }
  }

  /**
   * Get routing analytics.
   *
   * @returns {Object} Analytics summary
   */
  getAnalytics() {
    const analytics = {
      totalRouted: this.totalRouted,
      enginePerformance: {},
      profileDistribution: {},
    };

    for (const [key, data] of this.performanceScores.entries()) {
      const [profile, engine] = key.split(':');

      if (!analytics.enginePerformance[engine]) {
        analytics.enginePerformance[engine] = {
          totalQueries: 0,
          avgLatencyMs: 0,
          avgQuality: 0,
          successRate: 0,
          cacheHitRate: 0,
        };
      }

      const ep = analytics.enginePerformance[engine];
      ep.totalQueries += data.count;

      // PATCH: Added a defensive check to prevent division-by-zero errors if count is malformed.
      if (data.count > 0) {
        ep.avgLatencyMs = Math.round(data.totalLatencyMs / data.count);
        ep.avgQuality = Math.round((data.totalQuality / data.count) * 100) / 100;
        ep.successRate = Math.round((data.successes / data.count) * 100);
        ep.cacheHitRate = Math.round((data.cacheHits / data.count) * 100);
      } else {
        ep.avgLatencyMs = 0;
        ep.avgQuality = 0;
        ep.successRate = 0;
        ep.cacheHitRate = 0;
      }

      if (!analytics.profileDistribution[profile]) {
        analytics.profileDistribution[profile] = 0;
      }
      analytics.profileDistribution[profile] += data.count;
    }

    return analytics;
  }

  /**
   * Classify a query and analyze the user's document corpus.
   * @private
   */
  _classifyProfile(queryLower, userMetadataList) {
    // OPTIMIZATION: This function now iterates over userMetadataList only ONCE to extract all
    // necessary characteristics, which are then passed to other functions. This avoids
    // multiple O(N) iterations over the same list for profiling, scoring, and reasoning.
    const docCharacteristics = {
      highlyTechnicalCount: 0,
    };
    const profileScores = {};

    // Step 1: Initialize scores from query keywords
    for (const [name, profile] of Object.entries(DOCUMENT_PROFILES)) {
      profileScores[name] = profile.keywords.reduce((acc, keyword) => (
        acc + (queryLower.includes(keyword) ? 1 : 0)
      ), 0);
    }

    // Step 2: Augment scores by iterating through user documents ONCE
    if (userMetadataList && userMetadataList.length > 0) {
      for (const meta of userMetadataList) {
        // Tally characteristics for scoring and reasoning
        if (meta.complexity === 'Highly Technical') {
          docCharacteristics.highlyTechnicalCount++;
        }

        // Check if query matches topics/entities in this document
        const matchesAnyTopic = meta.topics.some(t => queryLower.includes(t.toLowerCase()));
        const matchesAnyEntity = meta.entities.some(e => queryLower.includes(e.toLowerCase()));

        if (matchesAnyTopic || matchesAnyEntity) {
          // Boost relevant profiles based on document metadata
          if (meta.complexity === 'Highly Technical' || meta.complexity === 'Advanced') {
            profileScores.technical = (profileScores.technical || 0) + 2;
          }
          if (meta.topics.some(t => ['database', 'sheets', 'data', 'finance'].includes(t.toLowerCase()))) {
            profileScores.structured = (profileScores.structured || 0) + 2;
          }
          if (meta.topics.some(t => ['research', 'scientific', 'analysis'].includes(t.toLowerCase()))) {
            profileScores.research = (profileScores.research || 0) + 2;
          }
        }
      }
    }

    // Step 3: Determine the best matching profile
    let bestMatch = { name: 'general', score: 0, preferredEngines: ['hybrid', 'vector'] };
    for (const name in profileScores) {
      if (profileScores[name] > bestMatch.score) {
        bestMatch = { name, score: profileScores[name], preferredEngines: DOCUMENT_PROFILES[name].preferredEngines };
      }
    }

    return { profile: bestMatch, docCharacteristics };
  }

  /**
   * Score an engine for a given query profile and context.
   * @private
   */
  _scoreEngine(engine, profile, queryLower, options, docCharacteristics) {
    let score = 0;

    // Base score: is this engine preferred for this profile?
    if (profile.preferredEngines.includes(engine)) {
      score += profile.preferredEngines.indexOf(engine) === 0 ? 10 : 7;
    } else {
      score += 3;
    }

    // Historical performance bonus
    const key = `${profile.name}:${engine}`;
    const historical = this.performanceScores.get(key);
    if (historical && historical.count >= 5) {
      const avgQuality = historical.totalQuality / historical.count;
      const successRate = historical.successes / historical.count;
      score += avgQuality * 5;
      score += successRate * 3;
      const avgLatency = historical.totalLatencyMs / historical.count;
      if (avgLatency > 5000) score -= 2;
      if (avgLatency > 10000) score -= 3;
    }

    // Context bonuses
    if (options.isFollowUp && engine === 'chat') score += 5;
    if (options.previousEngine === engine) score += 1;
    if (options.documentCount && options.documentCount > 20 && engine === 'fullspectrum') score += 2;
    if (options.documentCount && options.documentCount <= 3 && engine === 'vector') score += 2;

    // Smart boost: Highly Technical document complexity alignment
    if (docCharacteristics.highlyTechnicalCount > 0 && engine === 'selfcorrect') {
      score += 3; // Boost self-correcting logic if user corpus contains complex papers
    }

    // Query length heuristics
    if (queryLower.length > 200 && engine === 'fullspectrum') score += 2;
    if (queryLower.length < 30 && engine === 'cached') score += 2;

    return score;
  }

  /**
   * Build a human-readable reasoning string.
   * @private
   */
  _buildReasoning(engine, profile, options, docCharacteristics) {
    const parts = [];
    parts.push(`Query classified as "${profile.name}" profile`);

    if (profile.preferredEngines[0] === engine) {
      parts.push(`"${engine}" is the top-ranked engine for ${profile.name} queries`);
    }

    if (options.isFollowUp) {
      parts.push('follow-up question detected');
    }

    if (docCharacteristics.highlyTechnicalCount > 0) {
      parts.push(`Corpus contains ${docCharacteristics.highlyTechnicalCount} highly technical document profiles`);
    }

    const key = `${profile.name}:${engine}`;
    const historical = this.performanceScores.get(key);
    if (historical && historical.count >= 5) {
      const successRate = Math.round((historical.successes / historical.count) * 100);
      parts.push(`historical success rate: ${successRate}% over ${historical.count} queries`);
    }

    return parts.join('; ');
  }

  /**
   * Load persisted router state.
   * @private
   */
  _loadState() {
    try {
      // _loadState remains synchronous to ensure state is loaded before the first use
      // as the constructor cannot be async and await it.
      if (fs.existsSync(ROUTER_STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(ROUTER_STATE_FILE, 'utf8'));
        if (data.performanceScores) {
          this.performanceScores = new Map(Object.entries(data.performanceScores));
        }
        this.totalRouted = data.totalRouted || 0;
        // GCP-AUDIT: Deconstructed log message into a structured JSON object for better filterability in GCP Cloud Logging.
        logger.info({
          message: 'QueryRouter: loaded state',
          entryCount: this.performanceScores.size,
        });
      }
    } catch (error) {
      // PATCH: Improved logging to include the full error object for better diagnostics in GCP/structured logging.
      // This is a non-fatal warning as the service can start with a fresh state.
      // GCP-AUDIT: Switched to single-object structured logging for GCP Cloud Logging compatibility.
      logger.warn({
        message: 'QueryRouter: failed to load state, starting fresh. State file might be corrupted or inaccessible.',
        error,
      });
    }
  }

  /**
   * Persist router state to disk.
   * @private
   */
  async _saveState() {
    // PATCH: Removed the try/catch block. This method now throws on failure, allowing the caller
    // (recordOutcome) to handle the error, which it does by logging it as a critical error.
    // This centralizes error handling logic in the calling context.

    // Ensure directory exists. fs.promises.mkdir with recursive: true is idempotent.
    await fs.promises.mkdir(TELEMETRY_DIR, { recursive: true });

    const state = {
      performanceScores: Object.fromEntries(this.performanceScores),
      totalRouted: this.totalRouted,
      lastSaved: new Date().toISOString(),
    };

    // Use async writeFile to prevent blocking the event loop. Throws on error.
    await fs.promises.writeFile(ROUTER_STATE_FILE, JSON.stringify(state, null, 2));
    // GCP-AUDIT: Switched to single-object structured logging for consistency.
    logger.info({ message: 'QueryRouter: state persisted' });
  }
}

export const queryRouterService = new QueryRouterService();