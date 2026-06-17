/**
 * @module llm
 * @description This module provides a shared instance of the Google Gemini Large Language Model (LLM) client.
 * It ensures that the Gemini client is instantiated only once to optimize resource usage
 * and maintain a consistent configuration across the application.
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../config/index.js';

/**
 * @constant {ChatGoogleGenerativeAI} sharedGeminiClient
 * @description An instantiated client for interacting with the Google Gemini LLM.
 * This instance is created once to avoid redundant object creation and ensure
 * consistent configuration. It uses the 'gemini-3.5-flash' model with a
 * temperature of 0.7, configured with an API key from the application's
 * configuration.
 * @property {string} apiKey - The API key for Google Gemini, retrieved from `config.gemini_secret_key`.
 * @property {string} model - The specific Gemini model to use, set to 'gemini-3.5-flash'.
 * @property {number} temperature - The sampling temperature for text generation, set to 0.7.
 */
const sharedGeminiClient = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: 'gemini-3.5-flash',
  temperature: 0.7,
});

/**
 * @constant {ChatGoogleGenerativeAI} llm
 * @description A general-purpose Large Language Model (LLM) client instance.
 * This exports the `sharedGeminiClient` instance, providing a consistent
 * interface for LLM operations throughout the application. It is identical
 * to the `geminiClient` export.
 */
export const llm = sharedGeminiClient;

/**
 * @constant {ChatGoogleGenerativeAI} geminiClient
 * @description A specific client instance for the Google Gemini LLM.
 * This also exports the `sharedGeminiClient` instance, offering an
 * explicit name for modules that specifically require the Gemini client.
 * It is identical to the `llm` export.
 */
export const geminiClient = sharedGeminiClient;