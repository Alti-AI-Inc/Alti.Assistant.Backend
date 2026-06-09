// Gemini AI utility functions
import { GoogleGenAI } from '@google/genai';

// Validate API key early to prevent runtime errors during API calls.
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is not set.');
}

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small';

/**
 * Generate embeddings for text using Gemini
 * @param {string} text The text to embed.
 * @returns {number[]} An array of numbers representing the embedding.
 * @throws {TypeError} If the input text is not a string.
 * @throws {Error} If the Gemini API response is malformed or empty.
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
 * Generate content with Gemini
 * @param {string} model The Gemini model to use (e.g., 'gemini-pro').
 * @param {any} contents The content to send to the model.
 * @param {object} [configParam] Optional configuration for the generation request.
 * @returns {object} The raw response from the Gemini API.
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