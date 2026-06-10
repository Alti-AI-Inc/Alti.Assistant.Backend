import httpStatus from 'http-status';
import { ComposioCatalogService } from './composio-catalog.service.js';

/**
 * @typedef {object} Repository
 * @property {string} name - The name of the repository.
 * @property {string} description - A brief description of the repository.
 * @property {string} url - The URL to the repository.
 * @property {string} license - The license under which the repository is distributed.
 * @property {string} language - The primary programming language of the repository.
 * @property {number} stars - The number of stars the repository has.
 * @property {Date} createdAt - The date when the repository was created.
 * @property {Date} updatedAt - The date when the repository was last updated.
 */

/**
 * @typedef {object} PaginatedRepositories
 * @property {Repository[]} results - An array of repository objects.
 * @property {number} page - The current page number.
 * @property {number} limit - The number of items per page.
 * @property {number} totalPages - The total number of pages available.
 * @property {number} totalResults - The total number of results found.
 */

/**
 * @swagger
 * /v1/composio-catalog/repositories:
 *   get:
 *     summary: Retrieve a paginated list of Composio catalog repositories.
 *     description: Fetches repositories from the Composio catalog, allowing for filtering, searching, and sorting.
 *     tags: [Composio Catalog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search term to filter repositories by name or description.
 *       - in: query
 *         name: license
 *         schema:
 *           type: string
 *         description: Filter repositories by license type (e.g., "MIT", "Apache-2.0").
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter repositories by primary programming language (e.g., "JavaScript", "Python").
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, stars, createdAt, updatedAt]
 *         description: Field to sort the results by. Default is 'createdAt'.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Maximum number of repositories to return per page.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination.
 *     responses:
 *       200:
 *         description: Successfully retrieved the list of repositories.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedRepositories'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Internal Server Error
 */
/**
 * Controller to handle requests for retrieving a paginated list of Composio catalog repositories.
 * It supports filtering by query, license, language, and sorting options.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getRepositories = async (req, res, next) => {
  try {
    // BUG FIX: Added input validation for the 'sortBy' parameter to prevent potential NoSQL injection
    // or unexpected sorting behavior. Only whitelisted values are allowed.
    const allowedSortBy = ['name', 'stars', 'createdAt', 'updatedAt'];
    const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'createdAt';

    const { query, license, language } = req.query;
    // Parse limit and page to integers, providing default values if not present or invalid.
    const limit = parseInt(req.query.limit, 10) || 10; // Default limit to 10 items per page
    const page = parseInt(req.query.page, 10) || 1; // Default page to 1

    // INTEGRATION FIX: Pass user's workspace context to the service layer.
    // This ensures that data access respects tenant boundaries, allowing for potential
    // features like workspace-specific views or permissions on the catalog.
    // Assumes an authentication middleware populates req.user.
    const { workspaceId } = req.user;

    // Performance Optimization:
    // The `ComposioCatalogService.searchComposioCatalog` method MUST utilize `.lean()`
    // on its Mongoose queries. This returns plain JavaScript objects, significantly
    // reducing overhead for read-only operations where Mongoose document methods
    // are not required.
    //
    // Database Indexing:
    // For optimal query performance, ensure the Mongoose schema for the
    // ComposioCatalog model has indexes on the 'license', 'language', and
    // 'sortBy' fields. If 'query' is used for text search, a text index is
    // highly recommended. A compound index involving 'sortBy' and other
    // filter fields (e.g., { language: 1, sortBy: 1 }) could further
    // improve performance for specific query patterns.
    const result = await ComposioCatalogService.searchComposioCatalog(
      query,
      {
        license,
        language,
        limit,
        page,
        sortBy,
      },
      workspaceId,
    );
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @typedef {object} ComposioStats
 * @property {number} totalRepositories - The total number of repositories in the catalog.
 * @property {object} languages - An object mapping language names to their counts.
 * @property {object} licenses - An object mapping license types to their counts.
 */

/**
 * @swagger
 * /v1/composio-catalog/stats:
 *   get:
 *     summary: Retrieve statistics about the Composio catalog.
 *     description: Fetches aggregated statistics such as total repositories, language distribution, and license distribution.
 *     tags: [Composio Catalog]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved catalog statistics.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ComposioStats'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Internal Server Error
 */
/**
 * Controller to handle requests for retrieving statistics about the Composio catalog.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getStats = async (req, res, next) => {
  try {
    // INTEGRATION FIX: Pass user's workspace context to the service layer.
    // This ensures that statistics can be scoped by tenant if necessary and maintains
    // a consistent, context-aware architecture.
    // Assumes an authentication middleware populates req.user.
    const { workspaceId } = req.user;

    // Performance Optimization:
    // The `ComposioCatalogService.getComposioStats` method MUST utilize `.lean()`
    // on its Mongoose queries or aggregation pipelines. This returns plain
    // JavaScript objects, significantly reducing overhead for read-only operations.
    //
    // Database Indexing:
    // If `getComposioStats` involves aggregation or filtering on specific fields,
    // ensure those fields are indexed in the underlying Mongoose schema to
    // optimize aggregation performance.
    const result = await ComposioCatalogService.getComposioStats(workspaceId);
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /v1/composio-catalog/import:
 *   post:
 *     summary: Import a Composio submodule into the catalog.
 *     description: Initiates the process of importing a specified repository as a Composio submodule. This is a privileged action restricted to super administrators.
 *     tags: [Composio Catalog]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - repoName
 *             properties:
 *               repoName:
 *                 type: string
 *                 description: The name of the repository to import (e.g., "owner/repo-name").
 *                 example: "composio-platform/composio-tools"
 *     responses:
 *       200:
 *         description: Submodule import initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Submodule 'composio-platform/composio-tools' imported successfully.
 *       400:
 *         description: Bad request, typically due to missing or invalid repository name.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Repository name is required and must be a non-empty string.
 *       403:
 *         description: Forbidden. The user does not have the required permissions to perform this action.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: You do not have permission to perform this action.
 *       500:
 *         description: Internal server error during the import process.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Internal Server Error
 */
/**
 * Controller to handle requests for importing a Composio submodule.
 * It expects a `repoName` in the request body to identify the repository to import.
 *
 * @param {import('express').Request} req - The Express request object, containing `repoName` in its body.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const importSubmodule = async (req, res, next) => {
  try {
    // SECURITY FIX: Added Role-Based Access Control (RBAC).
    // This is a privileged action that modifies the platform's catalog.
    // It must be restricted to 'super_admin' users to prevent unauthorized modifications.
    // Assumes an authentication middleware populates req.user with role information.
    if (req.user.role !== 'super_admin') {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: 'You do not have permission to perform this action.',
      });
    }

    const { repoName } = req.body;

    // Validate repoName: ensure it's present, a string, and not empty.
    if (!repoName || typeof repoName !== 'string' || repoName.trim().length === 0) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Repository name is required and must be a non-empty string.',
      });
    }

    // INTEGRATION FIX: Pass user and workspace context to the service layer.
    // This is crucial for auditing (who imported what) and for propagating usage details
    // or applying limits to the appropriate workspace, as required by the system architecture.
    const { workspaceId, id: userId } = req.user;

    // Database Indexing:
    // If `ComposioCatalogService.importComposioSubmodule` performs lookups
    // (e.g., `findOne`, `findOneAndUpdate`) based on `repoName` to check
    // for existence or update, ensure the Mongoose schema for the
    // ComposioCatalog model has an index on the 'repoName' field for faster operations.
    const result = await ComposioCatalogService.importComposioSubmodule(repoName, { workspaceId, userId });
    if (result.success) {
      res.status(httpStatus.OK).json(result);
    } else {
      // The service layer might return specific errors (e.g., already exists).
      // A 400 Bad Request is a reasonable default for failure.
      res.status(httpStatus.BAD_REQUEST).json(result);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @namespace ComposioCatalogController
 * @description Provides controller functions for managing and querying the Composio catalog.
 * This includes retrieving repository lists, fetching catalog statistics, and initiating submodule imports.
 */
export const ComposioCatalogController = {
  getRepositories,
  getStats,
  importSubmodule,
};