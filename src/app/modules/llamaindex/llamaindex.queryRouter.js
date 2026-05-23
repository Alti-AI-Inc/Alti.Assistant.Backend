import fs from 'fs';
import path from 'path';
import { logger } from '../../../shared/logger.js';
import DocumentMetadata from './llamaindex.metadata.model.js';

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

const TELEMETRY_DIR = path.resolve('storage/ragsystem/telemetry');
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
    /** @type {Map<string, number>} Cache hit counts per engine */
    this.cacheHits = new Map();
    /** @type {number} Total routed queries */
    this.totalRouted = 0;

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
    this.totalRouted++;
    const queryLower = query.toLowerCase();
    const userId = options.userId || 'default_user';

    // Fetch user's enriched document metadata for semantic alignment
    let userMetadataList = [];
    try {
      userMetadataList = await DocumentMetadata.find({ userId }).lean();
    } catch (err) {
      logger.warn(`QueryRouter: could not fetch DocumentMetadata for user ${userId}:`, err.message);
    }

    // Step 1: Classify query profile using keywords + semantic tags from user documents
    const profile = this._classifyProfile(queryLower, userMetadataList);

    // Step 2: Score each engine
    const scores = {};
    for (const engine of ENGINES) {
      scores[engine] = this._scoreEngine(engine, profile, queryLower, options, userMetadataList);
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
      reasoning: this._buildReasoning(bestEngine, profile, options, userMetadataList),
      alternatives: ranked.slice(1, 3).map(([eng, score]) => ({
        engine: eng,
        score: Math.round(score * 100) / 100,
      })),
      scores,
    };

    logger.info(`QueryRouter: "${query.substring(0, 50)}..." → ${bestEngine} (${profile.name}, conf=${decision.confidence})`);

    return decision;
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
      this._saveState();
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
      ep.avgLatencyMs = Math.round(data.totalLatencyMs / data.count);
      ep.avgQuality = Math.round((data.totalQuality / data.count) * 100) / 100;
      ep.successRate = Math.round((data.successes / data.count) * 100);
      ep.cacheHitRate = Math.round((data.cacheHits / data.count) * 100);

      if (!analytics.profileDistribution[profile]) {
        analytics.profileDistribution[profile] = 0;
      }
      analytics.profileDistribution[profile] += data.count;
    }

    return analytics;
  }

  /**
   * Classify a query into a document profile, checking user document tags.
   * @private
   */
  _classifyProfile(queryLower, userMetadataList) {
    let bestMatch = { name: 'general', score: 0, preferredEngines: ['hybrid', 'vector'] };

    for (const [name, profile] of Object.entries(DOCUMENT_PROFILES)) {
      let score = profile.keywords.reduce((acc, keyword) => {
        return acc + (queryLower.includes(keyword) ? 1 : 0);
      }, 0);

      // Semantic matching with user's enriched document topics
      if (userMetadataList && userMetadataList.length > 0) {
        for (const meta of userMetadataList) {
          // If query targets a topic inside user's own technical/financial documents, boost alignment
          const matchesTopic = meta.topics.some(t => queryLower.includes(t.toLowerCase()));
          const matchesEntity = meta.entities.some(e => queryLower.includes(e.toLowerCase()));

          if (matchesTopic || matchesEntity) {
            if (name === 'technical' && (meta.complexity === 'Highly Technical' || meta.complexity === 'Advanced')) {
              score += 2;
            }
            if (name === 'structured' && meta.topics.some(t => ['database', 'sheets', 'data', 'finance'].includes(t.toLowerCase()))) {
              score += 2;
            }
            if (name === 'research' && meta.topics.some(t => ['research', 'scientific', 'analysis'].includes(t.toLowerCase()))) {
              score += 2;
            }
          }
        }
      }

      if (score > bestMatch.score) {
        bestMatch = { name, score, preferredEngines: profile.preferredEngines };
      }
    }

    return bestMatch;
  }

  /**
   * Score an engine for a given query profile and context.
   * @private
   */
  _scoreEngine(engine, profile, queryLower, options, userMetadataList) {
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
    if (userMetadataList && userMetadataList.length > 0) {
      const hasHighlyTechnical = userMetadataList.some(meta => meta.complexity === 'Highly Technical');
      if (hasHighlyTechnical && engine === 'selfcorrect') {
        score += 3; // Boost self-correcting logic if user corpus contains complex papers
      }
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
  _buildReasoning(engine, profile, options, userMetadataList) {
    const parts = [];
    parts.push(`Query classified as "${profile.name}" profile`);
    
    if (profile.preferredEngines[0] === engine) {
      parts.push(`"${engine}" is the top-ranked engine for ${profile.name} queries`);
    }

    if (options.isFollowUp) {
      parts.push('follow-up question detected');
    }

    if (userMetadataList && userMetadataList.length > 0) {
      const complexCount = userMetadataList.filter(m => m.complexity === 'Highly Technical').length;
      if (complexCount > 0) {
        parts.push(`Corpus contains ${complexCount} highly technical document profiles`);
      }
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
      if (fs.existsSync(ROUTER_STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(ROUTER_STATE_FILE, 'utf8'));
        if (data.performanceScores) {
          this.performanceScores = new Map(Object.entries(data.performanceScores));
        }
        this.totalRouted = data.totalRouted || 0;
        logger.info(`QueryRouter: loaded state — ${this.performanceScores.size} profile:engine entries`);
      }
    } catch (error) {
      logger.warn('QueryRouter: failed to load state, starting fresh:', error.message);
    }
  }

  /**
   * Persist router state to disk.
   * @private
   */
  _saveState() {
    try {
      if (!fs.existsSync(TELEMETRY_DIR)) {
        fs.mkdirSync(TELEMETRY_DIR, { recursive: true });
      }

      const state = {
        performanceScores: Object.fromEntries(this.performanceScores),
        totalRouted: this.totalRouted,
        lastSaved: new Date().toISOString(),
      };

      fs.writeFileSync(ROUTER_STATE_FILE, JSON.stringify(state, null, 2));
      logger.info('QueryRouter: state persisted');
    } catch (error) {
      logger.warn('QueryRouter: failed to save state:', error.message);
    }
  }
}

export const queryRouterService = new QueryRouterService();
