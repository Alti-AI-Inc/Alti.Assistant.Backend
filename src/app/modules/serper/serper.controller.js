import { GoogleGenAI } from '@google/genai';
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';

const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

const SerperAiGetResponse = catchAsync(async (req, res) => {
  try {
    const prompt = req.body?.prompt;

    // Use Gemini with Google Search Grounding — replaces Serper API
    const result = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `Search the web for: ${prompt}`,
      config: {
        temperature: 0.1,
        tools: [{ googleSearch: {} }],
      },
    });

    const candidate = result.candidates?.[0];
    const answer = candidate?.content?.parts
      ?.filter((part) => part.text && !part.thought)
      ?.map((part) => part.text)
      ?.join('') || '';

    // Parse grounding metadata for structured search results
    const groundingMetadata = candidate?.groundingMetadata || {};
    const groundingChunks = groundingMetadata.groundingChunks || [];

    const searchSummary = answer;
    const formattedSearchResults = groundingChunks.slice(0, 3).map((chunk, index) => ({
      title: chunk.web?.title || `Result ${index + 1}`,
      link: chunk.web?.uri || '',
      snippet: answer.substring(0, 200),
      position: index + 1,
    }));

    return { searchSummary, formattedSearchResults };
  } catch (error) {
    console.error('Error fetching Google Search Grounding results:', error);
    return { searchSummary: '', formattedSearchResults: [] };
  }
});

export const SerperAiController = {
  SerperAiGetResponse,
};
