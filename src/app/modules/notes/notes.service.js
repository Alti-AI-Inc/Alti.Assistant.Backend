const { logger } = require('../../../shared/logger');
const UserModel = require('../auth/auth.model');
const Task = require('./notes.model');

module.exports.addTaskServices = async (userId, data) => {
  // Security: Explicitly assign userId to the task data to ensure correct ownership
  // and prevent potential IDOR or malicious userId assignment if 'data' contains it.
  const taskData = {
    ...data,
    userId: userId,
  };
  const result = await Task.create(taskData);

  // Push the new task's ID to the user's task array
  await UserModel.findOneAndUpdate(
    { _id: userId },
    { $push: { task: result._id } },
    { new: true }
  );
  return result;
};

module.exports.getAllTaskServiceById = async (id) => {
  // Optimization: Added .lean() for read-only operations to reduce Mongoose document overhead.
  // Recommendation: Consider adding an index to the 'userId' field in the Task model for better query performance.
  // Example: In notes.model.js, for the userId field, add `index: true` (e.g., `userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }`).
  // Assuming 'id' here is the authenticated user's ID, passed from a secure context (e.g., req.user.id).
  const result = await Task.find({ userId: id })
    .populate({
      path: 'userId',
      select: '-password -wishlist -task -role -contract', // Exclude unnecessary fields
    })
    .lean(); // Added .lean() for performance
  return result;
};

module.exports.getTaskServiceById = async (taskId, userId) => { // Added userId parameter
  // Optimization: Added .lean() for read-only operations to reduce Mongoose document overhead.
  // Security: Added userId to the query to prevent IDOR (Insecure Direct Object Reference).
  // Ensures that a user can only retrieve tasks that belong to them.
  const result = await Task.findOne({ _id: taskId, userId: userId }) // Added userId to query
    .populate({
      path: 'userId',
      select: '-password -wishlist -task -role -contract', // Exclude unnecessary fields
    })
    .lean(); // Added .lean() for performance
  return result;
};

module.exports.updateTaskService = async (taskId, userId, data) => { // Renamed storeId to taskId, added userId parameter
  // Security: Added userId to the query to prevent IDOR (Insecure Direct Object Reference).
  // Ensures that a user can only update tasks that belong to them.
  // Security: Sanitize data to prevent mass assignment vulnerabilities.
  // Only allow specific fields to be updated. Adjust 'allowedUpdates' based on your Task model schema.
  const allowedUpdates = ['title', 'description', 'dueDate', 'status', 'priority', 'notes']; // Example allowed fields
  const updates = {};
  for (const key of allowedUpdates) {
    if (data[key] !== undefined) {
      updates[key] = data[key];
    }
  }

  // If no allowed updates are provided, return a result indicating no changes.
  if (Object.keys(updates).length === 0) {
    return { acknowledged: true, modifiedCount: 0, matchedCount: 0 };
  }

  const result = await Task.updateOne(
    { _id: taskId, userId: userId }, // Added userId to query
    { $set: updates }, // Use sanitized updates
    { runValidators: true }
  );

  return result;
};

exports.deleteTaskService = async (taskId, userId) => { // Renamed id to taskId, added userId parameter
  // Security: Added userId to the query to prevent IDOR (Insecure Direct Object Reference).
  // Ensures that a user can only delete tasks that belong to them.
  const result = await Task.deleteOne({ _id: taskId, userId: userId }); // Added userId to query
  return result;
};

exports.bulkDeleteTaskService = async (ids, userId) => { // Added userId parameter
  logger.info(ids, 'idssssssss');
  // Security: Added userId to the query to prevent IDOR (Insecure Direct Object Reference).
  // Ensures that a user can only bulk delete tasks that belong to them.
  const result = await Task.deleteMany({ _id: { $in: ids }, userId: userId }); // Added userId to query

  logger.info(result);
  return result;
};