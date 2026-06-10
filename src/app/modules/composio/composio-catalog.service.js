import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import util from 'util';
import ComposioRepository from './composio-repository.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATALOG_PATH = path.join(__dirname, '../../../../output/composio-license-catalog.json');
const ROOT_DIR = path.join(__dirname, '../../../../..');
const execFileAsync = util.promisify(execFile);

/**
 * Helper to escape special characters in a string for use in a regular expression.
 * @param {string} string The string to escape.
 * @returns {string} The escaped string, safe for use in a RegExp.
 * @private
 */
const escapeRegExp = (string) => {
  // Escape characters with special meaning either inside or outside character sets.
  // '\\$&' is the replacement pattern that inserts the matched substring,
  // effectively prefixing each special character with a backslash.
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Searches the MongoDB ComposioRepository collection.
 * Supports full-text search relevance matching, license/language filtering, sorting, and pagination.
 * @param {string} [query=''] - The search query string for full-text search against repository name and description.
 * @param {object} [options={}] - The options for filtering, sorting, and pagination.
 * @param {'mit' | 'apache 2.0'} [options.license] - Filter repositories by license.
 * @param {string} [options.language] - Filter repositories by programming language (prefix match).
 * @param {'stars' | 'forks' | 'name'} [options.sortBy='stars'] - Field to sort by when no query is provided.
 * @param {number} [options.limit=20] - The number of results to return per page.
 * @param {number} [options.page=1] - The page number to retrieve.
 * @returns {Promise<{success: boolean, total: number, page: number, limit: number, results: Array<object>}>} A promise that resolves to an object containing the search results and pagination info.
 * @throws {Error} If the database query fails.
 */
const searchComposioCatalog = async (query = '', options = {}) => {
  try {
    const filter = {};

    // Optimization Recommendation: Ensure the ComposioRepository Mongoose model has appropriate indexes for efficient querying.
    // For 'license' and 'language' filtering: schema.index({ license: 1, language: 1 });
    // For sorting: schema.index({ stars: -1 }); schema.index({ forks: -1 });
    // For full-text search: schema.index({ name: 'text', description: 'text' });
    // A compound index can be highly beneficial, e.g.: schema.index({ license: 1, language: 1, stars: -1 });

    // Filter by License (MIT or Apache 2.0)
    if (options.license) {
      const lowerLicense = String(options.license).toLowerCase();
      // Note: This logic is rigid. If more licenses are supported, this should be updated to a more scalable check.
      filter.license = lowerLicense === 'mit' ? 'MIT' : 'Apache 2.0';
    }

    // Filter by Language
    if (options.language) {
      const escapedLanguage = escapeRegExp(String(options.language));
      filter.language = new RegExp(`^${escapedLanguage}`, 'i');
    }

    let queryBuilder;
    const stopWords = new Set(['show', 'me', 'the', 'and', 'its', 'from', 'collection', 'repository', 'repo', 'repositories', 'composio', 'a', 'of', 'in', 'for', 'with', 'on', 'how', 'to', 'find', 'get', 'list', 'search', 'what', 'is', 'are', 'any', 'some', 'about']);

    if (query) {
      const queryWords = String(query).toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));

      if (queryWords.length > 0) {
        // Utilize MongoDB full-text index matching for relevance
        filter.$text = { $search: queryWords.join(' ') };
        queryBuilder = ComposioRepository.find(filter, { score: { $meta: 'textScore' } })
          .sort({ score: { $meta: 'textScore' }, stars: -1 });
      } else {
        // Fallback to basic case-insensitive regex match if query only consists of stopwords or short words
        const escapedQuery = escapeRegExp(String(query));
        filter.$or = [
          { name: { $regex: escapedQuery, $options: 'i' } },
          { description: { $regex: escapedQuery, $options: 'i' } }
        ];
        queryBuilder = ComposioRepository.find(filter).sort({ stars: -1 });
      }
    } else {
      const allowedSortFields = ['stars', 'forks', 'name'];
      const sortBy = allowedSortFields.includes(options.sortBy) ? options.sortBy : 'stars';
      const sortDirection = sortBy === 'name' ? 1 : -1; // Sort name A-Z, others descending
      queryBuilder = ComposioRepository.find(filter).sort({ [sortBy]: sortDirection });
    }

    // Pagination
    const limit = Math.max(1, parseInt(options.limit, 10) || 20);
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const skip = (page - 1) * limit;

    const total = await ComposioRepository.countDocuments(filter);
    // Use .lean() for performance improvement on read-only operations
    const results = await queryBuilder.skip(skip).limit(limit).lean();

    return {
      success: true,
      total,
      page,
      limit,
      results: results.map(repo => ({
        ...repo,
        org: 'ComposioHQ',
        domain: 'github.com/ComposioHQ'
      }))
    };
  } catch (err) {
    // Log the detailed error for internal review without exposing it to the client.
    console.error(`[ComposioCatalogService] searchComposioCatalog failed: ${err}`);
    throw new Error('Failed to query the Composio catalog.');
  }
};

/**
 * Programmatically triggers the Git submodule import command to register a Composio repository.
 * It first validates that the repository exists in the catalog and performs security checks
 * on the repository name and URL before executing the git command.
 * @param {string} repoName - The exact name of the Composio repository to import.
 * @returns {Promise<{success: boolean, message: string, details?: string, path?: string, clone_url?: string, output?: string, suggestions?: string[]}>} A promise that resolves to an object indicating the result of the import operation.
 * @throws {Error} If an invalid `repoName` is provided.
 */
const importComposioSubmodule = async (repoName) => {
  if (!repoName || typeof repoName !== 'string') {
    throw new Error('Repository name is required for import.');
  }

  // Use the existing search function to find potential matches
  const catalogResult = await searchComposioCatalog(repoName);
  if (!catalogResult.success || catalogResult.results.length === 0) {
    return {
      success: false,
      message: `Repository "${repoName}" was not found in the scanned Composio catalog.`
    };
  }

  // Find an exact, case-insensitive match from the search results
  const match = catalogResult.results.find(
    r => r.name.toLowerCase() === repoName.toLowerCase()
  );

  if (!match) {
    return {
      success: false,
      message: `No exact match found for repository "${repoName}".`,
      suggestions: catalogResult.results.map(r => r.name).slice(0, 5) // Provide a few suggestions
    };
  }

  // Security: Validate repository name to prevent directory traversal and command injection
  if (!/^[a-zA-Z0-9_.-]+$/.test(match.name)) {
    return { success: false, message: 'Invalid repository name format.' };
  }

  // Security: Validate clone URL to prevent command/argument injection
  const gitUrlRegex = /^https:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.git$/;
  if (!match.clone_url || !gitUrlRegex.test(match.clone_url)) {
    return { success: false, message: 'Invalid or non-standard repository clone URL format.' };
  }

  const submodulePath = `external/composio/${match.name}`;
  const localComposioPath = path.join(ROOT_DIR, 'external/composio');

  // Security: Verify resolved path is within the expected directory to prevent directory traversal
  const resolvedSubmodulePath = path.resolve(ROOT_DIR, submodulePath);
  if (!resolvedSubmodulePath.startsWith(path.resolve(localComposioPath))) {
    return { success: false, message: 'Invalid repository path resolution.' };
  }

  try {
    // Use async file system operations to avoid blocking the event loop.
    await fs.mkdir(localComposioPath, { recursive: true });

    console.log(`[ComposioCatalogService] Importing: git submodule add ${match.clone_url} ${submodulePath}`);

    // Use promisified execFile for cleaner async/await syntax and to prevent shell command injection.
    const { stdout } = await execFileAsync(
      'git',
      ['submodule', 'add', match.clone_url, submodulePath],
      { cwd: ROOT_DIR }
    );

    return {
      success: true,
      message: `Successfully imported Composio repository "${match.name}" as a submodule.`,
      path: submodulePath,
      clone_url: match.clone_url,
      output: stdout
    };
  } catch (error) {
    return {
      success: false,
      message: `Git command failed: ${error.message}`,
      details: error.stderr || 'No standard error output.'
    };
  }
};

/**
 * Returns analytical statistics about the loaded Composio catalog from the database.
 * @returns {Promise<{success: boolean, stats: {totalRepositories: number, totalStars: number, totalForks: number, averageStars: number, languages: Array<{name: string, count: number}>, licenses: Array<{name: string, count: number}>}}}>} A promise that resolves to an object containing catalog statistics.
 * @throws {Error} If the database aggregation queries fail.
 */
const getComposioStats = async () => {
  try {
    // Optimization Recommendation: Ensure indexes exist on fields used in aggregations
    // (e.g., language, license, stars, forks) for better performance.

    const [totalRepos, aggregations, languages, licenses] = await Promise.all([
      ComposioRepository.countDocuments({}),
      // Star and Fork aggregations
      ComposioRepository.aggregate([
        {
          $group: {
            _id: null,
            totalStars: { $sum: '$stars' },
            totalForks: { $sum: '$forks' },
            avgStars: { $avg: '$stars' }
          }
        }
      ]),
      // Language splits
      ComposioRepository.aggregate([
        { $match: { language: { $ne: null, $ne: '' } } }, // Ensure clean data by filtering out null/empty values
        { $group: { _id: '$language', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 } // Return top 10 languages
      ]),
      // License splits
      ComposioRepository.aggregate([
        { $match: { license: { $ne: null, $ne: '' } } }, // Ensure clean data
        { $group: { _id: '$license', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    const baseStats = aggregations[0] || { totalStars: 0, totalForks: 0, avgStars: 0 };

    return {
      success: true,
      stats: {
        totalRepositories: totalRepos,
        totalStars: baseStats.totalStars,
        totalForks: baseStats.totalForks,
        averageStars: Math.round(baseStats.avgStars),
        languages: languages.map(lang => ({ name: lang._id, count: lang.count })),
        licenses: licenses.map(lic => ({ name: lic._id, count: lic.count }))
      }
    };
  } catch (err) {
    console.error(`[ComposioCatalogService] getComposioStats failed: ${err}`);
    throw new Error('Failed to calculate Composio catalog stats.');
  }
};

/**
 * A service object that encapsulates all operations related to the Composio catalog.
 * This includes searching, importing, and retrieving statistics about Composio repositories.
 * @exports ComposioCatalogService
 */
export const ComposioCatalogService = {
  searchComposioCatalog,
  importComposioSubmodule,
  getComposioStats
};