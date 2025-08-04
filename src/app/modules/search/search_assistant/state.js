import { fi } from "zod/v4/locales";

export const researchAgentState = {
  // The user's current query/message.
  query: { value: null },
  
  // Raw search results from the tool.
  searchResults: { value: null },

  // Depth of the search, e.g., 'standard', 'deep'.
  depth: { value: 'standard' },
  
  // Flag to indicate if search is needed for current query
  isSearchNeeded: { value: null },

  needsSearch: { value: null },
  // The final, synthesized answer for the user.
  answer: { value: null },

  // Additional metadata about the search
  metadata: { value: null },
  
  // References or sources for the answer
  reference: { value: null },

  // Conversation history - accumulates over time
  history: { 
    value: (x, y) => {
      // If x is null/undefined, start with empty array
      if (!x) return y || [];
      // If y is null/undefined, return x
      if (!y) return x;
      // If both exist, concatenate them
      return x.concat(y);
    }, 
    default: () => [] 
  },

  // The contextualized query (may be different from original query)
  contextualizedQuery: { value: null },

  // Type of response needed: 'search', 'direct', 'clarification'
  responseType: { value: null },

  // Previous search context to avoid redundant searches
  previousSearchContext: { value: null },

  final_answer: { value: null },
};
