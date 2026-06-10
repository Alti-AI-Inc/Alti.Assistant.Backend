import DocumentMetadata from './llamaindex.metadata.model.js';
import { relationshipGraphService } from './llamaindex.relationshipGraph.js';
import { logger } from '../../../shared/logger.js';

/**
 * Graph RAG query context resolver.
 * Parses query terms, traverses the semantic document relationship graph,
 * and enriches the search query with cross-document connection schemas.
 *
 * @param {string} query - The original user query string.
 * @param {string} userId - The ID of the user for whom to retrieve document metadata.
 * @returns {Promise<string>} A promise that resolves to the original query string or a new query string
 *   enriched with cross-document relationship context.
 */
const getGraphEnrichedQueryContext = async (query, userId) => {
  try {
    const queryLower = query.toLowerCase();

    // 1. Fetch user document metadata profiles
    // OPTIMIZATION: Added projection (.select) to retrieve only required fields, reducing memory footprint and network payload.
    // PERFORMANCE NOTE: Ensure there is an index on { userId: 1 } in the DocumentMetadata schema.
    const metadataList = await DocumentMetadata.find({ userId })
      .select('docId fileName topics entities summary')
      .lean();

    if (metadataList.length < 2) {
      return query; // Not enough files to resolve graph relationships
    }

    // 2. Identify target files that match query terms
    // OPTIMIZATION: To avoid O(N*M) complexity (N docs * M keywords per doc) of repeatedly scanning the query string,
    // we first build an inverted index (a map of unique keywords to the documents they appear in).
    // Then, we iterate through the unique keywords (a much smaller set) and check for their presence in the query.
    // This significantly reduces the number of expensive string inclusion checks.
    const keywordToDocIds = new Map();
    const metadataLength = metadataList.length;

    for (let i = 0; i < metadataLength; i++) {
      const meta = metadataList[i];
      const { docId, fileName, topics, entities } = meta;

      // Use a Set to collect unique keywords for the current document.
      const docKeywords = new Set();

      // Extract keywords from filename
      const fName = fileName || '';
      const dotIndex = fName.indexOf('.');
      const baseName = (dotIndex !== -1 ? fName.slice(0, dotIndex) : fName).toLowerCase();
      const fileNameParts = baseName.split('_');
      for (let j = 0; j < fileNameParts.length; j++) {
        const part = fileNameParts[j];
        if (part.length > 2) {
          docKeywords.add(part);
        }
      }

      // Extract keywords from topics
      const metaTopics = topics || [];
      for (let j = 0; j < metaTopics.length; j++) {
        docKeywords.add(metaTopics[j].toLowerCase());
      }

      // Extract keywords from entities
      const metaEntities = entities || [];
      for (let j = 0; j < metaEntities.length; j++) {
        docKeywords.add(metaEntities[j].toLowerCase());
      }
      
      // Populate the main inverted index map from the document's unique keywords.
      for (const keyword of docKeywords) {
        if (!keywordToDocIds.has(keyword)) {
          keywordToDocIds.set(keyword, []);
        }
        keywordToDocIds.get(keyword).push(docId);
      }
    }

    const matchingDocIdsSet = new Set();
    for (const [keyword, docIds] of keywordToDocIds.entries()) {
      if (queryLower.includes(keyword)) {
        for (let i = 0; i < docIds.length; i++) {
          matchingDocIdsSet.add(docIds[i]);
        }
      }
    }
    
    const matchingDocIds = Array.from(matchingDocIdsSet);

    if (matchingDocIds.length === 0) {
      // Fallback: use top 2 files if no exact keyword match
      matchingDocIds.push(metadataList[0].docId);
      if (metadataList[1]) matchingDocIds.push(metadataList[1].docId);
    }

    // 3. Traverse the relationship graph from starting documents
    const traversal = await relationshipGraphService.traverseGraph(userId, matchingDocIds, 1);
    const connectedEdges = traversal.edges || [];

    if (connectedEdges.length === 0) {
      return query; // No relational links to inject
    }

    // 4. Construct high-fidelity Graph RAG context injection
    const relationshipContextParts = [];
    const visitedTargetIds = new Set();

    // OPTIMIZATION: Map-based lookup to avoid O(N * M) nested loop search
    const metadataMap = new Map();
    for (let i = 0; i < metadataLength; i++) {
      metadataMap.set(metadataList[i].docId, metadataList[i]);
    }

    const edgesLength = connectedEdges.length;
    for (let i = 0; i < edgesLength; i++) {
      const edge = connectedEdges[i];
      if (visitedTargetIds.has(edge.targetDocId)) continue;
      visitedTargetIds.add(edge.targetDocId);

      const targetMeta = metadataMap.get(edge.targetDocId);
      if (targetMeta) {
        relationshipContextParts.push(
          `- Related File: "${targetMeta.fileName}" (${edge.relationType} link, confidence: ${edge.confidence}). Topics: ${targetMeta.topics.join(', ')}. Context Summary: ${targetMeta.summary}`
        );
      }
    }

    if (relationshipContextParts.length > 0) {
      // GCP CLOUD LOGGING: Structured JSON log for better filterability and monitoring.
      // The 'severity' key is automatically added by Winston at the 'info' level.
      logger.info({
        message: `GraphRetriever: Enriched query with ${relationshipContextParts.length} relational document links`,
        component: 'GraphRetriever',
        userId,
        linkCount: relationshipContextParts.length,
      });

      // Pre-pend the cross-document knowledge map context
      const enrichedQuery = `[Graph RAG Cross-Document Knowledge Map]:
You have access to interconnected document contexts. When answering, resolve relationships between these related items:
${relationshipContextParts.join('\n')}

User Query:
${query}`;

      return enrichedQuery;
    }

    return query;
  } catch (err) {
    // GCP CLOUD LOGGING: Structured JSON error log with stack trace for GCP Error Reporting.
    // The 'severity' key is automatically added by Winston at the 'error' level.
    logger.error({
      message: 'GraphRetriever: Context resolution failed',
      component: 'GraphRetriever',
      userId,
      query, // Log the query that caused the failure
      error: {
        message: err.message,
        stack: err.stack,
      },
    });
    return query; // Graceful fallback to original query
  }
};

/**
 * Service object for graph-based document retrieval and query enrichment.
 * Provides methods to leverage a semantic relationship graph for enhancing RAG queries.
 * @typedef {object} GraphRetrieverService
 * @property {function(string, string): Promise<string>} getGraphEnrichedQueryContext - Function to enrich a user query with cross-document relationship context.
 */
export const graphRetrieverService = {
  getGraphEnrichedQueryContext,
};