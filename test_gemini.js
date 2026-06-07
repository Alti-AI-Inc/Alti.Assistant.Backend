import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const apiKey = process.env.GEMINI_API_KEY;
console.log('Using API key:', apiKey);

const genAI = new GoogleGenerativeAI(apiKey);

async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const result = await model.generateContent('Explain hello world in one sentence.');
    console.log('Response:', result.response.text());
  } catch (error) {
    console.error('Error querying Gemini:', error);
  }
}

run();
