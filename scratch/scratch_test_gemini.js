import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/index.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
  console.log('Gemini API Key:', config.gemini_secret_key ? 'Present (ending in ' + config.gemini_secret_key.slice(-4) + ')' : 'MISSING');
  try {
    const genAI = new GoogleGenerativeAI(config.gemini_secret_key);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Test standard model
    const response = await model.generateContent('Say hello in one word');
    console.log('Gemini 1.5 Flash says:', response.response.text());
    
    // Now let's try gemini-3.5-flash
    try {
      const model35 = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
      const response35 = await model35.generateContent('Say hello in one word');
      console.log('Gemini 3.5 Flash says:', response35.response.text());
    } catch (e35) {
      console.log('❌ Gemini 3.5 Flash failed:', e35.message);
    }
  } catch (err) {
    console.error('❌ General Gemini test failed:', err);
  }
}

run();
