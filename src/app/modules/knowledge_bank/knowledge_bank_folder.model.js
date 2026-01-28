import mongoose from 'mongoose';

/**
 * Knowledge Bank Folder Schema
 * Supports nested folders for organizing user files
 */
const KnowledgeBankFolderSchema = new mongoose.Schema(
  {
    // Folder identification
    name: {
      type: String,
      required: [true, 'Folder name is required'],
      trim: true,
      maxlength: [100, 'Folder name cannot exceed 100 characters'],
    },

    // User reference
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },

    // Parent folder for nested structure
    parentFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeBankFolder',
      default: null,
      index: true,
    },

    // Folder path for easy navigation (e.g., "/Documents/Work/Projects")
    path: {
      type: String,
      trim: true,
      default: '/',
    },

    // Folder metadata
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },

    color: {
      type: String,
      trim: true,
      default: '#1890ff', // Default blue color
    },

    icon: {
      type: String,
      trim: true,
      default: 'folder',
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
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

    // Additional metadata
    tags: {
      type: [String],
      default: [],
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
    toObject: { virtuals: true },
  }
);

// Compound indexes for efficient queries
KnowledgeBankFolderSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
KnowledgeBankFolderSchema.index({ userId: 1, parentFolderId: 1, isActive: 1 });
KnowledgeBankFolderSchema.index({ userId: 1, path: 1 });
KnowledgeBankFolderSchema.index({ userId: 1, name: 1, parentFolderId: 1 }); // Unique folder names within parent

// Virtual for formatted total size
KnowledgeBankFolderSchema.virtual('formattedTotalSize').get(function () {
  const bytes = this.totalSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

// Virtual for depth level (number of slashes in path)
KnowledgeBankFolderSchema.virtual('depth').get(function () {
  return this.path.split('/').filter(p => p).length;
});

// Static method to find user's folders
KnowledgeBankFolderSchema.statics.findByUserId = async function (userId, options = {}) {
  const query = { userId, isActive: true };

  // Filter by parent folder
  if (options.parentFolderId !== undefined) {
    query.parentFolderId = options.parentFolderId;
  }

  return this.find(query)
    .sort({ name: 1 })
    .limit(options.limit || 1000)
    .skip(options.skip || 0);
};

// Static method to find root folders (no parent)
KnowledgeBankFolderSchema.statics.findRootFolders = async function (userId) {
  return this.find({
    userId,
    parentFolderId: null,
    isActive: true
  }).sort({ name: 1 });
};

// Static method to find subfolders
KnowledgeBankFolderSchema.statics.findSubfolders = async function (parentFolderId, userId) {
  return this.find({
    userId,
    parentFolderId: parentFolderId,
    isActive: true
  }).sort({ name: 1 });
};

// Static method to check if folder name exists in parent
KnowledgeBankFolderSchema.statics.nameExistsInParent = async function (userId, name, parentFolderId) {
  return this.exists({
    userId,
    name,
    parentFolderId: parentFolderId || null,
    isActive: true
  });
};

// Static method to get folder with all ancestors
KnowledgeBankFolderSchema.statics.getFolderWithAncestors = async function (folderId, userId) {
  const folder = await this.findOne({ _id: folderId, userId, isActive: true });
  if (!folder) return null;

  const ancestors = [];
  let currentFolder = folder;

  while (currentFolder.parentFolderId) {
    const parent = await this.findOne({
      _id: currentFolder.parentFolderId,
      userId,
      isActive: true
    });
    if (!parent) break;
    ancestors.unshift(parent);
    currentFolder = parent;
  }

  return {
    folder,
    ancestors,
    breadcrumb: ancestors.map(a => ({ id: a._id, name: a.name }))
      .concat([{ id: folder._id, name: folder.name }])
  };
};

// Instance method to update statistics
KnowledgeBankFolderSchema.methods.updateStats = async function (fileCountDelta = 0, sizeDelta = 0) {
  this.fileCount = Math.max(0, this.fileCount + fileCountDelta);
  this.totalSize = Math.max(0, this.totalSize + sizeDelta);
  await this.save();

  // Update parent folder stats recursively
  if (this.parentFolderId) {
    const parent = await this.constructor.findById(this.parentFolderId);
    if (parent) {
      await parent.updateStats(fileCountDelta, sizeDelta);
    }
  }
};

// Instance method to update subfolder count
KnowledgeBankFolderSchema.methods.updateSubfolderCount = async function (delta = 1) {
  this.subfolderCount = Math.max(0, this.subfolderCount + delta);
  await this.save();
};

// Instance method to soft delete
KnowledgeBankFolderSchema.methods.softDelete = async function () {
  this.isActive = false;
  await this.save();

  // Update parent subfolder count
  if (this.parentFolderId) {
    const parent = await this.constructor.findById(this.parentFolderId);
    if (parent) {
      await parent.updateSubfolderCount(-1);
    }
  }
};

// Instance method to build full path
KnowledgeBankFolderSchema.methods.buildPath = async function () {
  if (!this.parentFolderId) {
    this.path = `/${this.name}`;
    return this.path;
  }

  const parent = await this.constructor.findById(this.parentFolderId);
  if (!parent) {
    this.path = `/${this.name}`;
    return this.path;
  }

  if (!parent.path || parent.path === '/') {
    this.path = `/${parent.name}/${this.name}`;
  } else {
    this.path = `${parent.path}/${this.name}`;
  }

  return this.path;
};

// Pre-save middleware to build path
KnowledgeBankFolderSchema.pre('save', async function (next) {
  if (this.isNew || this.isModified('name') || this.isModified('parentFolderId')) {
    await this.buildPath();
  }
  next();
});

// Post-save middleware to update parent subfolder count
KnowledgeBankFolderSchema.post('save', async function (doc) {
  if (doc.isNew && doc.parentFolderId) {
    const parent = await doc.constructor.findById(doc.parentFolderId);
    if (parent) {
      await parent.updateSubfolderCount(1);
    }
  }
});

const KnowledgeBankFolder = mongoose.model('KnowledgeBankFolder', KnowledgeBankFolderSchema);

export default KnowledgeBankFolder;
