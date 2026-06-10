import { logger } from '../../../shared/logger.js';
import QueryMemory from './llamaindex.queryMemory.model.js';

/**
 * A set of common English stopwords used to filter out noise words during tokenization.
 * Consistent with contextPruner.js.
 * @type {Set<string>}
 */
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cannot',
  'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'me', 'more', 'most', 'my', 'myself', 'no',
  'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves',
]);

/**
 * Tokenizes a string for Jaccard similarity comparison.
 * Converts text to lowercase, removes non-alphanumeric characters, splits by whitespace,
 * and filters out short words (length <= 2) and common stopwords.
 *
 * @param {string} text - The input text to tokenize.
 * @returns {string[]} An array of filtered tokens.
 */
const tokenize = (text) => {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
};

/**
 * Computes the Jaccard similarity coefficient between two token arrays.
 * Jaccard similarity is calculated as the size of the intersection divided by the size of the union.
 *
 * @param {string[]} tokensA - The first array of tokens.
 * @param {string[]} tokensB - The second array of tokens.
 * @returns {number} The similarity score between 0 and 1.
 */
const jaccardSimilarity = (tokensA, tokensB) => {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
};

/**
 * Records a successful query-answer pair into cross-session memory.
 * Deduplicates queries by checking Jaccard similarity against recent entries.
 *
 * @param {string} userId - The unique identifier of the user.
 * @param {string} query - The user's query.
 * @param {string} answer - The generated answer.
 * @param {string} [engine='vector'] - The engine that produced the answer.
 * @param {number} [confidence=0.0] - Routing confidence score (0 to 1).
 * @returns {Promise<void>} Resolves when the query is recorded or skipped.
 */
const recordQuery = async (userId, query, answer, engine = 'vector', confidence = 0.0) => {
  try {
    // Skip trivially short or failed answers
    if (!answer || answer.length < 30) return;

    const queryTokens = tokenize(query);

    // Deduplicate: don't record nearly identical queries (Jaccard > 0.85)
    const recentEntries = await QueryMemory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('queryTokens')
      .lean();

    for (const entry of recentEntries) {
      const similarity = jaccardSimilarity(queryTokens, entry.queryTokens || []);
      if (similarity > 0.85) {
        logger.debug(`QueryMemory: skipping duplicate record (similarity=${similarity.toFixed(2)})`);
        return;
      }
    }

    await QueryMemory.create({
      userId,
      query,
      answer: answer.substring(0, 2000), // Cap stored answer at 2000 chars
      engine,
      queryTokens,
      confidence,
    });

    logger.debug(`QueryMemory: recorded query for user ${userId}`);
  } catch (err) {
    // Non-blocking — never let memory recording break the query flow
    logger.error('QueryMemory.recordQuery failed:', err.message);
  }
};

/**
 * Retrieves the top-N semantically relevant prior query-answer pairs for a new query.
 * Uses Jaccard similarity to rank and filter candidates from the user's history.
 *
 * @param {string} userId - The unique identifier of the user.
 * @param {string} currentQuery - The current user query to match against.
 * @param {number} [limit=3] - Maximum number of results to return.
 * @param {number} [minSimilarity=0.2] - Minimum Jaccard similarity threshold.
 * @returns {Promise<Array<{query: string, answer: string, engine: string, createdAt: Date, similarity: number}>>} Ranked prior Q&A pairs.
 */
const getRelevantHistory = async (userId, currentQuery, limit = 3, minSimilarity = 0.2) => {
  try {
    const currentTokens = tokenize(currentQuery);
    if (currentTokens.length === 0) return [];

    // Fetch recent memory (last 100 entries for candidate pool)
    const candidates = await QueryMemory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    if (candidates.length === 0) return [];

    // Score each candidate by Jaccard similarity
    const scored = candidates
      .map(entry => ({
        query: entry.query,
        answer: entry.answer,
        engine: entry.engine,
        createdAt: entry.createdAt,
        similarity: jaccardSimilarity(currentTokens, entry.queryTokens || tokenize(entry.query)),
      }))
      .filter(entry => entry.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return scored;
  } catch (err) {
    logger.error('QueryMemory.getRelevantHistory failed:', err.message);
    return [];
  }
};

/**
 * Builds a context injection block from relevant history entries.
 * Prepends prior Q&A pairs to the current query to provide the LLM with persistent memory context.
 *
 * @param {string} userId - The unique identifier of the user.
 * @param {string} currentQuery - The current user query.
 * @returns {Promise<string>} The enriched query with prior context prepended, or the original query if no relevant history is found.
 */
const buildMemoryEnrichedQuery = async (userId, currentQuery) => {
  try {
    const history = await getRelevantHistory(userId, currentQuery, 3, 0.2);

    if (history.length === 0) return currentQuery;

    const historyBlock = history
      .map((entry, i) =>
        `Prior Q${i + 1} [${entry.engine}, similarity: ${entry.similarity.toFixed(2)}]:\n  Q: ${entry.query}\n  A: ${entry.answer.substring(0, 400)}...`
      )
      .join('\n\n');

    const enriched = `[Cross-Session Memory Context]
The following are relevant prior queries from this user's history that may help answer the current question more accurately:

${historyBlock}

Current Query:
${currentQuery}`;

    logger.info(`QueryMemory: enriched query with ${history.length} prior memory entries`);
    return enriched;
  } catch (err) {
    logger.error('QueryMemory.buildMemoryEnrichedQuery failed:', err.message);
    return currentQuery;
  }
};

/**
 * Retrieves a summary of stored memory for a user, useful for debugging and analytics.
 *
 * @param {string} userId - The unique identifier of the user.
 * @returns {Promise<{success: boolean, totalEntries?: number, byEngine?: Array<{engine: string, count: number}>, oldestEntry?: {createdAt: Date, queryPreview: string} | null, newestEntry?: {createdAt: Date, queryPreview: string} | null, error?: string}>} Summary object containing memory statistics.
 */
const getMemorySummary = async (userId) => {
  try {
    const total = await QueryMemory.countDocuments({ userId });
    const byEngine = await QueryMemory.aggregate([
      { $match: { userId } },
      { $group: { _id: '$engine', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const oldest = await QueryMemory.findOne({ userId }).sort({ createdAt: 1 }).select('createdAt query').lean();
    const newest = await QueryMemory.findOne({ userId }).sort({ createdAt: -1 }).select('createdAt query').lean();

    return {
      success: true,
      totalEntries: total,
      byEngine: byEngine.map(e => ({ engine: e._id, count: e.count })),
      oldestEntry: oldest ? { createdAt: oldest.createdAt, queryPreview: oldest.query.substring(0, 80) } : null,
      newestEntry: newest ? { createdAt: newest.createdAt, queryPreview: newest.query.substring(0, 80) } : null,
    };
  } catch (err) {
    logger.error('QueryMemory.getMemorySummary failed:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Service object containing methods for managing and querying cross-session query memory.
 * @type {{
 *   recordQuery: Function,
 *   getRelevantHistory: Function,
 *   buildMemoryEnrichedQuery: Function,
 *   getMemorySummary: Function
 * }}
 */
export const queryMemoryService = {
  recordQuery,
  getRelevantHistory,
  buildMemoryEnrichedQuery,
  getMemorySummary,
};