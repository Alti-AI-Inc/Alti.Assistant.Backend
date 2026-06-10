/**
 * @file Defines the Mongoose schema and model for user activities within the forum module.
 * @module models/forumUserActivities
 */

const mongoose = require('mongoose');

/**
 * Represents a user's activity (like or comment) on a specific forum post.
 * This schema is designed for a multi-tenant environment, ensuring all activities
 * are scoped to a specific user, workspace, and organization.
 * @typedef {object} ForumUserActivity
 * @property {mongoose.Schema.Types.ObjectId} userId - Reference to the user who performed the activity.
 * @property {mongoose.Schema.Types.ObjectId} workspaceId - Reference to the workspace where the activity occurred.
 * @property {mongoose.Schema.Types.ObjectId} organizationId - Reference to the parent organization/platform.
 * @property {mongoose.Schema.Types.ObjectId} forumPostId - Reference to the parent 'Forum' post this activity belongs to.
 * @property {boolean} like - A flag indicating if the activity is a 'like'. Defaults to false.
 * @property {string} [comment] - The text content of the comment. Required if the activity is not a 'like'.
 * @property {Date} createdAt - Timestamp of when the activity was created.
 * @property {Date} updatedAt - Timestamp of when the activity was last updated.
 */

/**
 * Mongoose schema for user activities on forum posts.
 * @const {mongoose.Schema}
 */
const forumUserActivitiesSchema = mongoose.Schema(
  {
    /**
     * Reference to the user who performed the activity.
     * CRITICAL: This is essential for ownership, permissions, and tracking user actions
     * for limits and notifications. Replaces denormalized 'email' and 'img' fields for data integrity.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @required
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /**
     * Reference to the workspace this activity belongs to.
     * CRITICAL: Enforces tenant boundaries, preventing data leakage (IDOR) and ensuring
     * actions are contained within the correct workspace context for admins and managers.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Workspace
     * @required
     */
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    /**
     * Reference to the organization (platform owner context) this activity belongs to.
     * CRITICAL: Provides the top-level tenant context for super_admin oversight and platform-wide analytics.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Organization
     * @required
     */
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    /**
     * A reference to the parent `Forum` post to which this activity belongs.
     * This is a required field to link the activity to its context.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Forum
     * @required
     */
    forumPostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Forum',
      required: true,
    },
    /**
     * A boolean flag to indicate if the activity is a 'like'.
     * @type {boolean}
     * @default false
     */
    like: {
      type: Boolean,
      default: false,
    },
    /**
     * The text content of a user's comment.
     * It is not strictly required, as an activity can be just a 'like'.
     * However, an activity must be either a like or a comment.
     * This is enforced by a pre-save hook.
     * @type {string}
     */
    comment: {
      type: String,
      trim: true, // Good practice to trim whitespace
      minLength: [1, 'Comment cannot be empty.'],
      maxLength: [1000, 'Comment is too large'],
    },
  },
  {
    /**
     * Automatically adds `createdAt` and `updatedAt` timestamp fields.
     */
    timestamps: true,
  }
);

// --- Schema Validation Logic ---

/**
 * Pre-save hook to ensure that an activity is valid.
 * An activity must be either a 'like' or have a non-empty 'comment'.
 * This prevents the creation of empty, meaningless activity documents.
 */
forumUserActivitiesSchema.pre('save', function (next) {
  // The 'trim' option on the comment field ensures we don't have just whitespace.
  const hasComment = this.comment && this.comment.length > 0;

  if (!this.like && !hasComment) {
    return next(new Error('Activity must be a like or have a comment.'));
  }
  next();
});


// --- Indexes for Performance and Security ---
// Indexes are crucial for read performance and enforcing data constraints.
// Compound indexes are used to optimize common query patterns, especially within a tenant context.

/**
 * Compound index to efficiently query activities within a specific workspace and for a specific forum post,
 * sorted by most recent. This is a critical index for preventing cross-tenant data access and
 * for performance when loading a post's comments/likes.
 */
forumUserActivitiesSchema.index({ workspaceId: 1, forumPostId: 1, createdAt: -1 });

/**
 * Compound index for fetching all activities by a specific user, sorted by most recent.
 * Useful for user profile pages or activity feeds. The workspaceId is included for tenant scoping.
 */
forumUserActivitiesSchema.index({ workspaceId: 1, userId: 1, createdAt: -1 });

/**
 * A unique compound index to prevent a user from liking the same post more than once.
 * A user can comment multiple times, so this index only applies to 'like' activities.
 * A partialFilterExpression is used to apply the uniqueness constraint only to documents
 * where 'like' is true. This prevents a common data integrity issue.
 */
forumUserActivitiesSchema.index(
    { forumPostId: 1, userId: 1, like: 1 },
    {
        unique: true,
        partialFilterExpression: { like: true }
    }
);


/**
 * Mongoose model for Forum User Activities.
 * Represents a collection of user interactions (likes, comments) on forum posts.
 * @const {mongoose.Model<ForumUserActivity>}
 */
const ForumUserActivity = mongoose.model(
  'ForumUserActivity', // Corrected model name to follow convention
  forumUserActivitiesSchema
);

/**
 * Exports the ForumUserActivity Mongoose model.
 * @exports ForumUserActivity
 */
module.exports = ForumUserActivity;