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

/**
 * An array of available LlamaIndex engine identifiers.
 * @type {string[]}
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
/**
 * The directory where telemetry and router state data is stored.
 * @type {string}
 */
const TELEMETRY_DIR = path.resolve(__dirname, '../../../../storage/ragsystem/telemetry');

/**
 * The file path for persisting the router's learned state.
 * @type {string}
 */
const ROUTER_STATE_FILE = path.join(TELEMETRY_DIR, 'router_state.json');

/**
 * Defines profiles for classifying queries based on keywords.
 * Each profile has a set of keywords and a list of preferred engines.
 * @type {Object<string, {keywords: string[], preferredEngines: string[]}>}
 */
const DOCUMENT_PROFILES = {
  technical: { keywords: ['code', 'api', 'function', 'class', 'module', 'error', 'debug'], preferredEngines: ['vector', 'selfcorrect'] },
  research: { keywords: ['study', 'research', 'paper', 'analysis', 'findings', 'methodology', 'hypothesis'], preferredEngines: ['fullspectrum', 'hybrid'] },
  conversational: { keywords: ['how', 'what', 'why', 'explain', 'tell me', 'help me', 'understand'], preferredEngines: ['chat', 'hybrid'] },
  factual: { keywords: ['who', 'when', 'where', 'date', 'number', 'amount', 'name'], preferredEngines: ['vector', 'cached'] },
  comparative: { keywords: ['compare', 'difference', 'versus', 'vs', 'better', 'worse', 'pros', 'cons'], preferredEngines: ['fullspectrum', 'selfcorrect'] },
  structured: { keywords: ['table', 'column', 'row', 'field', 'record', 'schema', 'database'], preferredEngines: ['objectagent', 'vector'] },
};

/**
 * A smart query router that uses historical telemetry and document characteristics
 * to automatically route queries to the optimal LlamaIndex engine.
 */
class QueryRouterService {
  /**
   * Initializes the QueryRouterService, loading any persisted state from disk.
   */
  constructor() {
    /**
     * Stores engine performance scores, keyed by `profile:engine`.
     * @type {Map<string, Object>}
     */
    this.performanceScores = new Map();
    // Bug Fix: Removed unused 'this.cacheHits' property. Cache hit counts are stored within performanceScores.
    /**
     * The total number of queries routed by this service instance.
     * @type {number}
     */
    this.totalRouted = 0;

    // _loadState remains synchronous to ensure state is loaded before the first use
    // as the constructor cannot be async and await it without changing the service's instantiation pattern.
    this._loadState();
  }

  /**
   * Routes a query to the optimal engine based on query profile, document metadata,
   * and historical performance data.
   *
   * @param {string} query - The user's query text.
   * @param {object} [options={}] - Optional parameters to refine routing.
   * @param {string} [options.userId] - The ID of the user making the query, used for personalized routing based on their document corpus.
   * @param {number} [options.documentCount] - The total number of documents indexed for the user.
   * @param {boolean} [options.isFollowUp] - Flag indicating if this is a follow-up question in a conversation.
   * @param {string} [options.previousEngine] - The engine used for the previous query in the conversation.
   * @returns {Promise<object>} A routing decision object containing the chosen engine, confidence score, and reasoning.
   * @throws {ApiError} Throws an ApiError if an unexpected internal error occurs during routing.
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
        logger.warn(`QueryRouter: could not fetch DocumentMetadata for user ${userId}. Routing will proceed without it.`, { error: dbError });
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

      logger.info(`QueryRouter: "${query.substring(0, 50)}..." → ${bestEngine} (${profile.name}, conf=${decision.confidence})`);

      return decision;
    } catch (error) {
      // PATCH: Catch any unexpected errors during the routing logic.
      logger.error('QueryRouter: an unexpected error occurred during query routing.', { query, options, error });
      // PATCH: Normalize the error for the controller/service layer to ensure a consistent error response format.
      throw new ApiError(500, 'Failed to route query due to an internal system error.');
    }
  }

  /**
   * Records the performance outcome of a routed query to train the router for future decisions.
   * This method updates the in-memory performance scores and periodically persists them to disk.
   *
   * @param {string} engine - The engine that was used for the query.
   * @param {string} profile - The query profile classification (e.g., 'technical', 'research').
   * @param {object} metrics - Performance metrics from the query execution.
   * @param {number} metrics.latencyMs - The time taken to execute the query in milliseconds.
   * @param {number} [metrics.qualityScore] - An optional quality score from 0 to 1.
   * @param {boolean} [metrics.cacheHit] - An optional flag indicating if the result was served from a cache.
   * @param {boolean} [metrics.success] - An optional flag indicating if the query was successful. Defaults to true.
   * @returns {void}
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
      this._saveState().catch(err => logger.error('QueryRouter: background state persistence failed.', { error: err }));
    }
  }

  /**
   * Retrieves a summary of routing analytics, including total queries routed,
   * performance per engine, and the distribution of query profiles.
   *
   * @returns {object} An object containing analytics data.
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
   * Classifies a query into a profile and analyzes the user's document corpus
   * to extract key characteristics in a single pass.
   * @private
   * @param {string} queryLower - The lowercased user query.
   * @param {Array<object>} userMetadataList - A list of document metadata objects for the user.
   * @returns {{profile: object, docCharacteristics: object}} An object containing the determined profile and document characteristics.
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
   * Calculates a score for a given engine based on the query profile, context,
   * historical performance, and document characteristics.
   * @private
   * @param {string} engine - The engine to score.
   * @param {object} profile - The classified query profile.
   * @param {string} queryLower - The lowercased user query.
   * @param {object} options - The original routing options.
   * @param {object} docCharacteristics - Pre-calculated characteristics of the user's document corpus.
   * @returns {number} The calculated score for the engine.
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
   * Constructs a human-readable string explaining the routing decision.
   * @private
   * @param {string} engine - The chosen engine.
   * @param {object} profile - The classified query profile.
   * @param {object} options - The original routing options.
   * @param {object} docCharacteristics - Pre-calculated characteristics of the user's document corpus.
   * @returns {string} A semicolon-separated string of reasons for the routing choice.
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
   * Loads the router's state from a JSON file on disk.
   * This is a synchronous operation performed in the constructor to ensure
   * the state is ready before any routing occurs.
   * @private
   * @returns {void}
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
        logger.info(`QueryRouter: loaded state — ${this.performanceScores.size} profile:engine entries`);
      }
    } catch (error) {
      // PATCH: Improved logging to include the full error object for better diagnostics in GCP/structured logging.
      // This is a non-fatal warning as the service can start with a fresh state.
      logger.warn('QueryRouter: failed to load state, starting fresh. State file might be corrupted or inaccessible.', { error });
    }
  }

  /**
   * Persists the current router state (performance scores, total routed count) to a JSON file.
   * This is an asynchronous operation to avoid blocking the event loop.
   * @private
   * @returns {Promise<void>}
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
    logger.info('QueryRouter: state persisted');
  }
}

/**
 * A singleton instance of the QueryRouterService.
 * @type {QueryRouterService}
 */
export const queryRouterService = new QueryRouterService();