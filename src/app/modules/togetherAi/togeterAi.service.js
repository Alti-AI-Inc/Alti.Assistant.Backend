/**
 * @file This service module provides functionalities for interacting with AI models,
 * specifically for image generation using Google GenAI (Imagen 4).
 * It encapsulates the logic for making AI calls and processing their responses.
 */

import { GoogleGenAI } from '@google/genai';
import config from '../../../../config/index.js';

/**
 * Initializes the Google GenAI client with the API key from the configuration.
 * @type {GoogleGenAI}
 */
const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

/**
 * Generates an image using the Google GenAI Imagen 4 model based on a given text prompt.
 * It takes a prompt and returns a base64 encoded image URL.
 *
 * @async
 * @function TogetherAiImgGenerationService
 * @param {object} data - The input data for image generation.
 * @param {string} [data.user] - Optional user identifier associated with the request.
 * @param {string} [data.sessionId] - Optional session identifier for the request.
 * @param {string} data.prompt - The text prompt to guide the image generation.
 * @returns {Promise<object>} A promise that resolves to an object containing an array of generated image URLs.
 * @returns {Array<object>} return.data - An array where each object contains a `url` property.
 * @returns {string} return.data[].url - The base64 encoded URL of the generated image (e.g., `data:image/png;base64,...`).
 * @throws {Error} If the `prompt` is missing.
 * @throws {Error} If the AI model returns no image data.
 */
const TogetherAiImgGenerationService = async (data) => {
  const { user, sessionId, prompt } = data;
  if (!prompt) throw new Error('Prompt is required for image generation.');
  
  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: '1:1',
    },
  });

  // Return in compatible format
  const generatedImage = response.generatedImages?.[0];
  if (!generatedImage?.image?.imageBytes) {
    throw new Error('Imagen 4 returned no image data.');
  }

  return {
    data: [{
      url: `data:image/png;base64,${Buffer.from(generatedImage.image.imageBytes).toString('base64')}`,
    }],
  };
};

/**
 * @typedef {object} TogetherAiService
 * @property {function(object): Promise<object>} TogetherAiImgGenerationService - Function to generate images using Together AI (Google GenAI).
 */

/**
 * Exports a collection of AI-related services.
 * @type {TogetherAiService}
 */
export const TogetherAiService = {
  TogetherAiImgGenerationService,
};