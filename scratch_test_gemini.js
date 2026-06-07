import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log('Testing with API Key prefix:', apiKey ? apiKey.substring(0, 8) + '...' : 'undefined');

if (!apiKey) {
  console.error('No GEMINI_API_KEY found in environment');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent('Hello! Respond with a single word.');
    console.log('Response:', result.response.text());
  } catch (err) {
    console.error('Gemini API call failed:', err);
  }
}

run();
