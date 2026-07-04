import { runIntelligentSearch } from '../llm.js';
import { massiveSmartRouter } from '../../../helpers/massiveSmartRouter.js';
import { detectFinancialIntent } from '../../../helpers/massiveTickerDB.js';

/**
 * @typedef {object} SearchState
 * @property {string} query - The current user query.
 * @property {Array<object>} history - An array of previous conversation turns.
 * @property {string} [currentQuery] - The query currently being processed, potentially enhanced.
 * @property {string} [originalQuery] - The original query before any enhancement.
 * @property {boolean} [massiveEnhanced] - True if the query was enhanced with Massive.com data.
 * @property {string} [massiveIntentType] - The type of financial intent detected (e.g., 'stock_price', 'company_info').
 * @property {string} [massiveSymbol] - The stock symbol detected (e.g., 'AAPL').
 * @property {string} [answer] - The generated answer from the LLM or an error message.
 * @property {Array<object>} [reference] - An array of reference objects or sources used.
 * @property {boolean} [searchCompleted] - Indicates if the search process completed successfully.
 * @property {string} [searchMethod] - The method used for search (e.g., 'massive_reinsoaime', 'tool_based', 'error').
 * @property {number} [searchDuration] - The duration of the search operation in milliseconds.
 * @property {string} [timestamp] - ISO string of when the search operation completed.
 * @property {string} [error] - An error message if an error occurred during processing.
 */

/**
 * A LangGraph node that performs intelligent, tool-based search using an LLM.
 * This node prioritizes and injects real-time financial data from Massive.com
 * into the query *before* the LLM runs if a financial intent is detected.
 *
 * It orchestrates the following steps:
 * 1. Detects financial intent in the user's query using `detectFinancialIntent`.
 * 2. If financial intent is found, it uses `massiveSmartRouter.combinedRouteAndEnhancePrompt`
 *    to fetch and inject relevant real-time financial data, creating an `enhancedState`.
 * 3. Executes an intelligent search using `runIntelligentSearch` with the potentially enhanced state.
 * 4. Processes the result, ensuring a consistent output structure, and updates the state
 *    with the answer, references, search metadata, and any detected financial intent details.
 * 5. Handles errors gracefully, returning an error message and marking the search as incomplete.
 *
 * @param {SearchState} state - The current state object containing the user's query and conversation history.
 * @param {string} state.query - The user's current query string.
 * @param {Array<object>} state.history - An array of previous conversation turns.
 * @returns {Promise<SearchState>} A promise that resolves to the updated state object,
 *   including the answer, references, search completion status, method, duration,
 *   timestamp, and any financial intent details or error information.
 */
export const toolBasedSearchNode = async (state) => {
  console.log('--- Node: toolBasedSearchNode (Next-Gen Tool-Enabled) ---');
  const { query, history } = state;

  try {
    const startTime = Date.now();

    // ── PRIORITY: Inject Massive.com real-time financial data before LLM ──
    let enhancedState = { ...state };
    const financialIntent = detectFinancialIntent(query || '');

    if (financialIntent) {
      console.log(`💹 [LangGraph Node] Financial intent: ${financialIntent.type} (${financialIntent.symbol || 'N/A'}) — fetching Massive data...`);
      try {
        const enhancedQuery = await massiveSmartRouter.combinedRouteAndEnhancePrompt(query);
        if (enhancedQuery !== query) {
          console.log(`💹 [LangGraph Node] Massive data injected (${enhancedQuery.length - query.length} chars added)`);
          // Inject the enhanced query so intelligentSearch picks it up
          enhancedState = {
            ...state,
            query: enhancedQuery,
            currentQuery: enhancedQuery,
            originalQuery: query,
            massiveEnhanced: true,
            massiveIntentType: financialIntent.type,
            massiveSymbol: financialIntent.symbol,
          };
        }
      } catch (massiveErr) {
        console.warn(`⚠️ [LangGraph Node] Massive enhancement failed, continuing with original query: ${massiveErr.message}`);
      }
    }

    // Use the new intelligent tool-based search with potentially enhanced state
    const result = await runIntelligentSearch(enhancedState);

    const duration = Date.now() - startTime;
    console.log(`🚀 Tool-based search completed in ${duration}ms`);

    // Handle structured response format
    if (typeof result === 'object' && result.answer) {
      return {
        ...state,
        answer: result.answer,
        reference: result.reference || [],
        searchCompleted: true,
        searchMethod: result.searchMethod || (financialIntent ? 'massive_reinsoaime' : 'tool_based'),
        searchDuration: duration,
        timestamp: result.timestamp || new Date().toISOString(),
        massiveIntentType: financialIntent?.type || null,
        massiveSymbol: financialIntent?.symbol || null,
      };
    } else {
      // Bug fix: Ensure massiveIntentType and massiveSymbol are consistently included
      // even if runIntelligentSearch returns an unstructured result.
      return {
        ...state,
        answer: result,
        reference: [],
        searchCompleted: true,
        searchMethod: financialIntent ? 'massive_reinsoaime' : 'tool_based',
        searchDuration: duration,
        timestamp: new Date().toISOString(),
        massiveIntentType: financialIntent?.type || null,
        massiveSymbol: financialIntent?.symbol || null,
      };
    }
  } catch (error) {
    console.error('❌ Error in toolBasedSearchNode:', error);
    return {
      ...state,
      answer: 'I encountered an error while processing your search. Please try rephrasing your question.',
      reference: [],
      searchCompleted: false,
      searchMethod: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};