/**
 * verify_macroeconomics_grounding.js
 *
 * Verification script for testing Alti's Stage 25 and Stage 24 global
 * macroeconomic and legal/customs grounding channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Global Macroeconomics & WEF Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'World Economic Forum (WEF) Competitiveness Index',
      query: 'What is the WEF Global Competitiveness Index rating and score for Canada?',
      expectedId: 'wef_competitiveness'
    },
    {
      name: 'IMF World Economic Outlook',
      query: 'Give me the IMF real GDP forecasts and inflation projections for Euro Area',
      expectedId: 'imf_outlook'
    },
    {
      name: 'OECD Composite Leading Indicators',
      query: 'Retrieve the OECD Composite Leading Indicators and consumer sentiment for Germany 🇩🇪',
      expectedId: 'oecd_indicators'
    },
    {
      name: 'US Customs Tariffs (HTS) (Stage 24)',
      query: 'What is the HTS tariff rate and code for Lithium-Ion Battery Storage Cells?',
      expectedId: 'hts_tariffs'
    },
    {
      name: 'SCOTUS Case precedents (Oyez) (Stage 24)',
      query: 'Find the Oyez Supreme Court case holding and justice votes for Citizens United v. FEC',
      expectedId: 'oyez_scotus'
    },
    {
      name: 'Canadian SEDAR corporate disclosures (Stage 24)',
      query: 'Search SEDAR for Royal Bank of Canada quarterly reports',
      expectedId: 'sedar_filings'
    },
    {
      name: 'UK ONS Macroeconomics (Stage 26)',
      query: 'Get the UK ONS economic metrics and CPIH inflation rate for London Region 🇬🇧',
      expectedId: 'uk_ons_economics'
    },
    {
      name: 'Bank of England Base Rate (Stage 26)',
      query: 'What is the current Bank of England base rate and MPC policy stance?',
      expectedId: 'boe_monetary'
    },
    {
      name: 'UK HM Land Registry (HMLR) House Prices (Stage 26)',
      query: 'Find UK Land Registry average house prices for Greater London 🏰',
      expectedId: 'uk_land_registry'
    },
    {
      name: 'Germany Destatis Macroeconomics (Stage 27)',
      query: 'Retrieve Germany inflation (Verbraucherpreisindex) and GDP growth rate from Destatis for Bavaria (Bayern) 🇩🇪',
      expectedId: 'german_destatis_economics'
    },
    {
      name: 'France INSEE Macroeconomics (Stage 27)',
      query: 'Search INSEE for metropolitan France GDP growth and HICP inflation metrics',
      expectedId: 'french_insee_economics'
    },
    {
      name: 'ECB European Monetary Policy (Stage 27)',
      query: 'What is the current ECB main refinancing rate and Eurozone HICP target?',
      expectedId: 'ecb_monetary'
    },
    {
      name: 'China NBS & PBOC Economic Monitor (Stage 28)',
      query: 'Retrieve China real GDP growth and PBOC Loan Prime Rate interest rates',
      expectedId: 'china_macro_economics'
    },
    {
      name: 'India MOSPI & RBI monetary policy (Stage 28)',
      query: 'Find India GDP growth, CPI inflation, and Reserve Bank of India repo base rate',
      expectedId: 'india_macro_economics'
    },
    {
      name: 'Japan Statistics Bureau & BOJ Economic monitor (Stage 28)',
      query: 'Retrieve Japan GDP growth rate, core CPI inflation, and Bank of Japan policy rate target',
      expectedId: 'japan_macro_economics'
    },
    {
      name: 'Australia ABS & RBA monetary policy (Stage 28)',
      query: 'Retrieve Australian Bureau of Statistics GDP, RBA cash rate, and trade balance',
      expectedId: 'australia_macro_economics'
    },
    {
      name: 'Brazil IBGE & BCB Monetary policy (Stage 28)',
      query: 'Find Brazil GDP growth, IPCA CPI inflation, and Banco Central do Brasil Selic rate target',
      expectedId: 'brazil_macro_economics'
    },
    {
      name: 'South Korea KOSTAT & BOK economic monitor (Stage 29)',
      query: 'Retrieve South Korea real GDP growth rate, CPI inflation, and Bank of Korea base policy rate',
      expectedId: 'south_korea_macro_economics'
    },
    {
      name: 'Singapore SingStat & MAS monetary policy (Stage 29)',
      query: 'Retrieve Singapore real GDP growth, CPI inflation rate, and MAS S$NEER policy stance',
      expectedId: 'singapore_macro_economics'
    },
    {
      name: 'Switzerland FSO & SNB monetary monitor (Stage 29)',
      query: 'Find Switzerland GDP growth, CPI inflation, and Swiss National Bank policy base rate',
      expectedId: 'switzerland_macro_economics'
    },
    {
      name: 'South Africa Stats SA & SARB repo policy (Stage 29)',
      query: 'Find South Africa GDP growth, Consumer Price Index inflation, and SARB Repo rate target',
      expectedId: 'south_africa_macro_economics'
    },
    {
      name: 'Mexico INEGI & Banxico interbank policy (Stage 29)',
      query: 'Find Mexico GDP growth rate, CPI inflation index, and Banxico overnight interbank rate target',
      expectedId: 'mexico_macro_economics'
    }
  ];

  let successCount = 0;

  for (const test of testQueries) {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`🧪 Test Case: ${test.name}`);
    console.log(`   Query: "${test.query}"`);
    
    // Detect matching providers
    const activeProviders = SearchEngineRegistry.detectActiveProviders(test.query);
    const matchedIds = activeProviders.map(p => p.id);
    console.log(`   Detected Providers: [${matchedIds.join(', ')}]`);

    if (matchedIds.includes(test.expectedId)) {
      console.log(`   ✅ Intent Detection Passed.`);
    } else {
      console.log(`   ❌ Intent Detection Failed (Expected "${test.expectedId}").`);
    }

    // Execute combined RAG pipeline
    const ragContext = await SearchEngineRegistry.combinedRouteAndEnhance(test.query);
    
    if (ragContext && ragContext.includes('GROUNDED DATA SOURCE')) {
      console.log(`   ✅ RAG Pipeline Synthesis Completed Successfully.`);
      console.log(`   --- Output Sneak Peek ---`);
      const lines = ragContext.split('\n');
      console.log(lines.slice(0, 12).join('\n'));
      console.log(`   ...`);
      successCount++;
    } else {
      console.log(`   ❌ RAG Pipeline Synthesis Failed (Returned empty or raw query).`);
    }
  }

  console.log(`--------------------------------------------------------------------------------`);
  console.log(`📊 Verification Summary: ${successCount} / ${testQueries.length} passed.`);
  if (successCount === testQueries.length) {
    console.log('🎉 All systems functional! Grounding channels compile and run without error.');
    process.exit(0);
  } else {
    console.log('⚠️ Some tests failed. Please inspect logs.');
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('💥 Fatal error during verification:', err);
  process.exit(1);
});
