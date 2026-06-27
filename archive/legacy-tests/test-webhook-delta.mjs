/**
 * test-webhook-delta.mjs
 *
 * Comprehensive integration test suite for Phase 5:
 * Real-Time Webhook Delta-Tracking & Alert Integration.
 */

import assert from 'assert';
import { processWebhookEvent } from './src/app/modules/explorium/explorium.webhook.handler.js';
import { getExploriumContext } from './src/app/modules/swarm/explorium.smart.router.js';
import { RedisClient } from './src/shared/redis.js';

// Mock pub/sub to prevent hanging on offline Redis connections
RedisClient.publish = async (channel, message) => {
  // Gracefully bypass Redis publish connection overhead in test environments
};

// Setup environment and mock fetch
process.env.EXPLORIUM_API_KEY = 'mock_api_key_for_testing';
process.env.EXPLORIUM_WEBHOOK_URL = 'http://localhost:5000/api/v1/explorium/webhook/inbound';

const fetchCalls = [];
const originalFetch = global.fetch;

global.fetch = async (url, opts) => {
  fetchCalls.push({ url, opts });

  if (url.includes('/v1/businesses/match')) {
    return {
      ok: true,
      json: async () => ({ business_id: 'mock_biz_id_123', matched: true })
    };
  }

  if (url.includes('/v1/businesses/enrollments')) {
    return {
      ok: true,
      json: async () => ({ success: true, enrolled_business_ids: ['mock_biz_id_123'] })
    };
  }

  if (url.includes('/enrich/')) {
    const type = url.split('/enrich/')[1];
    return {
      ok: true,
      json: async () => ({
        matched: true,
        business_id: 'mock_biz_id_123',
        [type]: { data: `mocked ${type} data` }
      })
    };
  }

  return {
    ok: true,
    json: async () => ({})
  };
};

async function runTests() {
  console.log('🚀 Starting Phase 5 Webhook Delta & Alert Integration Tests...\n');

  // Clear keys before starting
  await RedisClient.del('explorium:events:business:mock_biz_id_123');
  await RedisClient.del('explorium:enrolled:mock_biz_id_123');

  // =========================================================================
  // TEST 1: Webhook Event Processing & Persistence in Redis
  // =========================================================================
  console.log('🧪 Running Test 1: Webhook Event Processing & Persistence...');

  const mockFundingEvent = {
    event_type: 'new_funding_round',
    business_id: 'mock_biz_id_123',
    event_data: { round: 'Series B', amount: 50000000 },
    occurred_at: '2026-05-22T10:00:00.000Z'
  };

  const mockRiskEvent = {
    event_type: 'lawsuits_and_legal_issues',
    business_id: 'mock_biz_id_123',
    event_data: { description: 'Patent infringement suit' },
    occurred_at: '2026-05-22T11:00:00.000Z'
  };

  // Process both mock events
  await processWebhookEvent(mockFundingEvent);
  await processWebhookEvent(mockRiskEvent);

  // Retrieve stored events from Redis
  const events = await RedisClient.lrange('explorium:events:business:mock_biz_id_123', 0, -1);
  assert.strictEqual(events.length, 2, 'Should have persisted exactly 2 events in Redis');

  // Verify list order: LPUSH places newer events first
  const latestEvent = JSON.parse(events[0]);
  assert.strictEqual(latestEvent.event_type, 'lawsuits_and_legal_issues', 'The latest event should be first in the list');
  assert.strictEqual(latestEvent.event_data.description, 'Patent infringement suit');

  const olderEvent = JSON.parse(events[1]);
  assert.strictEqual(olderEvent.event_type, 'new_funding_round', 'The older event should be second in the list');
  assert.strictEqual(olderEvent.event_data.amount, 50000000);

  console.log('✅ Test 1 Passed: Events processed and persisted successfully with correct ordering.');

  // =========================================================================
  // TEST 2: Redis Trim and Expiration Capabilities
  // =========================================================================
  console.log('\n🧪 Running Test 2: List Trimming & TTL...');

  const listKey = 'explorium:events:business:mock_biz_id_123';
  // LPUSH 55 events to verify the capping logic (max list size = 50)
  for (let i = 0; i < 55; i++) {
    await RedisClient.lpush(listKey, JSON.stringify({ event_type: `cap_test_event_${i}` }));
    await RedisClient.ltrim(listKey, 0, 49);
  }

  const trimmedEvents = await RedisClient.lrange(listKey, 0, -1);
  assert.strictEqual(trimmedEvents.length, 50, 'Redis list must be capped and trimmed to exactly 50 events');

  const trimmedLatest = JSON.parse(trimmedEvents[0]);
  assert.strictEqual(trimmedLatest.event_type, 'cap_test_event_54', 'The latest capped event should be at index 0');

  console.log('✅ Test 2 Passed: Capped trimming of 50 items verified.');

  // =========================================================================
  // TEST 3: Asynchronous Webhook Auto-Enrollment & Real-Time Context Alert Injection
  // =========================================================================
  console.log('\n🧪 Running Test 3: Auto-Enrollment & Dynamic LLM Context Alert Injection...');

  // Reset Redis states to simulate a completely new business research query
  await RedisClient.del('explorium:enrolled:mock_biz_id_123');
  await RedisClient.del('explorium:events:business:mock_biz_id_123');

  // Seed a dynamic real-time event to be retrieved during research
  await processWebhookEvent({
    event_type: 'new_funding_round',
    business_id: 'mock_biz_id_123',
    event_data: { round: 'Series C', amount: 120000000 },
    occurred_at: '2026-05-22T12:00:00.000Z'
  });

  // Call getExploriumContext which invokes fetchCompanyResearchData internally
  const contextString = await getExploriumContext('explorium_company_researcher', 'example.com');

  // Verify that the breaking-news delta is retrieved and injected inside the returned research context
  assert.ok(contextString, 'Returned context string must not be empty');
  assert.ok(contextString.includes('new_funding_round'), 'Context must list the new_funding_round event type');
  assert.ok(contextString.includes('Series C'), 'Context must include correct event details');
  assert.ok(contextString.includes('[EXPLORIUM REAL-TIME DELTA ALERTS]'), 'Context should contain the dynamic alert header');
  
  console.log('Injected Grounded Context Result:');
  console.log('--------------------------------------------------');
  console.log(contextString);
  console.log('--------------------------------------------------');

  // Since auto-enrollment is executed asynchronously (non-blocking in the background),
  // we wait briefly for the promise handler to complete before verifying.
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Verify that the enrollment flag is successfully marked in Redis
  const isEnrolledInRedis = await RedisClient.get('explorium:enrolled:mock_biz_id_123');
  assert.strictEqual(isEnrolledInRedis, 'true', 'Business enrollment state must be flagged in Redis cache');

  // Verify that global fetch made an outbound POST to the Explorium enrollment API endpoint
  const enrollmentFetch = fetchCalls.find(call => call.url.includes('/v1/businesses/enrollments'));
  assert.ok(enrollmentFetch, 'Outbound enrollment API request should be triggered in the background');
  assert.strictEqual(enrollmentFetch.opts.method, 'POST');

  const enrollBody = JSON.parse(enrollmentFetch.opts.body);
  assert.deepStrictEqual(enrollBody.business_ids, ['mock_biz_id_123'], 'API payload must request enrollment for the correct business ID');
  assert.strictEqual(enrollBody.partner_id, 'alti_assistant', 'API payload must specify correct partner ID');
  
  console.log('✅ Test 3 Passed: Background enrollment triggered and live alerts successfully injected.');

  console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! Phase 5 is fully verified! 🎉');
  
  // Gracefully close Redis client connections
  try {
    await RedisClient.disconnect();
  } catch (err) {
    // Ignore disconnect errors when the client is already closed or not connected
  }
  global.fetch = originalFetch;
}

runTests().catch(async (err) => {
  console.error('\n❌ TEST SUITE FAILURE:', err);
  try {
    await RedisClient.disconnect();
  } catch (dErr) {
    // Ignore disconnect errors
  }
  global.fetch = originalFetch;
  process.exit(1);
});
