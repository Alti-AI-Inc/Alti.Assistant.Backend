export const deepResearchAgentState = {
  // Original query from user
  originalQuery: { value: null },

  // Current research depth (0 = initial, 1 = first level, etc.)
  currentDepth: { value: 0 },

  // Maximum depth to research
  maxDepth: { value: 3 },

  // Step 1: Breadth-first search results
  breadthResults: { value: null },

  // Step 2: Promising leads identified for deep dive
  promisingLeads: { value: null },

  // Step 3: Deep dive results for each lead
  deepDiveResults: { value: null },

  // Step 4: Final comprehensive report
  finalReport: { value: null },

  // All sources collected during research
  allSources: { value: null },

  // Research progress tracking
  researchProgress: {
    value: null,
  },

  // Current sub-queries being processed
  currentSubQueries: { value: null },

  // Knowledge graph of discovered concepts
  knowledgeGraph: {
    value: null,
  },

  // Research quality metrics
  qualityMetrics: {
    value: null,
  },

  // Conversation history
  history: {
    value: null,
  },
  // Research metadata
  metadata: {
    value: null,
  },

  // PDF generation flag
  generatePdf: { value: false },

  // PDF content and metadata
  pdfData: { value: null },

  // Phase 3 & 4: Quantitative statistics and verified facts
  quantitativeFacts: {
    value: null,
  },

  // Error tracking
  errors: {
    value: null,
  },

  // Conversation ID
  conversationId: { value: null },

  // Pre-flight settings
  boardPersonas: { value: null },
  consensusLevel: { value: null },
};
