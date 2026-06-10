/**
 * @file This file defines the API routes for transcription services,
 * including audio uploads, smart transcription assistant interactions,
 * and transcription statistics retrieval. It configures Multer for
 * handling multipart/form-data audio file uploads and applies various
 * authentication, authorization, rate limiting, and tenant context
 * middlewares.
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';
import { TranscriptionValidation } from './transcription.validation.js';
import { transcriptionController } from './transcription.controller.js';

/**
 * Express router for transcription-related routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * Configures Multer for disk storage of audio files.
 * Files are stored in 'uploads/audio/' with a unique filename.
 * @type {multer.StorageEngine}
 */
const storage = multer.diskStorage({
  /**
   * Determines the destination directory for uploaded files.
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {(error: Error | null, destination: string) => void} cb - The callback function to set the destination.
   */
  destination: (req, file, cb) => {
    cb(null, 'uploads/audio/');
  },
  /**
   * Determines the filename for uploaded files.
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {(error: Error | null, filename: string) => void} cb - The callback function to set the filename.
   */
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'audio-' + uniqueSuffix + path.extname(file.originalname));
  },
});

/**
 * Filters incoming files to ensure only allowed audio MIME types are accepted.
 * @param {import('express').Request} req - The Express request object.
 * @param {Express.Multer.File} file - The file being uploaded.
 * @param {(error: Error | null, acceptFile: boolean) => void} cb - The callback function to accept or reject the file.
 */
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'audio/wav',
    'audio/mp3',
    'audio/mpeg',
    'audio/aiff',
    'audio/aac',
    'audio/ogg',
    'audio/flac',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Invalid audio format. Supported: WAV, MP3, AIFF, AAC, OGG, FLAC'
      ),
      false
    );
  }
};

/**
 * Multer instance configured for audio file uploads.
 * - Uses the defined `storage` engine.
 * - Applies the `fileFilter` to restrict file types.
 * - Sets a file size limit of 20MB.
 * @type {multer.Multer}
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
});

/**
 * @swagger
 * /assistant:
 *   post:
 *     summary: Smart Transcription Assistant - Unified Endpoint
 *     description: |
 *       This unified endpoint handles various interactions with the transcription assistant,
 *       including single audio file uploads, batch audio file uploads, and chat messages.
 *       The system automatically determines the action based on the request content.
 *       It supports both authenticated and unauthenticated requests (optionalAuth).
 *       Features like daily request limits, storage limits, and RAG (Retrieval Augmented Generation)
 *       are applied via middleware.
 *     tags:
 *       - Transcription
 *     security:
 *       - BearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: formData
 *         name: audio
 *         type: file
 *         description: Optional. A single audio file for transcription. Max 20MB.
 *         required: false
 *       - in: formData
 *         name: audios
 *         type: array
 *         items:
 *           type: file
 *         description: Optional. An array of audio files for batch transcription. Max 10 files, each max 20MB.
 *         required: false
 *       - in: body
 *         name: chatMessage
 *         description: Optional. A JSON object containing chat message details for the assistant.
 *         schema:
 *           type: object
 *           properties:
 *             message:
 *               type: string
 *               description: The user's chat message.
 *             conversationId:
 *               type: string
 *               description: Optional. The ID of an existing conversation.
 *             context:
 *               type: string
 *               description: Optional. Additional context for the assistant.
 *           example:
 *             message: "Transcribe this audio and summarize it."
 *             conversationId: "abc-123"
 *     responses:
 *       200:
 *         description: Transcription or chat response successful.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               description: The transcription result or chat assistant response.
 *       400:
 *         description: Bad Request - Invalid input, file format, or missing required fields.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have permission or limit exceeded.
 *       413:
 *         description: Payload Too Large - File size exceeds limit.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error.
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'audios', maxCount: 10 },
  ]),
  checkRAGFeature,
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  transcriptionController.smartTranscriptionAssistant
);

/**
 * @swagger
 * /stats:
 *   get:
 *     summary: Get Transcription Statistics
 *     description: Retrieves transcription statistics for the authenticated user or tenant.
 *                  Requires authentication with ADMIN or USER role.
 *     tags:
 *       - Transcription
 *     security:
 *       - BearerAuth: []
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: Transcription statistics retrieved successfully.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 totalTranscriptions:
 *                   type: number
 *                   description: Total number of transcriptions.
 *                 totalAudioDuration:
 *                   type: number
 *                   description: Total duration of audio transcribed in seconds.
 *                 dailyRequestsRemaining:
 *                   type: number
 *                   description: Number of daily requests remaining.
 *                 storageUsedBytes:
 *                   type: number
 *                   description: Total storage used by transcriptions in bytes.
 *                 storageLimitBytes:
 *                   type: number
 *                   description: Total storage limit in bytes.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have the necessary role (ADMIN or USER).
 *       500:
 *         description: Internal Server Error.
 */
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  transcriptionController.getTranscriptionStats
);

/**
 * Exports the Express router for transcription routes.
 * @type {express.Router}
 */
export const TranscriptionRoutes = router;