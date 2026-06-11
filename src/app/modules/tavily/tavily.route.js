/**
 * @file Defines the routes for the Tavily AI module.
 * @module routes/tavilyAi
 * @requires express
 * @requires module:controllers/tavily
 * @requires module:middleware/auth
 * @requires module:middleware/authorize
 * @requires module:utils/constants
 */

import express from 'express';
import { TavilyAiController } from './tavily.controller.js';
// BUGFIX: Import authentication and authorization middleware to secure the endpoint.
// Anonymous access to a potentially expensive third-party API is a major security and financial risk.
// It also prevents tracking usage against users and workspaces, violating core business logic.
import { auth } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';
import { ROLES } from '../../utils/constants.js';

/**
 * Express router for Tavily AI related endpoints.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * A utility function to wrap asynchronous route handlers, ensuring that any rejected promises
 * are caught and passed to Express's next error-handling middleware. This prevents the server
 * from crashing due to unhandled promise rejections in async functions.
 *
 * @param {Function} fn - The asynchronous route handler function to wrap.
 * @returns {Function} An Express middleware function that executes the wrapped handler and catches errors.
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * @openapi
 * /api/v1/tavily/search:
 *   post:
 *     summary: Perform a search using the Tavily AI service
 *     description: |
 *       Allows an authenticated user to send a query to the Tavily AI search service and receive a comprehensive response.
 *       Usage is tracked against the user's account and workspace limits.
 *       Requires 'user', 'manager', 'admin', or 'super_admin' role.
 *     tags:
 *       - Tavily AI
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: The search query or question for the Tavily AI.
 *                 example: "What are the recent advancements in AI-powered search engines?"
 *               search_depth:
 *                 type: string
 *                 description: The depth of the search. Can be 'basic' or 'advanced'.
 *                 enum: [basic, advanced]
 *                 default: basic
 *                 example: "advanced"
 *               include_answer:
 *                 type: boolean
 *                 description: Whether to include a concise answer in the response.
 *                 default: true
 *                 example: true
 *               include_raw_content:
 *                 type: boolean
 *                 description: Whether to include the raw content of the search results.
 *                 default: false
 *                 example: false
 *               max_results:
 *                 type: integer
 *                 description: The maximum number of search results to return.
 *                 minimum: 1
 *                 maximum: 10
 *                 default: 5
 *                 example: 7
 *             required:
 *               - query
 *     responses:
 *       '200':
 *         description: Successfully retrieved a response from the Tavily AI service.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answer:
 *                   type: string
 *                   description: A concise answer to the query, if requested.
 *                   example: "Recent advancements in AI-powered search engines include the use of large language models for generating direct answers, improved semantic understanding for more relevant results, and the integration of multi-modal search capabilities."
 *                 results:
 *                   type: array
 *                   description: A list of search results.
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                         example: "The Rise of AI in Search | TechCrunch"
 *                       url:
 *                         type: string
 *                         example: "https://techcrunch.com/2023/05/10/the-rise-of-ai-in-search/"
 *                       content:
 *                         type: string
 *                         example: "AI is revolutionizing how we search for information..."
 *                       score:
 *                         type: number
 *                         example: 0.987
 *       '400':
 *         description: Bad Request. The request body is missing the required 'query' field or contains invalid parameters.
 *       '401':
 *         description: Unauthorized. The user is not authenticated.
 *       '403':
 *         description: Forbidden. The user does not have the required permissions or has exceeded their usage limits.
 *       '500':
 *         description: Internal Server Error. An unexpected error occurred on the server.
 */
router
  // BUGFIX: Renamed route from '/get-response-anonymously' to '/search' to reflect its new, authenticated nature.
  .route('/search')
  // BUGFIX: Added authentication and authorization middleware.
  // This ensures that only valid, logged-in users with appropriate roles can access this feature.
  // This is critical for security, tenant isolation, and for tracking usage against workspace/user limits.
  .post(
    auth,
    authorize(ROLES.USER, ROLES.MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN),
    // BUGFIX: Changed controller method to a name that reflects the new authenticated action.
    // The controller logic must be updated to handle the authenticated user (req.user),
    // check usage limits, and log the API call for billing/analytics.
    catchAsync(TavilyAiController.TavilyAiSearch)
  );

/**
 * The configured Express router for the Tavily AI module.
 * Contains all the routes related to Tavily AI operations.
 * @type {express.Router}
 */
export const tavilyAiRoutes = router;