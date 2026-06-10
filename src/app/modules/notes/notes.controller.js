const httpStatus = require('http-status');
const {
  addTaskServices,
  getTaskServiceById,
  updateTaskService,
  deleteTaskService,
  getAllTaskServiceById,
  bulkDeleteTaskService,
} = require('./notes.service');
const { default: mongoose } = require('mongoose');
const { sendResponse } = require('../../../shared/sendResponse');
const { catchAsync } = require('../../../shared/catchAsync');
const { logger } = require('../../../shared/logger');

/**
 * @swagger
 * /api/v1/notes:
 *   post:
 *     summary: Add a new note
 *     description: Creates a new note/task for the authenticated user.
 *     tags:
 *       - Notes
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *             properties:
 *               title:
 *                 type: string
 *                 description: The title of the note.
 *                 example: "Meeting Agenda"
 *               description:
 *                 type: string
 *                 description: The detailed description of the note.
 *                 example: "Discuss Q3 results and next steps."
 *               dueDate:
 *                 type: string
 *                 format: date
 *                 description: Optional due date for the note/task.
 *                 example: "2024-12-31"
 *               status:
 *                 type: string
 *                 description: Optional status of the note (e.g., 'pending', 'completed').
 *                 example: "pending"
 *     responses:
 *       201:
 *         description: Note added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Add Note Successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "652a3a9a7b7b7b7b7b7b7b7b"
 *                     userId:
 *                       type: string
 *                       example: "652a3a9a7b7b7b7b7b7b7b7b"
 *                     title:
 *                       type: string
 *                       example: "Meeting Agenda"
 *                     description:
 *                       type: string
 *                       example: "Discuss Q3 results and next steps."
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request, e.g., validation error or missing required fields.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Validation Error"
 *       401:
 *         description: Unauthorized, if authentication token is missing or invalid.
 */
/**
 * @description Adds a new note/task to the database for the authenticated user.
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing the note data.
 * @param {string} req.user.id - The ID of the authenticated user creating the note.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
module.exports.addTask = catchAsync(async (req, res) => {
  // IDOR vulnerability fix: Ensure the userId comes from the authenticated user, not the request body.
  // Assuming req.user.id is populated by an authentication middleware.
  const userId = req.user.id;
  // Create a new data object, ensuring the userId is the authenticated user's ID.
  const data = { ...req.body, userId };

  // Pass userId explicitly to service for ownership check and creation.
  const result = await addTaskServices(userId, data);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Add Note Successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/notes/{userId}:
 *   get:
 *     summary: Get all notes for a user
 *     description: Fetches all notes associated with a given user ID, ensuring the requesting user is authorized.
 *     tags:
 *       - Notes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to retrieve notes for. Must match the authenticated user's ID.
 *         example: "652a3a9a7b7b7b7b7b7b7b7b"
 *     responses:
 *       200:
 *         description: Successfully retrieved all notes for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Successfully Get all notes"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "652a3a9a7b7b7b7b7b7b7b7b"
 *                       userId:
 *                         type: string
 *                         example: "652a3a9a7b7b7b7b7b7b7b7b"
 *                       title:
 *                         type: string
 *                         example: "Meeting Agenda"
 *                       description:
 *                         type: string
 *                         example: "Discuss Q3 results and next steps."
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized, if authentication token is missing or invalid.
 *       403:
 *         description: Forbidden, if the requested userId does not match the authenticated user's ID.
 *       404:
 *         description: User not found or no notes found for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No notes found for this user"
 */
/**
 * @description Retrieves all notes associated with a specific user ID, ensuring authorization.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The request parameters.
 * @param {string} req.params.userId - The ID of the user whose notes are to be retrieved.
 * @param {string} req.user.id - The ID of the authenticated user.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
module.exports.getAllTask = catchAsync(async (req, res) => {
  const requestedUserId = req.params.userId;
  const authenticatedUserId = req.user.id; // Assuming req.user.id is populated by auth middleware

  // IDOR vulnerability fix: Ensure the requested userId matches the authenticated user's ID.
  // A user should only be able to fetch their own notes.
  if (requestedUserId !== authenticatedUserId) {
    throw {
      statusCode: httpStatus.FORBIDDEN,
      message: 'Access Forbidden: You can only view your own notes.',
    };
  }

  logger.info(requestedUserId, 'all taskk userId');
  // Pass the authenticated userId to the service to filter notes by ownership.
  // Optimization Recommendation:
  // 1. For read operations that return multiple documents, consider adding `.lean()`
  //    to the Mongoose query in `getAllTaskServiceById` if Mongoose document methods
  //    are not needed. This returns plain JavaScript objects, improving performance.
  //    Example: `Note.find({ userId }).lean()` in the service.
  // 2. Ensure an index exists on the `userId` field in your Note model for faster lookups.
  //    Example: `noteSchema.index({ userId: 1 });` in your Note model definition.
  const result = await getAllTaskServiceById(authenticatedUserId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully Get all notes',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/notes/task/{id}:
 *   get:
 *     summary: Get a note by ID
 *     description: Fetches a single note using its unique identifier, ensuring it belongs to the authenticated user.
 *     tags:
 *       - Notes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the note to retrieve.
 *         example: "652a3a9a7b7b7b7b7b7b7b7b"
 *     responses:
 *       200:
 *         description: Successfully retrieved the note.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Get note by id successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "652a3a9a7b7b7b7b7b7b7b7b"
 *                     userId:
 *                       type: string
 *                       example: "652a3a9a7b7b7b7b7b7b7b7b"
 *                     title:
 *                       type: string
 *                       example: "Meeting Agenda"
 *                     description:
 *                       type: string
 *                       example: "Discuss Q3 results and next steps."
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized, if authentication token is missing or invalid.
 *       404:
 *         description: Note not found or not belonging to the authenticated user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Note not found"
 */
/**
 * @description Retrieves a single note by its unique ID, ensuring it belongs to the authenticated user.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The request parameters.
 * @param {string} req.params.id - The ID of the note to retrieve.
 * @param {string} req.user.id - The ID of the authenticated user.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
module.exports.getTaskById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // Assuming req.user.id is populated by auth middleware
  logger.info(id, 'taskk idddd');

  // IDOR vulnerability fix: Pass userId to the service to ensure ownership check.
  // The service should query for a note with both _id and userId.
  // Optimization Recommendation:
  // 1. For read operations that return a single document, consider adding `.lean()`
  //    to the Mongoose query in `getTaskServiceById` if Mongoose document methods
  //    are not needed. This returns a plain JavaScript object, improving performance.
  //    Example: `Note.findOne({ _id: id, userId }).lean()` in the service.
  // 2. Ensure an index exists on the `userId` field, or a compound index `(userId, _id)`
  //    in your Note model for faster lookups when filtering by both.
  //    Example: `noteSchema.index({ userId: 1, _id: 1 });` in your Note model definition.
  const result = await getTaskServiceById(id, userId);

  // If the service returns null, it means the note was not found or doesn't belong to the user.
  if (!result) {
    throw {
      statusCode: httpStatus.NOT_FOUND,
      message: 'Note not found or you do not have access to it.',
    };
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get note by id successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/notes/{id}:
 *   patch:
 *     summary: Update an existing note
 *     description: Updates the details of an existing note identified by its ID, ensuring it belongs to the authenticated user.
 *     tags:
 *       - Notes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the note to update.
 *         example: "652a3a9a7b7b7b7b7b7b7b7b"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: The updated title of the note.
 *                 example: "Updated Meeting Agenda"
 *               description:
 *                 type: string
 *                 description: The updated detailed description of the note.
 *                 example: "Review Q3 results and plan Q4 strategy."
 *               dueDate:
 *                 type: string
 *                 format: date
 *                 description: Updated due date for the note/task.
 *                 example: "2025-01-15"
 *               status:
 *                 type: string
 *                 description: Updated status of the note (e.g., 'completed').
 *                 example: "completed"
 *     responses:
 *       200:
 *         description: Note updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Note Update Successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "652a3a9a7b7b7b7b7b7b7b7b"
 *                     title:
 *                       type: string
 *                       example: "Updated Meeting Agenda"
 *                     description:
 *                       type: string
 *                       example: "Review Q3 results and plan Q4 strategy."
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request, e.g., validation error or invalid update data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid update data"
 *       401:
 *         description: Unauthorized, if authentication token is missing or invalid.
 *       404:
 *         description: Note not found or not belonging to the authenticated user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Note not found"
 */
/**
 * @description Updates an existing note identified by its ID, ensuring it belongs to the authenticated user.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The request parameters.
 * @param {string} req.params.id - The ID of the note to update.
 * @param {object} req.body - The request body containing the updated note data.
 * @param {string} req.user.id - The ID of the authenticated user.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
exports.updateTask = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // Assuming req.user.id is populated by auth middleware

  // IDOR vulnerability fix: Pass userId to the service to ensure ownership check.
  // The service should update only if the note matches both _id and userId.
  // Optimization Recommendation:
  // Ensure an index exists on the `userId` field, or a compound index `(userId, _id)`
  // in your Note model for faster lookups when filtering by both for update operations.
  // Example: `noteSchema.index({ userId: 1, _id: 1 });` in your Note model definition.
  const result = await updateTaskService(id, userId, req.body);

  // If the service returns null, it means the note was not found or doesn't belong to the user.
  if (!result) {
    throw {
      statusCode: httpStatus.NOT_FOUND,
      message: 'Note not found or you do not have access to update it.',
    };
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Note Update Successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/notes/{id}:
 *   delete:
 *     summary: Delete a note by ID
 *     description: Deletes a single note using its unique identifier, ensuring it belongs to the authenticated user.
 *     tags:
 *       - Notes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the note to delete.
 *         example: "652a3a9a7b7b7b7b7b7b7b7b"
 *     responses:
 *       200:
 *         description: Note deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Task Delete Successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: number
 *                       example: 1
 *       401:
 *         description: Unauthorized, if authentication token is missing or invalid.
 *       404:
 *         description: Note not found or not belonging to the authenticated user.
 */
/**
 * @description Deletes a single note by its unique ID, ensuring it belongs to the authenticated user.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The request parameters.
 * @param {string} req.params.id - The ID of the note to delete.
 * @param {string} req.user.id - The ID of the authenticated user.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
exports.deleteTask = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // Assuming req.user.id is populated by auth middleware

  // IDOR vulnerability fix: Pass userId to the service to ensure ownership check.
  // The service should delete only if the note matches both _id and userId.
  // Optimization Recommendation:
  // Ensure an index exists on the `userId` field, or a compound index `(userId, _id)`
  // in your Note model for faster lookups when filtering by both for delete operations.
  // Example: `noteSchema.index({ userId: 1, _id: 1 });` in your Note model definition.
  const result = await deleteTaskService(id, userId);

  // If result is null/undefined or deletedCount is 0, it means the note was not found
  // or doesn't belong to the user, or couldn't be deleted for other reasons.
  if (!result || result.deletedCount === 0) {
    throw {
      statusCode: httpStatus.NOT_FOUND,
      message: "Note not found or you do not have access to delete it.",
    };
  }

  // Changed status to OK (200) because 204 (No Content) should not have a response body.
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Task Delete Successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/notes/bulk-delete:
 *   delete:
 *     summary: Bulk delete notes
 *     description: Deletes multiple notes based on an array of provided IDs, ensuring all notes belong to the authenticated user.
 *     tags:
 *       - Notes
 *     security:
 *       - bearerAuth: []
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
 *                 example: ["652a3a9a7b7b7b7b7b7b7b7b", "652a3a9a7b7b7b7b7b7b7b7c"]
 *     responses:
 *       200:
 *         description: Notes deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "All Task Delete Successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: number
 *                       example: 2
 *       400:
 *         description: Bad request, e.g., invalid IDs provided.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid IDs provided"
 *       401:
 *         description: Unauthorized, if authentication token is missing or invalid.
 */
/**
 * @description Deletes multiple notes based on an array of provided IDs, ensuring they all belong to the authenticated user.
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing an array of note IDs.
 * @param {string[]} req.body.ids - An array of note IDs to be deleted.
 * @param {string} req.user.id - The ID of the authenticated user.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {Error} If invalid IDs are provided.
 */
exports.bulkDeleteTask = catchAsync(async (req, res) => {
  const ids = req.body?.ids || [];
  const userId = req.user.id; // Assuming req.user.id is populated by auth middleware
  logger.info(ids, 'controller idddddddddddd');

  // Validate IDs: Ensure 'ids' is an array, not empty, and all elements are valid MongoDB ObjectIDs.
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => mongoose.Types.ObjectId.isValid(id))) {
    throw { statusCode: httpStatus.BAD_REQUEST, message: 'Invalid or empty array of IDs provided' };
  }

  // IDOR vulnerability fix: Pass userId to the service.
  // The service must ensure that only notes belonging to this userId are deleted from the provided 'ids' array.
  // Optimization Recommendation:
  // For bulk delete operations filtering by `userId` and an array of `_id`s, a compound index
  // on `(userId, _id)` in your Note model will significantly improve performance.
  // Example: `noteSchema.index({ userId: 1, _id: 1 });` in your Note model definition.
  const result = await bulkDeleteTaskService(ids, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All Task Delete Successfully ',
    data: result,
  });
});