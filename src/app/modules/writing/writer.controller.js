// This file has been updated to export the writing task handlers.
// Server startup, health endpoints, and shutdown are handled by the main index.js.

import { writingAssistantApp } from './writing_assistant/workflow.js';
import { getAgentList, specializedAgents } from './service/specializedAgents.js';

/**
 * @typedef {object} WritingTaskRequestBody
 * @property {string} message - The user's message (initial topic, an answer to a clarifying question, or "go ahead").
 * @property {string} [conversationId] - An optional ID to continue an existing conversation thread. Omit to start a new one.
 */

/**
 * Generates a unique conversation ID.
 * @returns {string} A unique string representing a conversation ID.
 */
const generateConversationId = () => {
  return `conv-${Date.now()}`;
};

/**
 * Handles requests to the writing assistant, processing user messages and managing
 * conversation threads. Supports both streaming (final content) and non-streaming
 * (clarifying questions / confirmation) responses.
 *
 * @openapi
 * /api/writing/assistant:
 *   post:
 *     summary: Send a message to the AI writing assistant.
 *     description: |
 *       Start a new writing conversation, or continue one by passing the same `conversationId`.
 *       - If the assistant is still gathering details, the response is a normal JSON object
 *         containing the next clarifying question (`isFinal: false`).
 *       - Once the brief is complete (or the user says they're done), the response is streamed
 *         back as Server-Sent Events (`text/event-stream`) containing the final generated content.
 *     tags: [Writing Assistant]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Write a short story about a cat who learns to fly."
 *               conversationId:
 *                 type: string
 *                 example: "conv-1678886400000"
 *     responses:
 *       200:
 *         description: Either a JSON clarifying-question response or an SSE content stream.
 *       400:
 *         description: Bad Request - message is required.
 *       429:
 *         description: Rate limit / usage limit exceeded.
 *       500:
 *         description: Internal Server Error.
 */
export const writingTask = async (req, res) => {
  const { message, conversationId } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'A non-empty "message" field is required.' });
  }

  // Always resolve the thread_id up front so the caller gets it back even on the
  // very first message (previously it was only computed after the invoke resolved,
  // and was absent from the streaming response entirely).
  const thread_id = conversationId || generateConversationId();

  try {
    const inputs = { initialTopic: message, userInput: message, user: req.user };
    const result = await writingAssistantApp.invoke(inputs, {
      configurable: { thread_id },
    });

    if (result.finalContent) {
      // --- Final content: stream it back as Server-Sent Events ---
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Conversation-Id', thread_id);
      res.flushHeaders();

      // Send metadata (which agents were used) before the content itself so the
      // client can render "Writing with: Legal / NDA agent" style UI immediately.
      res.write(`event: meta\ndata: ${JSON.stringify({
        thread_id,
        selectedAgent: result.selectedAgent || null,
        selectedStyle: result.selectedStyle || null,
        selectedPurpose: result.selectedPurpose || null,
        isSwarm: !!result.isSwarm,
      })}\n\n`);

      try {
        for await (const event of result.finalContent) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            res.write(`data: ${JSON.stringify({ chunk: event.delta.text })}\n\n`);
          }
        }
      } catch (streamError) {
        console.error('Writing Assistant Stream Error:', streamError);
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Streaming interrupted. Please retry.' })}\n\n`);
      } finally {
        res.write('event: done\ndata: {}\n\n');
        res.end();
      }
    } else {
      // --- Still gathering the brief: normal JSON response ---
      res.status(200).json({
        thread_id,
        isFinal: false,
        responseMessage: result.responseMessage,
        pendingQuestions: result.questions || [],
      });
    }
  } catch (error) {
    console.error('Writing Assistant Error:', error);
    const isLimitError = /limit reached|too many/i.test(error.message || '');
    res.status(isLimitError ? 429 : 500).json({
      error: error.message && isLimitError ? error.message : 'An internal error occurred.',
    });
  }
};

/**
 * Retrieves the current state (history, brief, status) of an existing conversation.
 *
 * @openapi
 * /api/writing/assistant/{conversationId}:
 *   get:
 *     summary: Get the current state of a writing conversation.
 *     tags: [Writing Assistant]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Conversation state. }
 *       404: { description: No conversation found for that ID. }
 *       500: { description: Internal Server Error. }
 */
export const getConversation = async (req, res) => {
  const { conversationId } = req.params;
  if (!conversationId) {
    return res.status(400).json({ error: 'conversationId is required.' });
  }

  try {
    const state = await writingAssistantApp.getState({ configurable: { thread_id: conversationId } });

    if (!state || !state.values || Object.keys(state.values).length === 0) {
      return res.status(404).json({ error: `No conversation found for id "${conversationId}".` });
    }

    const {
      history,
      writingBrief,
      responseMessage,
      questions,
      selectedAgent,
      selectedStyle,
      selectedPurpose,
      isSwarm,
    } = state.values;

    res.status(200).json({
      thread_id: conversationId,
      // `next` is populated with nodes still queued to run; an empty array means the
      // graph has reached an END and is waiting on the next user message.
      status: state.next && state.next.length > 0 ? 'in_progress' : 'awaiting_input',
      history: history || [],
      writingBrief: writingBrief || '',
      responseMessage: responseMessage || null,
      pendingQuestions: questions || [],
      selectedAgent: selectedAgent || null,
      selectedStyle: selectedStyle || null,
      selectedPurpose: selectedPurpose || null,
      isSwarm: !!isSwarm,
    });
  } catch (error) {
    console.error('Get Conversation Error:', error);
    res.status(500).json({ error: 'An internal error occurred while retrieving the conversation.' });
  }
};

/**
 * Deletes a conversation thread and its checkpoint history.
 *
 * @openapi
 * /api/writing/assistant/{conversationId}:
 *   delete:
 *     summary: Delete a writing conversation and its stored history.
 *     tags: [Writing Assistant]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted. }
 *       400: { description: conversationId is required. }
 *       501: { description: The active checkpointer does not support deletion. }
 *       500: { description: Internal Server Error. }
 */
export const deleteConversation = async (req, res) => {
  const { conversationId } = req.params;
  if (!conversationId) {
    return res.status(400).json({ error: 'conversationId is required.' });
  }

  try {
    const checkpointer = writingAssistantApp.checkpointer;

    // LangGraph JS doesn't standardize a thread-deletion method across checkpointer
    // implementations, so we defensively probe for one. To support this fully,
    // add a `deleteThread(threadId)` (or `delete(threadId)`) method to MongoDBSaver
    // that removes all checkpoint documents whose thread_id matches.
    if (typeof checkpointer?.deleteThread === 'function') {
      await checkpointer.deleteThread(conversationId);
    } else if (typeof checkpointer?.delete === 'function') {
      await checkpointer.delete(conversationId);
    } else {
      return res.status(501).json({
        error: 'Deletion is not supported by the active checkpointer yet. Add a deleteThread(threadId) method to MongoDBSaver to enable this endpoint.',
      });
    }

    res.status(200).json({ success: true, thread_id: conversationId, message: 'Conversation deleted.' });
  } catch (error) {
    console.error('Delete Conversation Error:', error);
    res.status(500).json({ error: 'An internal error occurred while deleting the conversation.' });
  }
};

/**
 * Lists all specialized writing agents (metadata only), optionally filtered by category.
 *
 * @openapi
 * /api/writing/assistant/agents:
 *   get:
 *     summary: List all specialized writing agents.
 *     tags: [Writing Assistant]
 *     parameters:
 *       - in: query
 *         name: category
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of agents. }
 */
export const listAgents = (req, res) => {
  try {
    const { category } = req.query;
    let agents = getAgentList();
    if (category) {
      agents = agents.filter((a) => a.category.toLowerCase() === String(category).toLowerCase());
    }
    res.status(200).json({ count: agents.length, agents });
  } catch (error) {
    console.error('List Agents Error:', error);
    res.status(500).json({ error: 'An internal error occurred while listing agents.' });
  }
};

/**
 * Gets full details (including systemPrompt) for a single specialized agent by ID.
 *
 * @openapi
 * /api/writing/assistant/agents/{agentId}:
 *   get:
 *     summary: Get full details for a single specialized writing agent.
 *     tags: [Writing Assistant]
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Agent details. }
 *       404: { description: Agent not found. }
 */
export const getAgentDetails = (req, res) => {
  const { agentId } = req.params;
  const agent = specializedAgents.find((a) => a.id === agentId);
  if (!agent) {
    return res.status(404).json({ error: `Agent "${agentId}" not found.` });
  }
  res.status(200).json(agent);
};