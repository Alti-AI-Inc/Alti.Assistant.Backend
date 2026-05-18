import { ChatOpenAI } from '@langchain/openai';
import { PredictionServiceClient } from '@google-cloud/aiplatform';
import Anthropic from '@anthropic-ai/sdk';
import config from '../../../../config/index.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

export const llm = new ChatOpenAI({
  apiKey: config.openaiApiKey,
  model: 'gpt-4o',
  temperature: 0.7,
});

export const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
  baseURL: 'https://api.anthropic.com',
  timeout: 60000, // 60 seconds
});

export const geminiClient = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  apiKey: config.gemini_secret_key,
  temperature: 0.7,
});
