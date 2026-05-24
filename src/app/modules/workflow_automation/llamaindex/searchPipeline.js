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
import { existsSync } from 'node:fs';

// Construct the custom event-driven search workflow
const searchWorkflow = createWorkflow();

/**
 * Step 1: Query Reception & Semantic Cache Lookup
 * Triggers on: SearchStartEvent
 * Emits: CacheHitEvent (if cached) OR RouteSelectedEvent (if cache miss)
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
 * Triggers on: CacheHitEvent
 * Emits: SearchCompleteEvent (direct completion return)
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
 * Triggers on: RouteSelectedEvent
 * Emits: ContextRetrievedEvent
 */
searchWorkflow.handle([RouteSelectedEvent], async (context, event) => {
  const { query, userId, route } = event.data;
  logger.info(`[Event Search] Step 2: Retrieving context from ${route} index store...`);

  const persistDir = path.resolve(`storage/ragsystem/${userId}`);
  const indexMetaPath = path.join(persistDir, 'index_store.json');

  if (!existsSync(indexMetaPath)) {
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
 * Triggers on: ContextRetrievedEvent
 * Emits: SearchCompleteEvent (final stop return)
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
 * Run the Search RAG Workflow asynchronously
 * @param {string} query - User question
 * @param {string} userId - User identifier
 * @returns {Promise<object>} The final citation-backed response report
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
