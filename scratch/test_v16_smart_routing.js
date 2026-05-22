import dotenv from 'dotenv';
dotenv.config();

import { detectGreenlightIntent, extractGreenlightTopic } from '../src/app/helpers/v14DataIntegrations.js';
import { detectPremiumIntent, extractPremiumTopic } from '../src/app/helpers/v15DataIntegrations.js';
import { massiveSmartRouter } from '../src/app/helpers/massiveSmartRouter.js';
import { RedisClient } from '../src/shared/redis.js';

async function runTests() {
  console.log('🚀 Running Alti.Assistant v16 Smart Routing & Dynamic Intent Extraction Tests...');
  let failures = 0;

  // Test 1: Intent Detection (v14 Greenlight & v15 Premium)
  console.log('\n🧪 [Test 1] Query Intent Detection');
  const intentsV14 = [
    { query: 'fec campaign finance contribution for Sterling', expected: 'politics_campaign' },
    { query: 'legiscan bill tracking sponsors hr-1024', expected: 'legislation_tracking' },
    { query: 'elected representative district CA-12', expected: 'civic_representatives' },
    { query: 'dbnomics macroeconomic index for inflation', expected: 'macroeconomics_global' },
    { query: 'cfpb hmda mortgage lending application count', expected: 'mortgage_lending' },
    { query: 'openfema flood zone AE disaster status', expected: 'disaster_hazards' },
    { query: 'nih reporter grants medical research for diabetes', expected: 'medical_research' },
    { query: 'companies house uk company registration number 01234567', expected: 'uk_company_registry' },
    { query: 'opencorporates global entity registry Delaware Good Standing', expected: 'global_entity_registry' }
  ];

  for (const { query, expected } of intentsV14) {
    const detected = detectGreenlightIntent(query);
    if (detected === expected) {
      console.log(`✅ Passed: "${query}" -> ${detected}`);
    } else {
      console.error(`❌ Failed: "${query}" -> Expected ${expected}, got ${detected}`);
      failures++;
    }
  }

  const intentsV15 = [
    { query: 'clinical trials for leukemia study recruitment status', expected: 'clinical_trials' },
    { query: 'openfda drug recalls class I warnings', expected: 'fda_drug_safety' },
    { query: 'who gho measles immunization rate uhealth', expected: 'global_health_observatory' },
    { query: 'us treasury fiscal sovereign cash national debt yield', expected: 'us_treasury_fiscal' },
    { query: 'usaspending federal contract award USA-123456', expected: 'federal_spending' },
    { query: 'nppes npi provider registry healthcare clinical', expected: 'healthcare_npi' },
    { query: 'fooddata calorie breakdown whole foods macronutrient', expected: 'food_nutrients' },
    { query: 'irs tax-exempt charity publication 78 EIN 12-3456789', expected: 'charity_registry' },
    { query: 'faa airport status JFK flight delays', expected: 'aviation_delays' }
  ];

  for (const { query, expected } of intentsV15) {
    const detected = detectPremiumIntent(query);
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
    { query: 'fec campaign finance Sterling', domain: 'politics_campaign', expected: 'sterling', isV14: true },
    { query: 'legiscan tracking bill hr-1234', domain: 'legislation_tracking', expected: 'bill hr-1234', isV14: true },
    { query: 'clinical trials for leukemia', domain: 'clinical_trials', expected: 'leukemia', isV14: false },
    { query: 'faa airport status for JFK airport', domain: 'aviation_delays', expected: 'jfk airport', isV14: false }
  ];

  for (const { query, domain, expected, isV14 } of topics) {
    const extracted = isV14 ? extractGreenlightTopic(query, domain) : extractPremiumTopic(query, domain);
    if (extracted.toLowerCase().includes(expected.toLowerCase())) {
      console.log(`✅ Passed: "${query}" [${domain}] -> Extracted "${extracted}" (contains "${expected}")`);
    } else {
      console.error(`❌ Failed: "${query}" [${domain}] -> Expected "${expected}", got "${extracted}"`);
      failures++;
    }
  }

  // Test 3: RAG Prompt Injection & Formatting Rules
  console.log('\n🧪 [Test 3] RAG Prompt Generation & Formatting Rules');
  const testQuery = 'clinical trials for leukemia study recruitment status';
  const enhanced = await massiveSmartRouter.combinedRouteAndEnhancePrompt(testQuery);

  if (!enhanced.includes('CLINICALTRIALS.GOV')) {
    console.error('❌ Failed: Enhanced prompt does not contain expected ClinicalTrials block');
    failures++;
  } else {
    console.log('✅ Passed: ClinicalTrials block found in RAG prompt');
  }

  if (!enhanced.includes('NCT0123456')) {
    console.error('❌ Failed: Enhanced prompt does not contain expected mock data identifiers (NCT0123456)');
    failures++;
  } else {
    console.log('✅ Passed: Mock data identifier (NCT0123456) found in RAG prompt');
  }

  if (!enhanced.includes('"[Source: ClinicalTrials.gov]"')) {
    console.error('❌ Failed: Enhanced prompt does not contain prominent ClinicalTrials.gov citation rules');
    failures++;
  } else {
    console.log('✅ Passed: Citation rule found in RAG prompt');
  }

  if (!enhanced.includes('Present ALL ClinicalTrials.gov NCT identifiers, enrollment sizes, lead sponsors, recruitment statuses, and trial phases in **BOLD**')) {
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
      if (metadata.premium && metadata.premium.domain === 'clinical_trials') {
        console.log('✅ Passed: JSON metadata successfully extracted and verified:', metadata.premium);
      } else {
        console.error('❌ Failed: JSON metadata is missing "premium.clinical_trials" context:', metadata);
        failures++;
      }
    } catch (e) {
      console.error('❌ Failed to parse JSON metadata:', e.message);
      failures++;
    }
  }

  // Test 5: SWR Caching & Windows Granularity Performance Benchmark (< 50ms)
  console.log('\n🧪 [Test 5] SWR Cache Hit & Windows Clock-Granularity Performance Benchmark');
  const cacheKeyTestQuery = 'openfema flood zone AE disaster status';
  
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

  if (cachedPrompt.includes('OPENFEMA')) {
    console.log('✅ Passed: Cached prompt contains correct RAG block');
  } else {
    console.error('❌ Failed: Cached prompt is missing openFEMA RAG context');
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
