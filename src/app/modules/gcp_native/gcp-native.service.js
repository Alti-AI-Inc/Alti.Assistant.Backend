import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process'; // Changed from 'exec' to 'spawn' for security
import { fileURLToPath } from 'url';
import GoogleRepository from './gcp-repository.model.js';

// Utility function to escape special characters for use in a regular expression
const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
};

// Recommended MongoDB Indexes for GoogleRepository model:
// These indexes should be defined in 'gcp-repository.model.js' to optimize queries.
//
// 1. For full-text search ($text):
//    GoogleRepositorySchema.index({ name: 'text', description: 'text' /* Add other relevant text fields like 'tags' if applicable */ });
//
// 2. For filtering by 'license' (equality match):
//    GoogleRepositorySchema.index({ license: 1 });
//
// 3. For filtering by 'language' (prefix regex match):
//    GoogleRepositorySchema.index({ language: 1 });
//
// 4. For sorting by 'stars':
//    GoogleRepositorySchema.index({ stars: -1 });
//
// 5. Compound indexes for common filter/sort combinations (consider based on your most frequent query patterns):
//    - If filtering by license and sorting by stars:
//      GoogleRepositorySchema.index({ license: 1, stars: -1 });
//    - If filtering by language and sorting by stars:
//      GoogleRepositorySchema.index({ language: 1, stars: -1 });
//    - If filtering by both license and language, and sorting by stars:
//      GoogleRepositorySchema.index({ license: 1, language: 1, stars: -1 });
//
// Ensure these indexes are created in your MongoDB deployment for optimal performance.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATALOG_PATH = path.join(__dirname, '../../../../output/gcp-license-catalog.json');
const ROOT_DIR = path.join(__dirname, '../../../../..');

/**
 * Searches the MongoDB GoogleRepository collection for Google and GCP repositories.
 * Supports full-text search relevance matching, license/language filtering, and sorting.
 */
const searchGcpCatalog = async (query = '', options = {}) => {
  try {
    let filter = {};

    // Filter by License (MIT or Apache 2.0)
    if (options.license) {
      const lowerLicense = options.license.toLowerCase();
      filter.license = lowerLicense === 'mit' ? 'MIT' : 'Apache 2.0';
    }

    // Filter by Language - FIX: Escape regex special characters to prevent ReDoS/Regex Injection
    if (options.language) {
      filter.language = new RegExp(`^${escapeRegExp(options.language)}`, 'i');
    }

    let queryBuilder;

    if (query) {
      const stopWords = new Set(['show', 'me', 'the', 'and', 'its', 'from', 'collection', 'repository', 'repo', 'repositories', 'google', 'cloud', 'platform', 'gcp', 'a', 'of', 'in', 'for', 'with', 'on', 'how', 'to', 'find', 'get', 'list', 'search', 'what', 'is', 'are', 'any', 'some', 'about']);
      const queryWords = query.toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));

      if (queryWords.length > 0) {
        // Utilize MongoDB full-text index matching
        filter.$text = { $search: queryWords.join(' ') };
        queryBuilder = GoogleRepository.find(filter, { score: { $meta: 'textScore' } })
          .sort({ score: { $meta: 'textScore' }, stars: -1 });
      } else {
        // Fallback to basic case-insensitive regex match if query only consists of stopwords
        // FIX: Escape regex special characters in the fallback query to prevent ReDoS/Regex Injection
        // Note: Regex queries without a leading '^' cannot efficiently use indexes
        // (i.e., they often result in collection scans). For better performance on
        // 'name' and 'description' regex searches, consider using MongoDB Atlas Search
        // or a dedicated search engine like Elasticsearch.
        const escapedQuery = escapeRegExp(query);
        filter.$or = [
          { name: { $regex: escapedQuery, $options: 'i' } },
          { description: { $regex: escapedQuery, $options: 'i' } }
        ];
        queryBuilder = GoogleRepository.find(filter).sort({ stars: -1 });
      }
    } else {
      // FIX: Validate sortBy option against a whitelist to prevent MongoDB Operator Injection
      const allowedSortFields = ['stars', 'name', 'license', 'language']; // Add other fields if needed
      const sortBy = allowedSortFields.includes(options.sortBy) ? options.sortBy : 'stars';
      queryBuilder = GoogleRepository.find(filter).sort({ [sortBy]: -1 });
    }

    // Pagination
    const limit = options.limit ? parseInt(options.limit) : 20;
    const page = options.page ? parseInt(options.page) : 1;
    const startIndex = (page - 1) * limit;

    const total = await GoogleRepository.countDocuments(filter);
    // .lean() is already used, which is good for performance as it returns plain JavaScript objects.
    const results = await queryBuilder.skip(startIndex).limit(limit).lean();

    return {
      success: true,
      total,
      page,
      limit,
      results: results.map(repo => ({
        ...repo,
        org: repo.org || 'GoogleCloudPlatform',
        domain: repo.org === 'google' ? 'github.com/google' : 'github.com/GoogleCloudPlatform'
      }))
    };
  } catch (err) {
    throw new Error(`Failed to query Google/GCP catalog in MongoDB: ${err.message}`);
  }
};

/**
 * Programmatically triggers the Git submodule import command to register a GCP repo.
 */
const importGcpSubmodule = async (repoName) => {
  if (!repoName) {
    throw new Error('Repository name is required for import.');
  }

  // This calls searchGcpCatalog once, avoiding N+1 query issues.
  const catalogResult = await searchGcpCatalog(repoName);
  if (!catalogResult.success || catalogResult.results.length === 0) {
    return {
      success: false,
      message: `Repository "${repoName}" was not found in the scanned GCP catalog.`
    };
  }

  // Exact match search
  const match = catalogResult.results.find(
    r => r.name.toLowerCase() === repoName.toLowerCase()
  );

  if (!match) {
    return {
      success: false,
      message: `Repository "${repoName}" did not match exactly.`,
      suggestions: catalogResult.results.map(r => r.name)
    };
  }

  // FIX: Sanitize match.name to prevent path traversal vulnerabilities
  // Allow alphanumeric, hyphens, underscores, and periods. Remove other characters.
  const sanitizedRepoName = match.name.replace(/[^a-zA-Z0-9-_.]/g, '');
  if (!sanitizedRepoName) {
    return {
      success: false,
      message: `Sanitized repository name is empty after cleaning: "${match.name}"`
    };
  }

  const submodulePath = `external/gcp/${sanitizedRepoName}`;
  const localGcpPath = path.join(ROOT_DIR, 'external/gcp');

  return new Promise((resolve) => {
    // fs.existsSync and fs.mkdirSync are synchronous but for a single,
    // non-looping operation like this, their performance impact is negligible.
    if (!fs.existsSync(localGcpPath)) {
      fs.mkdirSync(localGcpPath, { recursive: true });
    }

    console.log(`Programmatic import: git submodule add ${match.clone_url} ${submodulePath}`);

    // FIX: Use child_process.spawn instead of exec to prevent command injection.
    // Arguments are passed as an array, preventing shell interpretation of special characters
    // in match.clone_url and submodulePath.
    const gitProcess = spawn(
      'git',
      ['submodule', 'add', match.clone_url, submodulePath],
      { cwd: ROOT_DIR }
    );

    let stdout = '';
    let stderr = '';

    gitProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    gitProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    gitProcess.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          message: `Git command failed with exit code ${code}`,
          details: stderr,
          output: stdout
        });
      } else {
        resolve({
          success: true,
          message: `Successfully imported GCP repository "${match.name}" as a submodule!`,
          path: submodulePath,
          clone_url: match.clone_url,
          output: stdout
        });
      }
    });

    gitProcess.on('error', (err) => {
      // This error event handles issues like 'git' command not found or other spawn errors
      resolve({
        success: false,
        message: `Failed to start git process: ${err.message}`,
        details: err.message
      });
    });
  });
};

export const GcpNativeService = {
  searchGcpCatalog,
  importGcpSubmodule
};