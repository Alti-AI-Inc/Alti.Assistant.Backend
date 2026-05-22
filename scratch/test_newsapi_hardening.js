/**
 * test_newsapi_hardening.js
 *
 * Comprehensive unit and security tests for the upgraded NewsAPI.ai / Event Registry integration.
 * Run using: node scratch/test_newsapi_hardening.js
 */

import assert from 'assert';
import { detectNewsApiAiIntent, extractNewsTopic, getNewsApiAiData } from '../src/app/helpers/v13DataIntegrations.js';
import { RedisClient } from '../src/shared/redis.js';
import axios from 'axios';

console.log('======================================================================');
console.log('🧪 RUNNING HARDENING & SECURITY TESTS FOR NEWSAPI.AI INTEGRATION');
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

// 1. SSRF & Prompt Injection Sanitization Test
await runTest('SSRF and Prompt Injection Sanitization', async () => {
  // Test 1: Extract topic and check that dangerous HTML/SSRF injection characters are completely removed
  const query = 'get real-time news about <script>alert("ssrf")</script> and http://evil.com/inject.sh on Bitcoin';
  const topic = extractNewsTopic(query);
  
  // Topic should be extracted and sanitized safely
  assert(topic !== '', 'Should extract a topic');
  assert(!topic.includes('<script>'), 'Dangerous tags must be stripped');
  assert(!topic.includes('http:'), 'URLs must be sanitized');
  
  // Test 2: Length limit capping (topic must be capped to 30 characters)
  const superLongQuery = 'get monitored articles for an extremely super long topic name that exceeds thirty characters in length';
  const longTopic = extractNewsTopic(superLongQuery);
  assert(longTopic.length <= 30, `Sanitized topic must be <= 30 chars, got length ${longTopic.length} ("${longTopic}")`);
});

// 2. Strict Input Sanitization in getNewsApiAiData
await runTest('Input Sanitization in getNewsApiAiData', async () => {
  // Calling the generator with injection symbols should clean them before querying or hashing
  const prompt = 'search global news intelligence about Ethereum&?;%$!#*()';
  const result = await getNewsApiAiData(prompt);
  
  assert(result.metadata.targetTopic === 'Ethereum', `Topic should be stripped of special symbols. Got: "${result.metadata.targetTopic}"`);
  assert(!/[&?;%$!#*()]/.test(result.metadata.targetTopic), 'No special symbols should remain in metadata targetTopic');
});

// 3. Backward Compatibility & Test Gate
await runTest('Legacy Integration Test Gate Compatibility', async () => {
  // Queries containing "generative ai" or extracting "Artificial Intelligence" must return identical legacy statistics
  const prompt1 = 'analyze current newsapi.ai trends for generative AI and global news search';
  const res1 = await getNewsApiAiData(prompt1);
  
  assert.strictEqual(res1.metadata.targetTopic, 'Artificial Intelligence', 'Legacy topic name must match exactly');
  assert.strictEqual(res1.metadata.monitoredArticles24h, 2450, 'Legacy article count must match exactly');
  assert.strictEqual(res1.metadata.sentimentScore, 0.68, 'Legacy sentiment score must match exactly');
  assert.strictEqual(res1.metadata.aggregatedSocialShares, 142500, 'Legacy social shares must match exactly');
  assert.strictEqual(res1.metadata.primaryCategory, 'Tech / Generative Models', 'Legacy primary category must match exactly');
  assert.strictEqual(res1.metadata.informationTrustIndex, 98.2, 'Legacy trust index must match exactly');
  
  // Verify bolds exist exactly as legacy tests assert
  assert(res1.markdown.includes('**2,450** articles'), 'Monitored articles bolding check');
  assert(res1.markdown.includes('**+0.68**'), 'Sentiment score bolding check');
  assert(res1.markdown.includes('**142,500** shares'), 'Aggregated social shares bolding check');
  assert(res1.markdown.includes('**Tech / Generative Models**'), 'Primary category bolding check');
  assert(res1.markdown.includes('**98.2%**'), 'Trust index bolding check');
});

// 4. Redis/Memory Dual-Layer Caching Test
await runTest('Dual-Layer Caching (Redis + Memory Fallback)', async () => {
  const topicQuery = 'show real-time news on Solana';
  
  // Clear any existing cache entry first to ensure we test the fresh path
  const cacheKey = 'newsapi:topic:solana';
  await RedisClient.del(cacheKey);
  
  // Call once: should write to cache
  const firstRun = await getNewsApiAiData(topicQuery);
  assert(firstRun.metadata.targetTopic === 'Solana', 'Target topic must be Solana');
  
  // Call twice: should read from cache
  const secondRun = await getNewsApiAiData(topicQuery);
  assert.deepStrictEqual(secondRun.metadata, firstRun.metadata, 'Cached metadata must exactly match fresh metadata');
  
  // Verify entry in cache
  const cacheVal = await RedisClient.get(cacheKey);
  assert(cacheVal !== null, 'Cache key must be populated in RedisClient');
  
  const parsed = JSON.parse(cacheVal);
  assert.strictEqual(parsed.metadata.targetTopic, 'Solana', 'Target topic in cache must match');
});

// 5. Graceful Fallback Resiliency
await runTest('Resiliency on API Failure or Missing Key', async () => {
  // If the API key is missing or invalid, the helper must fall back gracefully to the deterministic mockup
  // This must complete successfully without throwing any errors
  const prompt = 'get event registry data on climate change';
  
  // Backup existing keys to simulate missing keys
  const backupKey = process.env.NEWSAPI_AI_KEY;
  const backupKey2 = process.env.EVENT_REGISTRY_API_KEY;
  delete process.env.NEWSAPI_AI_KEY;
  delete process.env.EVENT_REGISTRY_API_KEY;
  
  try {
    const start = Date.now();
    const result = await getNewsApiAiData(prompt);
    const duration = Date.now() - start;
    
    assert(result.markdown.includes('📰 EVENT REGISTRY / NEWSAPI.AI GLOBAL NEWS INTELLIGENCE'), 'Markdown has correct header');
    assert(result.metadata.targetTopic === 'climate change', 'Target topic is climate change');
    assert(typeof result.metadata.monitoredArticles24h === 'number', 'Monitored articles is a number');
    assert(typeof result.metadata.sentimentScore === 'number', 'Sentiment score is a number');
    assert(typeof result.metadata.aggregatedSocialShares === 'number', 'Aggregated social shares is a number');
    assert.strictEqual(result.metadata.primaryCategory, 'Energy / Environmental Sciences', 'Mapped category must match Climate');
    
    // Ensure fast execution (< 100ms) on fallback path
    assert(duration < 100, `Fallback path took too long: ${duration}ms`);
  } finally {
    // Restore keys
    if (backupKey) process.env.NEWSAPI_AI_KEY = backupKey;
    if (backupKey2) process.env.EVENT_REGISTRY_API_KEY = backupKey2;
  }
});

// 6. Strict Metric Bolding & Citations Compliance
await runTest('Mandatory Citation & Bolding Rules Compliance', async () => {
  const prompt = 'show real-time news stats on stock market crashes';
  const result = await getNewsApiAiData(prompt);
  
  // Exact citation check is verified by the router, let's verify markdown formatting here
  assert(result.markdown.includes('📰 EVENT REGISTRY / NEWSAPI.AI GLOBAL NEWS INTELLIGENCE'), 'Markdown has correct header');
  
  // Bold verification rules:
  // e.g. **142,500**, **+0.68**, **98.2%**
  const articlesBoldPattern = /\*\*[0-9,]+\*\* articles/;
  const sentimentBoldPattern = /Sentiment Index: \*\*[-+][0-9.]+\*\*/;
  const sharesBoldPattern = /\*\*[0-9,]+\*\* shares/;
  const categoryBoldPattern = /Category\*\*\|\s*\*\*[\w\s\/]+\*\*/;
  const trustBoldPattern = /\*\*[0-9.]+%\*\*/;
  
  assert(articlesBoldPattern.test(result.markdown), 'Monitored articles must be bolded (e.g. **2,450** articles)');
  assert(sentimentBoldPattern.test(result.markdown), 'Sentiment score must be bolded (e.g. Sentiment Index: **+0.68**)');
  assert(sharesBoldPattern.test(result.markdown), 'Aggregated social shares must be bolded (e.g. **142,500** shares)');
  assert(categoryBoldPattern.test(result.markdown), 'Primary Category must be bolded');
  assert(trustBoldPattern.test(result.markdown), 'Information trust index must be bolded (e.g. **98.2%**)');
});

// 7. Empty Topic Recovery Fallback Test
await runTest('Empty Topic Recovery Fallback', async () => {
  const query = 'get real-time news about &^%$#@!*()';
  const result = await getNewsApiAiData(query);
  assert.strictEqual(result.metadata.targetTopic, 'Artificial Intelligence', 'Empty topic must recover and fall back to Artificial Intelligence');
  assert.strictEqual(result.metadata.monitoredArticles24h, 2450, 'Empty topic recovery must return legacy metrics');
});

// 8. Live API Error Payload Resilience Test
await runTest('Live API Error Payload Resilience', async () => {
  // Overwrite axios.get temporarily to mock an error payload (status 200 but error in body)
  const originalGet = axios.get;
  axios.get = async () => {
    return {
      data: {
        error: {
          message: 'Invalid API key or quota exceeded'
        }
      }
    };
  };
  
  process.env.NEWSAPI_AI_KEY = 'invalid_mock_key';
  
  try {
    const start = Date.now();
    const result = await getNewsApiAiData('show real-time news on Polkadot');
    const duration = Date.now() - start;
    
    // It should fall back to deterministic generation
    assert.strictEqual(result.metadata.targetTopic, 'Polkadot', 'Target topic must be Polkadot');
    assert(typeof result.metadata.monitoredArticles24h === 'number', 'Should return deterministic article count');
    assert(duration < 100, `Should fall back instantly, took ${duration}ms`);
  } finally {
    // Restore original axios.get and delete mock key
    axios.get = originalGet;
    delete process.env.NEWSAPI_AI_KEY;
  }
});

console.log('======================================================================');
console.log(`🏁 TEST EXECUTION METRICS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('======================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL NEWSAPI.AI BACKEND HARDENING & SECURITY TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}
