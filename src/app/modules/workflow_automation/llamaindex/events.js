import { workflowEvent } from '@llamaindex/workflow-core';

/**
 * 📥 Event-Driven Ingestion Pipeline Events
 */

// Triggers the ingestion pipeline with local file paths, user identifiers, and configurations
export const IngestionStartEvent = workflowEvent({ debugLabel: 'IngestionStartEvent' });

// Emitted when raw files have been loaded and parsed into structured LlamaIndex Documents
export const DocumentLoadedEvent = workflowEvent({ debugLabel: 'DocumentLoadedEvent' });

// Emitted after Document chunks have been parsed, split, and metadata-enriched (nodes)
export const NodesGeneratedEvent = workflowEvent({ debugLabel: 'NodesGeneratedEvent' });

// Emitted when the triple-index (Vector, Summary, Keyword) has been compiled and saved
export const IndexBuiltEvent = workflowEvent({ debugLabel: 'IndexBuiltEvent' });

// Signals complete end of ingestion pipeline, carrying stats and status
export const IngestionCompleteEvent = workflowEvent({ debugLabel: 'IngestionCompleteEvent' });


/**
 * 🔍 Event-Driven Search & Retrieval Events
 */

// Triggers semantic query retrieval with the user question and conversation parameters
export const SearchStartEvent = workflowEvent({ debugLabel: 'SearchStartEvent' });

// Emitted when the query hits our Semantic Response Cache
export const CacheHitEvent = workflowEvent({ debugLabel: 'CacheHitEvent' });

// Emitted when the Router Query Engine selects an index route (vector, summary, keyword)
export const RouteSelectedEvent = workflowEvent({ debugLabel: 'RouteSelectedEvent' });

// Emitted when candidate context nodes have been retrieved and post-processed
export const ContextRetrievedEvent = workflowEvent({ debugLabel: 'ContextRetrievedEvent' });

// Emitted when LLM synthesis compiles the citation-backed answer
export const ResponseSynthesizedEvent = workflowEvent({ debugLabel: 'ResponseSynthesizedEvent' });

// Signals absolute completion of the search execution with response payload and citations
export const SearchCompleteEvent = workflowEvent({ debugLabel: 'SearchCompleteEvent' });
