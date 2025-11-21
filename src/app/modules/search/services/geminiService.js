import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import config from "../../../../../config/index.js";
import { googleSearch, YouTubeSearchTool } from '../tools.js';

/**
 * Gemini LLM Service
 * Centralized configuration for all Gemini LLM instances
 */

// Base Gemini LLM instance - Using Gemini 3 with native Google Search support
export const llm = new ChatGoogleGenerativeAI({
  model: "gemini-3-pro-preview", // Gemini 3 with advanced capabilities
  apiKey: config.gemini_secret_key,
  temperature: 0,
  maxRetries: 2,
  // other params...
});

/**
 * Create tool-enabled LLM with search capabilities
 */
export const createToolEnabledLLM = () => {
  const searchTools = [
    new YouTubeSearchTool(),
    googleSearch
  ];

  return llm.bindTools(searchTools);
};

// Tool-enabled LLM instance
export const toolEnabledLLM = createToolEnabledLLM();
