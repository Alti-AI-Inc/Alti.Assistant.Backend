/**
 * test_v14_integrations.js
 *
 * Comprehensive unit, security, and schema validation tests for the 9 Greenlight Public Intelligence APIs.
 * Run using: node scratch/test_v14_integrations.js
 */

import assert from 'assert';
import { sanitizeQueryString, getGreenlightIntelligenceData } from '../src/app/helpers/v14DataIntegrations.js';
import { altiGreenlightIntelligenceSearch } from '../src/app/modules/search/tools.js';
import { RedisClient } from '../src/shared/redis.js';

console.log('======================================================================');
console.log('🧪 RUNNING SECURITY & STRUCTURAL TESTS FOR V14 GREENLIGHT INTEGRATIONS');
console.log('======================================================================\n');

let passedTests = 0;
let failedTests = 0;

const runTest = async (name, fn) => {
  console.log(`▸ Testing: ${name}...`);
  try {
    await fn();
    console.log(`  ✅ [PASS]\n`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL]: ${err.message}\n`);
    console.error(err.stack);
    failedTests++;
  }
};

// 1. SSRF & Script Injection Sanitization Test
await runTest('SSRF & Injection Sanitization', async () => {
  const dangerousQuery = 'Check FEC contributions <script>alert("xss")</script> from http://malicious.org/payload.sh on Bitcoin';
  const sanitized = sanitizeQueryString(dangerousQuery);
  
  assert.ok(sanitized !== '', 'Should return sanitized string');
  assert.ok(!sanitized.includes('<script>'), 'XSS script blocks must be stripped');
  assert.ok(!sanitized.includes('http://'), 'SSRF URL prefixes must be stripped');
  assert.ok(!/[<>]/g.test(sanitized), 'HTML brackets must be stripped');
  
  // Length capping check (must cap to 50 characters maximum)
  const longQuery = 'a'.repeat(100);
  const capped = sanitizeQueryString(longQuery);
  assert.strictEqual(capped.length, 50, `Must cap string to 50 characters, got: ${capped.length}`);
});

// 2. Multi-lingual Support Validation
await runTest('Multi-lingual Script Preservation', async () => {
  const globalQuery = 'Verify Companies House for Møller & Смирнов (北京) Ltd';
  const sanitized = sanitizeQueryString(globalQuery);
  
  // Accents, Cyrillic, Chinese, and standard alphanumeric characters must be preserved safely
  assert.ok(sanitized.includes('Møller'), 'Accented letters must be preserved');
  assert.ok(sanitized.includes('Смирнов'), 'Cyrillic letters must be preserved');
  assert.ok(sanitized.includes('北京'), 'Chinese letters must be preserved');
});

// 3. Complete Domain Coverage & Schema Validation (Mock Generations)
await runTest('Domain Schema & Metric Bolding Rules', async () => {
  const domains = [
    'politics_campaign',
    'legislation_tracking',
    'civic_representatives',
    'macroeconomics_global',
    'mortgage_lending',
    'disaster_hazards',
    'medical_research',
    'uk_company_registry',
    'global_entity_registry'
  ];

  for (const domain of domains) {
    const start = Date.now();
    const result = await getGreenlightIntelligenceData(domain, 'Global Test Corp');
    const duration = Date.now() - start;

    // Check fast execution gate (< 100ms)
    assert.ok(duration < 100, `Execution for domain ${domain} took too long: ${duration}ms`);
    
    // Check metadata fields exist and match expected domain
    assert.strictEqual(result.metadata.domain, domain, `Metadata domain must match: ${domain}`);
    
    // Check Markdown premium styling bolds
    // We expect critical attributes and metrics to be bolded in the markdown tables
    assert.ok(result.markdown.includes('**'), `Markdown output for ${domain} must contain bold styling (**).`);
    
    // Domain specific formatting check
    if (domain === 'politics_campaign') {
      assert.ok(result.markdown.includes('**COMPLIANT**'), 'FEC compliance rating must be bolded');
    } else if (domain === 'disaster_hazards') {
      assert.ok(result.markdown.includes('**Zone '), 'FEMA flood zone code must be bolded');
    } else if (domain === 'uk_company_registry') {
      assert.ok(result.markdown.includes('**0'), 'UK registration number must be bolded');
    }
  }
});

// 4. Dual-Layer Caching (Redis + Memory Fallback)
await runTest('Dual-Layer Cache Retrieval', async () => {
  const domain = 'macroeconomics_global';
  const query = 'Consumer Price Index';
  const cacheKey = 'greenlight:macroeconomics_global:consumer price index';
  
  // Clear any existing cache entry to test fresh execution
  await RedisClient.del(cacheKey);
  
  const startFresh = Date.now();
  const freshRun = await getGreenlightIntelligenceData(domain, query);
  const freshDuration = Date.now() - startFresh;
  
  // Second run should resolve almost instantly via cache
  const startCached = Date.now();
  const cachedRun = await getGreenlightIntelligenceData(domain, query);
  const cachedDuration = Date.now() - startCached;
  
  assert.deepStrictEqual(cachedRun.metadata, freshRun.metadata, 'Cached metadata must match fresh metadata exactly');
  assert.ok(cachedDuration <= 35, `Cached lookup must resolve within 35ms (Windows clock tick resolution: 15.6ms). Got: ${cachedDuration}ms`);
  
  // Verify entry resides in Redis
  const redisVal = await RedisClient.get(cacheKey);
  assert.ok(redisVal !== null, 'Value must be populated in RedisClient');
  
  const parsed = JSON.parse(redisVal);
  assert.strictEqual(parsed.metadata.targetIndexName, 'Consumer Price Index', 'Cached targetIndexName must match');
});

// 5. LangChain Structured Tool Schema Conformance
await runTest('LangChain Structured Tool Registration', async () => {
  assert.ok(altiGreenlightIntelligenceSearch, 'altiGreenlightIntelligenceSearch tool must be exported');
  assert.strictEqual(altiGreenlightIntelligenceSearch.name, 'alti_greenlight_intelligence_search', 'Tool name must match exactly');
  assert.ok(altiGreenlightIntelligenceSearch.schema, 'Tool schema must be defined');
  
  // Perform local dynamic structured tool execution
  const toolResult = await altiGreenlightIntelligenceSearch.invoke({
    domain: 'politics_campaign',
    query: 'Pac Leadership Committee'
  });
  
  assert.ok(toolResult.includes('FEC CAMPAIGN FINANCE REAL-TIME AUDIT'), 'Tool execution must return valid markdown header');
  assert.ok(toolResult.includes('Pac Leadership Committee'), 'Tool execution must contain sanitized query');
});

console.log('======================================================================');
console.log(`🏁 TEST EXECUTION METRICS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('======================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL V14 GREENLIGHT INTEGRATION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}
