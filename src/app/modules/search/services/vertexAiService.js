import { GoogleGenAI } from '@google/genai';
import { DynamicTool } from '@langchain/core/tools';
import config from '../../../../../config/index.js';

/**
 * Vertex AI Service
 * Handles native Google Cloud Vertex AI Search datastore grounding
 * as a premium enterprise RAG tool.
 */
class VertexAiService {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });
    this.initialized = true;
  }

  /**
   * Performs grounded search using a Vertex AI Search datastore
   * @param {string} query - The search query
   * @param {string|null} datastoreId - Custom datastore identifier or null for default
   * @returns {Promise<Object>} Grounded answer with references and citations
   */
  async searchVertexStore(query, datastoreId = null) {
    console.log(`🔍 Executing Vertex AI Search Datastore Grounding: "${query}"`);
    const datastore = datastoreId || process.env.VERTEX_AI_DATASTORE_ID || `projects/${config.google.gcp_project_id || 'alti-gcp-project'}/locations/global/collections/default_collection/dataStores/alti-knowledge-base`;
    console.log(`📍 Scoping search to Datastore: ${datastore}`);

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: query,
        config: {
          temperature: 0.2,
          maxOutputTokens: 4000,
          tools: [
            {
              vertexAISearch: {
                datastore: datastore
              }
            }
          ]
        }
      });

      const response = result.candidates?.[0];
      const text = response?.content?.parts
        ?.filter((part) => part.text)
        ?.map((part) => part.text)
        ?.join('') || '';

      const groundingMetadata = response?.groundingMetadata;
      const references = [];
      const usedUrls = new Set();

      if (groundingMetadata?.groundingChunks) {
        groundingMetadata.groundingChunks.forEach((chunk, index) => {
          const uri = chunk.web?.uri || chunk.document?.uri;
          const title = chunk.web?.title || chunk.document?.title || `Document ${index + 1}`;
          if (uri && !usedUrls.has(uri)) {
            usedUrls.add(uri);
            try {
              const url = new URL(uri);
              references.push({
                url: uri,
                domain: title || url.hostname.replace('www.', ''),
                title: title,
              });
            } catch {
              references.push({
                url: uri,
                domain: title || 'internal-doc',
                title: title,
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

      const citationMetadata = groundingMetadata
        ? {
            searchTimestamp: new Date().toISOString(),
            model: 'gemini-3.5-flash',
            totalSources: groundingMetadata.groundingChunks?.length || 0,
            searchMethod: 'vertex_ai_search',
          }
        : {
            searchTimestamp: new Date().toISOString(),
            searchMethod: 'vertex_ai_search',
          };

      console.log(`✅ Vertex AI Search Grounding completed successfully.`);
      return {
        answer: text,
        reference: limitedReferences,
        citations: citations,
        citationMetadata: citationMetadata
      };
    } catch (error) {
      console.error('❌ Vertex AI Search Grounding failed:', error);
      throw error;
    }
  }

  /**
   * Returns a LangChain DynamicTool for integrating Vertex AI Search into the ReAct Agent
   * @returns {DynamicTool} Configured DynamicTool instance
   */
  asTool() {
    const self = this;
    return new DynamicTool({
      name: 'vertex-ai-search',
      description: `Search enterprise knowledge base, internal documentation, blueprints, company directories, manuals, and secure private files via Google Cloud Vertex AI Search datastores. Use this tool specifically when the user asks about internal documents, secure guidelines, standard operating procedures, ALTI blueprints, or private knowledge bases. Input: A natural language search query.`,
      async func(query) {
        try {
          const result = await self.searchVertexStore(query);
          return JSON.stringify({
            answer: result.answer,
            references: result.reference
          });
        } catch (err) {
          return `Vertex AI Search failed: ${err.message}`;
        }
      }
    });
  }
}

const vertexAiService = new VertexAiService();
export default vertexAiService;
export { VertexAiService };
