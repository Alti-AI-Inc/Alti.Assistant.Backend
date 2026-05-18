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
  const result = await Task.find({ userId: id }).populate({
    path: 'userId',
    select: '-password -wishlist -task -role -contract', // Exclude the 'password' field
  });
  // logger.info(result, 'resulttttttt');
  return result;
};

module.exports.getTaskServiceById = async (id) => {
  const result = await Task.findOne({ _id: id }).populate({
    path: 'userId',
    select: '-password -wishlist -task -role -contract', // Exclude the 'password' field
  });
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
