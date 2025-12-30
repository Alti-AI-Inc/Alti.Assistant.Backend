import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import config from "../../../../../config/index.js";
import { googleSearch, YouTubeSearchTool } from '../tools.js';
import { analyzeAndLogModelSelection, selectOptimalModel } from '../utils/modelSelector.js';

/**
 * Gemini LLM Service
 * Centralized configuration for all Gemini LLM instances with dual model support
 * Now includes SMART MODEL SELECTION based on query analysis
 */

// Model selection criteria
export const ModelComplexity = {
  SIMPLE: 'simple',      // Fast, lightweight tasks
  COMPLEX: 'complex'     // Advanced reasoning, complex tasks
};

// Gemini 2.5 Flash - Fast and efficient for simple tasks
export const gemini2_5Flash = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash", // Gemini 2.5 Flash for speed and efficiency
  apiKey: config.gemini_secret_key,
  temperature: 0,
  maxRetries: 2,
});

// Gemini 3 Pro Preview - Advanced capabilities for complex tasks
export const gemini3ProPreview = new ChatGoogleGenerativeAI({
  model: "gemini-3-flash-preview", // Gemini 3 with advanced capabilities
  apiKey: config.gemini_secret_key,
  temperature: 0,
  maxRetries: 2,
  thinkingConfig: {
    thinkingLevel: 'LOW'
  }
});

/**
 * SMART MODEL SELECTION - Automatically determines the best model
 * Analyzes query characteristics and context to choose optimal model
 * @param {string} query - The user query
 * @param {Object} context - Additional context for analysis
 * @returns {ChatGoogleGenerativeAI} The optimal LLM instance
 */
export const selectModelSmart = (query, context = {}) => {
  const analysis = analyzeAndLogModelSelection(query, context);
  console.log(`✅ Selected: ${analysis.modelName} (Smart Selection)`);
  return analysis.usePro ? gemini3ProPreview : gemini2_5Flash;
};

/**
 * Determine which model to use based on task characteristics
 * @param {Object} options - Task characteristics
 * @param {string} options.complexity - 'simple' or 'complex'
 * @param {number} options.inputLength - Approximate input length
 * @param {boolean} options.requiresReasoning - Whether task needs advanced reasoning
 * @param {boolean} options.speedPriority - Whether speed is critical
 * @param {string} options.query - The actual query for smart analysis (optional)
 * @param {Object} options.context - Additional context for smart analysis (optional)
 * @returns {ChatGoogleGenerativeAI} The appropriate LLM instance
 */
export const selectModel = (options = {}) => {
  const {
    complexity = ModelComplexity.SIMPLE,
    inputLength = 0,
    requiresReasoning = false,
    speedPriority = false,
    query = null,
    context = {}
  } = options;

  // If query is provided, use SMART selection
  if (query) {
    console.log('🧠 Using SMART model selection based on query analysis');
    return selectModelSmart(query, {
      ...context,
      requiresReasoning,
      inputLength
    });
  }

  // Fallback to manual criteria-based selection
  console.log('⚙️ Using manual model selection criteria');

  // Use Gemini 3 Pro Preview for:
  // - Complex tasks requiring advanced reasoning
  // - Large context windows (> 10k tokens)
  // - Tasks explicitly marked as complex
  if (
    complexity === ModelComplexity.COMPLEX ||
    requiresReasoning ||
    inputLength > 10000
  ) {
    console.log('✅ Selected: Gemini 3 Pro Preview (Manual: Complex/Large/Reasoning)');
    return gemini3ProPreview;
  }

  // Use Gemini 2.5 Flash for:
  // - Simple tasks
  // - Speed-critical operations
  // - Smaller inputs
  if (speedPriority || complexity === ModelComplexity.SIMPLE) {
    console.log('✅ Selected: Gemini 2.5 Flash (Manual: Simple/Speed)');
    return gemini2_5Flash;
  }

  // Default to Flash for efficiency
  console.log('✅ Selected: Gemini 2.5 Flash (Manual: Default)');
  return gemini2_5Flash;
};

/**
 * Create tool-enabled LLM with search capabilities
 * NOW WITH SMART MODEL SELECTION
 * @param {string} query - The user query for smart model selection
 * @param {Object} options - Model selection options and context
 * @returns {ChatGoogleGenerativeAI} Tool-enabled LLM instance
 */
export const createToolEnabledLLM = (query = null, options = {}) => {
  const searchTools = [
    new YouTubeSearchTool(),
    googleSearch
  ];

  // Use smart selection if query is provided
  const selectedModel = query
    ? selectModelSmart(query, options)
    : selectModel(options);

  return selectedModel.bindTools(searchTools);
};

/**
 * Create tool-enabled LLM with explicit model choice
 * @param {string} modelType - 'flash' or 'pro'
 * @returns {ChatGoogleGenerativeAI} Tool-enabled LLM instance
 */
export const createToolEnabledLLMExplicit = (modelType = 'flash') => {
  const searchTools = [
    new YouTubeSearchTool(),
    googleSearch
  ];

  const model = modelType === 'pro' ? gemini3ProPreview : gemini2_5Flash;
  console.log(`✅ Explicit model selection: ${modelType === 'pro' ? 'Gemini 3 Pro Preview' : 'Gemini 2.5 Flash'}`);

  return model.bindTools(searchTools);
};

// Default LLM instances for backward compatibility
export const llm = gemini2_5Flash; // Default to Flash for efficiency
export const toolEnabledLLM = createToolEnabledLLM();
