import dotenv from 'dotenv';
dotenv.config();

import { detectPremiumV17Intent, extractPremiumV17Topic } from '../src/app/helpers/v17DataIntegrations.js';
import { massiveSmartRouter } from '../src/app/helpers/massiveSmartRouter.js';
import { RedisClient } from '../src/shared/redis.js';

async function runTests() {
  console.log('🚀 Running Alti.Assistant v17 Smart Routing & Dynamic Intent Extraction Tests...');
  let failures = 0;

  // Test 1: Intent Detection (v17 Premium)
  console.log('\n🧪 [Test 1] Query Intent Detection');
  const intentsV17 = [
    { query: 'courtlistener lookup for Silicon Valley Bank litigation dockets', expected: 'courtlistener' },
    { query: 'harvard caselaw precedent for Anderson judicial opinions', expected: 'harvard_caselaw' },
    { query: 'cisa kev exploit catalog for CVE-2024-21345 vulnerability details', expected: 'cisa_kev' },
    { query: 'nist nvd lookup details for CVE-2024-12345 cvss score', expected: 'nist_nvd_cve' },
    { query: 'ofac sanctions sdn screening for Dmitry Petrov compliance check', expected: 'ofac_sanctions' },
    { query: 'fara foreign agents lobbying registrations for Alpine Strategies', expected: 'fara_foreign_agents' }
  ];

  for (const { query, expected } of intentsV17) {
    const detected = detectPremiumV17Intent(query);
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
    { query: 'courtlistener docket lookup for Silicon Valley Bank', domain: 'courtlistener', expected: 'silicon valley bank' },
    { query: 'harvard caselaw precedent for Anderson', domain: 'harvard_caselaw', expected: 'anderson' },
    { query: 'cisa kev for CVE-2024-21345', domain: 'cisa_kev', expected: 'cve-2024-21345' },
    { query: 'nvd cve search for CVE-2024-12345', domain: 'nist_nvd_cve', expected: 'cve-2024-12345' },
    { query: 'ofac sdn screening for Dmitry Petrov', domain: 'ofac_sanctions', expected: 'dmitry petrov' },
    { query: 'fara lookup for Alpine Strategies', domain: 'fara_foreign_agents', expected: 'alpine strategies' }
  ];

  for (const { query, domain, expected } of topics) {
    const extracted = extractPremiumV17Topic(query, domain);
    if (extracted.toLowerCase().includes(expected.toLowerCase())) {
      console.log(`✅ Passed: "${query}" [${domain}] -> Extracted "${extracted}" (contains "${expected}")`);
    } else {
      console.error(`❌ Failed: "${query}" [${domain}] -> Expected "${expected}", got "${extracted}"`);
      failures++;
    }
  }

  // Test 3: RAG Prompt Injection & Formatting Rules
  console.log('\n🧪 [Test 3] RAG Prompt Generation & Formatting Rules');
  const testQuery = 'cisa kev catalog lookup for CVE-2024-21345';
  const enhanced = await massiveSmartRouter.combinedRouteAndEnhancePrompt(testQuery);

  if (!enhanced.includes('CISA KNOWN EXPLOITED VULNERABILITIES')) {
    console.error('❌ Failed: Enhanced prompt does not contain expected CISA KEV block');
    failures++;
  } else {
    console.log('✅ Passed: CISA KEV block found in RAG prompt');
  }

  if (!enhanced.includes('CVE-2024-21345')) {
    console.error('❌ Failed: Enhanced prompt does not contain expected mock/real data identifiers (CVE-2024-21345)');
    failures++;
  } else {
    console.log('✅ Passed: CVE identifier found in RAG prompt');
  }

  if (!enhanced.includes('"[Source: CISA Known Exploited Vulnerabilities Catalog]"')) {
    console.error('❌ Failed: Enhanced prompt does not contain prominent CISA KEV citation rules');
    failures++;
  } else {
    console.log('✅ Passed: Citation rule found in RAG prompt');
  }

  if (!enhanced.includes('Present ALL unique **CVE-IDs**, product versions, and ransomware campaign designations in **BOLD**')) {
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
      if (metadata.premiumV17 && metadata.premiumV17.domain === 'cisa_kev') {
        console.log('✅ Passed: JSON metadata successfully extracted and verified:', metadata.premiumV17);
      } else {
        console.error('❌ Failed: JSON metadata is missing "premiumV17.cisa_kev" context:', metadata);
        failures++;
      }
    } catch (e) {
      console.error('❌ Failed to parse JSON metadata:', e.message);
      failures++;
    }
  }

  // Test 5: SWR Caching & Windows Granularity Performance Benchmark (< 50ms)
  console.log('\n🧪 [Test 5] SWR Cache Hit & Windows Clock-Granularity Performance Benchmark');
  const cacheKeyTestQuery = 'ofac sanctions sdn screening for Dmitry Petrov';
  
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

  if (cachedPrompt.includes('OFAC SANCTIONS')) {
    console.log('✅ Passed: Cached prompt contains correct RAG block');
  } else {
    console.error('❌ Failed: Cached prompt is missing OFAC Sanctions RAG context');
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
    console.log('🟢 ALL v17 SMART ROUTING & INTENT EXTRACTION TESTS PASSED! 🟢');
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
