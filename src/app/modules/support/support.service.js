import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import Support from './support.model.js';

const reqForSupportService = async (userId, data) => {
  // const user = await UserModel.findOne({ _id: new mongoose.Types.ObjectId(userId) });
  // logger.info(user, 'userrr');
  // if (!user) {
  //   throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  // }

  const result = await Support.create(data);

  await UserModel.findOneAndUpdate(
    { _id: userId },
    { $push: { task: result._id } },
    { new: true }
  );
  return result;
};

const getAllSupportService = async () => {
  // Optimization: Added .lean() for read operations where Mongoose documents are not modified or saved back.
  // This returns plain JavaScript objects, improving performance by skipping Mongoose's hydration overhead.
  const result = await Support.find({}).limit(200).lean();
  // logger.info(result, 'resulttttttt');
  return result;
};

const getSupportServiceById = async (id) => {
  // Optimization: Added .lean() for read operations where Mongoose documents are not modified or saved back.
  // This returns plain JavaScript objects, improving performance by skipping Mongoose's hydration overhead.
  const result = await Support.findOne({ _id: id }).lean();
  return result;
};

const updateSupportReqService = async (storeId, data) => {
  const result = await Support.updateOne(
    { _id: storeId },
    { $set: data },
    { runValidators: true }
  );

  return result;
};

const deleteSupportReqService = async (id) => {
  const result = await Support.deleteOne({ _id: id });
  return result;
};

const bulkDeleteSupportReqService = async (ids) => {
  logger.info(ids, 'idssssssss');
  const result = await Support.deleteMany({ _id: { $in: ids } });

  logger.info(result);
  return result;
};

export const supportService = {
  reqForSupportService,
  getAllSupportService,
  getSupportServiceById,
  updateSupportReqService,
  deleteSupportReqService,
  bulkDeleteSupportReqService,
};