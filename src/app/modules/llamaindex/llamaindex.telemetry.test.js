import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryCollector, withTelemetry, telemetryCollector } from './llamaindex.telemetry.js';

const {
  mockFsPromises,
  mockFs,
  mockPath,
  mockLogger
} = vi.hoisted(() => {
  // Mock dependencies
  const mockFsPromises = {
    appendFile: vi.fn(),
    readFile: vi.fn(),
  };
  const mockFs = {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
  const mockPath = {
    resolve: vi.fn().mockImplementation((p) => p), // Simplify for testing, assume current dir
    join: vi.fn().mockImplementation((...args) => args.join('/')), // Simplify for testing
  };
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    mockFsPromises,
    mockFs,
    mockPath,
    mockLogger
  };
});

// Mock global timers
const mockSetInterval = vi.fn().mockImplementation(() => ({ unref: vi.fn() }));
const mockClearInterval = vi.fn();

// Mock Date.now() for consistent time
const MOCK_START_TIME = 1678886400000; // March 15, 2023 12:00:00 PM UTC

vi.mock('node:fs/promises', () => ({ default: mockFsPromises }));
vi.mock('node:fs', () => mockFs);
vi.mock('path', () => mockPath);
vi.mock('../../../shared/logger.js', () => ({ logger: mockLogger }));

// Mock global timers
vi.stubGlobal('setInterval', mockSetInterval);
vi.stubGlobal('clearInterval', mockClearInterval);

describe('TelemetryCollector', () => {
  let collector;
  let originalMaxRingBufferSize; // To store and restore the constant

  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(MOCK_START_TIME); // Reset time for each test

    // Reset the collector instance for each test to ensure isolation
    collector = new TelemetryCollector();

    // Default mocks for fs operations
    mockFs.existsSync.mockReturnValue(true); // Assume dir exists by default
    mockFsPromises.readFile.mockResolvedValue(''); // Assume empty file by default

    // Store original constant and temporarily modify for specific tests
    originalMaxRingBufferSize = collector.MAX_RING_BUFFER_SIZE;
  });

  afterEach(() => {
    vi.useRealTimers(); // Restore real timers after each test
    // Restore original constant
    collector.MAX_RING_BUFFER_SIZE = originalMaxRingBufferSize;
  });

  // Helper to advance time
  const advanceTime = (ms) => {
    vi.setSystemTime(vi.getRealSystemTime() + ms);
  };

  // Test constructor
  it('should initialize with correct default state', () => {
    expect(collector.activeTraces).toBeInstanceOf(Map);
    expect(collector.entries).toEqual([]);
    expect(collector.totalRecorded).toBe(0);
    expect(collector._flushTimer).toBeNull();
    expect(collector._initialized).toBe(false);
  });

  // Test initialize()
  describe('initialize', () => {
    it('should create telemetry directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      collector.initialize();
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('storage/ragsystem/telemetry', { recursive: true });
      expect(mockLogger.info).toHaveBeenCalledWith('TelemetryCollector initialized');
    });

    it('should not create directory if it already exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      collector.initialize();
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('TelemetryCollector initialized');
    });

    it('should start a periodic flush timer and unref it', () => {
      collector.initialize();
      expect(mockSetInterval).toHaveBeenCalledTimes(1);
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 60_000);
      expect(collector._flushTimer.unref).toHaveBeenCalledTimes(1);
    });

    it('should call _loadFromDisk on initialization', async () => {
      const loadSpy = vi.spyOn(collector, '_loadFromDisk');
      collector.initialize();
      expect(loadSpy).toHaveBeenCalledTimes(1);
      // Allow promises to settle
      await vi.runAllTimersAsync();
      loadSpy.mockRestore();
    });

    it('should log a warning if _loadFromDisk fails', async () => {
      mockFsPromises.readFile.mockRejectedValue(new Error('Read error'));
      collector.initialize();
      await vi.runAllTimersAsync(); // This will allow the promise in initialize to settle
      expect(mockLogger.warn).toHaveBeenCalledWith('TelemetryCollector: could not load existing entries:', 'Read error');
    });

    it('should log an error if initialization fails (e.g., mkdirSync)', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => { throw new Error('Permission denied'); });
      collector.initialize();
      expect(mockLogger.error).toHaveBeenCalledWith('TelemetryCollector initialization error:', expect.any(Error));
      expect(collector._initialized).toBe(false); // Should not be initialized on error
    });

    it('should only initialize once', () => {
      collector.initialize();
      expect(mockLogger.info).toHaveBeenCalledWith('TelemetryCollector initialized');
      mockLogger.info.mockClear(); // Clear previous log
      collector.initialize(); // Call again
      expect(mockLogger.info).not.toHaveBeenCalled(); // Should not log again
      expect(mockSetInterval).toHaveBeenCalledTimes(1); // Should not start timer again
    });
  });

  // Test startTrace()
  describe('startTrace', () => {
    it('should call initialize if not already initialized', () => {
      const initSpy = vi.spyOn(collector, 'initialize');
      collector.startTrace('query', 'user1');
      expect(initSpy).toHaveBeenCalledTimes(1);
      initSpy.mockRestore();
    });

    it('should generate a unique traceId', () => {
      const traceId1 = collector.startTrace('query', 'user1');
      const traceId2 = collector.startTrace('query', 'user1');
      expect(traceId1).toMatch(/^t_\d+_[a-z0-9]{6}$/);
      expect(traceId1).not.toEqual(traceId2);
    });

    it('should add a new trace to activeTraces', () => {
      const traceId = collector.startTrace('query', 'user1', { mode: 'fast' });
      expect(collector.activeTraces.has(traceId)).toBe(true);
      const trace = collector.activeTraces.get(traceId);
      expect(trace).toEqual({
        traceId,
        queryType: 'query',
        userId: 'user1',
        startTime: MOCK_START_TIME,
        metadata: { mode: 'fast' },
      });
    });
  });

  // Test endTrace()
  describe('endTrace', () => {
    it('should log a warning for unknown traceId', () => {
      collector.endTrace('non-existent-trace');
      expect(mockLogger.warn).toHaveBeenCalledWith('TelemetryCollector: unknown traceId non-existent-trace');
      expect(collector.entries).toHaveLength(0);
    });

    it('should remove the trace from activeTraces', () => {
      const traceId = collector.startTrace('query', 'user1');
      expect(collector.activeTraces.has(traceId)).toBe(true);
      collector.endTrace(traceId);
      expect(collector.activeTraces.has(traceId)).toBe(false);
    });

    it('should add a completed entry to entries and increment totalRecorded', () => {
      const traceId = collector.startTrace('query', 'user1', { queryText: 'hello' });
      advanceTime(100); // Simulate 100ms duration
      collector.endTrace(traceId, { chunks: 5, tokens: 100, cacheHit: true, score: 0.8, success: true });

      expect(collector.entries).toHaveLength(1);
      expect(collector.totalRecorded).toBe(1);
      const entry = collector.entries[0];
      expect(entry).toEqual({
        traceId,
        queryType: 'query',
        userId: 'user1',
        startTime: new Date(MOCK_START_TIME).toISOString(),
        endTime: new Date(MOCK_START_TIME + 100).toISOString(),
        durationMs: 100,
        chunks: 5,
        tokens: 100,
        cacheHit: true,
        score: 0.8,
        success: true,
        error: null,
        metadata: { queryText: 'hello' },
      });
    });

    it('should use default values for results if not provided', () => {
      const traceId = collector.startTrace('query', 'user1');
      advanceTime(50);
      collector.endTrace(traceId); // No results object

      expect(collector.entries).toHaveLength(1);
      const entry = collector.entries[0];
      expect(entry.chunks).toBe(0);
      expect(entry.tokens).toBe(0);
      expect(entry.cacheHit).toBe(false);
      expect(entry.score).toBeNull();
      expect(entry.success).toBe(true);
      expect(entry.error).toBeNull();
    });

    it('should enforce MAX_RING_BUFFER_SIZE', () => {
      collector.MAX_RING_BUFFER_SIZE = 3; // Temporarily reduce for testing

      for (let i = 0; i < 5; i++) {
        const traceId = collector.startTrace(`query${i}`, `user${i}`);
        advanceTime(10);
        collector.endTrace(traceId, { success: true });
      }

      expect(collector.entries).toHaveLength(3);
      expect(collector.totalRecorded).toBe(5);
      expect(collector.entries[0].queryType).toBe('query2'); // Oldest (query0, query1) should be evicted
      expect(collector.entries[2].queryType).toBe('query4'); // Newest
    });
  });

  // Test getAnalytics()
  describe('getAnalytics', () => {
    beforeEach(() => {
      // Populate with some test data
      // Query 1: user1, 100ms, success, cache, score 0.9, 5 chunks, 100 tokens, 10 mins ago
      collector.startTrace('query', 'user1', { mode: 'fast' });
      advanceTime(100);
      collector.endTrace(collector.activeTraces.keys().next().value, { chunks: 5, tokens: 100, cacheHit: true, score: 0.9, success: true });
      advanceTime(10 * 60 * 1000); // Advance 10 minutes

      // Query 2: user1, 200ms, success, no cache, score 0.7, 10 chunks, 200 tokens, 20 mins ago
      collector.startTrace('query-stream', 'user1');
      advanceTime(200);
      collector.endTrace(collector.activeTraces.keys().next().value, { chunks: 10, tokens: 200, cacheHit: false, score: 0.7, success: true });
      advanceTime(10 * 60 * 1000); // Advance 10 minutes

      // Query 3: user2, 50ms, success, cache, no score, 3 chunks, 50 tokens, 30 mins ago
      collector.startTrace('query', 'user2');
      advanceTime(50);
      collector.endTrace(collector.activeTraces.keys().next().value, { chunks: 3, tokens: 50, cacheHit: true, success: true });
      advanceTime(10 * 60 * 1000); // Advance 10 minutes

      // Query 4: user1, 300ms, failure, no cache, no score, 0 chunks, 0 tokens, 40 mins ago
      collector.startTrace('query-classify', 'user1');
      advanceTime(300);
      collector.endTrace(collector.activeTraces.keys().next().value, { success: false, error: 'LLM error' });
      advanceTime(10 * 60 * 1000); // Advance 10 minutes

      // Query 5: user2, 150ms, success, no cache, score 0.8, 7 chunks, 150 tokens, 50 mins ago
      collector.startTrace('query', 'user2');
      advanceTime(150);
      collector.endTrace(collector.activeTraces.keys().next().value, { chunks: 7, tokens: 150, cacheHit: false, score: 0.8, success: true });
      advanceTime(10 * 60 * 1000); // Advance 10 minutes

      // Total 5 queries, total recorded should be 5
      expect(collector.entries).toHaveLength(5);
      expect(collector.totalRecorded).toBe(5);
    });

    it('should return initial state if no entries match the window/user', () => {
      const analytics = collector.getAnalytics('nonexistent_user');
      expect(analytics).toEqual({
        window: '24h',
        userId: 'nonexistent_user',
        totalQueries: 0,
        successRate: 1.0,
        cacheHitRate: 0,
        latency: { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 },
        queryTypeDistribution: {},
        avgChunks: 0,
        avgScore: null,
        recentErrors: [],
        totalRecordedAllTime: 5, // Total recorded should still be 5
      });
    });

    it('should calculate global analytics for default 24h window', () => {
      const analytics = collector.getAnalytics(); // Global, 24h
      expect(analytics.totalQueries).toBe(5);
      expect(analytics.successRate).toBe(0.8); // 4/5
      expect(analytics.cacheHitRate).toBe(0.4); // 2/5
      expect(analytics.latency.avg).toBe(160); // (100+200+50+300+150)/5 = 800/5 = 160
      expect(analytics.latency.min).toBe(50);
      expect(analytics.latency.max).toBe(300);
      expect(analytics.latency.p50).toBe(150); // Sorted: 50, 100, 150, 200, 300 -> p50 is 150
      expect(analytics.latency.p95).toBe(300); // p95 is 300
      expect(analytics.latency.p99).toBe(300); // p99 is 300
      expect(analytics.queryTypeDistribution).toEqual({
        'query': 2,
        'query-stream': 1,
        'query-classify': 1,
      });
      expect(analytics.avgChunks).toBe(5); // (5+10+3+0+7)/5 = 25/5 = 5
      expect(analytics.avgScore).toBe(0.8); // (0.9+0.7+0.8)/3 = 2.4/3 = 0.8
      expect(analytics.recentErrors).toHaveLength(1);
      expect(analytics.recentErrors[0].error).toBe('LLM error');
      expect(analytics.totalRecordedAllTime).toBe(5);
    });

    it('should calculate user-specific analytics', () => {
      const analytics = collector.getAnalytics('user1');
      expect(analytics.totalQueries).toBe(3); // Query 1, 2, 4
      expect(analytics.successRate).toBe(0.667); // 2/3
      expect(analytics.cacheHitRate).toBe(0.333); // 1/3
      expect(analytics.latency.avg).toBe(200); // (100+200+300)/3 = 600/3 = 200
      expect(analytics.latency.p50).toBe(200); // Sorted: 100, 200, 300 -> p50 is 200
      expect(analytics.queryTypeDistribution).toEqual({
        'query': 1,
        'query-stream': 1,
        'query-classify': 1,
      });
      expect(analytics.avgChunks).toBe(5); // (5+10+0)/3 = 15/3 = 5
      expect(analytics.avgScore).toBe(0.8); // (0.9+0.7)/2 = 1.6/2 = 0.8
      expect(analytics.recentErrors).toHaveLength(1);
      expect(analytics.recentErrors[0].error).toBe('LLM error');
    });

    it('should filter by time window (e.g., 1h)', () => {
      // All 5 queries are within 1 hour (50 mins total elapsed)
      const analytics = collector.getAnalytics(null, '1h');
      expect(analytics.totalQueries).toBe(5);

      // Advance time significantly so only recent queries are included
      advanceTime(2 * 60 * 60 * 1000); // Advance 2 hours
      const analyticsAfterWindow = collector.getAnalytics(null, '1h');
      // Now, all queries are outside the 1h window relative to the new current time.
      expect(analyticsAfterWindow.totalQueries).toBe(0);
      expect(analyticsAfterWindow.totalRecordedAllTime).toBe(5); // Still 5 total recorded

      // Let's re-setup for a specific window test
      collector = new TelemetryCollector(); // Reset collector
      vi.setSystemTime(MOCK_START_TIME);

      collector.startTrace('q1', 'u1'); advanceTime(100); collector.endTrace(collector.activeTraces.keys().next().value);
      advanceTime(30 * 60 * 1000); // 30 mins later
      collector.startTrace('q2', 'u1'); advanceTime(100); collector.endTrace(collector.activeTraces.keys().next().value);
      advanceTime(30 * 60 * 1000); // 30 mins later (total 60 mins from q1 start)
      collector.startTrace('q3', 'u1'); advanceTime(100); collector.endTrace(collector.activeTraces.keys().next().value);
      advanceTime(30 * 60 * 1000); // 30 mins later (total 90 mins from q1 start)

      // At this point:
      // q1: MOCK_START_TIME (0 min)
      // q2: MOCK_START_TIME + 30 min
      // q3: MOCK_START_TIME + 60 min
      // Current time: MOCK_START_TIME + 90 min

      // 1h window (3600000 ms)
      // q3 is within 1h (90-60 = 30 min ago)
      // q2 is within 1h (90-30 = 60 min ago) - just at the edge
      // q1 is outside 1h (90-0 = 90 min ago)
      const analytics1h = collector.getAnalytics(null, '1h');
      expect(analytics1h.totalQueries).toBe(2); // q2, q3
      expect(analytics1h.queryTypeDistribution).toEqual({ 'q2': 1, 'q3': 1 });

      // 30d window should include all
      const analytics30d = collector.getAnalytics(null, '30d');
      expect(analytics30d.totalQueries).toBe(3);
    });

    it('should handle entries with null/undefined values gracefully', () => {
      collector = new TelemetryCollector();
      vi.setSystemTime(MOCK_START_TIME);

      collector.startTrace('q1', 'u1'); advanceTime(100); collector.endTrace(collector.activeTraces.keys().next().value, { score: null, chunks: null });
      collector.startTrace('q2', 'u1'); advanceTime(200); collector.endTrace(collector.activeTraces.keys().next().value, { score: undefined, chunks: undefined });
      collector.startTrace('q3', 'u1'); advanceTime(300); collector.endTrace(collector.activeTraces.keys().next().value, { score: 0.5, chunks: 10 });

      const analytics = collector.getAnalytics('u1');
      expect(analytics.totalQueries).toBe(3);
      expect(analytics.avgScore).toBe(0.5); // Only q3 has a score
      expect(analytics.avgChunks).toBe(3); // (0+0+10)/3 = 3.33 -> 3
    });
  });

  // Test _parseWindow()
  describe('_parseWindow', () => {
    it('should return correct milliseconds for known windows', () => {
      expect(collector._parseWindow('1h')).toBe(3600000);
      expect(collector._parseWindow('6h')).toBe(21600000);
      expect(collector._parseWindow('24h')).toBe(86400000);
      expect(collector._parseWindow('7d')).toBe(604800000);
      expect(collector._parseWindow('30d')).toBe(2592000000);
      expect(collector._parseWindow('all')).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should default to 24h for unknown windows', () => {
      expect(collector._parseWindow('unknown')).toBe(3600000 * 24);
      expect(collector._parseWindow('1m')).toBe(3600000 * 24);
    });
  });

  // Test _flushToDisk()
  describe('_flushToDisk', () => {
    it('should do nothing if entries are empty', async () => {
      await collector._flushToDisk();
      expect(mockFsPromises.appendFile).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should append entries to today\'s log file as JSONL', async () => {
      collector.startTrace('query', 'user1');
      advanceTime(100);
      collector.endTrace(collector.activeTraces.keys().next().value, { success: true });

      collector.startTrace('query2', 'user2');
      advanceTime(200);
      collector.endTrace(collector.activeTraces.keys().next().value, { success: false, error: 'test error' });

      const today = new Date(MOCK_START_TIME).toISOString().split('T')[0];
      const expectedFilePath = `storage/ragsystem/telemetry/telemetry_${today}.jsonl`;

      await collector._flushToDisk();

      expect(mockFsPromises.appendFile).toHaveBeenCalledTimes(1);
      expect(mockFsPromises.appendFile).toHaveBeenCalledWith(
        expectedFilePath,
        expect.stringContaining(JSON.stringify(collector.entries[0])) + '\n' + expect.stringContaining(JSON.stringify(collector.entries[1])) + '\n',
        'utf-8'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(`TelemetryCollector: flushed ${collector.entries.length} entries to ${expectedFilePath}`);
    });

    it('should log an error if appendFile fails', async () => {
      collector.startTrace('query', 'user1');
      collector.endTrace(collector.activeTraces.keys().next().value);
      mockFsPromises.appendFile.mockRejectedValue(new Error('Disk write error'));

      await collector._flushToDisk();
      expect(mockLogger.error).toHaveBeenCalledWith('TelemetryCollector: disk flush error:', expect.any(Error));
    });
  });

  // Test _loadFromDisk()
  describe('_loadFromDisk', () => {
    it('should do nothing if today\'s log file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);
      await collector._loadFromDisk();
      expect(mockFsPromises.readFile).not.toHaveBeenCalled();
      expect(collector.entries).toHaveLength(0);
      expect(collector.totalRecorded).toBe(0);
    });

    it('should load entries from today\'s log file and populate entries', async () => {
      const entry1 = { traceId: 't1', queryType: 'q1', startTime: new Date(MOCK_START_TIME - 1000).toISOString() };
      const entry2 = { traceId: 't2', queryType: 'q2', startTime: new Date(MOCK_START_TIME - 2000).toISOString() };
      const fileContent = `${JSON.stringify(entry1)}\n${JSON.stringify(entry2)}\n`;

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(fileContent);

      await collector._loadFromDisk();

      expect(mockFsPromises.readFile).toHaveBeenCalledTimes(1);
      expect(collector.entries).toHaveLength(2);
      expect(collector.totalRecorded).toBe(2);
      expect(collector.entries[0]).toEqual(entry1);
      expect(collector.entries[1]).toEqual(entry2);
      expect(mockLogger.info).toHaveBeenCalledWith(`TelemetryCollector: loaded 2 entries from disk`);
    });

    it('should handle malformed lines in the log file', async () => {
      const entry1 = { traceId: 't1', queryType: 'q1', startTime: new Date(MOCK_START_TIME - 1000).toISOString() };
      const fileContent = `${JSON.stringify(entry1)}\nINVALID_JSON\n{"incomplete":`;

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(fileContent);

      await collector._loadFromDisk();

      expect(collector.entries).toHaveLength(1);
      expect(collector.totalRecorded).toBe(1);
      expect(collector.entries[0]).toEqual(entry1);
      // No specific error logging for malformed lines, just skips them.
    });

    it('should enforce MAX_RING_BUFFER_SIZE when loading from disk', async () => {
      collector.MAX_RING_BUFFER_SIZE = 2;

      const entriesToLoad = [];
      for (let i = 0; i < 5; i++) {
        entriesToLoad.push({ traceId: `t${i}`, queryType: `q${i}`, startTime: new Date(MOCK_START_TIME - (5 - i) * 1000).toISOString() });
      }
      const fileContent = entriesToLoad.map(JSON.stringify).join('\n');

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(fileContent);

      await collector._loadFromDisk();

      expect(collector.entries).toHaveLength(2);
      expect(collector.totalRecorded).toBe(5); // Total recorded should reflect all parsed, even if not in buffer
      expect(collector.entries[0].traceId).toBe('t3'); // t0, t1, t2 should be evicted
      expect(collector.entries[1].traceId).toBe('t4');
    });

    it('should log a warning if readFile fails', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockRejectedValue(new Error('File read permission error'));

      await collector._loadFromDisk();
      expect(mockLogger.warn).toHaveBeenCalledWith('TelemetryCollector: could not load from disk:', 'File read permission error');
    });
  });

  // Test shutdown()
  describe('shutdown', () => {
    it('should clear the flush timer and call _flushToDisk', async () => {
      collector.initialize(); // Start timer
      expect(collector._flushTimer).not.toBeNull();

      const flushSpy = vi.spyOn(collector, '_flushToDisk');
      await collector.shutdown();

      expect(mockClearInterval).toHaveBeenCalledWith(collector._flushTimer);
      expect(collector._flushTimer).toBeNull();
      expect(flushSpy).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('TelemetryCollector: shut down');
      flushSpy.mockRestore();
    });

    it('should not try to clear timer if not set', async () => {
      collector._flushTimer = null; // Ensure no timer
      await collector.shutdown();
      expect(mockClearInterval).not.toHaveBeenCalled();
    });
  });
});

describe('withTelemetry HOF', () => {
  let mockReq, mockRes, mockNext, mockHandler;
  let telemetryCollectorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(MOCK_START_TIME);

    // Mock the singleton telemetryCollector's methods
    telemetryCollectorSpy = {
      startTrace: vi.spyOn(telemetryCollector, 'startTrace').mockReturnValue('mock_trace_id'),
      endTrace: vi.spyOn(telemetryCollector, 'endTrace').mockImplementation(() => {}),
      initialize: vi.spyOn(telemetryCollector, 'initialize').mockImplementation(() => { telemetryCollector._initialized = true; }),
    };

    mockReq = {
      user: { userId: 'test_user_id', id: 'test_id' },
      body: { query: 'test query text', message: 'test message text' },
    };
    mockRes = {
      statusCode: 200,
      json: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn(); // Not used in this HOF, but common in Express middleware
    mockHandler = vi.fn().mockImplementation(async (req, res) => {
      res.json({ data: 'response' });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should call telemetryCollector.startTrace with correct arguments', async () => {
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);
    await instrumentedHandler(mockReq, mockRes, mockNext);

    expect(telemetryCollectorSpy.startTrace).toHaveBeenCalledWith(
      'test_query_type',
      'test_user_id',
      { queryLength: mockReq.body.query.length }
    );
  });

  it('should use req.user.id if req.user.userId is not present', async () => {
    mockReq.user = { id: 'test_id_from_id' };
    mockReq.body = { query: 'another query' };
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);
    await instrumentedHandler(mockReq, mockRes, mockNext);

    expect(telemetryCollectorSpy.startTrace).toHaveBeenCalledWith(
      'test_query_type',
      'test_id_from_id',
      { queryLength: mockReq.body.query.length }
    );
  });

  it('should use "default_user" if no user ID is present', async () => {
    mockReq.user = {};
    mockReq.body = { query: 'another query' };
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);
    await instrumentedHandler(mockReq, mockRes, mockNext);

    expect(telemetryCollectorSpy.startTrace).toHaveBeenCalledWith(
      'test_query_type',
      'default_user',
      { queryLength: mockReq.body.query.length }
    );
  });

  it('should correctly determine queryLength from req.body.query', async () => {
    mockReq.body = { query: 'short' };
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);
    await instrumentedHandler(mockReq, mockRes, mockNext);
    expect(telemetryCollectorSpy.startTrace).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), { queryLength: 5 }
    );
  });

  it('should correctly determine queryLength from req.body.message if query is not present', async () => {
    mockReq.body = { message: 'long message here' };
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);
    await instrumentedHandler(mockReq, mockRes, mockNext);
    expect(telemetryCollectorSpy.startTrace).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), { queryLength: 17 }
    );
  });

  it('should handle undefined req.body gracefully', async () => {
    mockReq.body = undefined;
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);
    await instrumentedHandler(mockReq, mockRes, mockNext);
    expect(telemetryCollectorSpy.startTrace).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), { queryLength: 0 }
    );
  });

  it('should call the original handler', async () => {
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);
    await instrumentedHandler(mockReq, mockRes, mockNext);
    expect(mockHandler).toHaveBeenCalledWith(mockReq, mockRes);
  });

  it('should call telemetryCollector.endTrace when res.json is called (success)', async () => {
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);
    await instrumentedHandler(mockReq, mockRes, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith({ data: 'response' });
    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledTimes(1);
    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledWith(
      'mock_trace_id',
      { success: true, error: null, data: 'response' }
    );
  });

  it('should call telemetryCollector.endTrace when res.json is called (failure)', async () => {
    mockRes.statusCode = 400;
    mockHandler.mockImplementation(async (req, res) => {
      res.json({ error: 'Bad Request' });
    });
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);
    await instrumentedHandler(mockReq, mockRes, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Bad Request' });
    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledTimes(1);
    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledWith(
      'mock_trace_id',
      { success: false, error: 'Bad Request' }
    );
  });

  it('should call telemetryCollector.endTrace when res.end is called (success)', async () => {
    mockHandler.mockImplementation(async (req, res) => {
      res.end('stream data');
    });
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);
    await instrumentedHandler(mockReq, mockRes, mockNext);

    expect(mockRes.end).toHaveBeenCalledWith('stream data');
    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledTimes(1);
    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledWith(
      'mock_trace_id',
      { success: true }
    );
  });

  it('should call telemetryCollector.endTrace when res.end is called (failure)', async () => {
    mockRes.statusCode = 500;
    mockHandler.mockImplementation(async (req, res) => {
      res.end('error stream');
    });
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);
    await instrumentedHandler(mockReq, mockRes, mockNext);

    expect(mockRes.end).toHaveBeenCalledWith('error stream');
    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledTimes(1);
    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledWith(
      'mock_trace_id',
      { success: false }
    );
  });

  it('should call telemetryCollector.endTrace if handler throws an error', async () => {
    const testError = new Error('Handler failed');
    mockHandler.mockImplementation(async (req, res) => {
      throw testError;
    });
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);

    await expect(instrumentedHandler(mockReq, mockRes, mockNext)).rejects.toThrow(testError);

    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledTimes(1);
    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledWith(
      'mock_trace_id',
      { success: false, error: testError.message }
    );
    expect(mockRes.json).not.toHaveBeenCalled(); // Should not call json if handler throws before it
    expect(mockRes.end).not.toHaveBeenCalled();
  });

  it('should ensure endTrace is called only once even if both json and end are called (unlikely but for robustness)', async () => {
    mockHandler.mockImplementation(async (req, res) => {
      res.json({ data: 'first' });
      res.end('second'); // This should not trigger a second endTrace
    });
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);
    await instrumentedHandler(mockReq, mockRes, mockNext);

    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledTimes(1);
    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledWith(
      'mock_trace_id',
      { success: true, error: null, data: 'first' }
    );
  });

  it('should ensure endTrace is called only once if handler throws after json/end', async () => {
    const testError = new Error('Post-response error');
    mockHandler.mockImplementation(async (req, res) => {
      res.json({ data: 'response' });
      throw testError; // This error should not trigger another endTrace
    });
    const instrumentedHandler = withTelemetry('test_query_type', mockHandler);

    await expect(instrumentedHandler(mockReq, mockRes, mockNext)).rejects.toThrow(testError);

    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledTimes(1);
    expect(telemetryCollectorSpy.endTrace).toHaveBeenCalledWith(
      'mock_trace_id',
      { success: true, error: null, data: 'response' }
    );
  });
});

// Test the singleton instance directly to ensure it's exported correctly
describe('telemetryCollector singleton', () => {
  it('should be an instance of TelemetryCollector', () => {
    expect(telemetryCollector).toBeInstanceOf(TelemetryCollector);
  });

  it('should be the same instance across imports', async () => {
    const { telemetryCollector: anotherCollector } = await import('./llamaindex.telemetry.js');
    expect(telemetryCollector).toBe(anotherCollector);
  });
});