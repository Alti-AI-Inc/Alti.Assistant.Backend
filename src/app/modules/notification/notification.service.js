import mongoose from 'mongoose';
import { PubSub } from '@google-cloud/pubsub';
import UserModel from '../auth/auth.model.js';
import Notification from './notification.model.js';
import { logger } from '../../../shared/logger.js';
import {
  withTenantContext,
  withTenantFilter,
} from '../../helpers/tenantQuery.js';

// Initialize GCP Pub/Sub client
// Ensure your environment is authenticated, e.g., via GOOGLE_APPLICATION_CREDENTIALS
const pubSubClient = new PubSub();

// It's best practice to use environment variables for topic names
const NOTIFICATION_FANOUT_TOPIC = process.env.NOTIFICATION_FANOUT_TOPIC || 'notification-fanout';
const NOTIFICATION_DELETE_ALL_TOPIC = process.env.NOTIFICATION_DELETE_ALL_TOPIC || 'notification-delete-all';

const sendNotificationService = async (data, req = null) => {
  // 1. Create the Notification first. This remains synchronous to provide immediate feedback.
  const newNotification = await Notification.create(
    req ? withTenantContext(req, data) : data
  );

  // 2. Offload the fan-out operation to a background worker via Pub/Sub.
  // This avoids blocking the request while updating potentially millions of user documents.
  // A separate worker (e.g., Cloud Function) will subscribe to this topic
  // and perform the UserModel.updateMany operation.
  if (req && req.tenantId) {
    const message = {
      notificationId: newNotification._id.toString(),
      tenantId: req.tenantId.toString(),
    };
    const dataBuffer = Buffer.from(JSON.stringify(message));

    try {
      await pubSubClient.topic(NOTIFICATION_FANOUT_TOPIC).publishMessage({ data: dataBuffer });
      logger.info(`Fan-out task for notification ${newNotification._id} published to topic ${NOTIFICATION_FANOUT_TOPIC}.`);
    } catch (error) {
      logger.error(`Failed to publish fan-out task for notification ${newNotification._id}:`, error);
      // Depending on business requirements, you might want to handle this failure,
      // e.g., by scheduling a retry or logging for manual intervention.
    }
  } else {
    logger.warn('sendNotificationService called without a request context (tenantId). Fan-out will not occur.');
  }

  // Return the created notification immediately. The fan-out happens in the background.
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
  // 2. Push this notification to a specific user.
  // This is a fast, targeted update and does not need to be offloaded.
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
  // This is a long-running, destructive operation. It should not be handled synchronously in a request.
  // We offload it to a background worker by publishing a message to Pub/Sub.
  // The API endpoint should return a 202 Accepted response immediately.
  // A separate worker will subscribe to this topic and perform the transactional delete.
  if (req && req.tenantId) {
    const message = {
      tenantId: req.tenantId.toString(),
    };
    const dataBuffer = Buffer.from(JSON.stringify(message));

    try {
      const messageId = await pubSubClient.topic(NOTIFICATION_DELETE_ALL_TOPIC).publishMessage({ data: dataBuffer });
      logger.info(`'Delete All Notifications' job for tenant ${req.tenantId} published with messageId ${messageId}.`);
      // The function can return a job ID or a simple success message to the controller.
      return {
        message: 'Job to delete all notifications has been queued.',
        tenantId: req.tenantId,
        topic: NOTIFICATION_DELETE_ALL_TOPIC,
      };
    } catch (error) {
      logger.error(`Failed to publish 'Delete All Notifications' job for tenant ${req.tenantId}:`, error);
      // Throw an error to let the controller know the job could not be queued.
      throw new Error('Failed to queue the delete all notifications job.');
    }
  } else {
    logger.error('deleteAllNotificationService called without a request context (tenantId). Operation aborted.');
    throw new Error('Tenant context is required to delete all notifications.');
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

const sendNotification = async (userId, data, req = null) => {
  return sendNotificationByIdService(userId, data, req);
};

const notifyTenantAdmins = async (tenantId, data, req = null) => {
  try {
    const admins = await UserModel.find({ tenantId, role: 'admin' }).select('_id').lean();
    const promises = admins.map(admin => sendNotificationByIdService(admin._id, data, req));
    await Promise.all(promises);
  } catch (error) {
    logger.error(`Failed to notify tenant admins for tenant ${tenantId}:`, error);
  }
};

const notifyPlatformOwners = async (data, req = null) => {
  try {
    const superAdmins = await UserModel.find({ role: 'super_admin' }).select('_id').lean();
    const promises = superAdmins.map(admin => sendNotificationByIdService(admin._id, data, req));
    await Promise.all(promises);
  } catch (error) {
    logger.error('Failed to notify platform owners:', error);
  }
};

const createForAdmins = async (workspaceId, data, req = null) => {
  return notifyTenantAdmins(workspaceId, data, req);
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
  sendNotification,
  notifyTenantAdmins,
  notifyPlatformOwners,
  createForAdmins,
};

export const notificationService = NotificationService;