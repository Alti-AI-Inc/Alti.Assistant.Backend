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
 *     description: Creates a new note/task for a specific user.
 *     tags:
 *       - Notes
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - title
 *               - description
 *             properties:
 *               userId:
 *                 type: string
 *                 description: The ID of the user creating the note.
 *                 example: "652a3a9a7b7b7b7b7b7b7b7b"
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
 */
/**
 * @description Adds a new note/task to the database.
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing the note data and userId.
 * @param {string} req.body.userId - The ID of the user creating the note.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
module.exports.addTask = catchAsync(async (req, res) => {
  // logger.info(req.body, "blog dataaaa");
  const data = req.body;
  const userId = req.body.userId;
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
 *     description: Fetches all notes associated with a given user ID.
 *     tags:
 *       - Notes
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to retrieve notes for.
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
 * @description Retrieves all notes associated with a specific user ID.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The request parameters.
 * @param {string} req.params.userId - The ID of the user whose notes are to be retrieved.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
module.exports.getAllTask = catchAsync(async (req, res) => {
  const userId = req.params.userId;
  logger.info(userId, 'all taskk userId');
  const result = await getAllTaskServiceById(userId);

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
 *     description: Fetches a single note using its unique identifier.
 *     tags:
 *       - Notes
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
 *       404:
 *         description: Note not found.
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
 * @description Retrieves a single note by its unique ID.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The request parameters.
 * @param {string} req.params.id - The ID of the note to retrieve.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
module.exports.getTaskById = catchAsync(async (req, res) => {
  const { id } = req.params;
  logger.info(id, 'taskk idddd');

  const result = await getTaskServiceById(id);

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
 *     description: Updates the details of an existing note identified by its ID.
 *     tags:
 *       - Notes
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
 *       404:
 *         description: Note not found.
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
 * @description Updates an existing note identified by its ID.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The request parameters.
 * @param {string} req.params.id - The ID of the note to update.
 * @param {object} req.body - The request body containing the updated note data.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
exports.updateTask = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await updateTaskService(id, req.body);

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
 *     description: Deletes a single note using its unique identifier.
 *     tags:
 *       - Notes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the note to delete.
 *         example: "652a3a9a7b7b7b7b7b7b7b7b"
 *     responses:
 *       204:
 *         description: Note deleted successfully (No Content).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 204
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
 *       400:
 *         description: Could not delete the note, e.g., ID not found or other error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "fail"
 *                 error:
 *                   type: string
 *                   example: "Could't delete the note"
 */
/**
 * @description Deletes a single note by its unique ID.
 * @param {object} req - The Express request object.
 * @param {object} req.params - The request parameters.
 * @param {string} req.params.id - The ID of the note to delete.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
exports.deleteTask = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await deleteTaskService(id);

  if (!result.deletedCount) {
    return res.status(400).json({
      status: 'fail',
      error: "Could't delete the note",
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.NO_CONTENT,
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
 *     description: Deletes multiple notes based on an array of provided IDs.
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
 */
/**
 * @description Deletes multiple notes based on an array of provided IDs.
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing an array of note IDs.
 * @param {string[]} req.body.ids - An array of note IDs to be deleted.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {Error} If invalid IDs are provided.
 */
exports.bulkDeleteTask = catchAsync(async (req, res) => {
  const ids = req.body?.ids || [];
  logger.info(ids, 'controller idddddddddddd');

  // Validate IDs
  if (!ids.every((id) => mongoose.Types.ObjectId.isValid(id))) {
    throw { message: 'Invalid IDs provided' };
  }

  const result = await bulkDeleteTaskService(ids);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All Task Delete Successfully ',
    data: result,
  });
});