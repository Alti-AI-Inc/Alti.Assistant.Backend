import { workflowEvent } from '@llamaindex/workflow-core';
// INTEGRATION FIX: Import Zod for schema validation. This is crucial for defining event contracts.
import { z } from 'zod';

// INTEGRATION FIX: Added Zod schemas to all event definitions.
// REASON: The original event definitions lacked payload contracts. This is a critical integration vulnerability
// in an event-driven system, as it fails to enforce the propagation of essential security and tenancy
// context (userId, workspaceId, organizationId). Without these schemas, downstream services could
// process events without proper authorization or tenant isolation. These schemas ensure that any
// event producer *must* provide the required context, and any consumer can rely on its presence,
// fulfilling the requirement for robust role validation and tenant boundary respect.

/**
 * @constant
 * @type {z.ZodObject}
 * @description A base schema to ensure all user-initiated events carry essential security and tenancy context.
 *   This allows for consistent authorization checks and resource tracking throughout the workflow.
 */
const UserContextSchema = z.object({
  userId: z.string().uuid({ message: "User ID must be a valid UUID." }),
  workspaceId: z.string().uuid({ message: "Workspace ID must be a valid UUID." }),
  organizationId: z.string().uuid({ message: "Organization ID must be a valid UUID." }),
  // A correlation ID is crucial for tracing a request through the entire event-driven workflow.
  correlationId: z.string().uuid({ message: "Correlation ID must be a valid UUID." }),
});


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
export const IngestionStartEvent = workflowEvent({
  debugLabel: 'IngestionStartEvent',
  schema: UserContextSchema.extend({
    filePaths: z.array(z.string()).min(1, { message: "At least one file path is required for ingestion." }),
    config: z.record(z.any()).optional(),
  }),
});

/**
 * @constant
 * @type {object}
 * @description Emitted when raw files have been successfully loaded and parsed into structured LlamaIndex Documents.
 *   This event signifies the completion of the initial data loading and parsing phase,
 *   indicating that raw input has been transformed into a usable document format.
 */
export const DocumentLoadedEvent = workflowEvent({
  debugLabel: 'DocumentLoadedEvent',
  schema: UserContextSchema.extend({
    // NOTE: Using z.any() for LlamaIndex objects for flexibility. A more specific schema could be used for stricter validation.
    documents: z.array(z.any()),
    fileCount: z.number().int().positive(),
  }),
});

/**
 * @constant
 * @type {object}
 * @description Emitted after Document chunks have been parsed, split, and metadata-enriched into LlamaIndex Nodes.
 *   This event marks the stage where documents are broken down into smaller, semantically meaningful
 *   units (nodes) and augmented with relevant metadata for indexing.
 */
export const NodesGeneratedEvent = workflowEvent({
  debugLabel: 'NodesGeneratedEvent',
  schema: UserContextSchema.extend({
    nodes: z.array(z.any()),
    nodeCount: z.number().int().positive(),
  }),
});

/**
 * @constant
 * @type {object}
 * @description Emitted when the triple-index (Vector, Summary, Keyword) has been successfully compiled and saved.
 *   This event indicates that all necessary indexes for efficient retrieval (vector embeddings,
 *   summaries, and keywords) have been built and persisted, making the data queryable.
 */
export const IndexBuiltEvent = workflowEvent({
  debugLabel: 'IndexBuiltEvent',
  schema: UserContextSchema.extend({
    indexId: z.string(),
    indexType: z.enum(['vector', 'summary', 'keyword', 'triple']),
  }),
});

/**
 * @constant
 * @type {object}
 * @description Signals the complete end of the ingestion pipeline, carrying final statistics and status.
 *   This event is the final notification of the ingestion process, providing an overview
 *   of its outcome, including any relevant metrics or completion status.
 */
export const IngestionCompleteEvent = workflowEvent({
  debugLabel: 'IngestionCompleteEvent',
  schema: UserContextSchema.extend({
    status: z.enum(['SUCCESS', 'FAILURE', 'PARTIAL_SUCCESS']),
    message: z.string(),
    statistics: z.object({
      fileCount: z.number().int(),
      documentCount: z.number().int(),
      nodeCount: z.number().int(),
      durationMs: z.number(),
    }),
  }),
});


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
export const SearchStartEvent = workflowEvent({
  debugLabel: 'SearchStartEvent',
  schema: UserContextSchema.extend({
    query: z.string().min(1, { message: "Query cannot be empty." }),
    conversationId: z.string().uuid().optional(),
    config: z.record(z.any()).optional(),
  }),
});

/**
 * @constant
 * @type {object}
 * @description Emitted when the query successfully hits our Semantic Response Cache.
 *   This event indicates that a previously computed answer for the exact query was found
 *   in the cache, allowing for a faster response without re-computation.
 */
export const CacheHitEvent = workflowEvent({
  debugLabel: 'CacheHitEvent',
  schema: UserContextSchema.extend({
    query: z.string(),
    // NOTE: The cached response payload should ideally match the SearchCompleteEvent finalResponse schema.
    cachedResponse: z.any(),
  }),
});

/**
 * @constant
 * @type {object}
 * @description Emitted when the Router Query Engine selects an optimal index route (vector, summary, keyword) for the query.
 *   This event signifies that the system has determined the most appropriate retrieval strategy
 *   or index type to use based on the nature of the user's query.
 */
export const RouteSelectedEvent = workflowEvent({
  debugLabel: 'RouteSelectedEvent',
  schema: UserContextSchema.extend({
    query: z.string(),
    selectedRoute: z.enum(['vector', 'summary', 'keyword', 'unknown']),
    reasoning: z.string().optional(),
  }),
});

/**
 * @constant
 * @type {object}
 * @description Emitted when candidate context nodes have been retrieved and post-processed from the indexes.
 *   This event indicates that relevant pieces of information (context nodes) have been
 *   fetched from the underlying data stores and prepared for synthesis.
 */
export const ContextRetrievedEvent = workflowEvent({
  debugLabel: 'ContextRetrievedEvent',
  schema: UserContextSchema.extend({
    contextNodes: z.array(z.any()),
  }),
});

/**
 * @constant
 * @type {object}
 * @description Emitted when the Large Language Model (LLM) synthesis compiles the citation-backed answer.
 *   This event marks the stage where the LLM has generated a coherent response,
 *   integrating the retrieved context and providing citations for verifiability.
 */
export const ResponseSynthesizedEvent = workflowEvent({
  debugLabel: 'ResponseSynthesizedEvent',
  schema: UserContextSchema.extend({
    synthesizedResponse: z.string(),
    sourceNodes: z.array(z.any()),
  }),
});

/**
 * @constant
 * @type {object}
 * @description Signals the absolute completion of the search execution with the final response payload and citations.
 *   This event is the ultimate notification of the search process, delivering the complete
 *   answer, including the generated text and all supporting citations.
 */
export const SearchCompleteEvent = workflowEvent({
  debugLabel: 'SearchCompleteEvent',
  schema: UserContextSchema.extend({
    status: z.enum(['SUCCESS', 'FAILURE']),
    finalResponse: z.object({
      answer: z.string(),
      citations: z.array(z.object({
        documentId: z.string(),
        fileName: z.string().optional(),
        pageNumber: z.number().optional(),
        text: z.string(),
      })),
    }),
    // INTEGRATION FIX: Added detailed statistics for usage tracking and propagation to managers/admins.
    statistics: z.object({
      cacheHit: z.boolean(),
      durationMs: z.number(),
      llmTokenUsage: z.object({
        promptTokens: z.number().int(),
        completionTokens: z.number().int(),
        totalTokens: z.number().int(),
      }).optional(),
    }),
  }),
});