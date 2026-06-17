/**
 * @file Gcp Native Service
 * @module app/modules/gcp_native/gcp-native.service
 * @description This service handles interactions with a catalog of Google and GCP repositories.
 * It provides functionality to search the catalog and to import repositories as Git submodules
 * into the application's file system. All operations are performed within a workspace context
 * and are subject to role-based access control and workspace-specific limits.
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import GoogleRepository from './gcp-repository.model.js';
// INTEGRATION: Import necessary services for hierarchy, limits, and notifications.
// These services are essential for enforcing workspace-specific rules and logging actions.
import { WorkspaceService } from '../workspace/workspace.service.js';
import { NotificationService } from '../notification/notification.service.js';
import auditLogger from '../../../shared/auditLogger.js';

/**
 * Utility function to escape special characters for use in a regular expression.
 * This prevents ReDoS (Regular Expression Denial of Service) and Regex Injection vulnerabilities.
 *
 * @param {string} string - The input string to escape.
 * @returns {string} The escaped string, safe for use within a RegExp constructor.
 */
const escapeRegExp = (string) => {
  // SECURITY_FIX: Correctly escape special characters for RegExp.
  // The `{FILE_CONTENT}` replacement inserts the matched special character, which is the correct behavior.
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Recommended MongoDB Indexes for GoogleRepository model:
// These indexes should be defined in 'gcp-repository.model.js' to optimize queries.
//
// 1. For full-text search ($text):
//    GoogleRepositorySchema.index({ name: 'text', description: 'text' });
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
// 5. Compound indexes for common filter/sort combinations:
//    GoogleRepositorySchema.index({ license: 1, stars: -1 });
//    GoogleRepositorySchema.index({ language: 1, stars: -1 });

/**
 * The current file's path.
 * @type {string}
 */
const __filename = fileURLToPath(import.meta.url);
/**
 * The directory name of the current module.
 * @type {string}
 */
const __dirname = path.dirname(__filename);

/**
 * Path to the GCP license catalog JSON file.
 * @type {string}
 */
const CATALOG_PATH = path.join(__dirname, '../../../../output/gcp-license-catalog.json');
/**
 * The root directory of the project.
 * @type {string}
 */
const ROOT_DIR = path.join(__dirname, '../../../../..');

/**
 * Searches the MongoDB GoogleRepository collection for Google and GCP repositories.
 * Supports full-text search relevance matching, license/language filtering, and sorting.
 *
 * @memberof GcpNativeService
 * @param {string} [query=''] - The search query string. Can be used for full-text search.
 * @param {object} [options={}] - An object containing search and pagination options.
 * @param {string} [options.license] - Filter repositories by license type (e.g., 'MIT', 'Apache 2.0'). Case-insensitive.
 * @param {string} [options.language] - Filter repositories by programming language (prefix match). Case-insensitive.
 * @param {string} [options.sortBy='stars'] - Field to sort the results by. Allowed values: 'stars', 'name', 'license', 'language'.
 * @param {number} [options.limit=20] - The maximum number of results to return per page.
 * @param {number} [options.page=1] - The current page number for pagination.
 * @param {object} user - The authenticated user object performing the action. Must contain a `workspaceId`.
 * @returns {Promise<object>} A promise that resolves to an object containing search results and pagination info.
 * @throws {Error} If the MongoDB query fails or if the user is not authenticated.
 * @permission Requires an authenticated user associated with a valid workspace.
 */
const searchGcpCatalog = async (query = '', options = {}, user) => {
  // HIERARCHY_GAP_FIX: All actions must be performed within a tenant/workspace context by an authenticated user.
  if (!user || !user.workspaceId) {
    // In a real app, this would likely be handled by middleware, but we add it here for service-level security.
    throw new Error('Permission denied. User must be authenticated and associated with a workspace.');
  }

  try {
    let filter = {};

    // BUGFIX: Whitelist and map license options to prevent unexpected behavior and improve clarity.
    if (options.license) {
      const lowerLicense = options.license.toLowerCase();
      const licenseMap = {
        'mit': 'MIT',
        'apache 2.0': 'Apache 2.0',
        'apache-2.0': 'Apache 2.0'
      };
      if (licenseMap[lowerLicense]) {
        filter.license = licenseMap[lowerLicense];
      }
      // Note: If an unsupported license is provided, it's ignored, returning results for all licenses.
      // This is a design choice; an alternative would be to return an empty set.
    }

    // Filter by Language - Uses the now-fixed escapeRegExp function.
    if (options.language) {
      filter.language = new RegExp(`^${escapeRegExp(options.language)}`, 'i');
    }

    if (query) {
      const stopWords = new Set(['show', 'me', 'the', 'and', 'its', 'from', 'collection', 'repository', 'repo', 'repositories', 'google', 'cloud', 'platform', 'gcp', 'a', 'of', 'in', 'for', 'with', 'on', 'how', 'to', 'find', 'get', 'list', 'search', 'what', 'is', 'are', 'any', 'some', 'about']);
      const queryWords = query.toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));

      if (queryWords.length > 0) {
        filter.$text = { $search: queryWords.join(' ') };
      } else {
        // Fallback uses the now-fixed escapeRegExp function.
        const escapedQuery = escapeRegExp(query);
        filter.$or = [
          { name: { $regex: escapedQuery, $options: 'i' } },
          { description: { $regex: escapedQuery, $options: 'i' } }
        ];
      }
    }

    const limit = options.limit ? parseInt(options.limit, 10) : 20;
    const page = options.page ? parseInt(options.page, 10) : 1;
    const startIndex = (page - 1) * limit;

    // PERFORMANCE_OPTIMIZATION: Use a single aggregation pipeline with $facet to get both
    // the paginated results and the total count in one database round-trip. This is more
    // efficient than running a .countDocuments() and a separate .find() query.
    const pipeline = [];

    // 1. Match documents based on the constructed filter
    pipeline.push({ $match: filter });

    // 2. Add sort stage based on query type
    if (filter.$text) {
      // For text search, sort by relevance score first, then by stars.
      pipeline.push({ $sort: { score: { $meta: 'textScore' }, stars: -1 } });
    } else {
      // For other queries, sort by the specified field or a default.
      const allowedSortFields = ['stars', 'name', 'license', 'language'];
      let sortBy = 'stars'; // Default for regex fallback
      if (!query) { // Only use options.sortBy if there's no query string
        sortBy = allowedSortFields.includes(options.sortBy) ? options.sortBy : 'stars';
      }
      pipeline.push({ $sort: { [sortBy]: -1 } });
    }

    // 3. Use $facet to process multiple aggregation pipelines within a single stage.
    pipeline.push({
      $facet: {
        // The 'metadata' pipeline gets the total count of matched documents.
        metadata: [{ $count: 'total' }],
        // The 'data' pipeline gets the paginated slice of documents.
        data: [{ $skip: startIndex }, { $limit: limit }]
      }
    });

    // Execute the aggregation. Aggregation results are always plain JS objects (lean).
    const [aggregationResult] = await GoogleRepository.aggregate(pipeline);

    const results = aggregationResult.data;
    const total = aggregationResult.metadata.length > 0 ? aggregationResult.metadata[0].total : 0;

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
    // It's better to log the original error for debugging purposes on the server.
    console.error(`[GcpNativeService] Failed to query catalog: ${err.message}`);
    throw new Error(`Failed to query Google/GCP catalog.`);
  }
};

/**
 * Programmatically triggers the Git submodule import command to register a GCP repository.
 * This is a privileged action that modifies the server's file system and is subject to
 * workspace-level usage limits. The action is audited and notifications are sent upon success.
 *
 * @memberof GcpNativeService
 * @param {string} repoName - The exact name of the repository to import (e.g., 'cloud-sdk').
 * @param {object} user - The authenticated user object. Must contain userId, workspaceId, and role.
 * @returns {Promise<object>} A promise that resolves to an object indicating the outcome of the import.
 * @throws {Error} If `repoName` is not provided.
 * @permission This is a privileged action. Requires the user to have an `admin` or `super_admin` role within their workspace.
 */
const importGcpSubmodule = async (repoName, user) => {
  // HIERARCHY_GAP_FIX: Validate user object and role. This is a critical, privileged action.
  // Only workspace admins or platform super admins should be able to modify the server environment.
  if (!user || !user.role || !user.workspaceId || !user.userId) {
    return { success: false, message: 'Permission denied. Invalid user session.' };
  }
  if (!['admin', 'super_admin'].includes(user.role)) {
    return {
      success: false,
      message: 'Permission denied. Only administrators can import repositories.'
    };
  }

  if (!repoName) {
    throw new Error('Repository name is required for import.');
  }

  // LIMITS_ENFORCEMENT: Check if the workspace has reached its submodule import limit based on its subscription plan.
  try {
    const workspace = await WorkspaceService.findById(user.workspaceId);
    if (!workspace) {
        return { success: false, message: 'Workspace not found.' };
    }
    if (workspace.submoduleCount >= workspace.submoduleLimit) {
      return { success: false, message: `Workspace submodule limit of ${workspace.submoduleLimit} reached. Please upgrade your plan to import more repositories.` };
    }
  } catch (err) {
    console.error(`[GcpNativeService] Failed to check workspace limits for workspace ${user.workspaceId}: ${err.message}`);
    return { success: false, message: 'Could not verify workspace limits.' };
  }

  // Pass the user object to the search function to maintain security context.
  const catalogResult = await searchGcpCatalog(repoName, {}, user);
  if (!catalogResult.success || catalogResult.results.length === 0) {
    return {
      success: false,
      message: `Repository "${repoName}" was not found in the scanned GCP catalog.`
    };
  }

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

  // SECURITY_FIX: Sanitize repo name to prevent path traversal. This was already correct.
  const sanitizedRepoName = match.name.replace(/[^a-zA-Z0-9-_.]/g, '');
  if (!sanitizedRepoName) {
    return {
      success: false,
      message: `Sanitized repository name is empty after cleaning: "${match.name}"`
    };
  }

  const submodulePath = `external/gcp/${sanitizedRepoName}`;
  const localGcpPath = path.join(ROOT_DIR, 'external/gcp');

  // ARCHITECTURAL_WARNING: Modifying the server's own filesystem in a multi-tenant application
  // is a significant security and scalability risk. This action affects the global state of the
  // application for all tenants. In a production environment, this should be handled by a
  // separate, isolated build process or a job queue system, not directly by the API server.
  return new Promise((resolve) => {
    if (!fs.existsSync(localGcpPath)) {
      fs.mkdirSync(localGcpPath, { recursive: true });
    }

    console.log(`[GcpNativeService] User ${user.userId} in workspace ${user.workspaceId} is importing: git submodule add ${match.clone_url} ${submodulePath}`);

    // SECURITY_FIX: Using spawn with an argument array prevents command injection. This was already correct.
    const gitProcess = spawn(
      'git',
      ['submodule', 'add', '--force', match.clone_url, submodulePath], // Added --force to handle cases where the directory exists but is not registered.
      { cwd: ROOT_DIR, stdio: 'pipe' } // Use pipe to ensure we capture all output.
    );

    let stdout = '';
    let stderr = '';

    gitProcess.stdout.on('data', (data) => { stdout += data.toString(); });
    gitProcess.stderr.on('data', (data) => { stderr += data.toString(); });

    gitProcess.on('close', async (code) => {
      if (code !== 0) {
        // INTEGRATION: Log the failed attempt for auditing.
        auditLogger.error({ userId: user.userId, workspaceId: user.workspaceId, action: 'import_gcp_submodule_failed', details: { repoName: match.name, error: stderr } });
        resolve({
          success: false,
          message: `Git command failed with exit code ${code}. The repository might already be imported or another error occurred.`,
          details: stderr,
          output: stdout
        });
      } else {
        // HIERARCHY_PROPAGATION: On success, log the action, update usage, and notify relevant parties.
        try {
          // INTEGRATION: Log this action for auditing.
          auditLogger.info({ userId: user.userId, workspaceId: user.workspaceId, action: 'import_gcp_submodule_success', details: { repoName: match.name, path: submodulePath } });

          // INTEGRATION: Increment the workspace's usage count.
          await WorkspaceService.incrementSubmoduleCount(user.workspaceId);

          // INTEGRATION: Notify workspace managers/admins about the new import.
          const notificationMessage = `User (ID: ${user.userId}) imported the repository '${match.name}'.`;
          await NotificationService.createForAdmins(user.workspaceId, { message: notificationMessage, subject: 'New Repository Imported', type: 'info' });

          resolve({
            success: true,
            message: `Successfully imported GCP repository "${match.name}" as a submodule!`,
            path: submodulePath,
            clone_url: match.clone_url,
            output: stdout
          });
        } catch (integrationError) {
          console.error(`[GcpNativeService] CRITICAL: Submodule was added but failed to update workspace stats/logs for workspace ${user.workspaceId}. Error: ${integrationError.message}`);
          // Resolve with success but include a warning about the integration failure.
          resolve({
            success: true,
            message: `Successfully imported GCP repository "${match.name}", but failed to update workspace statistics. Please contact support.`,
            path: submodulePath,
            clone_url: match.clone_url,
            output: stdout,
            warning: 'Post-import integration tasks failed.'
          });
        }
      }
    });

    gitProcess.on('error', (err) => {
      resolve({
        success: false,
        message: `Failed to start git process: ${err.message}`,
        details: err.message
      });
    });
  });
};

/**
 * @namespace GcpNativeService
 * @description Provides services for interacting with GCP native repositories,
 * including searching the catalog and programmatically importing them as Git submodules.
 */
export const GcpNativeService = {
  searchGcpCatalog,
  importGcpSubmodule
};