import { PubSub } from '@google-cloud/pubsub';
import mongoose from 'mongoose';

// Instantiate a Pub/Sub client.
// Ensure GOOGLE_APPLICATION_CREDENTIALS is set in the environment for authentication.
const pubSubClient = new PubSub();

// Define the topic name for triggering file processing.
// It's best practice to use an environment variable for this configuration.
const KNOWLEDGE_FILE_PROCESSING_TOPIC =
  process.env.KNOWLEDGE_FILE_PROCESSING_TOPIC ||
  'knowledge-file-processing-trigger';

/**
 * @typedef {object} KnowledgeBankFileSchema
 * @property {string} fileName - The unique name of the file in storage (e.g., UUID).
 * @property {string} originalName - The original name of the file as uploaded by the user.
 * @property {string} fileType - The MIME type or file extension (e.g., 'pdf', 'docx', 'image/jpeg').
 * @property {number} fileSize - The size of the file in bytes.
 * @property {string} gcsUrl - The public URL of the file in Google Cloud Storage.
 * @property {string} gcsPath - The path to the file within the GCS bucket.
 * @property {string} gcsBucket - The name of the GCS bucket where the file is stored. Defaults to 'inso_knowledge_bank_files'.
 * @property {mongoose.Types.ObjectId} userId - The ID of the user who owns this file. References the 'User' model.
 * @property {mongoose.Types.ObjectId | null} folderId - The ID of the folder this file belongs to. Null if in the root. References the 'KnowledgeBankFolder' model.
 * @property {string} [documentId] - The ID assigned to the document by the RAG system after processing. Sparse index allows null.
 * @property {string} [title] - A user-friendly title for the document, often derived from the original name.
 * @property {number} chunkCount - The number of chunks generated for this document by the RAG system. Defaults to 0.
 * @property {boolean} isProcessed - Indicates whether the file has been successfully processed for RAG. Defaults to false.
 * @property {'pending'|'processing'|'completed'|'failed'} processingStatus - The current status of the file's processing for RAG. Defaults to 'pending'.
 * @property {string} [processingError] - Stores any error message if processing fails.
 * @property {Date} [processedAt] - The timestamp when the file was successfully processed.
 * @property {boolean} isActive - Indicates if the file is active and visible to the user (soft delete mechanism). Defaults to true.
 * @property {string} [description] - A user-provided description for the file. Max 1000 characters.
 * @property {string[]} tags - An array of tags associated with the file for categorization. Defaults to an empty array.
 * @property {mongoose.Schema.Types.Mixed} metadata - Arbitrary metadata associated with the file. Defaults to an empty object.
 * @property {'web'|'mobile'|'api'|'integration'} uploadSource - The source from which the file was uploaded. Defaults to 'web'.
 * @property {string} [ipAddress] - The IP address from which the file was uploaded.
 * @property {mongoose.Types.ObjectId | null} tenantId - The ID of the tenant this file belongs to, for multi-tenancy. References the 'Tenant' model.
 * @property {Date} createdAt - The timestamp when the file record was created.
 * @property {Date} updatedAt - The timestamp when the file record was last updated.
 * @property {string} formattedFileSize - Virtual property: The file size formatted into human-readable units (e.g., "1.23 MB").
 * @property {string} fileExtension - Virtual property: The lowercase file extension derived from `fileType`.
 */

/**
 * Knowledge Bank File Schema
 * Stores user's files in GCP bucket with metadata for processing.
 * This model is designed for general user file storage within the knowledge bank,
 * separate from specific knowledgebot processing queues.
 */
const KnowledgeBankFileSchema = new mongoose.Schema(
  {
    // File identification
    /**
     * The unique name of the file in storage (e.g., UUID).
     * @type {string}
     * @required
     * @trim
     */
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true,
    },
    /**
     * The original name of the file as uploaded by the user.
     * @type {string}
     * @required
     * @trim
     */
    originalName: {
      type: String,
      required: [true, 'Original file name is required'],
      trim: true,
    },
    /**
     * The MIME type or file extension (e.g., 'pdf', 'docx', 'image/jpeg').
     * @type {string}
     * @required
     * @trim
     * @lowercase
     */
    fileType: {
      type: String,
      required: [true, 'File type is required'],
      trim: true,
      lowercase: true,
    },

    // File storage details
    /**
     * The size of the file in bytes.
     * @type {number}
     * @required
     * @min 0
     */
    fileSize: {
      type: Number,
      required: [true, 'File size is required'],
      min: [0, 'File size cannot be negative'],
    },
    /**
     * The public URL of the file in Google Cloud Storage.
     * @type {string}
     * @required
     * @trim
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
     * @trim
     */
    gcsPath: {
      type: String,
      required: [true, 'GCS path is required'],
      trim: true,
    },
    /**
     * The name of the GCS bucket where the file is stored.
     * Defaults to 'inso_knowledge_bank_files'.
     * @type {string}
     * @required
     * @trim
     * @default 'inso_knowledge_bank_files'
     */
    gcsBucket: {
      type: String,
      required: true,
      trim: true,
      default: 'inso_knowledge_bank_files',
    },

    // User reference
    /**
     * The ID of the user who owns this file.
     * @type {mongoose.Types.ObjectId}
     * @ref 'User'
     * @required
     * @index
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },

    // Folder reference (optional - files can be in root or in folders)
    /**
     * The ID of the folder this file belongs to. Null if in the root.
     * @type {mongoose.Types.ObjectId | null}
     * @ref 'KnowledgeBankFolder'
     * @default null
     * @index
     */
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeBankFolder',
      default: null,
      index: true,
    },

    // Processing details (for RAG system)
    /**
     * The ID assigned to the document by the RAG system after processing.
     * @type {string}
     * @trim
     * @index
     * @sparse
     */
    documentId: {
      type: String,
      trim: true,
      index: true,
      sparse: true, // Allow null/undefined for files not yet processed
    },
    /**
     * A user-friendly title for the document, often derived from the original name.
     * @type {string}
     * @trim
     */
    title: {
      type: String,
      trim: true,
    },
    /**
     * The number of chunks generated for this document by the RAG system.
     * @type {number}
     * @default 0
     * @min 0
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
     * The current status of the file's processing for RAG.
     * @type {'pending'|'processing'|'completed'|'failed'}
     * @enum ['pending', 'processing', 'completed', 'failed']
     * @default 'pending'
     * @index
     */
    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    /**
     * Stores any error message if processing fails.
     * @type {string}
     * @trim
     */
    processingError: {
      type: String,
      trim: true,
    },
    /**
     * The timestamp when the file was successfully processed.
     * @type {Date}
     */
    processedAt: {
      type: Date,
    },

    // Status and metadata
    /**
     * Indicates if the file is active and visible to the user (soft delete mechanism).
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
     * A user-provided description for the file.
     * @type {string}
     * @trim
     * @maxlength 1000
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
     * Arbitrary metadata associated with the file.
     * @type {mongoose.Schema.Types.Mixed}
     * @default {}
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Upload info
    /**
     * The source from which the file was uploaded.
     * @type {'web'|'mobile'|'api'|'integration'}
     * @enum ['web', 'mobile', 'api', 'integration']
     * @default 'web'
     */
    uploadSource: {
      type: String,
      enum: ['web', 'mobile', 'api', 'integration'],
      default: 'web',
    },
    /**
     * The IP address from which the file was uploaded.
     * @type {string}
     * @trim
     */
    ipAddress: {
      type: String,
      trim: true,
    },

    // Multi-tenant support
    /**
     * The ID of the tenant this file belongs to, for multi-tenancy.
     * @type {mongoose.Types.ObjectId | null}
     * @ref 'Tenant'
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
    timestamps: true, // Adds createdAt and updatedAt
    toJSON: {
      virtuals: true,
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

// Compound indexes for efficient queries
/**
 * Index for quickly retrieving a user's active files, sorted by creation date.
 * @index
 */
KnowledgeBankFileSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
/**
 * Index for quickly retrieving a user's active files by file type.
 * @index
 */
KnowledgeBankFileSchema.index({ userId: 1, fileType: 1, isActive: 1 });
/**
 * Index for quickly retrieving a user's files by processing status.
 * @index
 */
KnowledgeBankFileSchema.index({ userId: 1, processingStatus: 1 });
/**
 * Index for quickly retrieving a user's active files within a specific folder.
 * @index
 */
KnowledgeBankFileSchema.index({ userId: 1, folderId: 1, isActive: 1 });
/**
 * Sparse index for the document ID, allowing efficient lookup for processed documents.
 * @index
 * @sparse
 */
KnowledgeBankFileSchema.index({ documentId: 1 }, { sparse: true });

// OPTIMIZATION: Compound index for covered queries when calculating total storage size.
// This allows MongoDB to calculate the sum of fileSize directly from the index without loading documents from disk.
KnowledgeBankFileSchema.index({ userId: 1, isActive: 1, fileSize: 1 });

// OPTIMIZATION: Compound index for filtering user files by processing status.
KnowledgeBankFileSchema.index({ userId: 1, isProcessed: 1, isActive: 1 });

// OPTIMIZATION: Compound indexes for multi-tenant isolation queries.
KnowledgeBankFileSchema.index({ tenantId: 1, isActive: 1 });
KnowledgeBankFileSchema.index({ tenantId: 1, userId: 1, isActive: 1 });

/**
 * Virtual property to get the file size formatted into human-readable units (e.g., "1.23 MB").
 * @member {string} formattedFileSize
 * @memberof KnowledgeBankFileSchema
 * @instance
 */
KnowledgeBankFileSchema.virtual('formattedFileSize').get(function () {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

/**
 * Virtual property to get the lowercase file extension derived from `fileType`.
 * @member {string} fileExtension
 * @memberof KnowledgeBankFileSchema
 * @instance
 */
KnowledgeBankFileSchema.virtual('fileExtension').get(function () {
  return this.fileType.toLowerCase();
});

/**
 * Static method to find a user's files with optional filters.
 * @param {mongoose.Types.ObjectId} userId - The ID of the user.
 * @param {object} [options] - Optional filtering and pagination options.
 * @param {string} [options.fileType] - Filter by file type.
 * @param {'pending'|'processing'|'completed'|'failed'} [options.processingStatus] - Filter by processing status.
 * @param {boolean} [options.isProcessed] - Filter by processing status (true/false).
 * @param {mongoose.Types.ObjectId | null} [options.folderId] - Filter by folder ID (null for root).
 * @param {number} [options.limit=100] - Maximum number of files to return.
 * @param {number} [options.skip=0] - Number of files to skip for pagination.
 * @param {boolean} [options.lean=true] - OPTIMIZATION: Return plain JS objects instead of heavy Mongoose documents. Defaults to true for performance.
 * @returns {Promise<Array<KnowledgeBankFileSchema>>} A promise that resolves to an array of KnowledgeBankFile documents.
 * @static
 */
KnowledgeBankFileSchema.statics.findByUserId = async function (
  userId,
  options = {}
) {
  const query = { userId, isActive: true };

  // Add optional filters
  if (options.fileType) {
    query.fileType = options.fileType;
  }
  if (options.processingStatus) {
    query.processingStatus = options.processingStatus;
  }
  if (options.isProcessed !== undefined) {
    query.isProcessed = options.isProcessed;
  }
  if (options.folderId !== undefined) {
    query.folderId = options.folderId;
  }

  const queryBuilder = this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0);

  // OPTIMIZATION: Use lean queries by default for massive performance gains in read operations.
  // Allow overriding for cases where Mongoose documents are needed (e.g., to use instance methods).
  if (options.lean !== false) {
    queryBuilder.lean();
  }

  return queryBuilder;
};

/**
 * Static method to count a user's files.
 * @param {mongoose.Types.ObjectId} userId - The ID of the user.
 * @param {boolean} [activeOnly=true] - If true, only counts active files.
 * @returns {Promise<number>} A promise that resolves to the count of files.
 * @static
 */
KnowledgeBankFileSchema.statics.countByUserId = async function (
  userId,
  activeOnly = true
) {
  const query = { userId };
  if (activeOnly) {
    query.isActive = true;
  }
  // OPTIMIZATION: countDocuments utilizes index-only scans when matched with compound indexes
  return this.countDocuments(query);
};

/**
 * Static method to get the total storage used by a user in bytes.
 * @param {mongoose.Types.ObjectId} userId - The ID of the user.
 * @param {boolean} [activeOnly=true] - If true, only sums sizes of active files.
 * @returns {Promise<number>} A promise that resolves to the total storage size in bytes.
 * @static
 */
KnowledgeBankFileSchema.statics.getTotalStorageByUserId = async function (
  userId,
  activeOnly = true
) {
  const query = { userId };
  if (activeOnly) {
    query.isActive = true;
  }

  // OPTIMIZATION: This aggregation is fully covered by the { userId: 1, isActive: 1, fileSize: 1 } index
  const result = await this.aggregate([
    { $match: query },
    { $group: { _id: null, totalSize: { $sum: '$fileSize' } } },
  ]);

  return result.length > 0 ? result[0].totalSize : 0;
};

/**
 * Instance method to mark a file as successfully processed.
 * Updates `isProcessed`, `processingStatus`, `documentId`, `chunkCount`, `title`, and `processedAt`.
 * @param {string} documentId - The ID assigned to the document by the RAG system.
 * @param {number} [chunkCount=0] - The number of chunks generated for the document.
 * @param {string} [title] - An optional title for the processed document. Defaults to `originalName`.
 * @returns {Promise<KnowledgeBankFileSchema>} A promise that resolves to the updated KnowledgeBankFile document.
 * @instance
 */
KnowledgeBankFileSchema.methods.markAsProcessed = async function (
  documentId,
  chunkCount,
  title
) {
  this.isProcessed = true;
  this.processingStatus = 'completed';
  this.documentId = documentId;
  this.chunkCount = chunkCount || 0;
  this.title = title || this.originalName;
  this.processedAt = new Date();
  return this.save();
};

/**
 * Instance method to mark a file's processing as failed.
 * Updates `processingStatus` to 'failed' and stores the error message.
 * @param {Error | string} error - The error object or message describing the failure.
 * @returns {Promise<KnowledgeBankFileSchema>} A promise that resolves to the updated KnowledgeBankFile document.
 * @instance
 */
KnowledgeBankFileSchema.methods.markProcessingFailed = async function (error) {
  this.processingStatus = 'failed';
  this.processingError = error.toString().substring(0, 500);
  return this.save();
};

/**
 * Instance method to soft delete a file by setting `isActive` to false.
 * @returns {Promise<KnowledgeBankFileSchema>} A promise that resolves to the updated KnowledgeBankFile document.
 * @instance
 */
KnowledgeBankFileSchema.methods.softDelete = async function () {
  this.isActive = false;
  return this.save();
};

/**
 * Pre-save middleware to set the `processingStatus` for new documents
 * and a temporary flag to trigger the post-save hook.
 * @param {function} next - The next middleware function.
 * @private
 */
KnowledgeBankFileSchema.pre('save', function (next) {
  if (this.isNew) {
    this.processingStatus = 'pending';
    // Set a temporary, non-persistent flag to indicate this is a new document.
    // This flag will be used in the post-save hook to trigger the async job.
    this._wasNew = true;
  }
  next();
});

/**
 * Post-save middleware to trigger asynchronous processing for new files.
 * When a new KnowledgeBankFile is created, this hook publishes a message
 * to a GCP Pub/Sub topic. A separate worker service will subscribe to this
 * topic to handle the heavy processing (e.g., for RAG), ensuring the main
 * application remains stateless and responsive.
 * @param {KnowledgeBankFileSchema} doc - The saved document.
 * @private
 */
KnowledgeBankFileSchema.post('save', async function (doc) {
  // The `_wasNew` flag is set in the pre-save hook.
  // This ensures we only trigger processing for newly created files.
  if (this._wasNew && doc.processingStatus === 'pending') {
    console.log(
      `New file created (ID: ${doc._id}), publishing job to Pub/Sub topic: ${KNOWLEDGE_FILE_PROCESSING_TOPIC}`
    );

    try {
      // The message payload only needs the ID. The worker will fetch the full details from the DB.
      // Including tenantId and userId can be useful for routing or logging in the worker.
      const messagePayload = {
        knowledgeBankFileId: doc._id.toString(),
        tenantId: doc.tenantId ? doc.tenantId.toString() : null,
        userId: doc.userId.toString(),
      };
      const dataBuffer = Buffer.from(JSON.stringify(messagePayload));

      // Publish the message to the Pub/Sub topic.
      const messageId = await pubSubClient
        .topic(KNOWLEDGE_FILE_PROCESSING_TOPIC)
        .publishMessage({ data: dataBuffer });

      console.log(
        `Successfully published message ${messageId} for file ${doc._id}.`
      );
    } catch (error) {
      // Log the error, but do not throw it, as this would break the API flow.
      // The save operation has already succeeded.
      // A separate monitoring/retry mechanism should handle publishing failures,
      // or a cron job could scan for 'pending' files that haven't been processed.
      console.error(
        `CRITICAL: Failed to publish processing message for file ${doc._id} to Pub/Sub. Manual intervention may be required.`,
        error
      );
    }
  }
});

/**
 * Represents a file stored in the Knowledge Bank.
 * @class KnowledgeBankFile
 * @augments {mongoose.Model<KnowledgeBankFileSchema>}
 */
const KnowledgeBankFile = mongoose.model(
  'KnowledgeBankFile',
  KnowledgeBankFileSchema
);

export default KnowledgeBankFile;