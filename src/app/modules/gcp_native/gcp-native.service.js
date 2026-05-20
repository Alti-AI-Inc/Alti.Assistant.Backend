import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import GoogleRepository from './gcp-repository.model.js';

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

    // Filter by Language
    if (options.language) {
      filter.language = new RegExp(`^${options.language}$`, 'i');
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
        filter.$or = [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } }
        ];
        queryBuilder = GoogleRepository.find(filter).sort({ stars: -1 });
      }
    } else {
      const sortBy = options.sortBy || 'stars';
      queryBuilder = GoogleRepository.find(filter).sort({ [sortBy]: -1 });
    }

    // Pagination
    const limit = options.limit ? parseInt(options.limit) : 20;
    const page = options.page ? parseInt(options.page) : 1;
    const startIndex = (page - 1) * limit;

    const total = await GoogleRepository.countDocuments(filter);
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

  const submodulePath = `external/gcp/${match.name}`;
  const localGcpPath = path.join(ROOT_DIR, 'external/gcp');

  return new Promise((resolve) => {
    if (!fs.existsSync(localGcpPath)) {
      fs.mkdirSync(localGcpPath, { recursive: true });
    }

    console.log(`Programmatic import: git submodule add ${match.clone_url} ${submodulePath}`);
    exec(
      `git submodule add ${match.clone_url} ${submodulePath}`,
      { cwd: ROOT_DIR },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            message: `Git command failed: ${error.message}`,
            details: stderr
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
      }
    );
  });
};

export const GcpNativeService = {
  searchGcpCatalog,
  importGcpSubmodule
};
