const mongoose = require('mongoose');
const validator = require('validator');
const { categoryValues } = require('./forum.constant');

const forumSchema = mongoose.Schema(
  {
    title: {
      type: String,
      // required: [true, "Please provide a blog title"],
      minLength: [3, 'title must be at list 3 characters'],
      maxLength: [100, 'Name is too learge'],
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
      lowercase: true,
      validate: [validator.isEmail, 'Please provide a valid email'],
      trim: true,
      lowercase: true,
    },
    description: [
      {
        title: String,
        content1: String,
        content2: String,
      },
      {
        title: String,
        content1: String,
        content2: String,
      },
      {
        title: String,
        content1: String,
        content2: String,
      },
      {
        title: String,
        content1: String,
        content2: String,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

const Forum = mongoose.model('Forum', forumSchema);

module.exports = Forum;
