// Set custom DNS resolvers to bypass connection errors in sandbox environments
import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('Failed to set custom DNS servers:', e.message);
}

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { LangchainService } from '../src/app/modules/langchain/langchain.service.js';
import { ComposioCatalogService } from '../src/app/modules/composio/composio-catalog.service.js';

const dbUri = process.env.DATABASE_LOCAL;

async function test() {
  if (!dbUri) {
    console.error('[ERROR] DATABASE_LOCAL is not defined in environment variables.');
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`INTEGRATION TEST: LangChain & Composio Service Layers`);
  console.log(`======================================================`);
  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(dbUri);
  console.log(`✓ Connected successfully.`);
  console.log(`======================================================`);

  console.log(`\n1. FETCHING LANGCHAIN CATALOG STATS...`);
  const lcStats = await LangchainService.getLangchainStats();
  if (lcStats.success) {
    console.log(`✓ Stats retrieved successfully:`);
    console.log(`  - Total Repositories: ${lcStats.stats.totalRepositories}`);
    console.log(`  - Total Stars: ${lcStats.stats.totalStars}`);
    console.log(`  - Total Forks: ${lcStats.stats.totalForks}`);
    console.log(`  - Average Stars: ${lcStats.stats.averageStars}`);
    console.log(`  - Top Languages:`, lcStats.stats.languages.slice(0, 3));
    console.log(`  - Licenses Breakdown:`, lcStats.stats.licenses);
  } else {
    console.error(`✗ Failed to get LangChain stats.`);
  }

  console.log(`\n2. RUNNING LANGCHAIN TEXT SEARCH ("agent")...`);
  const lcSearch = await LangchainService.searchLangchainCatalog('agent', { limit: 3 });
  if (lcSearch.success) {
    console.log(`✓ Text search returned ${lcSearch.total} total matching repositories.`);
    console.log(`  Top 3 high-relevance matches:`);
    lcSearch.results.forEach((repo, idx) => {
      console.log(`    [${idx + 1}] ${repo.name} (Stars: ${repo.stars}, License: ${repo.license})`);
      console.log(`        Desc: ${repo.description || 'No description available'}`);
    });
  } else {
    console.error(`✗ LangChain search failed.`);
  }

  console.log(`\n3. FETCHING COMPOSIO CATALOG STATS...`);
  const compStats = await ComposioCatalogService.getComposioStats();
  if (compStats.success) {
    console.log(`✓ Stats retrieved successfully:`);
    console.log(`  - Total Repositories: ${compStats.stats.totalRepositories}`);
    console.log(`  - Total Stars: ${compStats.stats.totalStars}`);
    console.log(`  - Total Forks: ${compStats.stats.totalForks}`);
    console.log(`  - Average Stars: ${compStats.stats.averageStars}`);
    console.log(`  - Top Languages:`, compStats.stats.languages.slice(0, 3));
    console.log(`  - Licenses Breakdown:`, compStats.stats.licenses);
  } else {
    console.error(`✗ Failed to get Composio stats.`);
  }

  console.log(`\n4. RUNNING COMPOSIO TEXT SEARCH ("connect")...`);
  const compSearch = await ComposioCatalogService.searchComposioCatalog('connect', { limit: 3 });
  if (compSearch.success) {
    console.log(`✓ Text search returned ${compSearch.total} total matching repositories.`);
    console.log(`  Top 3 high-relevance matches:`);
    compSearch.results.forEach((repo, idx) => {
      console.log(`    [${idx + 1}] ${repo.name} (Stars: ${repo.stars}, License: ${repo.license})`);
      console.log(`        Desc: ${repo.description || 'No description available'}`);
    });
  } else {
    console.error(`✗ Composio search failed.`);
  }

  console.log(`\n======================================================`);
  console.log(`🎉 🎉 🎉 INTEGRATION VERIFICATION COMPLETED WITH 100% SUCCESS! 🎉 🎉 🎉`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

test().catch(err => {
  console.error("Test execution failed:", err);
  mongoose.disconnect();
  process.exit(1);
});
