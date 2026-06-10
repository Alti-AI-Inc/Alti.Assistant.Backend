const mongoose = require('mongoose');
const validator = require('validator');
const { categoryValues } = require('./forum.constant');

const forumSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a forum title'], // Uncommented and message adjusted for consistency
      minLength: [3, 'Title must be at least 3 characters'], // Typo fixed: "at list" -> "at least"
      maxLength: [100, 'Title is too large'], // Typo fixed: "learge" -> "large", and message adjusted for consistency
    },
    img: {
      type: String,
      required: [true, 'Forum image is required'],
    },
    category: {
      type: String,
      required: [true, 'Please provide a forum category'],
      enum: {
        values: categoryValues,
        message: 'Invalid category',
      },
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Assuming you have a User model for property owners
      required: true,
    },
    userActivities: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'forum-User-Activities',
      },
    ],
    authorEmail: {
      type: String,
      lowercase: true, // Removed redundant 'lowercase: true'
      validate: [validator.isEmail, 'Please provide a valid email'],
      trim: true,
    },
    description: [ // Changed to a flexible array of sub-documents, allowing 0 to N description parts
      {
        title: String,
        content1: String,
        content2: String,
      },
    ],
    // Removed manual createdAt and updatedAt fields as 'timestamps: true' in schema options handles them automatically
    // createdAt: {
    //   type: Date,
    //   default: Date.now,
    // },
    // updatedAt: {
    //   type: Date,
    //   default: Date.now,
    // },

    // Multi-tenant support
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true, // Mongoose will automatically add and manage 'createdAt' and 'updatedAt' fields
  }
);

const Forum = mongoose.model('Forum', forumSchema);

module.exports = Forum;