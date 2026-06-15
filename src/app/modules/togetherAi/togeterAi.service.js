/**
 * @file This service module provides functionalities for interacting with AI models,
 * specifically for image generation using Google Vertex AI (Imagen).
 * It encapsulates the logic for making AI calls and processing their responses.
 * This version is updated to use the enterprise Vertex AI SDK, enforce safety settings,
 * and include PII masking.
 */

import winston from 'winston';
import httpStatus from 'http-status';
// Use the official Google Cloud Vertex AI SDK for enterprise features and security
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';

// Create a Winston logger configured for GCP Cloud Logging (Stackdriver).
// When logs are output as JSON to stdout/stderr, GCP Cloud Logging automatically
// parses them. It recognizes the 'level' property (e.g., 'info', 'error') and
// correctly maps it to the 'severity' field in the log entry.
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
  ],
});

// Initialize Vertex AI with project and location.
// It will use Application Default Credentials (ADC) for authentication.
// Ensure your environment is configured (e.g., by running `gcloud auth application-default login`).
const vertexAI = new VertexAI({
  project: config.google_project_id, // Your Google Cloud project ID
  location: config.google_location,   // The location of your Vertex AI resources (e.g., 'us-central1')
});

// Define safety settings to filter harmful content.
// These settings block content with a medium or higher probability of being unsafe.
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

// Instantiate the Imagen model with the defined safety settings
const imagenModel = vertexAI.getGenerativeModel({
  model: 'imagegeneration@006', // Use a standard, stable Vertex AI Imagen model
  safetySettings,
});

/**
 * Masks potential PII in a given text string.
 * This is a simplified implementation for demonstration. For production,
 * consider using the Google Cloud DLP API for more robust PII detection.
 * @param {string} text The text to sanitize.
 * @returns {string} The sanitized text.
 */
const maskPII = (text) => {
  if (!text) return text;
  // Mask email addresses
  let sanitizedText = text.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL_REDACTED]');
  // Mask phone numbers (basic US-like patterns)
  sanitizedText = sanitizedText.replace(/(\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/g, '[PHONE_REDACTED]');
  // Note: Masking names and addresses with regex is unreliable and complex.
  // This is a placeholder for a more robust PII detection strategy like Google's DLP API.
  return sanitizedText;
};

/**
 * Generates an image using the Google Vertex AI Imagen model based on a given text prompt.
 * It takes a prompt, sanitizes it for PII, and returns a base64 encoded image URL.
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
 * @throws {ApiError} If the prompt is missing or if the AI service fails.
 */
const TogetherAiImgGenerationService = async (data) => {
  const { user, sessionId, prompt } = data;

  // Log the start of the service call with structured data for traceability.
  logger.info({
    message: 'Image generation service invoked.',
    component: 'TogetherAiImgGenerationService',
    user,
    sessionId,
  });

  try {
    if (!prompt) {
      // Log validation failures as warnings.
      logger.warn({
        message: 'Validation failed: Prompt is required.',
        component: 'TogetherAiImgGenerationService',
        user,
        sessionId,
      });
      // PATCH: Throw a structured ApiError for invalid input.
      throw new ApiError(httpStatus.BAD_REQUEST, 'Prompt is required for image generation.');
    }

    // IMPORTANT: Sanitize the prompt to remove PII before sending it to the model.
    const sanitizedPrompt = maskPII(prompt);

    const request = {
      prompt: sanitizedPrompt,
      number_of_images: 1,
      aspect_ratio: '1:1',
    };

    // Call the Vertex AI Imagen model with the sanitized prompt and safety settings applied.
    const response = await imagenModel.generateImages(request);

    // Return in compatible format
    const generatedImage = response.generatedImages?.[0];
    if (!generatedImage?.imageBytes) {
      // Log errors when the external API call does not return the expected data.
      logger.error({
        message: 'Vertex AI Imagen API returned no image data.',
        component: 'TogetherAiImgGenerationService',
        user,
        sessionId,
        apiResponse: response, // Include API response for debugging.
      });
      // PATCH: Throw a structured ApiError for upstream service failures.
      throw new ApiError(httpStatus.BAD_GATEWAY, 'Imagen returned no image data.');
    }

    // Log successful completion of the operation.
    logger.info({
      message: 'Image generation successful.',
      component: 'TogetherAiImgGenerationService',
      user,
      sessionId,
    });

    return {
      data: [{
        url: `data:image/png;base64,${Buffer.from(generatedImage.imageBytes).toString('base64')}`,
      }],
    };
  } catch (error) {
    // PATCH: Centralized error logging and normalization.
    // This block now catches any error, logs it, and ensures a normalized ApiError is thrown.

    // Log the detailed error for internal debugging, regardless of its type.
    logger.error({
      message: 'An error occurred during image generation.',
      component: 'TogetherAiImgGenerationService',
      user,
      sessionId,
      // Including the error message and stack provides crucial debugging information.
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        isOperational: error.isOperational || false, // Include ApiError specific fields
      },
    });

    // If the error is already an ApiError, we've already classified it. Re-throw it.
    if (error instanceof ApiError) {
      throw error;
    }

    // If it's an unknown error (e.g., from the SDK, network), wrap it in a generic
    // internal server error. This prevents leaking implementation details to the client.
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal error occurred during image generation.');
  }
};

/**
 * @typedef {object} TogetherAiService
 * @property {function(object): Promise<object>} TogetherAiImgGenerationService - Function to generate images using Google Vertex AI.
 */

/**
 * Exports a collection of AI-related services.
 * @type {TogetherAiService}
 */
export const TogetherAiService = {
  TogetherAiImgGenerationService,
};