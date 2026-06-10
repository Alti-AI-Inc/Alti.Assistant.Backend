/**
 * @file Utility functions for interacting with the Google Gemini AI API.
 * This file provides functionalities for generating text embeddings and general content generation.
 * It ensures the GEMINI_API_KEY is set and initializes the GoogleGenAI client.
 */

import { GoogleGenAI } from '@google/genai';

// Validate API key early to prevent runtime errors during API calls.
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is not set.');
}

/**
 * GoogleGenAI client instance for interacting with the Gemini API.
 * Initialized with the API key from `process.env.GEMINI_API_KEY`.
 * @type {GoogleGenAI}
 */
const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * The name of the embedding model to use for text embeddings.
 * Defaults to 'text-embedding-3-small' if not specified in environment variables.
 * @type {string}
 */
const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small';

/**
 * Generates embeddings for a given text using the configured Gemini embedding model.
 * This function truncates input text if it exceeds 8000 characters to prevent API errors.
 *
 * @async
 * @param {string} text - The text string to generate embeddings for.
 * @returns {Promise<number[]>} A promise that resolves to an array of numbers representing the embedding vector.
 * @throws {TypeError} If the input `text` is not a string.
 * @throws {Error} If the Gemini API response is malformed, empty, or fails to provide valid embeddings.
 */
export async function embedText(text) {
  // Ensure input is a string to prevent runtime errors from string methods.
  if (typeof text !== 'string') {
    throw new TypeError('Input for embedText must be a string.');
  }

  // Truncate text if it exceeds the model's typical input limit to avoid API errors or excessive costs.
  const input = text.length > 8000 ? text.slice(0, 8000) : text;
  
  const res = await gemini.models.embedContent({
    model: EMBED_MODEL,
    contents: input,
    config: {
      outputDimensionality: 1536, // Hardcoded dimensionality, consider making configurable if needed.
    },
  });

  // Validate the API response structure to prevent crashes if the response is unexpected.
  if (!res || !res.embeddings || !Array.isArray(res.embeddings) || res.embeddings.length === 0 || !res.embeddings[0] || !Array.isArray(res.embeddings[0].values)) {
    console.error('Unexpected API response structure for embedContent:', res);
    throw new Error('Failed to retrieve valid embeddings from Gemini API.');
  }

  // Log the embedded text for debugging purposes. Consider removing or making conditional in production.
  console.log(`Embedded text: ${input}`);
  return res.embeddings[0].values;
}

/**
 * Generates content using a specified Gemini model and provided content.
 * Allows for optional configuration parameters to customize the generation request.
 *
 * @async
 * @param {string} model - The identifier of the Gemini model to use (e.g., 'gemini-pro', 'gemini-1.5-pro').
 * @param {any} contents - The input content for the model. This can be a string, an array of parts, or a more complex object depending on the model's requirements.
 * @param {object} [configParam] - Optional configuration object for the generation request.
 * @param {object} [configParam.thinkingConfig] - Configuration related to the model's thinking process.
 * @param {boolean} [configParam.thinkingConfig.includeThoughts=false] - Whether to include the model's internal thoughts in the response.
 * @returns {Promise<object>} A promise that resolves to the raw response object from the Gemini API.
 * @throws {Error} If the Gemini API call fails.
 */
export async function generateContent(model, contents, configParam) {
  // Define a default configuration for content generation.
  const defaultConfig = {
    thinkingConfig: {
      includeThoughts: false,
    },
  };

  // Merge the provided configParam with the defaultConfig.
  // This ensures default settings are applied unless explicitly overridden by configParam.
  // If configParam is null or undefined, it will be ignored by the spread operator,
  // effectively using only defaultConfig.
  const finalConfig = { ...defaultConfig, ...configParam };

  const response = await gemini.models.generateContent({
    model,
    contents,
    config: finalConfig,
  });
  return response;
}

export { gemini };