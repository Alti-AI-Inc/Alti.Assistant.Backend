/**
 * @file Initializes and exports clients for interacting with Google's Large Language Models (LLM)
 * and AI Platform services. This module centralizes the configuration for Gemini and the
 * AI Platform Prediction Service.
 * @module modules/image/llm
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PredictionServiceClient } from '@google-cloud/aiplatform';
import config from '../../../../config/index.js';

/**
 * An instance of the LangChain ChatGoogleGenerativeAI class, configured for interacting
 * with the Google Gemini model. This client is used for generative AI chat completions.
 *
 * @type {ChatGoogleGenerativeAI}
 * @property {string} apiKey - The API key for authenticating with the Google Generative AI service, sourced from application configuration.
 * @property {string} model - The specific Gemini model to be used, set to 'gemini-2.5-flash'.
 * @property {number} temperature - The sampling temperature for the model's responses, controlling creativity (0.7).
 */
export const llm = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: 'gemini-2.5-flash',
  temperature: 0.7,
});

/**
 * Configuration options for the Google Cloud AI Platform Prediction Service client.
 * @private
 * @type {{apiEndpoint: string}}
 */
const clientOptions = {
  apiEndpoint: `${config.google?.gcp_location || config.gcpLocation || 'us-central1'}-aiplatform.googleapis.com`,
};

/**
 * An instance of the Google Cloud AI Platform PredictionServiceClient.
 * This client is used to make prediction requests to deployed models on the AI Platform.
 * It is configured with a regional API endpoint based on the GCP location
 * specified in the application configuration.
 *
 * @type {PredictionServiceClient}
 */
export const predictionServiceClient = new PredictionServiceClient(
  clientOptions
);