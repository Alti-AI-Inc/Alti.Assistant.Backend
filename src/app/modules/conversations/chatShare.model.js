import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

/**
 * @typedef {object} ChatShareMetadata
 * @property {string} [title] - Optional title for the shared chat.
 * @property {string} [description] - Optional description for the shared chat.
 * @property {Array<string>} [tags] - Optional tags for categorization.
 * @property {object} [custom] - Any other custom metadata.
 */

/**
 * Mongoose schema for the ChatShare model.
 * Represents a shareable link for a conversation, allowing users to share their chats.
 *
 * @property {string} shareId - A unique identifier for the share link, generated using UUID v4.
 * @property {string} conversationId - The ID of the conversation being shared. References the 'Conversation' model.
 * @property {mongoose.Schema.Types.ObjectId} userId - The ID of the user who created the share. References the 'User' model.
 * @property {'public'|'private'} shareType - The type of share, either 'public' (accessible to anyone with the link) or 'private' (restricted access, though not fully implemented here). Defaults to 'public'.
 * @property {boolean} isActive - Indicates if the share link is currently active and accessible. Defaults to `true`.
 * @property {boolean} allowComments - Indicates if comments are allowed on the shared chat view. Defaults to `false`.
 * @property {Date|null} expiresAt - The date and time when the share link will expire. `null` means no expiration. Defaults to `null`.
 * @property {number} viewCount - The number of times the shared chat has been viewed. Defaults to `0`.
 * @property {Date|null} lastViewedAt - The date and time when the shared chat was last viewed. Defaults to `null`.
 * @property {ChatShareMetadata} metadata - A mixed type object for storing additional, flexible metadata related to the share. Defaults to an empty object.
 * @property {Date} createdAt - Timestamp of when the share was created.
 * @property {Date} updatedAt - Timestamp of when the share was last updated.
 */
const ChatShareSchema = new mongoose.Schema(
  {
    shareId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      ref: 'Conversation',
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    shareType: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    allowComments: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: null, // null means no expiration
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    lastViewedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * Defines indexes for the ChatShareSchema to improve query performance.
 * - `userId` and `isActive`: For quickly finding active shares by a specific user.
 * - `conversationId` and `isActive`: For quickly finding active shares related to a specific conversation.
 * - `expiresAt`: For efficient querying of expired or non-expired shares.
 * - `shareType` and `isActive`: For filtering shares based on their type and activity status.
 */
ChatShareSchema.index({ userId: 1, isActive: 1 });
ChatShareSchema.index({ conversationId: 1, isActive: 1 });
ChatShareSchema.index({ expiresAt: 1 });
ChatShareSchema.index({ shareType: 1, isActive: 1 });

/**
 * Virtual property `isExpired`
 * Checks if the share link has expired based on the `expiresAt` field.
 *
 * @returns {boolean} `true` if the share has an `expiresAt` date in the past, `false` otherwise.
 */
ChatShareSchema.virtual('isExpired').get(function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

/**
 * Instance method to increment the view count of a shared chat.
 * Updates `viewCount` and `lastViewedAt` fields, then saves the document.
 *
 * @returns {Promise<ChatShare>} A promise that resolves with the updated ChatShare document.
 */
ChatShareSchema.methods.incrementViewCount = function () {
  this.viewCount += 1;
  this.lastViewedAt = new Date();
  return this.save();
};

/**
 * Instance method to check if the share link is currently accessible.
 * A share is accessible if it is active (`isActive: true`) and not expired (`isExpired: false`).
 *
 * @returns {boolean} `true` if the share is accessible, `false` otherwise.
 */
ChatShareSchema.methods.isAccessible = function () {
  if (!this.isActive) return false;
  // Access the virtual property 'isExpired'
  if (this.isExpired) return false;
  return true;
};

/**
 * Static method to find an active and non-expired share by its `shareId`.
 * Populates the `conversationId` field.
 *
 * @param {string} shareId - The unique ID of the share link.
 * @returns {Promise<ChatShare|null>} A promise that resolves with the ChatShare document if found and active/not expired, otherwise `null`.
 */
ChatShareSchema.statics.findActiveShare = function (shareId) {
  return this.findOne({
    shareId,
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).populate('conversationId');
};

/**
 * @typedef {object} FindUserSharesOptions
 * @property {number} [page=1] - The page number for pagination.
 * @property {number} [limit=20] - The maximum number of shares per page.
 * @property {'active'|'expired'|'revoked'|'all'} [status='active'] - Filter shares by their status.
 */

/**
 * Static method to find shared chats belonging to a specific user, with pagination and status filtering.
 * Populates selected fields from the `conversationId` reference.
 *
 * @param {mongoose.Schema.Types.ObjectId} userId - The ID of the user whose shares are to be found.
 * @param {FindUserSharesOptions} [options] - Options for pagination and filtering.
 * @returns {Promise<ChatShare[]>} A promise that resolves with an array of ChatShare documents.
 */
ChatShareSchema.statics.findUserShares = function (userId, options = {}) {
  const { page = 1, limit = 20, status = 'active' } = options;

  let query = { userId };

  if (status === 'active') {
    query.isActive = true;
    query.$or = [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }];
  } else if (status === 'expired') {
    query.expiresAt = { $lte: new Date() };
    // For expired shares, we might also want to ensure they were once active
    // or that isActive is not explicitly false due to revocation.
    // Depending on business logic, isActive: true might be added here,
    // but current logic implies 'expired' is a state independent of 'revoked'.
  } else if (status === 'revoked') {
    query.isActive = false;
  }
  // If status is 'all', no additional status filters are applied,
  // allowing all shares for the user to be returned.

  const skip = (page - 1) * limit;

  return this.find(query)
    .populate(
      'conversationId',
      'title conversationId lastActivity messageCount'
    )
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// The pre-save middleware to set default shareId is redundant because
// the 'shareId' field already has a 'default: () => uuidv4()' function,
// which Mongoose automatically calls when a new document is created
// and 'shareId' is not provided.
// Removing this for cleaner and more efficient code.

/**
 * Mongoose model for ChatShare.
 * Provides an interface to the 'chatshares' collection in MongoDB.
 *
 * @type {mongoose.Model<ChatShare>}
 */
const ChatShare = mongoose.model('ChatShare', ChatShareSchema);

export default ChatShare;