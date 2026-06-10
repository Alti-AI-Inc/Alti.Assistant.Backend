import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
// BUG FIX: Aliased LlamaAiController to GroqAiController for consistency with the file path (groq.route.js)
// and Swagger documentation (Groq AI). This allows the route file to use a consistent name
// without requiring changes to the groq.controller.js file's export name.
import { LlamaAiController as GroqAiController } from './groq.controller.js';
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Groq AI
 *   description: API for interacting with the Groq AI model and managing AI responses.
 */

/**
 * @swagger
 * /api/v1/groq/get-response:
 *   post:
 *     summary: Get a response from the Groq AI model.
 *     description: Sends a user message to the Groq AI model and retrieves a response. Requires user authentication.
 *     tags: [Groq AI]
 *     security:
 *       - BearerAuth: [admin, user]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's message or prompt for the AI.
 *               sessionId:
 *                 type: string
 *                 description: Optional session ID to continue a conversation.
 *                 nullable: true
 *             example:
 *               message: "Hello, how are you?"
 *               sessionId: "65e7b3b3b3b3b3b3b3b3b3b3"
 *     responses:
 *       200:
 *         description: AI response successfully retrieved.
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
 *                   example: "AI response retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *                     sessionId:
 *                       type: string
 *                       description: The session ID for the conversation.
 *               example:
 *                 success: true
 *                 statusCode: 200
 *                 message: "AI response retrieved successfully"
 *                 data:
 *                   response: "I am doing well, thank you for asking!"
 *                   sessionId: "65e7b3b3b3b3b3b3b3b3b3b3"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // BUG FIX: Changed controller reference from LlamaAiController to GroqAiController for consistency.
  GroqAiController.GroqAiGetResponse
);

/**
 * @swagger
 * /api/v1/groq/get-response-anonymously:
 *   post:
 *     summary: Get an anonymous response from the Groq AI model.
 *     description: Sends a user message to the Groq AI model and retrieves a response without requiring authentication.
 *     tags: [Groq AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's message or prompt for the AI.
 *             example:
 *               message: "Tell me a fun fact."
 *     responses:
 *       200:
 *         description: AI response successfully retrieved.
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
 *                   example: "AI response retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *               example:
 *                 success: true
 *                 statusCode: 200
 *                 message: "AI response retrieved successfully"
 *                 data:
 *                   response: "The shortest war in history was between Britain and Zanzibar on August 27, 1896. Zanzibar surrendered after 38 minutes."
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/get-response-anonymously',
  // BUG FIX: Changed controller reference from LlamaAiController to GroqAiController for consistency.
  GroqAiController.GroqAiGetResponseAnonymously
);

/**
 * @swagger
 * /api/v1/groq/get-response-from-db:
 *   get:
 *     summary: Retrieve all AI responses for the authenticated user from the database.
 *     description: Fetches a list of all AI conversation sessions associated with the currently authenticated user.
 *     tags: [Groq AI]
 *     security:
 *       - BearerAuth: [admin, user]
 *     responses:
     *       200:
     *         description: AI responses retrieved successfully.
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
     *                   example: "AI responses retrieved successfully"
     *                 data:
     *                   type: array
     *                   items:
     *                     $ref: '#/components/schemas/AiSession'
     *               example:
     *                 success: true
     *                 statusCode: 200
     *                 message: "AI responses retrieved successfully"
     *                 data:
     *                   - _id: "65e7b3b3b3b3b3b3b3b3b3b3"
     *                     userId: "65e7b3b3b3b3b3b3b3b3b3b2"
     *                     messages:
     *                       - role: "user"
     *                         content: "Hello"
     *                       - role: "assistant"
     *                         content: "Hi there! How can I help you today?"
     *                     createdAt: "2024-03-05T10:00:00.000Z"
     *                     updatedAt: "2024-03-05T10:05:00.000Z"
     *                   - _id: "65e7b3b3b3b3b3b3b3b3b3b4"
     *                     userId: "65e7b3b3b3b3b3b3b3b3b3b2"
     *                     messages:
     *                       - role: "user"
     *                         content: "Tell me a joke."
     *                       - role: "assistant"
     *                         content: "Why don't scientists trust atoms? Because they make up everything!"
     *                     createdAt: "2024-03-05T11:00:00.000Z"
     *                     updatedAt: "2024-03-05T11:02:00.000Z"
     *       401:
     *         $ref: '#/components/responses/Unauthorized'
     *       403:
     *         $ref: '#/components/responses/Forbidden'
     *       500:
     *         $ref: '#/components/responses/InternalServerError'
     */
router.get(
  '/get-response-from-db',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // BUG FIX: Changed controller reference from LlamaAiController to GroqAiController for consistency.
  GroqAiController.LlamaAiGetResponseFromDbByUserId
);

/**
 * @swagger
 * /api/v1/groq/get-response-by-sessionid/{sessionId}:
 *   get:
 *     summary: Retrieve a specific AI response session by its ID.
 *     description: Fetches a single AI conversation session from the database using its unique session ID.
 *     tags: [Groq AI]
 *     security:
 *       - BearerAuth: [admin, user]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         schema:
 *           type: string
 *           format: objectId
 *         required: true
 *         description: The ID of the AI session to retrieve.
 *         example: "65e7b3b3b3b3b3b3b3b3b3b3"
 *     responses:
 *       200:
 *         description: AI session retrieved successfully.
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
 *                   example: "AI session retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/AiSession'
 *               example:
 *                 success: true
 *                 statusCode: 200
 *                 message: "AI session retrieved successfully"
 *                 data:
 *                   _id: "65e7b3b3b3b3b3b3b3b3b3b3"
 *                   userId: "65e7b3b3b3b3b3b3b3b3b3b2"
 *                   messages:
 *                     - role: "user"
 *                       content: "Hello"
 *                     - role: "assistant"
 *                       content: "Hi there! How can I help you today?"
 *                   createdAt: "2024-03-05T10:00:00.000Z"
 *                   updatedAt: "2024-03-05T10:05:00.000Z"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/get-response-by-sessionid/:sessionId',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // BUG FIX: Changed controller reference from LlamaAiController to GroqAiController for consistency.
  GroqAiController.LlamaAiGetResponseFromDbBySessionId
);

/**
 * @swagger
 * /api/v1/groq/delete-single-response/{objectId}:
 *   delete:
 *     summary: Delete a single AI response session by its ID.
 *     description: Deletes a specific AI conversation session from the database using its unique object ID.
 *     tags: [Groq AI]
 *     security:
 *       - BearerAuth: [admin, user]
 *     parameters:
 *       - in: path
 *         name: objectId
 *         schema:
 *           type: string
 *           format: objectId
 *         required: true
 *         description: The ID of the AI session to delete.
 *         example: "65e7b3b3b3b3b3b3b3b3b3b3"
 *     responses:
 *       200:
 *         description: AI session deleted successfully.
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
 *                   example: "AI session deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
     *                       type: number
     *                       example: 1
     *               example:
     *                 success: true
     *                 statusCode: 200
     *                 message: "AI session deleted successfully"
     *                 data:
     *                   deletedCount: 1
     *       401:
     *         $ref: '#/components/responses/Unauthorized'
     *       403:
     *         $ref: '#/components/responses/Forbidden'
     *       404:
     *         $ref: '#/components/responses/NotFound'
     *       500:
     *         $ref: '#/components/responses/InternalServerError'
     */
router.delete(
  '/delete-single-response/:objectId',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // BUG FIX: Changed controller reference from LlamaAiController to GroqAiController for consistency.
  GroqAiController.deleteOneAiSession
);

/**
 * @swagger
 * /api/v1/groq/delete-all-response-from-db:
 *   delete:
 *     summary: Delete all AI response sessions for the authenticated user.
 *     description: Deletes all AI conversation sessions associated with the currently authenticated user from the database.
 *     tags: [Groq AI]
 *     security:
 *       - BearerAuth: [admin, user]
 *     responses:
 *       200:
 *         description: All AI sessions deleted successfully.
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
 *                   example: "All AI sessions deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: number
 *                       example: 5
 *               example:
 *                 success: true
 *                 statusCode: 200
 *                 message: "All AI sessions deleted successfully"
 *                 data:
 *                   deletedCount: 5
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete(
  '/delete-all-response-from-db',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // BUG FIX: Changed controller reference from LlamaAiController to GroqAiController for consistency.
  GroqAiController.deleteAllAiSessions
);

/**
 * @swagger
 * components:
 *   schemas:
 *     AiSession:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           format: objectId
 *           description: The unique identifier for the AI session.
 *           example: "65e7b3b3b3b3b3b3b3b3b3b3"
 *         userId:
 *           type: string
 *           format: objectId
 *           description: The ID of the user associated with this session.
 *           example: "65e7b3b3b3b3b3b3b3b3b3b2"
 *         messages:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, assistant]
 *                 description: The role of the message sender (user or assistant).
 *               content:
 *                 type: string
 *                 description: The content of the message.
 *           description: An array of messages exchanged in the session.
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The timestamp when the session was created.
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: The timestamp when the session was last updated.
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: Enter JWT Bearer token **_only_**
 *   responses:
 *     Unauthorized:
 *       description: Unauthorized - Authentication token is missing or invalid.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               statusCode:
 *                 type: number
 *                 example: 401
 *               message:
 *                 type: string
 *                 example: "Unauthorized Access"
 *     Forbidden:
 *       description: Forbidden - You do not have permission to access this resource.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               statusCode:
 *                 type: number
 *                 example: 403
 *               message:
 *                 type: string
 *                 example: "Forbidden Access"
 *     NotFound:
 *       description: Not Found - The requested resource could not be found.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               statusCode:
 *                 type: number
 *               example: 404
 *               message:
 *                 type: string
 *                 example: "Not Found"
 *     InternalServerError:
 *       description: Internal Server Error - Something went wrong on the server.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               statusCode:
 *                 type: number
 *                 example: 500
 *               message:
 *                 type: string
 *                 example: "Internal Server Error"
 */

/**
 * @typedef {import('express').Router} Router
 */

/**
 * @type {Router}
 * @description The main router for Groq/Llama AI related routes.
 *   Handles operations such as getting AI responses, retrieving conversation history,
 *   and managing AI sessions in the database.
 */
// BUG FIX: Renamed exported router from llamaAiRoutes to groqAiRoutes for consistency with the module's context.
export const groqAiRoutes = router;