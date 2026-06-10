import express from 'express';
import http from 'http';
import { writingAssistantApp } from './writing_assistant/workflow.js';

/**
 * @typedef {object} WritingTaskRequestBody
 * @property {string} message - The initial message or topic for the writing assistant.
 * @property {string} [conversationId] - An optional ID to continue an existing conversation thread.
 */

/**
 * @typedef {object} WritingTaskStreamingResponseChunk
 * @property {string} chunk - A piece of the streamed text content from the writing assistant.
 */

/**
 * @typedef {object} WritingTaskNonStreamingResponse
 * @property {string} responseMessage - The complete response message from the writing assistant.
 * @property {string} thread_id - The ID of the conversation thread.
 */

/**
 * @typedef {object} ErrorResponse
 * @property {string} error - A descriptive error message.
 */

// --- Express App Setup ---
const app = express();
app.use(express.json());

// A flag to indicate the server is in the process of shutting down.
let isShuttingDown = false;

/**
 * Handles requests to the writing assistant, processing user messages and managing conversation threads.
 * It supports both streaming and non-streaming responses based on the assistant's output.
 *
 * @function
 * @async
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 *
 * @openapi
 * /api/writing-task:
 *   post:
 *     summary: Interact with the AI writing assistant.
 *     description: Sends a message to the AI writing assistant and receives a response, which can be streamed or a single message.
 *     tags:
 *       - Writing Assistant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WritingTaskRequestBody'
 *     responses:
 *       200:
 *         description: Successful response from the writing assistant.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WritingTaskNonStreamingResponse'
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: A stream of JSON objects, each containing a 'chunk' of text.
 *               example: "data: {\"chunk\":\"Hello\"}\n\ndata: {\"chunk\":\" world\"}\n\n"
 *       400:
 *         description: Bad Request - Message is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: 'Message and conversationId are required.'
 *       500:
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: 'An internal error occurred.'
 * components:
 *   schemas:
 *     WritingTaskRequestBody:
 *       type: object
 *       required:
 *         - message
 *       properties:
 *         message:
 *           type: string
 *           description: The initial message or topic for the writing assistant.
 *           example: "Write a short story about a cat who learns to fly."
 *         conversationId:
 *           type: string
 *           description: An optional ID to continue an existing conversation thread.
 *           example: "conv-1678886400000"
 *     WritingTaskNonStreamingResponse:
 *       type: object
 *       properties:
 *         responseMessage:
 *           type: string
 *           description: The complete response message from the writing assistant.
 *           example: "Once upon a time, there was a cat named Whiskers..."
 *         thread_id:
 *           type: string
 *           description: The ID of the conversation thread.
 *           example: "conv-1678886400000"
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: A descriptive error message.
 */
const writingTask = async (req, res) => {
  const { message, conversationId } = req.body;
  if (!message) {
    return res
      .status(400)
      .json({ error: 'Message and conversationId are required.' });
  }

  try {
    const inputs = { initialTopic: message, userInput: message };
    const result = await writingAssistantApp.invoke(inputs, {
      configurable: { thread_id: conversationId },
    });
    const thread_id = conversationId || generateConversationId();
    // Handle streaming for the final content
    if (result.finalContent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const stream = result.finalContent;
      let fullResponse = '';
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const chunk = event.delta.text;
          fullResponse += chunk;
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
      }
      // Save the final content to memory
      // await writingAssistantApp.invoke({ history: [{ role: 'assistant', content: fullResponse }] }, { configurable: { thread_id: thread_id } });
      res.end();
    } else {
      // If not streaming, send the conversational response
      res.json({
        responseMessage: result.responseMessage,
        thread_id: thread_id,
      });
    }
  } catch (error) {
    console.error('Writing Assistant Error:', error);
    res.status(500).json({ error: 'An internal error occurred.' });
  }
};

/**
 * Generates a unique conversation ID.
 * This function currently uses a timestamp to create a simple unique ID.
 *
 * @returns {string} A unique string representing a conversation ID.
 */
const generateConversationId = () => {
  // Generate a unique conversation ID, e.g., using a UUID or timestamp
  return `conv-${Date.now()}`;
};

// --- API Routes ---
app.post('/api/writing-task', writingTask);

// --- Cloud Run Health Checks ---
// Liveness probe: A simple check to see if the server is running.
// Cloud Run uses this to know when to restart a container that is unresponsive.
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Readiness probe: Checks if the container is ready to accept traffic.
// Cloud Run stops sending new requests to containers that fail this check.
// This is useful during startup or before shutting down.
app.get('/readyz', (req, res) => {
  if (isShuttingDown) {
    // If the server is shutting down, it's no longer "ready" to take new requests.
    res.status(503).send('Service Unavailable');
  } else {
    // In a real app, you might check database connections or other dependencies here.
    res.status(200).send('OK');
  }
});

// --- Server Startup ---
// Cloud Run provides the PORT environment variable.
const PORT = process.env.PORT || 8080;
const server = http.createServer(app).listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// --- Graceful Shutdown Logic ---
// Listen for SIGTERM signal (sent by Cloud Run to stop a container).
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  isShuttingDown = true; // Mark as not ready for the readiness probe.

  // Set a timeout to force shutdown if connections don't close gracefully.
  // Cloud Run gives a 10-second grace period by default.
  const shutdownTimeout = setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 9500); // 9.5 seconds

  // Stop accepting new connections and wait for existing ones to finish.
  server.close(() => {
    console.log('HTTP server closed.');
    // Close any other resources like database connections here.
    // e.g., database.close();
    clearTimeout(shutdownTimeout);
    process.exit(0); // Exit gracefully
  });
});