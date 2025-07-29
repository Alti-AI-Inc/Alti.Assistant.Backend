import { ChatOpenAI } from "@langchain/openai";
import { PredictionServiceClient } from "@google-cloud/aiplatform";
import Anthropic from "@anthropic-ai/sdk";
import config from '../../../../config/index.js';



export const llm = new ChatOpenAI({
  apiKey: config.openaiApiKey,
  model: "gpt-4o",
  temperature: 0.7,
});
const clientOptions = {
  apiEndpoint: `${config.gcpLocation}-aiplatform.googleapis.com`,
};
export const predictionServiceClient = new PredictionServiceClient(clientOptions);
export const anthropic = new Anthropic({
    apiKey: config.anthropicApiKey,
    baseURL: "https://api.anthropic.com",
    timeout: 60000, // 60 seconds
});
