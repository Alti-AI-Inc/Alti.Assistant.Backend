import { fi } from "zod/v4/locales";

export const researchAgentState = {
  // The user's current query/message.
  query: { value: null },

  // Raw search results from the tool.
  searchResults: { value: null },

  // YouTube search results
  youtubeResults: { value: null },

  // Flag to indicate if YouTube search is relevant for the query
  needsYouTubeSearch: { value: null },

  // Flag to indicate if YouTube relevance has been checked
  youtubeRelevanceChecked: { value: null },

  // Flag to indicate if YouTube search was performed
  youtubeSearchPerformed: { value: null },

  // Combined search results (web + YouTube)
  combinedResults: { value: null },

  // Flag to indicate if this is a video-only query (should skip web search)
  isVideoOnlyQuery: { value: null },

  // Number of videos requested by the user (extracted from query)
  requestedVideoCount: { value: null },

  // Depth of the search, e.g., 'standard', 'deep'.
  depth: { value: 'standard' },

  // Flag to indicate if search is needed for current query
  isSearchNeeded: { value: null },

  needsSearch: { value: null },

  // The final, synthesized answer for the user.
  answer: { value: null },

  // Store the direct answer before analysis
  directAnswer: { value: null },

  // Quality assessment of the direct answer: 'ADEQUATE' or 'INADEQUATE'
  answerQuality: { value: null },

  // Flag to indicate if search is needed as fallback after direct answer analysis
  needsSearchFallback: { value: null },

  // Flag to indicate analysis is complete
  analysisComplete: { value: null },

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

  // Summary of older conversation context (when history gets too long)
  conversationSummary: { value: null },

  // Flag to indicate if context was managed/trimmed in this interaction
  contextManaged: { value: null },

  // The contextualized query (may be different from original query)
  contextualizedQuery: { value: null },

  // Type of response needed: 'search', 'direct', 'clarification'
  responseType: { value: null },

  // Previous search context to avoid redundant searches
  previousSearchContext: { value: null },

  final_answer: { value: null },
};
