/**
 * @file Defines the Mongoose schema and model for Forum posts.
 * @module app/modules/forum/forum.model
 */

const mongoose = require('mongoose');
const validator = require('validator');
// Security: Added sanitize-html to prevent Stored Cross-Site Scripting (XSS) attacks.
// Ensure you have this package installed: npm install sanitize-html
const sanitizeHtml = require('sanitize-html');
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
      required: [true, 'Please provide a forum title'],
      // Security: Added trim to remove leading/trailing whitespace, preventing validation bypasses and ensuring data consistency.
      trim: true,
      minLength: [3, 'Title must be at least 3 characters'],
      maxLength: [100, 'Title is too large'],
    },
    img: {
      type: String,
      required: [true, 'Forum image is required'],
      // Security: Validate that the img field is a proper URL to prevent injection of malicious scripts or malformed data (e.g., javascript:alert(1)).
      validate: [validator.isURL, 'Please provide a valid image URL'],
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
      ref: 'User',
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
    },
    description: [
      {
        title: String,
        content1: String,
        content2: String,
      },
    ],
    // Multi-tenant support
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      // Optimization: Removed redundant single-field index. The compound indexes below starting with 'tenantId' make this one unnecessary.
      // MongoDB can use a compound index to satisfy queries on a prefix of that index.
    },
  },
  {
    timestamps: true,
  }
);

// --- SECURITY MIDDLEWARE: INPUT SANITIZATION ---
// Security: Mongoose 'pre-save' hook to sanitize user-provided string fields.
// This mitigates Stored Cross-Site Scripting (XSS) by removing potentially malicious HTML/script tags before data is persisted.
forumSchema.pre('save', function (next) {
  const sanitizeOptions = {
    allowedTags: [],
    allowedAttributes: {},
  };

  // Sanitize the main title if it has been modified.
  if (this.isModified('title') && this.title) {
    this.title = sanitizeHtml(this.title, sanitizeOptions);
  }

  // Sanitize the description array if it has been modified.
  if (this.isModified('description') && this.description) {
    this.description.forEach(desc => {
      if (desc.title) {
        desc.title = sanitizeHtml(desc.title, sanitizeOptions);
      }
      if (desc.content1) {
        desc.content1 = sanitizeHtml(desc.content1, sanitizeOptions);
      }
      if (desc.content2) {
        desc.content2 = sanitizeHtml(desc.content2, sanitizeOptions);
      }
    });
  }

  next();
});

// --- PERFORMANCE OPTIMIZATIONS: INDEXES ---
// Compound index for tenant-specific author queries (highly common in multi-tenant dashboards/statistics)
forumSchema.index({ tenantId: 1, author: 1 });

// Compound index for tenant-specific category filtering (e.g., loading forum categories per tenant)
forumSchema.index({ tenantId: 1, category: 1 });

// Single-field index for author queries (e.g., global admin checking cross-user statistics or user profile posts)
forumSchema.index({ author: 1 });

// Single-field index for category queries
forumSchema.index({ category: 1 });

// Compound index for sorting posts by creation date within a tenant (common for feed pagination)
forumSchema.index({ tenantId: 1, createdAt: -1 });

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