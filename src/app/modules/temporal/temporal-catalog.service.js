import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import TemporalRepository from './temporal-repository.model.js';

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

    const data = JSON.parse(fs.readFileSync(SCAN_RESULTS_PATH, 'utf-8'));
    const approved = data.approved || [];
    
    console.log(`[Temporal Sync] Syncing ${approved.length} approved repositories to MongoDB...`);
    
    let upsertedCount = 0;
    
    for (const repo of approved) {
      const name = repo.name;
      const local_path = path.join('external', 'temporal', name);
      const full_local_path = path.join(ROOT_DIR, local_path);
      
      // Only sync if the repository folder exists locally (fully installed)
      if (!fs.existsSync(full_local_path)) {
        continue;
      }
      
      await TemporalRepository.findOneAndUpdate(
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
      );
      upsertedCount++;
    }
    
    console.log(`[Temporal Sync] Successfully synchronized ${upsertedCount} repositories in MongoDB.`);
    return { success: true, count: upsertedCount };
  } catch (err) {
    console.error(`[Temporal Sync] Synchronization failed: ${err.message}`);
    return { success: false, error: err.message };
  }
};

/**
 * Queries the MongoDB TemporalRepository collection with filters, pagination, and search.
 */
const searchCatalog = async (query = '', options = {}) => {
  try {
    let filter = {};

    // Filter by License (mit or apache-2.0)
    if (options.license) {
      filter.license_key = options.license.toLowerCase();
    }

    // Filter by Status (Active or Archived)
    if (options.status) {
      filter.status = options.status;
    }

    let queryBuilder;

    if (query) {
      const stopWords = new Set(['show', 'me', 'the', 'and', 'its', 'from', 'collection', 'repository', 'repo', 'repositories', 'temporal', 'a', 'of', 'in', 'for', 'with', 'on']);
      const queryWords = query.toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));

      if (queryWords.length > 0) {
        filter.$text = { $search: queryWords.join(' ') };
        queryBuilder = TemporalRepository.find(filter, { score: { $meta: 'textScore' } })
          .sort({ score: { $meta: 'textScore' }, stars: -1 });
      } else {
        filter.$or = [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } }
        ];
        queryBuilder = TemporalRepository.find(filter).sort({ stars: -1 });
      }
    } else {
      const sortBy = options.sortBy || 'stars';
      queryBuilder = TemporalRepository.find(filter).sort({ [sortBy]: -1 });
    }

    // Pagination
    const limit = options.limit ? parseInt(options.limit) : 20;
    const page = options.page ? parseInt(options.page) : 1;
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
 * Calculates aggregated statistics about the installed Temporal catalog.
 */
const getStats = async () => {
  try {
    const totalRepos = await TemporalRepository.countDocuments({});
    const activeCount = await TemporalRepository.countDocuments({ status: 'Active' });
    const archivedCount = await TemporalRepository.countDocuments({ status: 'Archived' });
    
    const aggregations = await TemporalRepository.aggregate([
      {
        $group: {
          _id: null,
          totalStars: { $sum: '$stars' },
          avgStars: { $avg: '$stars' }
        }
      }
    ]);

    const stats = aggregations[0] || { totalStars: 0, avgStars: 0 };

    const licenses = await TemporalRepository.aggregate([
      {
        $group: {
          _id: '$license',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    return {
      success: true,
      stats: {
        totalRepositories: totalRepos,
        activeRepositories: activeCount,
        archivedRepositories: archivedCount,
        totalStars: stats.totalStars,
        averageStars: Math.round(stats.avgStars),
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
