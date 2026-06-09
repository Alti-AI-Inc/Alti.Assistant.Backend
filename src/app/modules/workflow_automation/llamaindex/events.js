import { workflowEvent } from '@llamaindex/workflow-core';

/**
 * 📥 Event-Driven Ingestion Pipeline Events
 */

/**
 * @constant
 * @type {object}
 * @description Triggers the ingestion pipeline with local file paths, user identifiers, and configurations.
 *   This event initiates the data ingestion process, providing the necessary input parameters
 *   for the pipeline to begin loading and processing raw data.
 */
export const IngestionStartEvent = workflowEvent({ debugLabel: 'IngestionStartEvent' });

/**
 * @constant
 * @type {object}
 * @description Emitted when raw files have been successfully loaded and parsed into structured LlamaIndex Documents.
 *   This event signifies the completion of the initial data loading and parsing phase,
 *   indicating that raw input has been transformed into a usable document format.
 */
export const DocumentLoadedEvent = workflowEvent({ debugLabel: 'DocumentLoadedEvent' });

/**
 * @constant
 * @type {object}
 * @description Emitted after Document chunks have been parsed, split, and metadata-enriched into LlamaIndex Nodes.
 *   This event marks the stage where documents are broken down into smaller, semantically meaningful
 *   units (nodes) and augmented with relevant metadata for indexing.
 */
export const NodesGeneratedEvent = workflowEvent({ debugLabel: 'NodesGeneratedEvent' });

/**
 * @constant
 * @type {object}
 * @description Emitted when the triple-index (Vector, Summary, Keyword) has been successfully compiled and saved.
 *   This event indicates that all necessary indexes for efficient retrieval (vector embeddings,
 *   summaries, and keywords) have been built and persisted, making the data queryable.
 */
export const IndexBuiltEvent = workflowEvent({ debugLabel: 'IndexBuiltEvent' });

/**
 * @constant
 * @type {object}
 * @description Signals the complete end of the ingestion pipeline, carrying final statistics and status.
 *   This event is the final notification of the ingestion process, providing an overview
 *   of its outcome, including any relevant metrics or completion status.
 */
export const IngestionCompleteEvent = workflowEvent({ debugLabel: 'IngestionCompleteEvent' });


/**
 * 🔍 Event-Driven Search & Retrieval Events
 */

/**
 * @constant
 * @type {object}
 * @description Triggers semantic query retrieval with the user question and conversation parameters.
 *   This event initiates the search and retrieval process, providing the user's query
 *   and any contextual conversation parameters needed for an effective search.
 */
export const SearchStartEvent = workflowEvent({ debugLabel: 'SearchStartEvent' });

/**
 * @constant
 * @type {object}
 * @description Emitted when the query successfully hits our Semantic Response Cache.
 *   This event indicates that a previously computed answer for the exact query was found
 *   in the cache, allowing for a faster response without re-computation.
 */
export const CacheHitEvent = workflowEvent({ debugLabel: 'CacheHitEvent' });

/**
 * @constant
 * @type {object}
 * @description Emitted when the Router Query Engine selects an optimal index route (vector, summary, keyword) for the query.
 *   This event signifies that the system has determined the most appropriate retrieval strategy
 *   or index type to use based on the nature of the user's query.
 */
export const RouteSelectedEvent = workflowEvent({ debugLabel: 'RouteSelectedEvent' });

/**
 * @constant
 * @type {object}
 * @description Emitted when candidate context nodes have been retrieved and post-processed from the indexes.
 *   This event indicates that relevant pieces of information (context nodes) have been
 *   fetched from the underlying data stores and prepared for synthesis.
 */
export const ContextRetrievedEvent = workflowEvent({ debugLabel: 'ContextRetrievedEvent' });

/**
 * @constant
 * @type {object}
 * @description Emitted when the Large Language Model (LLM) synthesis compiles the citation-backed answer.
 *   This event marks the stage where the LLM has generated a coherent response,
 *   integrating the retrieved context and providing citations for verifiability.
 */
export const ResponseSynthesizedEvent = workflowEvent({ debugLabel: 'ResponseSynthesizedEvent' });

/**
 * @constant
 * @type {object}
 * @description Signals the absolute completion of the search execution with the final response payload and citations.
 *   This event is the ultimate notification of the search process, delivering the complete
 *   answer, including the generated text and all supporting citations.
 */
export const SearchCompleteEvent = workflowEvent({ debugLabel: 'SearchCompleteEvent' });