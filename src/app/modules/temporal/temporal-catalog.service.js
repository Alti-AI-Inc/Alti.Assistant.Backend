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


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root path points to workspace root: c:/Users/hyper/workspace/Alti.Assistant
const ROOT_DIR = path.join(__dirname, '../../../../..');
const SCAN_RESULTS_PATH = path.join(ROOT_DIR, 'scan_results.json');

/**
 * Synchronizes the scanned approved repositories from scan_results.json into MongoDB.
 * Ensures the actual folders exist under external/temporal.
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
          { name },
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
            status: repo.archived ? 'Archived' : 'Active'
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
 * Queries the MongoDB TemporalRepository collection with strict filters, input sanitation,
 * whitelisted sorting fields, and bounded pagination limits to guarantee absolute security.
 */
const searchCatalog = async (query = '', options = {}) => {
  try {
    let filter = {};

    // 1. Strict Input Sanitation - strip potentially hazardous injection characters
    const sanitizedQuery = (typeof query === 'string') 
      ? query.replace(/[^\w\s\-\.\/]/g, '').trim() 
      : '';

    // 2. Filter Sanitation - enforce whitelisted options
    if (options.license) {
      const lowerLicense = options.license.toLowerCase();
      // Optimization: Ensure an index exists on 'license' for efficient filtering.
      if (['mit', 'apache-2.0'].includes(lowerLicense)) {
        filter.license_key = lowerLicense;
      }
    }

    if (options.status) {
      const statusStr = String(options.status);
      // Optimization: Ensure an index exists on 'status' for efficient filtering.
      if (['Active', 'Archived'].includes(statusStr)) {
        filter.status = statusStr;
      }
    }

    let queryBuilder;

    if (sanitizedQuery) {
      const stopWords = new Set(['show', 'me', 'the', 'and', 'its', 'from', 'collection', 'repository', 'repo', 'repositories', 'temporal', 'a', 'of', 'in', 'for', 'with', 'on']);
      const queryWords = sanitizedQuery.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));

      if (queryWords.length > 0) {
        // Optimization: Ensure a text index exists on 'name' and 'description' for optimal performance with $text search.
        // Example: TemporalRepositorySchema.index({ name: 'text', description: 'text' });
        filter.$text = { $search: queryWords.join(' ') };
        queryBuilder = TemporalRepository.find(filter, { score: { $meta: 'textScore' } })
          .sort({ score: { $meta: 'textScore' }, stars: -1 });
      } else {
        // For regex queries, especially case-insensitive ones without a leading '^', indexes are less effective.
        // However, a basic index on 'name' and 'description' can still offer some benefit for other query patterns.
        filter.$or = [
          { name: { $regex: sanitizedQuery, $options: 'i' } },
          { description: { $regex: sanitizedQuery, $options: 'i' } }
        ];
        // Optimization: Ensure an index exists on 'stars' for efficient sorting.
        queryBuilder = TemporalRepository.find(filter).sort({ stars: -1 });
      }
    } else {
      // 3. Sort Key Whitelisting - completely blocks custom SQL/NoSQL sorting injection vectors
      const whitelistedSortFields = ['stars', 'name', 'createdAt'];
      const sortBy = whitelistedSortFields.includes(options.sortBy) ? options.sortBy : 'stars';
      // Optimization: Ensure indexes exist on 'stars', 'name', and 'createdAt' for efficient sorting.
      queryBuilder = TemporalRepository.find(filter).sort({ [sortBy]: -1 });
    }

    // 4. Bounded Pagination - prevents DOS attacks via large limit requests
    const page = Math.max(1, parseInt(options.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
    const startIndex = (page - 1) * limit;

    // countDocuments is generally efficient for simple counts.
    const total = await TemporalRepository.countDocuments(filter);
    // .lean() is correctly applied here for performance, returning plain JavaScript objects
    // instead of Mongoose documents, which reduces overhead if no further Mongoose methods are needed.
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
 * Calculates aggregated statistics about the installed Temporal catalog.
 */
const getStats = async () => {
  try {
    // Optimization: Combine multiple countDocuments and basic aggregations into a single aggregation pipeline
    // to reduce the number of database round trips and improve efficiency.
    const combinedStats = await TemporalRepository.aggregate([
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

export const TemporalCatalogService = {
  syncCatalog,
  searchCatalog,
  getStats
};