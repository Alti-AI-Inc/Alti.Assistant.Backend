import { runIntelligentSearch } from '../llm.js';
import { massiveSmartRouter } from '../../../helpers/massiveSmartRouter.js';
import { detectFinancialIntent } from '../../../helpers/massiveTickerDB.js';

/**
 * NEXT-GEN Node: Tool-based intelligent search using LLM with search tools
 * Financial queries get Massive.com real-time data injected BEFORE the LLM runs.
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
        const enhancedQuery = await massiveSmartRouter.routeAndEnhancePrompt(query);
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
        searchMethod: result.searchMethod || (financialIntent ? 'massive_realtime' : 'tool_based'),
        searchDuration: duration,
        timestamp: result.timestamp || new Date().toISOString(),
        massiveIntentType: financialIntent?.type || null,
        massiveSymbol: financialIntent?.symbol || null,
      };
    } else {
      return {
        ...state,
        answer: result,
        reference: [],
        searchCompleted: true,
        searchMethod: financialIntent ? 'massive_realtime' : 'tool_based',
        searchDuration: duration,
        timestamp: new Date().toISOString(),
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
