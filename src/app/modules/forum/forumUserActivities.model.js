const mongoose = require('mongoose');
// const validator = require("validator");

const forumUserActivitiesSchema = mongoose.Schema(
  {
    // Optimization: If this 'id' is a custom unique identifier, it should be indexed.
    // Mongoose's default '_id' is already indexed and unique.
    // If this is intended to be the primary lookup key besides _id, making it unique is crucial.
    id: {
      type: String,
      index: true,
      unique: true, // Assuming this custom ID should be unique. Remove if not.
      sparse: true, // Use a sparse index if the 'id' field is optional to enforce uniqueness only on documents that have the field.
    },
    img: {
      type: String, // URL to user's avatar, presumably.
    },
    email: {
      type: String,
      // validate: [validator.isEmail, "Please provide a valid email"],
    },
    like: {
      type: Boolean,
      default: false,
    },
    // Optimization: Removed 'likeCount'. This field is better suited on the parent 'Forum' document.
    // Storing it here is redundant and can lead to data inconsistency. The count should be
    // calculated or updated on the Forum post itself when a 'like' activity occurs.
    comment: {
      type: String,
      required: [true, 'Please provide a comment'],
      minLength: [3, 'Comment must be at list 3 characters'],
      maxLength: [200, 'Comment is too large'], // Corrected typo from 'learge'
    },
    // Optimization: Renamed 'userActivities' to 'forumPostId' and changed from an array to a single reference.
    // An activity (like a specific comment or like) typically belongs to a single forum post.
    // This simplifies the data model, improves query performance, and makes indexing more efficient.
    forumPostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Forum',
      required: true,
    },
  },
  {
    // The timestamps option automatically adds indexed `createdAt` and `updatedAt` fields.
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


const UserForumActivities = mongoose.model(
  'forum-User-Activities',
  forumUserActivitiesSchema
);

module.exports = UserForumActivities;