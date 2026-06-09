const { logger } = require('../../../shared/logger');
const UserModel = require('../auth/auth.model');
const Task = require('./notes.model');

module.exports.addTaskServices = async (userId, data) => {
  const result = await Task.create(data);

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
  const result = await Task.find({ userId: id })
    .populate({
      path: 'userId',
      select: '-password -wishlist -task -role -contract', // Exclude unnecessary fields
    })
    .lean(); // Added .lean() for performance
  // logger.info(result, 'resulttttttt');
  return result;
};

module.exports.getTaskServiceById = async (id) => {
  // Optimization: Added .lean() for read-only operations to reduce Mongoose document overhead.
  const result = await Task.findOne({ _id: id })
    .populate({
      path: 'userId',
      select: '-password -wishlist -task -role -contract', // Exclude unnecessary fields
    })
    .lean(); // Added .lean() for performance
  // logger.info(result, 'resulttttttt');
  return result;
};

module.exports.updateTaskService = async (storeId, data) => {
  const result = await Task.updateOne(
    { _id: storeId },
    { $set: data },
    { runValidators: true }
  );

  return result;
};

exports.deleteTaskService = async (id) => {
  const result = await Task.deleteOne({ _id: id });
  return result;
};

exports.bulkDeleteTaskService = async (ids) => {
  logger.info(ids, 'idssssssss');
  const result = await Task.deleteMany({ _id: { $in: ids } });

  logger.info(result);
  return result;
};