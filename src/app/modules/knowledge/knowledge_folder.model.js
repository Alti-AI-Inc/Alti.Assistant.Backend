import mongoose from 'mongoose';
import { FOLDER_COLORS } from './knowledge.constant.js';

/**
 * Knowledge Folder Schema
 * Supports hierarchical folder structure for user files
 */
const KnowledgeFolderSchema = new mongoose.Schema(
  {
    // Folder identification
    name: {
      type: String,
      required: [true, 'Folder name is required'],
      trim: true,
      maxlength: [100, 'Folder name cannot exceed 100 characters'],
    },

    // Owner (only users can have folders, not bots)
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      index: true,
    },

    // Parent folder for nested structure
    parentFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeFolder',
      default: null,
      index: true,
    },

    // Folder path for navigation
    path: {
      type: String,
      trim: true,
      default: '/',
    },

    // Metadata
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    color: {
      type: String,
      trim: true,
      default: FOLDER_COLORS[0],
    },
    icon: {
      type: String,
      trim: true,
      default: 'folder',
    },
    tags: {
      type: [String],
      default: [],
    },

    // Statistics
    fileCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    subfolderCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSize: {
      type: Number,
      default: 0,
      min: 0,
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
KnowledgeFolderSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
KnowledgeFolderSchema.index({ userId: 1, parentFolderId: 1, isActive: 1 });
KnowledgeFolderSchema.index({ userId: 1, path: 1 });
KnowledgeFolderSchema.index({ userId: 1, name: 1, parentFolderId: 1 });

// Virtual for formatted total size
KnowledgeFolderSchema.virtual('formattedTotalSize').get(function () {
  const bytes = this.totalSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

// Virtual for depth level
KnowledgeFolderSchema.virtual('depth').get(function () {
  return this.path.split('/').filter(p => p).length;
});

// Static methods
KnowledgeFolderSchema.statics.findByUserId = async function (userId, options = {}) {
  const query = { userId, isActive: true };

  if (options.parentFolderId !== undefined) {
    query.parentFolderId = options.parentFolderId;
  }

  return this.find(query)
    .sort({ name: 1 })
    .limit(options.limit || 1000)
    .skip(options.skip || 0);
};

KnowledgeFolderSchema.statics.findRootFolders = async function (userId) {
  return this.find({
    userId,
    parentFolderId: null,
    isActive: true,
  }).sort({ name: 1 });
};

KnowledgeFolderSchema.statics.findSubfolders = async function (parentFolderId, userId) {
  return this.find({
    userId,
    parentFolderId,
    isActive: true,
  }).sort({ name: 1 });
};

KnowledgeFolderSchema.statics.nameExistsInParent = async function (userId, name, parentFolderId) {
  const count = await this.countDocuments({
    userId,
    name,
    parentFolderId: parentFolderId || null,
    isActive: true,
  });
  return count > 0;
};

KnowledgeFolderSchema.statics.getFolderWithAncestors = async function (folderId, userId) {
  const folder = await this.findOne({ _id: folderId, userId, isActive: true });
  if (!folder) return null;

  const ancestors = [];
  let currentFolder = folder;

  while (currentFolder.parentFolderId) {
    const parent = await this.findById(currentFolder.parentFolderId);
    if (!parent) break;
    ancestors.unshift(parent);
    currentFolder = parent;
  }

  const breadcrumb = ancestors.map(a => a.name).concat([folder.name]).join(' > ');

  return {
    folder,
    ancestors,
    breadcrumb,
  };
};

// Instance methods
KnowledgeFolderSchema.methods.updateStats = async function (fileCountDelta = 0, sizeDelta = 0) {
  this.fileCount = Math.max(0, this.fileCount + fileCountDelta);
  this.totalSize = Math.max(0, this.totalSize + sizeDelta);
  return this.save();
};

KnowledgeFolderSchema.methods.softDelete = async function () {
  this.isActive = false;
  this.deletedAt = new Date();
  return this.save();
};

// Pre-save hook to update path
KnowledgeFolderSchema.pre('save', async function (next) {
  if (this.isNew || this.isModified('parentFolderId') || this.isModified('name')) {
    if (!this.parentFolderId) {
      this.path = `/${this.name}`;
    } else {
      const parent = await this.constructor.findById(this.parentFolderId);
      if (parent) {
        this.path = `${parent.path}/${this.name}`;
      }
    }
  }
  next();
});

const KnowledgeFolder = mongoose.model('KnowledgeFolder', KnowledgeFolderSchema);
export default KnowledgeFolder;
