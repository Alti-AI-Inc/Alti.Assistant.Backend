import { PubSub } from '@google-cloud/pubsub';
import mongoose from 'mongoose';

// Initialize the Google Cloud Pub/Sub client.
// In a production application, this would be initialized once in a shared module.
const pubSubClient = new PubSub();

// Topic names should be managed via environment variables for different environments.
const USAGE_REQUEST_INCREMENT_TOPIC = process.env.USAGE_REQUEST_INCREMENT_TOPIC || 'usage-request-increment';
const USAGE_STORAGE_UPDATE_TOPIC = process.env.USAGE_STORAGE_UPDATE_TOPIC || 'usage-storage-update';


/**
 * @typedef {Object} IUserUsage
 * @property {mongoose.Types.ObjectId} userId - Who owns this usage record.
 * @property {mongoose.Types.ObjectId|null} tenantId - null = personal mode, ObjectId = organization mode.
 * @property {Date} date - The calendar date this record covers (UTC midnight, e.g. 2026-02-24).
 * @property {number} requestsUsed - Request counter for the day.
 * @property {number} storageUsed - Cumulative storage used by this user (bytes).
 * @property {Date} createdAt - Timestamp when the document was created.
 * @property {Date} updatedAt - Timestamp when the document was last updated.
 */

/**
 * UserUsage Schema
 *
 * Tracks daily usage counters per user (or per user+tenant in org mode).
 * A single document is created per user per day, then upserted as requests come in.
 *
 * Separate from Subscription so:
 *  - Usage resets daily without touching billing data
 *  - Usage can be queried historically (per-day records)
 *  - Subscription model stays clean (only limits/billing info)
 * 
 * @type {mongoose.Schema<IUserUsage>}
 */
const UserUsageSchema = new mongoose.Schema(
  {
    // Who owns this usage record
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // null = personal mode, ObjectId = organization mode
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },

    // The calendar date this record covers (UTC midnight, e.g. 2026-02-24)
    date: {
      type: Date,
      required: true,
      index: true,
    },

    // Request counter for the day
    requestsUsed: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Cumulative storage used by this user (bytes).
    // Updated on upload/delete, not reset daily.
    // This value should reflect the total storage for the user/tenant,
    // carried over from the previous day's record if a new daily record is created.
    storageUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// One record per user (+ tenant context) per day
UserUsageSchema.index({ userId: 1, tenantId: 1, date: 1 }, { unique: true });

/**
 * Get (or create) today's usage document for a user.
 * This operation remains synchronous (within the request-response cycle) as it's often
 * a prerequisite for other actions that need up-to-date usage information.
 * If a new daily document is created, storageUsed is initialized from the latest previous day's record.
 * 
 * @async
 * @function getOrCreateToday
 * @memberof UserUsageSchema.statics
 * @param {mongoose.Types.ObjectId | string} userId - The ID of the user.
 * @param {mongoose.Types.ObjectId | string | null} [tenantId=null] - The ID of the tenant, or null for personal mode.
 * @returns {Promise<mongoose.Document & IUserUsage>} The retrieved or newly created daily usage document.
 */
UserUsageSchema.statics.getOrCreateToday = async function (
  userId,
  tenantId = null
) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // normalize to UTC midnight

  // Bug Fix: When a new daily document is created, storageUsed should be initialized
  // from the latest previous day's record, not default to 0.
  const latestPreviousDoc = await this.findOne({ userId, tenantId, date: { $lt: today } })
                                    .sort({ date: -1 })
                                    .select('storageUsed');

  const initialStorageUsed = latestPreviousDoc ? latestPreviousDoc.storageUsed : 0;

  const doc = await this.findOneAndUpdate(
    { userId, tenantId, date: today },
    { $setOnInsert: { requestsUsed: 0, storageUsed: initialStorageUsed } }, // Initialize storageUsed on insert
    { upsert: true, new: true }
  );
  return doc;
};

/**
 * Asynchronously increments the request counter for today by publishing a message to Pub/Sub.
 * This offloads the database write from the request-response cycle, improving API latency and resilience.
 * A separate background worker must subscribe to the topic and perform the database update.
 * 
 * @async
 * @function incrementRequest
 * @memberof UserUsageSchema.statics
 * @param {mongoose.Types.ObjectId | string} userId - The ID of the user.
 * @param {mongoose.Types.ObjectId | string | null} [tenantId=null] - The ID of the tenant, or null for personal mode.
 * @returns {Promise<string>} The message ID of the published message.
 */
UserUsageSchema.statics.incrementRequest = async function (
  userId,
  tenantId = null
) {
  // The payload for the background worker. Convert ObjectIds to strings for reliable JSON serialization.
  const payload = {
    userId: userId.toString(),
    tenantId: tenantId ? tenantId.toString() : null,
  };
  const dataBuffer = Buffer.from(JSON.stringify(payload));

  // Publish the message to the Pub/Sub topic.
  // A separate subscriber service will consume this message and execute the atomic database update.
  // The original database logic (including finding the previous day's storage for initialization)
  // must be implemented in that subscriber.
  const messageId = await pubSubClient
    .topic(USAGE_REQUEST_INCREMENT_TOPIC)
    .publishMessage({ data: dataBuffer });

  return messageId;
};

/**
 * Get today's request count for a user.
 * 
 * @async
 * @function getTodayRequests
 * @memberof UserUsageSchema.statics
 * @param {mongoose.Types.ObjectId | string} userId - The ID of the user.
 * @param {mongoose.Types.ObjectId | string | null} [tenantId=null] - The ID of the tenant, or null for personal mode.
 * @returns {Promise<number>} The number of requests used today.
 */
UserUsageSchema.statics.getTodayRequests = async function (
  userId,
  tenantId = null
) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const doc = await this.findOne({ userId, tenantId, date: today });
  return doc ? doc.requestsUsed : 0;
};

/**
 * Asynchronously updates storage used by publishing a message to Pub/Sub.
 * This offloads the database write from the request-response cycle.
 * A separate background worker must subscribe to the topic and perform the atomic database update.
 * 
 * @async
 * @function updateStorage
 * @memberof UserUsageSchema.statics
 * @param {mongoose.Types.ObjectId | string} userId - The ID of the user.
 * @param {mongoose.Types.ObjectId | string | null} [tenantId=null] - The ID of the tenant, or null for personal mode.
 * @param {number} bytes - The number of bytes to add (positive) or subtract (negative).
 * @returns {Promise<string>} The message ID of the published message.
 */
UserUsageSchema.statics.updateStorage = async function (
  userId,
  tenantId = null,
  bytes
) {
  // The payload for the background worker.
  const payload = {
    userId: userId.toString(),
    tenantId: tenantId ? tenantId.toString() : null,
    bytes,
  };
  const dataBuffer = Buffer.from(JSON.stringify(payload));

  // Publish the message to the Pub/Sub topic.
  // A separate subscriber service will consume this message and execute the atomic database update.
  // The original database logic (using an aggregation pipeline for atomic clamping)
  // must be implemented in that subscriber.
  const messageId = await pubSubClient
    .topic(USAGE_STORAGE_UPDATE_TOPIC)
    .publishMessage({ data: dataBuffer });

  return messageId;
};

/**
 * Get total storage used by a user across all daily records.
 * Since storageUsed is cumulative, just grab today's record (or latest).
 * 
 * @async
 * @function getTotalStorage
 * @memberof UserUsageSchema.statics
 * @param {mongoose.Types.ObjectId | string} userId - The ID of the user.
 * @param {mongoose.Types.ObjectId | string | null} [tenantId=null] - The ID of the tenant, or null for personal mode.
 * @returns {Promise<number>} The total storage used in bytes.
 */
UserUsageSchema.statics.getTotalStorage = async function (
  userId,
  tenantId = null
) {
  const latest = await this.findOne({ userId, tenantId }).sort({ date: -1 });
  return latest ? latest.storageUsed : 0;
};

/**
 * Mongoose Model for UserUsage.
 * Provides access to the UserUsage collection and static helper methods.
 * 
 * @type {mongoose.Model<IUserUsage>}
 */
const UserUsageModel = mongoose.model('UserUsage', UserUsageSchema);

export default UserUsageModel;