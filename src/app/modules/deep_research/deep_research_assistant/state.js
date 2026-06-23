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
 * @property {object|null} metadata.value - An object containing session ID, timestamps, and critical user/tenant info.
 * @property {string|null} metadata.value.userId - The ID of the user who initiated the research.
 * @property {string|null} metadata.value.workspaceId - The ID of the workspace this research belongs to. CRITICAL for tenancy.
 * @property {string|null} metadata.value.researchJobId - A unique identifier for this specific research job.
 * @property {string|null} metadata.value.createdAt - ISO timestamp of when the session was created.
 * @property {object} sessionLimits - Defines the resource limits for this specific research session, based on user/workspace plan.
 * @property {object} sessionLimits.value - An object containing the applicable limits.
 * @property {number|null} sessionLimits.value.maxTokens - The maximum total LLM tokens allowed for this session.
 * @property {number|null} sessionLimits.value.maxSearches - The maximum number of web searches allowed for this session.
 * @property {number|null} sessionLimits.value.maxCost - The maximum cost allowed for this session in the smallest currency unit (e.g., cents).
 * @property {object} usageTracking - Tracks resource consumption for the research session for reporting and limit enforcement.
 * @property {object} usageTracking.value - An object containing various consumption metrics.
 * @property {object} usageTracking.value.llmTokens - Tracks Language Model token usage.
 * @property {number} usageTracking.value.llmTokens.prompt - Total prompt tokens consumed.
 * @property {number} usageTracking.value.llmTokens.completion - Total completion tokens consumed.
 * @property {number} usageTracking.value.llmTokens.total - Total tokens consumed.
 * @property {number} usageTracking.value.searchesPerformed - Number of web searches executed.
 * @property {number} usageTracking.value.sourcesAnalyzed - Number of sources fetched and analyzed.
 * @property {number} usageTracking.value.costIncurred - Estimated cost of the research in a predefined unit (e.g., USD cents).
 * @property {object} pdfGeneration - Manages the state of the asynchronous PDF report generation task.
 * @property {object} pdfGeneration.value - The state object for the PDF generation job.
 * @property {boolean} pdfGeneration.value.requested - A flag to initiate the PDF generation task.
 * @property {string|null} pdfGeneration.value.taskId - The ID of the Cloud Task or Pub/Sub message for the generation job.
 * @property {string} pdfGeneration.value.status - The current status of the job (e.g., 'idle', 'queued', 'processing', 'completed', 'failed').
 * @property {string|null} pdfGeneration.value.fileUrl - The public or signed URL to the generated PDF in Cloud Storage.
 * @property {string|null} pdfGeneration.value.error - Error message if the generation task failed.
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

  // Research metadata, including critical tenancy and user information.
  // This is essential for security, data isolation, and proper role-based access control.
  metadata: {
    value: {
      userId: null,
      workspaceId: null,
      researchJobId: null, // Unique ID for this specific research task
      createdAt: null,
    },
  },

  // Session-specific limits, populated from user/workspace plan at initiation.
  // Enforcing these limits is crucial for controlling costs and adhering to subscription tiers.
  sessionLimits: {
    value: {
      maxTokens: null,
      maxSearches: null,
      maxCost: null, // In smallest currency unit (e.g., cents)
    },
  },

  // Usage tracking for resource consumption, limits, and billing propagation.
  // This data must be propagated up to manager/admin dashboards and billing systems.
  usageTracking: {
    value: {
      llmTokens: {
        prompt: 0,
        completion: 0,
        total: 0,
      },
      searchesPerformed: 0,
      sourcesAnalyzed: 0,
      costIncurred: 0, // In smallest currency unit (e.g., cents)
    },
  },

  // PDF generation state for offloading to a background worker (e.g., via Cloud Tasks).
  // This replaces a simple boolean flag to better support asynchronous, stateless processing.
  pdfGeneration: {
    value: {
      // Set to true to trigger a PDF generation task. The backend should reset this after queuing the task.
      requested: false,
      // The ID of the Cloud Task or Pub/Sub message for generating the PDF.
      taskId: null,
      // The current status of the PDF generation job ('idle', 'queued', 'processing', 'completed', 'failed').
      status: 'idle',
      // The URL of the generated PDF in Cloud Storage once the task is complete.
      fileUrl: null,
      // Details of any error that occurred during generation.
      error: null,
    },
  },

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
  researchTier: { value: null },
};