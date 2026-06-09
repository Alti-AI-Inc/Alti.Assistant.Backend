import httpStatus from 'http-status';
import { TemporalCatalogService } from './temporal-catalog.service.js';

/**
 * @typedef {object} Repository
 * @property {string} id - The unique identifier of the repository.
 * @property {string} name - The name of the repository.
 * @property {string} url - The URL of the repository.
 * @property {string} license - The license of the repository.
 * @property {string} status - The current status of the repository (e.g., 'active', 'archived').
 * @property {string} description - A brief description of the repository.
 * @property {string[]} tags - An array of tags associated with the repository.
 * @property {Date} createdAt - The date when the repository was added to the catalog.
 * @property {Date} updatedAt - The date when the repository information was last updated.
 */

/**
 * @typedef {object} PaginationResult
 * @property {Repository[]} results - An array of repository objects.
 * @property {number} page - The current page number.
 * @property {number} limit - The maximum number of results per page.
 * @property {number} totalPages - The total number of available pages.
 * @property {number} totalResults - The total number of results across all pages.
 */

/**
 * @typedef {object} TemporalStats
 * @property {number} totalRepositories - The total number of repositories in the catalog.
 * @property {object} statusDistribution - An object showing the count of repositories by status.
 * @property {object} licenseDistribution - An object showing the count of repositories by license.
 * @property {Date} lastSyncDate - The date of the last successful catalog synchronization.
 */

/**
 * @typedef {object} SyncResult
 * @property {boolean} success - Indicates if the synchronization was successful.
 * @property {string} message - A descriptive message about the synchronization outcome.
 * @property {number} [added] - The number of new repositories added (if successful).
 * @property {number} [updated] - The number of existing repositories updated (if successful).
 * @property {number} [removed] - The number of repositories removed (if successful).
 */

/**
 * @swagger
 * /v1/temporal/repositories:
 *   get:
 *     summary: Retrieve a list of temporal repositories.
 *     description: Searches and retrieves temporal repositories based on various filters and pagination options.
 *     tags:
 *       - Temporal Catalog
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
 *         description: Filter repositories by license type (e.g., 'MIT', 'Apache-2.0').
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter repositories by their status (e.g., 'active', 'archived').
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Maximum number of results per page.
 *         default: 10
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination.
 *         default: 1
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: Field to sort results by (e.g., 'name:asc', 'createdAt:desc').
 *     responses:
 *       200:
 *         description: Successfully retrieved a list of repositories.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginationResult'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: An unexpected error occurred.
 */
/**
 * Handles the request to get a list of temporal repositories.
 * Filters and paginates results based on query parameters.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getRepositories = async (req, res, next) => {
  try {
    const { query, license, status, limit, page, sortBy } = req.query;
    const result = await TemporalCatalogService.searchCatalog(query, {
      license,
      status,
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
 * @swagger
 * /v1/temporal/stats:
 *   get:
 *     summary: Get statistics about temporal repositories.
 *     description: Retrieves aggregated statistics related to the temporal catalog, such as total repositories, distribution by status, and license.
 *     tags:
 *       - Temporal Catalog
 *     responses:
 *       200:
 *         description: Successfully retrieved catalog statistics.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TemporalStats'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: An unexpected error occurred.
 */
/**
 * Handles the request to get statistics about the temporal catalog.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getStats = async (req, res, next) => {
  try {
    const result = await TemporalCatalogService.getStats();
    res.status(httpStatus.OK).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /v1/temporal/sync:
 *   post:
 *     summary: Synchronize the temporal catalog.
 *     description: Triggers a synchronization process to update the temporal catalog with the latest data from external sources.
 *     tags:
 *       - Temporal Catalog
 *     responses:
 *       200:
 *         description: Synchronization process successfully initiated or completed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncResult'
 *       400:
 *         description: Synchronization failed due to a specific issue.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncResult'
 *       500:
 *         description: Internal server error during the synchronization process.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: An unexpected error occurred during sync.
 */
/**
 * Handles the request to synchronize the temporal catalog.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const syncCatalog = async (req, res, next) => {
  try {
    const result = await TemporalCatalogService.syncCatalog();
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
 * @namespace TemporalController
 * @description Controller for handling operations related to the Temporal Catalog.
 * Provides methods for searching repositories, retrieving statistics, and triggering synchronization.
 */
export const TemporalController = {
  getRepositories,
  getStats,
  syncCatalog
};