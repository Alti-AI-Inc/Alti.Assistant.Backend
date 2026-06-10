import mongoose from 'mongoose';
import { FOLDER_COLORS } from './knowledge.constant.js';

/**
 * @typedef {object} KnowledgeFolderDocument
 * @property {string} _id - The unique identifier for the folder (MongoDB ObjectId).
 * @property {string} name - The name of the knowledge folder.
 * @property {string} userId - The ID of the user who owns this folder.
 * @property {mongoose.Schema.Types.ObjectId | null} parentFolderId - The ID of the parent folder, or null if it's a root folder.
 * @property {string} path - The full path of the folder, e.g., "/RootFolder/SubFolder".
 * @property {string} [description] - An optional description for the folder.
 * @property {string} color - The color associated with the folder, chosen from FOLDER_COLORS.
 * @property {string} icon - The icon associated with the folder.
 * @property {string[]} tags - An array of tags associated with the folder.
 * @property {number} fileCount - The number of files directly within this folder.
 * @property {number} subfolderCount - The number of subfolders directly within this folder.
 * @property {number} totalSize - The total size in bytes of all files within this folder and its subfolders.
 * @property {boolean} isActive - Indicates if the folder is active (not soft-deleted).
 * @property {Date} [deletedAt] - The timestamp when the folder was soft-deleted.
 * @property {object} metadata - A mixed type object for additional custom metadata.
 * @property {mongoose.Schema.Types.ObjectId | null} tenantId - The ID of the tenant this folder belongs to, for multi-tenancy.
 * @property {Date} createdAt - The timestamp when the folder was created.
 * @property {Date} updatedAt - The timestamp when the folder was last updated.
 * @property {string} formattedTotalSize - Virtual property: Human-readable format of totalSize (e.g., "1.23 MB").
 * @property {number} depth - Virtual property: The depth level of the folder in the hierarchy.
 */

/**
 * @typedef {mongoose.Model<KnowledgeFolderDocument> & KnowledgeFolderStatics} KnowledgeFolderModel
 */

/**
 * @typedef {object} KnowledgeFolderStatics
 * @property {function(string, object): Promise<KnowledgeFolderDocument[]>} findByUserId - Finds folders by user ID with optional filtering and pagination.
 * @property {function(string): Promise<KnowledgeFolderDocument[]>} findRootFolders - Finds all root folders for a given user.
 * @property {function(mongoose.Schema.Types.ObjectId, string): Promise<KnowledgeFolderDocument[]>} findSubfolders - Finds all subfolders for a given parent folder and user.
 * @property {function(string, string, mongoose.Schema.Types.ObjectId | null): Promise<boolean>} nameExistsInParent - Checks if a folder with a given name already exists under a specific parent for a user.
 * @property {function(mongoose.Schema.Types.ObjectId, string): Promise<{folder: KnowledgeFolderDocument, ancestors: KnowledgeFolderDocument[], breadcrumb: string} | null>} getFolderWithAncestors - Retrieves a folder along with its ancestors and a breadcrumb string.
 */

/**
 * Knowledge Folder Schema
 *
 * Defines the structure for storing knowledge folders, supporting a hierarchical folder structure
 * for user-specific files and content. Each folder belongs to a user and can optionally
 * have a parent folder, forming a tree-like structure. Includes fields for metadata,
 * statistics, and multi-tenancy.
 *
 * @class KnowledgeFolderSchema
 * @augments mongoose.Schema
 */
const KnowledgeFolderSchema = new mongoose.Schema(
  {
    /**
     * The name of the knowledge folder.
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
     * Only users can own folders, not bots.
     * @type {string}
     * @required
     * @index
     */
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      index: true,
    },

    /**
     * The ID of the parent folder.
     * If null, this folder is a root folder.
     * @type {mongoose.Schema.Types.ObjectId | null}
     * @ref KnowledgeFolder
     * @default null
     * @index
     */
    parentFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeFolder',
      default: null,
      index: true,
    },

    /**
     * The full path of the folder, used for navigation and hierarchy representation.
     * Example: "/RootFolder/SubFolder/MyFolder"
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
     * An optional description for the folder.
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
     * The color associated with the folder, chosen from a predefined list of FOLDER_COLORS.
     * @type {string}
     * @trim
     * @default FOLDER_COLORS[0]
     */
    color: {
      type: String,
      trim: true,
      default: FOLDER_COLORS[0],
    },
    /**
     * The icon associated with the folder.
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
     * An array of tags associated with the folder for categorization and search.
     * @type {string[]}
     * @default []
     */
    tags: {
      type: [String],
      default: [],
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
     * The total size in bytes of all files within this folder and its subfolders.
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
     * Indicates if the folder is currently active.
     * Set to `false` for soft-deleted folders.
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
     * The timestamp when the folder was soft-deleted.
     * Only present if `isActive` is `false`.
     * @type {Date}
     */
    deletedAt: {
      type: Date,
    },

    /**
     * A mixed type object for storing additional, unstructured metadata.
     * @type {object}
     * @default {}
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /**
     * The ID of the tenant this folder belongs to, supporting multi-tenancy.
     * @type {mongoose.Schema.Types.ObjectId | null}
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
     * Mongoose timestamps option.
     * Adds `createdAt` and `updatedAt` fields automatically.
     * @type {boolean}
     */
    timestamps: true,
    /**
     * Mongoose toJSON option.
     * Configures how the document is transformed when `toJSON()` is called.
     * @property {boolean} virtuals - Include virtuals in JSON output.
     * @property {function(object, object): object} transform - Custom transformation function.
     */
    toJSON: {
      virtuals: true,
      /**
       * Transforms the document object for JSON output.
       * Renames `_id` to `id` and removes `_id` and `__v`.
       * @param {mongoose.Document} doc - The original Mongoose document.
       * @param {object} ret - The plain object representation of the document.
       * @returns {object} The transformed object.
       */
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    /**
     * Mongoose toObject option.
     * Configures how the document is transformed when `toObject()` is called.
     * @property {boolean} virtuals - Include virtuals in object output.
     */
    toObject: { virtuals: true },
  }
);

// Compound indexes
/**
 * Compound index for efficient querying of user's active folders, sorted by creation date.
 * @index
 * @property {number} userId - Ascending order.
 * @property {number} isActive - Ascending order.
 * @property {number} createdAt - Descending order.
 */
KnowledgeFolderSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
/**
 * Compound index for efficient querying of user's active folders within a specific parent.
 * @index
 * @property {number} userId - Ascending order.
 * @property {number} parentFolderId - Ascending order.
 * @property {number} isActive - Ascending order.
 */
KnowledgeFolderSchema.index({ userId: 1, parentFolderId: 1, isActive: 1 });
/**
 * Compound index for efficient path-based queries within a user's folders.
 * @index
 * @property {number} userId - Ascending order.
 * @property {number} path - Ascending order.
 */
KnowledgeFolderSchema.index({ userId: 1, path: 1 });
/**
 * Compound index for ensuring unique folder names within a parent folder for a given user,
 * but only for active folders. This allows soft-deleted folders to have duplicate names.
 * @index
 * @property {number} userId - Ascending order.
 * @property {number} name - Ascending order.
 * @property {number} parentFolderId - Ascending order.
 * @property {boolean} unique - Enforces uniqueness.
 * @property {object} partialFilterExpression - Applies uniqueness only when isActive is true.
 */
KnowledgeFolderSchema.index(
  { userId: 1, name: 1, parentFolderId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

// Virtual for formatted total size
/**
 * Virtual property that returns the `totalSize` in a human-readable format (e.g., "1.23 MB").
 * @member {string} formattedTotalSize
 * @memberof KnowledgeFolderDocument
 * @instance
 */
KnowledgeFolderSchema.virtual('formattedTotalSize').get(function () {
  const bytes = this.totalSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

// Virtual for depth level
/**
 * Virtual property that calculates the depth level of the folder in the hierarchy.
 * This implementation counts segments in the path, so '/root/sub' would be 2.
 * A root folder with path '/RootFolder' would have a depth of 1.
 * @member {number} depth
 * @memberof KnowledgeFolderDocument
 * @instance
 */
KnowledgeFolderSchema.virtual('depth').get(function () {
  return this.path.split('/').filter((p) => p).length;
});

// Static methods
/**
 * Finds knowledge folders by user ID, with optional filtering by parent folder and pagination.
 * @memberof KnowledgeFolderModel
 * @static
 * @async
 * @param {string} userId - The ID of the user whose folders to retrieve.
 * @param {object} [options] - Options for filtering and pagination.
 * @param {mongoose.Schema.Types.ObjectId | null} [options.parentFolderId] - Optional parent folder ID to filter by. Use `null` for root folders.
 * @param {number} [options.limit=1000] - The maximum number of folders to return.
 * @param {number} [options.skip=0] - The number of folders to skip for pagination.
 * @returns {Promise<KnowledgeFolderDocument[]>} A promise that resolves to an array of knowledge folder documents.
 */
KnowledgeFolderSchema.statics.findByUserId = async function (
  userId,
  options = {}
) {
  const query = { userId, isActive: true };

  if (options.parentFolderId !== undefined) {
    query.parentFolderId = options.parentFolderId;
  }

  return this.find(query)
    .sort({ name: 1 })
    .limit(options.limit || 1000)
    .skip(options.skip || 0);
};

/**
 * Finds all root knowledge folders (folders with no parent) for a given user.
 * @memberof KnowledgeFolderModel
 * @static
 * @async
 * @param {string} userId - The ID of the user whose root folders to retrieve.
 * @returns {Promise<KnowledgeFolderDocument[]>} A promise that resolves to an array of root knowledge folder documents.
 */
KnowledgeFolderSchema.statics.findRootFolders = async function (userId) {
  return this.find({
    userId,
    parentFolderId: null,
    isActive: true,
  }).sort({ name: 1 });
};

/**
 * Finds all subfolders directly under a specified parent folder for a given user.
 * @memberof KnowledgeFolderModel
 * @static
 * @async
 * @param {mongoose.Schema.Types.ObjectId} parentFolderId - The ID of the parent folder.
 * @param {string} userId - The ID of the user who owns the folders.
 * @returns {Promise<KnowledgeFolderDocument[]>} A promise that resolves to an array of subfolder documents.
 */
KnowledgeFolderSchema.statics.findSubfolders = async function (
  parentFolderId,
  userId
) {
  return this.find({
    userId,
    parentFolderId,
    isActive: true,
  }).sort({ name: 1 });
};

/**
 * Checks if a folder with the given name already exists under a specific parent folder for a user.
 * This is useful for enforcing unique names within the same hierarchy level.
 * @memberof KnowledgeFolderModel
 * @static
 * @async
 * @param {string} userId - The ID of the user.
 * @param {string} name - The name of the folder to check.
 * @param {mongoose.Schema.Types.ObjectId | null} parentFolderId - The ID of the parent folder, or `null` for root folders.
 * @returns {Promise<boolean>} A promise that resolves to `true` if a folder with the name exists, `false` otherwise.
 */
KnowledgeFolderSchema.statics.nameExistsInParent = async function (
  userId,
  name,
  parentFolderId
) {
  const count = await this.countDocuments({
    userId,
    name,
    parentFolderId: parentFolderId || null,
    isActive: true,
  });
  return count > 0;
};

/**
 * Retrieves a specific folder along with its entire lineage of ancestor folders and a breadcrumb string.
 * This method uses Mongoose's aggregation framework with $graphLookup for efficient retrieval
 * of hierarchical data, avoiding N+1 query issues.
 * @memberof KnowledgeFolderModel
 * @static
 * @async
 * @param {mongoose.Schema.Types.ObjectId} folderId - The ID of the target folder.
 * @param {string} userId - The ID of the user who owns the folder.
 * @returns {Promise<{folder: KnowledgeFolderDocument, ancestors: KnowledgeFolderDocument[], breadcrumb: string} | null>}
 *   A promise that resolves to an object containing the target folder, an array of its ancestors (from root to parent),
 *   and a formatted breadcrumb string (e.g., "Root > Parent > Current"), or `null` if the folder is not found or not owned by the user.
 */
KnowledgeFolderSchema.statics.getFolderWithAncestors = async function (
  folderId,
  userId
) {
  const result = await this.aggregate([
    {
      // Match the target folder by its ID and ensure it belongs to the user and is active
      $match: {
        _id: new mongoose.Types.ObjectId(folderId),
        userId: userId,
        isActive: true,
      },
    },
    {
      // Use $graphLookup to recursively find all parent folders (ancestors)
      $graphLookup: {
        from: 'knowledgefolders', // The collection name for KnowledgeFolder model
        startWith: '$parentFolderId', // Start the recursive search from the parentFolderId of the matched folder
        connectFromField: 'parentFolderId', // Field in the 'from' collection to connect from (parent's parentFolderId)
        connectToField: '_id', // Field in the 'from' collection to connect to (parent's _id)
        as: 'ancestors', // The output array field containing all ancestors
        // Restrict the search to only include active ancestors belonging to the same user
        restrictSearchWithMatch: { userId: userId, isActive: true },
      },
    },
    {
      // Sort the ancestors by their path to ensure they are in root-to-parent order
      $addFields: {
        ancestors: {
          $sortArray: {
            input: '$ancestors',
            sortBy: { path: 1 },
          },
        },
      },
    },
    {
      // Project the output to match the desired structure: 'folder' and 'ancestors'
      $project: {
        folder: '$$ROOT', // The original matched document becomes the 'folder'
        ancestors: '$ancestors',
        _id: 0, // Exclude the aggregation's root _id
      },
    },
  ]);

  if (result.length === 0) {
    return null;
  }

  const { folder, ancestors } = result[0];

  // Apply the toJSON transform manually to the aggregation results for consistency
  // Aggregation results are plain objects, not Mongoose documents, so virtuals and transforms
  // are not applied automatically.
  const transformedFolder = KnowledgeFolderSchema.options.toJSON.transform(folder, { ...folder });
  const transformedAncestors = ancestors.map(a => KnowledgeFolderSchema.options.toJSON.transform(a, { ...a }));

  // Construct the breadcrumb string
  const breadcrumb = transformedAncestors
    .map((a) => a.name)
    .concat([transformedFolder.name])
    .join(' > ');

  return {
    folder: transformedFolder,
    ancestors: transformedAncestors,
    breadcrumb,
  };
};

// Instance methods
/**
 * Updates the file count and total size statistics for the current folder.
 * Ensures that counts and sizes do not fall below zero.
 * @memberof KnowledgeFolderDocument
 * @instance
 * @async
 * @param {number} [fileCountDelta=0] - The change in file count (positive for add, negative for remove).
 * @param {number} [sizeDelta=0] - The change in total size in bytes (positive for add, negative for remove).
 * @returns {Promise<KnowledgeFolderDocument>} A promise that resolves to the updated folder document.
 */
KnowledgeFolderSchema.methods.updateStats = async function (
  fileCountDelta = 0,
  sizeDelta = 0
) {
  this.fileCount = Math.max(0, this.fileCount + fileCountDelta);
  this.totalSize = Math.max(0, this.totalSize + sizeDelta);
  return this.save();
};

/**
 * Performs a soft delete on the folder by setting `isActive` to `false` and `deletedAt` to the current date.
 * @memberof KnowledgeFolderDocument
 * @instance
 * @async
 * @returns {Promise<KnowledgeFolderDocument>} A promise that resolves to the soft-deleted folder document.
 */
KnowledgeFolderSchema.methods.softDelete = async function () {
  this.isActive = false;
  this.deletedAt = new Date();
  return this.save();
};

// Pre-save hook to update path
/**
 * Mongoose pre-save hook to automatically generate or update the `path` field.
 * The path is constructed based on the folder's name and its parent's path.
 * This hook runs before saving a new document or when `parentFolderId` or `name` is modified.
 * Includes error handling for parent folder lookup.
 * @memberof KnowledgeFolderSchema
 * @function preSaveHook
 * @param {function} next - The next middleware function.
 * @async
 */
KnowledgeFolderSchema.pre('save', async function (next) {
  if (
    this.isNew ||
    this.isModified('parentFolderId') ||
    this.isModified('name')
  ) {
    try {
      if (!this.parentFolderId) {
        this.path = `/${this.name}`;
      } else {
        // Use this.constructor to refer to the model itself in a static context.
        // Select only necessary fields (path, name) for performance.
        const parent = await this.constructor.findById(this.parentFolderId).select('path name');
        if (parent) {
          this.path = `${parent.path}/${this.name}`;
        } else {
          // If the parent folder is not found, it indicates a data inconsistency.
          // Prevent saving the current folder with an invalid parent.
          return next(new Error('Parent folder not found. Cannot create/update folder.'));
        }
      }
    } catch (error) {
      // Catch any errors during the database lookup and pass them to Mongoose's error handling.
      return next(error);
    }
  }
  next();
});

/**
 * Represents the KnowledgeFolder Mongoose model.
 * Provides an interface to interact with the 'knowledgefolders' collection in MongoDB.
 * @type {KnowledgeFolderModel}
 */
const KnowledgeFolder = mongoose.model(
  'KnowledgeFolder',
  KnowledgeFolderSchema
);
export default KnowledgeFolder;