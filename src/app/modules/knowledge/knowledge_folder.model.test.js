import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { PubSub } from '@google-cloud/pubsub';
import { FOLDER_COLORS } from './knowledge.constant.js';

// Mock mongoose to prevent actual DB connection and control its behavior
vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();
  const mockSchema = vi.fn().mockImplementation((definition, options) => {
    const schemaInstance = {
      definition,
      options,
      virtuals: {},
      statics: {},
      methods: {},
      pre: vi.fn(),
      index: vi.fn(),
      add: vi.fn(),
      path: vi.fn().mockImplementation(() => ({
        validate: vi.fn(),
      })),
      get: vi.fn(), // For virtuals
      set: vi.fn(), // For virtuals
    };

    schemaInstance.virtual = vi.fn().mockImplementation((name) => {
      const virtual = {
        get: vi.fn(function (getter) {
          schemaInstance.virtuals[name] = { get: getter };
          return virtual;
        }),
        set: vi.fn(function (setter) {
          schemaInstance.virtuals[name] = { ...schemaInstance.virtuals[name], set: setter };
          return virtual;
        }),
      };
      return virtual;
    });

    // Mock static methods to be assigned later
    schemaInstance.statics.findByUserId = vi.fn();
    schemaInstance.statics.findRootFolders = vi.fn();
    schemaInstance.statics.findSubfolders = vi.fn();
    schemaInstance.statics.nameExistsInParent = vi.fn();
    schemaInstance.statics.getFolderWithAncestors = vi.fn();

    // Mock instance methods to be assigned later
    schemaInstance.methods.updateStats = vi.fn();
    schemaInstance.methods.softDelete = vi.fn();

    return schemaInstance;
  });

  const mockModel = vi.fn().mockImplementation((name, schema) => {
    // This mock model will be used to simulate Mongoose queries
    const Model = function (doc) {
      Object.assign(this, doc);
      this.isNew = true; // Default for new instances
      this.isModified = vi.fn().mockImplementation((field) => {
        // Simple mock for isModified, can be enhanced if needed
        return this._modifiedFields && this._modifiedFields.includes(field);
      });
      this.save = vi.fn().mockImplementation(async () => {
        // Simulate pre-save hook
        if (schema.pre.mock.calls.some(call => call[0] === 'save')) {
          const preSaveHook = schema.pre.mock.calls.find(call => call[0] === 'save')[1];
          await new Promise((resolve, reject) => {
            preSaveHook.call(this, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
        this.isNew = false; // After save, it's no longer new
        return this;
      });
      this.populate = vi.fn().mockImplementation(() => this); // Mock populate
    };

    Model.find = vi.fn().mockImplementation(() => ({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
      exec: vi.fn().mockResolvedValue([]),
    }));
    Model.findById = vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
      exec: vi.fn().mockResolvedValue(null),
    }));
    Model.countDocuments = vi.fn().mockResolvedValue(0);
    Model.aggregate = vi.fn().mockResolvedValue([]);
    Model.create = vi.fn().mockImplementation((doc) => {
      const newDoc = new Model(doc);
      newDoc.isNew = true;
      return newDoc;
    });

    // Attach static methods from schema to the mock Model
    Object.assign(Model, schema.statics);

    return Model;
  });

  const mockTypes = {
    ObjectId: vi.fn().mockImplementation((id) => ({
      toString: () => id,
      equals: (other) => id === other.toString(),
      _id: id, // For direct comparison in tests
    })),
  };
  mockTypes.ObjectId.isValid = vi.fn().mockImplementation(() => true); // Assume valid for simplicity

  return {
    ...actualMongoose, // Import other actual mongoose exports if needed
    Schema: mockSchema,
    model: mockModel,
    Types: mockTypes,
    connect: vi.fn().mockResolvedValue(null), // Mock connect to do nothing
    connection: {
      on: vi.fn(),
      // Add other connection properties if needed by the code, e.g., readyState
    },
  };
});

// Mock PubSub
vi.mock('@google-cloud/pubsub', () => {
  const mockPublishMessage = vi.fn();
  const mockTopic = vi.fn().mockImplementation(() => ({
    publishMessage: mockPublishMessage,
  }));
  const mockPubSub = vi.fn().mockImplementation(() => ({
    topic: mockTopic,
  }));
  return { PubSub: mockPubSub };
});

// Mock environment variables
process.env.MONGODB_URI = 'mongodb://localhost:27017/testdb';
process.env.MONGO_MAX_POOL_SIZE = '10';
process.env.FOLDER_PATH_UPDATE_TOPIC = 'test-knowledge-folder-path-update';
process.env.FOLDER_DELETE_TOPIC = 'test-knowledge-folder-delete';
process.env.FOLDER_STATS_UPDATE_TOPIC = 'test-knowledge-folder-stats-update';

// Import the model AFTER mocks are set up
import KnowledgeFolder from '../src/app/modules/knowledge/knowledge_folder.model.js';

// Get the actual schema instance created by the model file
const KnowledgeFolderSchema = mongoose.Schema.mock.results[0].value;

describe('KnowledgeFolder Model', () => {
  const userId = 'user123';
  const tenantId = new mongoose.Types.ObjectId('60c72b2f9b1d8e001c8e4a1b');
  const folderId = new mongoose.Types.ObjectId('60c72b2f9b1d8e001c8e4a1c');
  const parentFolderId = new mongoose.Types.ObjectId('60c72b2f9b1d8e001c8e4a1d');

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock model's internal state for each test
    KnowledgeFolder.find.mockClear().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
      exec: vi.fn().mockResolvedValue([]),
    });
    KnowledgeFolder.findById.mockClear().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
      exec: vi.fn().mockResolvedValue(null),
    });
    KnowledgeFolder.countDocuments.mockClear().mockResolvedValue(0);
    KnowledgeFolder.aggregate.mockClear().mockResolvedValue([]);
    // Ensure pubsub mock is cleared
    PubSub.mock.results[0].value.topic().publishMessage.mockClear();
  });

  it('should define the KnowledgeFolder schema correctly', () => {
    expect(KnowledgeFolderSchema).toBeDefined();
    expect(KnowledgeFolderSchema.definition.name).toEqual({
      type: String,
      required: [true, 'Folder name is required'],
      trim: true,
      maxlength: [100, 'Folder name cannot exceed 100 characters'],
    });
    expect(KnowledgeFolderSchema.definition.userId).toEqual({
      type: String,
      required: [true, 'User ID is required'],
      index: true,
    });
    expect(KnowledgeFolderSchema.definition.parentFolderId).toEqual({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeFolder',
      default: null,
      index: true,
    });
    expect(KnowledgeFolderSchema.definition.path).toEqual({
      type: String,
      trim: true,
      default: '/',
    });
    expect(KnowledgeFolderSchema.definition.color).toEqual({
      type: String,
      trim: true,
      default: FOLDER_COLORS[0],
    });
    expect(KnowledgeFolderSchema.definition.fileCount).toEqual({
      type: Number,
      default: 0,
      min: 0,
    });
    expect(KnowledgeFolderSchema.definition.isActive).toEqual({
      type: Boolean,
      default: true,
      index: true,
    });
    expect(KnowledgeFolderSchema.definition.tenantId).toEqual({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    });
    expect(KnowledgeFolderSchema.options.timestamps).toBe(true);
  });

  it('should have correct compound indexes', () => {
    expect(KnowledgeFolderSchema.index).toHaveBeenCalledWith({ userId: 1, isActive: 1, createdAt: -1 });
    expect(KnowledgeFolderSchema.index).toHaveBeenCalledWith({ userId: 1, parentFolderId: 1, isActive: 1 });
    expect(KnowledgeFolderSchema.index).toHaveBeenCalledWith({ userId: 1, path: 1 });
    expect(KnowledgeFolderSchema.index).toHaveBeenCalledWith(
      { userId: 1, name: 1, parentFolderId: 1 },
      { unique: true, partialFilterExpression: { isActive: true } }
    );
  });

  describe('Virtuals', () => {
    it('formattedTotalSize should return human-readable size', () => {
      const doc = { totalSize: 0 };
      expect(KnowledgeFolderSchema.virtuals.formattedTotalSize.get.call(doc)).toBe('0 Bytes');

      doc.totalSize = 1023;
      expect(KnowledgeFolderSchema.virtuals.formattedTotalSize.get.call(doc)).toBe('1023 Bytes');

      doc.totalSize = 1024;
      expect(KnowledgeFolderSchema.virtuals.formattedTotalSize.get.call(doc)).toBe('1 KB');

      doc.totalSize = 1536; // 1.5 KB
      expect(KnowledgeFolderSchema.virtuals.formattedTotalSize.get.call(doc)).toBe('1.5 KB');

      doc.totalSize = 1024 * 1024;
      expect(KnowledgeFolderSchema.virtuals.formattedTotalSize.get.call(doc)).toBe('1 MB');

      doc.totalSize = 1.23 * 1024 * 1024 * 1024; // 1.23 GB
      expect(KnowledgeFolderSchema.virtuals.formattedTotalSize.get.call(doc)).toBe('1.23 GB');
    });

    it('depth should return the correct folder depth', () => {
      const doc1 = { path: '/RootFolder' };
      expect(KnowledgeFolderSchema.virtuals.depth.get.call(doc1)).toBe(1);

      const doc2 = { path: '/RootFolder/SubFolder' };
      expect(KnowledgeFolderSchema.virtuals.depth.get.call(doc2)).toBe(2);

      const doc3 = { path: '/' }; // Should ideally not happen for a named folder, but test edge case
      expect(KnowledgeFolderSchema.virtuals.depth.get.call(doc3)).toBe(0);

      const doc4 = { path: '' };
      expect(KnowledgeFolderSchema.virtuals.depth.get.call(doc4)).toBe(0);
    });
  });

  describe('toJSON Transform', () => {
    it('should transform _id to id and remove __v', () => {
      const doc = {
        _id: new mongoose.Types.ObjectId('60c72b2f9b1d8e001c8e4a1e'),
        name: 'Test Folder',
        __v: 0,
        otherField: 'value',
      };
      const transformed = KnowledgeFolderSchema.options.toJSON.transform(doc, { ...doc });
      expect(transformed).toEqual({
        id: '60c72b2f9b1d8e001c8e4a1e',
        name: 'Test Folder',
        otherField: 'value',
      });
      expect(transformed._id).toBeUndefined();
      expect(transformed.__v).toBeUndefined();
    });
  });

  describe('Static Methods', () => {
    describe('findByUserId', () => {
      it('should find active folders for a user', async () => {
        const mockFolders = [{ name: 'Folder A' }, { name: 'Folder B' }];
        KnowledgeFolder.find.mockReturnValue({
          sort: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue(mockFolders),
        });

        const result = await KnowledgeFolder.findByUserId(userId);

        expect(KnowledgeFolder.find).toHaveBeenCalledWith({ userId, isActive: true });
        expect(KnowledgeFolder.find().sort).toHaveBeenCalledWith({ name: 1 });
        expect(KnowledgeFolder.find().limit).toHaveBeenCalledWith(1000);
        expect(KnowledgeFolder.find().skip).toHaveBeenCalledWith(0);
        expect(KnowledgeFolder.find().lean).toHaveBeenCalled();
        expect(result).toEqual(mockFolders);
      });

      it('should filter by parentFolderId if provided', async () => {
        const mockFolders = [{ name: 'SubFolder' }];
        KnowledgeFolder.find.mockReturnValue({
          sort: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue(mockFolders),
        });

        const result = await KnowledgeFolder.findByUserId(userId, { parentFolderId });

        expect(KnowledgeFolder.find).toHaveBeenCalledWith({
          userId,
          isActive: true,
          parentFolderId,
        });
        expect(result).toEqual(mockFolders);
      });

      it('should handle parentFolderId: null for root folders', async () => {
        const mockFolders = [{ name: 'RootFolder' }];
        KnowledgeFolder.find.mockReturnValue({
          sort: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue(mockFolders),
        });

        const result = await KnowledgeFolder.findByUserId(userId, { parentFolderId: null });

        expect(KnowledgeFolder.find).toHaveBeenCalledWith({
          userId,
          isActive: true,
          parentFolderId: null,
        });
        expect(result).toEqual(mockFolders);
      });

      it('should apply limit and skip options', async () => {
        const mockFolders = [{ name: 'Folder C' }];
        KnowledgeFolder.find.mockReturnValue({
          sort: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue(mockFolders),
        });

        const result = await KnowledgeFolder.findByUserId(userId, { limit: 10, skip: 5 });

        expect(KnowledgeFolder.find().limit).toHaveBeenCalledWith(10);
        expect(KnowledgeFolder.find().skip).toHaveBeenCalledWith(5);
        expect(result).toEqual(mockFolders);
      });
    });

    describe('findRootFolders', () => {
      it('should find active root folders for a user', async () => {
        const mockFolders = [{ name: 'Root A' }, { name: 'Root B' }];
        KnowledgeFolder.find.mockReturnValue({
          sort: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue(mockFolders),
        });

        const result = await KnowledgeFolder.findRootFolders(userId);

        expect(KnowledgeFolder.find).toHaveBeenCalledWith({
          userId,
          parentFolderId: null,
          isActive: true,
        });
        expect(KnowledgeFolder.find().sort).toHaveBeenCalledWith({ name: 1 });
        expect(KnowledgeFolder.find().lean).toHaveBeenCalled();
        expect(result).toEqual(mockFolders);
      });
    });

    describe('findSubfolders', () => {
      it('should find active subfolders for a given parent and user', async () => {
        const mockFolders = [{ name: 'Child 1' }, { name: 'Child 2' }];
        KnowledgeFolder.find.mockReturnValue({
          sort: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue(mockFolders),
        });

        const result = await KnowledgeFolder.findSubfolders(parentFolderId, userId);

        expect(KnowledgeFolder.find).toHaveBeenCalledWith({
          userId,
          parentFolderId,
          isActive: true,
        });
        expect(KnowledgeFolder.find().sort).toHaveBeenCalledWith({ name: 1 });
        expect(KnowledgeFolder.find().lean).toHaveBeenCalled();
        expect(result).toEqual(mockFolders);
      });
    });

    describe('nameExistsInParent', () => {
      it('should return true if a folder with the name exists in the parent for the user', async () => {
        KnowledgeFolder.countDocuments.mockResolvedValue(1);

        const exists = await KnowledgeFolder.nameExistsInParent(
          userId,
          'Existing Folder',
          parentFolderId
        );

        expect(KnowledgeFolder.countDocuments).toHaveBeenCalledWith({
          userId,
          name: 'Existing Folder',
          parentFolderId,
          isActive: true,
        });
        expect(exists).toBe(true);
      });

      it('should return false if no folder with the name exists', async () => {
        KnowledgeFolder.countDocuments.mockResolvedValue(0);

        const exists = await KnowledgeFolder.nameExistsInParent(
          userId,
          'Non-existent Folder',
          parentFolderId
        );

        expect(KnowledgeFolder.countDocuments).toHaveBeenCalledWith({
          userId,
          name: 'Non-existent Folder',
          parentFolderId,
          isActive: true,
        });
        expect(exists).toBe(false);
      });

      it('should handle null parentFolderId for root folders', async () => {
        KnowledgeFolder.countDocuments.mockResolvedValue(1);

        const exists = await KnowledgeFolder.nameExistsInParent(
          userId,
          'Root Folder',
          null
        );

        expect(KnowledgeFolder.countDocuments).toHaveBeenCalledWith({
          userId,
          name: 'Root Folder',
          parentFolderId: null,
          isActive: true,
        });
        expect(exists).toBe(true);
      });
    });

    describe('getFolderWithAncestors', () => {
      const rootFolder = {
        _id: new mongoose.Types.ObjectId('60c72b2f9b1d8e001c8e4a1f'),
        name: 'Root',
        userId,
        parentFolderId: null,
        path: '/Root',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0,
      };
      const parentFolder = {
        _id: new mongoose.Types.ObjectId('60c72b2f9b1d8e001c8e4a20'),
        name: 'Parent',
        userId,
        parentFolderId: rootFolder._id,
        path: '/Root/Parent',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0,
      };
      const targetFolder = {
        _id: folderId,
        name: 'Target',
        userId,
        parentFolderId: parentFolder._id,
        path: '/Root/Parent/Target',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0,
      };

      it('should return null if folder not found or not owned by user', async () => {
        KnowledgeFolder.aggregate.mockResolvedValue([]);
        const result = await KnowledgeFolder.getFolderWithAncestors(folderId, userId);
        expect(result).toBeNull();
        expect(KnowledgeFolder.aggregate).toHaveBeenCalledWith([
          {
            $match: {
              _id: new mongoose.Types.ObjectId(folderId),
              userId: userId,
              isActive: true,
            },
          },
          {
            $graphLookup: {
              from: 'knowledgefolders',
              startWith: '$parentFolderId',
              connectFromField: 'parentFolderId',
              connectToField: '_id',
              as: 'ancestors',
              restrictSearchWithMatch: { userId: userId, isActive: true },
            },
          },
          {
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
            $project: {
              folder: '$ROOT',
              ancestors: '$ancestors',
              _id: 0,
            },
          },
        ]);
      });

      it('should retrieve folder with ancestors and breadcrumb for a nested folder', async () => {
        KnowledgeFolder.aggregate.mockResolvedValue([
          {
            folder: targetFolder,
            ancestors: [rootFolder, parentFolder],
          },
        ]);

        const result = await KnowledgeFolder.getFolderWithAncestors(folderId, userId);

        expect(result).toBeDefined();
        expect(result.folder.id).toEqual(targetFolder._id.toString());
        expect(result.folder.name).toEqual(targetFolder.name);
        expect(result.folder.__v).toBeUndefined(); // Check toJSON transform

        expect(result.ancestors).toHaveLength(2);
        expect(result.ancestors[0].id).toEqual(rootFolder._id.toString());
        expect(result.ancestors[0].name).toEqual(rootFolder.name);
        expect(result.ancestors[0].__v).toBeUndefined(); // Check toJSON transform

        expect(result.ancestors[1].id).toEqual(parentFolder._id.toString());
        expect(result.ancestors[1].name).toEqual(parentFolder.name);
        expect(result.ancestors[1].__v).toBeUndefined(); // Check toJSON transform

        expect(result.breadcrumb).toBe('Root > Parent > Target');
      });

      it('should retrieve folder with ancestors and breadcrumb for a root folder', async () => {
        KnowledgeFolder.aggregate.mockResolvedValue([
          {
            folder: rootFolder,
            ancestors: [],
          },
        ]);

        const result = await KnowledgeFolder.getFolderWithAncestors(rootFolder._id, userId);

        expect(result).toBeDefined();
        expect(result.folder.id).toEqual(rootFolder._id.toString());
        expect(result.folder.name).toEqual(rootFolder.name);
        expect(result.ancestors).toHaveLength(0);
        expect(result.breadcrumb).toBe('Root');
      });

      it('should handle ancestors with different user IDs or inactive status (restricted by $graphLookup)', async () => {
        // This test primarily verifies the $graphLookup restrictSearchWithMatch
        // The mock will return what we tell it, so we ensure the query itself is correct.
        const inactiveRoot = { ...rootFolder, isActive: false };
        const otherUserRoot = { ...rootFolder, userId: 'otherUser' };

        // If the aggregation returned these, it would be a bug in the aggregation query.
        // Our mock simulates a correct aggregation that would filter them out.
        KnowledgeFolder.aggregate.mockResolvedValue([
          {
            folder: targetFolder,
            ancestors: [rootFolder, parentFolder], // Only active, correct user ancestors
          },
        ]);

        await KnowledgeFolder.getFolderWithAncestors(targetFolder._id, userId);

        // The important part is that the $graphLookup's restrictSearchWithMatch is correctly set
        const aggregateCall = KnowledgeFolder.aggregate.mock.calls[0][0];
        const graphLookupStage = aggregateCall.find(stage => stage.$graphLookup);
        expect(graphLookupStage.$graphLookup.restrictSearchWithMatch).toEqual({ userId: userId, isActive: true });
      });
    });
  });

  describe('Instance Methods', () => {
    describe('updateStats', () => {
      it('should update fileCount and totalSize correctly', async () => {
        const folder = new KnowledgeFolder({
          _id: folderId,
          userId,
          name: 'Test',
          fileCount: 5,
          totalSize: 1000,
          parentFolderId: null,
        });
        folder.isNew = false; // Simulate existing document

        await folder.updateStats(2, 500);

        expect(folder.fileCount).toBe(7);
        expect(folder.totalSize).toBe(1500);
        expect(folder.save).toHaveBeenCalledTimes(1);
        expect(PubSub.mock.results[0].value.topic().publishMessage).not.toHaveBeenCalled();
      });

      it('should not go below zero for fileCount or totalSize', async () => {
        const folder = new KnowledgeFolder({
          _id: folderId,
          userId,
          name: 'Test',
          fileCount: 1,
          totalSize: 100,
          parentFolderId: null,
        });
        folder.isNew = false;

        await folder.updateStats(-5, -200);

        expect(folder.fileCount).toBe(0);
        expect(folder.totalSize).toBe(0);
        expect(folder.save).toHaveBeenCalledTimes(1);
      });

      it('should publish to FOLDER_STATS_UPDATE_TOPIC if sizeDelta is not zero and has parent', async () => {
        const folder = new KnowledgeFolder({
          _id: folderId,
          userId,
          name: 'Test',
          fileCount: 5,
          totalSize: 1000,
          parentFolderId,
          tenantId,
        });
        folder.isNew = false;

        await folder.updateStats(0, 200);

        expect(folder.fileCount).toBe(5);
        expect(folder.totalSize).toBe(1200);
        expect(folder.save).toHaveBeenCalledTimes(1);
        expect(PubSub.mock.results[0].value.topic).toHaveBeenCalledWith(
          process.env.FOLDER_STATS_UPDATE_TOPIC
        );
        expect(PubSub.mock.results[0].value.topic().publishMessage).toHaveBeenCalledWith({
          json: {
            startFolderId: parentFolderId.toString(),
            userId: userId,
            tenantId: tenantId.toString(),
            sizeDelta: 200,
          },
          attributes: {
            source: 'KnowledgeFolderModel',
            eventType: 'FolderSizeChanged',
          },
        });
      });

      it('should not publish if sizeDelta is zero', async () => {
        const folder = new KnowledgeFolder({
          _id: folderId,
          userId,
          name: 'Test',
          fileCount: 5,
          totalSize: 1000,
          parentFolderId,
        });
        folder.isNew = false;

        await folder.updateStats(1, 0); // Only fileCount changes

        expect(folder.fileCount).toBe(6);
        expect(folder.totalSize).toBe(1000);
        expect(folder.save).toHaveBeenCalledTimes(1);
        expect(PubSub.mock.results[0].value.topic().publishMessage).not.toHaveBeenCalled();
      });

      it('should not publish if no parentFolderId', async () => {
        const folder = new KnowledgeFolder({
          _id: folderId,
          userId,
          name: 'Test',
          fileCount: 5,
          totalSize: 1000,
          parentFolderId: null,
        });
        folder.isNew = false;

        await folder.updateStats(0, 200);

        expect(folder.fileCount).toBe(5);
        expect(folder.totalSize).toBe(1200);
        expect(folder.save).toHaveBeenCalledTimes(1);
        expect(PubSub.mock.results[0].value.topic().publishMessage).not.toHaveBeenCalled();
      });
    });

    describe('softDelete', () => {
      it('should set isActive to false and deletedAt, then save', async () => {
        const folder = new KnowledgeFolder({
          _id: folderId,
          userId,
          name: 'Test',
          isActive: true,
          path: '/Root/Test',
          tenantId,
        });
        folder.isNew = false;

        const initialDate = new Date();
        vi.setSystemTime(initialDate); // Freeze time for consistent deletedAt

        await folder.softDelete();

        expect(folder.isActive).toBe(false);
        expect(folder.deletedAt).toEqual(initialDate);
        expect(folder.save).toHaveBeenCalledTimes(1);
        expect(PubSub.mock.results[0].value.topic).toHaveBeenCalledWith(
          process.env.FOLDER_DELETE_TOPIC
        );
        expect(PubSub.mock.results[0].value.topic().publishMessage).toHaveBeenCalledWith({
          json: {
            userId: userId,
            tenantId: tenantId.toString(),
            deletedFolderPath: '/Root/Test',
            deletedAt: initialDate.toISOString(),
          },
          attributes: {
            source: 'KnowledgeFolderModel',
            eventType: 'FolderSoftDeleted',
          },
        });
        vi.useRealTimers(); // Restore real timers
      });
    });
  });

  describe('Pre-save Hook', () => {
    it('should generate path for a new root folder', async () => {
      const folder = new KnowledgeFolder({
        userId,
        name: 'NewRoot',
        parentFolderId: null,
      });
      folder.isNew = true;
      folder.isModified.mockReturnValue(true); // Simulate name being modified

      await folder.save();

      expect(folder.path).toBe('/NewRoot');
      expect(PubSub.mock.results[0].value.topic().publishMessage).not.toHaveBeenCalled();
    });

    it('should generate path for a new subfolder', async () => {
      const parent = { _id: parentFolderId, path: '/Parent' };
      KnowledgeFolder.findById.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(parent),
      });

      const folder = new KnowledgeFolder({
        userId,
        name: 'NewSub',
        parentFolderId,
      });
      folder.isNew = true;
      folder.isModified.mockReturnValue(true); // Simulate name being modified

      await folder.save();

      expect(KnowledgeFolder.findById).toHaveBeenCalledWith(parentFolderId);
      expect(folder.path).toBe('/Parent/NewSub');
      expect(PubSub.mock.results[0].value.topic().publishMessage).not.toHaveBeenCalled();
    });

    it('should update path when folder name is modified', async () => {
      const folder = new KnowledgeFolder({
        _id: folderId,
        userId,
        name: 'OldName',
        parentFolderId: null,
        path: '/OldName',
      });
      folder.isNew = false;
      folder.name = 'NewName';
      folder.isModified.mockImplementation((field) => field === 'name');

      await folder.save();

      expect(folder.path).toBe('/NewName');
      expect(PubSub.mock.results[0].value.topic).toHaveBeenCalledWith(
        process.env.FOLDER_PATH_UPDATE_TOPIC
      );
      expect(PubSub.mock.results[0].value.topic().publishMessage).toHaveBeenCalledWith({
        json: {
          userId: userId,
          tenantId: null, // Assuming tenantId is null for this test case
          oldPathPrefix: '/OldName',
          newPathPrefix: '/NewName',
        },
        attributes: {
          source: 'KnowledgeFolderModel',
          eventType: 'FolderPathUpdated',
        },
      });
    });

    it('should update path when parentFolderId is modified (folder moved)', async () => {
      const oldParentId = new mongoose.Types.ObjectId('60c72b2f9b1d8e001c8e4a21');
      const oldParent = { _id: oldParentId, path: '/OldParent' };
      const newParent = { _id: parentFolderId, path: '/NewParent' };

      // Mock findById for the new parent lookup
      KnowledgeFolder.findById.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(newParent),
      });

      const folder = new KnowledgeFolder({
        _id: folderId,
        userId,
        name: 'MyFolder',
        parentFolderId: oldParentId,
        path: '/OldParent/MyFolder',
        tenantId,
      });
      folder.isNew = false;
      folder.parentFolderId = parentFolderId; // Simulate moving to new parent
      folder.isModified.mockImplementation((field) => field === 'parentFolderId');

      await folder.save();

      expect(KnowledgeFolder.findById).toHaveBeenCalledWith(parentFolderId);
      expect(folder.path).toBe('/NewParent/MyFolder');
      expect(PubSub.mock.results[0].value.topic).toHaveBeenCalledWith(
        process.env.FOLDER_PATH_UPDATE_TOPIC
      );
      expect(PubSub.mock.results[0].value.topic().publishMessage).toHaveBeenCalledWith({
        json: {
          userId: userId,
          tenantId: tenantId.toString(),
          oldPathPrefix: '/OldParent/MyFolder',
          newPathPrefix: '/NewParent/MyFolder',
        },
        attributes: {
          source: 'KnowledgeFolderModel',
          eventType: 'FolderPathUpdated',
        },
      });
    });

    it('should not update path or publish if no relevant fields are modified', async () => {
      const folder = new KnowledgeFolder({
        _id: folderId,
        userId,
        name: 'Test',
        parentFolderId: null,
        path: '/Test',
      });
      folder.isNew = false;
      folder.isModified.mockReturnValue(false); // Simulate no relevant fields modified

      await folder.save();

      expect(folder.path).toBe('/Test'); // Path should remain unchanged
      expect(KnowledgeFolder.findById).not.toHaveBeenCalled();
      expect(PubSub.mock.results[0].value.topic().publishMessage).not.toHaveBeenCalled();
    });

    it('should throw error if parent folder not found during path generation', async () => {
      KnowledgeFolder.findById.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(null), // Parent not found
      });

      const folder = new KnowledgeFolder({
        userId,
        name: 'NewSub',
        parentFolderId,
      });
      folder.isNew = true;
      folder.isModified.mockReturnValue(true);

      await expect(folder.save()).rejects.toThrow('Parent folder not found. Cannot create/update folder.');
      expect(KnowledgeFolder.findById).toHaveBeenCalledWith(parentFolderId);
    });

    it('should handle errors during parent lookup gracefully', async () => {
      const mockError = new Error('DB error');
      KnowledgeFolder.findById.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockRejectedValue(mockError),
      });

      const folder = new KnowledgeFolder({
        userId,
        name: 'NewSub',
        parentFolderId,
      });
      folder.isNew = true;
      folder.isModified.mockReturnValue(true);

      await expect(folder.save()).rejects.toThrow('DB error');
    });
  });
});