import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'path';
import { logger } from '../../../shared/logger.js';

/**
 * Phase 19: Query Telemetry Pipeline
 * 
 * Persistent telemetry collector for LlamaIndex query endpoints.
 * Tracks latency, cache hits, error rates, retrieval quality scores,
 * and query type distributions across sessions.
 * 
 * Architecture:
 *   - In-memory ring buffer (10k entries) for hot queries
 *   - Periodic flush to disk at storage/ragsystem/telemetry/
 *   - Future: MongoDB migration path via Mongoose model
 */

const MAX_RING_BUFFER_SIZE = 10000;
const FLUSH_INTERVAL_MS = 60_000; // Flush every 60 seconds
const TELEMETRY_DIR = path.resolve('storage/ragsystem/telemetry');

class TelemetryCollector {
  constructor() {
    /** @type {Map<string, Object>} Active traces keyed by traceId */
    this.activeTraces = new Map();

    /** @type {Array<Object>} Completed telemetry entries (ring buffer) */
    this.entries = [];

    /** @type {number} Total entries ever recorded (monotonic counter) */
    this.totalRecorded = 0;

    /** @type {NodeJS.Timeout|null} Periodic flush timer */
    this._flushTimer = null;

    /** @type {boolean} Whether the collector has been initialized */
    this._initialized = false;
  }

  /**
   * Initialize the telemetry collector.
   * Creates the storage directory and starts periodic flushing.
   */
  initialize() {
    if (this._initialized) return;

    try {
      if (!existsSync(TELEMETRY_DIR)) {
        mkdirSync(TELEMETRY_DIR, { recursive: true });
      }

      // Load existing entries from today's log file
      this._loadFromDisk().catch((err) => {
        logger.warn('TelemetryCollector: could not load existing entries:', err.message);
      });

      // Start periodic flush
      this._flushTimer = setInterval(() => {
        this._flushToDisk().catch((err) => {
          logger.warn('TelemetryCollector: flush error:', err.message);
        });
      }, FLUSH_INTERVAL_MS);

      // Ensure flush timer doesn't prevent process exit
      if (this._flushTimer.unref) {
        this._flushTimer.unref();
      }

      this._initialized = true;
      logger.info('TelemetryCollector initialized');
    } catch (err) {
      logger.error('TelemetryCollector initialization error:', err);
    }
  }

  /**
   * Begin a new telemetry trace for a query.
   * 
   * @param {string} queryType - The endpoint/query type (e.g. 'query', 'query-stream', 'query-classify')
   * @param {string} userId - The user initiating the query
   * @param {Object} [metadata={}] - Additional metadata (query text length, mode, etc.)
   * @returns {string} traceId - Use this to close the trace via endTrace()
   */
  startTrace(queryType, userId, metadata = {}) {
    this.initialize();

    const traceId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.activeTraces.set(traceId, {
      traceId,
      queryType,
      userId,
      startTime: Date.now(),
      metadata,
    });

    return traceId;
  }

  /**
   * Complete a telemetry trace with results.
   * 
   * @param {string} traceId - The trace ID from startTrace()
   * @param {Object} results - Trace results
   * @param {number} [results.chunks] - Number of retrieved chunks
   * @param {number} [results.tokens] - Estimated token count
   * @param {boolean} [results.cacheHit] - Whether the result was served from cache
   * @param {number} [results.score] - Retrieval quality score (0-1)
   * @param {boolean} [results.success] - Whether the query succeeded
   * @param {string} [results.error] - Error message if failed
   */
  endTrace(traceId, results = {}) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      logger.warn(`TelemetryCollector: unknown traceId ${traceId}`);
      return;
    }

    this.activeTraces.delete(traceId);

    const endTime = Date.now();
    const durationMs = endTime - trace.startTime;

    const entry = {
      traceId: trace.traceId,
      queryType: trace.queryType,
      userId: trace.userId,
      startTime: new Date(trace.startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      durationMs,
      chunks: results.chunks ?? 0,
      tokens: results.tokens ?? 0,
      cacheHit: results.cacheHit ?? false,
      score: results.score ?? null,
      success: results.success ?? true,
      error: results.error ?? null,
      metadata: trace.metadata,
    };

    // Add to ring buffer
    this.entries.push(entry);
    this.totalRecorded++;

    // Evict oldest entries if buffer is full
    if (this.entries.length > MAX_RING_BUFFER_SIZE) {
      this.entries = this.entries.slice(-MAX_RING_BUFFER_SIZE);
    }
  }

  /**
   * Get aggregated analytics for a user or globally.
   * 
   * @param {string} [userId] - Filter by user (null = global)
   * @param {string} [window='1h'] - Time window: '1h', '24h', '7d', 'all'
   * @returns {Object} Aggregated telemetry analytics
   */
  getAnalytics(userId = null, window = '24h') {
    const now = Date.now();
    const windowMs = this._parseWindow(window);

    let filtered = this.entries.filter((e) => {
      const entryTime = new Date(e.startTime).getTime();
      return (now - entryTime) <= windowMs;
    });

    if (userId) {
      filtered = filtered.filter((e) => e.userId === userId);
    }

    if (filtered.length === 0) {
      return {
        window,
        userId: userId || 'global',
        totalQueries: 0,
        successRate: 1.0,
        cacheHitRate: 0,
        latency: { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 },
        queryTypeDistribution: {},
        avgChunks: 0,
        avgScore: null,
        recentErrors: [],
        totalRecordedAllTime: this.totalRecorded,
      };
    }

    // Latency statistics
    const durations = filtered.map((e) => e.durationMs).sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)] || 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
    const p99 = durations[Math.floor(durations.length * 0.99)] || 0;
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const min = durations[0] || 0;
    const max = durations[durations.length - 1] || 0;

    // Success and cache rates
    const successCount = filtered.filter((e) => e.success).length;
    const cacheHitCount = filtered.filter((e) => e.cacheHit).length;

    // Query type distribution
    const queryTypeDistribution = {};
    for (const entry of filtered) {
      queryTypeDistribution[entry.queryType] = (queryTypeDistribution[entry.queryType] || 0) + 1;
    }

    // Average chunks and score
    const totalChunks = filtered.reduce((sum, e) => sum + (e.chunks || 0), 0);
    const scoredEntries = filtered.filter((e) => e.score !== null);
    const avgScore = scoredEntries.length > 0
      ? Math.round((scoredEntries.reduce((sum, e) => sum + e.score, 0) / scoredEntries.length) * 1000) / 1000
      : null;

    // Recent errors (last 10)
    const recentErrors = filtered
      .filter((e) => !e.success && e.error)
      .slice(-10)
      .map((e) => ({
        queryType: e.queryType,
        error: e.error,
        time: e.startTime,
        durationMs: e.durationMs,
      }));

    return {
      window,
      userId: userId || 'global',
      totalQueries: filtered.length,
      successRate: Math.round((successCount / filtered.length) * 1000) / 1000,
      cacheHitRate: Math.round((cacheHitCount / filtered.length) * 1000) / 1000,
      latency: { p50, p95, p99, avg, min, max },
      queryTypeDistribution,
      avgChunks: Math.round(totalChunks / filtered.length),
      avgScore,
      recentErrors,
      totalRecordedAllTime: this.totalRecorded,
    };
  }

  /**
   * Parse time window string to milliseconds.
   * @private
   */
  _parseWindow(window) {
    const map = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      'all': Number.MAX_SAFE_INTEGER,
    };
    return map[window] || map['24h'];
  }

  /**
   * Flush current entries to disk as JSONL (JSON Lines).
   * @private
   */
  async _flushToDisk() {
    if (this.entries.length === 0) return;

    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const filePath = path.join(TELEMETRY_DIR, `telemetry_${today}.jsonl`);

      // Append new entries as JSONL
      const lines = this.entries
        .map((entry) => JSON.stringify(entry))
        .join('\n') + '\n';

      await fs.appendFile(filePath, lines, 'utf-8');

      logger.info(`TelemetryCollector: flushed ${this.entries.length} entries to ${filePath}`);
    } catch (err) {
      logger.error('TelemetryCollector: disk flush error:', err);
    }
  }

  /**
   * Load today's entries from disk into the ring buffer.
   * @private
   */
  async _loadFromDisk() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const filePath = path.join(TELEMETRY_DIR, `telemetry_${today}.jsonl`);

      if (!existsSync(filePath)) return;

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          this.entries.push(entry);
          this.totalRecorded++;
        } catch {
          // Skip malformed lines
        }
      }

      // Enforce ring buffer limit
      if (this.entries.length > MAX_RING_BUFFER_SIZE) {
        this.entries = this.entries.slice(-MAX_RING_BUFFER_SIZE);
      }

      logger.info(`TelemetryCollector: loaded ${this.entries.length} entries from disk`);
    } catch (err) {
      logger.warn('TelemetryCollector: could not load from disk:', err.message);
    }
  }

  /**
   * Graceful shutdown — flush remaining entries.
   */
  async shutdown() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    await this._flushToDisk();
    logger.info('TelemetryCollector: shut down');
  }
}

// Singleton instance
export const telemetryCollector = new TelemetryCollector();

/**
 * Higher-order function that wraps a controller handler with telemetry.
 * 
 * @param {string} queryType - The query type label for telemetry
 * @param {Function} handler - The original controller handler (req, res) => void
 * @returns {Function} Instrumented handler
 */
export const withTelemetry = (queryType, handler) => {
  return async (req, res) => {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const traceId = telemetryCollector.startTrace(queryType, userId, {
      queryLength: (req.body?.query || req.body?.message || '').length,
    });

    // Intercept response to capture result metadata
    const originalJson = res.json.bind(res);
    const originalEnd = res.end.bind(res);
    let captured = false;

    const captureEnd = (results = {}) => {
      if (captured) return;
      captured = true;
      telemetryCollector.endTrace(traceId, {
        success: res.statusCode < 400,
        error: res.statusCode >= 400 ? results.error : null,
        ...results,
      });
    };

    res.json = function (body) {
      captureEnd({
        success: res.statusCode < 400,
        error: body?.error,
      });
      return originalJson(body);
    };

    // For SSE endpoints that call res.end() directly
    res.end = function (...args) {
      captureEnd({ success: res.statusCode < 400 });
      return originalEnd(...args);
    };

    try {
      await handler(req, res);
    } catch (err) {
      captureEnd({ success: false, error: err.message });
      throw err;
    }
  };
};
