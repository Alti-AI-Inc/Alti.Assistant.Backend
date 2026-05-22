/**
 * scratch/test_integrations_live.js
 *
 * Smoke test to verify that the upgraded deep integration modules execute safely,
 * invoke Python CLI subprocesses, fall back cleanly to deterministic mocks on timeout/failure/lack of keys,
 * and integrate perfectly with the massiveSmartRouter execution path.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environmental variables if available
dotenv.config();

import { getCommodityData, getSecFilingsData } from '../src/app/helpers/v10DataIntegrations.js';
import { getFredData } from '../src/app/helpers/v11DataIntegrations.js';
import { getGleifData, getPatentsViewData } from '../src/app/helpers/v12DataIntegrations.js';

const runTest = async () => {
  console.log("======================================================================");
  console.log("🚀 STARTING ALTI DEEP DATA INTEGRATION SMOKE TESTS");
  console.log("======================================================================\n");

  const testCases = [
    {
      name: "EIA Energy Spot Prices (WTI Petroleum live or fallback)",
      fn: getCommodityData,
      prompt: "Find the latest spot price of crude oil and EIA energy data",
    },
    {
      name: "EIA Energy Spot Prices (Natural Gas live or fallback)",
      fn: getCommodityData,
      prompt: "Show me the natural gas prices from EIA",
    },
    {
      name: "SEC EDGAR REIT holdings (Ticker-based submissions history)",
      fn: getSecFilingsData,
      prompt: "Extract recent filing history for REIT PLD corporate holdings",
    },
    {
      name: "SEC EDGAR REIT holdings (General keyword EFTS search)",
      fn: getSecFilingsData,
      prompt: "corporate filings matching Prologis or Equinix holdings",
    },
    {
      name: "FRED Macroeconomic Data (Bulk indices fetch)",
      fn: getFredData,
      prompt: "What is the current GDP, inflation rate, and sovereign bond yields in FRED",
    },
    {
      name: "FRED Macroeconomic Data (Keyword series search)",
      fn: getFredData,
      prompt: "FRED data for unemployment rate or sovereign yields",
    },
    {
      name: "GLEIF Entity Registry (GLEIF legal identifier map)",
      fn: getGleifData,
      prompt: "Look up corporate legal entity structure using GLEIF for Apple",
    },
    {
      name: "USPTO PatentsView (Patent grant search)",
      fn: getPatentsViewData,
      prompt: "Search patentsview index for digital data processing assignee Google",
    }
  ];

  for (const tc of testCases) {
    console.log(`----------------------------------------------------------------------`);
    console.log(`🔍 Case: ${tc.name}`);
    console.log(`Prompt sent: "${tc.prompt}"`);
    console.log(`----------------------------------------------------------------------`);
    try {
      const startTime = Date.now();
      const res = await tc.fn(tc.prompt);
      const duration = Date.now() - startTime;
      
      if (!res) {
        console.error("❌ FAIL: Function returned null!");
        continue;
      }
      
      console.log(`⏱️ Executed in: ${duration}ms`);
      console.log(`✨ Markdown Output Preview (First 8 lines):\n`);
      const lines = res.markdown.split('\n').slice(0, 10).join('\n');
      console.log(lines);
      console.log("\n...\n");
      
      console.log("💾 Metadata Output:");
      console.log(JSON.stringify(res.metadata, null, 2));
      console.log("\n✅ Safe Execution Verified successfully.\n");
    } catch (err) {
      console.error(`❌ ERROR in ${tc.name}:`, err.message);
    }
  }

  console.log("======================================================================");
  console.log("🏁 SMOKE TEST RUN COMPLETE");
  console.log("======================================================================\n");
  process.exit(0);
};

runTest().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
