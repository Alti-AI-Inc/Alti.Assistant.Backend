import mongoose from 'mongoose';
import {
  OWNER_TYPES,
  PROCESSING_STATUS,
  FILE_VISIBILITY,
} from './knowledge.constant.js';

/**
 * Unified Knowledge File Schema
 * Supports both user files (Knowledge Bank) and bot files (Knowledge Base)
 */
const KnowledgeFileSchema = new mongoose.Schema(
  {
    // File identification
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true,
    },
    originalName: {
      type: String,
      required: [true, 'Original file name is required'],
      trim: true,
    },
    fileType: {
      type: String,
      required: [true, 'File type is required'],
      trim: true,
      lowercase: true,
    },

    // Storage details
    fileSize: {
      type: Number,
      required: [true, 'File size is required'],
      min: [0, 'File size cannot be negative'],
    },
    gcsUrl: {
      type: String,
      required: [true, 'GCS URL is required'],
      trim: true,
    },
    gcsPath: {
      type: String,
      required: [true, 'GCS path is required'],
      trim: true,
    },
    gcsBucket: {
      type: String,
      required: true,
      trim: true,
      default: 'alti_assistant_knowledge_bot_files',
    },

    // Unified ownership
    ownerType: {
      type: String,
      enum: Object.values(OWNER_TYPES),
      required: [true, 'Owner type is required'],
      index: true,
    },
    ownerId: {
      type: String,
      required: [true, 'Owner ID is required'],
      index: true,
    },

    // Folder support (for user files)
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeFolder',
      default: null,
      index: true,
    },

    // RAG Processing
    documentId: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    title: {
      type: String,
      trim: true,
    },
    chunkCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isProcessed: {
      type: Boolean,
      default: false,
      index: true,
    },
    processingStatus: {
      type: String,
      enum: Object.values(PROCESSING_STATUS),
      default: PROCESSING_STATUS.PENDING,
      index: true,
    },
    processingError: {
      type: String,
      trim: true,
    },
    processedAt: {
      type: Date,
    },

    // Metadata
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    tags: {
      type: [String],
      default: [],
    },
    visibility: {
      type: String,
      enum: Object.values(FILE_VISIBILITY),
      default: FILE_VISIBILITY.PRIVATE,
    },
    sharedWith: {
      type: [String],
      default: [],
    },

    // Upload context
    uploadSource: {
      type: String,
      trim: true,
      default: 'web',
    },
    ipAddress: {
      type: String,
      trim: true,
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    deletedAt: {
      type: Date,
    },

    // Additional metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Multi-tenant support
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

// Compound indexes
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
KnowledgeFileSchema.index({ documentId: 1 }, { sparse: true });

// Virtual for formatted file size
KnowledgeFileSchema.virtual('formattedFileSize').get(function () {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

// Static methods
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

  if (options.fileType) query.fileType = options.fileType;
  if (options.processingStatus)
    query.processingStatus = options.processingStatus;
  if (options.isProcessed !== undefined)
    query.isProcessed = options.isProcessed;
  if (options.folderId !== undefined) query.folderId = options.folderId;

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0);
};

KnowledgeFileSchema.statics.countByOwner = async function (
  ownerType,
  ownerId,
  activeOnly = true
) {
  const query = { ownerType, ownerId };
  if (activeOnly) query.isActive = true;
  return this.countDocuments(query);
};

KnowledgeFileSchema.statics.getTotalStorageByOwner = async function (
  ownerType,
  ownerId,
  activeOnly = true
) {
  const query = { ownerType, ownerId };
  if (activeOnly) query.isActive = true;

  const result = await this.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: '$fileSize' } } },
  ]);

  return result.length > 0 ? result[0].total : 0;
};

// Instance methods
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

KnowledgeFileSchema.methods.markProcessingFailed = async function (error) {
  this.processingStatus = PROCESSING_STATUS.FAILED;
  this.processingError = error?.message || 'Unknown error';
  this.isProcessed = false;
  return this.save();
};

KnowledgeFileSchema.methods.softDelete = async function () {
  this.isActive = false;
  this.deletedAt = new Date();
  return this.save();
};

const KnowledgeFile = mongoose.model('KnowledgeFile', KnowledgeFileSchema);
export default KnowledgeFile;
