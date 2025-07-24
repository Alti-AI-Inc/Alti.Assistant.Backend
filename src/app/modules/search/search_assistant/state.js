export const researchAgentState = {
  // The user's research query.
  query: { value: null },
  
  // Raw search results from the tool.
  searchResults: { value: null },

  // Depth of the search, e.g., 'standard', 'deep'.
  depth: { value: 'standard' },
  
  // The final, synthesized answer for the user.
  answer: { value: null },
  
  // Conversation history.
  history: { value: (x, y) => x.concat(y), default: () => [] },
};
