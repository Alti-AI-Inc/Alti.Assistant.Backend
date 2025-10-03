import mongoose from 'mongoose';

const KnowledgeBaseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Knowledge base name is required'],
      trim: true,
      maxlength: [100, 'Knowledge base name cannot exceed 100 characters'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    documentsCount: {
      type: Number,
      default: 0,
    },
    totalFileSize: {
      type: Number,
      default: 0, // in bytes
    },
    settings: {
      maxDocuments: {
        type: Number,
        default: 1000,
      },
      maxFileSize: {
        type: Number,
        default: 10 * 1024 * 1024, // 10MB default
      },
      allowedFileTypes: {
        type: [String],
        default: ['pdf', 'txt', 'doc', 'docx', 'html', 'md'],
      },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for efficient queries
KnowledgeBaseSchema.index({ userId: 1, name: 1 });
KnowledgeBaseSchema.index({ userId: 1, isActive: 1 });

// Virtual for formatted file size
KnowledgeBaseSchema.virtual('formattedFileSize').get(function () {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (this.totalFileSize === 0) return '0 Bytes';
  const i = parseInt(Math.floor(Math.log(this.totalFileSize) / Math.log(1024)));
  return Math.round(this.totalFileSize / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
});

// Instance method to check if can add more documents
KnowledgeBaseSchema.methods.canAddDocument = function (fileSize = 0) {
  return this.documentsCount < this.settings.maxDocuments &&
    (this.totalFileSize + fileSize) <= this.settings.maxFileSize;
};

// Static method to find user's knowledge bases
KnowledgeBaseSchema.statics.findByUserId = function (userId, isActive = true) {
  return this.find({ userId, isActive }).sort({ updatedAt: -1 });
};

const KnowledgeBase = mongoose.model('KnowledgeBase', KnowledgeBaseSchema);

export default KnowledgeBase;