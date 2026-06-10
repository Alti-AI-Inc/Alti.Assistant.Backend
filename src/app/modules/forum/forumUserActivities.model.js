const mongoose = require('mongoose');
// const validator = require("validator");

const forumUserActivitiesSchema = mongoose.Schema(
  {
    id: {
      // Performance Tip: Consider if this is necessary, as Mongoose provides a unique `_id` by default.
      // If this is used for lookups, it should be indexed.
      type: String,
    },
    img: {
      type: String,
    },
    email: {
      type: String,
      // validate: [validator.isEmail, "Please provide a valid email"],
      // unique: false
    },
    like: {
      type: Boolean,
      default: false,
    },
    likeCount: {
      type: Number,
    },
    comment: {
      type: String,
      required: [true, 'Please provide a comment'],
      minLength: [3, 'Comment must be at list 3 characters'],
      maxLength: [200, 'Comment is too learge'],
    },
    userActivities: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Forum',
      },
    ],
    // Optimization: Removed redundant `createdAt` and `updatedAt` fields.
    // The `timestamps: true` option below handles these automatically and more efficiently.
  },
  {
    timestamps: true,
  }
);

// --- Optimizations: Indexing ---

// Performance Tip: Index on 'email' for efficient lookups of a specific user's activities.
// This is crucial for fetching data for a user profile or dashboard.
forumUserActivitiesSchema.index({ email: 1 });

// Performance Tip: Index on 'userActivities' (which references a Forum) to quickly find all activities
// related to a specific forum post. This uses a multikey index.
forumUserActivitiesSchema.index({ userActivities: 1 });

// Performance Tip: Index on 'createdAt' for efficient sorting of activities by time, a very common operation.
// A descending index (-1) is typically used to get the most recent items first.
forumUserActivitiesSchema.index({ createdAt: -1 });


const UserForumActivities = mongoose.model(
  'forum-User-Activities',
  forumUserActivitiesSchema
);

module.exports = UserForumActivities;