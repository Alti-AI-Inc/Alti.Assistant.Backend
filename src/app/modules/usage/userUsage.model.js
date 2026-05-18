import mongoose from 'mongoose';

/**
 * UserUsage Model
 *
 * Tracks daily usage counters per user (or per user+tenant in org mode).
 * A single document is created per user per day, then upserted as requests come in.
 *
 * Separate from Subscription so:
 *  - Usage resets daily without touching billing data
 *  - Usage can be queried historically (per-day records)
 *  - Subscription model stays clean (only limits/billing info)
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
 * @param {ObjectId} userId
 * @param {ObjectId|null} tenantId
 * @returns {Promise<UserUsage>}
 */
UserUsageSchema.statics.getOrCreateToday = async function (
  userId,
  tenantId = null
) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // normalize to UTC midnight

  const doc = await this.findOneAndUpdate(
    { userId, tenantId, date: today },
    { $setOnInsert: { requestsUsed: 0 } },
    { upsert: true, new: true }
  );
  return doc;
};

/**
 * Increment the request counter for today. Returns the updated document.
 * @param {ObjectId} userId
 * @param {ObjectId|null} tenantId
 * @returns {Promise<UserUsage>}
 */
UserUsageSchema.statics.incrementRequest = async function (
  userId,
  tenantId = null
) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const doc = await this.findOneAndUpdate(
    { userId, tenantId, date: today },
    { $inc: { requestsUsed: 1 } },
    { upsert: true, new: true }
  );
  return doc;
};

/**
 * Get today's request count for a user.
 * @param {ObjectId} userId
 * @param {ObjectId|null} tenantId
 * @returns {Promise<number>}
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
 * @param {ObjectId} userId
 * @param {ObjectId|null} tenantId
 * @param {number} bytes  - positive to add, negative to subtract
 * @returns {Promise<UserUsage>}
 */
UserUsageSchema.statics.updateStorage = async function (
  userId,
  tenantId = null,
  bytes
) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Use $max to prevent storageUsed going below 0
  const doc = await this.findOneAndUpdate(
    { userId, tenantId, date: today },
    { $inc: { storageUsed: bytes } },
    { upsert: true, new: true }
  );

  // Clamp to 0 if went negative
  if (doc.storageUsed < 0) {
    doc.storageUsed = 0;
    await doc.save();
  }

  return doc;
};

/**
 * Get total storage used by a user across all daily records.
 * Since storageUsed is cumulative, just grab today's record (or latest).
 * @param {ObjectId} userId
 * @param {ObjectId|null} tenantId
 * @returns {Promise<number>} bytes
 */
UserUsageSchema.statics.getTotalStorage = async function (
  userId,
  tenantId = null
) {
  const latest = await this.findOne({ userId, tenantId }).sort({ date: -1 });
  return latest ? latest.storageUsed : 0;
};

const UserUsageModel = mongoose.model('UserUsage', UserUsageSchema);

export default UserUsageModel;
