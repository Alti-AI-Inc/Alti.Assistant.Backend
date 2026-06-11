import express from 'express';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { articleWriterController } from './article_writer.controller.js';
import { ArticleWriterValidation } from './article_writer.validation.js';
// import { uploadArticleFile } from './middlewares/uploadArticleFile.js'; // Removed local file upload middleware
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';

/**
 * Express router for handling article writer related routes.
 * @type {express.Router}
 */
const router = express.Router();

// Initialize Google Cloud Storage
const storage = new Storage();
const bucketName = process.env.GCS_RAG_BUCKET_NAME; // Ensure this is set in your environment variables

if (!bucketName) {
  console.error(
    'GCS_RAG_BUCKET_NAME environment variable not set. File uploads will fail.'
  );
}

/**
 * @swagger
 * /api/v1/article-writer/assistant/generate-upload-url:
 *   post:
 *     summary: Generate GCS Signed URL for File Upload
 *     description: >
 *       Requests a secure, short-lived URL to upload a file directly to Google Cloud Storage.
 *       This is the first step for providing a file for RAG context. The client must use this URL
 *       to upload the file via a PUT request, and then pass the returned `gcsObjectName` to the
 *       `/assistant` endpoint.
 *     tags:
 *       - Article Writer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fileName:
 *                 type: string
 *                 description: The name of the file to be uploaded.
 *                 example: "medical-research-paper.pdf"
 *               contentType:
 *                 type: string
 *                 description: The MIME type of the file.
 *                 example: "application/pdf"
 *             required:
 *               - fileName
 *               - contentType
 *     responses:
 *       200:
 *         description: Signed URL generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Signed URL generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     signedUrl:
 *                       type: string
 *                       description: The presigned URL for the client to upload the file to.
 *                     gcsObjectName:
 *                       type: string
 *                       description: The unique object name in GCS. This must be sent to the /assistant endpoint.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/assistant/generate-upload-url',
  // 1. Must be an authenticated user to generate an upload URL.
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  // 2. Extract tenant context for data isolation and applying correct limits.
  extractTenantContext,
  // 3. Apply rate limiting.
  createRateLimiter(10, 5),
  // 4. Validate the request payload (fileName, contentType).
  validateRequest(ArticleWriterValidation.generateUploadUrlSchema),
  // 5. Check if the user has enough storage space before generating the URL.
  checkStorageLimit,
  // 6. Verify that the RAG feature is enabled for the user/tenant.
  checkRAGFeature,
  // 7. Controller logic to generate the signed URL.
  async (req, res, next) => {
    try {
      if (!bucketName) {
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Cloud Storage is not configured on the server.'
        );
      }

      const { fileName, contentType } = req.body;
      const tenantId = req.tenant.id;
      const userId = req.user.id;

      // Generate a unique path and filename to prevent collisions and organize by tenant/user.
      const gcsObjectName = `${tenantId}/${userId}/${uuidv4()}-${fileName}`;

      const options = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType: contentType,
      };

      // Get a v4 signed URL for uploading a file
      const [signedUrl] = await storage
        .bucket(bucketName)
        .file(gcsObjectName)
        .getSignedUrl(options);

      res.status(httpStatus.OK).json({
        success: true,
        statusCode: httpStatus.OK,
        message: 'Signed URL generated successfully',
        data: {
          signedUrl,
          gcsObjectName,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/article-writer/assistant:
 *   post:
 *     summary: AI Conversational Assistant
 *     description: >
 *       Main entry point for the AI conversational assistant. Supports both authenticated and guest users.
 *       For RAG capabilities, first obtain a signed URL from `/assistant/generate-upload-url`,
 *       upload the file directly to GCS, and then provide the returned `gcsObjectName` in this request.
 *     tags:
 *       - Article Writer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: The user's natural language query or prompt for the assistant.
 *                 example: "Write an article about the benefits of AI in healthcare, based on the provided document."
 *               conversationId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional ID of an existing conversation to continue.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *               gcsObjectName:
 *                 type: string
 *                 description: Optional. The GCS object name of the uploaded file, obtained from the /generate-upload-url endpoint.
 *                 example: "tenant-id/user-id/uuid-research-paper.pdf"
 *             required:
 *               - content
 *     responses:
 *       200:
 *         description: Successfully processed the request and returned the AI's response.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "AI response generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *                     conversationId:
 *                       type: string
 *                       format: uuid
 *                       description: The ID of the current conversation.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/assistant',
  // 1. Authenticate if a token is provided; otherwise, proceed as a guest.
  optionalAuth(),
  // 2. Extract tenant context for data isolation and applying correct limits.
  extractTenantContext,
  // 3. Apply rate limiting early to prevent abuse and protect server resources.
  createRateLimiter(30, 15),
  // 4. Validate the request payload. This now expects a JSON body with an optional `gcsObjectName`.
  validateRequest(ArticleWriterValidation.conversationalRequestWithGcsSchema),
  // 5. Check if the user/tenant is within their daily request limits.
  checkDailyRequestLimit,
  // 6. The controller now receives the `gcsObjectName` in `req.body` and is responsible for
  //    creating a readable stream from GCS if needed for RAG processing.
  //    Local file system is never touched.
  articleWriterController.conversationalAssistant
);

/**
 * @swagger
 * /api/v1/article-writer/conversation/{conversationId}:
 *   get:
 *     summary: Get Conversation History
 *     description: Retrieves the full history of a specific conversation for an authenticated user.
 *     tags:
 *       - Article Writer
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to retrieve.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Successfully retrieved the conversation history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Conversation history retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                         enum: [user, assistant]
 *                         example: user
 *                       content:
 *                         type: string
 *                         example: "Hello, how are you?"
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-10-27T10:00:00.000Z"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(ArticleWriterValidation.getConversationHistorySchema),
  articleWriterController.getConversationHistory
);

/**
 * Exports the Express router for article writer routes.
 * @type {express.Router}
 */
export const articleWriterRoutes = router;