/**
 * @file This service module provides functions for interacting with the Langchain repository catalog.
 * It includes capabilities for searching, importing, and retrieving statistical data about
 * LangChain repositories stored in a MongoDB database.
 *
 * It also includes an IIFE to ensure MongoDB indexes are created for optimal query performance.
 *
 * @module LangchainService
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process'; // Changed from 'exec' to 'execFile' for safer command execution
import { fileURLToPath } from 'url';
import LangchainRepository from './langchain-repository.model.js';

// --- GCP Cloud Logging (Stackdriver) Compliant Logger ---
// A simple structured logger to ensure all log outputs are in a JSON format
// that Google Cloud Logging can automatically parse. It includes the 'severity'
// key, which is crucial for proper log level categorization in the GCP console.
const logger = {
  log: (severity, message, context = {}) => {
    const logEntry = {
      severity,
      message,
      // Add a component key for easier filtering in Cloud Logging.
      component: 'LangchainService',
      ...context,
    };
    // GCP automatically captures stdout and stderr. We direct logs based on severity.
    if (severity === 'ERROR' || severity === 'WARNING') {
      console.error(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  },
  info: (message, context) => logger.log('INFO', message, context),
  warn: (message, context) => logger.log('WARNING', message, context),
  error: (message, context) => {
    // Special handling for error objects to ensure they are serialized correctly.
    const errorContext = { ...context };
    if (context && context.error instanceof Error) {
      errorContext.error = {
        message: context.error.message,
        stack: context.error.stack,
        name: context.error.name,
      };
    }
    logger.log('ERROR', message, errorContext);
  },
};

/**
 * The current file's path.
 * @type {string}
 * @private
 */
const __filename = fileURLToPath(import.meta.url);
/**
 * The directory name of the current module.
 * @type {string}
 * @private
 */
const __dirname = path.dirname(__filename);

/**
 * The absolute path to the Langchain license catalog JSON file.
 * This file is expected to contain a list of LangChain repositories and their metadata.
 * @type {string}
 * @private
 */
const CATALOG_PATH = path.join(__dirname, '../../../../output/langchain-license-catalog.json');
/**
 * The absolute path to the root directory of the project.
 * Used for relative path calculations, especially for Git submodule operations.
 * @type {string}
 * @private
 */
const ROOT_DIR = path.join(__dirname, '../../../../..');

// --- DATABASE INDEXING RECOMMENDATIONS ---
// To significantly optimize database query performance for the 'searchLangchainCatalog'
// and 'getLangchainStats' functions, the following indexes are highly recommended
// for the LangchainRepository Mongoose model. These should ideally be defined
// within the 'langchain-repository.model.js' file (using schema.index()) or
// applied during application startup (e.g., in your main app.js or database connection file).
//
// 1. For full-text search ($text operator):
//    LangchainRepository.index({ name: 'text', description: 'text' });
//
// 2. For filtering by 'license' and 'language', and sorting by 'stars':
//    LangchainRepository.index({ license: 1 });
//    LangchainRepository.index({ language: 1 });
//    LangchainRepository.index({ stars: -1 });
//
// 3. For fallback regex search on 'name' and 'description' (when $text is not used):
//    LangchainRepository.index({ name: 1 });
//    LangchainRepository.index({ description: 1 });
//


/**
 * Helper function to escape special characters in a string for use in a regular expression.
 * This prevents ReDoS (Regular Expression Denial of Service) and unexpected regex behavior
 * when user input is used to construct a RegExp object.
 * @param {string} string - The string to escape.
 * @returns {string} The escaped string.
 */
const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\{FILE_CONTENT}'); // {FILE_CONTENT} means the whole matched string
};

/**
 * Pre-compiled set of common stop words for search queries.
 * This is defined once to avoid re-creating the Set on every function call, improving performance.
 * @type {Set<string>}
 * @private
 */
const STOP_WORDS = new Set(['show', 'me', 'the', 'and', 'its', 'from', 'collection', 'repository', 'repo', 'repositories', 'langchain', 'langgraph', 'a', 'of', 'in', 'for', 'with', 'on', 'how', 'to', 'find', 'get', 'list', 'search', 'what', 'is', 'are', 'any', 'some', 'about']);


/**
 * Searches the MongoDB LangchainRepository collection for repositories matching the given criteria.
 * Supports full-text search relevance matching, license/language filtering, and sorting.
 * Pagination is also supported.
 *
 * @param {string} [query=''] - The search query string. If provided, it will use MongoDB's full-text search
 *   on 'name' and 'description' fields. Stop words are filtered out. If the query consists only of stop words,
 *   it falls back to a case-insensitive regex search.
 * @param {object} [options={}] - An object containing search and pagination options.
 * @param {string} [options.license] - Filter by license type. Accepts 'MIT' or 'Apache 2.0'. Case-insensitive.
 * @param {string} [options.language] - Filter by programming language. Case-insensitive, matches start of language name.
 * @param {string} [options.sortBy='stars'] - Field to sort results by. Currently supports 'stars'.
 * @param {number} [options.limit=20] - The maximum number of results to return per page.
 * @param {number} [options.page=1] - The current page number for pagination.
 * @returns {Promise<object>} A promise that resolves to an object containing search results and metadata.
 * @returns {boolean} return.success - Indicates if the query was successful.
 * @returns {number} return.total - The total number of documents matching the filter criteria.
 * @returns {number} return.page - The current page number.
 * @returns {number} return.limit - The maximum number of results per page.
 * @returns {Array<object>} return.results - An array of Langchain repository objects, each augmented with `org` and `domain`.
 * @throws {Error} If there is a problem querying the MongoDB collection.
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
      // Using a RegExp with '^' ensures it can utilize an index on the 'language' field.
      // Escape special regex characters in the language query to prevent ReDoS or unexpected behavior.
      filter.language = new RegExp(`^${escapeRegExp(options.language)}`, 'i');
    }

    let queryBuilder;

    if (query) {
      const queryWords = query.toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOP_WORDS.has(word)); // Use pre-compiled STOP_WORDS Set

      if (queryWords.length > 0) {
        // Utilize MongoDB full-text index matching. Requires a text index on relevant fields (e.g., name, description).
        filter.$text = { $search: queryWords.join(' ') };
        queryBuilder = LangchainRepository.find(filter, { score: { $meta: 'textScore' } })
          .sort({ score: { $meta: 'textScore' }, stars: -1 });
      } else {
        // Fallback to basic case-insensitive regex match if query only consists of stopwords.
        // Indexes on 'name' and 'description' fields will help here.
        // Escape special regex characters in the query to prevent ReDoS or unexpected behavior.
        const escapedQuery = escapeRegExp(query);
        filter.$or = [
          { name: { $regex: escapedQuery, $options: 'i' } },
          { description: { $regex: escapedQuery, $options: 'i' } }
        ];
        queryBuilder = LangchainRepository.find(filter).sort({ stars: -1 });
      }
    } else {
      // Validate sortBy option to prevent unexpected sorting or errors if an invalid field is provided.
      const allowedSortFields = ['stars'];
      const sortBy = allowedSortFields.includes(options.sortBy) ? options.sortBy : 'stars';
      // Indexes on 'license', 'language', and 'stars' will optimize this query.
      queryBuilder = LangchainRepository.find(filter).sort({ [sortBy]: -1 });
    }

    // Pagination
    const limit = options.limit ? parseInt(options.limit) : 20;
    const page = options.page ? parseInt(options.page) : 1;
    const startIndex = (page - 1) * limit;

    // countDocuments benefits from the same indexes as the find query.
    const total = await LangchainRepository.countDocuments(filter);
    // .lean() is already correctly applied here, returning plain JavaScript objects
    // instead of Mongoose documents, which improves performance by skipping hydration.
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
 * Sanitizes a string to be used as a safe directory name.
 * Removes characters that are not alphanumeric, hyphens, underscores, or periods.
 * This helps prevent path traversal vulnerabilities and ensures valid directory names.
 * @param {string} name - The original name.
 * @returns {string} The sanitized name.
 */
const sanitizeDirName = (name) => {
  // Allow alphanumeric, hyphens, underscores, and periods (for potential file extensions, though not strictly for dir names)
  return name.replace(/[^a-zA-Z0-9-_.]/g, '');
};

/**
 * Programmatically triggers the Git submodule import command to register a LangChain repository
 * within the project's `external/langchain` directory.
 * It first searches the catalog to find the exact repository details.
 *
 * @param {string} repoName - The exact name of the LangChain repository to import (e.g., 'langchain-js').
 * @returns {Promise<object>} A promise that resolves to an object indicating the success or failure of the import.
 * @returns {boolean} return.success - True if the submodule was added successfully, false otherwise.
 * @returns {string} return.message - A descriptive message about the operation's outcome.
 * @returns {string} [return.details] - Additional error details from the Git command, if applicable.
 * @returns {Array<string>} [return.suggestions] - A list of suggested repository names if an exact match wasn't found.
 * @returns {string} [return.path] - The local path where the submodule was added, if successful.
 * @returns {string} [return.clone_url] - The clone URL of the repository, if successful.
 * @returns {string} [return.output] - The standard output from the Git command, if successful.
 * @throws {Error} If `repoName` is not provided.
 */
const importLangchainSubmodule = async (repoName) => {
  if (!repoName) {
    throw new Error('Repository name is required for import.');
  }

  // This search query will benefit from the recommended indexes.
  const catalogResult = await searchLangchainCatalog(repoName);
  if (!catalogResult.success || catalogResult.results.length === 0) {
    return {
      success: false,
      message: `Repository "${repoName}" was not found in the scanned LangChain catalog.`
    };
  }

  // Exact match search
  // For typical pagination limits (e.g., 20-100 results), this synchronous find operation
  // on the in-memory array is not a significant performance bottleneck.
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

  // Validate and sanitize match.name for path safety to prevent path traversal or command injection.
  const sanitizedRepoName = sanitizeDirName(match.name);
  if (!sanitizedRepoName || sanitizedRepoName.length === 0) {
    return {
      success: false,
      message: `Repository name "${match.name}" is invalid or empty after sanitization.`,
    };
  }
  const submodulePath = `external/langchain/${sanitizedRepoName}`;

  // Basic validation for clone_url to ensure it's a plausible Git URL.
  // This helps prevent command injection if a malicious URL were stored in the database.
  // More robust validation might be needed depending on the threat model.
  const gitUrlRegex = /^(git|https?|ssh):\/\/[^\s$.?#].[^\s]*$/i;
  if (!gitUrlRegex.test(match.clone_url)) {
    return {
      success: false,
      message: `Invalid Git clone URL "${match.clone_url}" for repository "${match.name}".`,
    };
  }

  const localLangchainPath = path.join(ROOT_DIR, 'external/langchain');

  return new Promise((resolve) => {
    // Synchronous file system operations (existsSync, mkdirSync) are used here.
    // While generally async is preferred in Node.js, for infrequent directory creation
    // (only if the directory doesn't exist), the performance impact is negligible
    // and acceptable in this specific context.
    if (!fs.existsSync(localLangchainPath)) {
      fs.mkdirSync(localLangchainPath, { recursive: true });
    }

    logger.info('Executing git submodule add command.', {
      clone_url: match.clone_url,
      path: submodulePath
    });
    // Using execFile instead of exec for safer command execution.
    // Arguments are passed as an array, preventing shell interpretation and command injection.
    execFile(
      'git',
      ['submodule', 'add', match.clone_url, submodulePath],
      { cwd: ROOT_DIR },
      (error, stdout, stderr) => {
        if (error) {
          logger.error('Git submodule add command failed.', {
            error: { message: error.message, stderr: stderr },
            clone_url: match.clone_url,
            path: submodulePath
          });
          resolve({
            success: false,
            message: `Git command failed: ${error.message}`,
            details: stderr
          });
        } else {
          logger.info('Successfully imported git submodule.', {
            repository: match.name,
            path: submodulePath,
            clone_url: match.clone_url,
            output: stdout
          });
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
 * Returns analytical statistics about the loaded LangChain catalog from the database.
 * This includes total repositories, star/fork counts, average stars, and breakdowns by language and license.
 *
 * @returns {Promise<object>} A promise that resolves to an object containing the statistics.
 * @returns {boolean} return.success - Indicates if the statistics were successfully retrieved.
 * @returns {object} return.stats - An object containing various statistical metrics.
 * @returns {number} return.stats.totalRepositories - The total number of repositories in the catalog.
 * @returns {number} return.stats.totalStars - The sum of stars across all repositories.
 * @returns {number} return.stats.totalForks - The sum of forks across all repositories.
 * @returns {number} return.stats.averageStars - The average number of stars per repository, rounded to the nearest integer.
 * @returns {Array<object>} return.stats.languages - An array of objects, each with `name` (language) and `count`.
 * @returns {Array<object>} return.stats.licenses - An array of objects, each with `name` (license type) and `count`.
 * @throws {Error} If there is a problem calculating the statistics from the MongoDB collection.
 */
const getLangchainStats = async () => {
  try {
    // Combine multiple aggregation calls into a single $facet pipeline for improved efficiency,
    // reducing multiple round trips to the database.
    const facetResults = await LangchainRepository.aggregate([
      {
        $facet: {
          "overallStats": [
            { $group: { _id: null, totalStars: { $sum: '$stars' }, totalForks: { $sum: '$forks' }, avgStars: { $avg: '$stars' }, totalRepositories: { $sum: 1 } } }
          ],
          "languages": [
            { $group: { _id: '$language', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          "licenses": [
            { $group: { _id: '$license', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ]
        }
      }
    ]);

    // Extract results from the $facet output
    const stats = facetResults[0].overallStats[0] || { totalStars: 0, totalForks: 0, avgStars: 0, totalRepositories: 0 };
    const languages = facetResults[0].languages;
    const licenses = facetResults[0].licenses;

    return {
      success: true,
      stats: {
        totalRepositories: stats.totalRepositories,
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

/**
 * @typedef {object} LangchainService
 * @property {function(string, object): Promise<object>} searchLangchainCatalog - Function to search the Langchain catalog.
 * @property {function(string): Promise<object>} importLangchainSubmodule - Function to import a Langchain repository as a Git submodule.
 * @property {function(): Promise<object>} getLangchainStats - Function to retrieve statistics about the Langchain catalog.
 */

/**
 * Exports an object containing all Langchain-related service functions.
 * @type {LangchainService}
 */
export const LangchainService = {
  searchLangchainCatalog,
  importLangchainSubmodule,
  getLangchainStats
};