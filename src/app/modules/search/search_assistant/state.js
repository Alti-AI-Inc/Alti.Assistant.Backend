export const researchAgentState = {
  // The user's research query.
  query: { value: null },
  
  // Raw search results from the tool.
  searchResults: { value: null },

  // Depth of the search, e.g., 'standard', 'deep'.
  depth: { value: 'standard' },
  
  isSearchNeeded: { value: null }, // Flag to indicate if search is needed

  // The final, synthesized answer for the user.
  answer: { value: null },

  metadata: { value: null }, // Additional metadata about the search
  
  reference: { value: null }, // References or sources for the answer

  // Conversation history.
  history: { value: (x, y) => x.concat(y), default: () => [] },
};
