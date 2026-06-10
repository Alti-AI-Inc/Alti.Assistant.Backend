/**
 * @file This file defines the API routes for image-related operations,
 * including generation, analysis, statistics, and conversation management.
 * It integrates authentication, authorization, rate limiting, and request validation
 * to secure and manage access to image functionalities.
 */

import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { imageController } from './image.controller.js';
import { ImageValidation } from './image.validation.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

/**
 * Express router for image-related routes.
 * @type {express.Router}
 */
const router = express.Router();

console.log('Image routes initialized');

/**
 * Middleware to enforce ownership checks for guest conversations.
 *
 * This middleware prevents Insecure Direct Object Reference (IDOR) vulnerabilities
 * by ensuring that:
 * 1. Authenticated non-admin users cannot access arbitrary guest conversations.
 * 2. Guest users can only access their own conversations.
 * 3. Admin users have full access to all guest conversations.
 *
 * @param {express.Request} req - The Express request object, potentially containing `req.user` (for authenticated users)
 *   or `req.guestUser` (for guest users identified by `optionalAuth`).
 * @param {express.Response} res - The Express response object.
 * @param {express.NextFunction} next - The next middleware function in the stack.
 * @returns {void} Calls `next()` if authorized, otherwise sends a 403 Forbidden response.
 */
const checkGuestUserOwnership = (req, res, next) => {
  const requestedGuestUserId = req.params.guestUserId;

  // Case 1: Authenticated user
  if (req.user) {
    // Allow admins to view any guest conversations
    if (req.user.role === ENUM_USER_ROLE.ADMIN) {
      return next();
    }
    // For non-admin authenticated users, deny access to guest conversations.
    // If there's a business requirement for an authenticated user to view their *own* past guest conversations,
    // the guestUserId would need to be linked to their userId, and that check would go here.
    // Without that specific requirement, it's safer to deny.
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Authenticated users cannot access guest conversations directly unless they are an administrator.',
    });
  }

  // Case 2: Guest user (from optionalAuth)
  // Assuming optionalAuth populates req.guestUser with an 'id' property for guests.
  // This check prevents IDOR for guest users trying to access other guest's conversations.
  if (req.guestUser && req.guestUser.id === requestedGuestUserId) {
    return next();
  }

  // Case 3: No user/guest context or mismatch
  // This covers scenarios where optionalAuth didn't identify a user/guest,
  // or the guestUser.id doesn't match the requestedGuestUserId.
  return res.status(403).json({
    success: false,
    message: 'Forbidden: You are not authorized to access these guest conversations.',
  });
};

/**
 * @swagger
 * /api/v1/image/generate:
 *   post:
 *     summary: Generate an image based on a text prompt.
 *     description: Allows both authenticated users and guests to generate images.
 *       This endpoint is subject to daily request limits and rate limiting.
 *     tags:
 *       - Image Generation
 *     security:
 *       - bearerAuth: []
 *       - {} # Allows unauthenticated access
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The text prompt to generate the image from.
 *                 example: "A futuristic city at sunset"
 *               conversationId:
 *                 type: string
 *                 description: Optional ID of an existing conversation to continue.
 *                 example: "65e7a2b3c4d5e6f7a8b9c0d1"
 *               guestUserId:
 *                 type: string
 *                 description: Optional ID of the guest user if no authentication token is provided.
 *                 example: "guest_12345"
 *     responses:
 *       200:
 *         description: Image generated successfully.
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
 *                   example: "Image generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     imageUrl:
 *                       type: string
 *                       format: uri
 *                       example: "https://example.com/image/generated-image.png"
 *                     conversationId:
 *                       type: string
 *                       example: "65e7a2b3c4d5e6f7a8b9c0d1"
 *       400:
 *         description: Bad Request - Invalid input or validation error.
 *       401:
 *         description: Unauthorized - Authentication required or failed.
 *       403:
 *         description: Forbidden - Daily request limit exceeded or access denied.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error.
 */
router.post(
  '/generate',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(20, 15), // 20 image generation requests per 15 minutes
  validateRequest(ImageValidation.imageGenerationSchema),
  imageController.generateImage
);

/**
 * @swagger
 * /api/v1/image/analyze:
 *   post:
 *     summary: Analyze an image to extract information.
 *     description: Allows both authenticated users and guests to analyze images.
 *       This endpoint is subject to daily request limits and rate limiting.
 *     tags:
 *       - Image Analysis
 *     security:
 *       - bearerAuth: []
 *       - {} # Allows unauthenticated access
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - imageUrl
 *             properties:
 *               imageUrl:
 *                 type: string
 *                 format: uri
 *                 description: The URL of the image to analyze.
 *                 example: "https://example.com/image/sample.png"
 *               conversationId:
 *                 type: string
 *                 description: Optional ID of an existing conversation to continue.
 *                 example: "65e7a2b3c4d5e6f7a8b9c0d1"
 *               guestUserId:
 *                 type: string
 *                 description: Optional ID of the guest user if no authentication token is provided.
 *                 example: "guest_12345"
 *     responses:
 *       200:
 *         description: Image analyzed successfully.
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
 *                   example: "Image analyzed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     analysisResult:
 *                       type: string
 *                       description: The textual result of the image analysis.
 *                       example: "The image depicts a serene landscape with mountains and a lake."
 *                     conversationId:
 *                       type: string
 *                       example: "65e7a2b3c4d5e6f7a8b9c0d1"
 *       400:
 *         description: Bad Request - Invalid input or validation error.
 *       401:
 *         description: Unauthorized - Authentication required or failed.
 *       403:
 *         description: Forbidden - Daily request limit exceeded or access denied.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error.
 */
router.post(
  '/analyze',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(30, 15), // 30 image analysis requests per 15 minutes
  validateRequest(ImageValidation.imageAnalysisSchema),
  imageController.analyzeImage
);

/**
 * @swagger
 * /api/v1/image/stats:
 *   get:
 *     summary: Get image generation and analysis statistics.
 *     description: Retrieves usage statistics for image generation and analysis.
 *       Accessible only by authenticated users with 'ADMIN' or 'USER' roles.
 *     tags:
 *       - Statistics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully.
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
 *                   example: "Image statistics retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalGenerations:
 *                       type: number
 *                       example: 1500
 *                     totalAnalyses:
 *                       type: number
 *                       example: 2300
 *                     userGenerations:
 *                       type: number
 *                       example: 50
 *                     userAnalyses:
 *                       type: number
 *                       example: 75
 *       401:
 *         description: Unauthorized - Authentication required or failed.
 *       403:
 *         description: Forbidden - User does not have the necessary role.
 *       500:
 *         description: Internal Server Error.
 */
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER), // Keep regular auth for stats
  extractTenantContext,
  imageController.getImageStats
);

/**
 * @swagger
 * /api/v1/image/conversation/{conversationId}:
 *   get:
 *     summary: Retrieve a specific image conversation.
 *     description: Fetches a single image conversation by its unique ID.
 *       Accessible by both authenticated users and guests who own the conversation.
 *     tags:
 *       - Conversations
 *     security:
 *       - bearerAuth: []
 *       - {} # Allows unauthenticated access
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the conversation to retrieve.
 *         example: "65e7a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       200:
 *         description: Conversation retrieved successfully.
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
 *                   example: "Conversation retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "65e7a2b3c4d5e6f7a8b9c0d1"
 *                     guestUserId:
 *                       type: string
 *                       example: "guest_12345"
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                             example: "user"
 *                           content:
 *                             type: string
 *                             example: "Generate a picture of a cat."
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-03-05T10:00:00Z"
 *       400:
 *         description: Bad Request - Invalid conversation ID format.
 *       401:
 *         description: Unauthorized - Authentication required or failed.
 *       403:
 *         description: Forbidden - User does not own this conversation or is not authorized.
 *       404:
 *         description: Not Found - Conversation with the given ID does not exist.
 *       500:
 *         description: Internal Server Error.
 */
router.get(
  '/conversation/:conversationId',
  optionalAuth(), // Use optional auth to allow guest access
  extractTenantContext,
  validateRequest(ImageValidation.conversationSchema),
  imageController.getImageConversation
);

/**
 * @swagger
 * /api/v1/image/guest/{guestUserId}/conversations:
 *   get:
 *     summary: Retrieve all image conversations for a specific guest user.
 *     description: Fetches a list of image conversations associated with a given guest user ID.
 *       This endpoint includes an ownership check to prevent Insecure Direct Object Reference (IDOR),
 *       ensuring guests can only access their own conversations and authenticated users (non-admin)
 *       cannot access arbitrary guest conversations.
 *     tags:
 *       - Conversations
 *     security:
 *       - bearerAuth: []
 *       - {} # Allows unauthenticated access
 *     parameters:
 *       - in: path
 *         name: guestUserId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the guest user whose conversations are to be retrieved.
 *         example: "guest_12345"
 *     responses:
 *       200:
 *         description: Guest conversations retrieved successfully.
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
 *                   example: "Guest conversations retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "65e7a2b3c4d5e6f7a8b9c0d1"
 *                       guestUserId:
 *                         type: string
 *                         example: "guest_12345"
 *                       lastMessage:
 *                         type: string
 *                         example: "Generate a picture of a cat."
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-03-05T10:00:00Z"
 *       400:
 *         description: Bad Request - Invalid guest user ID format.
 *       401:
 *         description: Unauthorized - Authentication required or failed.
 *       403:
 *         description: Forbidden - You are not authorized to access these guest conversations.
 *       404:
 *         description: Not Found - No conversations found for the given guest user ID.
 *       500:
 *         description: Internal Server Error.
 */
router.get(
  '/guest/:guestUserId/conversations',
  optionalAuth(), // Use optional auth to allow guest access
  extractTenantContext,
  checkGuestUserOwnership, // Add middleware to prevent IDOR for guest conversations
  validateRequest(ImageValidation.guestUserSchema),
  imageController.getGuestConversations
);

/**
 * Exports the Express router containing all image-related API routes.
 * @type {express.Router}
 */
export const imageRoutes = router;