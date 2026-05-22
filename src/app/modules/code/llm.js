import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../config/index.js';

export const llm = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  modelName: 'gemini-3.5-flash',
  temperature: 0.7,
});
