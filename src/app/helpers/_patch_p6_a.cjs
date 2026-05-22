/**
 * Phase 6 — "Fully Entrenched" PredictionData.io Integration
 *
 * Patches:
 * 1. smartSearchRouter.js
 *    - Direct path: sports-only → sportsSmartRouter (skip financial router)
 *    - SGP / player props / multi-league → force ReAct agent (not grounding)
 *    - Complexity scorer boosted for sports betting keywords
 *    - Rich citationMetadata includes intentType, league, playerName
 *
 * 2. sportsDataCache.js
 *    - Export refreshLeagueNow(league) for on-demand refresh from router
 *    - Export getCachedLiveLeagues() → leagues with live games in Redis
 *
 * 3. sportsSmartRouter.js v4.2
 *    - pickBestLine(markets) → best odds across all books per market side
 *    - detectLineMover(markets) → open_odds vs odds delta (steam detection)
 *    - buildSharpAnalysis(markets) → Pinnacle (250) as reference book
 *    - Live game auto-detection → if fixture is in_progress, switch to live mode
 *    - buildValueBetsBlock(markets) → +EV markets ranked by edge
 *    - formatBestAvailableBlock → new display format
 *    - refreshLeagueNow called on every sports query for freshness
 *
 * 4. predictiondata.route.js
 *    - POST /analysis → value_bets | line_movers | sharp_picks | best_available
 *    - GET /markets/value-bets → +EV bets ranked by edge vs Pinnacle/no-vig
 *    - GET /markets/line-movers → biggest open_odds vs current movement
 *    - GET /markets/sharp-picks → markets where Pinnacle diverges from squares
 */

const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 1: smartSearchRouter.js
// ─────────────────────────────────────────────────────────────────────────────
const ssrFile = 'src/app/modules/search/services/smartSearchRouter.js';
let ssr = fs.readFileSync(ssrFile, 'utf8');

if (ssr.includes('SSR_SPORTS_V6')) {
  console.log('smartSearchRouter already patched');
} else {
  // 1a. Add sportsSmartRouter import
  const oldImports = `import { executeGroundedSearch } from './geminiGroundingService.js';\r\nimport { executeToolBasedConversation } from './reactAgent.js';\r\nimport { classifyFinancialQuery, classifySportsQuery } from './queryClassifier.js';\r\nimport { massiveSmartRouter } from '../../../helpers/massiveSmartRouter.js';`;

  const newImports = `import { executeGroundedSearch } from './geminiGroundingService.js';
import { executeToolBasedConversation } from './reactAgent.js';
import { classifyFinancialQuery, classifySportsQuery } from './queryClassifier.js';
import { massiveSmartRouter } from '../../../helpers/massiveSmartRouter.js';
import { sportsSmartRouter } from '../../../helpers/sportsSmartRouter.js';
import { refreshLeagueNow } from '../../../helpers/sportsDataCache.js';
// SSR_SPORTS_V6`;

  ssr = ssr.replace(oldImports, newImports);

  // 1b. Boost sports-specific complexity keywords
  const oldPrediction = `    // Prediction/analysis requests
    prediction: [
      'predict',
      'forecast',
      'who will win',
      'chances',
      'likely',
      'probability',
      'odds',
      'bet',
      'spread',
      'moneyline',
      'over under',
      'player prop',
      'same game parlay',
      'sgp',
      'futures odds',
      'betting line',
      'sportsbook',
      'parlay',
    ],`;

  const newPrediction = `    // Prediction/analysis requests + sports betting (boosted)
    prediction: [
      'predict',
      'forecast',
      'who will win',
      'chances',
      'likely',
      'probability',
      'odds',
      'bet',
      'spread',
      'moneyline',
      'over under',
      'player prop',
      'same game parlay',
      'sgp',
      'futures odds',
      'betting line',
      'sportsbook',
      'parlay',
      // Sports-specific high-complexity
      'best line',
      'line movement',
      'line mover',
      'steam move',
      'sharp money',
      'value bet',
      'best available',
      'price sgp',
      'build parlay',
      'who has the best odds',
      'which book',
      'sharp pick',
      'ev bet',
      '+ev',
      'no vig',
      'fair value',
      'all games tonight',
      'all sports',
      'multiple leagues',
    ],`;

  ssr = ssr.replace(oldPrediction, newPrediction);

  // 1c. Replace the PRIORITY 1 sports block with an improved version
  const oldSportsBlock = `  // ── PRIORITY 1: Sports betting queries get PredictionData.io real-time data first ──
  const sportsClass = classifySportsQuery(query);
  if (sportsClass.isSports) {
    console.log(\`\\n🏈 Sports query detected (\${sportsClass.intentType}, \${(sportsClass.confidence * 100).toFixed(0)}% confidence) — routing to PredictionData.io [\${sportsClass.league}]\`);
    try {
      const enhancedQuery = await massiveSmartRouter.combinedRouteAndEnhancePrompt(query);
      if (enhancedQuery !== query) {
        const result = await executeGroundedSearch(enhancedQuery, conversationHistory);
        return {
          answer: result.answer,
          reference: result.reference || [],
          citations: result.citations || [],
          citationMetadata: {
            ...result.citationMetadata,
            method: 'predictiondata_sports_grounding',
            sportsIntent: sportsClass.intentType,
            league: sportsClass.league,
          },
        };
      }
    } catch (err) {
      console.warn(\`⚠️ PredictionData.io sports routing failed, continuing with standard search: \${err.message}\`);
    }
  }`;

  const newSportsBlock = `  // ══ PRIORITY 1: Sports betting → PredictionData.io (fully entrenched) ════════
  const sportsClass = classifySportsQuery(query);
  if (sportsClass.isSports) {
    const intentType  = sportsClass.intentType;
    const league      = sportsClass.league;
    const confidence  = (sportsClass.confidence * 100).toFixed(0);
    console.log(\`\\n🏈 Sports [\${intentType}] \${league} (\${confidence}%) → PredictionData.io\`);

    // Fire-and-forget background cache refresh for this league (keeps data fresh)
    if (league && league !== 'MULTI') {
      refreshLeagueNow(league).catch(() => {});
    }

    // High-complexity sports intents → ReAct agent (has the sports tool + web)
    const REACT_INTENTS = new Set(['sgp', 'prediction_market', 'alt_lines', 'multi_league']);
    const forceReAct    = REACT_INTENTS.has(intentType) || sportsClass.confidence > 0.97;

    if (forceReAct) {
      console.log(\`   ↳ ReAct agent forced (intent=\${intentType})\`);
      try {
        const messages = [
          { role: 'system', content: 'You are Alti, an expert sports betting AI. Use the predictiondata-sports-odds tool for all real-time odds, player props, SGP pricing, and prediction market queries.' },
          ...conversationHistory,
          { role: 'user', content: query },
        ];
        const result = await executeToolBasedConversation(messages, options);
        return {
          answer: result.responseMessage.answer,
          reference: result.responseMessage.reference || [],
          citations: result.responseMessage.citations || [],
          citationMetadata: {
            ...result.responseMessage.citationMetadata,
            method: 'sports_react_agent',
            sportsIntent: intentType,
            league,
            playerName: sportsClass.playerName || null,
          },
        };
      } catch (err) {
        console.warn(\`⚠️ Sports ReAct agent failed: \${err.message} — falling back to grounding\`);
      }
    }

    // Standard sports intents → direct sportsSmartRouter (fastest path, no financial overhead)
    try {
      const enhancedQuery = await sportsSmartRouter.routeAndEnhancePrompt(query);
      if (enhancedQuery !== query) {
        const result = await executeGroundedSearch(enhancedQuery, conversationHistory);
        return {
          answer: result.answer,
          reference: result.reference || [],
          citations: result.citations || [],
          citationMetadata: {
            ...result.citationMetadata,
            method: 'predictiondata_sports_grounding',
            sportsIntent: intentType,
            league,
            playerName: sportsClass.playerName || null,
            source: 'PredictionData.io',
          },
        };
      }
    } catch (err) {
      console.warn(\`⚠️ PredictionData.io sports routing failed: \${err.message}\`);
    }
  }`;

  ssr = ssr.replace(oldSportsBlock, newSportsBlock);

  fs.writeFileSync(ssrFile, ssr, 'utf8');
  console.log('✅ smartSearchRouter.js: direct sports routing + ReAct escalation + background refresh');
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 2: sportsDataCache.js — export refreshLeagueNow + getCachedLiveLeagues
// ─────────────────────────────────────────────────────────────────────────────
const cacheFile = 'src/app/helpers/sportsDataCache.js';
let cache = fs.readFileSync(cacheFile, 'utf8');

if (!cache.includes('refreshLeagueNow')) {
  // Add exported functions before the existing exports
  const oldExports = `export { warmSportsCache, getSportsCacheStatus, stopSportsCache };`;
  const newExports = `
/**
 * refreshLeagueNow — on-demand cache refresh for a specific league.
 * Called by smartSearchRouter whenever a sports query fires, to ensure
 * the data is as fresh as possible before the LLM call.
 * @param {string} league — e.g. 'NFL', 'NBA'
 */
export async function refreshLeagueNow(league) {
  if (!league || league === 'MULTI') return;
  try {
    await warmLeague(league);
    console.log(\`[SportsCache] On-demand refresh complete for \${league}\`);
  } catch (err) {
    console.warn(\`[SportsCache] On-demand refresh failed for \${league}: \${err.message}\`);
  }
}

/**
 * getCachedLiveLeagues — returns array of leagues that currently have
 * in-progress games in Redis (from the 15s live fixture ticker).
 * Used by the router to automatically switch to live odds mode.
 */
export async function getCachedLiveLeagues() {
  const liveLeagues = [];
  const leagues = ['NFL', 'NBA', 'MLB', 'NHL', 'UFC', 'EPL', 'MLS'];
  await Promise.allSettled(
    leagues.map(async (league) => {
      try {
        const data = await rcGet(\`fixtures:live:\${league}\`);
        if (data && data.length > 0) liveLeagues.push(league);
      } catch { /* ignore */ }
    })
  );
  return liveLeagues;
}

export { warmSportsCache, getSportsCacheStatus, stopSportsCache };`;

  cache = cache.replace(oldExports, newExports);
  fs.writeFileSync(cacheFile, cache, 'utf8');
  console.log('✅ sportsDataCache.js: exported refreshLeagueNow + getCachedLiveLeagues');
} else {
  console.log('sportsDataCache already has refreshLeagueNow');
}

console.log('\nPhase 6 Patch 1-2 complete. Run next script for router v4.2 + route analysis endpoints.');
