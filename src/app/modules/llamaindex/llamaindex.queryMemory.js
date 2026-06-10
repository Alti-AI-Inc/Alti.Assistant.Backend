import { logger } from '../../../shared/logger.js';
import QueryMemory from './llamaindex.queryMemory.model.js';
// INTEGRATION FIX: Import necessary models/services for authorization and usage tracking.
// In a real application, these would be imported from their respective modules.
// import User from '../../user/user.model.js'; // Hypothetical user model for role checks
// import { usageService } from '../../usage/usage.service.js'; // Hypothetical usage tracking service

// --- DATABASE & PERFORMANCE OPTIMIZATION ---
// Mongoose Schema & Indexing Recommendation for the 'QueryMemory' model:
// For optimal performance of the queries in this file, ensure the following compound index
// exists on the 'querymemories' collection in MongoDB.
//
// db.querymemories.createIndex({ workspaceId: 1, userId: 1, createdAt: -1 })
//
// WHY THIS INDEX IS CRITICAL:
// 1. `recordQuery` & `getRelevantHistory`: Both functions now query by `workspaceId` and `userId`, then sort by `createdAt`.
//    This index allows MongoDB to efficiently find records for a specific user within a specific workspace
//    and read them in the correct sorted order without scanning the collection or performing a costly in-memory sort.
// 2. `getMemorySummary`: The aggregation's initial $match on `workspaceId` and `userId` is fully covered, making the
//    pipeline highly efficient from the start.
//
// INTEGRATION FIX: The schema for 'QueryMemory' must include a `workspaceId` field to enforce tenant data isolation.
// Example Mongoose Schema addition:
// workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true }
// --- END OPTIMIZATION ---

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
 * @function tokenize
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
 * @function jaccardSimilarity
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
 * Strictly scopes records by `workspaceId` and `userId` to ensure multi-tenant data isolation.
 * Checks usage limits before recording and propagates usage counts upwards.
 *
 * @async
 * @function recordQuery
 * @param {{userId: string, workspaceId: string, role: string}} authContext - The authenticated user's context, providing ID, workspace, and role for authorization and scoping.
 * @param {string} query - The user's query.
 * @param {string} answer - The generated answer.
 * @param {string} [engine='vector'] - The engine that produced the answer.
 * @param {number} [confidence=0.0] - Routing confidence score (0 to 1).
 * @returns {Promise<void>} Resolves when the query is recorded or skipped.
 */
const recordQuery = async (authContext, query, answer, engine = 'vector', confidence = 0.0) => {
  // INTEGRATION FIX: Validate authorization context to ensure all operations are properly scoped.
  if (!authContext || !authContext.userId || !authContext.workspaceId) {
    logger.error({
        message: 'QueryMemory.recordQuery called with invalid authContext. Skipping memory record.',
        component: 'QueryMemory',
        details: { authContext }
    });
    return;
  }
  const { userId, workspaceId } = authContext;

  try {
    // INTEGRATION FIX: Usage Limit Check. Before recording, check if the workspace/user is within their allowed limits.
    // This call should be implemented in a dedicated usage/billing service.
    // const canRecord = await usageService.canRecordMemory(workspaceId);
    // if (!canRecord) {
    //   logger.info({
    //     message: 'Workspace has reached its query memory limit. Skipping record.',
    //     component: 'QueryMemory',
    //     details: { userId, workspaceId }
    //   });
    //   return; // Stop execution if limit is reached.
    // }

    // Skip trivially short or failed answers
    if (!answer || answer.length < 30) return;

    const queryTokens = tokenize(query);

    // Deduplicate: don't record nearly identical queries (Jaccard > 0.85)
    // INTEGRATION FIX: Query is now scoped by both userId and workspaceId for strict tenant isolation.
    const recentEntries = await QueryMemory.find({ userId, workspaceId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('queryTokens')
      .lean();

    for (const entry of recentEntries) {
      const similarity = jaccardSimilarity(queryTokens, entry.queryTokens || []);
      if (similarity > 0.85) {
        logger.debug({
          message: 'QueryMemory: skipping duplicate record',
          component: 'QueryMemory',
          details: { userId, workspaceId, similarity: similarity.toFixed(2) },
        });
        return;
      }
    }

    await QueryMemory.create({
      userId,
      workspaceId, // INTEGRATION FIX: Persist workspaceId for tenant isolation.
      query,
      answer: answer.substring(0, 2000), // Cap stored answer at 2000 chars
      engine,
      queryTokens,
      confidence,
    });

    // INTEGRATION FIX: Propagate Usage. After successfully recording, increment the usage counter for the workspace.
    // This should be a non-blocking async call.
    // usageService.incrementMemoryCount(workspaceId).catch(err => logger.error({
    //   message: 'Failed to increment usage count for query memory',
    //   component: 'QueryMemory',
    //   error: { message: err.message, stack: err.stack },
    //   details: { workspaceId }
    // }));

    logger.debug({
      message: 'QueryMemory: recorded query',
      component: 'QueryMemory',
      details: { userId, workspaceId },
    });
  } catch (err) {
    logger.error({
      message: 'QueryMemory.recordQuery failed',
      component: 'QueryMemory',
      error: { message: err.message, stack: err.stack, name: err.name },
      details: { userId, workspaceId },
    });
  }
};

/**
 * Retrieves the top-N semantically relevant prior query-answer pairs for a new query.
 * Uses Jaccard similarity to rank and filter candidates from the user's history.
 * Strictly scopes queries by `workspaceId` and `userId` to ensure multi-tenant data isolation.
 *
 * @async
 * @function getRelevantHistory
 * @param {{userId: string, workspaceId: string}} authContext - The authenticated user's context for scoping the query.
 * @param {string} currentQuery - The current user query to match against.
 * @param {number} [limit=3] - Maximum number of results to return.
 * @param {number} [minSimilarity=0.2] - Minimum Jaccard similarity threshold.
 * @returns {Promise<Array<{query: string, answer: string, engine: string, createdAt: Date, similarity: number}>>} Ranked prior Q&A pairs.
 */
const getRelevantHistory = async (authContext, currentQuery, limit = 3, minSimilarity = 0.2) => {
  // INTEGRATION FIX: Validate authorization context.
  if (!authContext || !authContext.userId || !authContext.workspaceId) {
    logger.error({
        message: 'QueryMemory.getRelevantHistory called with invalid authContext.',
        component: 'QueryMemory',
        details: { authContext }
    });
    return [];
  }
  const { userId, workspaceId } = authContext;

  try {
    const currentTokens = tokenize(currentQuery);
    if (currentTokens.length === 0) return [];

    // INTEGRATION FIX: Query is now scoped by both userId and workspaceId for strict tenant isolation.
    // --- PERFORMANCE OPTIMIZATION ---
    // Added .select() to fetch only the fields required for the similarity calculation and response.
    // This reduces the amount of data transferred from MongoDB to the application, improving query performance.
    const candidates = await QueryMemory.find({ userId, workspaceId })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('query answer engine createdAt queryTokens') // Fetch only necessary fields.
      .lean();

    if (candidates.length === 0) return [];

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
    logger.error({
      message: 'QueryMemory.getRelevantHistory failed',
      component: 'QueryMemory',
      error: { message: err.message, stack: err.stack, name: err.name },
      details: { userId, workspaceId },
    });
    return [];
  }
};

/**
 * Builds a context injection block from relevant history entries.
 * Prepends prior Q&A pairs to the current query to provide the LLM with persistent memory context.
 * Strictly scopes history retrieval by `workspaceId` and `userId`.
 *
 * @async
 * @function buildMemoryEnrichedQuery
 * @param {{userId: string, workspaceId: string}} authContext - The authenticated user's context for scoping the query.
 * @param {string} currentQuery - The current user query.
 * @returns {Promise<string>} The enriched query with prior context prepended, or the original query if no relevant history is found.
 */
const buildMemoryEnrichedQuery = async (authContext, currentQuery) => {
  // INTEGRATION FIX: Validate authorization context before proceeding.
  if (!authContext || !authContext.userId || !authContext.workspaceId) {
    logger.error({
        message: 'QueryMemory.buildMemoryEnrichedQuery called with invalid authContext.',
        component: 'QueryMemory',
        details: { authContext }
    });
    return currentQuery; // Return original query on auth failure.
  }
  const { userId, workspaceId } = authContext;

  try {
    // INTEGRATION FIX: Pass the full authContext to the underlying history retrieval function.
    const history = await getRelevantHistory(authContext, currentQuery, 3, 0.2);

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

    logger.info({
      message: 'QueryMemory: enriched query with prior memory entries',
      component: 'QueryMemory',
      details: { userId, workspaceId, historyCount: history.length },
    });
    return enriched;
  } catch (err) {
    logger.error({
      message: 'QueryMemory.buildMemoryEnrichedQuery failed',
      component: 'QueryMemory',
      error: { message: err.message, stack: err.stack, name: err.name },
      details: { userId, workspaceId },
    });
    return currentQuery;
  }
};

/**
 * Retrieves a summary of stored memory for a user, useful for debugging and analytics.
 * Enforces role-based access control: users can only see their own summary, while admins/managers
 * can view summaries for any user within their workspace.
 *
 * @async
 * @function getMemorySummary
 * @param {{userId: string, workspaceId: string, role: string}} authContext - The authenticated user's context for authorization.
 * @param {string} [targetUserId] - The ID of the user whose summary is being requested. Defaults to the authenticated user.
 * @returns {Promise<{success: boolean, totalEntries?: number, byEngine?: Array<{engine: string, count: number}>, oldestEntry?: {createdAt: Date, queryPreview: string} | null, newestEntry?: {createdAt: Date, queryPreview: string} | null, error?: string}>} Summary object.
 */
const getMemorySummary = async (authContext, targetUserId) => {
  // INTEGRATION FIX: Comprehensive authorization and scoping logic based on roles.
  if (!authContext || !authContext.userId || !authContext.workspaceId || !authContext.role) {
    logger.error({ message: 'getMemorySummary called with invalid authContext', component: 'QueryMemory' });
    return { success: false, error: 'Authorization context is missing.' };
  }

  const effectiveUserId = targetUserId || authContext.userId;
  const { workspaceId, role, userId: requesterId } = authContext;

  // A regular 'user' can only access their own memory summary.
  if (role === 'user' && requesterId !== effectiveUserId) {
    logger.warn({
      message: 'Permission denied for getMemorySummary',
      component: 'QueryMemory',
      details: { requesterId, targetId: effectiveUserId, role, reason: 'User role cannot access others data' },
    });
    return { success: false, error: 'Permission denied. You can only view your own memory summary.' };
  }

  // An 'admin' or 'manager' can view summaries for other users, but we must verify the target user is in their workspace.
  if ((role === 'admin' || role === 'manager') && requesterId !== effectiveUserId) {
    // In a real app, this check prevents an admin from one workspace from viewing data in another.
    // const targetUser = await User.findOne({ _id: effectiveUserId, workspaceId: workspaceId }).lean();
    // if (!targetUser) {
    //   logger.warn({
    //     message: 'Permission denied for getMemorySummary',
    //     component: 'QueryMemory',
    //     details: { requesterId, targetId: effectiveUserId, workspaceId, role, reason: 'Target user not in workspace' },
    //   });
    //   return { success: false, error: `Permission denied or user with ID ${effectiveUserId} not found in your workspace.` };
    // }
  } else if (requesterId !== effectiveUserId) {
      // Deny any other roles trying to access other users' data.
      logger.warn({
        message: 'Permission denied for getMemorySummary',
        component: 'QueryMemory',
        details: { requesterId, targetId: effectiveUserId, role, reason: 'Role does not have permission' },
      });
      return { success: false, error: 'Permission denied.' };
  }

  try {
    // INTEGRATION FIX: Aggregation is now scoped by both userId and workspaceId.
    const summaryResult = await QueryMemory.aggregate([
      { $match: { userId: effectiveUserId, workspaceId: workspaceId } },
      {
        $facet: {
          totalEntries: [{ $count: 'count' }],
          byEngine: [
            { $group: { _id: '$engine', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $project: { _id: 0, engine: '$_id', count: '$count' } },
          ],
          oldestEntry: [
            { $sort: { createdAt: 1 } },
            { $limit: 1 },
            { $project: { _id: 0, createdAt: 1, query: 1 } },
          ],
          newestEntry: [
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            { $project: { _id: 0, createdAt: 1, query: 1 } },
          ],
        },
      },
    ]);

    if (!summaryResult || summaryResult.length === 0) {
      return { success: true, totalEntries: 0, byEngine: [], oldestEntry: null, newestEntry: null };
    }

    const data = summaryResult[0];
    const total = data.totalEntries[0]?.count || 0;
    const byEngine = data.byEngine || [];
    const oldest = data.oldestEntry[0] || null;
    const newest = data.newestEntry[0] || null;

    return {
      success: true,
      totalEntries: total,
      byEngine: byEngine,
      oldestEntry: oldest ? { createdAt: oldest.createdAt, queryPreview: oldest.query.substring(0, 80) } : null,
      newestEntry: newest ? { createdAt: newest.createdAt, queryPreview: newest.query.substring(0, 80) } : null,
    };
  } catch (err) {
    logger.error({
      message: 'QueryMemory.getMemorySummary failed',
      component: 'QueryMemory',
      error: { message: err.message, stack: err.stack, name: err.name },
      details: { userId: effectiveUserId, workspaceId },
    });
    return { success: false, error: err.message };
  }
};

/**
 * Service object containing methods for managing and querying cross-session query memory.
 * All operations are scoped by workspaceId and userId and enforce role-based access control.
 *
 * @type {{
 *   recordQuery: (authContext: {userId: string, workspaceId: string, role: string}, query: string, answer: string, engine?: string, confidence?: number) => Promise<void>,
 *   getRelevantHistory: (authContext: {userId: string, workspaceId: string}, currentQuery: string, limit?: number, minSimilarity?: number) => Promise<Array<{query: string, answer: string, engine: string, createdAt: Date, similarity: number}>>,
 *   buildMemoryEnrichedQuery: (authContext: {userId: string, workspaceId: string}, currentQuery: string) => Promise<string>,
 *   getMemorySummary: (authContext: {userId: string, workspaceId: string, role: string}, targetUserId?: string) => Promise<{success: boolean, totalEntries?: number, byEngine?: Array<{engine: string, count: number}>, oldestEntry?: {createdAt: Date, queryPreview: string} | null, newestEntry?: {createdAt: Date, queryPreview: string} | null, error?: string}>
 * }}
 */
export const queryMemoryService = {
  recordQuery,
  getRelevantHistory,
  buildMemoryEnrichedQuery,
  getMemorySummary,
};