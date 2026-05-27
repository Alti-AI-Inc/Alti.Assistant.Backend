import dotenv from 'dotenv';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import config from '../config/index.js';

import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// Force the GOOGLE_APPLICATION_CREDENTIALS environment variable
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(process.cwd(), 'alti_gcp.json');

async function testVertexAI() {
  console.log('Testing Google Cloud Vertex AI with Service Account...');
  console.log('Project ID:', process.env.GCP_PROJECT_ID);
  console.log('Location:', process.env.GCP_LOCATION);
  console.log('Credentials file exists:', fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS));

  try {
    // Instantiate GenAI SDK for Vertex AI
    const ai = new GoogleGenAI({
      project: process.env.GCP_PROJECT_ID,
      location: process.env.GCP_LOCATION || 'us-central1'
    });

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: 'Hello! Reply with "Vertex AI is online!"',
    });

    console.log('🟢 Vertex AI is ONLINE! Response:');
    console.log(response.text);
  } catch (err) {
    console.error('❌ Vertex AI check failed:', err);
  }
}

testVertexAI();
