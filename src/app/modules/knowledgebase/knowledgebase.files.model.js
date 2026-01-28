import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    fileType: {
      type: String,
      required: true,
      trim: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    gcsUrl: {
      type: String,
      required: true,
      trim: true,
    },
    gcsPath: {
      type: String,
      required: true,
      trim: true,
    },
    documentId: {
      type: String,
      required: true,
      trim: true,
    },
    knowledgebotId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
    },
    chunkCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
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
    toObject: {
      virtuals: true,
    },
  }
);

// Indexes for faster queries
fileSchema.index({ knowledgebotId: 1, isActive: 1 });
fileSchema.index({ userId: 1, isActive: 1 });
fileSchema.index({ createdAt: -1 });

// Virtual for formatted file size
fileSchema.virtual('formattedFileSize').get(function () {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
});

// Static method to find files by knowledgebotId
fileSchema.statics.findByKnowledgebotId = async function (knowledgebotId, activeOnly = true) {
  const query = { knowledgebotId };
  if (activeOnly) {
    query.isActive = true;
  }
  return this.find(query).sort({ createdAt: -1 });
};

// Static method to find files by userId
fileSchema.statics.findByUserId = async function (userId, activeOnly = true) {
  const query = { userId };
  if (activeOnly) {
    query.isActive = true;
  }
  return this.find(query).sort({ createdAt: -1 });
};

// Static method to find files by both userId and knowledgebotId
fileSchema.statics.findByUserAndKnowledgebot = async function (userId, knowledgebotId, activeOnly = true) {
  const query = { userId, knowledgebotId };
  if (activeOnly) {
    query.isActive = true;
  }
  return this.find(query).sort({ createdAt: -1 });
};

// Instance method to soft delete
fileSchema.methods.softDelete = async function () {
  this.isActive = false;
  return this.save();
};

const KnowledgebaseFile = mongoose.model('KnowledgebaseFile', fileSchema);

export default KnowledgebaseFile;
