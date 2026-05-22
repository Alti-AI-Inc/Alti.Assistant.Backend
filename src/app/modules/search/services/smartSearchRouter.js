import { executeGroundedSearch } from './geminiGroundingService.js';
import { executeToolBasedConversation } from './reactAgent.js';
import { classifyFinancialQuery } from './queryClassifier.js';
import { massiveSmartRouter } from '../../../helpers/massiveSmartRouter.js';

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

    // Prediction/analysis requests
    prediction: [
      'predict',
      'forecast',
      'who will win',
      'chances',
      'likely',
      'probability',
      'odds',
      'bet',
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
export async function executeSmartSearch(
  query,
  conversationHistory = [],
  options = {}
) {
  // ── PRIORITY 1: Financial queries get Massive.com real-time data first ──
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
