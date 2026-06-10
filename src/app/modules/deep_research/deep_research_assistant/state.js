/**
 * @file Defines the state structure for the Deep Research Agent.
 * @module deepResearchAgentState
 * @description This module exports a constant object representing the comprehensive state
 *   of a deep research agent. It tracks various aspects of the research process,
 *   from initial query to final report generation, including intermediate results,
 *   sources, progress, and metadata. Each property is wrapped in an object with a `value` key
 *   to allow for potential future enhancements like tracking dirty states or versioning.
 */

/**
 * @constant {object} deepResearchAgentState
 * @description The central state object for the Deep Research Agent.
 *   It holds all relevant data and progress indicators throughout the deep research process.
 * @property {object} originalQuery - The initial query provided by the user.
 * @property {string|null} originalQuery.value - The text of the original query.
 * @property {object} currentDepth - Tracks the current research depth level.
 * @property {number} currentDepth.value - The current depth (0 = initial, 1 = first level, etc.).
 * @property {object} maxDepth - Defines the maximum allowed research depth.
 * @property {number} maxDepth.value - The maximum depth the agent will research.
 * @property {object} breadthResults - Results from the initial breadth-first search phase.
 * @property {Array<object>|null} breadthResults.value - An array of initial search results or summaries.
 * @property {object} promisingLeads - Identified promising leads for deeper investigation.
 * @property {Array<object>|null} promisingLeads.value - An array of leads, each potentially containing a query or topic for deep dive.
 * @property {object} deepDiveResults - Detailed results obtained from deep diving into promising leads.
 * @property {Array<object>|null} deepDiveResults.value - An array of detailed research findings corresponding to each lead.
 * @property {object} finalReport - The comprehensive final report generated from all research.
 * @property {object|null} finalReport.value - The structured content of the final report.
 * @property {object} allSources - A collection of all sources gathered during the research.
 * @property {Array<object>|null} allSources.value - An array of source objects, each containing details like URL, title, and content snippets.
 * @property {object} researchProgress - Tracks the overall progress of the research.
 * @property {object|null} researchProgress.value - An object detailing current phase, percentage complete, or status messages.
 * @property {object} currentSubQueries - Sub-queries currently being processed by the agent.
 * @property {Array<string>|null} currentSubQueries.value - An array of active sub-queries.
 * @property {object} knowledgeGraph - A representation of discovered concepts and their relationships.
 * @property {object|null} knowledgeGraph.value - A graph data structure (e.g., nodes and edges) representing extracted knowledge.
 * @property {object} qualityMetrics - Metrics to evaluate the quality and reliability of the research.
 * @property {object|null} qualityMetrics.value - An object containing various quality scores or indicators.
 * @property {object} history - The conversation history with the user.
 * @property {Array<object>|null} history.value - An array of message objects representing the conversation flow.
 * @property {object} metadata - General metadata about the research session.
 * @property {object|null} metadata.value - An object containing session ID, timestamps, user info, etc.
 * @property {object} generatePdf - Flag to indicate whether a PDF report should be generated.
 * @property {boolean} generatePdf.value - True if PDF generation is requested, false otherwise.
 * @property {object} pdfData - Content and metadata specifically for PDF generation.
 * @property {object|null} pdfData.value - An object containing the PDF's content, layout preferences, and other relevant data.
 * @property {object} quantitativeFacts - Quantitative statistics and verified facts gathered during research.
 * @property {Array<object>|null} quantitativeFacts.value - An array of structured facts, potentially with sources and confidence levels.
 * @property {object} errors - Any errors encountered during the research process.
 * @property {Array<object>|null} errors.value - An array of error objects, each detailing an issue.
 * @property {object} conversationId - Unique identifier for the current conversation session.
 * @property {string|null} conversationId.value - The ID of the ongoing conversation.
 * @property {object} boardPersonas - Pre-flight setting for personas to consider during research.
 * @property {Array<string>|null} boardPersonas.value - An array of persona names or descriptions.
 * @property {object} consensusLevel - Pre-flight setting for the desired level of consensus in findings.
 * @property {string|null} consensusLevel.value - A string indicating the desired consensus level (e.g., 'high', 'medium', 'low').
 */
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