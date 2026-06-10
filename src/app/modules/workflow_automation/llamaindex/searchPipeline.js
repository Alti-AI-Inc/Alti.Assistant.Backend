import { createWorkflow } from '@llamaindex/workflow-core';
import {
  SearchStartEvent,
  CacheHitEvent,
  RouteSelectedEvent,
  ContextRetrievedEvent,
  ResponseSynthesizedEvent,
  SearchCompleteEvent
} from './events.js';
import {
  similarity,
  VectorStoreIndex,
  storageContextFromDefaults,
  SimilarityPostprocessor,
  MetadataReplacementPostProcessor,
  getResponseSynthesizer
} from 'llamaindex';
import {
  ensureUserLocalDirSynced,
  semanticCache
} from '../../llamaindex/llamaindex.indexer.js';
import { logger } from '../../../../shared/logger.js';
import path from 'path';
// PERF: Switched from synchronous 'existsSync' to asynchronous 'fs.promises' to prevent blocking the event loop.
import { promises as fs } from 'node:fs';

/**
 * @typedef {object} SearchCompleteEventData
 * @property {boolean} success - Indicates if the search was successful.
 * @property {string} query - The original search query.
 * @property {string} userId - The ID of the user who initiated the search.
 * @property {string} content - The synthesized response content.
 * @property {Array<object>} sources - An array of source documents or snippets used for synthesis.
 * @property {string} sources[].fileName - The name of the source file.
 * @property {string} sources[].fileType - The type of the source file (e.g., 'pdf', 'txt').
 * @property {number | null} sources[].pageNumber - The page number within the document, if applicable.
 * @property {number | null} sources[].score - The similarity score of the node to the query.
 * @property {string} sources[].snippet - A short snippet from the source node.
 * @property {boolean} cacheHit - True if the response was retrieved from the semantic cache.
 * @property {string} [cacheSimilarity] - The similarity score of the cache hit, if applicable.
 */

/**
 * @typedef {object} CacheHitEventData
 * @property {string} query - The original search query.
 * @property {string} userId - The ID of the user who initiated the search.
 * @property {object} response - The cached response object.
 * @property {string} response.content - The cached response content.
 * @property {Array<object>} response.sources - The cached source information.
 * @property {string} [response._cacheSimilarity] - The similarity score of the cache hit.
 */

/**
 * @typedef {object} RouteSelectedEventData
 * @property {string} query - The original search query.
 * @property {string} userId - The ID of the user who initiated the search.
 * @property {string} route - The selected search route (e.g., 'vector').
 */

/**
 * @typedef {object} ContextRetrievedEventData
 * @property {string} query - The original search query.
 * @property {string} userId - The ID of the user who initiated the search.
 * @property {Array<import('llamaindex').NodeWithScore>} nodes - An array of retrieved and post-processed nodes.
 */

/**
 * The core event-driven search workflow for RAG (Retrieval Augmented Generation).
 * This workflow orchestrates the steps from query reception to response synthesis,
 * incorporating semantic caching and vector store retrieval.
 * @type {import('@llamaindex/workflow-core').Workflow}
 */
const searchWorkflow = createWorkflow();

/**
 * Step 1: Query Reception & Semantic Cache Lookup
 * This handler processes incoming search requests, attempts to find a response in the semantic cache,
 * and if not found, prepares for vector store retrieval.
 *
 * @param {import('@llamaindex/workflow-core').WorkflowContext} context - The workflow context for sending events.
 * @param {SearchStartEvent} event - The event that triggered this handler.
 * @param {string} event.data.query - The user's search query.
 * @param {string} event.data.userId - The ID of the user initiating the search.
 * @emits {CacheHitEvent} If a cached response is found, bypassing further LLM execution.
 * @emits {RouteSelectedEvent} If no cached response is found, indicating the next step for retrieval.
 */
searchWorkflow.handle([SearchStartEvent], async (context, event) => {
  const { query, userId } = event.data;
  logger.info(`[Event Search] Step 1: Starting query RAG for user: ${userId}, query: "${query}"`);

  // Try semantic cache lookup
  const cached = await semanticCache.get(query, userId);
  if (cached) {
    logger.info(`[Event Search] Semantic cache HIT for query: "${query}"`);
    context.sendEvent(CacheHitEvent.with({
      query,
      userId,
      response: cached
    }));
    return;
  }

  logger.info(`[Event Search] Cache miss. Continuing to query routing...`);
  await ensureUserLocalDirSynced(userId);

  // Decide search route (defaulting to vector store route for premium factual synthesis)
  context.sendEvent(RouteSelectedEvent.with({
    query,
    userId,
    route: 'vector'
  }));
});

/**
 * Step 2: Semantic Cache Fast-Track Completion
 * This handler is triggered when a semantic cache hit occurs, allowing for immediate completion
 * of the search workflow without engaging the LLM or retrieval steps.
 *
 * @param {import('@llamaindex/workflow-core').WorkflowContext} context - The workflow context (not used for sending events in this step).
 * @param {CacheHitEvent} event - The event indicating a cache hit.
 * @param {string} event.data.query - The original search query.
 * @param {string} event.data.userId - The ID of the user.
 * @param {object} event.data.response - The cached response object.
 * @returns {SearchCompleteEvent} An event signaling the successful completion of the search with cached data.
 */
searchWorkflow.handle([CacheHitEvent], async (context, event) => {
  const { query, userId, response } = event.data;
  logger.info(`[Event Search] Bypassing LLM execution due to cached response`);
  
  return SearchCompleteEvent.with({
    success: true,
    query,
    userId,
    content: response.content,
    sources: response.sources,
    cacheHit: true,
    cacheSimilarity: response._cacheSimilarity || '1.0000'
  });
});

/**
 * Step 3: Index Retrieval & Sentence Window Context Retrieval
 * This handler is responsible for loading the user's vector index, retrieving relevant nodes
 * based on the query, and applying post-processing for context enrichment.
 *
 * @param {import('@llamaindex/workflow-core').WorkflowContext} context - The workflow context for sending events.
 * @param {RouteSelectedEvent} event - The event indicating that a search route has been selected.
 * @param {string} event.data.query - The user's search query.
 * @param {string} event.data.userId - The ID of the user.
 * @param {string} event.data.route - The selected retrieval route (expected to be 'vector').
 * @emits {ContextRetrievedEvent} An event containing the retrieved and processed context nodes.
 * @throws {Error} If no index store exists for the given user.
 */
searchWorkflow.handle([RouteSelectedEvent], async (context, event) => {
  const { query, userId, route } = event.data;
  logger.info(`[Event Search] Step 2: Retrieving context from ${route} index store...`);

  const persistDir = path.resolve(`storage/ragsystem/${userId}`);
  const indexMetaPath = path.join(persistDir, 'index_store.json');

  // PERF: Use asynchronous file system check to avoid blocking the event loop.
  // The synchronous 'existsSync' can pause the entire server under load, while this async
  // version allows Node.js to handle other requests while waiting for the file system.
  try {
    await fs.access(indexMetaPath);
  } catch (error) {
    // The file doesn't exist or is not accessible.
    throw new Error(`No index store exists for user ${userId}. Please upload documents first.`);
  }

  // Load index from storage
  const storageContext = await storageContextFromDefaults({ persistDir });
  const vectorIndex = await VectorStoreIndex.init({ storageContext });

  // Instantiate the vector retriever
  const retriever = vectorIndex.asRetriever({
    similarityTopK: 8
  });

  // Fetch raw matching nodes
  const rawNodes = await retriever.retrieve({ query });
  logger.info(`[Event Search] Retrieved ${rawNodes.length} raw nodes from Vector Index`);

  // Postprocess nodes: Apply Similarity Cutoff + SentenceWindow Context Enrichment
  const similarityProcessor = new SimilarityPostprocessor({ similarityCutoff: 0.30 });
  const windowProcessor = new MetadataReplacementPostProcessor({ targetMetadataKey: '_window' });

  let nodes = await similarityProcessor.postprocessNodes(rawNodes, { query });
  nodes = await windowProcessor.postprocessNodes(nodes, { query });

  logger.info(`[Event Search] Post-processed context nodes: ${nodes.length} nodes survived filtering.`);

  context.sendEvent(ContextRetrievedEvent.with({
    query,
    userId,
    nodes
  }));
});

/**
 * Step 4: Citation-Backed Response Synthesis & Cache Saving
 * This handler synthesizes a final response using the retrieved context nodes,
 * formats the sources for citation, and persists the response to the semantic cache.
 *
 * @param {import('@llamaindex/workflow-core').WorkflowContext} context - The workflow context (not used for sending events in this step).
 * @param {ContextRetrievedEvent} event - The event containing the retrieved context nodes.
 * @param {string} event.data.query - The original search query.
 * @param {string} event.data.userId - The ID of the user.
 * @param {Array<import('llamaindex').NodeWithScore>} event.data.nodes - The array of context nodes to use for synthesis.
 * @returns {SearchCompleteEvent} An event signaling the successful completion of the search with the synthesized response.
 */
searchWorkflow.handle([ContextRetrievedEvent], async (context, event) => {
  const { query, userId, nodes } = event.data;
  logger.info(`[Event Search] Step 3: Synthesizing final response with citation formatting...`);

  if (!nodes || nodes.length === 0) {
    logger.warn('[Event Search] No context nodes available for synthesis.');
    const responsePayload = {
      content: "I couldn't find any relevant information in your indexed documents to answer this question. Please upload additional context.",
      sources: []
    };
    return SearchCompleteEvent.with({
      success: true,
      query,
      userId,
      content: responsePayload.content,
      sources: [],
      cacheHit: false
    });
  }

  // Use LlamaIndex's TreeSummarize response synthesizer for citation-backed aggregation
  const synthesizer = getResponseSynthesizer('tree_summarize');
  
  // Synthesize answer
  const response = await synthesizer.synthesize({
    query,
    nodes
  });

  const responseText = response.response || '';
  
  // Format sources cleanly (extract file names, pages, and citation snippet hashes)
  const sources = nodes.map(nodeWithScore => {
    const node = nodeWithScore.node;
    return {
      fileName: node.metadata?.fileName || 'unknown_document',
      fileType: node.metadata?.fileType || 'txt',
      pageNumber: node.metadata?.pageNumber || null,
      score: nodeWithScore.score || null,
      snippet: node.text?.substring(0, 150) + '...'
    };
  });

  const finalResponse = {
    content: responseText,
    sources
  };

  // Persist response into Semantic Response Cache for future hits
  await semanticCache.set(query, userId, finalResponse);
  logger.info(`[Event Search] Saved synthesized response to Semantic Cache.`);

  return SearchCompleteEvent.with({
    success: true,
    query,
    userId,
    content: responseText,
    sources,
    cacheHit: false
  });
});

/**
 * Runs the Search RAG Workflow asynchronously.
 * This function initiates the event-driven search workflow and waits for its completion,
 * returning the final synthesized response.
 *
 * @param {string} query - The user's question or search query.
 * @param {string} userId - The unique identifier for the user, used for accessing their specific RAG storage.
 * @returns {Promise<SearchCompleteEventData>} A promise that resolves to the final citation-backed response report.
 * @throws {Error} If a critical workflow execution failure occurs, such as a missing index store.
 */
export async function runSearchWorkflow(query, userId) {
  try {
    const context = searchWorkflow.createContext();
    
    // Broadcast start event
    context.sendEvent(SearchStartEvent.with({
      query,
      userId
    }));

    // Wait until stop event is fired
    const finalEvent = await context.stream.untilEvent(SearchCompleteEvent);
    return finalEvent.data;
  } catch (error) {
    logger.error(`[Event Search] Critical workflow execution failure:`, error);
    throw error;
  }
}