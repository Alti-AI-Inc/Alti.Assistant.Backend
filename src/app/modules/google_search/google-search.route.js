/**
 * @file Google Search API routes.
 * @module app/modules/google_search/google-search.route
 * @author Your Name/Organization
 * @description Defines the API routes for interacting with Google Search functionalities.
 */

import express from 'express';
import { GoogleSearchController } from './google-search.controller.js';

/**
 * Utility function to wrap async controller functions, ensuring any errors
 * are caught and passed to the Express error handling middleware.
 * This prevents unhandled promise rejections in async route handlers.
 * @param {Function} fn - The async controller function to wrap.
 * @returns {Function} An Express middleware function.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Express router to handle Google Search related API requests.
 * @type {express.Router}
 */
const router = express.Router();

router
  .route('/get-response-anonymously')
  /**
   * @swagger
   * /api/v1/google-search/get-response-anonymously:
   *   post:
   *     summary: Get a Google Search response anonymously.
   *     description: >
   *       Initiates a Google search query and retrieves the results.
   *       This endpoint allows users to perform searches without direct user identification.
   *       The request body should contain the search query and any other relevant parameters.
   *     tags:
   *       - Google Search
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               query:
   *                 type: string
   *                 description: The search query string.
   *                 example: "latest AI advancements"
   *               language:
   *                 type: string
   *                 description: Optional. The language for the search results (e.g., "en", "es").
   *                 example: "en"
   *               country:
   *                 type: string
   *                 description: Optional. The country for the search results (e.g., "US", "GB").
   *                 example: "US"
   *             required:
   *               - query
   *     responses:
   *       200:
   *         description: Successfully retrieved Google Search results.
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
   *                   example: "Google Search results retrieved successfully."
   *                 data:
   *                   type: object
   *                   description: The search results object, structure depends on the Google Search API response.
   *                   example: { "organic_results": [...], "knowledge_graph": {...} }
   *       400:
   *         description: Bad request, e.g., missing query parameter.
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
   *                   example: "Search query is required."
   *       500:
   *         description: Internal server error.
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
   *                   example: "Failed to retrieve Google Search results due to an internal error."
   */
  .post(asyncHandler(GoogleSearchController.GoogleSearchGetResponse)); // Wrap the async controller to handle errors

/**
 * Exports the Google Search API routes.
 * @type {express.Router}
 */
export const googleSearchRoutes = router;