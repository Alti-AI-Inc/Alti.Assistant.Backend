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
    const { query, license, language, sortBy } = req.query;
    // Parse limit and page to integers, providing default values if not present or invalid.
    const limit = parseInt(req.query.limit, 10) || 10; // Default limit to 10 items per page
    const page = parseInt(req.query.page, 10) || 1;     // Default page to 1

    // Optimization Recommendation:
    // For read-only operations like this, ensure the 'searchComposioCatalog'
    // method in ComposioCatalogService uses .lean() on its Mongoose queries
    // to return plain JavaScript objects instead of Mongoose documents.
    // This reduces overhead if no Mongoose document methods are needed.
    //
    // Indexing Recommendation:
    // To improve query performance, ensure that the underlying Mongoose schema
    // for the ComposioCatalog model has indexes on 'license', 'language', and
    // 'sortBy' fields. If 'query' is used for text search, consider a text index.
    // For 'sortBy', a compound index with other query fields might be beneficial.
    const result = await ComposioCatalogService.searchComposioCatalog(query, {
      license,
      language,
      limit,
      page,
      sortBy
    });
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
    // Optimization Recommendation:
    // For read-only operations like this, ensure the 'getComposioStats'
    // method in ComposioCatalogService uses .lean() on its Mongoose queries
    // or aggregation pipelines to return plain JavaScript objects.
    // This reduces overhead if no Mongoose document methods are needed.
    //
    // Indexing Recommendation:
    // If 'getComposioStats' involves aggregation or filtering on specific fields,
    // ensure those fields are indexed in the underlying Mongoose schema to
    // optimize aggregation performance.
    const result = await ComposioCatalogService.getComposioStats();
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
 *     description: Initiates the process of importing a specified repository as a Composio submodule.
 *     tags: [Composio Catalog]
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
    const { repoName } = req.body;

    // Validate repoName: ensure it's present, a string, and not empty.
    if (!repoName || typeof repoName !== 'string' || repoName.trim().length === 0) {
      return res.status(httpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Repository name is required and must be a non-empty string.'
      });
    }

    // Indexing Recommendation:
    // If 'importComposioSubmodule' uses 'repoName' to find an existing document
    // before creating or updating, ensure the underlying Mongoose schema for
    // the ComposioCatalog model has an index on the 'repoName' field for faster lookups.
    const result = await ComposioCatalogService.importComposioSubmodule(repoName);
    if (result.success) {
      res.status(httpStatus.OK).json(result);
    } else {
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
  importSubmodule
};