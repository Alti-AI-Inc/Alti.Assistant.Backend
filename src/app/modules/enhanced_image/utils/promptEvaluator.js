/**
 * @file Utility functions for evaluating and enhancing image generation prompts using Google Generative AI.
 * @module promptEvaluator
 * @description This module provides functions to analyze the quality of a user's prompt and to consolidate a conversation history into a single, enhanced prompt for image generation. It includes robust error handling and sensible fallbacks to ensure a smooth end-user experience.
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
import config from '../../../../../config/index.js';

// Centralized API key retrieval for consistency and to avoid misconfiguration.
const GEMINI_API_KEY = config.gemini_secret_key || process.env.GEMINI_API_KEY;

/**
 * @typedef {object} PromptQualityAssessment
 * @property {boolean} isComplete - Whether the prompt has enough detail to generate a good image.
 * @property {string[]} missingElements - List of missing or unclear elements that should be clarified.
 * @property {string[]} suggestions - Specific questions to ask the user to improve the prompt.
 * @property {number} score - Prompt quality score (0-100).
 */

/**
 * Zod schema defining the structure for prompt quality assessment.
 * This schema is used to validate and parse the output from the LLM, ensuring type safety.
 * @type {z.ZodObject<any, any, any, PromptQualityAssessment, any>}
 */
const promptQualitySchema = z.object({
  isComplete: z
    .boolean()
    .describe('Whether the prompt has enough detail to generate a good image'),
  missingElements: z
    .array(z.string())
    .describe('List of missing or unclear elements that should be clarified'),
  suggestions: z
    .array(z.string())
    .describe('Specific questions to ask the user to improve the prompt'),
  score: z.number().min(0).max(100).describe('Prompt quality score (0-100)'),
});

/**
 * Structured output parser for the prompt quality assessment.
 * It uses the `promptQualitySchema` to parse and validate the LLM's JSON output.
 * @type {StructuredOutputParser<typeof promptQualitySchema>}
 */
const qualityParser = StructuredOutputParser.fromZodSchema(promptQualitySchema);

/**
 * Prompt template for assessing the quality of an image generation prompt.
 * It instructs the LLM to act as an expert prompt engineer and provide
 * a quality score and actionable suggestions.
 * @type {PromptTemplate}
 */
const qualityPromptTemplate = PromptTemplate.fromTemplate(
  `You are an expert prompt engineer for image generation. Analyze the following prompt and determine if it has enough detail to generate a high-quality image.

A complete prompt should typically include:
- Subject/main focus (what to generate)
- Style or quality level (photorealistic, artistic, etc.)
- Key details about the subject
- Setting/environment (optional but helpful)
- Lighting/mood (optional but helpful)
- Colors or visual elements (optional but helpful)
- Composition or perspective (optional but helpful)

Conversation History:
{history}

Current User Prompt: {prompt}

{format_instructions}

Analyze the prompt quality and provide specific, actionable suggestions if it's incomplete.`
);

/**
 * Evaluates the quality of a user's image generation prompt and provides suggestions for improvement.
 * It uses a Google Generative AI model to assess completeness, identify missing elements,
 * and suggest specific questions to enhance the prompt.
 *
 * @param {string} prompt - The user's image generation prompt to be evaluated.
 * @param {string} [history='No previous conversation.'] - Optional conversation history relevant to the prompt.
 * @param {object} [options={}] - Configuration options for the AI model.
 * @param {string} [options.modelName='gemini-3.5-flash'] - The name of the Google Generative AI model to use (e.g., 'gemini-pro', 'gemini-3.5-flash').
 * @returns {Promise<PromptQualityAssessment>} A promise that resolves to an object containing the prompt quality assessment.
 */
export async function evaluatePromptQuality(
  prompt,
  history = 'No previous conversation.',
  { modelName = 'gemini-3.5-flash' } = {}
) {
  if (!GEMINI_API_KEY) {
    console.error('Gemini API key is not configured. Cannot evaluate prompt quality.');
    // Return a default error-like response if the API key is missing.
    // This prevents a crash and provides a clear signal to the user/system.
    return {
      isComplete: false,
      missingElements: ['Configuration Error'],
      suggestions: ['The prompt evaluation service is currently unavailable. Please try again later.'],
      score: 0,
    };
  }

  // NOTE: For high-throughput applications, consider caching or memoizing the model instance
  // to avoid repeated initializations. However, per-call instantiation is safer
  // for handling dynamic configurations like different model names.
  const model = new ChatGoogleGenerativeAI({
    apiKey: GEMINI_API_KEY,
    model: modelName,
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
    temperature: 0, // Use 0 for deterministic, analytical tasks.
  });

  const chain = qualityPromptTemplate.pipe(model).pipe(qualityParser);

  // In a production environment, replace console.log with a structured logger (e.g., Winston, Pino)
  // at an appropriate level (e.g., 'info' or 'debug').
  console.log(`Evaluating prompt quality for: "${prompt}"`);

  try {
    const result = await chain.invoke({
      prompt,
      history,
      format_instructions: qualityParser.getFormatInstructions(),
    });

    return result;
  } catch (error) {
    // Gracefully handle LLM output parsing errors, which are common.
    if (error.message && error.message.includes('Failed to parse')) {
      try {
        // Attempt to recover by cleaning the raw LLM output.
        const llmOutput = error.output || '';
        let jsonString = llmOutput
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        const lastBraceIndex = jsonString.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
          jsonString = jsonString.substring(0, lastBraceIndex + 1);
        }

        const parsed = JSON.parse(jsonString);
        return promptQualitySchema.parse(parsed); // Re-validate with Zod.
      } catch (fallbackError) {
        console.error(
          'Critical failure: Could not parse LLM output even after cleanup. Returning a safe default.',
          { originalError: error.message, fallbackError: fallbackError.message }
        );
        // This safe default ensures the user-facing application doesn't crash.
        return {
          isComplete: false,
          missingElements: ['Unable to evaluate prompt'],
          suggestions: ['There was an issue evaluating your prompt. Please try rephrasing or try again.'],
          score: 50, // Neutral score.
        };
      }
    }

    // For non-parsing errors (e.g., API errors, network issues), return a safe default.
    // This is better for user experience than throwing an unhandled exception.
    console.error('An unexpected error occurred during prompt evaluation:', error);
    return {
      isComplete: false,
      missingElements: ['Service Error'],
      suggestions: ['The prompt evaluation service is currently unavailable. Please try again later.'],
      score: 0,
    };
  }
}

/**
 * Prompt template for building an enhanced image generation prompt.
 * It instructs the LLM to consolidate conversation history into a single,
 * comprehensive prompt.
 * @type {PromptTemplate}
 */
const enhancePromptTemplate = PromptTemplate.fromTemplate(
  `You are an expert prompt engineer. Based on the conversation below, create a single, comprehensive image generation prompt that incorporates all the details the user has provided.

The final prompt should be clear, detailed, and optimized for an image generation model. Do not add any conversational text or explanations, only the prompt itself.

Conversation:
{conversation}

Generate a complete, well-structured image generation prompt:`
);

/**
 * Builds a single, comprehensive image generation prompt by consolidating
 * details from a conversation history. It uses a Google Generative AI model
 * to act as an expert prompt engineer.
 *
 * @param {string[]} conversationHistory - An array of strings, where each string is a user input from the conversation.
 * @param {object} [options={}] - Configuration options for the AI model.
 * @param {string} [options.modelName='gemini-3.5-flash'] - The name of the Google Generative AI model to use (e.g., 'gemini-pro', 'gemini-3.5-flash').
 * @returns {Promise<string>} A promise that resolves to the enhanced, consolidated image generation prompt.
 */
export async function buildEnhancedPrompt(
  conversationHistory,
  { modelName = 'gemini-3.5-flash' } = {}
) {
  // --- Input Validation ---
  // Ensure conversationHistory is a processable array to prevent runtime errors.
  if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
    console.warn('buildEnhancedPrompt called with empty or invalid conversation history.');
    return ''; // Return an empty string as a safe, neutral default.
  }

  // If there's only one message, there's nothing to consolidate. Return it directly to save an API call.
  if (conversationHistory.length === 1) {
    return conversationHistory[0];
  }

  if (!GEMINI_API_KEY) {
    console.error('Gemini API key is not configured. Cannot build enhanced prompt.');
    // Fallback to the last user message if the API is unavailable. This is often the most complete version.
    return conversationHistory[conversationHistory.length - 1];
  }

  const model = new ChatGoogleGenerativeAI({
    apiKey: GEMINI_API_KEY,
    model: modelName,
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
    temperature: 0.3, // Allow for some creativity in rephrasing and combining ideas.
  });

  const chain = enhancePromptTemplate.pipe(model);

  // Format the conversation history clearly for the LLM.
  const conversation = conversationHistory
    .map((item, idx) => `User Message ${idx + 1}: ${item}`)
    .join('\n');

  try {
    const result = await chain.invoke({ conversation });

    // Sanitize the LLM's raw output for cleaner integration.
    // .content can be a string or a complex object, ensure it's a string before processing.
    const content = result.content.toString();
    return content.trim().replace(/^"|"$/g, ''); // Remove surrounding quotes and trim whitespace.
  } catch (error) {
    console.error('Failed to build enhanced prompt via LLM. Returning last message as fallback.', error);
    // A graceful fallback ensures the user can still proceed with their last known good prompt.
    return conversationHistory[conversationHistory.length - 1];
  }
}