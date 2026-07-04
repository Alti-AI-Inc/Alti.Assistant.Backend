import mongoose from 'mongoose';
import {
  OWNER_TYPES,
  PROCESSING_STATUS,
  FILE_VISIBILITY,
} from './knowledge.constant.js';

/**
 * @typedef {object} KnowledgeFileSchemaProperties
 * @property {string} fileName - The name of the file as stored in the system.
 * @property {string} originalName - The original name of the file before upload.
 * @property {string} fileType - The MIME type or extension of the file (e.g., 'pdf', 'docx', 'txt').
 * @property {number} fileSize - The size of the file in bytes.
 * @property {string} gcsUrl - The Google Cloud Storage URL for accessing the file.
 * @property {string} gcsPath - The path to the file within the GCS bucket.
 * @property {string} gcsBucket - The name of the GCS bucket where the file is stored.
 * @property {OWNER_TYPES} ownerType - The type of entity that owns this file (e.g., 'USER', 'BOT').
 * @property {string} ownerId - The ID of the owner (e.g., user ID, bot ID).
 * @property {mongoose.Types.ObjectId|null} folderId - The ID of the folder this file belongs to, if any. References 'KnowledgeFolder'.
 * @property {string} [documentId] - The ID assigned to the document by the RAG processing system (e.g., Pinecone, Weaviate).
 * @property {string} [title] - An extracted or user-provided title for the document content.
 * @property {number} chunkCount - The number of chunks generated from the document for RAG processing.
 * @property {boolean} isProcessed - Indicates whether the file has been successfully processed for RAG.
 * @property {PROCESSING_STATUS} processingStatus - The current status of the RAG processing pipeline.
 * @property {string} [processingError] - Any error message encountered during RAG processing.
 * @property {Date} [processedAt] - The timestamp when the file was last successfully processed.
 * @property {string} [description] - A brief description of the file's content.
 * @property {string[]} tags - An array of tags associated with the file for categorization.
 * @property {FILE_VISIBILITY} visibility - The visibility setting of the file (e.g., 'PRIVATE', 'PUBLIC', 'SHARED').
 * @property {string[]} sharedWith - An array of user IDs or group IDs with whom the file is shared.
 * @property {string} uploadSource - The source from which the file was uploaded (e.g., 'web', 'api', 'integration').
 * @property {string} [ipAddress] - The IP address from which the file was uploaded.
 * @property {boolean} isActive - Indicates if the file is currently active and not soft-deleted.
 * @property {Date} [deletedAt] - The timestamp when the file was soft-deleted.
 * @property {object} metadata - A mixed type field for storing additional arbitrary metadata.
 * @property {mongoose.Types.ObjectId|null} tenantId - The ID of the tenant this file belongs to, for multi-tenancy. References 'Tenant'.
 * @property {Date} createdAt - The timestamp when the file record was created.
 * @property {Date} updatedAt - The timestamp when the file record was last updated.
 */

/**
 * Unified Knowledge File Schema
 * Supports both user files (Knowledge Bank) and bot files (Knowledge Base).
 * This schema defines the structure for storing metadata and processing status
 * for various types of knowledge files within the system.
 *
 * @class KnowledgeFile
 * @augments {mongoose.Schema}
 */
const KnowledgeFileSchema = new mongoose.Schema(
  {
    // File identification
    /**
     * The name of the file as stored in the system.
     * @type {string}
     * @required
     */
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true,
    },
    /**
     * The original name of the file before upload.
     * @type {string}
     * @required
     */
    originalName: {
      type: String,
      required: [true, 'Original file name is required'],
      trim: true,
    },
    /**
     * The MIME type or extension of the file (e.g., 'pdf', 'docx', 'txt').
     * @type {string}
     * @required
     */
    fileType: {
      type: String,
      required: [true, 'File type is required'],
      trim: true,
      lowercase: true,
    },

    // Storage details
    /**
     * The size of the file in bytes.
     * @type {number}
     * @required
     */
    fileSize: {
      type: Number,
      required: [true, 'File size is required'],
      min: [0, 'File size cannot be negative'],
    },
    /**
     * The Google Cloud Storage URL for accessing the file.
     * @type {string}
     * @required
     */
    gcsUrl: {
      type: String,
      required: [true, 'GCS URL is required'],
      trim: true,
    },
    /**
     * The path to the file within the GCS bucket.
     * @type {string}
     * @required
     */
    gcsPath: {
      type: String,
      required: [true, 'GCS path is required'],
      trim: true,
    },
    /**
     * The name of the GCS bucket where the file is stored.
     * @type {string}
     * @required
     * @default 'alti_assistant_knowledge_bot_files'
     */
    gcsBucket: {
      type: String,
      required: true,
      trim: true,
      default: 'alti_assistant_knowledge_bot_files',
    },

    // Unified ownership
    /**
     * The type of entity that owns this file (e.g., 'USER', 'BOT').
     * @type {OWNER_TYPES}
     * @required
     * @index
     */
    ownerType: {
      type: String,
      enum: Object.values(OWNER_TYPES),
      required: [true, 'Owner type is required'],
      index: true,
    },
    /**
     * The ID of the owner (e.g., user ID, bot ID).
     * @type {string}
     * @required
     * @index
     */
    ownerId: {
      type: String,
      required: [true, 'Owner ID is required'],
      index: true,
    },

    // Folder support (for user files)
    /**
     * The ID of the folder this file belongs to, if any.
     * References the 'KnowledgeFolder' model.
     * @type {mongoose.Types.ObjectId|null}
     * @default null
     * @index
     */
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeFolder',
      default: null,
      index: true,
    },

    // RAG Processing
    /**
     * The ID assigned to the document by the RAG processing system (e.g., Pinecone, Weaviate).
     * @type {string}
     */
    documentId: {
      type: String,
      trim: true,
    },
    /**
     * An extracted or user-provided title for the document content.
     * @type {string}
     */
    title: {
      type: String,
      trim: true,
    },
    /**
     * The number of chunks generated from the document for RAG processing.
     * @type {number}
     * @default 0
     */
    chunkCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    /**
     * Indicates whether the file has been successfully processed for RAG.
     * @type {boolean}
     * @default false
     * @index
     */
    isProcessed: {
      type: Boolean,
      default: false,
      index: true,
    },
    /**
     * The current status of the RAG processing pipeline.
     * @type {PROCESSING_STATUS}
     * @default PROCESSING_STATUS.PENDING
     * @index
     */
    processingStatus: {
      type: String,
      enum: Object.values(PROCESSING_STATUS),
      default: PROCESSING_STATUS.PENDING,
      index: true,
    },
    /**
     * Any error message encountered during RAG processing.
     * @type {string}
     */
    processingError: {
      type: String,
      trim: true,
    },
    /**
     * The timestamp when the file was last successfully processed.
     * @type {Date}
     */
    processedAt: {
      type: Date,
    },

    // Metadata
    /**
     * A brief description of the file's content.
     * @type {string}
     */
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    /**
     * An array of tags associated with the file for categorization.
     * @type {string[]}
     * @default []
     */
    tags: {
      type: [String],
      default: [],
    },
    /**
     * The visibility setting of the file (e.g., 'PRIVATE', 'PUBLIC', 'SHARED').
     * @type {FILE_VISIBILITY}
     * @default FILE_VISIBILITY.PRIVATE
     */
    visibility: {
      type: String,
      enum: Object.values(FILE_VISIBILITY),
      default: FILE_VISIBILITY.PRIVATE,
    },
    /**
     * An array of user IDs or group IDs with whom the file is shared.
     * @type {string[]}
     * @default []
     */
    sharedWith: {
      type: [String],
      default: [],
    },

    // Upload context
    /**
     * The source from which the file was uploaded (e.g., 'web', 'api', 'integration').
     * @type {string}
     * @default 'web'
     */
    uploadSource: {
      type: String,
      trim: true,
      default: 'web',
    },
    /**
     * The IP address from which the file was uploaded.
     * @type {string}
     */
    ipAddress: {
      type: String,
      trim: true,
    },

    // Status
    /**
     * Indicates if the file is currently active and not soft-deleted.
     * @type {boolean}
     * @default true
     * @index
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    /**
     * The timestamp when the file was soft-deleted.
     * @type {Date}
     */
    deletedAt: {
      type: Date,
    },

    // Additional metadata
    /**
     * A mixed type field for storing additional arbitrary metadata.
     * @type {mongoose.Schema.Types.Mixed}
     * @default {}
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Multi-tenant support
    /**
     * The ID of the tenant this file belongs to, for multi-tenancy.
     * References the 'Tenant' model.
     * @type {mongoose.Types.ObjectId|null}
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
    timestamps: true,
    toJSON: {
      virtuals: true,
      /**
       * Transforms the document when converting to JSON, adding an 'id' virtual and removing '_id' and '__v'.
       * @param {object} doc - The Mongoose document.
       * @param {object} ret - The plain object representation.
       * @returns {object} The transformed object.
       */
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

/**
 * Compound indexes for multi-tenant production efficiency.
 * These indexes optimize queries that filter by tenant, owner, and status.
 */
KnowledgeFileSchema.index({
  tenantId: 1,
  ownerType: 1,
  ownerId: 1,
  isActive: 1,
  createdAt: -1,
});
KnowledgeFileSchema.index({
  tenantId: 1,
  ownerType: 1,
  ownerId: 1,
  folderId: 1,
  isActive: 1,
});
KnowledgeFileSchema.index({
  tenantId: 1,
  ownerType: 1,
  ownerId: 1,
  fileType: 1,
  isActive: 1,
});
KnowledgeFileSchema.index({ tenantId: 1, ownerType: 1, ownerId: 1, processingStatus: 1 });

/**
 * Indexes optimized for tenant-wide statistics and manager/admin dashboards.
 * Supports covered queries for calculating total storage and file counts.
 */
KnowledgeFileSchema.index({ tenantId: 1, isActive: 1, fileSize: 1 });
KnowledgeFileSchema.index({ tenantId: 1, isActive: 1, createdAt: -1 });

/**
 * Legacy fallback indexes (retained for direct cross-tenant or admin queries).
 * These indexes support queries that might not include tenantId.
 */
KnowledgeFileSchema.index({
  ownerType: 1,
  ownerId: 1,
  isActive: 1,
  createdAt: -1,
});
KnowledgeFileSchema.index({
  ownerType: 1,
  ownerId: 1,
  folderId: 1,
  isActive: 1,
});
KnowledgeFileSchema.index({
  ownerType: 1,
  ownerId: 1,
  fileType: 1,
  isActive: 1,
});
KnowledgeFileSchema.index({ ownerType: 1, ownerId: 1, processingStatus: 1 });
/**
 * Index for the documentId, allowing efficient lookup of RAG processed documents.
 * Sparse index ensures it only indexes documents that have a documentId.
 */
KnowledgeFileSchema.index({ documentId: 1 }, { sparse: true });

/**
 * Virtual property to get the file size in a human-readable format (e.g., "1.23 MB").
 * @member {string} formattedFileSize
 * @memberof KnowledgeFile
 * @instance
 */
KnowledgeFileSchema.virtual('formattedFileSize').get(function () {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

// Static methods
/**
 * Finds knowledge files by owner type and ID, with optional filtering.
 *
 * @static
 * @param {OWNER_TYPES} ownerType - The type of the owner (e.g., 'USER', 'BOT').
 * @param {string} ownerId - The ID of the owner.
 * @param {object} [options={}] - Optional query parameters.
 * @param {string} [options.tenantId] - Filter by tenant ID for multi-tenancy.
 * @param {string} [options.fileType] - Filter by file type.
 * @param {PROCESSING_STATUS} [options.processingStatus] - Filter by processing status.
 * @param {boolean} [options.isProcessed] - Filter by processing completion status.
 * @param {mongoose.Types.ObjectId|null} [options.folderId] - Filter by folder ID. Use `null` to find files not in any folder.
 * @param {number} [options.limit=100] - The maximum number of documents to return.
 * @param {number} [options.skip=0] - The number of documents to skip.
 * @param {boolean} [options.lean=true] - Whether to return plain JavaScript objects instead of Mongoose documents.
 * @returns {Promise<KnowledgeFileSchemaProperties[]>} A promise that resolves to an array of knowledge file documents.
 */
KnowledgeFileSchema.statics.findByOwner = async function (
  ownerType,
  ownerId,
  options = {}
) {
  const query = {
    ownerType,
    ownerId,
    isActive: true,
  };

  if (options.tenantId) query.tenantId = options.tenantId;
  if (options.fileType) query.fileType = options.fileType;
  if (options.processingStatus)
    query.processingStatus = options.processingStatus;
  if (options.isProcessed !== undefined)
    query.isProcessed = options.isProcessed;
  if (options.folderId !== undefined) query.folderId = options.folderId;

  const queryChain = this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0);

  // Use lean by default for high performance, but allow opting out if full documents are needed
  if (options.lean !== false) {
    queryChain.lean();
  }

  return queryChain;
};

/**
 * Counts the number of knowledge files for a given owner.
 *
 * @static
 * @param {OWNER_TYPES} ownerType - The type of the owner.
 * @param {string} ownerId - The ID of the owner.
 * @param {boolean} [activeOnly=true] - If true, only counts active files.
 * @param {mongoose.Types.ObjectId|string|null} [tenantId=null] - Optional tenant ID to leverage multi-tenant indexes.
 * @returns {Promise<number>} A promise that resolves to the count of knowledge files.
 */
KnowledgeFileSchema.statics.countByOwner = async function (
  ownerType,
  ownerId,
  activeOnly = true,
  tenantId = null
) {
  const query = { ownerType, ownerId };
  if (tenantId) query.tenantId = tenantId;
  if (activeOnly) query.isActive = true;
  return this.countDocuments(query);
};

/**
 * Calculates the total storage size (in bytes) used by an owner's knowledge files.
 *
 * @static
 * @param {OWNER_TYPES} ownerType - The type of the owner.
 * @param {string} ownerId - The ID of the owner.
 * @param {boolean} [activeOnly=true] - If true, only sums sizes of active files.
 * @param {mongoose.Types.ObjectId|string|null} [tenantId=null] - Optional tenant ID to leverage multi-tenant indexes.
 * @returns {Promise<number>} A promise that resolves to the total storage size in bytes.
 */
KnowledgeFileSchema.statics.getTotalStorageByOwner = async function (
  ownerType,
  ownerId,
  activeOnly = true,
  tenantId = null
) {
  const query = { ownerType, ownerId };
  if (tenantId) query.tenantId = tenantId;
  if (activeOnly) query.isActive = true;

  const result = await this.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: '$fileSize' } } },
  ]);

  return result.length > 0 ? result[0].total : 0;
};

/**
 * Counts the number of knowledge files for a given tenant (workspace).
 * Essential for enforcing subscription plan limits on the number of documents.
 *
 * @static
 * @param {mongoose.Types.ObjectId|string} tenantId - The ID of the tenant.
 * @param {boolean} [activeOnly=true] - If true, only counts active files.
 * @returns {Promise<number>} A promise that resolves to the count of knowledge files for the tenant.
 */
KnowledgeFileSchema.statics.countByTenant = async function (
  tenantId,
  activeOnly = true
) {
  const query = { tenantId };
  if (activeOnly) query.isActive = true;
  return this.countDocuments(query);
};

/**
 * Calculates the total storage size (in bytes) used by a tenant (workspace).
 * Crucial for billing calculations and enforcing storage limits based on subscription plans.
 *
 * @static
 * @param {mongoose.Types.ObjectId|string} tenantId - The ID of the tenant.
 * @param {boolean} [activeOnly=true] - If true, only sums sizes of active files.
 * @returns {Promise<number>} A promise that resolves to the total storage size in bytes for the tenant.
 */
KnowledgeFileSchema.statics.getTotalStorageByTenant = async function (
  tenantId,
  activeOnly = true
) {
  const query = { tenantId };
  if (activeOnly) query.isActive = true;

  const result = await this.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: '$fileSize' } } },
  ]);

  return result.length > 0 ? result[0].total : 0;
};

// Instance methods
/**
 * Marks the knowledge file as successfully processed for RAG.
 * Updates documentId, chunkCount, title, processing status, and processedAt timestamp.
 *
 * @memberof KnowledgeFile
 * @instance
 * @param {string} documentId - The ID assigned to the document by the RAG processing system.
 * @param {number} chunkCount - The number of chunks generated from the document.
 * @param {string} title - The extracted or user-provided title for the document content.
 * @returns {Promise<KnowledgeFileSchemaProperties>} A promise that resolves to the updated knowledge file document.
 */
KnowledgeFileSchema.methods.markAsProcessed = async function (
  documentId,
  chunkCount,
  title
) {
  this.documentId = documentId;
  this.chunkCount = chunkCount;
  this.title = title;
  this.isProcessed = true;
  this.processingStatus = PROCESSING_STATUS.COMPLETED;
  this.processedAt = new Date();
  this.processingError = null;
  return this.save();
};

/**
 * Marks the knowledge file's processing as failed.
 * Updates processing status to FAILED, records the error, and sets isProcessed to false.
 *
 * @memberof KnowledgeFile
 * @instance
 * @param {Error|object} error - The error object or a string describing the failure.
 * @returns {Promise<KnowledgeFileSchemaProperties>} A promise that resolves to the updated knowledge file document.
 */
KnowledgeFileSchema.methods.markProcessingFailed = async function (error) {
  this.processingStatus = PROCESSING_STATUS.FAILED;
  this.processingError = error?.message || 'Unknown error';
  this.isProcessed = false;
  return this.save();
};

/**
 * Soft deletes the knowledge file by setting `isActive` to `false` and `deletedAt` to the current date.
 *
 * @memberof KnowledgeFile
 * @instance
 * @returns {Promise<KnowledgeFileSchemaProperties>} A promise that resolves to the updated knowledge file document.
 */
KnowledgeFileSchema.methods.softDelete = async function () {
  this.isActive = false;
  this.deletedAt = new Date();
  return this.save();
};

/**
 * Represents a Knowledge File in the database.
 * This model interacts with the 'knowledgefiles' collection.
 *
 * @typedef {mongoose.Model<KnowledgeFileSchemaProperties>} KnowledgeFile
 */
const KnowledgeFile = mongoose.model('KnowledgeFile', KnowledgeFileSchema);
export default KnowledgeFile;