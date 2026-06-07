import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../config/index.js';

export const llm = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: 'gemini-3.5-flash',
  project: config.google.gcp_project_id,
  location: config.google.vertex_ai_region || 'us-central1',
  temperature: 0.7,
});
