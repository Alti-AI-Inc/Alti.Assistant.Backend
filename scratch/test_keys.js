import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const keys = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_SEARCH_API_KEY: process.env.GOOGLE_SEARCH_API_KEY,
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY
};

async function testKey(name, key) {
  if (!key) {
    console.log(`[-] Key ${name} is empty.`);
    return;
  }
  console.log(`[*] Testing key ${name} (${key.substring(0, 10)}...)...`);
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Hello',
    });
    console.log(`[+] SUCCESS for key ${name}:`, response.text.trim());
  } catch (err) {
    console.log(`[-] FAILED for key ${name}:`, err.message);
  }
}

async function run() {
  for (const [name, key] of Object.entries(keys)) {
    await testKey(name, key);
  }
}

run();
