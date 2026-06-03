import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// Clean environment to force Google Cloud Application Default Credentials (ADC) from gcloud
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

async function run() {
  console.log("Initializing GoogleGenAI with Vertex AI (using user gcloud ADC)...");
  
  try {
    const ai = new GoogleGenAI({
      vertexAI: {
        project: 'gen-lang-client-0273900650',
        location: 'us-central1'
      }
    });

    console.log("Sending generateContent request to gemini-2.5-flash...");
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Say hello in 5 words or less',
    });

    console.log("RESPONSE SUCCESS:", response.text);
  } catch (err) {
    console.error("RESPONSE ERROR:", err);
  }
}

run();
