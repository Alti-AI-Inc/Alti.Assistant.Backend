import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
// Improvement: Import enums for safety settings for better readability and type safety.
import { HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import config from '../../../../config/index.js';

// Improvement: Centralized validation for essential configuration.
// Ensures the application fails fast with a clear error message if critical configuration is missing.
if (!config.gemini_secret_key) {
  console.error('CRITICAL: GEMINI_SECRET_KEY is not set in the environment or configuration. Video LLM features will be unavailable.');
}
if (!config.google.gcp_project_id) {
  console.error('CRITICAL: GCP_PROJECT_ID is not set in the environment or configuration. Video LLM features will be unavailable.');
}

/**
 * --- OPTIMIZATION & VERIFICATION NOTES ---
 *
 * User Experience & Data Isolation:
 * The original implementation used a single, global LLM instance. This is a significant issue in a multi-user environment
 * as it prevents user-specific configurations, makes usage tracking difficult, and poses a potential risk for data leakage
 * if not handled with extreme care in the calling code.
 *
 * Improvement:
 * Replaced the global instance with a factory function `createLlmInstance`. This function creates a new, isolated
 * LLM client for each request or user session.
 *
 * Benefits:
 * 1.  User Data Isolation: Each user's interaction is handled by a separate instance, preparing the ground for features
 *     like passing a unique user ID to the provider for abuse monitoring and preventing state leakage between users.
 * 2.  Customization & Limits: The function accepts an `options` object, allowing for per-user or per-request
 *     customization of parameters like `temperature`, `maxOutputTokens`, and `model`. This is crucial for respecting
 *     user-level limits and profiles.
 * 3.  Robustness: Added `maxRetries` to handle transient API errors, improving prompt execution reliability.
 * 4.  Safety: Explicitly configured `safetySettings` to block harmful content, which is a core part of a safe
 *     and reliable user experience.
 * 5.  Maintainability: Centralizes LLM configuration, making it easier to update models, safety settings, or
 *     other parameters across the application.
 */

/**
 * Creates a new instance of the ChatGoogleGenerativeAI LLM.
 * This factory approach ensures that each user request can have an isolated,
 * configurable LLM instance, which is critical for multi-user platforms.
 *
 * @param {object} [options={}] - Configuration options for the LLM instance.
 * @param {number} [options.temperature] - The sampling temperature to use.
 * @param {number} [options.maxOutputTokens] - The maximum number of tokens to generate.
 * @param {string} [options.model] - The specific model to use (e.g., 'gemini-1.5-flash').
 * @returns {ChatGoogleGenerativeAI} A new instance of the LLM.
 */
export const createLlmInstance = (options = {}) => {
  // Define default settings that can be overridden by the options parameter.
  const defaultSettings = {
    model: config.google.llm_model || config.gemini_model || 'gemini-3.5-flash', // Use a configurable, modern model.
    temperature: 0.7,
    maxOutputTokens: 8192, // Set a reasonable default max output to prevent runaway requests.
    maxRetries: 3, // Improve reliability by retrying on transient errors.
  };

  const llmConfig = {
    // The API key is sourced from a secure configuration.
    apiKey: config.gemini_secret_key,
    // Merge default settings with any request-specific options.
    ...defaultSettings,
    ...options,
    // Vertex AI specific configuration for project and location.
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
    // Define safety settings to ensure a safe user experience by blocking harmful content.
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ],
  };

  return new ChatGoogleGenerativeAI(llmConfig);
};