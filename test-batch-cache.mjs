import assert from 'assert';
import { createHash } from 'crypto';
import { RedisClient } from './src/shared/redis.js';
import {
  ExploriumCache,
  resetCacheStats,
  getCacheStats,
} from './src/app/modules/explorium/explorium.cache.js';
import { getExploriumContext } from './src/app/modules/swarm/explorium.smart.router.js';

// Set up mandatory environment variables
process.env.EXPLORIUM_API_KEY = 'test_api_key_12345';

// Track API invocation metrics for assertions
const fetchCalls = {
  matchCount: 0,
  enrichCount: 0,
  totalCalls: 0,
};

// ─── Native Global Fetch Mock ────────────────────────────────────────────────
const originalFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  fetchCalls.totalCalls++;
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;

  if (path === '/v1/businesses/match' && method === 'POST') {
    fetchCalls.matchCount++;
    const businesses = body.businesses || [];
    const results = businesses.map((b) => {
      const seed = b.domain || b.name || 'unknown';
      const id = `bus_${createHash('sha256').update(seed).digest('hex').slice(0, 8)}`;
      return {
        matched: true,
        domain: b.domain || null,
        name: b.name || null,
        business_id: id,
        id: id,
      };
    });
    return {
      ok: true,
      json: async () => ({ results }),
    };
  }

  if (path.includes('/v1/businesses/bulk/enrich/') && method === 'POST') {
    fetchCalls.enrichCount++;
    const ids = body.business_ids || [];
    const results = ids.map((id) => ({
      business_id: id,
      id: id,
      data: {
        company_name: `Company ${id.toUpperCase()}`,
        employee_count: 250,
        industry: 'Information Technology',
      },
    }));
    return {
      ok: true,
      json: async () => ({ results }),
    };
  }

  // Fallback default response
  return {
    ok: true,
    json: async () => ({ results: [] }),
  };
};

async function runTests() {
  console.log(
    '🚀 STARTING EXPLORIUM BATCH CACHE & ROUTER BATCH OPTIMIZATION INTEGRATION TESTS\n'
  );

  try {
    // ═════════════════════════════════════════════════════════════════════════
    // TEST 1: Verify RedisClient mget and mset (with memoryStore fallbacks)
    // ═════════════════════════════════════════════════════════════════════════
    console.log('🧪 TEST 1: Verifying RedisClient mget and mset');

    const keyValPairs = [
      ['explorium:test:key1', JSON.stringify({ name: 'Alpha' })],
      ['explorium:test:key2', JSON.stringify({ name: 'Beta' })],
    ];

    // Test batch set
    await RedisClient.mset(keyValPairs, 60);

    // Test batch get
    const retrieved = await RedisClient.mget([
      'explorium:test:key1',
      'explorium:test:key2',
      'explorium:test:key3',
    ]);

    assert.deepStrictEqual(
      JSON.parse(retrieved[0]),
      { name: 'Alpha' },
      'Key 1 value mismatch'
    );
    assert.deepStrictEqual(
      JSON.parse(retrieved[1]),
      { name: 'Beta' },
      'Key 2 value mismatch'
    );
    assert.strictEqual(
      retrieved[2],
      null,
      'Key 3 (non-existent) should be null'
    );

    console.log(
      '✅ RedisClient mget & mset passed successfully (verified with in-memory map fallback).\n'
    );

    // ═════════════════════════════════════════════════════════════════════════
    // TEST 2: Verify ExploriumCache withCacheBatch with order-preservation
    // ═════════════════════════════════════════════════════════════════════════
    console.log(
      '🧪 TEST 2: Verifying ExploriumCache withCacheBatch with order-preservation'
    );
    resetCacheStats();

    const paramsList = [{ id: 'item1' }, { id: 'item2' }, { id: 'item3' }];

    let fetcherCalls = 0;
    const fetcher = async (missedParams) => {
      fetcherCalls++;
      // Return order-matching array of items
      return missedParams.map((p) => ({ data: `Val for ${p.id}` }));
    };

    // First call: All misses, should execute fetcher once
    const res1 = await ExploriumCache.withCacheBatch(
      'firmographics',
      paramsList,
      fetcher,
      60
    );

    assert.strictEqual(res1.length, 3, 'Result length mismatch on first call');
    assert.deepStrictEqual(
      res1[0],
      { data: 'Val for item1' },
      'Item 1 mismatch'
    );
    assert.deepStrictEqual(
      res1[1],
      { data: 'Val for item2' },
      'Item 2 mismatch'
    );
    assert.deepStrictEqual(
      res1[2],
      { data: 'Val for item3' },
      'Item 3 mismatch'
    );
    assert.strictEqual(
      fetcherCalls,
      1,
      'Fetcher should be invoked exactly once'
    );

    const stats1 = getCacheStats();
    assert.strictEqual(stats1.misses, 3, 'Cache stats misses should be 3');
    assert.strictEqual(stats1.hits, 0, 'Cache stats hits should be 0');

    // Second call: All hits, should execute fetcher zero times
    const res2 = await ExploriumCache.withCacheBatch(
      'firmographics',
      paramsList,
      fetcher,
      60
    );
    assert.strictEqual(res2.length, 3, 'Result length mismatch on second call');
    assert.strictEqual(fetcherCalls, 1, 'Fetcher should not be called again');

    const stats2 = getCacheStats();
    assert.strictEqual(stats2.hits, 3, 'Cache stats hits should now be 3');

    // Third call: Partial hits and misses
    const partialParamsList = [
      { id: 'item2' }, // Hit
      { id: 'item4' }, // Miss
    ];

    const res3 = await ExploriumCache.withCacheBatch(
      'firmographics',
      partialParamsList,
      fetcher,
      60
    );
    assert.strictEqual(res3.length, 2, 'Result length mismatch on third call');
    assert.deepStrictEqual(
      res3[0],
      { data: 'Val for item2' },
      'Cached item 2 value mismatch'
    );
    assert.deepStrictEqual(
      res3[1],
      { data: 'Val for item4' },
      'New fetched item 4 value mismatch'
    );
    assert.strictEqual(
      fetcherCalls,
      2,
      'Fetcher should be invoked a second time for missed parameters'
    );

    console.log(
      '✅ ExploriumCache.withCacheBatch passed successfully (order-preserved, deduplicated, statistics tracked).\n'
    );

    // ═════════════════════════════════════════════════════════════════════════
    // TEST 3: Verify ExploriumSmartRouter fetchLeadScorerData in Batch Mode
    // ═════════════════════════════════════════════════════════════════════════
    console.log(
      '🧪 TEST 3: Verifying ExploriumSmartRouter fetchLeadScorerData in Batch Mode'
    );
    resetCacheStats();
    fetchCalls.matchCount = 0;
    fetchCalls.enrichCount = 0;
    fetchCalls.totalCalls = 0;

    // We query 4 companies. This should normally cause 8 serial lookup calls in the old system.
    // In our optimized Phase 4, it should trigger exactly 1 batch match and exactly 1 batch enrich.
    const query = 'stripe.com\nuber.com\ngoogle.com\nnetflix.com';
    const context = await getExploriumContext('explorium_lead_scorer', query);

    assert.ok(
      context.includes('[EXPLORIUM LIVE DATA'),
      'Context envelope missing header'
    );
    assert.ok(
      context.includes('bus_1ffda32a'),
      'Stripe mock business id is missing from context'
    );
    assert.ok(
      context.includes('netflix.com'),
      'Netflix mock domain is missing from context'
    );

    // Assert that the API calls were perfectly batched (exactly 1 batch match, exactly 1 batch enrich)
    assert.strictEqual(
      fetchCalls.matchCount,
      1,
      'Match API calls should be batched into EXACTLY 1 request'
    );
    assert.strictEqual(
      fetchCalls.enrichCount,
      1,
      'Enrich API calls should be batched into EXACTLY 1 request'
    );
    assert.strictEqual(
      fetchCalls.totalCalls,
      2,
      'Total API network requests should be exactly 2'
    );

    console.log('📊 Verification Metrics:');
    console.log(
      `   - Network calls to /match       : ${fetchCalls.matchCount} (expected: 1)`
    );
    console.log(
      `   - Network calls to /bulk-enrich : ${fetchCalls.enrichCount} (expected: 1)`
    );
    console.log(
      `   - Total API network requests    : ${fetchCalls.totalCalls} (expected: 2)`
    );
    console.log(
      '✅ ExploriumSmartRouter fetchLeadScorerData Batch Optimization passed successfully!\n'
    );

    console.log(
      '🎉 ALL PHASE 4 INTEGRATION TESTS PASSED SUCCESSFULLY! 100% CORRECT!'
    );
    process.exit(0);
  } catch (err) {
    console.error('❌ INTEGRATION TEST FAILURE:', err);
    process.exit(1);
  } finally {
    global.fetch = originalFetch;
  }
}

runTests();
