import { GoogleGenAI } from '@google/genai';
import { DynamicTool } from '@langchain/core/tools';
import config from '../../../../../config/index.js';

/**
 * Vertex AI Service
 * Handles native Google Cloud Vertex AI Search datastore grounding
 * as a premium enterprise RAG tool. This service integrates with Google's Gemini API
 * to perform grounded searches against specified Vertex AI Search datastores,
 * providing relevant answers with citations and references.
 */
class VertexAiService {
  /**
   * Constructs an instance of VertexAiService.
   * Initializes the GoogleGenAI client with the API key from configuration.
   * @throws {Error} If `GEMINI_SECRET_KEY` is not configured.
   */
  constructor() {
    // Ensure API key is present for GoogleGenAI initialization
    if (!config.gemini_secret_key) {
      throw new Error('GEMINI_SECRET_KEY is not configured. Please ensure config/index.js or environment variables are set correctly.');
    }
    /**
     * The GoogleGenAI client instance used for interacting with the Gemini API.
     * @private
     * @type {GoogleGenAI}
     */
    this.ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });
    // this.initialized flag was redundant and has been removed.
  }

  /**
   * Performs grounded search using a Vertex AI Search datastore.
   * This method sends a query to the Gemini API, leveraging a Vertex AI Search datastore
   * for grounding the response, thereby providing factual and referenced answers.
   *
   * @param {string} query - The natural language search query to be executed against the datastore.
   * @param {string|null} [datastoreId=null] - Optional. A custom datastore identifier (e.g., a full resource name like `projects/.../locations/.../dataStores/...`).
   *   If `null` or not provided, it defaults to `process.env.VERTEX_AI_DATASTORE_ID` or a predefined
   *   datastore based on `config.google.gcp_project_id`.
   * @returns {Promise<Object>} A promise that resolves to an object containing the grounded answer,
   *   references, citations, and citation metadata.
   * @returns {string} return.answer - The grounded answer text from the model.
   * @returns {Array<Object>} return.reference - An array of up to 5 unique references found.
   * @returns {string} return.reference[].url - The URL of the reference.
   * @returns {string} return.reference[].domain - The domain or title of the reference source.
   * @returns {string} return.reference[].title - The title of the reference.
   * @returns {Array<Object>} return.citations - An array of up to 5 citations, indexed for display.
   * @returns {number} return.citations[].index - The 1-based index of the citation.
   * @returns {string} return.citations[].url - The URL of the citation.
   * @returns {string} return.citations[].domain - The domain or title of the citation source.
   * @returns {string} return.citations[].title - The title of the citation.
   * @returns {Object} return.citationMetadata - Metadata about the search operation.
   * @returns {string} return.citationMetadata.searchTimestamp - ISO timestamp of when the search was performed.
   * @returns {string} return.citationMetadata.model - The model used for the search (e.g., 'gemini-3.5-flash').
   * @returns {number} return.citationMetadata.totalSources - The total number of grounding chunks found.
   * @returns {string} return.citationMetadata.searchMethod - The method used for search (e.g., 'vertex_ai_search').
   * @throws {Error} If the Vertex AI Search grounding fails due to API errors or misconfiguration.
   */
  async searchVertexStore(query, datastoreId = null) {
    console.log(`🔍 Executing Vertex AI Search Datastore Grounding: "${query}"`);
    // SECURITY NOTE: The 'datastoreId' parameter is directly used to specify the Vertex AI datastore.
    // Ensure that 'datastoreId' is either derived from a trusted source (e.g., internal configuration)
    // or thoroughly validated against the requesting user's authorized datastores by the calling
    // service/API endpoint to prevent Insecure Direct Object Reference (IDOR) vulnerabilities.
    // The underlying Google Cloud permissions will enforce access, but application-level validation
    // provides a stronger defense-in-depth.
    const datastore = datastoreId || process.env.VERTEX_AI_DATASTORE_ID || `projects/${config.google.gcp_project_id || 'inso-gcp-project'}/locations/global/collections/default_collection/dataStores/inso-knowledge-base`;
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
   * Returns a LangChain DynamicTool for integrating Vertex AI Search into a ReAct Agent.
   * This tool allows an AI agent to perform grounded searches against enterprise knowledge bases
   * when specific types of queries are detected.
   *
   * @returns {DynamicTool} A configured `DynamicTool` instance with the name 'vertex-ai-search'
   *   and a description guiding its usage for internal documentation and private knowledge bases.
   *   The `func` property of the tool wraps `searchVertexStore` and returns a JSON string
   *   of the answer and references.
   */
  asTool() {
    const self = this;
    return new DynamicTool({
      name: 'vertex-ai-search',
      description: `Search enterprise knowledge base, internal documentation, blueprints, company directories, manuals, and secure private files via Google Cloud Vertex AI Search datastores. Use this tool specifically when the user asks about internal documents, secure guidelines, standard operating procedures, INSO blueprints, or private knowledge bases. Input: A natural language search query.`,
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

/**
 * Singleton instance of the VertexAiService.
 * This instance is exported as the default export for convenient use throughout the application.
 * @type {VertexAiService}
 */
const vertexAiService = new VertexAiService();
export default vertexAiService;
export { VertexAiService };