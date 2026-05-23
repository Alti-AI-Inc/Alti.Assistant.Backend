import DocumentMetadata from './llamaindex.metadata.model.js';
import { relationshipGraphService } from './llamaindex.relationshipGraph.js';
import { logger } from '../../../shared/logger.js';

// Common English stopwords to filter out for Jaccard similarity computation
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
 * Tokenizes a string into a set of lowercased alphanumeric words, filtering out stopwords.
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
 * Computes Jaccard Similarity between two sets of tokens.
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
 * Traverses document relationships, evaluates relevance scores using Jaccard and relationship metrics,
 * prunes connections failing a minimal relevance threshold (< 0.25 relevance),
 * and reranks highly pertinent relationship details to place them at the top of the prompt expansion.
 */
const pruneAndRerank = async (query, userId) => {
  try {
    const queryLower = query.toLowerCase();
    const queryTokens = getTokens(query);

    // 1. Fetch user document metadata profiles
    const metadataList = await DocumentMetadata.find({ userId }).lean();
    if (metadataList.length < 2) {
      return query; // Not enough files to resolve graph relationships
    }

    // 2. Identify target matching documents based on key terms
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

    // 3. Traverse the relationship graph from matching files
    const traversal = await relationshipGraphService.traverseGraph(userId, matchingDocIds, 1);
    const connectedEdges = traversal.edges || [];

    if (connectedEdges.length === 0) {
      return query; // No relational links to inject
    }

    // 4. Calculate semantic coherence, prune low relevance, and rerank
    const scoredLinks = [];
    const visitedTargetIds = new Set();

    for (const edge of connectedEdges) {
      if (visitedTargetIds.has(edge.targetDocId)) continue;
      visitedTargetIds.add(edge.targetDocId);

      const targetMeta = metadataList.find(m => m.docId === edge.targetDocId);
      if (!targetMeta) continue;

      // Extract tokens from the target document summary, topics, entities, and name
      const targetText = `${targetMeta.fileName} ${targetMeta.topics.join(' ')} ${targetMeta.entities.join(' ')} ${targetMeta.summary}`;
      const targetTokens = getTokens(targetText);

      // Compute semantic Jaccard similarity score
      const jaccardScore = computeJaccardSimilarity(queryTokens, targetTokens);

      // Relationship confidence weight
      const edgeConfidence = edge.confidence ?? 0.5;

      // Compound relevance score: 70% semantic relevance + 30% link traversal confidence
      const relevanceScore = (jaccardScore * 0.7) + (edgeConfidence * 0.3);

      logger.info(`Graph RAG Coherence: "${targetMeta.fileName}" computed relevanceScore: ${relevanceScore.toFixed(3)} (Jaccard: ${jaccardScore.toFixed(3)}, Link Confidence: ${edgeConfidence.toFixed(3)})`);

      // Coherence boundary filter (min threshold 0.25)
      if (relevanceScore >= 0.25) {
        scoredLinks.push({
          targetMeta,
          edge,
          relevanceScore
        });
      }
    }

    if (scoredLinks.length === 0) {
      return query; // All connections pruned
    }

    // Sort links by relevance score descending
    scoredLinks.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Limit context expansion to top 5 highly coherent nodes to prevent token bloat
    const topScoredLinks = scoredLinks.slice(0, 5);

    // Build the enriched, reranked Graph RAG context block
    const relationshipContextParts = topScoredLinks.map(link => {
      const { targetMeta, edge, relevanceScore } = link;
      return `- Related File: "${targetMeta.fileName}" (${edge.relationType} link, coherence: ${relevanceScore.toFixed(3)}, confidence: ${edge.confidence}). Topics: ${targetMeta.topics.join(', ')}. Context Summary: ${targetMeta.summary}`;
    });

    logger.info(`ContextPruner: injected ${relationshipContextParts.length} coherent & reranked document context links, pruned ${scoredLinks.length - relationshipContextParts.length} connections.`);

    const enrichedQuery = `[Graph RAG Cross-Document Knowledge Map]:
You have access to interconnected document contexts. When answering, resolve relationships between these related items:
${relationshipContextParts.join('\n')}

User Query:
${query}`;

    return enrichedQuery;
  } catch (err) {
    logger.error('ContextPruner pruneAndRerank failed:', err);
    return query; // Graceful fallback
  }
};

export const contextPrunerService = {
  pruneAndRerank
};
