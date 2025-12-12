// llm.js - Main entry point for search functionality
// This file maintains backward compatibility by re-exporting all functions from their new modular locations

// ==================== CONFIGURATION ====================
export { HISTORY_CONFIG } from './config/historyConfig.js';

// ==================== LLM SERVICES ====================
export {
  llm,
  toolEnabledLLM,
  createToolEnabledLLM,
  createToolEnabledLLMExplicit,
  selectModel,
  selectModelSmart,
  gemini2_5Flash,
  gemini3ProPreview,
  ModelComplexity
} from './services/geminiService.js';

// ==================== MODEL SELECTION UTILITIES ====================
export {
  analyzeQueryForModel,
  selectOptimalModel,
  analyzeAndLogModelSelection,
  QueryCategory
} from './utils/modelSelector.js';

// ==================== QUERY UTILITIES ====================
export {
  classifyQueryFast,
  updateQueryWithCurrentYear
} from './utils/queryUtils.js';

// ==================== HISTORY MANAGEMENT ====================
export {
  estimateTokenCount,
  needsHistoryManagement,
  createIntelligentSummary,
  manageConversationHistoryIntelligent,
  prepareConversationContext
} from './utils/historyManager.js';

// ==================== VIDEO UTILITIES ====================
export {
  isVideoOnlyQuery,
  extractVideoCount,
  analyzeVideoQuery,
  shouldSearchYouTube,
  createOptimizedYouTubeQuery,
  searchYouTube
} from './utils/videoUtils.js';

// ==================== SEARCH FUNCTIONS ====================
export { runIntelligentSearch } from './intelligentSearch.js';
export { runCodeGeneration } from './codeGeneration.js';

// ==================== INTERNAL SERVICES (NOT RE-EXPORTED) ====================
// These are used internally by the above functions:
// - services/reactAgent.js (executeToolBasedConversation)
// - services/queryClassifier.js (classifyQuery, classifyWritingRequest)
// - services/claudeService.js (ClaudeService)
