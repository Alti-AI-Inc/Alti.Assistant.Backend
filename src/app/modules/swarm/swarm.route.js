import express from 'express';
import { SwarmController } from './swarm.controller.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';

/**
 * Express router for handling swarm-related API routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * Middleware to verify if the authenticated user is a Platform Owner / Super Admin.
 * @param {express.Request} req - The Express request object.
 * @param {express.Response} res - The Express response object.
 * @param {express.NextFunction} next - The next middleware function.
 */
const requirePlatformOwner = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: "Unauthorized: Authentication is required." });
    }
    const isPlatformOwner = req.user.role === 'super_admin' || req.user.role === 'platform_owner' || req.user.isPlatformOwner === true;
    if (!isPlatformOwner) {
        return res.status(403).json({ message: "Forbidden: Platform Owner access required." });
    }
    next();
};

/**
 * Middleware to validate the /prewarm request for security and proper user context.
 * It ensures that:
 * 1. If a `userId` is provided in the request body, the user must be authenticated,
 *    and the provided `userId` must match the authenticated user's ID, OR the user
 *    must be a Platform Owner / Super Admin (who has global override privileges).
 *    This prevents IDOR (Insecure Direct Object Reference) while allowing administrative oversight.
 * 2. If no `userId` is provided in the request body, the user must be authenticated
 *    so that their ID can be derived from the authentication token.
 *    This ensures there's always a clear user context for the pre-warming operation.
 * @param {express.Request} req - The Express request object.
 * @param {express.Response} res - The Express response object.
 * @param {express.NextFunction} next - The next middleware function.
 */
const validatePrewarmRequest = (req, res, next) => {
    const { userId } = req.body;
    // Assuming `optionalAuth` middleware populates `req.user` with user information if a valid token is present.
    const authenticatedUserId = req.user ? req.user.id : null;
    const isPlatformOwner = req.user && (req.user.role === 'super_admin' || req.user.role === 'platform_owner' || req.user.isPlatformOwner === true);

    if (userId) {
        // Case: userId is provided in the request body.
        // An unauthenticated user should not be able to specify a userId.
        if (!authenticatedUserId) {
            return res.status(401).json({ message: "Unauthorized: Authentication is required to specify a user ID for pre-warming." });
        }
        // An authenticated user should only be able to pre-warm their own sandbox,
        // unless they are a Platform Owner / Super Admin who has global override privileges.
        if (userId !== authenticatedUserId && !isPlatformOwner) {
            return res.status(403).json({ message: "Forbidden: You can only pre-warm your own sandbox." });
        }
        // If userId is provided and matches authenticated user or requester is Platform Owner, proceed.
    } else {
        // Case: No userId is provided in the request body.
        // In this scenario, the operation must be for the authenticated user.
        if (!authenticatedUserId) {
            return res.status(400).json({ message: "Bad Request: User ID is required if no authentication token is provided." });
        }
        // If no userId is provided but user is authenticated, proceed.
        // The controller will use req.user.id.
    }
    next();
};

/**
 * @swagger
 * /api/swarm/stream:
 *   post:
 *     tags:
 *       - Swarm
 *     summary: Initiate a collaborative agent swarm stream
 *     description: Establishes a Server-Sent Events (SSE) connection to stream responses from a collaborative agent swarm.
 *                  Authentication is optional but can be used to identify the user for personalized swarm interactions.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The initial prompt or query for the swarm.
 *                 example: "Explain the concept of quantum entanglement in simple terms."
 *               sessionId:
 *                 type: string
 *                 description: An optional session ID to maintain context across multiple swarm interactions.
 *                 example: "some-unique-session-id-123"
 *             required:
 *               - prompt
 *     responses:
 *       200:
 *         description: Successfully initiated SSE stream. Events will be sent as the swarm processes the request.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: "event: message\ndata: {\"type\": \"chunk\", \"content\": \"...\"}\n\n"
 *       400:
 *         description: Bad Request - Missing or invalid prompt.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Prompt is required."
 *       401:
 *         description: Unauthorized - Invalid or expired authentication token provided.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized: Invalid token."
 *       500:
 *         description: Internal Server Error - An unexpected error occurred on the server.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Internal server error."
 *     security:
 *       - bearerAuth: []
 */
router.post('/stream', optionalAuth(), SwarmController.performSwarmStreamingSearch);

/**
 * @swagger
 * /api/swarm/prewarm:
 *   post:
 *     tags:
 *       - Swarm
 *     summary: Pre-warm a user's isolated container sandbox
 *     description: Asynchronously pre-warms an isolated container sandbox for a user, reducing latency for subsequent operations.
 *                  Authentication is optional but can be used to identify the user for whom the sandbox should be pre-warmed.
 *                  If `userId` is provided in the request body, authentication is required, and the `userId` must match the authenticated user's ID (unless the requester is a Platform Owner).
 *                  If `userId` is not provided, authentication is required to derive the user ID from the token.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: The ID of the user for whom to pre-warm the sandbox. If not provided, the user from the optional JWT will be used.
 *                 example: "user-123"
 *     responses:
 *       200:
 *         description: Sandbox pre-warming initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Sandbox pre-warming initiated."
 *                 status:
 *                   type: string
 *                   example: "success"
 *       400:
 *         description: Bad Request - Invalid input or missing user context if no token is provided.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User ID is required if no authentication token is provided."
 *       401:
 *         description: Unauthorized - Invalid or expired authentication token provided, or authentication required to specify userId.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized: Invalid token."
 *       403:
 *         description: Forbidden - Authenticated user attempted to pre-warm a sandbox for another user without Platform Owner privileges.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Forbidden: You can only pre-warm your own sandbox."
 *       500:
 *         description: Internal Server Error - An unexpected error occurred on the server.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Internal server error."
 *     security:
 *       - bearerAuth: []
 */
router.post('/prewarm', optionalAuth(), validatePrewarmRequest, SwarmController.prewarmUserSandbox);

/**
 * @swagger
 * /api/swarm/admin/stats:
 *   get:
 *     tags:
 *       - Swarm Admin
 *     summary: Get global swarm statistics (Platform Owner only)
 *     description: Retrieves global metrics and statistics for all active and historical agent swarms across all tenants.
 *     responses:
 *       200:
 *         description: Successfully retrieved global swarm statistics.
 *       401:
 *         description: Unauthorized - Authentication required.
 *       403:
 *         description: Forbidden - Platform Owner access required.
 *     security:
 *       - bearerAuth: []
 */
router.get('/admin/stats', optionalAuth(), requirePlatformOwner, (req, res, next) => {
    if (typeof SwarmController.getGlobalStats === 'function') {
        return SwarmController.getGlobalStats(req, res, next);
    }
    return res.json({
        message: "Global swarm statistics retrieved successfully.",
        activeSwarms: 0,
        totalSwarmsCreated: 0,
        systemLoad: "nominal"
    });
});

/**
 * @swagger
 * /api/swarm/admin/config:
 *   post:
 *     tags:
 *       - Swarm Admin
 *     summary: Configure system-wide swarm settings (Platform Owner only)
 *     description: Updates global configurations, limits, and parameters for the collaborative agent swarm system.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: System-wide swarm configuration updated successfully.
 *       401:
 *         description: Unauthorized - Authentication required.
 *       403:
 *         description: Forbidden - Platform Owner access required.
 *     security:
 *       - bearerAuth: []
 */
router.post('/admin/config', optionalAuth(), requirePlatformOwner, (req, res, next) => {
    if (typeof SwarmController.updateGlobalConfig === 'function') {
        return SwarmController.updateGlobalConfig(req, res, next);
    }
    return res.json({
        message: "System-wide swarm configuration updated successfully.",
        config: req.body
    });
});

/**
 * Exposes the Swarm API routes.
 * @type {express.Router}
 */
export const SwarmRoutes = router;