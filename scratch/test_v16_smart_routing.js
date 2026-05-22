import dotenv from 'dotenv';
dotenv.config();

import { detectPremiumV16Intent, extractPremiumV16Topic } from '../src/app/helpers/v16DataIntegrations.js';
import { massiveSmartRouter } from '../src/app/helpers/massiveSmartRouter.js';
import { RedisClient } from '../src/shared/redis.js';

async function runTests() {
  console.log('🚀 Running Alti.Assistant v16 Smart Routing & Dynamic Intent Extraction Tests...');
  let failures = 0;

  // Test 1: Intent Detection (v16 Premium)
  console.log('\n🧪 [Test 1] Query Intent Detection');
  const intentsV16 = [
    { query: 'fdic lookup for Silicon Valley Bank financials', expected: 'fdic_bankfind' },
    { query: 'consumer complaints for Equifax credit card disputes', expected: 'cfpb_complaints' },
    { query: 'sec edgar 10-k filing facts for AAPL CIK', expected: 'sec_edgar' },
    { query: 'building permits for state California residential construction', expected: 'census_bps' }
  ];

  for (const { query, expected } of intentsV16) {
    const detected = detectPremiumV16Intent(query);
    if (detected === expected) {
      console.log(`✅ Passed: "${query}" -> ${detected}`);
    } else {
      console.error(`❌ Failed: "${query}" -> Expected ${expected}, got ${detected}`);
      failures++;
    }
  }

  // Test 2: Dynamic Topic Extraction
  console.log('\n🧪 [Test 2] Dynamic Topic Extraction');
  const topics = [
    { query: 'fdic lookup for Silicon Valley Bank', domain: 'fdic_bankfind', expected: 'silicon valley bank' },
    { query: 'consumer complaints for Equifax', domain: 'cfpb_complaints', expected: 'equifax' },
    { query: 'sec edgar facts for AAPL', domain: 'sec_edgar', expected: 'aapl' },
    { query: 'building permits for state California', domain: 'census_bps', expected: 'california' }
  ];

  for (const { query, domain, expected } of topics) {
    const extracted = extractPremiumV16Topic(query, domain);
    if (extracted.toLowerCase().includes(expected.toLowerCase())) {
      console.log(`✅ Passed: "${query}" [${domain}] -> Extracted "${extracted}" (contains "${expected}")`);
    } else {
      console.error(`❌ Failed: "${query}" [${domain}] -> Expected "${expected}", got "${extracted}"`);
      failures++;
    }
  }

  // Test 3: RAG Prompt Injection & Formatting Rules
  console.log('\n🧪 [Test 3] RAG Prompt Generation & Formatting Rules');
  const testQuery = 'sec edgar facts for AAPL CIK lookup';
  const enhanced = await massiveSmartRouter.combinedRouteAndEnhancePrompt(testQuery);

  if (!enhanced.includes('GAAP')) {
    console.error('❌ Failed: Enhanced prompt does not contain expected SEC EDGAR block');
    failures++;
  } else {
    console.log('✅ Passed: SEC EDGAR block found in RAG prompt');
  }

  if (!enhanced.includes('0000320193')) {
    console.error('❌ Failed: Enhanced prompt does not contain expected mock/real data identifiers (CIK: 0000320193 or Apple)');
    failures++;
  } else {
    console.log('✅ Passed: CIK or mock identifier found in RAG prompt');
  }

  if (!enhanced.includes('"[Source: SEC EDGAR XBRL Facts]"')) {
    console.error('❌ Failed: Enhanced prompt does not contain prominent SEC EDGAR citation rules');
    failures++;
  } else {
    console.log('✅ Passed: Citation rule found in RAG prompt');
  }

  if (!enhanced.includes('Present ALL zero-padded corporate **CIK**s and corporate financial metrics like **NetIncomeLoss** and **Revenues** in **BOLD**')) {
    console.error('❌ Failed: Enhanced prompt does not contain the mandatory premium bolding rule');
    failures++;
  } else {
    console.log('✅ Passed: Bolding rules found in RAG prompt');
  }

  // Test 4: JSON Metadata Injection Verification
  console.log('\n🧪 [Test 4] JSON Metadata Envelope Verification');
  const jsonMatch = enhanced.match(/<!-- JSON_METADATA: ({.*}) -->/);
  if (!jsonMatch) {
    console.error('❌ Failed: Enhanced prompt does not contain JSON_METADATA block');
    failures++;
  } else {
    try {
      const metadata = JSON.parse(jsonMatch[1]);
      if (metadata.premiumV16 && metadata.premiumV16.domain === 'sec_edgar') {
        console.log('✅ Passed: JSON metadata successfully extracted and verified:', metadata.premiumV16);
      } else {
        console.error('❌ Failed: JSON metadata is missing "premiumV16.sec_edgar" context:', metadata);
        failures++;
      }
    } catch (e) {
      console.error('❌ Failed to parse JSON metadata:', e.message);
      failures++;
    }
  }

  // Test 5: SWR Caching & Windows Granularity Performance Benchmark (< 50ms)
  console.log('\n🧪 [Test 5] SWR Cache Hit & Windows Clock-Granularity Performance Benchmark');
  const cacheKeyTestQuery = 'building permits for state California residential construction';
  
  // Cold lookup to seed the cache
  console.log('Seeding cache (cold lookup)...');
  const coldStart = Date.now();
  await massiveSmartRouter.combinedRouteAndEnhancePrompt(cacheKeyTestQuery);
  const coldDuration = Date.now() - coldStart;
  console.log(`- Cold lookup complete: ${coldDuration}ms`);

  // Hot lookup from SWR cache
  const hotStart = Date.now();
  const cachedPrompt = await massiveSmartRouter.combinedRouteAndEnhancePrompt(cacheKeyTestQuery);
  const hotDuration = Date.now() - hotStart;
  console.log(`- Hot lookup complete (cached): ${hotDuration}ms`);

  if (cachedPrompt.includes('CENSUS BUREAU')) {
    console.log('✅ Passed: Cached prompt contains correct RAG block');
  } else {
    console.error('❌ Failed: Cached prompt is missing Census BPS RAG context');
    failures++;
  }

  // High performance assertion (< 50ms threshold)
  if (hotDuration > 50) {
    console.error(`❌ Failed: Hot lookup took ${hotDuration}ms, which exceeds the 50ms SLA`);
    failures++;
  } else {
    console.log(`✅ Passed: SWR cache hit resolved in ${hotDuration}ms (< 50ms SLA)`);
  }

  console.log(`\n========================================`);
  if (failures === 0) {
    console.log('🟢 ALL v16 SMART ROUTING & INTENT EXTRACTION TESTS PASSED! 🟢');
    cleanup();
    process.exit(0);
  } else {
    console.error(`🔴 ${failures} SMART ROUTING TESTS FAILED! 🔴`);
    cleanup();
    process.exit(1);
  }
}

function cleanup() {
  if (RedisClient && typeof RedisClient.disconnect === 'function') {
    RedisClient.disconnect().catch(() => {});
  } else if (RedisClient && typeof RedisClient.quit === 'function') {
    RedisClient.quit().catch(() => {});
  }
}

runTests().catch(err => {
  console.error('❌ Unexpected runner error:', err);
  cleanup();
  process.exit(1);
});
