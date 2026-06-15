import express from 'express';
import multer from 'multer';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { TranslationValidation } from './translation.validation.js';
import { translationController } from './translation.controller.js';
import { translationUploadMiddleware } from './middlewares/uploadTranslation.js';

/**
 * Express router for handling translation-related API routes.
 * @type {express.Router}
 */
const router = express.Router();



/**
 * @swagger
 * /api/v1/translation/assistant:
 *   post:
 *     summary: Engage with the AI assistant for conversational translation or document processing.
 *     description: Provides a versatile endpoint for natural language interaction, supporting text-based queries and optional file uploads for document translation. Can be used by authenticated users or guests.
 *     tags:
 *       - Translation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 description: The text message or query for the assistant.
 *                 example: "Translate this to Spanish: Hello, how are you?"
 *               targetLanguage:
 *                 type: string
 *                 description: The desired language for translation (e.g., 'en', 'es'). Defaults to user's preferred language or 'en'.
 *                 example: "es"
 *               sourceLanguage:
 *                 type: string
 *                 description: The source language of the text/file (e.g., 'en', 'es'). Auto-detected if not provided.
 *                 example: "en"
 *               conversationId:
 *                 type: string
 *                 description: Optional ID to continue an existing conversation.
 *                 example: "conv_12345"
 *               documentType:
 *                 type: string
 *                 description: Optional type of document if a file is uploaded (e.g., 'pdf', 'docx').
 *                 example: "pdf"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file to be uploaded for translation (e.g., PDF, DOCX).
 *     responses:
 *       200:
 *         description: Successful response from the conversational assistant.
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
 *                   example: "Conversational assistant response."
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       example: "Hola, ¿cómo estás?"
 *                     conversationId:
 *                       type: string
 *                       example: "conv_12345"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  translationUploadMiddleware, // Use the custom error handler for optional file upload
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(TranslationValidation.conversationalRequestSchema),
  translationController.conversationalAssistant
);

/**
 * @swagger
 * /api/v1/translation/translate:
 *   post:
 *     summary: Translate text directly between specified languages.
 *     description: A direct translation endpoint for text-based content, without conversational context or file upload capabilities.
 *     tags:
 *       - Translation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *               - targetLanguage
 *             properties:
 *               text:
 *                 type: string
 *                 description: The text to be translated.
 *                 example: "Hello world"
 *               targetLanguage:
 *                 type: string
 *                 description: The desired language for translation (e.g., 'es', 'fr').
 *                 example: "es"
 *               sourceLanguage:
 *                 type: string
 *                 description: The source language of the text (e.g., 'en'). Auto-detected if not provided.
 *                 example: "en"
 *     responses:
 *       200:
 *         description: Successful translation.
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
 *                   example: "Text translated successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     translatedText:
 *                       type: string
 *                       example: "Hola mundo"
 *                     sourceLanguage:
 *                       type: string
 *                       example: "en"
 *                     targetLanguage:
 *                       type: string
 *                       example: "es"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/translate',
  optionalAuth(),
  extractTenantContext,
  // createRateLimiter(20, 15), // 20 translations per 15 minutes
  validateRequest(TranslationValidation.translateTextSchema),
  translationController.translateText
);

/**
 * @swagger
 * /api/v1/translation/detect:
 *   post:
 *     summary: Detect the language of a given text.
 *     description: Identifies the language of the input text, returning the detected language code and confidence score.
 *     tags:
 *       - Translation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: The text for which to detect the language.
 *                 example: "Bonjour, comment ça va?"
 *     responses:
 *       200:
 *         description: Language detected successfully.
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
 *                   example: "Language detected successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     language:
 *                       type: string
 *                       example: "fr"
 *                     confidence:
 *                       type: number
 *                       format: float
 *                       example: 0.98
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/detect',
  optionalAuth(),
  extractTenantContext,
  // createRateLimiter(30, 15), // 30 detections per 15 minutes
  validateRequest(TranslationValidation.detectLanguageSchema),
  translationController.detectLanguage
);

/**
 * @swagger
 * /api/v1/translation/languages:
 *   get:
 *     summary: Retrieve a list of all supported translation languages.
 *     description: Returns an array of objects, each representing a supported language with its name and ISO 639-1 code.
 *     tags:
 *       - Translation
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of supported languages.
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
 *                   example: "Supported languages retrieved successfully."
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code:
 *                         type: string
 *                         example: "en"
 *                       name:
 *                         type: string
 *                         example: "English"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/languages',
  optionalAuth(),
  extractTenantContext,
  translationController.getSupportedLanguages
);

/**
 * Exports the translation router.
 * @type {express.Router}
 */
export default router;