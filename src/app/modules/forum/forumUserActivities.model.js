/**
 * @file Defines the Mongoose schema and model for user activities within the forum module.
 * @module models/forumUserActivities
 */

const mongoose = require('mongoose');
// const validator = require("validator");

/**
 * Represents a user's activity (like or comment) on a specific forum post.
 * @typedef {object} ForumUserActivity
 * @property {string} [id] - A custom unique identifier. Mongoose's default '_id' is also available.
 * @property {string} [img] - URL to the user's avatar image.
 * @property {string} email - The email of the user who performed the activity.
 * @property {boolean} like - A flag indicating if the activity is a 'like'. Defaults to false.
 * @property {string} comment - The text content of the comment. Required if the activity is a comment.
 * @property {mongoose.Schema.Types.ObjectId} forumPostId - A reference to the parent 'Forum' post this activity belongs to.
 * @property {Date} createdAt - Timestamp of when the activity was created.
 * @property {Date} updatedAt - Timestamp of when the activity was last updated.
 */

/**
 * Mongoose schema for user activities on forum posts.
 * @const {mongoose.Schema}
 */
const forumUserActivitiesSchema = mongoose.Schema(
  {
    // Optimization: If this 'id' is a custom unique identifier, it should be indexed.
    // Mongoose's default '_id' is already indexed and unique.
    // If this is intended to be the primary lookup key besides _id, making it unique is crucial.
    /**
     * A custom, unique identifier for the activity.
     * This is indexed for faster lookups. It's a sparse index,
     * meaning uniqueness is only enforced for documents that have this field.
     * @type {string}
     */
    id: {
      type: String,
      index: true,
      unique: true, // Assuming this custom ID should be unique. Remove if not.
      sparse: true, // Use a sparse index if the 'id' field is optional to enforce uniqueness only on documents that have the field.
    },
    /**
     * The URL of the user's avatar image.
     * @type {string}
     */
    img: {
      type: String, // URL to user's avatar, presumably.
    },
    /**
     * The email of the user who performed the activity. Used to identify the user.
     * @type {string}
     */
    email: {
      type: String,
      // validate: [validator.isEmail, "Please provide a valid email"],
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
    // Optimization: Removed 'likeCount'. This field is better suited on the parent 'Forum' document.
    // Storing it here is redundant and can lead to data inconsistency. The count should be
    // calculated or updated on the Forum post itself when a 'like' activity occurs.
    /**
     * The text content of a user's comment.
     * @type {string}
     * @required
     */
    comment: {
      type: String,
      required: [true, 'Please provide a comment'],
      minLength: [3, 'Comment must be at list 3 characters'],
      maxLength: [200, 'Comment is too large'], // Corrected typo from 'learge'
    },
    // Optimization: Renamed 'userActivities' to 'forumPostId' and changed from an array to a single reference.
    // An activity (like a specific comment or like) typically belongs to a single forum post.
    // This simplifies the data model, improves query performance, and makes indexing more efficient.
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
  },
  {
    // The timestamps option automatically adds indexed `createdAt` and `updatedAt` fields.
    /**
     * Automatically adds `createdAt` and `updatedAt` timestamp fields.
     */
    timestamps: true,
  }
);

// --- Optimizations: Compound Indexing ---
// Indexes are crucial for read performance. Compound indexes can satisfy queries on multiple fields.

// Performance: Index for fetching all activities for a specific forum post, sorted by most recent.
// This is a very common query pattern (e.g., loading comments for a post).
// This index also covers queries that only filter by `forumPostId`.
forumUserActivitiesSchema.index({ forumPostId: 1, createdAt: -1 });

// Performance: Index for fetching all activities by a specific user, sorted by most recent.
// Useful for user profile pages or activity feeds.
// This index also covers queries that only filter by `email`.
forumUserActivitiesSchema.index({ email: 1, createdAt: -1 });

/**
 * Mongoose model for Forum User Activities.
 * Represents a collection of user interactions (likes, comments) on forum posts.
 * @const {mongoose.Model<ForumUserActivity>}
 */
const UserForumActivities = mongoose.model(
  'forum-User-Activities',
  forumUserActivitiesSchema
);

/**
 * Exports the UserForumActivities Mongoose model.
 * @exports UserForumActivities
 */
module.exports = UserForumActivities;