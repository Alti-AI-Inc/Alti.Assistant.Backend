import mongoose from 'mongoose';

/**
 * @file Defines the Mongoose schema and model for Knowledge Bank Folders.
 * @module models/KnowledgeBankFolder
 * @author Your Name/Organization
 * @description This model represents a folder within a user's knowledge bank, supporting nested structures
 *              and various metadata for organization and management.
 */

/**
 * Knowledge Bank Folder Schema
 * Supports nested folders for organizing user files, tracking statistics, and managing access.
 *
 * @typedef {object} KnowledgeBankFolderSchema
 * @property {string} name - The name of the folder. Required, trimmed, max 100 characters.
 * @property {mongoose.Schema.Types.ObjectId} userId - The ID of the user who owns this folder. Required, indexed, references 'User'.
 * @property {mongoose.Schema.Types.ObjectId} [parentFolderId=null] - The ID of the parent folder, if this is a subfolder. Indexed, references 'KnowledgeBankFolder'.
 * @property {string} [path='/'] - The full path of the folder (e.g., "/Documents/Work/Projects"). Trimmed, defaults to '/'.
 * @property {string} [description] - A brief description of the folder. Trimmed, max 500 characters.
 * @property {string} [color='#1890ff'] - A color associated with the folder for UI representation. Trimmed, defaults to a blue hex code.
 * @property {string} [icon='folder'] - An icon name associated with the folder for UI representation. Trimmed, defaults to 'folder'.
 * @property {boolean} [isActive=true] - Indicates if the folder is active (not soft-deleted). Indexed, defaults to true.
 * @property {number} [fileCount=0] - The number of files directly within this folder. Defaults to 0, minimum 0.
 * @property {number} [subfolderCount=0] - The number of subfolders directly within this folder. Defaults to 0, minimum 0.
 * @property {number} [totalSize=0] - The total size of all files within this folder and its subfolders, in bytes. Defaults to 0, minimum 0.
 * @property {string[]} [tags=[]] - An array of tags associated with the folder. Defaults to an empty array.
 * @property {mongoose.Schema.Types.Mixed} [metadata={}] - Flexible field for additional metadata. Defaults to an empty object.
 * @property {mongoose.Schema.Types.ObjectId} [tenantId=null] - The ID of the tenant this folder belongs to (for multi-tenant systems). Indexed, references 'Tenant'.
 * @property {Date} createdAt - Timestamp of when the folder was created.
 * @property {Date} updatedAt - Timestamp of when the folder was last updated.
 */
const KnowledgeBankFolderSchema = new mongoose.Schema(
  {
    /**
     * The name of the folder.
     * @type {string}
     * @required
     * @trim
     * @maxlength 100
     */
    name: {
      type: String,
      required: [true, 'Folder name is required'],
      trim: true,
      maxlength: [100, 'Folder name cannot exceed 100 characters'],
    },

    /**
     * The ID of the user who owns this folder.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @required
     * @index
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },

    /**
     * The ID of the parent folder. Null if this is a root folder.
     * @type {mongoose.Schema.Types.ObjectId|null}
     * @ref KnowledgeBankFolder
     * @default null
     * @index
     */
    parentFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeBankFolder',
      default: null,
      index: true,
    },

    /**
     * The full path of the folder, e.g., "/Documents/Work/Projects".
     * @type {string}
     * @trim
     * @default '/'
     */
    path: {
      type: String,
      trim: true,
      default: '/',
    },

    /**
     * A brief description of the folder.
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
     * A color associated with the folder for UI representation.
     * @type {string}
     * @trim
     * @default '#1890ff' (default blue color)
     */
    color: {
      type: String,
      trim: true,
      default: '#1890ff', // Default blue color
    },

    /**
     * An icon name associated with the folder for UI representation.
     * @type {string}
     * @trim
     * @default 'folder'
     */
    icon: {
      type: String,
      trim: true,
      default: 'folder',
    },

    /**
     * Indicates if the folder is active (not soft-deleted).
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
     * The number of files directly contained within this folder.
     * @type {number}
     * @default 0
     * @min 0
     */
    fileCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * The number of subfolders directly contained within this folder.
     * @type {number}
     * @default 0
     * @min 0
     */
    subfolderCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * The total size of all files within this folder and its subfolders, in bytes.
     * @type {number}
     * @default 0
     * @min 0
     */
    totalSize: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * An array of tags associated with the folder.
     * @type {string[]}
     * @default []
     */
    tags: {
      type: [String],
      default: [],
    },

    /**
     * Flexible field for additional metadata, stored as a mixed type.
     * @type {mongoose.Schema.Types.Mixed}
     * @default {}
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /**
     * The ID of the tenant this folder belongs to (for multi-tenant systems).
     * @type {mongoose.Schema.Types.ObjectId|null}
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
     * Mongoose timestamps option. Adds `createdAt` and `updatedAt` fields.
     * @type {boolean}
     */
    timestamps: true,
    /**
     * Mongoose toJSON option. Configures how documents are transformed when `toJSON()` is called.
     * @property {boolean} virtuals - Include virtuals in JSON output.
     * @property {function(object, object): object} transform - Custom transformation function.
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
     * Mongoose toObject option. Configures how documents are transformed when `toObject()` is called.
     * @property {boolean} virtuals - Include virtuals in object output.
     */
    toObject: { virtuals: true },
  }
);

// Compound indexes for efficient queries

/**
 * Index for querying user's active folders, sorted by creation date.
 * @index { userId: 1, isActive: 1, createdAt: -1 }
 */
KnowledgeBankFolderSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
/**
 * Index for querying user's active folders within a specific parent.
 * @index { userId: 1, parentFolderId: 1, isActive: 1 }
 */
KnowledgeBankFolderSchema.index({ userId: 1, parentFolderId: 1, isActive: 1 });
/**
 * Index for querying user's folders by their full path.
 * @index { userId: 1, path: 1 }
 */
KnowledgeBankFolderSchema.index({ userId: 1, path: 1 });
/**
 * Index to ensure unique folder names within the same parent folder for a given user.
 * @index { userId: 1, name: 1, parentFolderId: 1 }
 */
KnowledgeBankFolderSchema.index({ userId: 1, name: 1, parentFolderId: 1 }); // Unique folder names within parent

/**
 * Virtual property to get the total size of the folder's contents in a human-readable format (e.g., "1.23 MB").
 * @member {string} formattedTotalSize
 * @returns {string} The formatted total size.
 */
KnowledgeBankFolderSchema.virtual('formattedTotalSize').get(function () {
  const bytes = this.totalSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

/**
 * Virtual property to get the depth level of the folder based on its path.
 * A root folder (e.g., "/Folder") has depth 1.
 * @member {number} depth
 * @returns {number} The depth level of the folder.
 */
KnowledgeBankFolderSchema.virtual('depth').get(function () {
  return this.path.split('/').filter((p) => p).length;
});

/**
 * Static method to find active folders for a specific user.
 *
 * @static
 * @param {mongoose.Schema.Types.ObjectId} userId - The ID of the user.
 * @param {object} [options={}] - Options for filtering and pagination.
 * @param {mongoose.Schema.Types.ObjectId|null} [options.parentFolderId] - Optional parent folder ID to filter by.
 * @param {number} [options.limit=1000] - Maximum number of folders to return.
 * @param {number} [options.skip=0] - Number of folders to skip for pagination.
 * @returns {Promise<KnowledgeBankFolder[]>} A promise that resolves to an array of KnowledgeBankFolder documents.
 */
KnowledgeBankFolderSchema.statics.findByUserId = async function (
  userId,
  options = {}
) {
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

/**
 * Static method to find all active root folders (folders with no parent) for a specific user.
 *
 * @static
 * @param {mongoose.Schema.Types.ObjectId} userId - The ID of the user.
 * @returns {Promise<KnowledgeBankFolder[]>} A promise that resolves to an array of root KnowledgeBankFolder documents.
 */
KnowledgeBankFolderSchema.statics.findRootFolders = async function (userId) {
  return this.find({
    userId,
    parentFolderId: null,
    isActive: true,
  }).sort({ name: 1 });
};

/**
 * Static method to find all active subfolders directly within a given parent folder for a specific user.
 *
 * @static
 * @param {mongoose.Schema.Types.ObjectId} parentFolderId - The ID of the parent folder.
 * @param {mongoose.Schema.Types.ObjectId} userId - The ID of the user.
 * @returns {Promise<KnowledgeBankFolder[]>} A promise that resolves to an array of subfolder KnowledgeBankFolder documents.
 */
KnowledgeBankFolderSchema.statics.findSubfolders = async function (
  parentFolderId,
  userId
) {
  return this.find({
    userId,
    parentFolderId: parentFolderId,
    isActive: true,
  }).sort({ name: 1 });
};

/**
 * Static method to check if a folder with a given name already exists within a specific parent folder (or as a root folder) for a user.
 *
 * @static
 * @param {mongoose.Schema.Types.ObjectId} userId - The ID of the user.
 * @param {string} name - The name of the folder to check.
 * @param {mongoose.Schema.Types.ObjectId|null} parentFolderId - The ID of the parent folder, or null for root folders.
 * @returns {Promise<boolean>} A promise that resolves to true if a folder with the name exists, false otherwise.
 */
KnowledgeBankFolderSchema.statics.nameExistsInParent = async function (
  userId,
  name,
  parentFolderId
) {
  return this.exists({
    userId,
    name,
    parentFolderId: parentFolderId || null,
    isActive: true,
  });
};

/**
 * Static method to retrieve a folder along with its entire lineage of ancestors and a breadcrumb trail.
 *
 * @static
 * @param {mongoose.Schema.Types.ObjectId} folderId - The ID of the target folder.
 * @param {mongoose.Schema.Types.ObjectId} userId - The ID of the user who owns the folder.
 * @returns {Promise<{folder: KnowledgeBankFolder, ancestors: KnowledgeBankFolder[], breadcrumb: {id: mongoose.Schema.Types.ObjectId, name: string}[]}|null>}
 *          A promise that resolves to an object containing the folder, its ancestors, and a breadcrumb array, or null if the folder is not found.
 */
KnowledgeBankFolderSchema.statics.getFolderWithAncestors = async function (
  folderId,
  userId
) {
  const folder = await this.findOne({ _id: folderId, userId, isActive: true });
  if (!folder) return null;

  const ancestors = [];
  let currentFolder = folder;

  while (currentFolder.parentFolderId) {
    const parent = await this.findOne({
      _id: currentFolder.parentFolderId,
      userId,
      isActive: true,
    });
    if (!parent) break; // Parent not found or inactive, stop
    ancestors.unshift(parent); // Add to the beginning to maintain order from root to parent
    currentFolder = parent;
  }

  return {
    folder,
    ancestors,
    breadcrumb: ancestors
      .map((a) => ({ id: a._id, name: a.name }))
      .concat([{ id: folder._id, name: folder.name }]),
  };
};

/**
 * Instance method to update the file count and total size statistics for the current folder and recursively for its parent folders.
 *
 * @instance
 * @param {number} [fileCountDelta=0] - The change in file count (e.g., 1 for new file, -1 for deleted file).
 * @param {number} [sizeDelta=0] - The change in total size in bytes (e.g., file size for new file, -file size for deleted file).
 * @returns {Promise<void>} A promise that resolves when the stats are updated and saved.
 */
KnowledgeBankFolderSchema.methods.updateStats = async function (
  fileCountDelta = 0,
  sizeDelta = 0
) {
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

/**
 * Instance method to update the subfolder count for the current folder.
 *
 * @instance
 * @param {number} [delta=1] - The change in subfolder count (e.g., 1 for new subfolder, -1 for deleted subfolder).
 * @returns {Promise<void>} A promise that resolves when the subfolder count is updated and saved.
 */
KnowledgeBankFolderSchema.methods.updateSubfolderCount = async function (
  delta = 1
) {
  this.subfolderCount = Math.max(0, this.subfolderCount + delta);
  await this.save();
};

/**
 * Instance method to soft delete the folder by setting its `isActive` status to false.
 * Also decrements the parent folder's subfolder count if applicable.
 *
 * @instance
 * @returns {Promise<void>} A promise that resolves when the folder is soft-deleted.
 */
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

/**
 * Instance method to build or rebuild the full path of the folder based on its name and parent's path.
 *
 * @instance
 * @returns {Promise<string>} A promise that resolves to the newly built path.
 */
KnowledgeBankFolderSchema.methods.buildPath = async function () {
  if (!this.parentFolderId) {
    this.path = `/${this.name}`;
    return this.path;
  }

  const parent = await this.constructor.findById(this.parentFolderId);
  if (!parent) {
    // If parent is not found, treat as a root folder for pathing purposes
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

/**
 * Mongoose pre-save middleware.
 * Automatically builds or updates the folder's `path` if it's a new document or if `name` or `parentFolderId` has been modified.
 *
 * @param {function} next - The next middleware function.
 * @returns {Promise<void>}
 */
KnowledgeBankFolderSchema.pre('save', async function (next) {
  if (
    this.isNew ||
    this.isModified('name') ||
    this.isModified('parentFolderId')
  ) {
    await this.buildPath();
  }
  next();
});

/**
 * Mongoose post-save middleware.
 * If a new folder is created and has a parent, it increments the parent folder's `subfolderCount`.
 *
 * @param {KnowledgeBankFolder} doc - The saved document.
 * @returns {Promise<void>}
 */
KnowledgeBankFolderSchema.post('save', async function (doc) {
  if (doc.isNew && doc.parentFolderId) {
    const parent = await doc.constructor.findById(doc.parentFolderId);
    if (parent) {
      await parent.updateSubfolderCount(1);
    }
  }
});

/**
 * Represents a Knowledge Bank Folder.
 * @typedef {mongoose.Model<KnowledgeBankFolderSchema>} KnowledgeBankFolder
 */
const KnowledgeBankFolder = mongoose.model(
  'KnowledgeBankFolder',
  KnowledgeBankFolderSchema
);

export default KnowledgeBankFolder;