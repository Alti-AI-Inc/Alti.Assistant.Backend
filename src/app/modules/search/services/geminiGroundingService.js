import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../../../../../config/index.js";
import { GoogleGenAI } from "@google/genai";

/**
 * Gemini Grounding Service with Native Google Search
 * Uses Google's built-in grounding for simpler, more reliable search
 */

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Create a grounded Gemini model with native Google Search
 * @param {string} modelName - Model to use (default: gemini-3-pro-preview)
 * @returns {GenerativeModel} Configured model instance
 */
export function createGroundedModel(modelName = "gemini-3-pro-preview") {
  return genAI.getGenerativeModel({
    model: modelName,
    tools: [
      {
        googleSearch: {} // Native Google Search grounding tool
      }
    ]
  });
}

/**
 * Execute a grounded search with Google's native tool
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {Object} Formatted response with answer, references, and citations
 */
export async function executeGroundedSearch(query, conversationHistory = []) {
  const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

  console.log(`🔍 Executing grounded search: "${query}"`);

  try {
    const startTime = Date.now();

    // Build contents with proper format for Google GenAI
    const contents = [
      ...conversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      })),
      {
        role: 'user',
        parts: [{ text: query }]
      }
    ];

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const endTime = Date.now();
    console.log(`⏱️ Search took ${endTime - startTime} ms`);
    const response = result.candidates[0];
    const text = response.content.parts.map(part => part.text).join('');

    // Extract grounding metadata
    const groundingMetadata = response.groundingMetadata;

    // Process grounding metadata into references
    const references = [];
    const usedUrls = new Set();

    if (groundingMetadata?.groundingChunks) {
      groundingMetadata.groundingChunks.forEach((chunk, index) => {
        if (chunk.web?.uri && !usedUrls.has(chunk.web.uri)) {
          usedUrls.add(chunk.web.uri);
          console.log(`   Source ${index + 1}: ${chunk.web.uri}`);

          try {
            const url = new URL(chunk.web.uri);
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || url.hostname.replace('www.', ''),
              title: chunk.web.title
            });
          } catch {
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || 'unknown',
              title: chunk.web.title
            });
          }
        }
      });
    }

    // Limit to 5 references
    const limitedReferences = references.slice(0, 5);

    const citations = limitedReferences.map((ref, index) => ({
      index: index + 1,
      url: ref.url,
      domain: ref.domain,
      title: ref.title
    }));

    // Build citation metadata
    const citationMetadata = groundingMetadata ? {
      searchQueries: groundingMetadata.webSearchQueries || [],
      searchTimestamp: new Date().toISOString(),
      model: "gemini-3-pro-preview",
      groundingSupports: groundingMetadata.groundingSupports?.length || 0,
      totalSources: groundingMetadata.groundingChunks?.length || 0
    } : null;

    console.log(`✅ Grounded search completed`);
    console.log(`📊 Used ${groundingMetadata?.webSearchQueries?.length || 0} search queries`);
    console.log(`📚 Found ${references.length} sources`);

    if (groundingMetadata?.webSearchQueries) {
      console.log(`🔎 Search queries used:`, groundingMetadata.webSearchQueries);
    }

    return {
      answer: text,
      reference: limitedReferences,
      citations: citations,
      citationMetadata: citationMetadata
    };

  } catch (error) {
    console.error("❌ Error in grounded search:", error);
    throw error;
  }
}

/**
 * Execute grounded search with specific model
 * @param {string} query - User query
 * @param {Array} conversationHistory - Previous messages
 * @param {string} modelName - Specific model to use
 * @returns {Object} Formatted response
 */
export async function executeGroundedSearchWithModel(query, conversationHistory = [], modelName = "gemini-3-pro-preview") {
  const model = createGroundedModel(modelName);

  const chat = model.startChat({
    history: conversationHistory.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }))
  });

  console.log(`🔍 Executing grounded search with ${modelName}: "${query}"`);

  try {
    const result = await chat.sendMessage(query);
    const response = await result.response;
    const text = response.text();

    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    const references = [];
    const usedUrls = new Set();

    if (groundingMetadata?.groundingChunks) {
      groundingMetadata.groundingChunks.forEach((chunk) => {
        if (chunk.web?.uri && !usedUrls.has(chunk.web.uri)) {
          usedUrls.add(chunk.web.uri);

          try {
            const url = new URL(chunk.web.uri);
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || url.hostname.replace('www.', ''),
              title: chunk.web.title
            });
          } catch {
            references.push({
              url: chunk.web.uri,
              domain: chunk.web.title || 'unknown',
              title: chunk.web.title
            });
          }
        }
      });
    }

    const limitedReferences = references.slice(0, 5);

    const citations = limitedReferences.map((ref, index) => ({
      index: index + 1,
      url: ref.url,
      domain: ref.domain,
      title: ref.title
    }));

    const citationMetadata = groundingMetadata ? {
      searchQueries: groundingMetadata.webSearchQueries || [],
      searchTimestamp: new Date().toISOString(),
      model: modelName,
      groundingSupports: groundingMetadata.groundingSupports?.length || 0,
      totalSources: groundingMetadata.groundingChunks?.length || 0
    } : null;

    console.log(`✅ Grounded search completed with ${modelName}`);
    console.log(`📊 Used ${groundingMetadata?.webSearchQueries?.length || 0} search queries`);
    console.log(`📚 Found ${references.length} sources`);

    return {
      answer: text,
      reference: limitedReferences,
      citations: citations,
      citationMetadata: citationMetadata
    };

  } catch (error) {
    console.error(`❌ Error in grounded search with ${modelName}:`, error);
    throw error;
  }
}

export default {
  createGroundedModel,
  executeGroundedSearch,
  executeGroundedSearchWithModel
};
