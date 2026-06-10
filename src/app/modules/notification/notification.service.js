import mongoose from 'mongoose';
import UserModel from '../auth/auth.model.js';
import Notification from './notification.model.js';
import { logger } from '../../../shared/logger.js';
import {
  withTenantContext,
  withTenantFilter,
} from '../../helpers/tenantQuery.js';

const sendNotificationService = async (data, req = null) => {
  // 1. Create the Notification first
  const newNotification = await Notification.create(
    req ? withTenantContext(req, data) : data
  );

  // 2. Push this notification to every user in the same tenant
  // Optimization Recommendation: Ensure 'tenantId' is indexed on UserModel if 'withTenantFilter' uses it.
  const userFilter = req ? withTenantFilter(req, {}) : {};
  await UserModel.updateMany(
    userFilter, // filter users by tenant
    { $push: { notifications: newNotification._id } } // 👈 push notification id into notifications array
  );

  return newNotification;
};

const getNotificationService = async (req = null) => { // Removed unused userId parameter
  const query = {};
  // Optimization: Added .lean() for read-only query to return plain JavaScript objects, improving performance.
  // Optimization Recommendation: Ensure 'tenantId' is indexed on Notification model if 'withTenantFilter' uses it.
  const result = await Notification.find(
    req ? withTenantFilter(req, query) : query
  ).lean(); // Added .lean()
  return result;
};

const sendNotificationByIdService = async (userId, data, req = null) => {
  // Bug Fix: Add recipientId to the notification data for direct querying later.
  // This assumes the Notification model has a 'recipientId' field.
  const notificationData = { ...data, recipientId: userId };
  const newNotification = await Notification.create(
    req ? withTenantContext(req, notificationData) : notificationData
  );
  // 2. Push this notification to specific user
  // Optimization Recommendation: Ensure 'tenantId' is indexed on UserModel if 'withTenantFilter' uses it.
  const userQuery = { _id: userId };
  await UserModel.updateOne(
    req ? withTenantFilter(req, userQuery) : userQuery,
    { $push: { notifications: newNotification._id } }
  );
  return newNotification;
};

const getNotificationByIdService = async (notificationId, req = null) => {
  // Bug Fix: This function was incorrectly querying UserModel by userId and populating notifications.
  // It should query the Notification model by notificationId, consistent with its name.
  const query = { _id: notificationId };
  // Optimization: Added .lean() for read-only query to return plain JavaScript objects, improving performance.
  // Optimization Recommendation: Ensure 'tenantId' is indexed on Notification model if 'withTenantFilter' uses it.
  const result = await Notification.findOne(
    req ? withTenantFilter(req, query) : query
  ).lean();
  return result;
};

const updateNotificationByIdService = async (
  notificationId,
  data,
  req = null
) => {
  const query = { _id: notificationId };
  // Optimization Recommendation: Ensure 'tenantId' is indexed on Notification model if 'withTenantFilter' uses it.
  // Bug Fix: Changed updateOne to findOneAndUpdate. updateOne does not return the updated document
  // and does not accept the 'new: true' option. findOneAndUpdate does.
  const result = await Notification.findOneAndUpdate(
    req ? withTenantFilter(req, query) : query, // filter condition
    { $set: data }, // update operation
    { new: true, runValidators: true } // Return the updated document, run schema validators
  ).lean(); // Added .lean() for performance if the result is just read.

  if (!result) { // Now 'result' will be null if no document was found or updated
    throw new Error('Notification not found or no changes made');
  }
  return result;
};

const deleteNotificationByIdService = async (notificationId, req = null) => {
  const query = { _id: notificationId };
  // Optimization Recommendation: Ensure 'tenantId' is indexed on Notification model if 'withTenantFilter' uses it.
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
    // Optimization Recommendation: Ensure 'tenantId' is indexed on Notification model if 'withTenantFilter' uses it.
    const notificationQuery = req ? withTenantFilter(req, {}) : {};
    await Notification.deleteMany(notificationQuery, { session });

    // Step 2: Remove all references to notifications from the User collection (tenant-filtered)
    // Optimization Recommendation: Ensure 'tenantId' is indexed on UserModel if 'withTenantFilter' uses it.
    const userQuery = req ? withTenantFilter(req, {}) : {};
    await UserModel.updateMany(
      userQuery,
      { $set: { notifications: [] } },
      { session }
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

const getUserInboxService = async (userId, category, isArchived, req = null) => {
  // Bug Fix: The original implementation queried Notification directly using 'userId',
  // but notifications are linked via UserModel's 'notifications' array and do not
  // inherently store 'userId' unless explicitly added during creation.
  // This revised approach queries the Notification model directly using 'recipientId'
  // which is assumed to be added during sendNotificationByIdService.
  // If a notification can be sent to multiple users (e.g., sendNotificationService),
  // then a different approach (like querying UserModel and populating) would be needed.
  // For this fix, we assume 'recipientId' is present on Notification documents for direct user-specific queries.

  let query = { recipientId: userId }; // Query by recipientId on the Notification model

  if (category) {
    query.category = category;
  }
  if (isArchived !== undefined) {
    query.isArchived = isArchived;
  }

  // Fetch from newest to oldest
  // Optimization: Added .lean() for read-only query to return plain JavaScript objects, improving performance.
  // Optimization Recommendation: For optimal performance, consider adding a compound index on Notification model:
  // { tenantId: 1, recipientId: 1, category: 1, isArchived: 1, createdAt: -1 }
  // or at least { tenantId: 1, recipientId: 1, createdAt: -1 } if tenantId and recipientId are primary filters.
  const result = await Notification.find(
    req ? withTenantFilter(req, query) : query
  ).sort({ createdAt: -1 }).lean();
  return result;
};

const archiveNotificationService = async (notificationId, isArchived = true, req = null) => {
  const query = { _id: notificationId };
  // Optimization Recommendation: Ensure 'tenantId' is indexed on Notification model if 'withTenantFilter' uses it.
  const result = await Notification.findOneAndUpdate(
    req ? withTenantFilter(req, query) : query,
    { $set: { isArchived } },
    { new: true }
  ).lean(); // Added .lean() for performance if the result is just read.
  if (!result) {
    throw new Error('Notification not found or access denied');
  }
  return result;
};

export const NotificationService = {
  sendNotificationService,
  getNotificationService,
  sendNotificationByIdService,
  getNotificationByIdService,
  updateNotificationByIdService,
  deleteNotificationByIdService,
  deleteAllNotificationService,
  getUserInboxService,
  archiveNotificationService,
};