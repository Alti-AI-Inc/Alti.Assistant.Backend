import mongoose from 'mongoose';
import { PubSub } from '@google-cloud/pubsub';
import { FOLDER_COLORS } from './knowledge.constant.js';

// --- GCP Database Resiliency Configuration ---
// It is a best practice to centralize database connection logic in a single file (e.g., database.js)
// and initialize it when the application starts. For the purpose of this audit, the configuration is added here.

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  // Log warning but don't exit — the main app manages the database connection via DATABASE_LOCAL
  console.warn('WARNING: MONGODB_URI environment variable is not set. Using shared mongoose connection.');
}

// Mongoose connection options optimized for resiliency and performance in a GCP environment.
const mongooseOptions = {
  // --- Connection Pooling ---
  // maxPoolSize: The maximum number of sockets the driver will keep open for this connection.
  // A higher value allows for more concurrent database operations.
  // For serverless environments (Cloud Run), keep this low (e.g., 5-10) to avoid exhausting connections.
  // For GKE/Compute Engine, a value of 50-100 is a reasonable starting point.
  maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '50', 10),

  // --- Timeout Settings ---
  // serverSelectionTimeoutMS: How long the driver will try to find a server to send an operation to before timing out.
  // A value of 5000ms (5 seconds) is a good default to fail fast if the database is unreachable.
  serverSelectionTimeoutMS: 5000,

  // socketTimeoutMS: How long a socket can be idle before being closed.
  // This should be set to a value higher than the expected longest-running query to prevent premature closure.
  // 45000ms (45 seconds) is a safe value for most applications.
  socketTimeoutMS: 45000,

  // connectTimeoutMS: How long the driver will wait for a connection to be established before timing out.
  // 10000ms (10 seconds) is a reasonable value for connections within a GCP VPC.
  connectTimeoutMS: 10000,

  // --- KeepAlive Settings ---
  // keepAlive: Enables TCP KeepAlive on the socket. This is crucial for long-running applications
  // to prevent network infrastructure (like firewalls or NATs in GCP) from silently dropping idle connections.


  // keepAliveInitialDelay: The number of milliseconds to wait before initiating the first keepalive probe.
  // 300000ms (5 minutes) is a common setting to ensure idle connections are maintained.

};

// Establish the database connection only if a URI is configured.
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, mongooseOptions)
    .then(() => console.log('MongoDB connection established successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));
}

// Event listeners for the database connection to log status changes.
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to DB.');
});

mongoose.connection.on('error', (err) => {
  console.error(`Mongoose connection error: ${err}`);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from DB.');
});

// --- End GCP Database Resiliency Configuration ---

// --- GCP Pub/Sub Integration ---
// Initialize Pub/Sub client. In a production environment, the client automatically
// uses the service account credentials from the environment (e.g., Cloud Run, GKE).
const pubsub = new PubSub();

// Define topic names for background tasks. These should be configured via environment variables.
// A separate background worker (e.g., a Cloud Function or Cloud Run service) will subscribe to these topics.
const FOLDER_PATH_UPDATE_TOPIC = process.env.FOLDER_PATH_UPDATE_TOPIC || 'knowledge-folder-path-update';
const FOLDER_DELETE_TOPIC = process.env.FOLDER_DELETE_TOPIC || 'knowledge-folder-delete';
const FOLDER_STATS_UPDATE_TOPIC = process.env.FOLDER_STATS_UPDATE_TOPIC || 'knowledge-folder-stats-update';
// --- End GCP Pub/Sub Integration ---

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
        folder: '$ROOT', // The original matched document becomes the 'folder'
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
 * Updates the file count for the current folder and triggers a background job to propagate size changes to parent folders.
 * This prevents a single file upload from causing a chain of synchronous database updates up the folder tree.
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
  // Update the stats for the current folder directly.
  this.fileCount = Math.max(0, this.fileCount + fileCountDelta);
  this.totalSize = Math.max(0, this.totalSize + sizeDelta);

  // If the size changed and this folder has a parent, trigger a background job
  // to recursively update the totalSize of all ancestor folders. This is offloaded
  // to prevent slow, blocking "N+1" updates up the folder tree during a request.
  if (sizeDelta !== 0 && this.parentFolderId) {
    const messagePayload = {
      // The worker will start the update from this folder's parent.
      startFolderId: this.parentFolderId.toString(),
      userId: this.userId,
      tenantId: this.tenantId ? this.tenantId.toString() : null,
      sizeDelta: sizeDelta,
    };

    await pubsub.topic(FOLDER_STATS_UPDATE_TOPIC).publishMessage({
      json: messagePayload,
      attributes: {
        source: 'KnowledgeFolderModel',
        eventType: 'FolderSizeChanged',
      },
    });
  }

  return this.save();
};

/**
 * Performs a soft delete on the folder and triggers a background job to soft-delete all its descendants.
 * Offloading the cascade delete prevents the API request from timing out if the folder contains many items.
 * @memberof KnowledgeFolderDocument
 * @instance
 * @async
 * @returns {Promise<KnowledgeFolderDocument>} A promise that resolves to the soft-deleted folder document.
 */
KnowledgeFolderSchema.methods.softDelete = async function () {
  // Offload the heavy task of recursively soft-deleting all descendant files and folders.
  // This ensures the API responds quickly, while the cleanup happens asynchronously.
  const messagePayload = {
    userId: this.userId,
    tenantId: this.tenantId ? this.tenantId.toString() : null,
    deletedFolderPath: this.path, // The worker will delete everything under this path.
    deletedAt: new Date().toISOString(),
  };

  await pubsub.topic(FOLDER_DELETE_TOPIC).publishMessage({
    json: messagePayload,
    attributes: {
      source: 'KnowledgeFolderModel',
      eventType: 'FolderSoftDeleted',
    },
  });

  // Soft-delete the current folder immediately.
  this.isActive = false;
  this.deletedAt = new Date();
  return this.save();
};

// Pre-save hook to update path
/**
 * Mongoose pre-save hook to automatically generate or update the `path` field.
 * It also triggers a background job to update descendant paths if a folder is renamed or moved.
 * @memberof KnowledgeFolderSchema
 * @function preSaveHook
 * @param {function} next - The next middleware function.
 * @async
 */
KnowledgeFolderSchema.pre('save', async function (next) {
  const isPathDirty = this.isNew || this.isModified('parentFolderId') || this.isModified('name');

  if (!isPathDirty) {
    return next();
  }

  try {
    // Store the old path for comparison later if this is an update.
    const oldPath = this.isNew ? null : this.path;

    // Calculate the new path.
    let newPath;
    if (!this.parentFolderId) {
      newPath = `/${this.name}`;
    } else {
      const parent = await this.constructor.findById(this.parentFolderId).select('path').lean();
      if (!parent) {
        return next(new Error('Parent folder not found. Cannot create/update folder.'));
      }
      newPath = `${parent.path}/${this.name}`;
    }

    // Assign the new path to the document.
    this.path = newPath;

    // If this is an update and the path has changed, offload the task of updating all descendants.
    // This is a potentially long-running operation (e.g., renaming a folder with 10,000 items).
    // Offloading it to a background worker via Pub/Sub ensures the API responds quickly
    // and the system can scale, as the update happens asynchronously.
    if (!this.isNew && oldPath !== newPath) {
      const messagePayload = {
        userId: this.userId,
        tenantId: this.tenantId ? this.tenantId.toString() : null,
        oldPathPrefix: oldPath,
        newPathPrefix: newPath,
      };

      await pubsub.topic(FOLDER_PATH_UPDATE_TOPIC).publishMessage({
        json: messagePayload,
        attributes: {
          source: 'KnowledgeFolderModel',
          eventType: 'FolderPathUpdated',
        },
      });
    }

    next();
  } catch (error) {
    // Catch any errors during the database lookup and pass them to Mongoose's error handling.
    next(error);
  }
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
