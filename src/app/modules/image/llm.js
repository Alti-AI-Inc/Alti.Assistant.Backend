import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PredictionServiceClient } from '@google-cloud/aiplatform';
import config from '../../../../config/index.js';

export const llm = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: 'gemini-3.5-flash',
  temperature: 0.7,
});

const clientOptions = {
  apiEndpoint: `${config.google?.gcp_location || config.gcpLocation || 'us-central1'}-aiplatform.googleapis.com`,
};

export const predictionServiceClient = new PredictionServiceClient(
  clientOptions
);
