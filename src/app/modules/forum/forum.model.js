/**
 * @file Defines the Mongoose schema and model for Forum posts.
 * @module app/modules/forum/forum.model
 */

const mongoose = require('mongoose');
const validator = require('validator');
const { categoryValues } = require('./forum.constant');

/**
 * Mongoose schema for a Forum post.
 *
 * @typedef {Object} ForumSchema
 * @property {string} title - The title of the forum post. Must be between 3 and 100 characters.
 * @property {string} img - The URL or path to the forum's main image.
 * @property {string} category - The category of the forum post. Must be one of the values defined in `categoryValues`.
 * @property {mongoose.Schema.Types.ObjectId} author - The ID of the user who authored the forum post. References the 'User' model.
 * @property {mongoose.Schema.Types.ObjectId[]} userActivities - An array of IDs referencing user activities related to this forum post. References the 'forum-User-Activities' model.
 * @property {string} authorEmail - The email address of the author, validated for format and stored in lowercase.
 * @property {Array<Object>} description - An array of sub-documents, each representing a part of the forum's description.
 * @property {string} [description[].title] - Optional title for this description part.
 * @property {string} [description[].content1] - First content paragraph/section for this description part.
 * @property {string} [description[].content2] - Second content paragraph/section for this description part.
 * @property {mongoose.Schema.Types.ObjectId} [tenantId=null] - The ID of the tenant this forum post belongs to, for multi-tenancy support. References the 'Tenant' model.
 * @property {Date} createdAt - The timestamp when the forum post was created. Automatically managed by Mongoose.
 * @property {Date} updatedAt - The timestamp when the forum post was last updated. Automatically managed by Mongoose.
 */
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

/**
 * Represents the Mongoose model for a Forum post.
 *
 * @type {mongoose.Model<ForumSchema>}
 */
const Forum = mongoose.model('Forum', forumSchema);

/**
 * Exports the Forum Mongoose model.
 * @type {mongoose.Model<ForumSchema>}
 */
module.exports = Forum;