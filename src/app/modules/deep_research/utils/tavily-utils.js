import { GoogleGenAI } from '@google/genai';
import { StructuredTool } from '@langchain/core/tools';
import config from '../../../../../config/index.js';

const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY });

export class GoogleSearchGroundingTool extends StructuredTool {
  name = 'google_search_grounding';
  description = 'Search the web using Google Search Grounding via Gemini for real-time information';

  constructor(options = {}) {
    super();
    this.maxResults = options.maxResults || 10;
  }

  async invoke(params) {
    const {
      query,
      searchDepth = 'basic',
      includeAnswer = true,
    } = params;

    try {
      console.log(`Searching with Google Search Grounding: "${query}"`);

      const result = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Search the web and provide comprehensive, factual information about: ${query}`,
        config: {
          temperature: 0.1,
          tools: [{ googleSearch: {} }],
        },
      });

      const candidate = result.candidates?.[0];
      const answer = candidate?.content?.parts
        ?.filter((part) => part.text && !part.thought)
        ?.map((part) => part.text)
        ?.join('') || null;

      // Parse grounding metadata for search results
      const groundingMetadata = candidate?.groundingMetadata || {};
      const groundingChunks = groundingMetadata.groundingChunks || [];

      const results = groundingChunks.map((chunk, index) => ({
        title: chunk.web?.title || `Source ${index + 1}`,
        url: chunk.web?.uri || '',
        content: answer ? answer.substring(0, 500) : '',
        score: 1.0 - (index * 0.1),
      }));

      console.log(
        `Google Search Grounding completed: ${results.length} sources found`
      );

      return {
        query,
        answer: includeAnswer ? answer : null,
        results,
        search_metadata: {
          search_depth: searchDepth,
          total_results: results.length,
          timestamp: new Date().toISOString(),
          webSearchQueries: groundingMetadata.webSearchQueries || [],
        },
      };
    } catch (error) {
      console.error('Google Search Grounding Error:', error);
      throw new Error(`Failed to search with Google Search Grounding: ${error.message}`);
    }
  }

  async call(params) {
    return this.invoke(params);
  }
}

// Backward-compatible export alias
export const TavilySearchTool = GoogleSearchGroundingTool;
