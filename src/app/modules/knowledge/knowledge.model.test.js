import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock mongoose
const mockSchema = {
  index: vi.fn(),
  virtual: vi.fn().mockImplementation(() => ({ get: vi.fn() })),
  statics: {},
  methods: {},
  set: vi.fn(), // For toJSON/toObject options
};

// Mock chainable methods for Mongoose queries
const mockQueryChain = {
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]), // Default to empty array
};

const {
  mockMongoose
} = vi.hoisted(() => {
  const mockMongoose = {
    Schema: vi.fn().mockImplementation((schemaDef, options) => {
      // Simulate schema options being set
      if (options) {
        if (options.timestamps) {
          schemaDef.createdAt = { type: Date };
          schemaDef.updatedAt = { type: Date };
        }
        if (options.toJSON) {
          mockSchema.set('toJSON', options.toJSON);
        }
        if (options.toObject) {
          mockSchema.set('toObject', options.toObject);
        }
      }
      return mockSchema;
    }),
    model: vi.fn().mockImplementation((name, schema) => {
      // Return a mock model constructor
      const MockModel = function (data) {
        Object.assign(this, data);
        this.save = vi.fn().mockResolvedValue(this); // Mock save on instance
      };
      // Attach static methods from the schema mock
      Object.assign(MockModel, schema.statics);
      // Attach instance methods from the schema mock to the prototype
      Object.assign(MockModel.prototype, schema.methods);

      // Mock query methods that would be on the model directly
      MockModel.find = vi.fn().mockImplementation(() => mockQueryChain);
      MockModel.countDocuments = vi.fn().mockResolvedValue(0);
      MockModel.aggregate = vi.fn().mockResolvedValue([]);

      MockModel.schema = schema; // Attach the schema for inspection
      return MockModel;
    }),
    Types: {
      ObjectId: {
        isValid: vi.fn().mockImplementation((id) => typeof id === 'string' && id.length === 24), // Simple mock
      },
    },
  };

  return {
    mockMongoose
  };
});
// Ensure Schema.Types.ObjectId and Mixed are correctly set up for the schema definition
mockMongoose.Schema.Types = {
  ObjectId: mockMongoose.Types.ObjectId,
  Mixed: Object, // Mongoose.Schema.Types.Mixed is just a generic object type
};


// Mock constants
const OWNER_TYPES = { USER: 'USER', BOT: 'BOT' };
const PROCESSING_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};
const FILE_VISIBILITY = { PRIVATE: 'PRIVATE', PUBLIC: 'PUBLIC', SHARED: 'SHARED' };

vi.mock('mongoose', () => ({
  default: mockMongoose,
}));

vi.mock('./knowledge.constant.js', () => ({
  OWNER_TYPES: OWNER_TYPES,
  PROCESSING_STATUS: PROCESSING_STATUS,
  FILE_VISIBILITY: FILE_VISIBILITY,
}));

// Import the file to be tested AFTER mocks are set up
import KnowledgeFile from './knowledge.model.js';

describe('KnowledgeFile Model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockSchema's internal mocks
    mockSchema.index.mockClear();
    mockSchema.virtual.mockClear();
    mockSchema.set.mockClear();
    mockMongoose.Schema.mockClear();
    mockMongoose.model.mockClear();

    // Reset the mockQueryChain for each test
    mockQueryChain.sort.mockClear().mockReturnThis();
    mockQueryChain.limit.mockClear().mockReturnThis();
    mockQueryChain.skip.mockClear().mockReturnThis();
    mockQueryChain.exec.mockResolvedValue([]); // Reset default resolved value

    // Reset the static methods on the KnowledgeFile model itself
    KnowledgeFile.find.mockClear().mockImplementation(() => mockQueryChain);
    KnowledgeFile.countDocuments.mockClear().mockResolvedValue(0);
    KnowledgeFile.aggregate.mockClear().mockResolvedValue([]);
  });

  it('should define the KnowledgeFileSchema correctly', () => {
    expect(mockMongoose.Schema).toHaveBeenCalledTimes(1);
    const schemaDefinition = mockMongoose.Schema.mock.calls[0][0];
    const schemaOptions = mockMongoose.Schema.mock.calls[0][1];

    // Check basic schema properties
    expect(schemaDefinition.fileName).toEqual({
      type: String,
      required: [true, 'File name is required'],
      trim: true,
    });
    expect(schemaDefinition.originalName).toEqual({
      type: String,
      required: [true, 'Original file name is required'],
      trim: true,
    });
    expect(schemaDefinition.fileType).toEqual({
      type: String,
      required: [true, 'File type is required'],
      trim: true,
      lowercase: true,
    });
    expect(schemaDefinition.fileSize).toEqual({
      type: Number,
      required: [true, 'File size is required'],
      min: [0, 'File size cannot be negative'],
    });
    expect(schemaDefinition.gcsUrl).toEqual({
      type: String,
      required: [true, 'GCS URL is required'],
      trim: true,
    });
    expect(schemaDefinition.gcsPath).toEqual({
      type: String,
      required: [true, 'GCS path is required'],
      trim: true,
    });
    expect(schemaDefinition.gcsBucket).toEqual({
      type: String,
      required: true,
      trim: true,
      default: 'insoai_assistant_knowledge_bot_files',
    });
    expect(schemaDefinition.ownerType).toEqual({
      type: String,
      enum: Object.values(OWNER_TYPES),
      required: [true, 'Owner type is required'],
      index: true,
    });
    expect(schemaDefinition.ownerId).toEqual({
      type: String,
      required: [true, 'Owner ID is required'],
      index: true,
    });
    expect(schemaDefinition.folderId).toEqual({
      type: mockMongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeFolder',
      default: null,
      index: true,
    });
    expect(schemaDefinition.documentId).toEqual({
      type: String,
      trim: true,
    });
    expect(schemaDefinition.title).toEqual({
      type: String,
      trim: true,
    });
    expect(schemaDefinition.chunkCount).toEqual({
      type: Number,
      default: 0,
      min: 0,
    });
    expect(schemaDefinition.isProcessed).toEqual({
      type: Boolean,
      default: false,
      index: true,
    });
    expect(schemaDefinition.processingStatus).toEqual({
      type: String,
      enum: Object.values(PROCESSING_STATUS),
      default: PROCESSING_STATUS.PENDING,
      index: true,
    });
    expect(schemaDefinition.processingError).toEqual({
      type: String,
      trim: true,
    });
    expect(schemaDefinition.processedAt).toEqual({
      type: Date,
    });
    expect(schemaDefinition.description).toEqual({
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    });
    expect(schemaDefinition.tags).toEqual({
      type: [String],
      default: [],
    });
    expect(schemaDefinition.visibility).toEqual({
      type: String,
      enum: Object.values(FILE_VISIBILITY),
      default: FILE_VISIBILITY.PRIVATE,
    });
    expect(schemaDefinition.sharedWith).toEqual({
      type: [String],
      default: [],
    });
    expect(schemaDefinition.uploadSource).toEqual({
      type: String,
      trim: true,
      default: 'web',
    });
    expect(schemaDefinition.ipAddress).toEqual({
      type: String,
      trim: true,
    });
    expect(schemaDefinition.isActive).toEqual({
      type: Boolean,
      default: true,
      index: true,
    });
    expect(schemaDefinition.deletedAt).toEqual({
      type: Date,
    });
    expect(schemaDefinition.metadata).toEqual({
      type: mockMongoose.Schema.Types.Mixed,
      default: {},
    });
    expect(schemaDefinition.tenantId).toEqual({
      type: mockMongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    });

    // Check schema options
    expect(schemaOptions.timestamps).toBe(true);
    expect(schemaOptions.toJSON).toBeDefined();
    expect(schemaOptions.toObject).toBeDefined();
  });

  it('should define the KnowledgeFile model', () => {
    expect(mockMongoose.model).toHaveBeenCalledWith('KnowledgeFile', mockSchema);
    expect(KnowledgeFile).toBeDefined();
  });

  it('should define virtual property formattedFileSize', () => {
    expect(mockSchema.virtual).toHaveBeenCalledWith('formattedFileSize');
    const virtualGetter = mockSchema.virtual.mock.results[0].value.get;

    // Test cases for formattedFileSize
    const doc = { fileSize: 0 };
    expect(virtualGetter.call(doc)).toBe('0 Bytes');

    doc.fileSize = 100;
    expect(virtualGetter.call(doc)).toBe('100 Bytes');

    doc.fileSize = 1024;
    expect(virtualGetter.call(doc)).toBe('1 KB');

    doc.fileSize = 1536; // 1.5 KB
    expect(virtualGetter.call(doc)).toBe('1.5 KB');

    doc.fileSize = 1024 * 1024;
    expect(virtualGetter.call(doc)).toBe('1 MB');

    doc.fileSize = 1.5 * 1024 * 1024;
    expect(virtualGetter.call(doc)).toBe('1.5 MB');

    doc.fileSize = 1024 * 1024 * 1024;
    expect(virtualGetter.call(doc)).toBe('1 GB');

    doc.fileSize = 1.234 * 1024 * 1024 * 1024;
    expect(virtualGetter.call(doc)).toBe('1.23 GB');

    doc.fileSize = 1024 * 1024 * 1024 * 1024;
    expect(virtualGetter.call(doc)).toBe('1 TB');
  });

  it('should define compound and sparse indexes', () => {
    expect(mockSchema.index).toHaveBeenCalledTimes(9); // 4 compound + 4 legacy + 1 sparse

    // Verify specific indexes
    expect(mockSchema.index).toHaveBeenCalledWith({
      tenantId: 1,
      ownerType: 1,
      ownerId: 1,
      isActive: 1,
      createdAt: -1,
    });
    expect(mockSchema.index).toHaveBeenCalledWith({
      tenantId: 1,
      ownerType: 1,
      ownerId: 1,
      folderId: 1,
      isActive: 1,
    });
    expect(mockSchema.index).toHaveBeenCalledWith({
      tenantId: 1,
      ownerType: 1,
      ownerId: 1,
      fileType: 1,
      isActive: 1,
    });
    expect(mockSchema.index).toHaveBeenCalledWith({
      tenantId: 1,
      ownerType: 1,
      ownerId: 1,
      processingStatus: 1,
    });
    expect(mockSchema.index).toHaveBeenCalledWith({
      ownerType: 1,
      ownerId: 1,
      isActive: 1,
      createdAt: -1,
    });
    expect(mockSchema.index).toHaveBeenCalledWith({
      ownerType: 1,
      ownerId: 1,
      folderId: 1,
      isActive: 1,
    });
    expect(mockSchema.index).toHaveBeenCalledWith({
      ownerType: 1,
      ownerId: 1,
      fileType: 1,
      isActive: 1,
    });
    expect(mockSchema.index).toHaveBeenCalledWith({
      ownerType: 1,
      ownerId: 1,
      processingStatus: 1,
    });
    expect(mockSchema.index).toHaveBeenCalledWith({ documentId: 1 }, { sparse: true });
  });

  it('should correctly transform JSON output', () => {
    const transformFn = mockMongoose.Schema.mock.calls[0][1].toJSON.transform;
    const doc = {
      _id: '60c72b2f9b1e8b001c8e4d1a',
      __v: 0,
      fileName: 'test.pdf',
      ownerId: 'user123',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const ret = { ...doc }; // Mongoose passes a plain object copy

    const transformed = transformFn(doc, ret);

    expect(transformed).not.toHaveProperty('_id');
    expect(transformed).not.toHaveProperty('__v');
    expect(transformed).toHaveProperty('id', doc._id);
    expect(transformed.fileName).toBe('test.pdf');
  });

  describe('Static Methods', () => {
    describe('findByOwner', () => {
      it('should find files by ownerType and ownerId with default options', async () => {
        const expectedFiles = [{ id: 'file1' }, { id: 'file2' }];
        KnowledgeFile.find.mockImplementationOnce(() => ({
          ...mockQueryChain,
          exec: vi.fn().mockResolvedValue(expectedFiles),
        }));

        const files = await KnowledgeFile.findByOwner(OWNER_TYPES.USER, 'user123');

        expect(KnowledgeFile.find).toHaveBeenCalledWith({
          ownerType: OWNER_TYPES.USER,
          ownerId: 'user123',
          isActive: true,
        });
        expect(mockQueryChain.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(mockQueryChain.limit).toHaveBeenCalledWith(100);
        expect(mockQueryChain.skip).toHaveBeenCalledWith(0);
        expect(files).toEqual(expectedFiles);
      });

      it('should apply filters from options', async () => {
        const options = {
          fileType: 'pdf',
          processingStatus: PROCESSING_STATUS.COMPLETED,
          isProcessed: true,
          folderId: 'folder123',
          limit: 10,
          skip: 5,
        };
        const expectedFiles = [{ id: 'file3' }];
        KnowledgeFile.find.mockImplementationOnce(() => ({
          ...mockQueryChain,
          exec: vi.fn().mockResolvedValue(expectedFiles),
        }));

        const files = await KnowledgeFile.findByOwner(
          OWNER_TYPES.BOT,
          'bot456',
          options
        );

        expect(KnowledgeFile.find).toHaveBeenCalledWith({
          ownerType: OWNER_TYPES.BOT,
          ownerId: 'bot456',
          isActive: true,
          fileType: 'pdf',
          processingStatus: PROCESSING_STATUS.COMPLETED,
          isProcessed: true,
          folderId: 'folder123',
        });
        expect(mockQueryChain.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(mockQueryChain.limit).toHaveBeenCalledWith(10);
        expect(mockQueryChain.skip).toHaveBeenCalledWith(5);
        expect(files).toEqual(expectedFiles);
      });

      it('should handle folderId as null', async () => {
        const options = { folderId: null };
        KnowledgeFile.find.mockImplementationOnce(() => ({
          ...mockQueryChain,
          exec: vi.fn().mockResolvedValue([]),
        }));

        await KnowledgeFile.findByOwner(OWNER_TYPES.USER, 'user123', options);

        expect(KnowledgeFile.find).toHaveBeenCalledWith({
          ownerType: OWNER_TYPES.USER,
          ownerId: 'user123',
          isActive: true,
          folderId: null,
        });
      });
    });

    describe('countByOwner', () => {
      it('should count active files by ownerType and ownerId by default', async () => {
        KnowledgeFile.countDocuments.mockResolvedValueOnce(5);
        const count = await KnowledgeFile.countByOwner(OWNER_TYPES.USER, 'user123');
        expect(KnowledgeFile.countDocuments).toHaveBeenCalledWith({
          ownerType: OWNER_TYPES.USER,
          ownerId: 'user123',
          isActive: true,
        });
        expect(count).toBe(5);
      });

      it('should count all files (active and inactive) if activeOnly is false', async () => {
        KnowledgeFile.countDocuments.mockResolvedValueOnce(10);
        const count = await KnowledgeFile.countByOwner(
          OWNER_TYPES.BOT,
          'bot456',
          false
        );
        expect(KnowledgeFile.countDocuments).toHaveBeenCalledWith({
          ownerType: OWNER_TYPES.BOT,
          ownerId: 'bot456',
        });
        expect(count).toBe(10);
      });
    });

    describe('getTotalStorageByOwner', () => {
      it('should sum file sizes for active files by default', async () => {
        KnowledgeFile.aggregate.mockResolvedValueOnce([{ _id: null, total: 123456 }]);
        const totalSize = await KnowledgeFile.getTotalStorageByOwner(
          OWNER_TYPES.USER,
          'user123'
        );
        expect(KnowledgeFile.aggregate).toHaveBeenCalledWith([
          {
            $match: {
              ownerType: OWNER_TYPES.USER,
              ownerId: 'user123',
              isActive: true,
            },
          },
          { $group: { _id: null, total: { $sum: '$fileSize' } } },
        ]);
        expect(totalSize).toBe(123456);
      });

      it('should sum file sizes for all files if activeOnly is false', async () => {
        KnowledgeFile.aggregate.mockResolvedValueOnce([{ _id: null, total: 987654 }]);
        const totalSize = await KnowledgeFile.getTotalStorageByOwner(
          OWNER_TYPES.BOT,
          'bot456',
          false
        );
        expect(KnowledgeFile.aggregate).toHaveBeenCalledWith([
          {
            $match: {
              ownerType: OWNER_TYPES.BOT,
              ownerId: 'bot456',
            },
          },
          { $group: { _id: null, total: { $sum: '$fileSize' } } },
        ]);
        expect(totalSize).toBe(987654);
      });

      it('should return 0 if no files are found', async () => {
        KnowledgeFile.aggregate.mockResolvedValueOnce([]);
        const totalSize = await KnowledgeFile.getTotalStorageByOwner(
          OWNER_TYPES.USER,
          'user123'
        );
        expect(totalSize).toBe(0);
      });
    });
  });

  describe('Instance Methods', () => {
    let mockFile;

    beforeEach(() => {
      // Create a new instance of the mocked KnowledgeFile model for each test
      mockFile = new KnowledgeFile({
        fileName: 'test.pdf',
        originalName: 'original.pdf',
        fileType: 'pdf',
        fileSize: 1024,
        gcsUrl: 'http://gcs.url/test.pdf',
        gcsPath: 'path/to/test.pdf',
        gcsBucket: 'test-bucket',
        ownerType: OWNER_TYPES.USER,
        ownerId: 'user123',
        isProcessed: false,
        processingStatus: PROCESSING_STATUS.PENDING,
        isActive: true,
      });
      // The `mockMongoose.model` already sets up `save` on the instance,
      // but we clear its mock calls here to ensure a clean state for each test.
      mockFile.save.mockClear();
    });

    describe('markAsProcessed', () => {
      it('should update processing status and related fields', async () => {
        const documentId = 'doc-id-123';
        const chunkCount = 5;
        const title = 'Test Document Title';

        const updatedFile = await mockFile.markAsProcessed(
          documentId,
          chunkCount,
          title
        );

        expect(updatedFile.documentId).toBe(documentId);
        expect(updatedFile.chunkCount).toBe(chunkCount);
        expect(updatedFile.title).toBe(title);
        expect(updatedFile.isProcessed).toBe(true);
        expect(updatedFile.processingStatus).toBe(PROCESSING_STATUS.COMPLETED);
        expect(updatedFile.processedAt).toBeInstanceOf(Date);
        expect(updatedFile.processingError).toBeNull();
        expect(mockFile.save).toHaveBeenCalledTimes(1);
        expect(updatedFile).toBe(mockFile); // Should return the instance itself
      });
    });

    describe('markProcessingFailed', () => {
      it('should update processing status to FAILED with an error message', async () => {
        const error = new Error('Processing failed due to XYZ');
        const updatedFile = await mockFile.markProcessingFailed(error);

        expect(updatedFile.processingStatus).toBe(PROCESSING_STATUS.FAILED);
        expect(updatedFile.processingError).toBe(error.message);
        expect(updatedFile.isProcessed).toBe(false);
        expect(mockFile.save).toHaveBeenCalledTimes(1);
        expect(updatedFile).toBe(mockFile);
      });

      it('should handle string error messages', async () => {
        const errorMessage = 'Generic processing error';
        const updatedFile = await mockFile.markProcessingFailed(errorMessage);

        expect(updatedFile.processingStatus).toBe(PROCESSING_STATUS.FAILED);
        expect(updatedFile.processingError).toBe(errorMessage);
        expect(updatedFile.isProcessed).toBe(false);
        expect(mockFile.save).toHaveBeenCalledTimes(1);
        expect(updatedFile).toBe(mockFile);
      });

      it('should handle unknown error objects', async () => {
        const unknownError = { code: 500 }; // Not an Error instance
        const updatedFile = await mockFile.markProcessingFailed(unknownError);

        expect(updatedFile.processingStatus).toBe(PROCESSING_STATUS.FAILED);
        expect(updatedFile.processingError).toBe('Unknown error');
        expect(updatedFile.isProcessed).toBe(false);
        expect(mockFile.save).toHaveBeenCalledTimes(1);
        expect(updatedFile).toBe(mockFile);
      });
    });

    describe('softDelete', () => {
      it('should set isActive to false and deletedAt timestamp', async () => {
        const updatedFile = await mockFile.softDelete();

        expect(updatedFile.isActive).toBe(false);
        expect(updatedFile.deletedAt).toBeInstanceOf(Date);
        expect(mockFile.save).toHaveBeenCalledTimes(1);
        expect(updatedFile).toBe(mockFile);
      });
    });
  });
});