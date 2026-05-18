// Gemini AI utility functions
import { GoogleGenAI } from '@google/genai';

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small';

/**
 * Generate embeddings for text using Gemini
 */
export async function embedText(text) {
  const input = text.length > 8000 ? text.slice(0, 8000) : text;
  const res = await gemini.models.embedContent({
    model: EMBED_MODEL,
    contents: input,
    config: {
      outputDimensionality: 1536,
    },
  });
  console.log(`Embedded text: ${input}`);
  return res.embeddings[0].values;
}

/**
 * Generate content with Gemini
 */
export async function generateContent(model, contents, config = {}) {
  const response = await gemini.models.generateContent({
    model,
    contents,
    config: config
      ? config
      : {
          thinkingConfig: {
            includeThoughts: false,
          },
        },
  });
  return response;
}

export { gemini };
