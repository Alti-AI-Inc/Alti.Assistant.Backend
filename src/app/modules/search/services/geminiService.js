import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import config from "../../../../../config/index.js";
import { googleSearch, YouTubeSearchTool } from '../tools.js';

/**
 * Gemini LLM Service
 * Centralized configuration for all Gemini LLM instances
 */

// Base Gemini LLM instance
export const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash-preview-05-20",
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
