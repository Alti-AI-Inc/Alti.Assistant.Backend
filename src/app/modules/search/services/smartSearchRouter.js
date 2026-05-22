import { executeGroundedSearch } from './geminiGroundingService.js';
import { executeToolBasedConversation } from './reactAgent.js';
import { classifyFinancialQuery, classifySportsQuery } from './queryClassifier.js';
import { massiveSmartRouter } from '../../../helpers/massiveSmartRouter.js';
import { sportsSmartRouter } from '../../../helpers/sportsSmartRouter.js';
import { refreshLeagueNow } from '../../../helpers/sportsDataCache.js';
// SSR_SPORTS_V6

/**
 * Smart Search Router
 * Chooses between native Google Search grounding and ReAct agent based on query complexity
 */

/**
 * Analyzes query to determine if it requires complex reasoning
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages
 * @returns {Object} Analysis result
 */
function analyzeQueryComplexity(query, conversationHistory = []) {
  const lowerQuery = query.toLowerCase();

  // Indicators of complex queries requiring ReAct reasoning
  const complexIndicators = {
    // Multiple step reasoning
    multiStep: [
      'compare',
      'comparison',
      'vs',
      'versus',
      'better than',
      'should i',
      'recommend',
      'analysis',
      'analyze',
      'pros and cons',
      'advantages',
      'disadvantages',
    ],

    // Requires filtering/specific criteria
    specificCriteria: [
      'home game',
      'away game',
      'next home',
      'next away',
      'only',
      'specifically',
      'exactly',
      'precisely',
    ],

    // Requires synthesis from multiple sources
    multiSource: [
      'verify',
      'confirm',
      'check multiple',
      'cross-reference',
      'validate',
    ],

    // Prediction/analysis requests + sports betting (boosted for ReAct)
    prediction: [
      'predict', 'forecast', 'who will win', 'chances', 'likely', 'probability',
      'odds', 'bet', 'spread', 'moneyline', 'over under', 'player prop',
      'same game parlay', 'sgp', 'futures odds', 'betting line', 'sportsbook', 'parlay',
      // Sports analysis keywords → force ReAct agent
      'best line', 'line movement', 'steam move', 'sharp money', 'value bet',
      'best available', 'price sgp', '+ev', 'no vig', 'fair value',
      'which book', 'sharp pick', 'ev bet', 'who has the best odds',
    ],
  };

  // Check for complex indicators
  const hasComplexIndicators = Object.values(complexIndicators)
    .flat()
    .some((indicator) => lowerQuery.includes(indicator));

  // Long conversation history suggests need for context-aware reasoning
  const hasLongHistory = conversationHistory.length > 5;

  // Multi-part questions
  const hasMultipleQuestions = (query.match(/\?/g) || []).length > 1;

  // Check if query explicitly needs filtering (home/away games)
  const needsFiltering = /\b(home|away)\s+(game|match|schedule)\b/i.test(query);

  const score =
    (hasComplexIndicators ? 2 : 0) +
    (hasLongHistory ? 1 : 0) +
    (hasMultipleQuestions ? 1 : 0) +
    (needsFiltering ? 2 : 0);

  return {
    isComplex: score >= 2,
    score,
    reason: hasComplexIndicators
      ? 'Query requires multi-step reasoning'
      : needsFiltering
        ? 'Query requires specific filtering criteria'
        : hasLongHistory
          ? 'Long conversation history requires context-aware processing'
          : 'Simple factual query',
    method: score >= 2 ? 'react_agent' : 'native_grounding',
  };
}

/**
 * Execute search with automatic routing
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages for context
 * @param {Object} options - Additional options (userId, etc.)
 * @returns {Object} Formatted response with answer, references, and citations
 */
/**
 * Extract last seen sports context from conversation history.
 * Enables follow-up queries like "what about Mahomes props?" to inherit
 * the league/player from the previous sports query in the conversation.
 */
function extractSportsContext(conversationHistory) {
  // SPORTS_CONTEXT_V7
  if (!conversationHistory || conversationHistory.length === 0) return {};
  // Walk history backwards looking for sports metadata
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    const meta = msg?.citationMetadata || msg?.metadata || {};
    if (meta.sportsIntent) {
      return {
        lastLeague:    meta.league    || null,
        lastIntent:    meta.sportsIntent || null,
        lastPlayer:    meta.playerName || null,
        lastSource:    meta.source    || null,
      };
    }
    // Also check if message content contains obvious sports hints
    const content = (msg?.content || msg?.text || '').toLowerCase();
    const leagues = ['nfl', 'nba', 'mlb', 'nhl', 'ufc', 'golf', 'tennis'];
    for (const lg of leagues) {
      if (content.includes(lg)) return { lastLeague: lg.toUpperCase(), lastIntent: 'odds' };
    }
  }
  return {};
}

export async function executeSmartSearch(
  query,
  conversationHistory = [],
  options = {}
) {
  // ══ PRIORITY 1: Sports betting → PredictionData.io (fully entrenched) ════════
  const sportsClass = classifySportsQuery(query);
  if (sportsClass.isSports) {
    const intentType  = sportsClass.intentType;
    // Inject multi-turn context: if no league detected, try last seen league from history
    const ctx     = extractSportsContext(conversationHistory);
    const league  = sportsClass.league || ctx.lastLeague || 'NFL';
    const confidence  = (sportsClass.confidence * 100).toFixed(0);
    console.log(`\n🏈 Sports [${intentType}] ${league} (${confidence}%) → PredictionData.io`);

    // Fire-and-forget background cache refresh for this league
    if (league && league !== 'MULTI') {
      refreshLeagueNow(league).catch(() => {});
    }

    // High-complexity sports intents → ReAct agent (has sports tool + web search)
    const REACT_INTENTS = new Set(['sgp', 'prediction_market', 'alt_lines', 'multi_league', 'dfs', 'arbitrage']);
    const forceReAct    = REACT_INTENTS.has(intentType) || sportsClass.confidence > 0.97;

    if (forceReAct) {
      console.log(`   ↳ ReAct agent forced (intent=${intentType})`);
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
        console.warn(`⚠️ Sports ReAct agent failed: ${err.message} — falling back to grounding`);
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
      console.warn(`⚠️ PredictionData.io sports routing failed: ${err.message}`);
    }
  }

    // ── PRIORITY 2: Financial queries get Massive.com real-time data ──
  const financialClass = classifyFinancialQuery(query);
  if (financialClass.isFinancial) {
    console.log(`\n💹 Financial query detected (${financialClass.intentType}, ${(financialClass.confidence * 100).toFixed(0)}% confidence) — routing to Massive.com`);
    try {
      const enhancedQuery = await massiveSmartRouter.combinedRouteAndEnhancePrompt(query);
      if (enhancedQuery !== query) {
        // Massive data injected — run through native grounding for citations
        const result = await executeGroundedSearch(enhancedQuery, conversationHistory);
        return {
          answer: result.answer,
          reference: result.reference || [],
          citations: result.citations || [],
          citationMetadata: {
            ...result.citationMetadata,
            method: 'massive_financial_grounding',
            financialIntent: financialClass.intentType,
            symbol: financialClass.symbol,
          },
        };
      }
    } catch (err) {
      console.warn(`⚠️ Massive.com financial routing failed, continuing with standard search: ${err.message}`);
    }
  }

  const analysis = analyzeQueryComplexity(query, conversationHistory);

  console.log(`\n🧠 Smart Router Analysis:`);
  console.log(`   Complexity Score: ${analysis.score}`);
  console.log(`   Method: ${analysis.method.toUpperCase()}`);
  console.log(`   Reason: ${analysis.reason}`);

  try {
    if (analysis.isComplex) {
      console.log(`\n🔄 Using ReAct Agent (Complex Query)`);

      // Build messages for ReAct agent
      const messages = [
        {
          role: 'system',
          content: `You are a helpful AI assistant with access to search tools. Provide accurate, well-researched answers with proper citations.`,
        },
        ...conversationHistory,
        {
          role: 'user',
          content: query,
        },
      ];

      const result = await executeToolBasedConversation(messages, options);

      return {
        answer: result.responseMessage.answer,
        reference: result.responseMessage.reference || [],
        citations: result.responseMessage.citations || [],
        citationMetadata: {
          ...result.responseMessage.citationMetadata,
          method: 'react_agent',
          complexity: analysis.score,
        },
      };
    } else {
      console.log(`\n⚡ Using Native Google Grounding (Simple Query)`);

      const result = await executeGroundedSearch(query, conversationHistory);

      return {
        answer: result.answer,
        reference: result.reference || [],
        citations: result.citations || [],
        citationMetadata: {
          ...result.citationMetadata,
          method: 'native_grounding',
          complexity: analysis.score,
        },
      };
    }
  } catch (error) {
    console.error(`❌ Error in ${analysis.method}:`, error);

    // Fallback: If one method fails, try the other
    if (analysis.method === 'react_agent') {
      console.log(`\n🔄 Falling back to Native Grounding...`);
      try {
        const result = await executeGroundedSearch(query, conversationHistory);
        return {
          answer: result.answer,
          reference: result.reference || [],
          citations: result.citations || [],
          citationMetadata: {
            ...result.citationMetadata,
            method: 'native_grounding_fallback',
            originalMethod: 'react_agent',
          },
        };
      } catch (fallbackError) {
        throw new Error(
          `Both methods failed: ${error.message}, ${fallbackError.message}`
        );
      }
    } else {
      console.log(`\n🔄 Falling back to ReAct Agent...`);
      try {
        const messages = [
          {
            role: 'system',
            content: `You are a helpful AI assistant with access to search tools.`,
          },
          ...conversationHistory,
          {
            role: 'user',
            content: query,
          },
        ];

        const result = await executeToolBasedConversation(messages, options);
        return {
          answer: result.responseMessage.answer,
          reference: result.responseMessage.reference || [],
          citations: result.responseMessage.citations || [],
          citationMetadata: {
            ...result.responseMessage.citationMetadata,
            method: 'react_agent_fallback',
            originalMethod: 'native_grounding',
          },
        };
      } catch (fallbackError) {
        throw new Error(
          `Both methods failed: ${error.message}, ${fallbackError.message}`
        );
      }
    }
  }
}

/**
 * Force use of native grounding (bypass router)
 */
export async function executeWithNativeGrounding(
  query,
  conversationHistory = []
) {
  console.log(`\n⚡ Forced: Using Native Google Grounding`);
  const result = await executeGroundedSearch(query, conversationHistory);
  return {
    answer: result.answer,
    reference: result.reference || [],
    citations: result.citations || [],
    citationMetadata: {
      ...result.citationMetadata,
      method: 'native_grounding_forced',
    },
  };
}

/**
 * Force use of ReAct agent (bypass router)
 */
export async function executeWithReActAgent(
  query,
  conversationHistory = [],
  options = {}
) {
  console.log(`\n🔄 Forced: Using ReAct Agent`);

  const messages = [
    {
      role: 'system',
      content: `You are a helpful AI assistant with access to search tools.`,
    },
    ...conversationHistory,
    {
      role: 'user',
      content: query,
    },
  ];

  const result = await executeToolBasedConversation(messages, options);
  return {
    answer: result.responseMessage.answer,
    reference: result.responseMessage.reference || [],
    citations: result.responseMessage.citations || [],
    citationMetadata: {
      ...result.responseMessage.citationMetadata,
      method: 'react_agent_forced',
    },
  };
}

export default {
  executeSmartSearch,
  executeWithNativeGrounding,
  executeWithReActAgent,
  analyzeQueryComplexity,
};
