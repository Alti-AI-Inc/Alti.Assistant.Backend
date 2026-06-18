import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
// The path to the model file. Adjust if necessary based on your project structure.
// Assuming the test file is in `src/app/modules/knowledgebase/__tests__/`
// and the model is in `src/app/modules/knowledgebase/`
import KnowledgeBase from './knowledgebase.model.js';

// --- MOCK MONGOOSE ---
// We need to mock mongoose to prevent actual database interactions
// and to capture schema definitions, virtuals, methods, and statics.
vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();

  // Variables to capture schema details when the model is defined
  let capturedSchemaDefinition = {};
  let capturedSchemaOptions = {};
  const capturedVirtuals = {};
  const capturedMethods = {};
  const capturedStatics = {};
  const capturedIndexes = [];

  // Mock Schema instance methods (virtual, index)
  const mockSchemaInstance = {
    virtual: vi.fn().mockImplementation(function (name) {
      const virtualObj = {
        get: vi.fn(function (getterFn) {
          capturedVirtuals[name] = { get: getterFn };
          return virtualObj; // Allow chaining
        }),
        set: vi.fn(function (setterFn) {
          capturedVirtuals[name] = { ...capturedVirtuals[name], set: setterFn };
          return virtualObj; // Allow chaining
        }),
      };
      return virtualObj;
    }),
    // Mongoose directly assigns to .methods and .statics, so we need to provide references
    methods: capturedMethods,
    statics: capturedStatics,
    index: vi.fn().mockImplementation(function (idx) {
      capturedIndexes.push(idx);
    }),
  };

  // Mock mongoose.Schema constructor
  const Schema = vi.fn().mockImplementation(function (definition, options) {
    Object.assign(capturedSchemaDefinition, definition);
    Object.assign(capturedSchemaOptions, options);
    return mockSchemaInstance;
  });
  // Ensure Schema.Types are available for schema definition (e.g., Schema.Types.ObjectId)
  Schema.Types = actualMongoose.Schema.Types;

  // Mock mongoose.model
  const model = vi.fn().mockImplementation(function (name, schema) {
    // This mock model will be used to test static methods
    const MockModel = {
      find: vi.fn().mockReturnThis(), // Mock find to allow chaining .sort()
      sort: vi.fn().mockReturnThis(), // Mock sort
    };
    // Attach static methods defined on the schema to the mock model
    Object.assign(MockModel, capturedStatics);
    return MockModel;
  });

  // Mock mongoose.Types.ObjectId to return a valid ObjectId instance
  const ObjectId = vi.fn().mockImplementation(function () {
    return new actualMongoose.Types.ObjectId();
  });
  ObjectId.isValid = actualMongoose.Types.ObjectId.isValid; // Keep original isValid for potential validation tests

  const defaultMock = {
    ...actualMongoose.default,
    Schema,
    model,
    Types: {
      ...actualMongoose.default.Types,
      ObjectId,
    },
    _capturedSchemaDefinition: capturedSchemaDefinition,
    _capturedSchemaOptions: capturedSchemaOptions,
    _capturedVirtuals: capturedVirtuals,
    _capturedMethods: capturedMethods,
    _capturedStatics: capturedStatics,
    _capturedIndexes: capturedIndexes,
  };

  return {
    ...actualMongoose, // Spread actual mongoose for other non-mocked exports
    default: defaultMock,
    Schema, // Export mocked Schema
    model, // Export mocked model
    Types: { // Export mocked Types
      ...actualMongoose.Types,
      ObjectId,
    },
    _capturedSchemaDefinition: capturedSchemaDefinition,
    _capturedSchemaOptions: capturedSchemaOptions,
    _capturedVirtuals: capturedVirtuals,
    _capturedMethods: capturedMethods,
    _capturedStatics: capturedStatics,
    _capturedIndexes: capturedIndexes,
  };
});
// --- END MOCK MONGOOSE ---


// Helper function to create a mock KnowledgeBase document instance.
// This instance will have the actual instance methods and virtual getters bound to it,
// allowing us to test their logic without a real database.
const createMockKnowledgeBaseInstance = (overrides = {}) => {
  const defaultSettings = {
    maxDocuments: 1000,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedFileTypes: ['pdf', 'txt', 'doc', 'docx', 'html', 'md'],
  };

  const instance = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Test KB',
    userId: new mongoose.Types.ObjectId(),
    description: 'A test knowledge base',
    isActive: true,
    documentsCount: 0,
    totalFileSize: 0,
    settings: { ...defaultSettings, ...overrides.settings },
    metadata: {},
    tenantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };

  // Attach instance methods from the captured methods, binding 'this' to the current instance
  for (const methodName in mongoose._capturedMethods) {
    instance[methodName] = mongoose._capturedMethods[methodName].bind(instance);
  }

  // Attach virtual getters from the captured virtuals, binding 'this' to the current instance
  for (const virtualName in mongoose._capturedVirtuals) {
    Object.defineProperty(instance, virtualName, {
      get: mongoose._capturedVirtuals[virtualName].get.bind(instance),
      configurable: true, // Allow re-defining in tests if needed
    });
  }

  return instance;
};

describe('KnowledgeBase Model', () => {
  // Clear all mocks before each test to ensure isolation
  beforeEach(() => {
    vi.clearAllMocks();
    // Note: The schema definition, virtuals, methods, and statics are captured
    // when the `knowledgebase.model` module is first imported.
    // `vi.clearAllMocks()` only resets call counts on mocks, not the captured data.
    // For this specific file, the schema definition is static, so this is fine.
    // If the schema was dynamically generated per import, we'd need to re-import
    // the module and manually reset the captured variables.
  });

  it('should define the KnowledgeBase schema correctly', () => {
    // Check schema options (timestamps, virtuals)
    expect(mongoose._capturedSchemaOptions).toEqual(
      expect.objectContaining({
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
      })
    );

    const schemaDefinition = mongoose._capturedSchemaDefinition;

    // --- Check Field Definitions ---

    // Required fields and their custom error messages
    expect(schemaDefinition.name.required).toEqual([true, 'Knowledge base name is required']);
    expect(schemaDefinition.userId.required).toBe(true);

    // Default values
    expect(schemaDefinition.isActive.default).toBe(true);
    expect(schemaDefinition.documentsCount.default).toBe(0);
    expect(schemaDefinition.totalFileSize.default).toBe(0);
    expect(schemaDefinition.settings.maxDocuments.default).toBe(1000);
    expect(schemaDefinition.settings.maxFileSize.default).toBe(10 * 1024 * 1024); // 10MB
    expect(schemaDefinition.settings.allowedFileTypes.default).toEqual(['pdf', 'txt', 'doc', 'docx', 'html', 'md']);
    expect(schemaDefinition.metadata.default).toEqual({});
    expect(schemaDefinition.tenantId.default).toBe(null);

    // Field types
    expect(schemaDefinition.name.type).toBe(String);
    expect(schemaDefinition.userId.type).toBe(mongoose.Schema.Types.ObjectId);
    expect(schemaDefinition.description.type).toBe(String);
    expect(schemaDefinition.isActive.type).toBe(Boolean);
    expect(schemaDefinition.documentsCount.type).toBe(Number);
    expect(schemaDefinition.totalFileSize.type).toBe(Number);
    expect(schemaDefinition.settings.maxDocuments.type).toBe(Number);
    expect(schemaDefinition.settings.maxFileSize.type).toBe(Number);
    expect(schemaDefinition.settings.allowedFileTypes.type).toEqual([String]); // Mongoose stores array types as [Type]
    expect(schemaDefinition.metadata.type).toBe(mongoose.Schema.Types.Mixed);
    expect(schemaDefinition.tenantId.type).toBe(mongoose.Schema.Types.ObjectId);

    // Maxlength validators and their custom error messages
    expect(schemaDefinition.name.maxlength).toEqual([100, 'Knowledge base name cannot exceed 100 characters']);
    expect(schemaDefinition.description.maxlength).toEqual([500, 'Description cannot exceed 500 characters']);

    // References and indexes
    expect(schemaDefinition.userId.ref).toBe('User');
    expect(schemaDefinition.userId.index).toBe(true);
    expect(schemaDefinition.tenantId.ref).toBe('Tenant');
    expect(schemaDefinition.tenantId.index).toBe(true);
  });

  it('should define compound and legacy indexes', () => {
    // Verify that the `index` method on the schema was called for all expected indexes
    expect(mongoose._capturedIndexes).toHaveLength(4);
    expect(mongoose._capturedIndexes).toContainEqual({ tenantId: 1, userId: 1, name: 1 });
    expect(mongoose._capturedIndexes).toContainEqual({ tenantId: 1, userId: 1, isActive: 1, updatedAt: -1 });
    expect(mongoose._capturedIndexes).toContainEqual({ userId: 1, name: 1 });
    expect(mongoose._capturedIndexes).toContainEqual({ userId: 1, isActive: 1, updatedAt: -1 });
  });

  describe('Virtual: formattedFileSize', () => {
    it('should be defined as a virtual property with a getter', () => {
      expect(mongoose._capturedVirtuals.formattedFileSize).toBeDefined();
      expect(mongoose._capturedVirtuals.formattedFileSize.get).toBeInstanceOf(Function);
    });

    it('should return "0 Bytes" for totalFileSize of 0', () => {
      const kb = createMockKnowledgeBaseInstance({ totalFileSize: 0 });
      expect(kb.formattedFileSize).toBe('0 Bytes');
    });

    it('should format bytes correctly', () => {
      const kb = createMockKnowledgeBaseInstance({ totalFileSize: 500 }); // 500 Bytes
      expect(kb.formattedFileSize).toBe('500 Bytes');
    });

    it('should format kilobytes correctly', () => {
      const kb = createMockKnowledgeBaseInstance({ totalFileSize: 1024 }); // 1 KB
      expect(kb.formattedFileSize).toBe('1 KB');
      const kb2 = createMockKnowledgeBaseInstance({ totalFileSize: 1536 }); // 1.5 KB
      expect(kb2.formattedFileSize).toBe('1.5 KB');
      const kb3 = createMockKnowledgeBaseInstance({ totalFileSize: 1024 * 5.25 }); // 5.25 KB
      expect(kb3.formattedFileSize).toBe('5.25 KB');
    });

    it('should format megabytes correctly', () => {
      const kb = createMockKnowledgeBaseInstance({ totalFileSize: 1024 * 1024 }); // 1 MB
      expect(kb.formattedFileSize).toBe('1 MB');
      const kb2 = createMockKnowledgeBaseInstance({ totalFileSize: 1024 * 1024 * 10.5 }); // 10.5 MB
      expect(kb2.formattedFileSize).toBe('10.5 MB');
    });

    it('should format gigabytes correctly', () => {
      const kb = createMockKnowledgeBaseInstance({ totalFileSize: 1024 * 1024 * 1024 }); // 1 GB
      expect(kb.formattedFileSize).toBe('1 GB');
      const kb2 = createMockKnowledgeBaseInstance({ totalFileSize: 1024 * 1024 * 1024 * 2.75 }); // 2.75 GB
      expect(kb2.formattedFileSize).toBe('2.75 GB');
    });
  });

  describe('Instance Method: canAddDocument', () => {
    it('should be defined as an instance method', () => {
      expect(mongoose._capturedMethods.canAddDocument).toBeInstanceOf(Function);
    });

    it('should return true if no limits are exceeded', () => {
      const kb = createMockKnowledgeBaseInstance({
        documentsCount: 50,
        totalFileSize: 1 * 1024 * 1024, // 1MB
        settings: {
          maxDocuments: 100,
          maxFileSize: 10 * 1024 * 1024, // 10MB
        },
      });
      expect(kb.canAddDocument(500 * 1024)).toBe(true); // Add 500KB
    });

    it('should return true if no fileSize is provided and document count is within limits', () => {
      const kb = createMockKnowledgeBaseInstance({
        documentsCount: 50,
        totalFileSize: 1 * 1024 * 1024, // 1MB
        settings: {
          maxDocuments: 100,
          maxFileSize: 10 * 1024 * 1024, // 10MB
        },
      });
      expect(kb.canAddDocument()).toBe(true); // No fileSize provided, defaults to 0
    });

    it('should return false if maxDocuments limit is exceeded', () => {
      const kb = createMockKnowledgeBaseInstance({
        documentsCount: 100, // At limit
        totalFileSize: 1 * 1024 * 1024,
        settings: {
          maxDocuments: 100,
          maxFileSize: 10 * 1024 * 1024,
        },
      });
      expect(kb.canAddDocument(100)).toBe(false); // Adding one more document
    });

    it('should return false if maxFileSize limit is exceeded', () => {
      const kb = createMockKnowledgeBaseInstance({
        documentsCount: 50,
        totalFileSize: 9 * 1024 * 1024, // 9MB
        settings: {
          maxDocuments: 100,
          maxFileSize: 10 * 1024 * 1024, // 10MB
        },
      });
      expect(kb.canAddDocument(2 * 1024 * 1024)).toBe(false); // Add 2MB, total would be 11MB
    });

    it('should return false if both limits are exceeded', () => {
      const kb = createMockKnowledgeBaseInstance({
        documentsCount: 100,
        totalFileSize: 9 * 1024 * 1024,
        settings: {
          maxDocuments: 100,
          maxFileSize: 10 * 1024 * 1024,
        },
      });
      expect(kb.canAddDocument(2 * 1024 * 1024)).toBe(false);
    });

    it('should return true if totalFileSize is exactly at maxFileSize after adding', () => {
      const kb = createMockKnowledgeBaseInstance({
        documentsCount: 50,
        totalFileSize: 9 * 1024 * 1024, // 9MB
        settings: {
          maxDocuments: 100,
          maxFileSize: 10 * 1024 * 1024, // 10MB
        },
      });
      expect(kb.canAddDocument(1 * 1024 * 1024)).toBe(true); // Add 1MB, total would be 10MB
    });
  });

  describe('Static Method: findByUserId', () => {
    it('should be defined as a static method', () => {
      expect(mongoose._capturedStatics.findByUserId).toBeInstanceOf(Function);
    });

    it('should call find with correct userId and default isActive=true, sorted by updatedAt descending', () => {
      const mockUserId = new mongoose.Types.ObjectId();
      // KnowledgeBase is the mocked model returned by mongoose.model
      KnowledgeBase.findByUserId(mockUserId);

      expect(KnowledgeBase.find).toHaveBeenCalledTimes(1);
      expect(KnowledgeBase.find).toHaveBeenCalledWith({ userId: mockUserId, isActive: true });
      expect(KnowledgeBase.sort).toHaveBeenCalledTimes(1);
      expect(KnowledgeBase.sort).toHaveBeenCalledWith({ updatedAt: -1 });
    });

    it('should call find with correct userId and specified isActive=false, sorted by updatedAt descending', () => {
      const mockUserId = new mongoose.Types.ObjectId();
      KnowledgeBase.findByUserId(mockUserId, false);

      expect(KnowledgeBase.find).toHaveBeenCalledTimes(1);
      expect(KnowledgeBase.find).toHaveBeenCalledWith({ userId: mockUserId, isActive: false });
      expect(KnowledgeBase.sort).toHaveBeenCalledTimes(1);
      expect(KnowledgeBase.sort).toHaveBeenCalledWith({ updatedAt: -1 });
    });

    it('should return the result of the chained query', () => {
      const mockUserId = new mongoose.Types.ObjectId();
      const mockQueryResult = [{ name: 'KB1' }];
      // Mock the chained calls: find() returns an object, which then has sort() called on it.
      // sort() then returns the final result.
      KnowledgeBase.find.mockReturnValueOnce({ sort: vi.fn().mockReturnValueOnce(mockQueryResult) });

      const result = KnowledgeBase.findByUserId(mockUserId);
      expect(result).toBe(mockQueryResult);
    });
  });
});