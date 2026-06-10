import express from 'express';
import { ComposioCatalogController } from './composio-catalog.controller.js';
// Assuming an authentication middleware exists for protecting routes.
// Adjust the path to your actual authentication middleware file.
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = express.Router();

/**
 * Utility to wrap asynchronous route handlers.
 * This ensures that any errors (including rejected promises) from async functions
 * are caught and passed to Express's error handling middleware, preventing unhandled promise rejections.
 *
 * @param {Function} fn - The asynchronous function to wrap. It should be an Express route handler
 *                        of the form `(req, res, next) => Promise<any>`.
 * @returns {Function} A new function that Express can use as a route handler,
 *                     which handles promises and catches errors.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Apply authentication middleware to all routes for security.
// This prevents unauthorized access to API endpoints.
// If specific routes are intended to be public, remove `authMiddleware` from those routes.

/**
 * @swagger
 * /api/composio-catalog/repositories:
 *   get:
 *     summary: Get a list of Composio repositories
 *     description: Retrieves all available Composio repositories from the catalog.
 *     tags:
 *       - Composio Catalog
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: An array of repository objects.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: Unique identifier for the repository.
 *                   name:
 *                     type: string
 *                     description: Name of the repository.
 *                   url:
 *                     type: string
 *                     description: URL of the repository.
 *                   description:
 *                     type: string
 *                     description: Description of the repository.
 *       401:
 *         description: Unauthorized if authentication fails.
 *       500:
 *         description: Server error.
 */
router.get('/repositories', authMiddleware, asyncHandler(ComposioCatalogController.getRepositories));

/**
 * @swagger
 * /api/composio-catalog/stats:
 *   get:
 *     summary: Get Composio catalog statistics
 *     description: Retrieves various statistics related to the Composio catalog, such as total repositories, last update time, etc.
 *     tags:
 *       - Composio Catalog
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: An object containing catalog statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalRepositories:
 *                   type: number
 *                   description: The total number of repositories in the catalog.
 *                 lastUpdated:
 *                   type: string
 *                   format: date-time
 *                   description: Timestamp of the last catalog update.
 *                 activeSubmodules:
 *                   type: number
 *                   description: Number of currently active submodules.
 *       401:
 *         description: Unauthorized if authentication fails.
 *       500:
 *         description: Server error.
 */
router.get('/stats', authMiddleware, asyncHandler(ComposioCatalogController.getStats));

/**
 * @swagger
 * /api/composio-catalog/import:
 *   post:
 *     summary: Import a Composio submodule
 *     description: Initiates the import process for a Composio submodule. This typically involves fetching and integrating new tools or functionalities based on the provided URL.
 *     tags:
 *       - Composio Catalog
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: The URL of the submodule to import (e.g., a Git repository URL).
 *               branch:
 *                 type: string
 *                 description: The specific branch to import from (defaults to main/master if not provided).
 *                 default: main
 *     responses:
 *       200:
 *         description: Success message upon successful import.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Submodule imported successfully.
 *                 submoduleId:
 *                   type: string
 *                   description: The ID of the newly imported submodule.
 *       400:
 *         description: Bad request if input is invalid (e.g., missing URL, invalid URL).
 *       401:
 *         description: Unauthorized if authentication fails.
 *       500:
 *         description: Server error during the import process.
 */
router.post('/import', authMiddleware, asyncHandler(ComposioCatalogController.importSubmodule));

/**
 * @typedef {import('express').Router} Router
 */

/**
 * The Express router for Composio catalog related API routes.
 * This router handles operations such as fetching repository lists,
 * retrieving catalog statistics, and initiating submodule imports.
 *
 * @type {Router}
 */
export const composioCatalogRoutes = router;