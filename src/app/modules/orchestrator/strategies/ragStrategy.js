import { RagService } from '../../rag/rag.service.js';
import { logger } from '../../../../shared/logger.js';

/**
 * RAG Strategy — uses the full pgvector RAG pipeline.
 * Retrieves from the vector store and generates grounded answers.
 * Falls back to Exa web search if no documents are found in the collection.
 *
 * @param {Object} params - { query, userMessage, collectionId, topK, hybrid }
 * @param {Object} context - Execution context
 * @returns {Promise<{ route: string, answer: string, sources: Array }>}
 */
export async function execute(params = {}, context = {}) {
  const query = params.query || params.userMessage || '';

  try {
    const result = await RagService.query({
      query,
      collectionId: params.collectionId,
      topK: params.topK || 5,
      hybrid: params.hybrid !== false, // default true
      model: params.model,
    });

    return {
      route: 'RAG',
      answer: result.answer,
      sources: result.sources,
      model: result.model,
      chunksUsed: result.chunksUsed,
      totalDurationMs: result.totalDurationMs,
    };
  } catch (err) {
    logger.error(`[RAG Strategy] Error: ${err.message}`);

    // Fallback: if pgvector is unavailable, use Exa + LangChain
    try {
      const { ExaSearchService } = await import('../../ExaSearch/exaSearch.service.js');
      const { LangChainService } = await import('../../langchain/langchain.service.js');

      const searchResults = await ExaSearchService.searchDirectly(query, { type: 'magic', numResults: 3 });
      const documents = (searchResults.results || []).map(r => r.text || r.title || '');
      const ragResult = await LangChainService.runRagChain({ query, documents });

      return {
        route: 'RAG',
        answer: ragResult.answer,
        sources: (searchResults.results || []).map(r => ({ title: r.title, url: r.url })),
        model: ragResult.model,
        fallback: true,
      };
    } catch (fallbackErr) {
      logger.error(`[RAG Strategy] Fallback also failed: ${fallbackErr.message}`);
      throw err; // Throw original error
    }
  }
}
