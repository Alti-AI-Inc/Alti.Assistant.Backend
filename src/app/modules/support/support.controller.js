import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { supportService } from './support.service.js';
import { logger } from '../../../shared/logger.js';
import mongoose from 'mongoose'; // Optimization: Imported mongoose for ObjectId validation in bulkDeleteSupportReq.

/**
 * @typedef {object} SupportRequestPayload
 * @property {string} id - The ID of the user making the request.
 * @property {string} subject - The subject of the support request.
 * @property {string} description - The detailed description of the support issue.
 * @property {string} [priority] - The priority level of the request (e.g., 'low', 'medium', 'high').
 * @property {string} [status] - The current status of the request (e.g., 'open', 'pending', 'closed').
 */

/**
 * @typedef {object} SupportRequestResponse
 * @property {string} _id - The unique identifier of the support request.
 * @property {string} userId - The ID of the user who created the request.
 * @property {string} subject - The subject of the support request.
 * @property {string} description - The detailed description of the support issue.
 * @property {string} priority - The priority level of the request.
 * @property {string} status - The current status of the request.
 * @property {string} createdAt - The timestamp when the request was created.
 * @property {string} updatedAt - The timestamp when the request was last updated.
 */

/**
 * @swagger
 * /api/v1/support:
 *   post:
 *     summary: Create a new support request
 *     description: Allows a user to submit a new support request with details like subject and description.
 *     tags:
 *       - Support
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - subject
 *               - description
 *             properties:
 *               id:
 *                 type: string
 *                 description: The ID of the user making the request.
 *                 example: "60d0fe4f5311236168a109ca"
 *               subject:
 *                 type: string
 *                 description: The subject of the support request.
 *                 example: "Issue with login"
 *               description:
 *                 type: string
 *                 description: The detailed description of the support issue.
 *                 example: "I cannot log in to my account after changing my password."
 *               priority:
 *                 type: string
 *                 description: The priority level of the request.
 *                 enum: [low, medium, high]
 *                 example: "medium"
 *     responses:
 *       201:
 *         description: Support Request Add Successfully
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
 *                   example: "Support Req Add Successfully"
 *                 data:
 *                   $ref: '#/components/schemas/SupportRequestResponse'
 *       400:
 *         description: Bad Request - Invalid input data.
 *       500:
 *         description: Internal Server Error
 */
/**
 * Handles the creation of a new support request.
 * Extracts user ID and request data from the request body and passes it to the support service.
 *
 * @function
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {Error} If an error occurs during the support request creation process.
 */
const reqForSupport = catchAsync(async (req, res) => {
  // Security Fix: Ensure the support request is created for the authenticated user.
  // The 'id' in req.body should be ignored or validated against the authenticated user's ID
  // to prevent IDOR (Insecure Direct Object Reference).
  // This assumes 'req.user' is populated by an authentication middleware.
  const authenticatedUserId = req.user?.id;

  if (!authenticatedUserId) {
    // This scenario indicates a missing authentication middleware or an unauthenticated route.
    // For a security-critical operation like creating a support request,
    // an authenticated user is typically required.
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Authentication required to create a support request.',
    });
  }

  // Security Fix: Extract allowed fields from req.body to prevent mass assignment vulnerabilities.
  // The userId is explicitly set from the authenticated user, overriding any 'id' from req.body.
  const { subject, description, priority, status } = req.body;
  const supportRequestData = {
    userId: authenticatedUserId, // Use authenticated user's ID
    subject,
    description,
    priority,
    status,
  };

  // Filter out undefined values if they are not meant to be stored or if the schema handles defaults.
  Object.keys(supportRequestData).forEach(key => supportRequestData[key] === undefined && delete supportRequestData[key]);

  // The service function expects userId and data.
  // We pass the authenticatedUserId and the constructed supportRequestData.
  const result = await supportService.reqForSupportService(authenticatedUserId, supportRequestData);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Support Req Add Successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/support:
 *   get:
 *     summary: Retrieve all support requests
 *     description: Fetches a list of all support requests available in the system.
 *     tags:
 *       - Support
 *     responses:
 *       200:
 *         description: Successfully Get all Support Requests
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
 *                   example: "Successfully Get all Support Requests"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SupportRequestResponse'
 *       500:
 *         description: Internal Server Error
 */
/**
 * Handles the retrieval of all support requests.
 * Calls the support service to get all requests and sends them as a response.
 *
 * @function
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {Error} If an error occurs during the retrieval of support requests.
 */
const getAllSupportReq = catchAsync(async (req, res) => {
  // Optimization Recommendation:
  // For read operations like this, consider adding `.lean()` to the Mongoose query
  // in `supportService.getAllSupportService()` if the returned documents are
  // only used for sending as JSON and no Mongoose document methods are needed.
  // This can improve performance by returning plain JavaScript objects instead of Mongoose documents.
  const result = await supportService.getAllSupportService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully Get all Support Requests',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/support/{id}:
 *   get:
 *     summary: Retrieve a single support request by ID
 *     description: Fetches a specific support request using its unique identifier.
 *     tags:
 *       - Support
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Unique ID of the support request to retrieve.
 *         schema:
 *           type: string
 *           example: "60d0fe4f5311236168a109cb"
 *     responses:
 *       200:
 *         description: Get Support Reqest by id successfully
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
 *                   example: "Get Support Reqest by id successfully"
 *                 data:
 *                   $ref: '#/components/schemas/SupportRequestResponse'
 *       404:
 *         description: Support request not found.
 *       500:
 *         description: Internal Server Error
 */
/**
 * Handles the retrieval of a single support request by its ID.
 * Extracts the ID from request parameters and calls the support service.
 *
 * @function
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {Error} If an error occurs or the support request is not found.
 */
const getSupportById = catchAsync(async (req, res) => {
  const id = req.params?.id;
  logger.info(id, 'idddddddd');
  // Security Note: The supportService.getSupportServiceById(id) function
  // should implement authorization checks (e.g., ensure the authenticated user
  // owns this support request or has appropriate administrative privileges)
  // to prevent IDOR (Insecure Direct Object Reference).

  // Optimization Recommendation:
  // For read operations like this, consider adding `.lean()` to the Mongoose query
  // in `supportService.getSupportServiceById(id)` if the returned document is
  // only used for sending as JSON and no Mongoose document methods are needed.
  // This can improve performance by returning a plain JavaScript object instead of a Mongoose document.
  const result = await supportService.getSupportServiceById(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Support Reqest by id successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/support/{id}:
 *   patch:
 *     summary: Update an existing support request
 *     description: Modifies the details of an existing support request identified by its ID.
 *     tags:
 *       - Support
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Unique ID of the support request to update.
 *         schema:
 *           type: string
 *           example: "60d0fe4f5311236168a109cb"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               subject:
 *                 type: string
 *                 description: The updated subject of the support request.
 *                 example: "Resolved login issue"
 *               description:
 *                 type: string
 *                 description: The updated detailed description of the support issue.
 *                 example: "Login issue was resolved after password reset."
 *               status:
 *                 type: string
 *                 description: The updated status of the request.
 *                 enum: [open, pending, closed]
 *                 example: "closed"
 *     responses:
 *       200:
 *         description: Support Request Update Successfully
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
 *                   example: "Support Request Update Successfully"
 *                 data:
 *                   $ref: '#/components/schemas/SupportRequestResponse'
 *       400:
 *         description: Bad Request - Invalid input data.
 *       404:
 *         description: Support request not found.
 *       500:
 *         description: Internal Server Error
 */
/**
 * Handles the update of an existing support request.
 * Extracts the ID from request parameters and update data from the request body,
 * then calls the support service to perform the update.
 *
 * @function
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {Error} If an error occurs or the support request is not found.
 */
const updateSupportReq = catchAsync(async (req, res) => {
  const { id } = req.params;
  // Security Fix: Filter allowed fields from req.body to prevent mass assignment vulnerabilities.
  // Only fields explicitly listed here can be updated by the client.
  const { subject, description, priority, status } = req.body;
  const updateData = { subject, description, priority, status };

  // Remove undefined values from updateData to avoid setting fields to undefined
  Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

  // Security Note: The supportService.updateSupportReqService(id, updateData) function
  // should implement authorization checks (e.g., ensure the authenticated user
  // owns this support request or has appropriate administrative privileges)
  // to prevent IDOR (Insecure Direct Object Reference).
  const result = await supportService.updateSupportReqService(id, updateData);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Support Request Update Successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/support/{id}:
 *   delete:
 *     summary: Delete a support request
 *     description: Removes a specific support request from the system using its unique identifier.
 *     tags:
 *       - Support
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Unique ID of the support request to delete.
 *         schema:
 *           type: string
 *           example: "60d0fe4f5311236168a109cb"
 *     responses:
 *       200:
 *         description: Support Request Delete Successfully
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
 *                   example: "Support Request Delete Successfully"
 *                 data:
 *                   $ref: '#/components/schemas/SupportRequestResponse'
 *       404:
 *         description: Support request not found.
 *       500:
 *         description: Internal Server Error
 */
/**
 * Handles the deletion of a single support request.
 * Extracts the ID from request parameters and calls the support service to delete the request.
 *
 * @function
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {Error} If an error occurs or the support request is not found.
 */
const deleteSupportReq = catchAsync(async (req, res) => {
  const { id } = req.params;
  // Security Note: The supportService.deleteSupportReqService(id) function
  // should implement authorization checks (e.g., ensure the authenticated user
  // owns this support request or has appropriate administrative privileges)
  // to prevent IDOR (Insecure Direct Object Reference).
  const result = await supportService.deleteSupportReqService(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Support Request Delete Successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/support/bulk-delete:
 *   delete:
 *     summary: Delete multiple support requests
 *     description: Deletes multiple support requests based on a list of provided IDs.
 *     tags:
 *       - Support
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
 *                   format: uuid
 *                 description: An array of unique IDs of the support requests to delete.
 *                 example: ["60d0fe4f5311236168a109cb", "60d0fe4f5311236168a109cc"]
 *     responses:
 *       200:
 *         description: All Support Request Delete Successfully
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
 *                   example: "All Support Request Delete Successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: number
 *                       description: The number of support requests successfully deleted.
 *                       example: 2
 *       400:
 *         description: Bad Request - Invalid IDs provided.
 *       500:
 *         description: Internal Server Error
 */
/**
 * Handles the bulk deletion of multiple support requests.
 * Extracts an array of IDs from the request body, validates them, and calls the support service
 * to perform the bulk deletion.
 *
 * @function
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {Error} If invalid IDs are provided or an error occurs during deletion.
 */
const bulkDeleteSupportReq = catchAsync(async (req, res) => {
  const ids = req.body?.ids;
  // logger.info(ids, 'controller idddddddddddd'); // Consider removing or setting to debug level in production

  // Bug Fix: Ensure 'ids' is an array and not empty.
  if (!Array.isArray(ids) || ids.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'An array of IDs is required for bulk deletion.',
    });
  }

  // Validate IDs using Mongoose's ObjectId validator.
  // Security Fix: Ensure all provided IDs are valid MongoDB ObjectIds.
  // Security Note: The supportService.bulkDeleteSupportReqService(ids) function
  // must implement authorization checks to prevent IDOR (e.g., only allow deletion
  // of requests owned by the authenticated user or by an admin).
  if (mongoose.Types && typeof mongoose.Types.ObjectId.isValid === 'function') {
    if (!ids.every((id) => mongoose.Types.ObjectId.isValid(id))) {
      // Bug Fix: Use a proper HTTP status for invalid input.
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'One or more provided IDs are invalid.',
      });
    }
  } else {
    // Fallback or alternative validation if mongoose is not available or not configured
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!ids.every((id) => typeof id === 'string' && objectIdRegex.test(id))) {
      // Bug Fix: Use a proper HTTP status for invalid input.
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'One or more provided IDs are invalid (format mismatch).',
      });
    }
  }

  const result = await supportService.bulkDeleteSupportReqService(ids);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All Support Request Delete Successfully ',
    data: result,
  });
});

/**
 * @constant
 * @description An object containing all controller functions for managing support requests.
 * These functions handle incoming HTTP requests, interact with the support service,
 * and send appropriate responses.
 * @type {object}
 * @property {function(import('express').Request, import('express').Response): Promise<void>} reqForSupport - Handles creating a new support request.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getAllSupportReq - Handles retrieving all support requests.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getSupportById - Handles retrieving a single support request by ID.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} updateSupportReq - Handles updating an existing support request.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} deleteSupportReq - Handles deleting a single support request.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} bulkDeleteSupportReq - Handles bulk deletion of multiple support requests.
 */
export const SupportController = {
  reqForSupport,
  getAllSupportReq,
  getSupportById,
  updateSupportReq,
  deleteSupportReq,
  bulkDeleteSupportReq,
};