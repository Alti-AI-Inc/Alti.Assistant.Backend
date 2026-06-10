/**
 * @file Defines the Mongoose schema and model for a Knowledge Base.
 * This module provides the data structure and methods for interacting with knowledge base documents
 * in the MongoDB database, including multi-tenancy support, document limits, and file size tracking.
 * @module models/knowledgebase
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} KnowledgeBaseSettings
 * @property {number} [maxDocuments=1000] - The maximum number of documents allowed in the knowledge base.
 * @property {number} [maxFileSize=10485760] - The maximum total file size allowed in the knowledge base, in bytes (default 10MB).
 * @property {string[]} [allowedFileTypes=['pdf', 'txt', 'doc', 'docx', 'html', 'md']] - An array of allowed file extensions.
 */

/**
 * @typedef {object} KnowledgeBaseDocument
 * @property {string} name - The name of the knowledge base.
 * @property {mongoose.Types.ObjectId} userId - The ID of the user who owns this knowledge base.
 * @property {string} [description] - A brief description of the knowledge base.
 * @property {boolean} [isActive=true] - Indicates if the knowledge base is active.
 * @property {number} [documentsCount=0] - The current number of documents in the knowledge base.
 * @property {number} [totalFileSize=0] - The total size of all documents in the knowledge base, in bytes.
 * @property {KnowledgeBaseSettings} [settings] - Configuration settings for the knowledge base.
 * @property {mongoose.Schema.Types.Mixed} [metadata] - Arbitrary metadata associated with the knowledge base.
 * @property {mongoose.Types.ObjectId} [tenantId] - The ID of the tenant this knowledge base belongs to (for multi-tenancy).
 * @property {Date} createdAt - The timestamp when the knowledge base was created.
 * @property {Date} updatedAt - The timestamp when the knowledge base was last updated.
 * @property {string} formattedFileSize - Virtual property: Human-readable string representation of `totalFileSize`.
 *
 * @method canAddDocument - Instance method to check if a new document can be added.
 * @static findByUserId - Static method to find knowledge bases by user ID.
 */

/**
 * Mongoose Schema for the Knowledge Base model.
 * Defines the structure and validation rules for knowledge base documents,
 * including fields for name, user, description, activity status, document counts,
 * file sizes, configurable settings, metadata, and multi-tenant support.
 *
 * @type {mongoose.Schema<KnowledgeBaseDocument>}
 */
const KnowledgeBaseSchema = new mongoose.Schema(
  {
    /**
     * The name of the knowledge base.
     * @type {string}
     * @required
     * @trim
     * @maxlength 100
     */
    name: {
      type: String,
      required: [true, 'Knowledge base name is required'],
      trim: true,
      maxlength: [100, 'Knowledge base name cannot exceed 100 characters'],
    },
    /**
     * The ID of the user who owns this knowledge base.
     * References the 'User' model.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @required
     * @index
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /**
     * A brief description of the knowledge base.
     * @type {string}
     * @trim
     * @maxlength 500
     */
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    /**
     * Indicates if the knowledge base is active.
     * @type {boolean}
     * @default true
     */
    isActive: {
      type: Boolean,
      default: true,
    },
    /**
     * The current number of documents stored in the knowledge base.
     * @type {number}
     * @default 0
     */
    documentsCount: {
      type: Number,
      default: 0,
    },
    /**
     * The total size of all documents in the knowledge base, in bytes.
     * @type {number}
     * @default 0
     */
    totalFileSize: {
      type: Number,
      default: 0, // in bytes
    },
    /**
     * Configuration settings for the knowledge base, such as limits and allowed file types.
     * @type {KnowledgeBaseSettings}
     */
    settings: {
      /**
       * The maximum number of documents allowed in the knowledge base.
       * @type {number}
       * @default 1000
       */
      maxDocuments: {
        type: Number,
        default: 1000,
      },
      /**
       * The maximum total file size allowed in the knowledge base, in bytes.
       * @type {number}
       * @default 10485760 (10MB)
       */
      maxFileSize: {
        type: Number,
        default: 10 * 1024 * 1024, // 10MB default
      },
      /**
       * An array of allowed file extensions (e.g., 'pdf', 'txt').
       * @type {string[]}
       * @default ['pdf', 'txt', 'doc', 'docx', 'html', 'md']
       */
      allowedFileTypes: {
        type: [String],
        default: ['pdf', 'txt', 'doc', 'docx', 'html', 'md'],
      },
    },
    /**
     * Arbitrary metadata associated with the knowledge base.
     * Can store any valid BSON type.
     * @type {mongoose.Schema.Types.Mixed}
     * @default {}
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /**
     * The ID of the tenant this knowledge base belongs to.
     * Used for multi-tenancy support. References the 'Tenant' model.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Tenant
     * @default null
     * @index
     */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
  },
  {
    /**
     * Mongoose schema options.
     * @property {boolean} timestamps - Automatically adds `createdAt` and `updatedAt` fields.
     * @property {object} toJSON - Options for `toJSON` transformation, enables virtuals.
     * @property {object} toObject - Options for `toObject` transformation, enables virtuals.
     */
    timestamps: true, // adds createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Defines compound indexes for efficient queries, especially in multi-tenant environments.
 * - `tenantId`, `userId`, `name`: For quickly finding a specific knowledge base by name within a tenant and user.
 * - `tenantId`, `userId`, `isActive`: For filtering active knowledge bases for a user within a tenant.
 */
KnowledgeBaseSchema.index({ tenantId: 1, userId: 1, name: 1 });
KnowledgeBaseSchema.index({ tenantId: 1, userId: 1, isActive: 1 });

/**
 * Defines legacy fallback indexes.
 * These are retained for backward compatibility or scenarios where direct cross-tenant queries might be needed.
 * - `userId`, `name`: For finding a specific knowledge base by name for a user (without tenant context).
 * - `userId`, `isActive`: For filtering active knowledge bases for a user (without tenant context).
 */
KnowledgeBaseSchema.index({ userId: 1, name: 1 });
KnowledgeBaseSchema.index({ userId: 1, isActive: 1 });

/**
 * Virtual property `formattedFileSize`.
 * Converts the `totalFileSize` (in bytes) into a human-readable string (e.g., "10.24 MB").
 * This virtual property is not stored in the database but is computed on demand.
 *
 * @returns {string} The formatted file size string.
 */
KnowledgeBaseSchema.virtual('formattedFileSize').get(function () {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (this.totalFileSize === 0) return '0 Bytes';
  const i = parseInt(Math.floor(Math.log(this.totalFileSize) / Math.log(1024)));
  return (
    Math.round((this.totalFileSize / Math.pow(1024, i)) * 100) / 100 +
    ' ' +
    sizes[i]
  );
});

/**
 * Instance method to check if a new document can be added to the knowledge base.
 * This method verifies if adding a document of a given `fileSize` would exceed
 * the `maxDocuments` count or `maxFileSize` limit configured for the knowledge base.
 *
 * @param {number} [fileSize=0] - The size of the document to be added, in bytes. Defaults to 0 if not provided.
 * @returns {boolean} `true` if a document can be added, `false` otherwise.
 */
KnowledgeBaseSchema.methods.canAddDocument = function (fileSize = 0) {
  return (
    this.documentsCount < this.settings.maxDocuments &&
    this.totalFileSize + fileSize <= this.settings.maxFileSize
  );
};

/**
 * Static method to find knowledge bases associated with a specific user.
 * It returns a Mongoose Query object, allowing for further chaining (e.g., `.populate()`, `.limit()`).
 * Results are sorted by `updatedAt` in descending order.
 *
 * @param {mongoose.Types.ObjectId} userId - The ID of the user whose knowledge bases are to be retrieved.
 * @param {boolean} [isActive=true] - Optional. If `true`, only active knowledge bases are returned. Defaults to `true`.
 * @returns {mongoose.Query<Array<KnowledgeBaseDocument>, KnowledgeBaseDocument>} A Mongoose Query object.
 */
KnowledgeBaseSchema.statics.findByUserId = function (userId, isActive = true) {
  return this.find({ userId, isActive }).sort({ updatedAt: -1 });
};

/**
 * Mongoose model for a Knowledge Base.
 * Provides an interface for interacting with the 'knowledgebases' collection in MongoDB.
 *
 * @type {mongoose.Model<KnowledgeBaseDocument>}
 */
const KnowledgeBase = mongoose.model('KnowledgeBase', KnowledgeBaseSchema);

export default KnowledgeBase;