import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const contents = [
      { role: 'model', parts: [{ text: 'Hello' }] },
      { role: 'user', parts: [{ text: 'Tell me a joke.' }] }
    ];
    const result = await model.generateContent({ contents });
    console.log('Response:', result.response.text());
  } catch (error) {
    console.error('Error querying Gemini:', error);
  }
}

run();
