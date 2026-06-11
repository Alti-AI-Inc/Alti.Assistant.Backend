import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'path';
import { logger } from '../../../shared/logger.js';
// This module does not create user-facing errors, so ApiError is not needed here.
// The withTelemetry wrapper re-throws errors to be handled by a global error middleware,
// which is responsible for normalizing them into ApiError responses.

/**
 * Phase 19: Query Telemetry Pipeline
 *
 * Persistent telemetry collector for LlamaIndex query endpoints.
 * Tracks latency, cache hits, error rates, retrieval quality scores,
 * and query type distributions across sessions.
 *
 * Architecture:
 *   - In-memory ring buffer for hot queries (used for analytics)
 *   - Separate buffer for entries awaiting flush to disk (to avoid re-writing)
 *   - Periodic flush to disk at storage/ragsystem/telemetry/
 *   - Future: MongoDB migration path via Mongoose model
 */

// PLATFORM OWNER: All key operational parameters are now configurable via environment variables.
// This allows a Platform Owner to tune the telemetry system's performance and resource usage
// without requiring a code deployment.

/**
 * @constant {number} MAX_RING_BUFFER_SIZE - Maximum number of completed telemetry entries to keep in memory for analytics.
 * @env {TELEMETRY_MAX_BUFFER} - Overrides the default value.
 */
const MAX_RING_BUFFER_SIZE = parseInt(process.env.TELEMETRY_MAX_BUFFER, 10) || 10000;
/**
 * @constant {number} FLUSH_INTERVAL_MS - Interval in milliseconds at which pending telemetry entries are flushed to disk.
 * @env {TELEMETRY_FLUSH_INTERVAL_MS} - Overrides the default value.
 */
const FLUSH_INTERVAL_MS = parseInt(process.env.TELEMETRY_FLUSH_INTERVAL_MS, 10) || 60_000; // Flush every 60 seconds
/**
 * @constant {number} ACTIVE_TRACE_CLEANUP_INTERVAL_MS - Interval in milliseconds at which active traces are checked for abandonment.
 * @env {TELEMETRY_CLEANUP_INTERVAL_MS} - Overrides the default value.
 */
const ACTIVE_TRACE_CLEANUP_INTERVAL_MS = parseInt(process.env.TELEMETRY_CLEANUP_INTERVAL_MS, 10) || 5 * 60 * 1000; // Clean up active traces every 5 minutes
/**
 * @constant {number} ACTIVE_TRACE_TIMEOUT_MS - Duration in milliseconds after which an active trace is considered abandoned if not explicitly ended.
 * @env {TELEMETRY_TRACE_TIMEOUT_MS} - Overrides the default value.
 */
const ACTIVE_TRACE_TIMEOUT_MS = parseInt(process.env.TELEMETRY_TRACE_TIMEOUT_MS, 10) || 10 * 60 * 1000; // Consider a trace abandoned if active for more than 10 minutes
/**
 * @constant {string} TELEMETRY_DIR - The absolute path to the directory where telemetry logs are stored.
 */
const TELEMETRY_DIR = path.resolve('storage/ragsystem/telemetry');

/**
 * @class TelemetryCollector
 * @description Manages the collection, storage, and retrieval of LlamaIndex query telemetry data.
 * It uses an in-memory ring buffer for real-time analytics and periodically flushes data to disk.
 */
class TelemetryCollector {
  /**
   * Creates an instance of TelemetryCollector.
   */
  constructor() {
    /**
     * @type {Map<string, Object>} activeTraces - Stores currently active telemetry traces, keyed by traceId.
     * Each trace object contains `traceId`, `queryType`, `userId`, `workspaceId`, `startTime`, `expiresAt`, and `metadata`.
     */
    this.activeTraces = new Map();

    /**
     * @type {Array<Object>} entries - A ring buffer of completed telemetry entries, used for in-memory analytics.
     */
    this.entries = [];

    /**
     * @type {Array<Object>} pendingFlushEntries - A buffer of completed telemetry entries awaiting flush to disk.
     */
    this.pendingFlushEntries = [];

    /**
     * @type {number} totalRecorded - A monotonic counter for the total number of telemetry entries ever recorded since the collector started.
     */
    this.totalRecorded = 0;

    /**
     * @type {NodeJS.Timeout|null} _flushTimer - The timer ID for the periodic disk flush operation.
     * @private
     */
    this._flushTimer = null;

    /**
     * @type {NodeJS.Timeout|null} _cleanupTimer - The timer ID for the periodic active trace cleanup operation.
     * @private
     */
    this._cleanupTimer = null;

    /**
     * @type {boolean} _initialized - Flag indicating whether the collector has been initialized.
     * @private
     */
    this._initialized = false;
  }

  /**
   * Initializes the telemetry collector.
   * This involves creating the storage directory if it doesn't exist,
   * loading existing telemetry data from today's log file, and
   * starting the periodic disk flush and active trace cleanup timers.
   * This method is idempotent.
   * @returns {void}
   */
  initialize() {
    if (this._initialized) return;

    try {
      if (!existsSync(TELEMETRY_DIR)) {
        // This is a synchronous operation, but it's critical for initialization.
        // If it fails, the catch block will handle it.
        mkdirSync(TELEMETRY_DIR, { recursive: true });
        // GCP Audit: Changed to structured log format.
        logger.info('TelemetryCollector: Created telemetry directory', { path: TELEMETRY_DIR });
      }

      // Load existing entries from today's log file into the ring buffer.
      // This is an unawaited promise. Errors are handled in the catch block.
      this._loadFromDisk().catch((err) => {
        // The error is already logged with details in _loadFromDisk.
        logger.error('TelemetryCollector: Initialization failed during disk load.', { error: err });
      });

      // Start periodic flush
      this._flushTimer = setInterval(() => {
        this._flushToDisk().catch(() => {
          // The error is already logged with details in _flushToDisk.
          // This catch just prevents an unhandled promise rejection from crashing the process.
        });
      }, FLUSH_INTERVAL_MS);

      // Start periodic active trace cleanup
      this._cleanupTimer = setInterval(() => {
        this._cleanupActiveTraces();
      }, ACTIVE_TRACE_CLEANUP_INTERVAL_MS);

      // Ensure timers don't prevent process exit
      if (this._flushTimer.unref) {
        this._flushTimer.unref();
      }
      if (this._cleanupTimer.unref) {
        this._cleanupTimer.unref();
      }

      this._initialized = true;
      logger.info('TelemetryCollector initialized', {
        MAX_RING_BUFFER_SIZE,
        FLUSH_INTERVAL_MS,
        ACTIVE_TRACE_TIMEOUT_MS,
      });
    } catch (err) {
      // This will catch synchronous errors from mkdirSync.
      logger.error('TelemetryCollector: Fatal initialization error. Telemetry will be disabled.', { error: err });
      // To prevent further errors, we can mark it as initialized but effectively disabled.
      this._initialized = true; // Prevents re-attempts
    }
  }

  /**
   * Begins a new telemetry trace for a query.
   * An active trace is stored internally and will be completed by `endTrace`.
   * If the collector is not yet initialized, it will be initialized on the first call.
   *
   * @param {string} queryType - The endpoint or query type (e.g., 'query', 'query-stream', 'query-classify').
   * @param {string} userId - The identifier of the user initiating the query.
   * @param {string} workspaceId - The identifier of the workspace the query belongs to.
   * @param {Object} [metadata={}] - Additional metadata relevant to the query (e.g., query text length, mode).
   * @returns {string} traceId - A unique identifier for the started trace. This ID must be used to call `endTrace()`.
   */
  startTrace(queryType, userId, workspaceId, metadata = {}) {
    // Ensure collector is initialized. This call is idempotent after the first successful initialization.
    this.initialize();

    const traceId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    this.activeTraces.set(traceId, {
      traceId,
      queryType,
      userId,
      workspaceId, // INTEGRATION: Store workspaceId for tenant context
      startTime: startTime,
      expiresAt: startTime + ACTIVE_TRACE_TIMEOUT_MS, // Add expiration timestamp
      metadata,
    });

    return traceId;
  }

  /**
   * Completes an active telemetry trace with the provided results.
   * The trace is removed from active traces and recorded into the in-memory buffer
   * and the pending flush buffer for disk persistence.
   *
   * @param {string} traceId - The unique identifier of the trace, obtained from `startTrace()`.
   * @param {Object} [results={}] - An object containing the results and outcome of the trace.
   * @param {number} [results.chunks=0] - The number of retrieved chunks during the query.
   * @param {number} [results.tokens=0] - The estimated token count processed by the query.
   * @param {boolean} [results.cacheHit=false] - Indicates whether the result was served from cache.
   * @param {number|null} [results.score=null] - A retrieval quality score (e.g., 0-1), if applicable.
   * @param {boolean} [results.success=true] - Indicates whether the query succeeded.
   * @param {string|null} [results.error=null] - An error message if the query failed.
   * @returns {void}
   */
  endTrace(traceId, results = {}) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      // GCP Audit: Changed to structured log format.
      logger.warn('TelemetryCollector: unknown or expired traceId', { traceId });
      return;
    }

    this.activeTraces.delete(traceId);

    const endTime = Date.now();
    const durationMs = endTime - trace.startTime;

    const entry = {
      traceId: trace.traceId,
      queryType: trace.queryType,
      userId: trace.userId,
      workspaceId: trace.workspaceId, // INTEGRATION: Persist workspaceId
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

    // Add to ring buffer for analytics
    this.entries.push(entry);
    // Add to pending flush buffer for disk persistence
    this.pendingFlushEntries.push(entry);

    this.totalRecorded++;

    // Evict oldest entries if ring buffer is full
    if (this.entries.length > MAX_RING_BUFFER_SIZE) {
      this.entries = this.entries.slice(-MAX_RING_BUFFER_SIZE);
    }
  }

  /**
   * Retrieves aggregated analytics for telemetry data.
   * Analytics are computed from the in-memory ring buffer, filtered by context and time window.
   * PLATFORM OWNER: Call without filters to get a global, system-wide aggregate view.
   *
   * @param {Object} [filters={}] - Optional. An object containing filters for the analytics.
   * @param {string} [filters.userId] - Filters analytics to a specific user.
   * @param {string} [filters.workspaceId] - Filters analytics to a specific workspace.
   * @param {string} [window='24h'] - The time window for aggregation. Supported values: '1h', '6h', '24h', '7d', '30d', 'all'.
   * @returns {Object} An object containing aggregated telemetry analytics.
   */
  getAnalytics(filters = {}, window = '24h') {
    const now = Date.now();
    const windowMs = this._parseWindow(window);

    // Analytics are based on the in-memory ring buffer
    let filtered = this.entries.filter((e) => {
      const entryTime = new Date(e.startTime).getTime();
      return (now - entryTime) <= windowMs;
    });

    // SECURITY: Apply filters to respect tenant/user boundaries.
    // The calling service is responsible for providing the correct filters based on the requester's role.
    // A Platform Owner can omit filters to see global data.
    if (filters.workspaceId) {
      filtered = filtered.filter((e) => e.workspaceId === filters.workspaceId);
    }
    if (filters.userId) {
      filtered = filtered.filter((e) => e.userId === filters.userId);
    }

    if (filtered.length === 0) {
      return {
        window,
        filters,
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
      filters,
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
   * PLATFORM OWNER: Retrieves high-level statistics for each tenant (workspace) in the system.
   * This provides a global oversight view of tenant activity and performance.
   *
   * @param {string} [window='24h'] - The time window for aggregation. Supported values: '1h', '6h', '24h', '7d', '30d', 'all'.
   * @returns {Array<Object>} An array of objects, each containing statistics for a specific workspace.
   */
  getGlobalTenantStats(window = '24h') {
    const now = Date.now();
    const windowMs = this._parseWindow(window);

    const entriesInWindow = this.entries.filter((e) => {
      const entryTime = new Date(e.startTime).getTime();
      return (now - entryTime) <= windowMs;
    });

    const statsByWorkspace = new Map();

    for (const entry of entriesInWindow) {
      if (!entry.workspaceId) continue;

      if (!statsByWorkspace.has(entry.workspaceId)) {
        statsByWorkspace.set(entry.workspaceId, {
          totalQueries: 0,
          successCount: 0,
          totalDurationMs: 0,
          durations: [],
        });
      }

      const stats = statsByWorkspace.get(entry.workspaceId);
      stats.totalQueries++;
      if (entry.success) {
        stats.successCount++;
      }
      stats.totalDurationMs += entry.durationMs;
      stats.durations.push(entry.durationMs);
    }

    const result = [];
    for (const [workspaceId, stats] of statsByWorkspace.entries()) {
      stats.durations.sort((a, b) => a - b);
      const p95 = stats.durations[Math.floor(stats.durations.length * 0.95)] || 0;

      result.push({
        workspaceId,
        totalQueries: stats.totalQueries,
        successRate: stats.totalQueries > 0 ? Math.round((stats.successCount / stats.totalQueries) * 1000) / 1000 : 1.0,
        avgLatencyMs: stats.totalQueries > 0 ? Math.round(stats.totalDurationMs / stats.totalQueries) : 0,
        p95LatencyMs: p95,
      });
    }

    // Sort by most active tenants
    return result.sort((a, b) => b.totalQueries - a.totalQueries);
  }

  /**
   * PLATFORM OWNER: Retrieves raw, persisted log entries from a specific day's log file.
   * This allows for deep-dive analysis and auditing of all platform activity.
   *
   * @param {Object} options - The options for retrieving raw logs.
   * @param {string} [options.date] - The date for which to retrieve logs, in 'YYYY-MM-DD' format. Defaults to today.
   * @param {Object} [options.filters={}] - Optional filters to apply to the logs.
   * @param {string} [options.filters.workspaceId] - Filter logs by workspace ID.
   * @param {string} [options.filters.userId] - Filter logs by user ID.
   * @returns {Promise<Array<Object>>} A promise that resolves to an array of log entry objects.
   */
  async getRawLogs({ date, filters = {} }) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const filePath = path.join(TELEMETRY_DIR, `telemetry_${targetDate}.jsonl`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const entries = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          // Apply filters
          if (filters.workspaceId && entry.workspaceId !== filters.workspaceId) continue;
          if (filters.userId && entry.userId !== filters.userId) continue;
          entries.push(entry);
        } catch (parseError) {
          logger.warn('TelemetryCollector: Skipping malformed line in getRawLogs.', { line, error: parseError });
        }
      }
      return entries;
    } catch (err) {
      if (err.code === 'ENOENT') {
        // File not found is a normal case (e.g., no activity on that day)
        return [];
      }
      logger.error('TelemetryCollector: Error reading raw telemetry file from disk.', { filePath, error: err });
      throw err; // Re-throw other errors
    }
  }

  /**
   * Parses a time window string (e.g., '1h', '24h', '7d') into its equivalent duration in milliseconds.
   * Defaults to '24h' if an unknown window is provided. 'all' maps to a very large number.
   * @private
   * @param {string} window - The time window string.
   * @returns {number} The duration in milliseconds.
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
   * Flushes all pending telemetry entries to a daily log file on disk in JSONL (JSON Lines) format.
   * This method is called periodically by a timer.
   * It handles potential data serialization errors gracefully by dropping invalid entries.
   * If the disk write fails, valid entries are re-added to the pending buffer for a retry.
   * @private
   * @returns {Promise<void>} A promise that resolves when the flush operation is complete.
   */
  async _flushToDisk() {
    if (this.pendingFlushEntries.length === 0) return;

    // Take a snapshot of entries to flush and clear the buffer immediately
    // to allow new entries to be added without blocking.
    const entriesToFlush = this.pendingFlushEntries;
    this.pendingFlushEntries = [];

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filePath = path.join(TELEMETRY_DIR, `telemetry_${today}.jsonl`);

    // Partition entries into those that can be stringified and those that cannot.
    // This prevents a single "poison pill" entry from blocking the entire flush process.
    const goodEntries = [];
    const stringifiedLines = [];
    let droppedCount = 0;

    for (const entry of entriesToFlush) {
      try {
        stringifiedLines.push(JSON.stringify(entry));
        goodEntries.push(entry);
      } catch (stringifyError) {
        droppedCount++;
        logger.error('TelemetryCollector: Failed to stringify telemetry entry; it will be dropped.', {
          traceId: entry?.traceId,
          error: stringifyError,
        });
      }
    }

    if (goodEntries.length === 0) {
      if (droppedCount > 0) {
        logger.warn('TelemetryCollector: All pending entries failed to stringify; nothing flushed to disk.', {
          count: droppedCount,
        });
      }
      return;
    }

    try {
      const content = stringifiedLines.join('\n') + '\n';
      await fs.appendFile(filePath, content, 'utf-8');

      // GCP Audit: Changed to structured log format.
      logger.info('TelemetryCollector: flushed entries to disk', {
        count: goodEntries.length,
        dropped: droppedCount,
        path: filePath,
      });
    } catch (err) {
      logger.error('TelemetryCollector: Failed to flush telemetry entries to disk. Valid entries will be retried.', {
        filePath,
        entryCount: goodEntries.length,
        error: err,
      });
      // If flush fails, re-add the entries that were successfully stringified to retry later.
      this.pendingFlushEntries.unshift(...goodEntries);
      // Re-throw so the caller (setInterval's catch block) is aware of the failure.
      throw err;
    }
  }

  /**
   * Loads telemetry entries from today's log file on disk into the in-memory ring buffer.
   * This is typically called during initialization to restore recent data.
   * Malformed lines in the log file are skipped.
   * @private
   * @returns {Promise<void>} A promise that resolves when entries have been loaded.
   */
  async _loadFromDisk() {
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(TELEMETRY_DIR, `telemetry_${today}.jsonl`);

    // Check for file existence first to avoid throwing an error for a common case.
    if (!existsSync(filePath)) {
      return; // No file to load, which is a normal condition on a new day.
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      let loadedCount = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          this.entries.push(entry);
          this.totalRecorded++;
          loadedCount++;
        } catch (parseError) {
          // Log malformed lines as a warning, but don't stop the process.
          logger.warn('TelemetryCollector: Skipping malformed line in telemetry log.', { line, error: parseError });
        }
      }

      // Enforce ring buffer limit
      if (this.entries.length > MAX_RING_BUFFER_SIZE) {
        this.entries = this.entries.slice(-MAX_RING_BUFFER_SIZE);
      }

      if (loadedCount > 0) {
        // GCP Audit: Changed to structured log format.
        logger.info('TelemetryCollector: loaded entries from disk', { count: loadedCount });
      }
    } catch (err) {
      // This catch block now handles file system errors (e.g., read permissions).
      logger.error('TelemetryCollector: Error reading telemetry file from disk.', { filePath, error: err });
      // Re-throw to be caught by the caller in initialize()
      throw err;
    }
  }

  /**
   * Periodically cleans up active traces that have exceeded their `ACTIVE_TRACE_TIMEOUT_MS`.
   * Abandoned traces are logged as errors and recorded as failed entries.
   * @private
   * @returns {void}
   */
  _cleanupActiveTraces() {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [traceId, trace] of this.activeTraces.entries()) {
      if (trace.expiresAt < now) {
        this.activeTraces.delete(traceId);
        cleanedCount++;
        // GCP Audit: Changed to structured log format.
        logger.warn('TelemetryCollector: cleaned up abandoned trace', {
          traceId,
          queryType: trace.queryType,
          userId: trace.userId,
          workspaceId: trace.workspaceId,
        });

        // Record an "abandoned" entry to both the ring buffer and pending flush
        const abandonedEntry = {
          traceId: trace.traceId,
          queryType: trace.queryType,
          userId: trace.userId,
          workspaceId: trace.workspaceId, // INTEGRATION: Persist workspaceId for abandoned traces
          startTime: new Date(trace.startTime).toISOString(),
          endTime: new Date(trace.expiresAt).toISOString(), // Use expiration time as end time
          durationMs: trace.expiresAt - trace.startTime,
          success: false,
          error: 'Trace abandoned/timed out',
          metadata: trace.metadata,
        };
        this.entries.push(abandonedEntry);
        this.pendingFlushEntries.push(abandonedEntry);
        this.totalRecorded++;
        if (this.entries.length > MAX_RING_BUFFER_SIZE) {
          this.entries = this.entries.slice(-MAX_RING_BUFFER_SIZE);
        }
      }
    }
    if (cleanedCount > 0) {
      // GCP Audit: Changed to structured log format.
      logger.info('TelemetryCollector: cleaned up abandoned active traces', { count: cleanedCount });
    }
  }

  /**
   * Performs a graceful shutdown of the telemetry collector.
   * This involves clearing all active timers and ensuring any remaining pending entries
   * are flushed to disk before the process exits.
   * @returns {Promise<void>} A promise that resolves when the shutdown process is complete.
   */
  async shutdown() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    // Ensure all pending entries are flushed before shutdown
    try {
      await this._flushToDisk();
      logger.info('TelemetryCollector: shut down');
    } catch (err) {
      logger.error('TelemetryCollector: Final flush on shutdown failed.', { error: err });
    }
  }
}

/**
 * @type {TelemetryCollector} telemetryCollector - A singleton instance of the TelemetryCollector.
 * This instance should be used throughout the application to collect and manage telemetry data.
 */
export const telemetryCollector = new TelemetryCollector();

/**
 * A higher-order function that wraps an Express controller handler to automatically
 * collect telemetry data for the request. It starts a trace before the handler
 * executes and ends it upon response completion, capturing success/failure and other
 * relevant metadata. It is robust against premature client disconnects.
 *
 * @param {string} queryType - A descriptive label for the type of query or operation being performed (e.g., 'query', 'query-stream').
 * @param {Function} handler - The original Express controller handler function with signature `(req, res, next) => Promise<void>`.
 * @returns {Function} An instrumented Express handler function that includes telemetry tracking.
 */
export const withTelemetry = (queryType, handler) => {
  // The handler must be an async function to be properly wrapped.
  return async (req, res, next) => {
    // INTEGRATION: Capture userId and workspaceId to enforce tenant boundaries.
    const userId = req.user?.userId || req.user?.id || 'unauthenticated_user';
    const workspaceId = req.user?.workspaceId || 'default_workspace';
    const traceId = telemetryCollector.startTrace(queryType, userId, workspaceId, {
      queryLength: (req.body?.query || req.body?.message || '').length,
    });

    const originalJson = res.json.bind(res);
    const originalEnd = res.end.bind(res);
    let captured = false;

    /**
     * Helper function to ensure telemetry.endTrace is called only once.
     * @param {Object} [results={}] - Results object to pass to endTrace.
     */
    const captureEnd = (results = {}) => {
      if (captured) return;
      captured = true;
      // BUGFIX: Clean up listener to prevent memory leaks.
      res.removeListener('close', captureOnClose);

      const finalResults = { ...results };

      // Preserve error from results if it exists.
      // If not, and the request failed by status code, provide a default message.
      finalResults.error = finalResults.error ?? (res.statusCode >= 400 ? `Request failed with status code ${res.statusCode}` : null);

      // Determine success. If an error exists, it's not a success.
      // Otherwise, base it on status code. `results.success` can override.
      finalResults.success = finalResults.error ? false : (finalResults.success ?? (res.statusCode < 400));

      telemetryCollector.endTrace(traceId, finalResults);
    };

    // BUGFIX: Add listener for premature client disconnect to ensure trace is ended.
    const captureOnClose = () => {
      captureEnd({
        success: false,
        error: 'Client connection closed prematurely',
      });
    };
    res.on('close', captureOnClose);

    // Override res.json to capture telemetry before sending JSON response
    res.json = function (body) {
      captureEnd({
        // If the body contains an error property, capture it.
        error: body?.error,
      });
      return originalJson(body);
    };

    // Override res.end for cases like SSE endpoints that call res.end() directly
    res.end = function (...args) {
      // Only capture if not already captured by res.json or an error.
      captureEnd();
      return originalEnd(...args);
    };

    try {
      // Pass `next` to the handler if it's designed as standard middleware.
      await handler(req, res, next);
    } catch (err) {
      // Log the full error with stack trace for internal diagnostics.
      // The global error handler will be responsible for normalizing this into an ApiError for the user.
      // GCP Audit: Changed to structured log format with a static message.
      logger.error('Error in handler for telemetry trace', {
        error: err, // Winston will handle serializing the error object
        traceId,
        queryType,
        userId,
        workspaceId, // INTEGRATION: Add workspaceId to error logs
      });

      // Ensure telemetry is captured even if the handler throws an error.
      // Use the error message for the telemetry record.
      captureEnd({ success: false, error: err.message });

      // Re-throw the error to be handled by the global Express error middleware.
      // This ensures the response is still sent correctly by the upstream handler.
      throw err;
    }
  };
};