import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { videoController } from './video.controller.js';
import { VideoValidation } from './video.validation.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';

const router = express.Router();

/**
 * @openapi
 * /video/generate:
 *   post:
 *     summary: Generate a new video
 *     description: |
 *       Initiates a video generation process based on a provided prompt.
 *       This endpoint supports both authenticated users and guest users.
 *       - For authenticated users, the video is associated with their account and tenant.
 *       - For guest users, a `guestUserId` must be provided to track their conversations.
 *       The endpoint returns an operation ID which can be used to check the status of the generation process.
 *     tags:
 *       - Video
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The text prompt to generate the video from.
 *                 example: "A futuristic city with flying cars at sunset"
 *               conversationId:
 *                 type: string
 *                 description: The ID of an existing conversation to continue. If not provided, a new conversation is created.
 *                 example: "conv_12345"
 *               guestUserId:
 *                 type: string
 *                 description: A unique identifier for a guest user. Required if the user is not authenticated.
 *                 example: "guest_abcde"
 *     responses:
 *       '200':
 *         description: Video generation process started successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Video generation started"
 *                 data:
 *                   type: object
 *                   properties:
 *                     operationId:
 *                       type: string
 *                       description: The ID to track the video generation operation.
 *                       example: "op_67890"
 *                     conversationId:
 *                       type: string
 *                       description: The ID of the conversation this video belongs to.
 *                       example: "conv_12345"
 *       '400':
 *         description: Bad Request - Invalid input data.
 *       '401':
 *         description: Unauthorized - Invalid or missing authentication token.
 *       '429':
 *         description: Too Many Requests - Rate limit or daily request limit exceeded.
 */
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(10, 15), // 10 video requests per 15 minutes
  validateRequest(VideoValidation.videoGenerationSchema),
  videoController.generateVideo
);

/**
 * @openapi
 * /video/operations:
 *   post:
 *     summary: Get video generation operation status
 *     description: |
 *       Checks the status of a long-running video generation operation using the operation ID.
 *       This endpoint supports both authenticated and guest users.
 *     tags:
 *       - Video
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - operationId
 *             properties:
 *               operationId:
 *                 type: string
 *                 description: The ID of the operation to check.
 *                 example: "op_67890"
 *     responses:
 *       '200':
 *         description: Operation status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [pending, processing, succeeded, failed]
 *                       description: The current status of the operation.
 *                     result:
 *                       type: object
 *                       description: The result of the operation if it has succeeded. Contains video URL and other metadata.
 *                     error:
 *                       type: object
 *                       description: Details of the error if the operation has failed.
 *       '400':
 *         description: Bad Request - Invalid operation ID.
 *       '404':
 *         description: Not Found - The operation ID does not exist.
 *       '429':
 *         description: Too Many Requests - Rate limit exceeded.
 */
router.post(
  '/operations',
  optionalAuth(),
  extractTenantContext,
  createRateLimiter(20, 1), // 20 requests per 1 minute - to prevent polling abuse
  videoController.getOperationStatus
);

/**
 * @openapi
 * /video/stats:
 *   get:
 *     summary: Get video generation statistics
 *     description: |
 *       Retrieves statistics about video generation for the authenticated user or tenant.
 *       Requires authentication.
 *     tags:
 *       - Video
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalVideos:
 *                       type: integer
 *                       description: Total number of videos generated.
 *                     totalDuration:
 *                       type: number
 *                       description: Total duration of all generated videos in seconds.
 *       '401':
 *         description: Unauthorized - User is not authenticated.
 *       '403':
 *         description: Forbidden - User does not have the required role.
 *       '429':
 *         description: Too Many Requests - Rate limit exceeded.
 * @permission Must be authenticated as `ADMIN` or `USER`.
 * @tenantContext The user's `tenantId` is extracted from the JWT and used to scope the query.
 */
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(30, 1), // 30 requests per minute to prevent abuse
  videoController.getVideoStats
);

/**
 * @openapi
 * /video/conversation/{conversationId}:
 *   get:
 *     summary: Get a video conversation
 *     description: |
 *       Retrieves the details and messages of a specific video conversation.
 *       This endpoint is accessible to both authenticated users (who own the conversation) and guest users.
 *     tags:
 *       - Video
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the conversation.
 *     responses:
 *       '200':
 *         description: Conversation retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/VideoConversation'
 *       '400':
 *         description: Bad Request - Invalid conversation ID format.
 *       '404':
 *         description: Not Found - The conversation does not exist or the user does not have access.
 *       '429':
 *         description: Too Many Requests - Rate limit exceeded.
 */
router.get(
  '/conversation/:conversationId',
  optionalAuth(),
  extractTenantContext,
  createRateLimiter(30, 1), // 30 requests per minute to prevent ID enumeration and brute-force attacks
  validateRequest(VideoValidation.conversationSchema),
  videoController.getVideoConversation
);

/**
 * @openapi
 * /video/guest/{guestUserId}/conversations:
 *   get:
 *     summary: Get all conversations for a guest user
 *     description: |
 *       Retrieves a list of all video conversations associated with a specific guest user ID.
 *       This endpoint is primarily for guest users to retrieve their conversation history.
 *     tags:
 *       - Video
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: guestUserId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the guest user.
 *     responses:
 *       '200':
 *         description: Guest conversations retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VideoConversation'
 *       '400':
 *         description: Bad Request - Invalid guest user ID format.
 *       '404':
 *         description: Not Found - No conversations found for the given guest user ID.
 *       '429':
 *         description: Too Many Requests - Rate limit exceeded.
 */
router.get(
  '/guest/:guestUserId/conversations',
  optionalAuth(),
  extractTenantContext,
  createRateLimiter(20, 1), // 20 requests per minute to prevent ID enumeration and brute-force attacks
  validateRequest(VideoValidation.guestUserSchema),
  videoController.getGuestConversations
);

/**
 * Express router for video-related endpoints.
 * @type {express.Router}
 */
export const videoRoutes = router;