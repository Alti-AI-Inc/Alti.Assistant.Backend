import express from 'express';
import {
  runAIClassificationAgent,
  getConversationHistory,
  clearConversationHistory,
} from '../../../modules/composio_v2/ai_classification/workflow.js';

/**
 * Express router for handling conversation-related API routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * @swagger
 * /api/conversation/message:
 *   post:
 *     summary: Send a message in an existing conversation or start a new one implicitly.
 *     description: Processes a user message using an AI classification agent, potentially retrieving conversation history.
 *     tags:
 *       - Conversation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - userId
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's message to be processed by the AI.
 *                 example: "What is the current weather in New York?"
 *               userId:
 *                 type: string
 *                 description: The ID of the user sending the message.
 *                 example: "user123"
 *               conversationId:
 *                 type: string
 *                 description: (Optional) The ID of the ongoing conversation. If not provided, a new conversation might be initiated or inferred.
 *                 example: "conv_user123_1678886400000"
 *               retrieveHistory:
 *                 type: boolean
 *                 description: (Optional) Whether to retrieve and include past conversation history for context. Defaults to true.
 *                 example: true
 *     responses:
 *       200:
 *         description: Successfully processed the message and returned the AI agent's response.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 response:
 *                   type: string
 *                   description: The AI's response to the message.
 *                   example: "The weather in New York is sunny with a temperature of 75°F."
 *                 conversationId:
 *                   type: string
 *                   description: The ID of the conversation.
 *                   example: "conv_user123_1678886400000"
 *       400:
 *         description: Bad request, message or userId is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Message and userId are required"
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
 *                 error:
 *                   type: string
 *                   example: "Failed to process message due to an internal error."
 */
router.post('/message', async (req, res) => {
  try {
    const {
      message,
      userId,
      conversationId,
      retrieveHistory = true,
    } = req.body;

    if (!message || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Message and userId are required',
      });
    }

    const result = await runAIClassificationAgent(message, {
      userId,
      conversationId,
      retrieveHistory,
    });

    res.json(result);
  } catch (error) {
    console.error('Error in conversation message:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/conversation/{conversationId}/history:
 *   get:
 *     summary: Retrieve the history of a specific conversation.
 *     description: Fetches all messages and responses associated with a given conversation ID.
 *     tags:
 *       - Conversation
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the conversation to retrieve history for.
 *         example: "conv_user123_1678886400000"
 *     responses:
 *       200:
 *         description: Successfully retrieved conversation history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 history:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                         description: The role of the speaker (e.g., 'user', 'assistant').
 *                         example: "user"
 *                       content:
 *                         type: string
 *                         description: The content of the message.
 *                         example: "Hello, how are you?"
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         description: ISO timestamp of the message.
 *                         example: "2023-03-15T10:00:00Z"
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
 *                 error:
 *                   type: string
 *                   example: "Failed to retrieve conversation history."
 */
router.get('/:conversationId/history', async (req, res) => {
  try {
    const { conversationId } = req.params;

    const result = await getConversationHistory(conversationId);
    res.json(result);
  } catch (error) {
    console.error('Error retrieving conversation history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/conversation/{conversationId}/history:
 *   delete:
 *     summary: Clear the history of a specific conversation.
 *     description: Deletes all messages and responses associated with a given conversation ID, effectively resetting it.
 *     tags:
 *       - Conversation
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the conversation whose history is to be cleared.
 *         example: "conv_user123_1678886400000"
 *     responses:
 *       200:
 *         description: Successfully cleared conversation history.
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
 *                   example: "Conversation history cleared successfully."
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
 *                 error:
 *                   type: string
 *                   example: "Failed to clear conversation history."
 */
router.delete('/:conversationId/history', async (req, res) => {
  try {
    const { conversationId } = req.params;

    const result = await clearConversationHistory(conversationId);
    res.json(result);
  } catch (error) {
    console.error('Error clearing conversation history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/conversation/new:
 *   post:
 *     summary: Start a new conversation with an initial message.
 *     description: Initiates a brand new conversation, generating a unique conversation ID and processing an initial message without retrieving prior history.
 *     tags:
 *       - Conversation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - initialMessage
 *             properties:
 *               userId:
 *                 type: string
 *                 description: The ID of the user starting the new conversation.
 *                 example: "user123"
 *               initialMessage:
 *                 type: string
 *                 description: The first message to send in the new conversation.
 *                 example: "I need help with my account."
 *     responses:
 *       200:
 *         description: Successfully started a new conversation and returned the AI agent's initial response.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 response:
 *                   type: string
 *                   description: The AI's initial response to the message.
 *                   example: "Hello! How can I assist you with your account today?"
 *                 conversationId:
 *                   type: string
 *                   description: The ID of the newly created conversation.
 *                   example: "conv_user123_1678886400000"
 *       400:
 *         description: Bad request, userId or initialMessage is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "UserId and initialMessage are required"
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
 *                 error:
 *                   type: string
 *                   example: "Failed to start new conversation."
 */
router.post('/new', async (req, res) => {
  try {
    const { userId, initialMessage } = req.body;

    if (!userId || !initialMessage) {
      return res.status(400).json({
        success: false,
        error: 'UserId and initialMessage are required',
      });
    }

    // Create new conversation with timestamp-based ID
    const conversationId = `conv_${userId}_${Date.now()}`;

    const result = await runAIClassificationAgent(initialMessage, {
      userId,
      conversationId,
      retrieveHistory: false, // New conversation, no history to retrieve
    });

    res.json({
      ...result,
      conversationId: result.conversationId || conversationId,
    });
  } catch (error) {
    console.error('Error starting new conversation:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Exports the Express router for conversation API routes.
 * @exports router
 */
export default router;