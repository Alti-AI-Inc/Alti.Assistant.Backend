/**
 * @file This file defines the API routes for managing notes in the Inso.Assistant application.
 * @module app/modules/notes/notes.route
 * @requires express
 * @requires @google-cloud/pubsub
 * @requires ../../middlewares/validateRequest/validateRequest
 * @requires ./notes.controller
 * @requires ./notes.validation
 */

// GCP_INTEGRATION: Importing the Google Cloud Pub/Sub client for asynchronous task offloading.
const { PubSub } = require('@google-cloud/pubsub');
const express = require('express');

// GCP_INTEGRATION: Initialize the Pub/Sub client.
// This should be done once per application instance and the client should be reused.
// Ensure your environment is authenticated (e.g., by setting GOOGLE_APPLICATION_CREDENTIALS).
const pubSubClient = new PubSub();

// GCP_INTEGRATION: Define the Pub/Sub topic for offloading bulk delete operations.
// Using environment variables for configuration is a best practice.
const bulkDeleteTopicName =
  process.env.NOTES_BULK_DELETE_TOPIC || 'note-bulk-delete-topic';

/**
 * Express router to handle note-related API endpoints.
 * @type {express.Router}
 */
const router = express.Router();
/**
 * Controller for handling note-related business logic.
 * @type {object}
 */
const taskController = require('./notes.controller');
const {
  /**
   * Middleware for validating incoming request bodies against a schema.
   * @function
   */
  validateRequest,
} = require('../../middlewares/validateRequest/validateRequest');
/**
 * Joi validation schema for note-related operations.
 * @type {object}
 */
const taskValidationSchema = require('./notes.validation');

/**
 * @swagger
 * /api/v1/notes/all-note/{userId}:
 *   get:
 *     summary: Get all notes for a specific user
 *     description: Retrieves a list of all notes associated with the given user ID.
 *     tags:
 *       - Notes
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique ID of the user whose notes are to be retrieved.
 *     responses:
 *       200:
 *         description: Successfully retrieved all notes for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Note'
 *       404:
 *         description: User not found or no notes found for the user.
 *       500:
 *         description: Internal server error.
 */
// PERFORMANCE_OPTIMIZER_AI: To optimize the 'getAllTask' operation, which queries notes by userId,
// ensure the 'userId' field in the 'notes' collection has a database index. This will significantly
// speed up lookups for this frequently used endpoint.
// Example Mongoose schema definition: `userId: { type: Schema.Types.ObjectId, ref: 'User', index: true }`
router.route('/all-note/:userId').get(taskController.getAllTask);

/**
 * @swagger
 * /api/v1/notes/bulk-delete:
 *   delete:
 *     summary: Asynchronously bulk delete multiple notes
 *     description: Accepts a request to delete multiple notes and offloads the task to a background worker via Pub/Sub. Returns a 202 Accepted response immediately.
 *     tags:
 *       - Notes
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of note IDs to be deleted.
 *                 example: ["noteId1", "noteId2"]
 *     responses:
 *       202:
 *         description: The bulk delete request has been accepted for background processing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Bulk delete request accepted. The notes will be deleted in the background."
 *                 jobId:
 *                   type: string
 *                   description: The unique ID of the published message, which can be used for tracking.
 *                   example: "1234567890"
 *       400:
 *         description: Invalid request body or no IDs provided.
 *       500:
 *         description: Internal server error, e.g., failed to publish the job to Pub/Sub.
 */
router.route('/bulk-delete').delete(
  // ASYNC_REFACTOR: Offloaded bulk delete to a background worker via Pub/Sub.
  // This endpoint now accepts the request and publishes a message to a topic instead of deleting synchronously.
  // A separate, stateless worker service will subscribe to this topic to perform the actual database deletion.
  // This prevents long-running requests, improves API responsiveness, and allows for better scaling and resilience.
  async (req, res, next) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res
          .status(400)
          .json({ message: 'Invalid request: "ids" must be a non-empty array.' });
      }

      // The message payload for Pub/Sub must be a Buffer.
      const dataBuffer = Buffer.from(JSON.stringify({ ids }));

      // Publishes the message to the designated Pub/Sub topic.
      const messageId = await pubSubClient
        .topic(bulkDeleteTopicName)
        .publishMessage({ data: dataBuffer });

      // It's good practice to log the successful publishing of a message for traceability.
      console.log(
        `Message ${messageId} published to topic ${bulkDeleteTopicName} for bulk deletion.`
      );

      // Respond with 202 Accepted to indicate the request has been received for processing.
      res.status(202).json({
        message:
          'Bulk delete request accepted. The notes will be deleted in the background.',
        jobId: messageId, // Optionally return the messageId as a job identifier for tracking.
      });
    } catch (error) {
      console.error(
        `Error publishing bulk delete message to Pub/Sub: ${error.message}`,
        error
      );
      // Pass the error to the Express error handling middleware for a consistent 500 response.
      next(error);
    }
  }
);

router
  .route('/:id')
  /**
   * @swagger
   * /api/v1/notes/{id}:
   *   get:
   *     summary: Get a single note by ID
   *     description: Retrieves a specific note using its unique ID.
   *     tags:
   *       - Notes
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: The unique ID of the note to retrieve.
   *     responses:
   *       200:
   *         description: Successfully retrieved the note.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Note'
   *       404:
   *         description: Note not found.
   *       500:
   *         description: Internal server error.
   */
  .get(taskController.getTaskById)
  /**
   * @swagger
   * /api/v1/notes/{id}:
   *   patch:
   *     summary: Update a note by ID
   *     description: Updates an existing note identified by its ID with the provided data.
   *     tags:
   *       - Notes
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: The unique ID of the note to update.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/NoteUpdatePayload'
   *     responses:
   *       200:
   *         description: Successfully updated the note.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Note'
   *       400:
   *         description: Invalid request body.
   *       404:
   *         description: Note not found.
   *       500:
   *         description: Internal server error.
   */
  .patch(taskController.updateTask)
  /**
   * @swagger
   * /api/v1/notes/{id}:
   *   delete:
   *     summary: Delete a note by ID
   *     description: Deletes a specific note using its unique ID.
   *     tags:
   *       - Notes
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: The unique ID of the note to delete.
   *     responses:
   *       200:
   *         description: Successfully deleted the note.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "Note deleted successfully"
   *       404:
   *         description: Note not found.
   *       500:
   *         description: Internal server error.
   */
  .delete(taskController.deleteTask);

router
  .route('/')
  /**
   * @swagger
   * /api/v1/notes:
   *   post:
   *     summary: Create a new note
   *     description: Adds a new note to the system.
   *     tags:
   *       - Notes
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/NoteCreationPayload'
   *     responses:
   *       201:
   *         description: Successfully created a new note.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Note'
   *       400:
   *         description: Invalid request body.
   *       500:
   *         description: Internal server error.
   */
  .post(validateRequest(taskValidationSchema), taskController.addTask);

/**
 * @typedef {object} Note
 * @property {string} _id - The unique identifier for the note.
 * @property {string} userId - The ID of the user who owns the note.
 * @property {string} title - The title of the note.
 * @property {string} content - The main content of the note.
 * @property {string[]} tags - An array of tags associated with the note.
 * @property {string} createdAt - The timestamp when the note was created.
 * @property {string} updatedAt - The timestamp when the note was last updated.
 */

/**
 * @typedef {object} NoteCreationPayload
 * @property {string} userId - The ID of the user creating the note.
 * @property {string} title - The title of the note.
 * @property {string} content - The main content of the note.
 * @property {string[]} [tags] - An optional array of tags for the note.
 */

/**
 * @typedef {object} NoteUpdatePayload
 * @property {string} [title] - The new title for the note.
 * @property {string} [content] - The new content for the note.
 * @property {string[]} [tags] - The new array of tags for the note.
 */

module.exports = router;