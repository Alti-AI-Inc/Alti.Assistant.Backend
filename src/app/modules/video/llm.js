import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../config/index.js';

export const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  project: config.google.gcp_project_id,
  location: config.google.vertex_ai_region || 'us-central1',
  temperature: 0.7,
});
