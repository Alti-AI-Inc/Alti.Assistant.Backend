/**
 * @file llm.js
 * @module llm
 * @description Main entry point for search functionality related to LLMs.
 * This file serves as a central index, re-exporting various functions, constants, and utilities
 * from their respective modular locations to maintain backward compatibility and provide a unified interface.
 */

// ==================== CONFIGURATION ====================
/**
 * @constant {object} HISTORY_CONFIG
 * @description Configuration object for managing conversation history, including parameters for length and summarization.
 * @see {@link module:config/historyConfig.HISTORY_CONFIG} for detailed properties and default values.
 */
export { HISTORY_CONFIG } from './config/historyConfig.js';

// ==================== LLM SERVICES ====================
/**
 * @description Re-exports of core LLM interaction services and model selection utilities from {@link module:services/geminiService}.
 */
export {
  /**
   * @function llm
   * @description The primary LLM instance for general conversational tasks, typically a robust model like Gemini Pro.
   * @see {@link module:services/geminiService.llm}
   */
  llm,
  /**
   * @function toolEnabledLLM
   * @description An LLM instance configured to use external tools for enhanced capabilities, enabling complex multi-step reasoning.
   * @see {@link module:services/geminiService.toolEnabledLLM}
   */
  toolEnabledLLM,
  /**
   * @function createToolEnabledLLM
   * @description Factory function to create a new LLM instance with specified tools enabled.
   * @see {@link module:services/geminiService.createToolEnabledLLM}
   */
  createToolEnabledLLM,
  /**
   * @function createToolEnabledLLMExplicit
   * @description Factory function to create a new LLM instance with explicitly defined tools and tool configurations.
   * @see {@link module:services/geminiService.createToolEnabledLLMExplicit}
   */
  createToolEnabledLLMExplicit,
  /**
   * @function selectModel
   * @description Selects an LLM model based on a given model name string.
   * @see {@link module:services/geminiService.selectModel}
   */
  selectModel,
  /**
   * @function selectModelSmart
   * @description Intelligently selects an LLM model based on complexity and specific use cases.
   * @see {@link module:services/geminiService.selectModelSmart}
   */
  selectModelSmart,
  /**
   * @constant {object} gemini2_5Flash
   * @description A pre-configured instance of the Gemini 2.5 Flash model, optimized for speed.
   * @see {@link module:services/geminiService.gemini2_5Flash}
   */
  gemini2_5Flash,
  /**
   * @constant {object} gemini3ProPreview
   * @description A pre-configured instance of the Gemini 3 Pro Preview model, offering advanced capabilities.
   * @see {@link module:services/geminiService.gemini3ProPreview}
   */
  gemini3ProPreview,
  /**
   * @enum {string} ModelComplexity
   * @description Enum representing different levels of model complexity for selection.
   * @property {string} FAST - For quick, less complex tasks.
   * @property {string} SMART - For balanced performance and intelligence.
   * @property {string} EXPERT - For highly complex tasks requiring advanced reasoning.
   * @see {@link module:services/geminiService.ModelComplexity}
   */
  ModelComplexity,
} from './services/geminiService.js';

// ==================== MODEL SELECTION UTILITIES ====================
/**
 * @description Re-exports of utilities for analyzing queries and selecting the optimal LLM model from {@link module:utils/modelSelector}.
 */
export {
  /**
   * @function analyzeQueryForModel
   * @description Analyzes a user query to determine its characteristics for model selection.
   * @see {@link module:utils/modelSelector.analyzeQueryForModel}
   */
  analyzeQueryForModel,
  /**
   * @function selectOptimalModel
   * @description Selects the most optimal LLM model based on query analysis and available models.
   * @see {@link module:utils/modelSelector.selectOptimalModel}
   */
  selectOptimalModel,
  /**
   * @function analyzeAndLogModelSelection
   * @description Analyzes a query, selects a model, and logs the selection process for debugging and monitoring.
   * @see {@link module:utils/modelSelector.analyzeAndLogModelSelection}
   */
  analyzeAndLogModelSelection,
  /**
   * @enum {string} QueryCategory
   * @description Enum representing different categories a user query might fall into.
   * @property {string} GENERAL - General informational queries.
   * @property {string} CODE - Queries related to code generation or explanation.
   * @property {string} VIDEO - Queries specifically asking for video content.
   * @property {string} WRITING - Queries requesting creative writing or text generation.
   * @see {@link module:utils/modelSelector.QueryCategory}
   */
  QueryCategory,
} from './utils/modelSelector.js';

// ==================== QUERY UTILITIES ====================
/**
 * @description Re-exports of general utilities for processing and classifying user queries from {@link module:utils/queryUtils}.
 */
export {
  /**
   * @function classifyQueryFast
   * @description Quickly classifies a user query into predefined categories.
   * @see {@link module:utils/queryUtils.classifyQueryFast}
   */
  classifyQueryFast,
  /**
   * @function updateQueryWithCurrentYear
   * @description Modifies a query to include the current year, useful for time-sensitive searches.
   * @see {@link module:utils/queryUtils.updateQueryWithCurrentYear}
   */
  updateQueryWithCurrentYear,
} from './utils/queryUtils.js';

// ==================== HISTORY MANAGEMENT ====================
/**
 * @description Re-exports of functions for managing and summarizing conversation history from {@link module:utils/historyManager}.
 */
export {
  /**
   * @function estimateTokenCount
   * @description Estimates the token count of a given text string.
   * @see {@link module:utils/historyManager.estimateTokenCount}
   */
  estimateTokenCount,
  /**
   * @function needsHistoryManagement
   * @description Determines if the current conversation history requires summarization or truncation.
   * @see {@link module:utils/historyManager.needsHistoryManagement}
   */
  needsHistoryManagement,
  /**
   * @function createIntelligentSummary
   * @description Generates an intelligent summary of a conversation history using an LLM.
   * @see {@link module:utils/historyManager.createIntelligentSummary}
   */
  createIntelligentSummary,
  /**
   * @function manageConversationHistoryIntelligent
   * @description Manages conversation history by summarizing or truncating it to stay within token limits.
   * @see {@link module:utils/historyManager.manageConversationHistoryIntelligent}
   */
  manageConversationHistoryIntelligent,
  /**
   * @function prepareConversationContext
   * @description Prepares the conversation context for an LLM call, including system instructions and history.
   * @see {@link module:utils/historyManager.prepareConversationContext}
   */
  prepareConversationContext,
} from './utils/historyManager.js';

// ==================== VIDEO UTILITIES ====================
/**
 * @description Re-exports of utilities specifically for handling video-related queries and YouTube searches from {@link module:utils/videoUtils}.
 */
export {
  /**
   * @function isVideoOnlyQuery
   * @description Checks if a user query is solely focused on video content.
   * @see {@link module:utils/videoUtils.isVideoOnlyQuery}
   */
  isVideoOnlyQuery,
  /**
   * @function extractVideoCount
   * @description Extracts a requested video count from a user query.
   * @see {@link module:utils/videoUtils.extractVideoCount}
   */
  extractVideoCount,
  /**
   * @function analyzeVideoQuery
   * @description Analyzes a query to determine if it's a video search and extracts relevant parameters.
   * @see {@link module:utils/videoUtils.analyzeVideoQuery}
   */
  analyzeVideoQuery,
  /**
   * @function shouldSearchYouTube
   * @description Determines if a YouTube search should be performed based on the query.
   * @see {@link module:utils/videoUtils.shouldSearchYouTube}
   */
  shouldSearchYouTube,
  /**
   * @function createOptimizedYouTubeQuery
   * @description Creates an optimized search query for YouTube based on user input.
   * @see {@link module:utils/videoUtils.createOptimizedYouTubeQuery}
   */
  createOptimizedYouTubeQuery,
  /**
   * @function searchYouTube
   * @description Executes a search on YouTube with a given query and returns results.
   * @see {@link module:utils/videoUtils.searchYouTube}
   */
  searchYouTube,
} from './utils/videoUtils.js';

// ==================== SEARCH FUNCTIONS ====================
/**
 * @description Re-exports of main functions for executing intelligent search and code generation.
 */
export {
  /**
   * @function runIntelligentSearch
   * @description Initiates an intelligent search process using LLMs and various tools to answer complex queries.
   * @see {@link module:intelligentSearch.runIntelligentSearch}
   */
  runIntelligentSearch
} from './intelligentSearch.js';
export {
  /**
   * @function runCodeGeneration
   * @description Executes a code generation task using LLMs based on a given prompt and context.
   * @see {@link module:codeGeneration.runCodeGeneration}
   */
  runCodeGeneration
} from './codeGeneration.js';

// ==================== INTERNAL SERVICES (NOT RE-EXPORTED) ====================
// These are used internally by the above functions:
// - services/reactAgent.js (executeToolBasedConversation)
// - services/queryClassifier.js (classifyQuery, classifyWritingRequest)
// - services/claudeService.js (ClaudeService)