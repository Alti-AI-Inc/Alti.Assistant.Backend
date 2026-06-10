import mongoose from 'mongoose';

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
 * Increment the request counter for today. Returns the updated document.
 * If a new daily document is created, storageUsed is initialized from the latest previous day's record.
 * 
 * @async
 * @function incrementRequest
 * @memberof UserUsageSchema.statics
 * @param {mongoose.Types.ObjectId | string} userId - The ID of the user.
 * @param {mongoose.Types.ObjectId | string | null} [tenantId=null] - The ID of the tenant, or null for personal mode.
 * @returns {Promise<mongoose.Document & IUserUsage>} The updated daily usage document.
 */
UserUsageSchema.statics.incrementRequest = async function (
  userId,
  tenantId = null
) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Bug Fix: When a new daily document is created via incrementRequest, storageUsed should be initialized
  // from the latest previous day's record, not default to 0.
  const latestPreviousDoc = await this.findOne({ userId, tenantId, date: { $lt: today } })
                                    .sort({ date: -1 })
                                    .select('storageUsed');

  const initialStorageUsed = latestPreviousDoc ? latestPreviousDoc.storageUsed : 0;

  const doc = await this.findOneAndUpdate(
    { userId, tenantId, date: today },
    { $inc: { requestsUsed: 1 }, $setOnInsert: { storageUsed: initialStorageUsed } }, // Initialize storageUsed on insert
    { upsert: true, new: true }
  );
  return doc;
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
 * Update storage used (add or subtract bytes).
 * Pass negative value to subtract when files are deleted.
 * Uses an atomic aggregation pipeline to prevent race conditions and clamp storage at 0.
 * 
 * @async
 * @function updateStorage
 * @memberof UserUsageSchema.statics
 * @param {mongoose.Types.ObjectId | string} userId - The ID of the user.
 * @param {mongoose.Types.ObjectId | string | null} [tenantId=null] - The ID of the tenant, or null for personal mode.
 * @param {number} bytes - The number of bytes to add (positive) or subtract (negative).
 * @returns {Promise<mongoose.Document & IUserUsage>} The updated daily usage document.
 */
UserUsageSchema.statics.updateStorage = async function (
  userId,
  tenantId = null,
  bytes
) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Bug Fix: When a new daily document is created via updateStorage, storageUsed should be initialized
  // from the latest previous day's record, not default to 0.
  const latestPreviousDoc = await this.findOne({ userId, tenantId, date: { $lt: today } })
                                    .sort({ date: -1 })
                                    .select('storageUsed');

  const initialStorageUsed = latestPreviousDoc ? latestPreviousDoc.storageUsed : 0;

  // Bug Fix: The original clamping logic `if (doc.storageUsed < 0) { doc.storageUsed = 0; await doc.save(); }`
  // was not atomic and could lead to race conditions.
  // Using an aggregation pipeline for findOneAndUpdate allows for atomic increment and clamping.
  const doc = await this.findOneAndUpdate(
    { userId, tenantId, date: today },
    [ // Use an aggregation pipeline for atomic update and clamping
      {
        $set: {
          // Initialize storageUsed if it's a new document, otherwise use existing and add bytes, then clamp at 0
          storageUsed: {
            $max: [
              0, // Ensure storageUsed does not go below 0
              {
                $add: [
                  { $ifNull: ["$storageUsed", initialStorageUsed] }, // Use existing storageUsed or initialize
                  bytes
                ]
              }
            ]
          },
          // Ensure requestsUsed is initialized to 0 if this is the first operation of the day
          requestsUsed: { $ifNull: ["$requestsUsed", 0] }
        }
      }
    ],
    { upsert: true, new: true }
  );

  return doc;
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