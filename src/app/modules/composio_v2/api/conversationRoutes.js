import express from 'express';
import {
  runAIClassificationAgent,
  getConversationHistory,
  clearConversationHistory,
} from '../../../modules/composio_v2/ai_classification/workflow.js';

const router = express.Router();

/**
 * POST /api/conversation/message
 * Send a message in a conversation
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
 * GET /api/conversation/:conversationId/history
 * Get conversation history
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
 * DELETE /api/conversation/:conversationId/history
 * Clear conversation history
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
 * POST /api/conversation/new
 * Start a new conversation
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

export default router;
