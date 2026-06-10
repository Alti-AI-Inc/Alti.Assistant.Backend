import mongoose from 'mongoose';

/**
 * @typedef {object} FileSchema
 * @property {string} fileName - The name of the file as stored (e.g., GCS object name).
 * @property {string} originalName - The original name of the file when uploaded.
 * @property {string} fileType - The MIME type of the file (e.g., 'application/pdf', 'text/plain').
 * @property {number} fileSize - The size of the file in bytes.
 * @property {string} gcsUrl - The public URL of the file in Google Cloud Storage.
 * @property {string} gcsPath - The path to the file in Google Cloud Storage bucket.
 * @property {string} documentId - The ID of the associated document (e.g., from a vector database).
 * @property {string} knowledgebotId - The ID of the knowledge bot this file belongs to.
 * @property {string} userId - The ID of the user who uploaded or owns this file.
 * @property {string} [title] - An optional title for the file.
 * @property {number} [chunkCount=0] - The number of chunks this file has been broken into for processing.
 * @property {boolean} [isActive=true] - Flag indicating if the file is active or soft-deleted.
 * @property {object} [metadata={}] - Arbitrary metadata associated with the file.
 * @property {mongoose.Types.ObjectId} [tenantId=null] - The ID of the tenant this file belongs to, for multi-tenancy.
 * @property {Date} createdAt - The timestamp when the file record was created.
 * @property {Date} updatedAt - The timestamp when the file record was last updated.
 * @property {string} formattedFileSize - Virtual property for human-readable file size.
 */

/**
 * Mongoose schema for a Knowledgebase File.
 * Defines the structure and validation rules for files stored in the knowledge base.
 *
 * @type {mongoose.Schema<FileSchema>}
 */
const fileSchema = new mongoose.Schema(
  {
    /**
     * The name of the file as stored (e.g., GCS object name).
     * @type {string}
     * @required
     * @trim
     */
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * The original name of the file when it was uploaded by the user.
     * @type {string}
     * @required
     * @trim
     */
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * The MIME type of the file (e.g., 'application/pdf', 'text/plain').
     * @type {string}
     * @required
     * @trim
     */
    fileType: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * The size of the file in bytes.
     * @type {number}
     * @required
     */
    fileSize: {
      type: Number,
      required: true,
    },
    /**
     * The public URL of the file in Google Cloud Storage.
     * @type {string}
     * @required
     * @trim
     */
    gcsUrl: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * The path to the file within the Google Cloud Storage bucket.
     * @type {string}
     * @required
     * @trim
     */
    gcsPath: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * The ID of the associated document, typically from a vector database or similar indexing service.
     * @type {string}
     * @required
     * @trim
     */
    documentId: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * The ID of the knowledge bot this file belongs to.
     * @type {string}
     * @required
     * @index
     */
    knowledgebotId: {
      type: String,
      required: true,
      index: true,
    },
    /**
     * The ID of the user who uploaded or owns this file.
     * @type {string}
     * @required
     * @index
     */
    userId: {
      type: String,
      required: true,
      index: true,
    },
    /**
     * An optional title for the file, distinct from its file name.
     * @type {string}
     * @trim
     */
    title: {
      type: String,
      trim: true,
    },
    /**
     * The number of chunks this file has been broken into for processing (e.g., for RAG).
     * @type {number}
     * @default 0
     */
    chunkCount: {
      type: Number,
      default: 0,
    },
    /**
     * Flag indicating if the file is active. Used for soft deletion.
     * @type {boolean}
     * @default true
     */
    isActive: {
      type: Boolean,
      default: true,
    },
    /**
     * Arbitrary metadata associated with the file. Can be any valid JSON object.
     * @type {mongoose.Schema.Types.Mixed}
     * @default {}
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Multi-tenant support
    /**
     * The ID of the tenant this file belongs to. Used for multi-tenancy.
     * References the 'Tenant' model.
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
     * Adds `createdAt` and `updatedAt` timestamps to the schema.
     */
    timestamps: true,
    /**
     * Configuration for `toJSON` transformation.
     * - `virtuals: true`: Includes virtual properties when converting to JSON.
     * - `transform`: Custom transformation function to rename `_id` to `id` and remove `__v`.
     */
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    /**
     * Configuration for `toObject` transformation.
     * - `virtuals: true`: Includes virtual properties when converting to a plain JavaScript object.
     */
    toObject: {
      virtuals: true,
    },
  }
);

/**
 * Indexes for faster queries.
 * Optimized compound indexes to support filtering and sorting without in-memory filesort.
 */
fileSchema.index({ knowledgebotId: 1, isActive: 1, createdAt: -1 });
fileSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
fileSchema.index({ userId: 1, knowledgebotId: 1, isActive: 1, createdAt: -1 });
fileSchema.index({ tenantId: 1, isActive: 1, createdAt: -1 });
fileSchema.index({ createdAt: -1 });

/**
 * Virtual property to get the file size in a human-readable format (e.g., "1.23 MB").
 * @member {string} formattedFileSize
 * @returns {string} The file size formatted with appropriate units.
 */
fileSchema.virtual('formattedFileSize').get(function () {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

/**
 * Static method to find files associated with a specific knowledge bot.
 *
 * @param {string} knowledgebotId - The ID of the knowledge bot.
 * @param {boolean} [activeOnly=true] - If true, only returns active files.
 * @returns {Promise<Array<FileSchema>>} A promise that resolves to an array of file documents.
 */
fileSchema.statics.findByKnowledgebotId = async function (
  knowledgebotId,
  activeOnly = true
) {
  const query = { knowledgebotId };
  if (activeOnly) {
    query.isActive = true;
  }
  return this.find(query).sort({ createdAt: -1 });
};

/**
 * Static method to find files uploaded by a specific user.
 *
 * @param {string} userId - The ID of the user.
 * @param {boolean} [activeOnly=true] - If true, only returns active files.
 * @returns {Promise<Array<FileSchema>>} A promise that resolves to an array of file documents.
 */
fileSchema.statics.findByUserId = async function (userId, activeOnly = true) {
  const query = { userId };
  if (activeOnly) {
    query.isActive = true;
  }
  return this.find(query).sort({ createdAt: -1 });
};

/**
 * Static method to find files associated with both a specific user and a knowledge bot.
 *
 * @param {string} userId - The ID of the user.
 * @param {string} knowledgebotId - The ID of the knowledge bot.
 * @param {boolean} [activeOnly=true] - If true, only returns active files.
 * @returns {Promise<Array<FileSchema>>} A promise that resolves to an array of file documents.
 */
fileSchema.statics.findByUserAndKnowledgebot = async function (
  userId,
  knowledgebotId,
  activeOnly = true
) {
  const query = { userId, knowledgebotId };
  if (activeOnly) {
    query.isActive = true;
  }
  return this.find(query).sort({ createdAt: -1 });
};

/**
 * Instance method to soft delete a file by setting its `isActive` status to `false`.
 *
 * @this {mongoose.Document<FileSchema>}
 * @returns {Promise<mongoose.Document<FileSchema>>} A promise that resolves to the updated file document.
 */
fileSchema.methods.softDelete = async function () {
  this.isActive = false;
  return this.save();
};

/**
 * Mongoose model for a Knowledgebase File.
 * Provides an interface to the `knowledgebasefiles` collection in MongoDB.
 *
 * @type {mongoose.Model<FileSchema>}
 */
const KnowledgebaseFile = mongoose.model('KnowledgebaseFile', fileSchema);

export default KnowledgebaseFile;