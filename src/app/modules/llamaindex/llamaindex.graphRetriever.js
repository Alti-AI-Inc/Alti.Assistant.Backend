import DocumentMetadata from './llamaindex.metadata.model.js';
import { relationshipGraphService } from './llamaindex.relationshipGraph.js';
import { logger } from '../../../shared/logger.js';

/**
 * Graph RAG query context resolver.
 * Parses query terms, traverses the semantic document relationship graph,
 * and enriches the search query with cross-document connection schemas.
 * Supports Platform Owner overrides, global oversight, and tenant-level controls.
 *
 * @param {string} query - The original user query string.
 * @param {string} userId - The ID of the user for whom to retrieve document metadata.
 * @param {object} [options] - Optional configuration and admin override parameters.
 * @param {boolean} [options.isPlatformOwner] - Flag indicating if the requester is a Platform Owner.
 * @param {string} [options.tenantId] - Target tenant ID for global oversight queries.
 * @param {boolean} [options.globalOversight] - Flag to allow system-wide global document traversal.
 * @param {boolean} [options.bypassLimits] - Flag to bypass minimum document limits and constraints.
 * @param {boolean} [options.isTenantSuspended] - Flag indicating if the target tenant is suspended.
 * @param {number} [options.overrideDepth] - Custom graph traversal depth override.
 * @returns {Promise<string>} A promise that resolves to the original query string or a new query string
 *   enriched with cross-document relationship context.
 */
const getGraphEnrichedQueryContext = async (query, userId, options = {}) => {
  try {
    const {
      isPlatformOwner = false,
      tenantId = null,
      globalOversight = false,
      bypassLimits = false,
      isTenantSuspended = false,
      overrideDepth = null
    } = options;

    // 1. Tenant Suspension & Platform Owner Override Check
    if (isTenantSuspended) {
      if (!isPlatformOwner) {
        logger.warn(`GraphRetriever: Access blocked for suspended tenant. User: ${userId}`);
        return query; // Graceful fallback to original query under suspension
      }
      logger.info(`[GLOBAL ADMIN] GraphRetriever: Platform Owner overriding suspension for tenant: ${tenantId || 'unknown'}`);
    }

    const queryLower = query.toLowerCase();

    // 2. Global Oversight: Determine query filter based on admin privileges
    let queryFilter = { userId };
    if (isPlatformOwner) {
      if (tenantId) {
        queryFilter = { tenantId };
      } else if (globalOversight) {
        queryFilter = {}; // System-wide global oversight
        logger.info('[GLOBAL ADMIN] GraphRetriever: Performing system-wide global document metadata query');
      }
    }

    // 3. Fetch document metadata profiles
    const metadataList = await DocumentMetadata.find(queryFilter).lean();
    
    // Platform Owner can bypass the minimum document limit (normally 2)
    const minDocsRequired = (isPlatformOwner && bypassLimits) ? 1 : 2;
    if (metadataList.length < minDocsRequired) {
      return query; // Not enough files to resolve graph relationships
    }

    // 4. Identify target files that match query terms
    const matchingDocIds = [];
    for (const meta of metadataList) {
      const fileNameMatch = meta.fileName && meta.fileName.toLowerCase().split('.')[0].split('_').some(part => part.length > 2 && queryLower.includes(part));
      const topicsMatch = meta.topics && meta.topics.some(t => queryLower.includes(t.toLowerCase()));
      const entitiesMatch = meta.entities && meta.entities.some(e => queryLower.includes(e.toLowerCase()));

      if (fileNameMatch || topicsMatch || entitiesMatch) {
        matchingDocIds.push(meta.docId);
      }
    }

    if (matchingDocIds.length === 0) {
      // Fallback: use top 2 files if no exact keyword match
      matchingDocIds.push(metadataList[0].docId);
      if (metadataList[1]) matchingDocIds.push(metadataList[1].docId);
    }

    // 5. Traverse the relationship graph from starting documents
    const traversalDepth = overrideDepth !== null ? overrideDepth : 1;
    const traversalUserId = (isPlatformOwner && !userId) ? 'SYSTEM_GLOBAL' : userId;
    
    const traversal = await relationshipGraphService.traverseGraph(traversalUserId, matchingDocIds, traversalDepth);
    const connectedEdges = traversal.edges || [];

    if (connectedEdges.length === 0) {
      return query; // No relational links to inject
    }

    // 6. Construct high-fidelity Graph RAG context injection
    const relationshipContextParts = [];
    const visitedTargetIds = new Set();

    for (const edge of connectedEdges) {
      if (visitedTargetIds.has(edge.targetDocId)) continue;
      visitedTargetIds.add(edge.targetDocId);

      const targetMeta = metadataList.find(m => m.docId === edge.targetDocId);
      if (targetMeta) {
        relationshipContextParts.push(
          `- Related File: "${targetMeta.fileName}" (${edge.relationType} link, confidence: ${edge.confidence}). Topics: ${(targetMeta.topics || []).join(', ')}. Context Summary: ${targetMeta.summary || ''}`
        );
      }
    }

    if (relationshipContextParts.length > 0) {
      if (isPlatformOwner) {
        logger.info(`[GLOBAL ADMIN] GraphRetriever: Platform Owner enriched query with ${relationshipContextParts.length} relational document links. Tenant: ${tenantId || 'all'}`);
      } else {
        logger.info(`GraphRetriever: enriched query with ${relationshipContextParts.length} relational document links`);
      }

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

/**
 * Service object for graph-based document retrieval and query enrichment.
 * Provides methods to leverage a semantic relationship graph for enhancing RAG queries.
 * @typedef {object} GraphRetrieverService
 * @property {function(string, string, object=): Promise<string>} getGraphEnrichedQueryContext - Function to enrich a user query with cross-document relationship context.
 */
export const graphRetrieverService = {
  getGraphEnrichedQueryContext,
};