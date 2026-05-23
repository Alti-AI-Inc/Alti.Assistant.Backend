import DocumentMetadata from './llamaindex.metadata.model.js';
import { relationshipGraphService } from './llamaindex.relationshipGraph.js';
import { logger } from '../../../shared/logger.js';

/**
 * Graph RAG query context resolver.
 * Parses query terms, traverses the semantic document relationship graph, 
 * and enriches the search query with cross-document connection schemas.
 */
const getGraphEnrichedQueryContext = async (query, userId) => {
  try {
    const queryLower = query.toLowerCase();

    // 1. Fetch user document metadata profiles
    const metadataList = await DocumentMetadata.find({ userId }).lean();
    if (metadataList.length < 2) {
      return query; // Not enough files to resolve graph relationships
    }

    // 2. Identify target files that match query terms
    const matchingDocIds = [];
    for (const meta of metadataList) {
      const fileNameMatch = meta.fileName.toLowerCase().split('.')[0].split('_').some(part => part.length > 2 && queryLower.includes(part));
      const topicsMatch = meta.topics.some(t => queryLower.includes(t.toLowerCase()));
      const entitiesMatch = meta.entities.some(e => queryLower.includes(e.toLowerCase()));

      if (fileNameMatch || topicsMatch || entitiesMatch) {
        matchingDocIds.push(meta.docId);
      }
    }

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

    for (const edge of connectedEdges) {
      if (visitedTargetIds.has(edge.targetDocId)) continue;
      visitedTargetIds.add(edge.targetDocId);

      const targetMeta = metadataList.find(m => m.docId === edge.targetDocId);
      if (targetMeta) {
        relationshipContextParts.push(
          `- Related File: "${targetMeta.fileName}" (${edge.relationType} link, confidence: ${edge.confidence}). Topics: ${targetMeta.topics.join(', ')}. Context Summary: ${targetMeta.summary}`
        );
      }
    }

    if (relationshipContextParts.length > 0) {
      logger.info(`GraphRetriever: enriched query with ${relationshipContextParts.length} relational document links`);

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
    logger.error('GraphRetriever context resolution failed:', err);
    return query; // Graceful fallback to original query
  }
};

export const graphRetrieverService = {
  getGraphEnrichedQueryContext,
};
