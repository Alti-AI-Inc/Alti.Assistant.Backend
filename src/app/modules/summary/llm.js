import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PredictionServiceClient } from '@google-cloud/aiplatform';
import Anthropic from '@anthropic-ai/sdk';
import config from '../../../../config/index.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const llm = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: 'gemini-3.5-flash',
  temperature: 0.7,
});

export const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
  baseURL: 'https://api.anthropic.com',
  timeout: 60000, // 60 seconds
});

export const geminiClient = new ChatGoogleGenerativeAI({
  model: 'gemini-3.5-flash',
  apiKey: config.gemini_secret_key,
  temperature: 0.7,
});
