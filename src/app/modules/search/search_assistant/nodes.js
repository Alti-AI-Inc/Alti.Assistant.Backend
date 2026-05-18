import { runIntelligentSearch } from '../llm.js';

/**
 * NEXT-GEN Node: Tool-based intelligent search using LLM with search tools
 * This represents the most advanced search approach where the LLM decides when and how to use tools
 */
export const toolBasedSearchNode = async (state) => {
  console.log('--- Node: toolBasedSearchNode (Next-Gen Tool-Enabled) ---');
  const { query, history } = state;

  try {
    const startTime = Date.now();

    // Use the new intelligent tool-based search
    const result = await runIntelligentSearch(state);

    const duration = Date.now() - startTime;
    console.log(`🚀 Tool-based search completed in ${duration}ms`);
    console.log('Tool-based search result:', result);
    // Handle structured response format
    if (typeof result === 'object' && result.answer) {
      return {
        ...state,
        answer: result.answer,
        reference: result.reference || [],
        searchCompleted: true,
        searchMethod: result.searchMethod || 'tool_based',
        searchDuration: duration,
        timestamp: result.timestamp || new Date().toISOString(),
      };
    } else {
      // Fallback for legacy string response
      return {
        ...state,
        answer: result,
        reference: [],
        searchCompleted: true,
        searchMethod: 'tool_based',
        searchDuration: duration,
        timestamp: new Date().toISOString(),
      };
    }
  } catch (error) {
    console.error('❌ Error in toolBasedSearchNode:', error);

    // Return error state instead of calling non-existent function
    return {
      ...state,
      answer:
        'I encountered an error while processing your search. Please try rephrasing your question.',
      reference: [],
      searchCompleted: false,
      searchMethod: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};
