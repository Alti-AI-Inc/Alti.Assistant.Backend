import mongoose from 'mongoose';

/**
 * Knowledge Bank File Schema
 * Stores user's files in GCP bucket with metadata for processing
 * This is separate from knowledgebot - knowledge bank is for general user file storage
 */
const KnowledgeBankFileSchema = new mongoose.Schema(
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

    // File storage details
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
      default: 'alti_knowledge_bank_files',
    },

    // User reference
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },

    // Folder reference (optional - files can be in root or in folders)
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeBankFolder',
      default: null,
      index: true,
    },

    // Processing details (for RAG system)
    documentId: {
      type: String,
      trim: true,
      index: true,
      sparse: true, // Allow null/undefined for files not yet processed
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
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    processingError: {
      type: String,
      trim: true,
    },
    processedAt: {
      type: Date,
    },

    // Status and metadata
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    tags: {
      type: [String],
      default: [],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Upload info
    uploadSource: {
      type: String,
      enum: ['web', 'mobile', 'api', 'integration'],
      default: 'web',
    },
    ipAddress: {
      type: String,
      trim: true,
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
KnowledgeBankFileSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
KnowledgeBankFileSchema.index({ userId: 1, fileType: 1, isActive: 1 });
KnowledgeBankFileSchema.index({ userId: 1, processingStatus: 1 });
KnowledgeBankFileSchema.index({ userId: 1, folderId: 1, isActive: 1 });
KnowledgeBankFileSchema.index({ documentId: 1 }, { sparse: true });

// Virtual for formatted file size
KnowledgeBankFileSchema.virtual('formattedFileSize').get(function () {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

// Virtual for file extension
KnowledgeBankFileSchema.virtual('fileExtension').get(function () {
  return this.fileType.toLowerCase();
});

// Static method to find user's files
KnowledgeBankFileSchema.statics.findByUserId = async function (userId, options = {}) {
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

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0);
};

// Static method to count user's files
KnowledgeBankFileSchema.statics.countByUserId = async function (userId, activeOnly = true) {
  const query = { userId };
  if (activeOnly) {
    query.isActive = true;
  }
  return this.countDocuments(query);
};

// Static method to get total storage used by user
KnowledgeBankFileSchema.statics.getTotalStorageByUserId = async function (userId, activeOnly = true) {
  const query = { userId };
  if (activeOnly) {
    query.isActive = true;
  }

  const result = await this.aggregate([
    { $match: query },
    { $group: { _id: null, totalSize: { $sum: '$fileSize' } } }
  ]);

  return result.length > 0 ? result[0].totalSize : 0;
};

// Instance method to mark as processed
KnowledgeBankFileSchema.methods.markAsProcessed = async function (documentId, chunkCount, title) {
  this.isProcessed = true;
  this.processingStatus = 'completed';
  this.documentId = documentId;
  this.chunkCount = chunkCount || 0;
  this.title = title || this.originalName;
  this.processedAt = new Date();
  return this.save();
};

// Instance method to mark processing as failed
KnowledgeBankFileSchema.methods.markProcessingFailed = async function (error) {
  this.processingStatus = 'failed';
  this.processingError = error.toString().substring(0, 500);
  return this.save();
};

// Instance method to soft delete
KnowledgeBankFileSchema.methods.softDelete = async function () {
  this.isActive = false;
  return this.save();
};

// Pre-save middleware to set processing status
KnowledgeBankFileSchema.pre('save', function (next) {
  if (this.isNew) {
    this.processingStatus = 'pending';
  }
  next();
});

const KnowledgeBankFile = mongoose.model('KnowledgeBankFile', KnowledgeBankFileSchema);

export default KnowledgeBankFile;
