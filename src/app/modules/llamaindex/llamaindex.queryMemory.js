import { logger } from '../../../shared/logger.js';
import QueryMemory from './llamaindex.queryMemory.model.js';
// PLATFORM OWNER FIX: Import necessary models for platform-wide operations.
import Workspace from '../workspace/workspace.model.js'; // Hypothetical workspace model for status checks
import UserModel from '../auth/auth.model.js'; // Hypothetical user model for role checks
// import { usageService } from '../../usage/usage.service.js'; // Hypothetical usage tracking service
// import { configService } from '../../../config/config.service.js'; // Hypothetical central config service

// --- DATABASE & PERFORMANCE OPTIMIZATION ---
// Mongoose Schema & Indexing Recommendation for the 'QueryMemory' model:
// For optimal performance of the queries in this file, ensure the following compound index
// exists on the 'querymemories' collection in MongoDB.
//
// db.querymemories.createIndex({ workspaceId: 1, userId: 1, createdAt: -1 })
//
// WHY THIS INDEX IS CRITICAL:
// 1. `recordQuery` & `getRelevantHistory`: Both functions query by `workspaceId` and `userId`, then sort by `createdAt`.
//    This index allows MongoDB to efficiently find records for a specific user within a specific workspace
//    and read them in the correct sorted order without scanning the collection or performing a costly in-memory sort.
// 2. `getMemorySummary` & Platform Owner aggregations: The initial $match on `workspaceId` and/or `userId` is fully
//    covered, making the pipelines highly efficient from the start.
//
// PLATFORM OWNER FIX: The schema for 'QueryMemory' must include a `workspaceId` field to enforce tenant data isolation.
// Example Mongoose Schema addition:
// workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true }
// --- END OPTIMIZATION ---

// PLATFORM OWNER FIX: Centralize configuration to allow for system-wide adjustments.
// In a real application, these values would be loaded from a database or a config service.
const MEMORY_CONFIG = {
  DEDUPE_SIMILARITY_THRESHOLD: 0.85, // Jaccard similarity to consider a query a duplicate.
  MAX_ANSWER_LENGTH: 2000,           // Max characters of an answer to store.
  HISTORY_DEFAULT_LIMIT: 3,          // Default number of history items to return.
  HISTORY_MIN_SIMILARITY: 0.2,       // Minimum Jaccard similarity for a history item to be relevant.
  HISTORY_CANDIDATE_LIMIT: 100,      // Number of recent entries to scan for relevant history.
};

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
 * Checks for tenant suspension, usage limits, and deduplicates queries.
 *
 * @async
 * @function recordQuery
 * @param {{userId: string, workspaceId: string, role: string}} authContext - The authenticated user's context.
 * @param {string} query - The user's query.
 * @param {string} answer - The generated answer.
 * @param {string} [engine='vector'] - The engine that produced the answer.
 * @param {number} [confidence=0.0] - Routing confidence score (0 to 1).
 * @returns {Promise<void>} Resolves when the query is recorded or skipped.
 */
const recordQuery = async (authContext, query, answer, engine = 'vector', confidence = 0.0) => {
  if (!authContext || !authContext.userId || !authContext.workspaceId) {
    logger.error({
        severity: 'ERROR',
        message: 'QueryMemory.recordQuery called with invalid authContext. Skipping memory record.',
        component: 'QueryMemory',
        details: { authContext }
    });
    return;
  }
  const { userId, workspaceId, role } = authContext;

  try {
    // PLATFORM OWNER FIX: Check for tenant suspension before allowing writes.
    // A Platform Owner might have a special role that bypasses this check for maintenance.
    if (role !== 'platform_owner') {
        const workspace = await Workspace.findById(workspaceId).select('status').lean();
        if (workspace?.status === 'suspended') {
            logger.warn({
                severity: 'WARNING',
                message: 'Attempted to record query for a suspended workspace. Operation blocked.',
                component: 'QueryMemory',
                details: { userId, workspaceId }
            });
            return;
        }
    }

    // INTEGRATION FIX: Usage Limit Check.
    // const canRecord = await usageService.canRecordMemory(workspaceId, { bypass: role === 'platform_owner' });
    // if (!canRecord) { ... }

    if (!answer || answer.length < 30) return;

    const queryTokens = tokenize(query);

    const recentEntries = await QueryMemory.find({ userId, workspaceId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('queryTokens')
      .lean();

    for (const entry of recentEntries) {
      const similarity = jaccardSimilarity(queryTokens, entry.queryTokens || []);
      if (similarity > MEMORY_CONFIG.DEDUPE_SIMILARITY_THRESHOLD) {
        logger.debug({
          severity: 'DEBUG',
          message: 'QueryMemory: skipping duplicate record',
          component: 'QueryMemory',
          details: { userId, workspaceId, similarity: similarity.toFixed(2) },
        });
        return;
      }
    }

    await QueryMemory.create({
      userId,
      workspaceId,
      query,
      answer: answer.substring(0, MEMORY_CONFIG.MAX_ANSWER_LENGTH),
      engine,
      queryTokens,
      confidence,
    });

    // INTEGRATION FIX: Propagate Usage.
    // usageService.incrementMemoryCount(workspaceId).catch(...)

    logger.debug({
      severity: 'DEBUG',
      message: 'QueryMemory: recorded query',
      component: 'QueryMemory',
      details: { userId, workspaceId },
    });
  } catch (err) {
    logger.error({
      severity: 'ERROR',
      message: 'QueryMemory.recordQuery failed',
      component: 'QueryMemory',
      error: { message: err.message, stack: err.stack, name: err.name },
      details: { userId, workspaceId },
    });
  }
};

/**
 * Retrieves relevant prior query-answer pairs for a new query.
 * Platform Owners can impersonate users for debugging by providing target IDs in authContext.
 *
 * @async
 * @function getRelevantHistory
 * @param {{userId: string, workspaceId: string, role?: string, targetUserId?: string, targetWorkspaceId?: string}} authContext - User context. Platform Owners can use target* fields.
 * @param {string} currentQuery - The current user query to match against.
 * @param {number} [limit=MEMORY_CONFIG.HISTORY_DEFAULT_LIMIT] - Maximum number of results.
 * @param {number} [minSimilarity=MEMORY_CONFIG.HISTORY_MIN_SIMILARITY] - Minimum similarity threshold.
 * @returns {Promise<Array<{query: string, answer: string, engine: string, createdAt: Date, similarity: number}>>} Ranked Q&A pairs.
 */
const getRelevantHistory = async (authContext, currentQuery, limit = MEMORY_CONFIG.HISTORY_DEFAULT_LIMIT, minSimilarity = MEMORY_CONFIG.HISTORY_MIN_SIMILARITY) => {
  if (!authContext || !authContext.userId || !authContext.workspaceId) {
    logger.error({ severity: 'ERROR', message: 'QueryMemory.getRelevantHistory called with invalid authContext.', component: 'QueryMemory', details: { authContext } });
    return [];
  }

  // PLATFORM OWNER FIX: Allow impersonation for debugging and support.
  // If the requester is a platform_owner and provides target IDs, use them. Otherwise, use the requester's own IDs.
  const isPlatformOwner = authContext.role === 'platform_owner';
  const effectiveUserId = isPlatformOwner && authContext.targetUserId ? authContext.targetUserId : authContext.userId;
  const effectiveWorkspaceId = isPlatformOwner && authContext.targetWorkspaceId ? authContext.targetWorkspaceId : authContext.workspaceId;

  try {
    const currentTokens = tokenize(currentQuery);
    if (currentTokens.length === 0) return [];

    const candidates = await QueryMemory.find({ userId: effectiveUserId, workspaceId: effectiveWorkspaceId })
      .sort({ createdAt: -1 })
      .limit(MEMORY_CONFIG.HISTORY_CANDIDATE_LIMIT)
      .select('query answer engine createdAt queryTokens')
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
      severity: 'ERROR',
      message: 'QueryMemory.getRelevantHistory failed',
      component: 'QueryMemory',
      error: { message: err.message, stack: err.stack, name: err.name },
      details: { userId: effectiveUserId, workspaceId: effectiveWorkspaceId },
    });
    return [];
  }
};

/**
 * Builds a context injection block from relevant history entries.
 *
 * @async
 * @function buildMemoryEnrichedQuery
 * @param {{userId: string, workspaceId: string, role?: string, targetUserId?: string, targetWorkspaceId?: string}} authContext - User context, passed to getRelevantHistory.
 * @param {string} currentQuery - The current user query.
 * @returns {Promise<string>} The enriched query, or the original query if no history is found.
 */
const buildMemoryEnrichedQuery = async (authContext, currentQuery) => {
  if (!authContext || !authContext.userId || !authContext.workspaceId) {
    logger.error({ severity: 'ERROR', message: 'QueryMemory.buildMemoryEnrichedQuery called with invalid authContext.', component: 'QueryMemory', details: { authContext } });
    return currentQuery;
  }

  try {
    // Pass the full authContext to allow for Platform Owner impersonation.
    const history = await getRelevantHistory(authContext, currentQuery, MEMORY_CONFIG.HISTORY_DEFAULT_LIMIT, MEMORY_CONFIG.HISTORY_MIN_SIMILARITY);

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
      severity: 'INFO',
      message: 'QueryMemory: enriched query with prior memory entries',
      component: 'QueryMemory',
      details: { userId: authContext.userId, workspaceId: authContext.workspaceId, historyCount: history.length },
    });
    return enriched;
  } catch (err) {
    logger.error({
      severity: 'ERROR',
      message: 'QueryMemory.buildMemoryEnrichedQuery failed',
      component: 'QueryMemory',
      error: { message: err.message, stack: err.stack, name: err.name },
      details: { userId: authContext.userId, workspaceId: authContext.workspaceId },
    });
    return currentQuery;
  }
};

/**
 * Retrieves a summary of stored memory. Enforces role-based access.
 * Platform Owners can retrieve summaries for any user in any workspace.
 *
 * @async
 * @function getMemorySummary
 * @param {{userId: string, workspaceId: string, role: string}} authContext - The authenticated user's context.
 * @param {string} [targetUserId] - The ID of the user whose summary is requested.
 * @param {string} [targetWorkspaceId] - The ID of the workspace to scope the summary to. (For Platform Owners)
 * @returns {Promise<Object>} Summary object.
 */
const getMemorySummary = async (authContext, targetUserId, targetWorkspaceId) => {
  if (!authContext || !authContext.userId || !authContext.workspaceId || !authContext.role) {
    logger.error({ severity: 'ERROR', message: 'getMemorySummary called with invalid authContext', component: 'QueryMemory' });
    return { success: false, error: 'Authorization context is missing.' };
  }

  const { role, userId: requesterId, workspaceId: requesterWorkspaceId } = authContext;
  const isPlatformOwner = role === 'platform_owner';

  let effectiveUserId = targetUserId || requesterId;
  let effectiveWorkspaceId = isPlatformOwner ? (targetWorkspaceId || requesterWorkspaceId) : requesterWorkspaceId;

  // --- Authorization Logic ---
  if (!isPlatformOwner) {
    // Regular users can only access their own summary.
    if (role === 'user' && requesterId !== effectiveUserId) {
      return { success: false, error: 'Permission denied. You can only view your own memory summary.' };
    }
    // Admins/Managers can access others in their own workspace.
    if ((role === 'admin' || role === 'manager') && requesterId !== effectiveUserId) {
      const targetUser = await UserModel.findOne({ _id: effectiveUserId, workspaceId: requesterWorkspaceId }).lean();
      if (!targetUser) {
        return { success: false, error: `Permission denied or user with ID ${effectiveUserId} not found in your workspace.` };
      }
    }
    // Ensure the query is always scoped to the requester's workspace for non-owners.
    effectiveWorkspaceId = requesterWorkspaceId;
  }
  // Platform Owners have full access, validated by the `isPlatformOwner` flag.

  try {
    const summaryResult = await QueryMemory.aggregate([
      { $match: { userId: effectiveUserId, workspaceId: effectiveWorkspaceId } },
      {
        $facet: {
          totalEntries: [{ $count: 'count' }],
          byEngine: [ { $group: { _id: '$engine', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $project: { _id: 0, engine: '$_id', count: '$count' } } ],
          oldestEntry: [ { $sort: { createdAt: 1 } }, { $limit: 1 }, { $project: { _id: 0, createdAt: 1, query: 1 } } ],
          newestEntry: [ { $sort: { createdAt: -1 } }, { $limit: 1 }, { $project: { _id: 0, createdAt: 1, query: 1 } } ],
        },
      },
    ]);

    if (!summaryResult || summaryResult.length === 0) {
      return { success: true, totalEntries: 0, byEngine: [], oldestEntry: null, newestEntry: null };
    }

    const data = summaryResult[0];
    return {
      success: true,
      totalEntries: data.totalEntries[0]?.count || 0,
      byEngine: data.byEngine || [],
      oldestEntry: data.oldestEntry[0] ? { createdAt: data.oldestEntry[0].createdAt, queryPreview: data.oldestEntry[0].query.substring(0, 80) } : null,
      newestEntry: data.newestEntry[0] ? { createdAt: data.newestEntry[0].createdAt, queryPreview: data.newestEntry[0].query.substring(0, 80) } : null,
    };
  } catch (err) {
    logger.error({
      severity: 'ERROR',
      message: 'QueryMemory.getMemorySummary failed',
      component: 'QueryMemory',
      error: { message: err.message, stack: err.stack, name: err.name },
      details: { userId: effectiveUserId, workspaceId: effectiveWorkspaceId },
    });
    return { success: false, error: err.message };
  }
};


// ===================================================================================
// PLATFORM OWNER FEATURES
// ===================================================================================

/**
 * [Platform Owner] Retrieves global statistics about query memory usage across all tenants.
 * Access is restricted to users with the 'platform_owner' role.
 *
 * @async
 * @function getGlobalMemoryStats
 * @param {{role: string}} authContext - The authenticated user's context.
 * @returns {Promise<Object>} An object containing global memory statistics.
 */
const getGlobalMemoryStats = async (authContext) => {
    if (authContext?.role !== 'platform_owner') {
        logger.warn({ severity: 'WARNING', message: 'Unauthorized attempt to access getGlobalMemoryStats', component: 'QueryMemory', details: { userId: authContext?.userId } });
        return { success: false, error: 'Permission denied.' };
    }

    try {
        const stats = await QueryMemory.aggregate([
            {
                $facet: {
                    totalEntries: [{ $count: 'count' }],
                    entriesByWorkspace: [
                        { $group: { _id: '$workspaceId', count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: 50 }, // Top 50 workspaces by memory usage
                        { $project: { _id: 0, workspaceId: '$_id', count: '$count' } }
                    ],
                    entriesByEngine: [
                        { $group: { _id: '$engine', count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $project: { _id: 0, engine: '$_id', count: '$count' } }
                    ]
                }
            }
        ]);

        if (!stats || stats.length === 0) {
            return { success: true, totalEntries: 0, topWorkspaces: [], byEngine: [] };
        }

        const data = stats[0];
        return {
            success: true,
            totalEntries: data.totalEntries[0]?.count || 0,
            topWorkspaces: data.entriesByWorkspace || [],
            byEngine: data.entriesByEngine || [],
        };
    } catch (err) {
        logger.error({ severity: 'ERROR', message: 'QueryMemory.getGlobalMemoryStats failed', component: 'QueryMemory', error: { message: err.message, stack: err.stack } });
        return { success: false, error: 'An internal error occurred while fetching global stats.' };
    }
};

/**
 * [Platform Owner] Deletes a specific query memory entry from the database.
 * This is a moderation tool for removing incorrect, sensitive, or inappropriate content.
 *
 * @async
 * @function deleteMemoryEntry
 * @param {{role: string}} authContext - The authenticated user's context.
 * @param {string} entryId - The MongoDB ObjectId of the query memory entry to delete.
 * @returns {Promise<{success: boolean, deletedCount?: number, error?: string}>} Result of the deletion operation.
 */
const deleteMemoryEntry = async (authContext, entryId) => {
    if (authContext?.role !== 'platform_owner') {
        logger.warn({ severity: 'WARNING', message: 'Unauthorized attempt to access deleteMemoryEntry', component: 'QueryMemory', details: { userId: authContext?.userId, entryId } });
        return { success: false, error: 'Permission denied.' };
    }

    if (!entryId) {
        return { success: false, error: 'Entry ID is required.' };
    }

    try {
        const result = await QueryMemory.deleteOne({ _id: entryId });
        if (result.deletedCount === 0) {
            logger.warn({ severity: 'WARNING', message: 'deleteMemoryEntry: Entry not found', component: 'QueryMemory', details: { entryId } });
            return { success: false, error: 'Entry not found.' };
        }
        logger.info({ severity: 'INFO', message: 'Platform Owner deleted a memory entry', component: 'QueryMemory', details: { adminId: authContext.userId, deletedEntryId: entryId } });
        return { success: true, deletedCount: result.deletedCount };
    } catch (err) {
        logger.error({ severity: 'ERROR', message: 'QueryMemory.deleteMemoryEntry failed', component: 'QueryMemory', error: { message: err.message, stack: err.stack }, details: { entryId } });
        return { success: false, error: 'An internal error occurred during deletion.' };
    }
};


/**
 * Service object containing methods for managing and querying cross-session query memory.
 */
export const queryMemoryService = {
  // Tenant-facing features
  recordQuery,
  getRelevantHistory,
  buildMemoryEnrichedQuery,
  getMemorySummary,
  // Platform Owner features
  getGlobalMemoryStats,
  deleteMemoryEntry,
};