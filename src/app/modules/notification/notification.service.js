import mongoose from 'mongoose';
import UserModel from '../auth/auth.model.js';
import Notification from './notification.model.js';
import { logger } from '../../../shared/logger.js';

const sendNotificationService = async data => {
  // 1. Create the Notification first
  const newNotification = await Notification.create(data);

  // 2. Push this notification to every user
  await UserModel.updateMany(
    {}, // empty filter => all users
    { $push: { notifications: newNotification._id } }, // 👈 push notification id into notifications array
  );

  return newNotification;
};

const getNotificationService = async userId => {
  const result = await Notification.find();
  return result;
};

const sendNotificationByIdService = async (userId, data) => {
  const newNotification = await Notification.create(data);
  // 2. Push this notification to specific user
  await UserModel.updateOne(
    { _id: userId },
    { $push: { notifications: newNotification._id } },
  );
  return newNotification;
};

const getNotificationByIdService = async userId => {
  const result = await UserModel.findOne({ _id: userId })
    .populate('notifications')
    .select('notifications');
  return result;
};

const updateNotificationByIdService = async (notificationId, data) => {
  const result = await Notification.updateOne(
    { _id: notificationId }, // filter condition
    { $set: data }, // update operation
    { new: true }, // Return the updated document
  );

  if (!result) {
    throw new Error('Notification not found or no changes made');
  }
  return result;
};

const deleteNotificationByIdService = async notificationId => {
  const result = await Notification.deleteOne({ _id: notificationId });
  return result;
};
const deleteAllNotificationService = async () => {
  const session = await mongoose.startSession();

  try {
    // Start a transaction
    session.startTransaction();

    // Step 1: Delete all notifications from the Notification collection
    await Notification.deleteMany({}, { session });

    // Step 2: Remove all references to notifications from the User collection
    await UserModel.updateMany(
      {},
      { $set: { notifications: [] } },
      { session },
    );

    // Commit the transaction if everything goes fine
    await session.commitTransaction();

    logger.info('All notifications deleted successfully.');
  } catch (error) {
    // If any error occurs, abort the transaction to roll back all changes
    await session.abortTransaction();

    console.error('Error occurred during the transaction:', error);
  } finally {
    // End the session
    session.endSession();
  }
};
export const NotificationService = {
  sendNotificationService,
  getNotificationService,
  sendNotificationByIdService,
  getNotificationByIdService,
  updateNotificationByIdService,
  deleteNotificationByIdService,
  deleteAllNotificationService,
};
