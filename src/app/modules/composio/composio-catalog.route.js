import express from 'express';
// SECURITY: Import express-validator for input validation and sanitization.
import { body, validationResult } from 'express-validator';
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

// SECURITY PATCH: Add validation and sanitization middleware for the '/import' route.
// This prevents vulnerabilities like Command Injection and Server-Side Request Forgery (SSRF).

/**
 * Defines validation rules for the submodule import endpoint.
 * @returns {Array} An array of express-validator middleware.
 */
const importSubmoduleValidationRules = () => {
  return [
    // SECURITY: Validate 'url' to prevent SSRF and command injection.
    // It must be a well-formed URL with specific, allowed protocols.
    body('url')
      .trim()
      .notEmpty().withMessage('URL is required.')
      .isURL({
        protocols: ['http', 'https', 'git'], // Restrict to expected protocols for git repositories.
        require_protocol: true,
        require_host: true,
      }).withMessage('Must be a valid URL using http, https, or git protocol.'),

    // SECURITY: Validate 'branch' to prevent command injection.
    // A git branch name has some restrictions, but can contain characters like '/'.
    // This validation ensures it doesn't contain shell metacharacters.
    body('branch')
      .optional({ checkFalsy: true }) // It's an optional field.
      .trim()
      // This regex allows alphanumeric characters, hyphens, underscores, dots, and forward slashes,
      // which are common in branch names. It explicitly disallows characters that could be
      // used for command injection (e.g., ;, |, &, $, <, >, `).
      .matches(/^[a-zA-Z0-9\-_/.]+$/)
      .withMessage('Branch name contains invalid characters.')
      // SECURITY: Sanitize input to prevent XSS in case this value is ever reflected in an HTML response.
      .escape(),
  ];
};

/**
 * Middleware to handle validation errors from express-validator.
 * It checks for validation errors and sends a 422 Unprocessable Entity response if any exist.
 * This prevents invalid data from reaching the controller logic.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  // Create a structured error response.
  const extractedErrors = errors.array().map(err => ({ [err.param || 'general']: err.msg }));

  return res.status(422).json({
    message: 'Input validation failed.',
    errors: extractedErrors,
  });
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
 *       422:
 *         description: Unprocessable Entity if validation fails.
 *       500:
 *         description: Server error during the import process.
 */
// SECURITY PATCH: Added validation middleware (importSubmoduleValidationRules and validate)
// to sanitize and validate user input before it reaches the controller.
router.post(
  '/import',
  authMiddleware,
  importSubmoduleValidationRules(),
  validate,
  asyncHandler(ComposioCatalogController.importSubmodule)
);

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