import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import Support from './support.model.js';

/**
 * Creates a new support request and associates it with a user.
 *
 * @param {string} userId - The ID of the user initiating the support request.
 * @param {object} data - The data for the new support request.
 * @param {string} data.title - The title of the support request.
 * @param {string} data.description - The detailed description of the support request.
 * @param {string} [data.status='pending'] - The current status of the support request (e.g., 'pending', 'resolved').
 * @returns {Promise<object>} A promise that resolves to the created support request document.
 */
const reqForSupportService = async (userId, data) => {
  // Validate user existence before creating the support request to ensure data integrity.
  // This prevents creating a support request for a non-existent user and ensures the
  // subsequent update to the user's task array has a valid target.
  const user = await UserModel.findById(userId);
  if (!user) {
    // Throw a standard Error if the user is not found.
    // In a full application, a custom ApiError with a specific HTTP status might be preferred.
    throw new Error('User not found');
  }

  const result = await Support.create(data);

  // Associate the newly created support request with the user.
  // Using findByIdAndUpdate for consistency with the user check and direct ID lookup.
  await UserModel.findByIdAndUpdate(
    userId,
    { $push: { task: result._id } },
    { new: true } // Return the updated document (though not used here, it's good practice)
  );
  return result;
};

/**
 * Retrieves all support requests, limited to 200 documents.
 * Uses `.lean()` for performance optimization as documents are not modified or saved back.
 *
 * @returns {Promise<Array<object>>} A promise that resolves to an array of support request plain JavaScript objects.
 */
const getAllSupportService = async () => {
  // Optimization: Added .lean() for read operations where Mongoose documents are not modified or saved back.
  // This returns plain JavaScript objects, improving performance by skipping Mongoose's hydration overhead.
  const result = await Support.find({}).limit(200).lean();
  // logger.info(result, 'resulttttttt');
  return result;
};

/**
 * Retrieves a single support request by its ID.
 * Uses `.lean()` for performance optimization as the document is not modified or saved back.
 *
 * @param {string} id - The ID of the support request to retrieve.
 * @returns {Promise<object|null>} A promise that resolves to the support request plain JavaScript object, or null if not found.
 */
const getSupportServiceById = async (id) => {
  // Optimization: Added .lean() for read operations where Mongoose documents are not modified or saved back.
  // This returns plain JavaScript objects, improving performance by skipping Mongoose's hydration overhead.
  const result = await Support.findOne({ _id: id }).lean();
  return result;
};

/**
 * Updates an existing support request by its ID.
 *
 * @param {string} supportRequestId - The ID of the support request to update.
 * @param {object} data - The update data for the support request.
 * @param {string} [data.title] - The new title for the support request.
 * @param {string} [data.description] - The new description for the support request.
 * @param {string} [data.status] - The new status for the support request.
 * @returns {Promise<object>} A promise that resolves to the Mongoose update result object.
 */
const updateSupportReqService = async (supportRequestId, data) => {
  const result = await Support.updateOne(
    { _id: supportRequestId },
    { $set: data },
    { runValidators: true }
  );

  return result;
};

/**
 * Deletes a support request by its ID.
 *
 * @param {string} id - The ID of the support request to delete.
 * @returns {Promise<object>} A promise that resolves to the Mongoose delete result object.
 */
const deleteSupportReqService = async (id) => {
  const result = await Support.deleteOne({ _id: id });
  return result;
};

/**
 * Deletes multiple support requests by their IDs.
 *
 * @param {string[]} ids - An array of IDs of the support requests to delete.
 * @returns {Promise<object>} A promise that resolves to the Mongoose deleteMany result object.
 */
const bulkDeleteSupportReqService = async (ids) => {
  logger.info(ids, 'idssssssss');
  const result = await Support.deleteMany({ _id: { $in: ids } });

  logger.info(result);
  return result;
};

/**
 * @typedef {object} SupportService
 * @property {function(string, object): Promise<object>} reqForSupportService - Function to create a new support request.
 * @property {function(): Promise<Array<object>>} getAllSupportService - Function to retrieve all support requests.
 * @property {function(string): Promise<object|null>} getSupportServiceById - Function to retrieve a support request by ID.
 * @property {function(string, object): Promise<object>} updateSupportReqService - Function to update a support request by ID.
 * @property {function(string): Promise<object>} deleteSupportReqService - Function to delete a support request by ID.
 * @property {function(string[]): Promise<object>} bulkDeleteSupportReqService - Function to delete multiple support requests by IDs.
 */

/**
 * An object containing various service functions for managing support requests.
 * @type {SupportService}
 */
export const supportService = {
  reqForSupportService,
  getAllSupportService,
  getSupportServiceById,
  updateSupportReqService,
  deleteSupportReqService,
  bulkDeleteSupportReqService,
};