import mongoose from 'mongoose';
import UserModel from '../auth/auth.model.js';
import Notification from './notification.model.js';
import { logger } from '../../../shared/logger.js';
import { withTenantContext, withTenantFilter } from '../../helpers/tenantQuery.js';

const sendNotificationService = async (data, req = null) => {
  // 1. Create the Notification first
  const newNotification = await Notification.create(
    req ? withTenantContext(req, data) : data
  );

  // 2. Push this notification to every user in the same tenant
  const userFilter = req ? withTenantFilter(req, {}) : {};
  await UserModel.updateMany(
    userFilter, // filter users by tenant
    { $push: { notifications: newNotification._id } }, // 👈 push notification id into notifications array
  );

  return newNotification;
};

const getNotificationService = async (userId, req = null) => {
  const query = {};
  const result = await Notification.find(
    req ? withTenantFilter(req, query) : query
  );
  return result;
};

const sendNotificationByIdService = async (userId, data, req = null) => {
  const newNotification = await Notification.create(
    req ? withTenantContext(req, data) : data
  );
  // 2. Push this notification to specific user
  const userQuery = { _id: userId };
  await UserModel.updateOne(
    req ? withTenantFilter(req, userQuery) : userQuery,
    { $push: { notifications: newNotification._id } },
  );
  return newNotification;
};

const getNotificationByIdService = async (userId, req = null) => {
  const query = { _id: userId };
  const result = await UserModel.findOne(
    req ? withTenantFilter(req, query) : query
  )
    .populate('notifications')
    .select('notifications');
  return result;
};

const updateNotificationByIdService = async (notificationId, data, req = null) => {
  const query = { _id: notificationId };
  const result = await Notification.updateOne(
    req ? withTenantFilter(req, query) : query, // filter condition
    { $set: data }, // update operation
    { new: true }, // Return the updated document
  );

  if (!result) {
    throw new Error('Notification not found or no changes made');
  }
  return result;
};

const deleteNotificationByIdService = async (notificationId, req = null) => {
  const query = { _id: notificationId };
  const result = await Notification.deleteOne(
    req ? withTenantFilter(req, query) : query
  );
  return result;
};
const deleteAllNotificationService = async (req = null) => {
  const session = await mongoose.startSession();

  try {
    // Start a transaction
    session.startTransaction();

    // Step 1: Delete all notifications from the Notification collection (tenant-filtered)
    const notificationQuery = req ? withTenantFilter(req, {}) : {};
    await Notification.deleteMany(notificationQuery, { session });

    // Step 2: Remove all references to notifications from the User collection (tenant-filtered)
    const userQuery = req ? withTenantFilter(req, {}) : {};
    await UserModel.updateMany(
      userQuery,
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
