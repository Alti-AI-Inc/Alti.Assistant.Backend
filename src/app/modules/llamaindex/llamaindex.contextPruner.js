import DocumentMetadata from './llamaindex.metadata.model.js';
import { relationshipGraphService } from './llamaindex.relationshipGraph.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';

/**
 * A set of common English stopwords used to filter out noise during Jaccard similarity computation.
 * This helps in focusing on meaningful keywords for relevance scoring.
 * @constant
 * @type {Set<string>}
 */
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'cant', 'cannot', 'could',
  'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here',
  'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in',
  'into', 'is', 'isnt', 'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor',
  'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than', 'that',
  'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they', 'theyd',
  'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
  'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres',
  'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd',
  'youll', 'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves'
]);

/**
 * Global system-wide configuration for the context pruner.
 * These settings can be managed by a Platform Owner or Super Admin.
 * @type {{minRelevanceThreshold: number, maxContextNodes: number, semanticWeight: number, confidenceWeight: number, bypassPruningForAdmins: boolean}}
 */
let globalConfig = {
  minRelevanceThreshold: 0.25,
  maxContextNodes: 5,
  semanticWeight: 0.7,
  confidenceWeight: 0.3,
  bypassPruningForAdmins: false
};

/**
 * Tokenizes a string into a set of lowercased alphanumeric words, filtering out stopwords and short words.
 * @param {string} text The input string to tokenize.
 * @returns {Set<string>} A set of processed, meaningful tokens.
 */
const getTokens = (text) => {
  if (!text) return new Set();
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s_]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
  return new Set(words);
};

/**
 * Computes the Jaccard Similarity coefficient between two sets of tokens.
 * The score ranges from 0 (no similarity) to 1 (identical sets).
 * @param {Set<string>} setA The first set of tokens.
 * @param {Set<string>} setB The second set of tokens.
 * @returns {number} The Jaccard similarity score.
 */
const computeJaccardSimilarity = (setA, setB) => {
  if (setA.size === 0 || setB.size === 0) return 0;
  
  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount++;
    }
  }
  
  const unionSize = setA.size + setB.size - intersectionCount;
  return unionSize > 0 ? intersectionCount / unionSize : 0;
};

/**
 * Traverses document relationships, evaluates relevance scores using Jaccard similarity and relationship metrics,
 * prunes connections that fall below a relevance threshold, and reranks the most pertinent relationship details
 * to enrich the user's query with a Graph RAG context block.
 *
 * @permission This function supports multi-tenancy and role-based access.
 * - Standard users: Queries are scoped to their own `userId`.
 * - Platform Owners (`isPlatformOwner: true`): Can perform queries across all users, or scope to a specific `userId` or `tenantId`.
 *
 * @async
 * @param {string} query The original user query string.
 * @param {string} userId The ID of the user initiating the query.
 * @param {object} [options={}] Optional parameters for advanced control.
 * @param {boolean} [options.isPlatformOwner=false] - If true, enables platform-wide data access.
 * @param {string} [options.tenantId] - If `isPlatformOwner` is true, scopes the query to a specific tenant.
 * @param {number} [options.customThreshold] - Overrides the global `minRelevanceThreshold`.
 * @param {number} [options.customLimit] - Overrides the global `maxContextNodes`.
 * @returns {Promise<string>} A promise that resolves to the enriched query with a Graph RAG context block, or the original query if no relevant context is found.
 * @throws {ApiError} Throws an ApiError if there's a failure during context processing.
 */
const pruneAndRerank = async (query, userId, options = {}) => {
  try {
    const { isPlatformOwner = false, customThreshold, customLimit, tenantId } = options;
    const queryLower = query.toLowerCase();
    const queryTokens = getTokens(query);

    // Platform Owner global oversight: can query across all tenants/users or filter specifically
    let queryCriteria = {};
    if (isPlatformOwner) {
      if (tenantId) {
        queryCriteria = { tenantId };
      } else if (userId) {
        queryCriteria = { userId };
      } else {
        // Global oversight: fetch all metadata across the platform
        queryCriteria = {};
      }
      // GCP-compatible structured log
      logger.info({
        message: '[Platform Owner Oversight] ContextPruner executing query.',
        component: 'ContextPruner',
        operation: 'pruneAndRerank',
        criteria: queryCriteria
      });
    } else {
      queryCriteria = { userId };
    }

    // 1. Fetch document metadata profiles
    // OPTIMIZATION: Added projection to fetch only required fields and reduce memory footprint.
    // INDEX RECOMMENDATION: Ensure compound or single indexes exist on { userId: 1 } and { tenantId: 1 } in DocumentMetadata.
    const metadataList = await DocumentMetadata.find(queryCriteria)
      .select('fileName topics entities docId userId summary')
      .lean();

    if (metadataList.length < 2) {
      return query; // Not enough files to resolve graph relationships
    }

    // 2. Identify target matching documents based on key terms
    // OPTIMIZATION: Build a Map of docId -> metadata in the same single-pass loop to avoid O(N) lookups later.
    const metadataMap = new Map();
    const matchingDocIds = [];
    for (const meta of metadataList) {
      metadataMap.set(meta.docId, meta);

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

    // Resolve target userId for graph traversal
    const targetUserId = queryCriteria.userId || (metadataList[0] && metadataList[0].userId) || userId;

    // 3. Traverse the relationship graph from matching files
    const traversal = await relationshipGraphService.traverseGraph(targetUserId, matchingDocIds, 1);
    const connectedEdges = traversal.edges || [];

    if (connectedEdges.length === 0) {
      return query; // No relational links to inject
    }

    // Resolve thresholds and limits (Platform Owner can override or bypass)
    const effectiveThreshold = customThreshold !== undefined ? customThreshold : 
      (isPlatformOwner && globalConfig.bypassPruningForAdmins ? 0.0 : globalConfig.minRelevanceThreshold);
    const effectiveLimit = customLimit ?? globalConfig.maxContextNodes;

    // 4. Calculate semantic coherence, prune low relevance, and rerank
    const scoredLinks = [];
    const visitedTargetIds = new Set();

    for (const edge of connectedEdges) {
      if (visitedTargetIds.has(edge.targetDocId)) continue;
      visitedTargetIds.add(edge.targetDocId);

      // OPTIMIZATION: O(1) Map lookup instead of O(N) array find inside the loop.
      const targetMeta = metadataMap.get(edge.targetDocId);
      if (!targetMeta) continue;

      // Extract tokens from the target document summary, topics, entities, and name
      const targetText = `${targetMeta.fileName || ''} ${(targetMeta.topics || []).join(' ')} ${(targetMeta.entities || []).join(' ')} ${targetMeta.summary || ''}`;
      const targetTokens = getTokens(targetText);

      // Compute semantic Jaccard similarity score
      const jaccardScore = computeJaccardSimilarity(queryTokens, targetTokens);

      // Relationship confidence weight, using a fallback if not provided by the graph service
      const edgeConfidence = edge.confidence ?? 0.5;

      // Compound relevance score: semantic weight + link traversal confidence weight
      const relevanceScore = (jaccardScore * globalConfig.semanticWeight) + (edgeConfidence * globalConfig.confidenceWeight);

      // GCP-compatible structured log
      logger.info({
        message: `Graph RAG Coherence computed for "${targetMeta.fileName}"`,
        component: 'ContextPruner',
        operation: 'pruneAndRerank',
        fileName: targetMeta.fileName,
        relevanceScore: parseFloat(relevanceScore.toFixed(3)),
        jaccardScore: parseFloat(jaccardScore.toFixed(3)),
        linkConfidence: parseFloat(edgeConfidence.toFixed(3))
      });

      // Coherence boundary filter
      if (relevanceScore >= effectiveThreshold) {
        scoredLinks.push({
          targetMeta,
          edge,
          relevanceScore,
          edgeConfidence // Store the resolved confidence for consistent output
        });
      }
    }

    if (scoredLinks.length === 0) {
      return query; // All connections pruned
    }

    // Sort links by relevance score descending
    scoredLinks.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Limit context expansion to prevent token bloat
    const topScoredLinks = scoredLinks.slice(0, effectiveLimit);

    // Build the enriched, reranked Graph RAG context block
    const relationshipContextParts = topScoredLinks.map(link => {
      const { targetMeta, edge, relevanceScore, edgeConfidence } = link; // Use edgeConfidence for output
      return `- Related File: "${targetMeta.fileName}" (${edge.relationType} link, coherence: ${relevanceScore.toFixed(3)}, confidence: ${edgeConfidence.toFixed(3)}). Topics: ${(targetMeta.topics || []).join(', ')}. Context Summary: ${targetMeta.summary || ''}`;
    });

    // GCP-compatible structured log
    logger.info({
      message: 'ContextPruner finished processing context links.',
      component: 'ContextPruner',
      operation: 'pruneAndRerank',
      injectedLinks: relationshipContextParts.length,
      prunedConnections: scoredLinks.length - relationshipContextParts.length,
      totalConnectionsConsidered: scoredLinks.length
    });

    const enrichedQuery = `[Graph RAG Cross-Document Knowledge Map]:
You have access to interconnected document contexts. When answering, resolve relationships between these related items:
${relationshipContextParts.join('\n')}

User Query:
${query}`;

    return enrichedQuery;
  } catch (err) {
    // GCP-compatible structured error log
    logger.error({
      message: 'ContextPruner pruneAndRerank failed',
      component: 'ContextPruner',
      operation: 'pruneAndRerank',
      // Including error details and stack trace for better debugging in Cloud Logging
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name
      }
    });
    // PATCH: Instead of returning the original query (silent failure), throw a normalized ApiError.
    // This makes the failure explicit to the calling service/controller, allowing for better upstream error handling.
    throw new ApiError(500, 'Failed to process and enrich query context.', err.stack || err.toString());
  }
};

/**
 * Retrieves the current global configuration settings for the context pruner.
 * @permission Requires Platform Owner or Super Admin role.
 * @returns {object} A copy of the global configuration object.
 */
const getGlobalConfig = () => {
  return { ...globalConfig };
};

/**
 * Updates the global configuration settings for the context pruner.
 * @permission Requires Platform Owner or Super Admin role.
 * @param {object} newConfig An object containing the configuration keys and values to update.
 * @returns {object} The new, updated global configuration object.
 */
const updateGlobalConfig = (newConfig) => {
  globalConfig = { ...globalConfig, ...newConfig };
  // GCP-compatible structured log
  logger.info({
    message: 'ContextPruner global configuration updated by Platform Owner.',
    component: 'ContextPruner',
    operation: 'updateGlobalConfig',
    newConfig: globalConfig
  });
  return globalConfig;
};

/**
 * Retrieves global statistics, including total metadata count and unique user count.
 * @permission Requires Platform Owner or Super Admin role.
 * @async
 * @returns {Promise<{totalMetadataCount: number, uniqueUsersCount: number, globalConfig: object}>} A promise that resolves to an object containing global statistics.
 * @throws {ApiError} Throws an ApiError if fetching statistics from the database fails.
 */
const getGlobalStats = async () => {
  try {
    // OPTIMIZATION: Use a single aggregation pipeline with $facet to compute multiple stats in one DB trip.
    // This is more efficient than running two separate queries (countDocuments and distinct).
    // The $group stage for uniqueUsers is more memory-efficient on the DB side than .distinct(), which
    // can cause performance issues by loading all distinct values into the application's memory.
    // INDEX RECOMMENDATION: An index on { userId: 1 } is still crucial for the $group stage performance.
    const statsResult = await DocumentMetadata.aggregate([
      {
        $facet: {
          totalMetadata: [{ $count: 'count' }],
          uniqueUsers: [{ $group: { _id: '$userId' } }, { $count: 'count' }]
        }
      }
    ]);

    const totalMetadataCount = statsResult[0]?.totalMetadata[0]?.count || 0;
    const uniqueUsersCount = statsResult[0]?.uniqueUsers[0]?.count || 0;

    return {
      totalMetadataCount,
      uniqueUsersCount,
      globalConfig: { ...globalConfig }
    };
  } catch (err) {
    // GCP-compatible structured error log
    logger.error({
      message: 'ContextPruner getGlobalStats failed',
      component: 'ContextPruner',
      operation: 'getGlobalStats',
      // Including error details and stack trace for better debugging in Cloud Logging
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name
      }
    });
    // PATCH: Re-throw a normalized ApiError instead of the raw database error.
    // This prevents leaking internal implementation details to the user-facing error handler.
    throw new ApiError(500, 'Failed to retrieve global statistics.', err.stack || err.toString());
  }
};

/**
 * Service for enriching user queries with relevant, cross-document context using a Graph RAG approach.
 * It prunes, scores, and reranks document relationships to provide the most coherent context.
 * Also provides administrative functions for configuration and monitoring.
 * @namespace contextPrunerService
 */
export const contextPrunerService = {
  pruneAndRerank,
  getGlobalConfig,
  updateGlobalConfig,
  getGlobalStats
};