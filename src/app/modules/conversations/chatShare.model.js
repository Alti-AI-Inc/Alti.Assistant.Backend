import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

/**
 * @typedef {object} ChatShareMetadata
 * @property {string} [title] - Optional title for the shared chat.
 * @property {string} [description] - Optional description for the shared chat.
 * @property {Array<string>} [tags] - Optional tags for categorization.
 * @property {object} [custom] - Any other custom metadata.
 */

// SECURITY FIX: Helper function to recursively check for ' prefixed keys.
// This is used to sanitize objects before they are saved into a Mixed type field,
// preventing NoSQL operator injection attacks (e.g., using '$where').
const containsDisallowedKeys = (obj) => {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const key in obj) {
      // Using hasOwnProperty is a good practice to avoid iterating over prototype properties.
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (key.startsWith('$')) {
          return true;
        }
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          if (containsDisallowedKeys(obj[key])) {
            return true;
          }
        }
      }
    }
  }
  return false;
};

/**
 * Mongoose schema for the ChatShare model.
 * Represents a shareable link for a conversation, allowing users to share their chats.
 *
 * @property {string} shareId - A unique identifier for the share link, generated using UUID v4.
 * @property {mongoose.Schema.Types.ObjectId} organizationId - The ID of the organization this share belongs to. Essential for multi-tenancy.
 * @property {mongoose.Schema.Types.ObjectId} workspaceId - The ID of the workspace this share belongs to. Essential for multi-tenancy and access control.
 * @property {mongoose.Schema.Types.ObjectId} conversationId - The ID of the conversation being shared. References the 'Conversation' model.
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
    },
    // INTEGRATION FIX: Added organizationId and workspaceId to enforce tenant boundaries.
    // In a multi-tenant system, all resources must be strictly associated with a tenant (workspace/organization)
    // to prevent data leakage and enable proper role-based access control.
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    // BUG FIX: Changed conversationId type from String to ObjectId for proper Mongoose population.
    // Using ObjectId is the standard, robust, and performant practice for referencing other documents.
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
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
      // SECURITY FIX: Add a validator to prevent NoSQL operator injection.
      // The 'Mixed' type is flexible but can be a security risk if user input
      // containing keys starting with ' (like '$where') is saved directly.
      // This validator recursively checks for such keys in the metadata object.
      validate: {
        validator: (v) => !containsDisallowedKeys(v),
        message: 'Metadata contains disallowed keys starting with "$".',
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * Defines indexes for the ChatShareSchema to improve query performance.
 * Optimized compound indexes to support multi-tenancy and common query patterns.
 */
// INTEGRATION FIX: Added indexes with workspaceId to support tenant-scoped queries efficiently.
ChatShareSchema.index({ workspaceId: 1, userId: 1, createdAt: -1 }); // For user-specific lookups within a workspace
ChatShareSchema.index({ workspaceId: 1, isActive: 1, createdAt: -1 }); // For status-based lookups within a workspace (e.g., admin view)
ChatShareSchema.index({ conversationId: 1, isActive: 1 });
ChatShareSchema.index({ expiresAt: 1 }); // Useful for a background job to clean up expired shares
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
 * Optimized to use an atomic $inc update to prevent write race conditions and avoid full document save overhead.
 *
 * @returns {Promise<object>} A promise that resolves with the update write result.
 */
ChatShareSchema.methods.incrementViewCount = function () {
  this.viewCount += 1;
  this.lastViewedAt = new Date();
  return this.constructor.updateOne(
    { _id: this._id },
    {
      $inc: { viewCount: 1 },
      $set: { lastViewedAt: this.lastViewedAt },
    }
  );
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
 * This method is for public access and does not need tenant scoping as shareId is globally unique.
 * Populates the `conversationId` field.
 *
 * @param {string} shareId - The unique ID of the share link.
 * @returns {Promise<ChatShare|null>} A promise that resolves with the ChatShare document if found and active/not expired, otherwise `null`.
 */
ChatShareSchema.statics.findActiveShare = function (shareId) {
  // SECURITY FIX: Add input validation to prevent NoSQL injection.
  // Ensure shareId is a non-empty string before using it in a query.
  // This prevents query objects like { $ne: null } from being passed.
  if (typeof shareId !== 'string' || shareId.trim() === '') {
    // Returning null is a safe default for a "find" operation.
    return Promise.resolve(null);
  }
  return this.findOne({
    shareId,
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  })
    .populate('conversationId')
    // PERFORMANCE: Use .lean() for faster read-only queries.
    // This operation is for public viewing and doesn't require Mongoose document methods,
    // so skipping object hydration improves performance.
    .lean();
};

/**
 * @typedef {object} FindUserSharesOptions
 * @property {number} [page=1] - The page number for pagination.
 * @property {number} [limit=20] - The maximum number of shares per page.
 * @property {'active'|'expired'|'revoked'|'all'} [status='active'] - Filter shares by their status.
 */

/**
 * Static method to find shared chats, with pagination and status filtering, respecting tenant boundaries.
 * Populates selected fields from the `conversationId` reference.
 * Optimized with lean queries for faster read-only performance.
 *
 * @param {object} queryContext - The context for the query, used for authorization.
 * @param {mongoose.Schema.Types.ObjectId} queryContext.workspaceId - The ID of the workspace to scope the search. This is mandatory.
 * @param {mongoose.Schema.Types.ObjectId} [queryContext.userId] - Optional. The ID of the user whose shares are to be found. If not provided, searches for all shares in the workspace (for admin/manager roles).
 * @param {FindUserSharesOptions} [options] - Options for pagination and filtering.
 * @returns {Promise<ChatShare[]>} A promise that resolves with an array of ChatShare documents.
 */
ChatShareSchema.statics.findUserShares = function (queryContext, options = {}) {
  const { userId, workspaceId } = queryContext;

  // SECURITY FIX: Sanitize and validate pagination parameters.
  // Ensure 'page' and 'limit' are positive integers to prevent potential DoS
  // via large values or errors from non-numeric input. A cap on the limit is also enforced.
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 20));
  const { status = 'active' } = options;

  // SECURITY FIX: The query must be scoped to the workspace to prevent IDOR and data leakage across tenants.
  // Throwing an error or returning an empty array if workspaceId is missing prevents accidental data exposure.
  if (!workspaceId) {
    // Returning empty array is a safe default. The service layer could also throw an error.
    return Promise.resolve([]);
  }

  let query = { workspaceId };

  // If a specific user is requested, add it to the query.
  // This allows the same method to be used by users (for their own shares) and admins (for all shares in a workspace).
  if (userId) {
    query.userId = userId;
  }

  if (status === 'active') {
    query.isActive = true;
    query.$or = [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }];
  } else if (status === 'expired') {
    // BUG FIX: An 'expired' share should be one that was active but has passed its expiration date.
    // A 'revoked' (isActive: false) share is a different state and should not be included here.
    query.isActive = true;
    query.expiresAt = { $ne: null, $lte: new Date() };
  } else if (status === 'revoked') {
    query.isActive = false;
  }
  // For 'all', no additional status filters are applied beyond the workspaceId/userId scope.

  const skip = (page - 1) * limit;

  return this.find(query)
    .populate(
      'conversationId',
      'title lastActivity messageCount' // Cleaned up populate fields
    )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

/**
 * Mongoose model for ChatShare.
 * Provides an interface to the 'chatshares' collection in MongoDB.
 *
 * @type {mongoose.Model<ChatShare>}
 */
const ChatShare = mongoose.model('ChatShare', ChatShareSchema);

export default ChatShare;