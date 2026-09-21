import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import Task from './notes.model.js';

/**
 * Adds a new task for a specific user.
 * @param {string} userId - The ID of the user creating the task.
 * @param {Object} data - The task data to be created.
 * @returns {Promise<Object>} The newly created task document.
 */
export const addTaskServices = async (userId, data) => {
  const taskData = {
    ...data,
    userId: userId,
  };
  const result = await Task.create(taskData);
  return result;
};

/**
 * Retrieves all tasks belonging to a specific user.
 * @param {string} id - The ID of the user whose tasks are being retrieved.
 * @returns {Promise<Array<Object>>} An array of task documents.
 */
export const getAllTaskServiceById = async (id) => {
  const result = await Task.find({ userId: id })
    .populate({
      path: 'userId',
      select: '-password -wishlist -task -role -contract',
    })
    .lean();
  return result;
};

/**
 * Retrieves a specific task by its ID.
 * @param {string} taskId - The ID of the task to retrieve.
 * @param {string} userId - The ID of the user requesting the task.
 * @returns {Promise<Object|null>}
 */
export const getTaskServiceById = async (taskId, userId) => {
  const result = await Task.findOne({ _id: taskId, userId: userId })
    .populate({
      path: 'userId',
      select: '-password -wishlist -task -role -contract',
    })
    .lean();
  return result;
};

/**
 * Updates a specific task by its ID.
 * @param {string} taskId - The ID of the task to update.
 * @param {string} userId - The ID of the user requesting the update.
 * @param {Object} data - The update payload.
 * @returns {Promise<Object>}
 */
export const updateTaskService = async (taskId, userId, data) => {
  const allowedUpdates = ['title', 'description', 'dueDate', 'status', 'priority', 'notes'];
  const updates = {};
  for (const key of allowedUpdates) {
    if (data[key] !== undefined) {
      updates[key] = data[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return { acknowledged: true, modifiedCount: 0, matchedCount: 0 };
  }

  const result = await Task.updateOne(
    { _id: taskId, userId: userId },
    { $set: updates },
    { runValidators: true }
  );

  return result;
};

/**
 * Deletes a specific task by its ID.
 * @param {string} taskId - The ID of the task to delete.
 * @param {string} userId - The ID of the user requesting deletion.
 * @returns {Promise<Object>}
 */
export const deleteTaskService = async (taskId, userId) => {
  const result = await Task.deleteOne({ _id: taskId, userId: userId });
  return result;
};

/**
 * Deletes multiple tasks by their IDs.
 * @param {Array<string>} ids - An array of task IDs to delete.
 * @param {string} userId - The ID of the user requesting deletion.
 * @returns {Promise<Object>}
 */
export const bulkDeleteTaskService = async (ids, userId) => {
  logger.info(ids, 'idssssssss');
  const result = await Task.deleteMany({ _id: { $in: ids }, userId: userId });
  logger.info(result);
  return result;
};

export default {
  addTaskServices,
  getAllTaskServiceById,
  getTaskServiceById,
  updateTaskService,
  deleteTaskService,
  bulkDeleteTaskService,
};