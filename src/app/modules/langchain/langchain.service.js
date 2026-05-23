import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import LangchainRepository from './langchain-repository.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATALOG_PATH = path.join(__dirname, '../../../../output/langchain-license-catalog.json');
const ROOT_DIR = path.join(__dirname, '../../../../..');

/**
 * Searches the MongoDB LangchainRepository collection.
 * Supports full-text search relevance matching, license/language filtering, and sorting.
 */
const searchLangchainCatalog = async (query = '', options = {}) => {
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
      const stopWords = new Set(['show', 'me', 'the', 'and', 'its', 'from', 'collection', 'repository', 'repo', 'repositories', 'langchain', 'langgraph', 'a', 'of', 'in', 'for', 'with', 'on', 'how', 'to', 'find', 'get', 'list', 'search', 'what', 'is', 'are', 'any', 'some', 'about']);
      const queryWords = query.toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));

      if (queryWords.length > 0) {
        // Utilize MongoDB full-text index matching
        filter.$text = { $search: queryWords.join(' ') };
        queryBuilder = LangchainRepository.find(filter, { score: { $meta: 'textScore' } })
          .sort({ score: { $meta: 'textScore' }, stars: -1 });
      } else {
        // Fallback to basic case-insensitive regex match if query only consists of stopwords
        filter.$or = [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } }
        ];
        queryBuilder = LangchainRepository.find(filter).sort({ stars: -1 });
      }
    } else {
      const sortBy = options.sortBy || 'stars';
      queryBuilder = LangchainRepository.find(filter).sort({ [sortBy]: -1 });
    }

    // Pagination
    const limit = options.limit ? parseInt(options.limit) : 20;
    const page = options.page ? parseInt(options.page) : 1;
    const startIndex = (page - 1) * limit;

    const total = await LangchainRepository.countDocuments(filter);
    const results = await queryBuilder.skip(startIndex).limit(limit).lean();

    return {
      success: true,
      total,
      page,
      limit,
      results: results.map(repo => ({
        ...repo,
        org: 'langchain-ai',
        domain: 'github.com/langchain-ai'
      }))
    };
  } catch (err) {
    throw new Error(`Failed to query LangChain catalog in MongoDB: ${err.message}`);
  }
};

/**
 * Programmatically triggers the Git submodule import command to register a LangChain repo.
 */
const importLangchainSubmodule = async (repoName) => {
  if (!repoName) {
    throw new Error('Repository name is required for import.');
  }

  const catalogResult = await searchLangchainCatalog(repoName);
  if (!catalogResult.success || catalogResult.results.length === 0) {
    return {
      success: false,
      message: `Repository "${repoName}" was not found in the scanned LangChain catalog.`
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

  const submodulePath = `external/langchain/${match.name}`;
  const localLangchainPath = path.join(ROOT_DIR, 'external/langchain');

  return new Promise((resolve) => {
    if (!fs.existsSync(localLangchainPath)) {
      fs.mkdirSync(localLangchainPath, { recursive: true });
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
            message: `Successfully imported LangChain repository "${match.name}" as a submodule!`,
            path: submodulePath,
            clone_url: match.clone_url,
            output: stdout
          });
        }
      }
    );
  });
};

/**
 * Returns analytical statistics about the loaded LangChain catalog.
 */
const getLangchainStats = async () => {
  try {
    const totalRepos = await LangchainRepository.countDocuments({});
    
    // Star and Fork aggregations
    const aggregations = await LangchainRepository.aggregate([
      {
        $group: {
          _id: null,
          totalStars: { $sum: '$stars' },
          totalForks: { $sum: '$forks' },
          avgStars: { $avg: '$stars' }
        }
      }
    ]);

    const stats = aggregations[0] || { totalStars: 0, totalForks: 0, avgStars: 0 };

    // Language splits
    const languages = await LangchainRepository.aggregate([
      {
        $group: {
          _id: '$language',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // License splits
    const licenses = await LangchainRepository.aggregate([
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
        totalStars: stats.totalStars,
        totalForks: stats.totalForks,
        averageStars: Math.round(stats.avgStars),
        languages: languages.map(lang => ({ name: lang._id, count: lang.count })),
        licenses: licenses.map(lic => ({ name: lic._id, count: lic.count }))
      }
    };
  } catch (err) {
    throw new Error(`Failed to calculate LangChain catalog stats: ${err.message}`);
  }
};

export const LangchainService = {
  searchLangchainCatalog,
  importLangchainSubmodule,
  getLangchainStats
};
