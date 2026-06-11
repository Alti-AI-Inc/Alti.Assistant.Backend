import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import TemporalRepository from './temporal-repository.model.js';

// --- Indexing Recommendations for TemporalRepository Model ---
// To optimize database performance, consider adding the following indexes to your TemporalRepository schema:
// 1. For efficient upserts and lookups by 'name' (used in syncCatalog and searchCatalog):
//    TemporalRepositorySchema.index({ name: 1 }, { unique: true });
// 2. For filtering by 'status' (used in searchCatalog and getStats):
//    TemporalRepositorySchema.index({ status: 1 });
// 3. For filtering and aggregation by 'license' (used in searchCatalog and getStats):
//    TemporalRepositorySchema.index({ license: 1 });
// 4. For sorting by 'stars' (used in searchCatalog and getStats aggregation):
//    TemporalRepositorySchema.index({ stars: -1 }); // Or { stars: 1 } depending on common sort order
// 5. For sorting by 'createdAt' (used in searchCatalog, assuming createdAt exists and is a timestamp field):
//    TemporalRepositorySchema.index({ createdAt: -1 }); // Or { createdAt: 1 }
// 6. For text search on 'name' and 'description' (used in searchCatalog):
//    TemporalRepositorySchema.index({ name: 'text', description: 'text' });
// 7. For tenant-scoping queries (critical for security and performance in a multi-tenant environment):
//    TemporalRepositorySchema.index({ workspaceId: 1 });


/**
 * The filename of the current module.
 * @type {string}
 */
const __filename = fileURLToPath(import.meta.url);
/**
 * The directory name of the current module.
 * @type {string}
 */
const __dirname = path.dirname(__filename);

/**
 * The root directory of the workspace.
 * Points to: c:/Users/hyper/workspace/Alti.Assistant
 * @type {string}
 */
const ROOT_DIR = path.join(__dirname, '../../../../..');
/**
 * The full path to the scan results JSON file.
 * This file contains information about approved repositories.
 * @type {string}
 */
const SCAN_RESULTS_PATH = path.join(ROOT_DIR, 'scan_results.json');

/**
 * Synchronizes the scanned approved repositories from `scan_results.json` into the MongoDB database.
 * It ensures that only repositories with existing local folders under `external/temporal` are synced.
 * This function is typically run as a startup or background task by a super_admin or system process.
 * These synced repositories are considered 'global' and have a null workspaceId.
 *
 * @async
 * @returns {Promise<{ success: boolean, message?: string, count?: number, error?: string }>} A promise that resolves to an object
 *   indicating the success of the synchronization, the number of upserted repositories, or an error message.
 *   - `success`: `true` if synchronization was successful, `false` otherwise.
 *   - `message`: An informational message if `success` is `false` (e.g., file not found).
 *   - `count`: The number of repositories successfully upserted if `success` is `true`.
 *   - `error`: The error message if an exception occurred during synchronization.
 */
const syncCatalog = async () => {
  try {
    if (!fs.existsSync(SCAN_RESULTS_PATH)) {
      console.log(`[Temporal Sync] Scan results file not found at: ${SCAN_RESULTS_PATH}. Skipping DB sync.`);
      return { success: false, message: "scan_results.json not found" };
    }

    // Reading the file synchronously is acceptable here as it's a startup/background task
    // and scan_results.json is not expected to be excessively large.
    const data = JSON.parse(fs.readFileSync(SCAN_RESULTS_PATH, 'utf-8'));
    const approved = data.approved || [];
    
    console.log(`[Temporal Sync] Syncing ${approved.length} approved repositories to MongoDB...`);
    
    let upsertedCount = 0;
    const upsertPromises = []; // Collect all upsert promises to run them in parallel

    for (const repo of approved) {
      const name = repo.name;
      const local_path = path.join('external', 'temporal', name);
      const full_local_path = path.join(ROOT_DIR, local_path);
      
      // Only sync if the repository folder exists locally (fully installed)
      // fs.existsSync is synchronous but acceptable for this specific check within a sync loop.
      if (!fs.existsSync(full_local_path)) {
        continue;
      }
      
      // Optimization: Run findOneAndUpdate operations in parallel using Promise.all.
      // This significantly reduces the overall time taken for the sync operation by not awaiting each upsert sequentially.
      // An index on 'name' (preferably unique) is crucial for the performance of this operation.
      upsertPromises.push(
        TemporalRepository.findOneAndUpdate(
          { name, workspaceId: null }, // FIX: Ensure we are only upserting the global (null workspace) record.
          {
            name,
            description: repo.description || '',
            license: repo.primary_license,
            license_key: repo.license_key,
            html_url: repo.url,
            clone_url: repo.url, // Standard git repo url
            stars: repo.stars || 0,
            archived: repo.archived || false,
            local_path,
            status: repo.archived ? 'Archived' : 'Active',
            workspaceId: null // FIX: Explicitly set workspaceId to null for global catalog items.
          },
          { upsert: true, new: true }
        ).then(() => {
          upsertedCount++; // Increment count only on successful upsert
        }).catch(err => {
          console.error(`[Temporal Sync] Failed to upsert repository ${name}: ${err.message}`);
          // Log the error but continue with other upserts.
        })
      );
    }

    await Promise.all(upsertPromises); // Wait for all parallel upsert operations to complete
    
    console.log(`[Temporal Sync] Successfully synchronized ${upsertedCount} repositories in MongoDB.`);
    return { success: true, count: upsertedCount };
  } catch (err) {
    console.error(`[Temporal Sync] Synchronization failed: ${err.message}`);
    return { success: false, error: err.message };
  }
};

/**
 * Queries the MongoDB TemporalRepository collection respecting tenant boundaries.
 * It uses strict filters, input sanitation, whitelisted sorting fields, and bounded pagination.
 *
 * @async
 * @param {object} user - The authenticated user object, containing role and workspaceId for authorization.
 * @param {string} user.role - The user's role (e.g., 'super_admin', 'admin', 'user').
 * @param {string} user.workspaceId - The ID of the user's workspace for tenant scoping.
 * @param {string} [query=''] - The search query string. It is sanitized to prevent injection attacks.
 * @param {object} [options={}] - An object containing search options.
 * @param {string} [options.license] - Filters repositories by license key (e.g., 'mit', 'apache-2.0').
 * @param {string} [options.status] - Filters repositories by status ('Active', 'Archived').
 * @param {string} [options.sortBy='stars'] - Field to sort the results by. Whitelisted fields are 'stars', 'name', 'createdAt'.
 * @param {number} [options.page=1] - The current page number for pagination. Must be a positive integer.
 * @param {number} [options.limit=20] - The maximum number of results per page. Bounded between 1 and 100.
 * @returns {Promise<{ success: boolean, total: number, page: number, limit: number, results: Array<Object> }>} A promise that resolves to an object
 *   containing the search results and pagination information.
 * @throws {Error} If the user context is missing or if the query fails due to a database error.
 */
const searchCatalog = async (user, query = '', options = {}) => {
  // FIX: Added user context validation for tenant isolation. A user must be provided to ensure data is properly scoped.
  if (!user || !user.workspaceId || !user.role) {
    throw new Error('User context with workspaceId and role is required for security and tenancy.');
  }

  try {
    const andClauses = [];

    // FIX: CRITICAL INTEGRATION - Enforce tenant context boundaries.
    // Super admins can see everything across all workspaces.
    // Other users can only see global templates (workspaceId: null) and templates specific to their own workspace.
    // This prevents data leakage between tenants. Assumes the TemporalRepository schema has a 'workspaceId' field.
    if (user.role !== 'super_admin') {
      andClauses.push({
        $or: [
          { workspaceId: null }, // Global templates
          { workspaceId: user.workspaceId } // Workspace-specific templates
        ]
      });
    }

    // 1. Strict Input Sanitation - strip potentially hazardous injection characters
    const sanitizedQuery = (typeof query === 'string') 
      ? query.replace(/[^\w\s\-\.\/]/g, '').trim() 
      : '';

    // 2. Filter Sanitation - enforce whitelisted options
    if (options.license) {
      const lowerLicense = options.license.toLowerCase();
      if (['mit', 'apache-2.0'].includes(lowerLicense)) {
        andClauses.push({ license_key: lowerLicense });
      }
    }

    if (options.status) {
      const statusStr = String(options.status);
      if (['Active', 'Archived'].includes(statusStr)) {
        andClauses.push({ status: statusStr });
      }
    }

    let queryBuilder;
    let isTextSearch = false;

    if (sanitizedQuery) {
      const stopWords = new Set(['show', 'me', 'the', 'and', 'its', 'from', 'collection', 'repository', 'repo', 'repositories', 'temporal', 'a', 'of', 'in', 'for', 'with', 'on']);
      const queryWords = sanitizedQuery.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));

      if (queryWords.length > 0) {
        andClauses.push({ $text: { $search: queryWords.join(' ') } });
        isTextSearch = true;
      } else {
        andClauses.push({
          $or: [
            { name: { $regex: sanitizedQuery, $options: 'i' } },
            { description: { $regex: sanitizedQuery, $options: 'i' } }
          ]
        });
      }
    }

    const filter = andClauses.length > 0 ? { $and: andClauses } : {};

    if (isTextSearch) {
      queryBuilder = TemporalRepository.find(filter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, stars: -1 });
    } else {
      // 3. Sort Key Whitelisting - completely blocks custom SQL/NoSQL sorting injection vectors
      const whitelistedSortFields = ['stars', 'name', 'createdAt'];
      const sortBy = whitelistedSortFields.includes(options.sortBy) ? options.sortBy : 'stars';
      queryBuilder = TemporalRepository.find(filter).sort({ [sortBy]: -1 });
    }

    // 4. Bounded Pagination - prevents DOS attacks via large limit requests
    const page = Math.max(1, parseInt(options.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
    const startIndex = (page - 1) * limit;

    const total = await TemporalRepository.countDocuments(filter);
    const results = await queryBuilder.skip(startIndex).limit(limit).lean();

    return {
      success: true,
      total,
      page,
      limit,
      results
    };
  } catch (err) {
    throw new Error(`Failed to query Temporal catalog: ${err.message}`);
  }
};

/**
 * Calculates aggregated statistics about the Temporal catalog, respecting tenant boundaries.
 *
 * @async
 * @param {object} user - The authenticated user object, containing role and workspaceId for authorization.
 * @param {string} user.role - The user's role (e.g., 'super_admin', 'admin', 'user').
 * @param {string} user.workspaceId - The ID of the user's workspace for tenant scoping.
 * @returns {Promise<{ success: boolean, stats: { totalRepositories: number, activeRepositories: number, archivedRepositories: number, totalStars: number, averageStars: number, licenses: Array<{ name: string, count: number }> } }>} A promise that resolves to an object
 *   containing the success status and the calculated statistics for the user's context.
 * @throws {Error} If the user context is missing or if the statistics retrieval fails due to a database error.
 */
const getStats = async (user) => {
  // FIX: Added user context validation for tenant isolation.
  if (!user || !user.workspaceId || !user.role) {
    throw new Error('User context with workspaceId and role is required for security and tenancy.');
  }

  try {
    const matchStage = {};
    // FIX: CRITICAL INTEGRATION - Enforce tenant context boundaries for statistics.
    if (user.role !== 'super_admin') {
      matchStage.$or = [
        { workspaceId: null },
        { workspaceId: user.workspaceId }
      ];
    }

    // Optimization: Combine multiple countDocuments and basic aggregations into a single aggregation pipeline
    // to reduce the number of database round trips and improve efficiency.
    const combinedStats = await TemporalRepository.aggregate([
      { $match: matchStage }, // FIX: Apply tenant filter at the start of the pipeline.
      {
        $group: {
          _id: null, // Group all documents together
          totalRepositories: { $sum: 1 }, // Count all documents
          activeRepositories: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } }, // Conditional sum for active
          archivedRepositories: { $sum: { $cond: [{ $eq: ['$status', 'Archived'] }, 1, 0] } }, // Conditional sum for archived
          totalStars: { $sum: '$stars' },
          avgStars: { $avg: '$stars' }
        }
      }
    ]);

    const countsAndStars = combinedStats[0] || { totalRepositories: 0, activeRepositories: 0, archivedRepositories: 0, totalStars: 0, avgStars: 0 };

    // Optimization: Ensure an index exists on 'license' for this aggregation to be efficient.
    const licenses = await TemporalRepository.aggregate([
      { $match: matchStage }, // FIX: Apply tenant filter here as well.
      {
        $group: {
          _id: '$license', // Group by license to count occurrences
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    return {
      success: true,
      stats: {
        totalRepositories: countsAndStars.totalRepositories,
        activeRepositories: countsAndStars.activeRepositories,
        archivedRepositories: countsAndStars.archivedRepositories,
        totalStars: countsAndStars.totalStars,
        averageStars: Math.round(countsAndStars.avgStars),
        licenses: licenses.map(lic => ({ name: lic._id, count: lic.count }))
      }
    };
  } catch (err) {
    throw new Error(`Failed to retrieve Temporal catalog stats: ${err.message}`);
  }
};

// Automatic startup populating/syncing
setTimeout(() => {
  syncCatalog().catch(err => console.error(`[Temporal Auto Sync] Initial sync failed: ${err.message}`));
}, 5000);

/**
 * @typedef {object} TemporalCatalogService
 * @property {function(): Promise<{ success: boolean, message?: string, count?: number, error?: string }>} syncCatalog - Synchronizes the global temporal catalog with the database.
 * @property {function(object, string, object): Promise<{ success: boolean, total: number, page: number, limit: number, results: Array<Object> }>} searchCatalog - Searches the temporal catalog with various filters and pagination, respecting tenant boundaries.
 * @property {function(object): Promise<{ success: boolean, stats: { totalRepositories: number, activeRepositories: number, archivedRepositories: number, totalStars: number, averageStars: number, licenses: Array<{ name: string, count: number }> } }>} getStats - Retrieves aggregated statistics about the temporal catalog, respecting tenant boundaries.
 */

/**
 * Provides a service layer for managing and querying the Temporal repository catalog.
 * This includes synchronization from local scan results, searching, and retrieving aggregated statistics.
 * All public-facing functions are tenant-aware and require a user context for authorization.
 *
 * // NOTE on Usage Propagation and Limits: This service provides read-only access to the catalog.
 * // If functionality were added for users to 'install' or 'use' a template (e.g., a new 'installTemplate' function),
 * // that new function would be responsible for:
 * // 1. Creating a workspace-specific record of the template usage (e.g., a new document with a workspaceId).
 * // 2. Validating the user's role (e.g., only 'admin' or 'manager' can install new templates).
 * // 3. Checking and decrementing usage quotas for the workspace before proceeding.
 * // 4. Emitting events or creating notifications for workspace owners/managers about new installations or usage.
 * @type {TemporalCatalogService}
 */
export const TemporalCatalogService = {
  syncCatalog,
  searchCatalog,
  getStats
};