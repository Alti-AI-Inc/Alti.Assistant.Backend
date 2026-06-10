/**
 * @file Utility functions for interacting with Google's Gemini models via Vertex AI.
 * This file provides functionalities for generating text embeddings and general content generation.
 * It uses Application Default Credentials (ADC) for authentication.
 */

// Use the Google Cloud Vertex AI SDK which supports Application Default Credentials.
import { VertexAI } from '@google-cloud/vertexai';

// Use standard GCP project / location values or fallbacks to prevent startup crashes
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || 'alti-assistant';
const location = process.env.GOOGLE_CLOUD_LOCATION || process.env.GCP_LOCATION || 'us-central1';

/**
 * VertexAI client instance for interacting with the Vertex AI API.
 * Initialized using Application Default Credentials (ADC).
 * Ensure your environment is authenticated (e.g., via `gcloud auth application-default login`).
 * @type {VertexAI}
 */
const vertexAI = new VertexAI({
  project,
  location,
});

/**
 * The name of the embedding model to use for text embeddings.
 * Defaults to a standard Vertex AI embedding model if not specified in environment variables.
 * Note: Model names for Vertex AI differ from Google AI Studio (e.g., 'textembedding-gecko@latest').
 * @type {string}
 */
const EMBED_MODEL = process.env.EMBED_MODEL || 'textembedding-gecko@latest';

/**
 * Generates embeddings for a given text using the configured Vertex AI embedding model.
 * This function truncates input text if it exceeds 8000 characters to prevent API errors.
 *
 * @async
 * @param {string} text - The text string to generate embeddings for.
 * @returns {Promise<number[]>} A promise that resolves to an array of numbers representing the embedding vector.
 * @throws {TypeError} If the input `text` is not a string.
 * @throws {Error} If the Vertex AI API response is malformed, empty, or fails to provide valid embeddings.
 */
export async function embedText(text) {
  // Ensure input is a string to prevent runtime errors from string methods.
  if (typeof text !== 'string') {
    throw new TypeError('Input for embedText must be a string.');
  }

  // Truncate text if it exceeds the model's typical input limit to avoid API errors or excessive costs.
  const input = text.length > 8000 ? text.slice(0, 8000) : text;
  
  const embeddingModel = vertexAI.getGenerativeModel({
    model: EMBED_MODEL,
  });

  // The Vertex AI SDK's embedContent method takes the text directly.
  // Note: The 'outputDimensionality' config from the previous SDK is not supported here.
  // The embedding dimension is determined by the selected model.
  const res = await embeddingModel.embedContent(input);

  // Validate the API response structure to prevent crashes if the response is unexpected.
  // The new SDK has a different response structure: { embedding: { values: [...] } }
  if (!res || !res.embedding || !Array.isArray(res.embedding.values)) {
    console.error('Unexpected API response structure for embedContent:', res);
    throw new Error('Failed to retrieve valid embeddings from Vertex AI API.');
  }

  // Log the embedded text for debugging purposes. Consider removing or making conditional in production.
  console.log(`Embedded text: ${input}`);
  return res.embedding.values;
}

/**
 * Generates content using a specified Gemini model on Vertex AI and provided content.
 * Allows for optional configuration parameters to customize the generation request.
 *
 * @async
 * @param {string} model - The identifier of the Gemini model to use (e.g., 'gemini-1.5-pro-preview-0409').
 * @param {any} contents - The input content for the model. This can be a string, an array of parts, or a more complex object depending on the model's requirements.
 * @param {object} [generationConfig] - Optional configuration object for the generation request (e.g., temperature, maxOutputTokens).
 * @returns {Promise<object>} A promise that resolves to the raw response object from the Vertex AI API.
 * @throws {Error} If the Vertex AI API call fails.
 */
export async function generateContent(model, contents, generationConfig) {
  // Note: The 'thinkingConfig' from the previous SDK is not supported in Vertex AI.
  // The configParam is now treated as 'generationConfig' and passed during model initialization.
  const generativeModel = vertexAI.getGenerativeModel({
    model,
    generationConfig,
  });

  const result = await generativeModel.generateContent(contents);
  // The actual response is nested inside the 'response' property of the result.
  return result.response;
}

export { vertexAI };