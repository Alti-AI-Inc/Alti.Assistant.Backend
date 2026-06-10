import { GoogleGenAI } from '@google/genai';
import config from '../../../../config/index.js';

export const ai = new GoogleGenAI({
  vertex: true,
  project: config.google.gcp_project_id,
  location: config.google.vertex_ai_region || 'us-central1',
});