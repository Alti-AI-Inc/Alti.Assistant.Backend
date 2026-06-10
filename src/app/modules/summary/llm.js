import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../config/index.js';

// Instantiate the Gemini client once to avoid redundant object creation.
const sharedGeminiClient = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: 'gemini-2.5-flash',
  temperature: 0.7,
});

// Export the same instance under both names if both are required by consuming modules.
// This addresses the redundancy where 'llm' and 'geminiClient' were identical instances.
export const llm = sharedGeminiClient;
export const geminiClient = sharedGeminiClient;