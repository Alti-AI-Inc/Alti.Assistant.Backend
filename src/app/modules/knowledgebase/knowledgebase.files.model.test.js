import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// These objects will be populated by the model file when it's imported,
// because our mock of mongoose.Schema captures the definitions.
const schemaDefinition = {};
const schemaOptions = {};
const statics = {};
const methods = {};
const virtuals = {};
const indexes = [];

const {
  mockSchemaInstance
} = vi.hoisted(() => {
  const mockSchemaInstance = {
    index: vi.fn().mockImplementation((indexDef) => indexes.push(indexDef)),
    virtual: vi.fn().mockImplementation((name) => ({
      get: (getter) => {
        virtuals[name] = { get: getter };
      },
    })),
    statics, // Plain object to be populated by the model file
    methods, // Plain object to be populated by the model file
  };

  return {
    mockSchemaInstance
  };
});

// Mock the mongoose module before importing the model file
vi.mock('mongoose', () => ({
  default: {
    Schema: vi.fn().mockImplementation((def, opt) => {
      // Capture the schema definition and options for later assertions
      Object.assign(schemaDefinition, def);
      Object.assign(schemaOptions, opt);
      return mockSchemaInstance;
    }),
    model: vi.fn().mockReturnValue({}), // Return a dummy object for the model
    Schema: {
      Types: {
        ObjectId: String, // Treat ObjectId as a String for simplicity
        Mixed: Object,    // Treat Mixed as an Object
      },
    },
  },
}));

// Import the model file AFTER setting up the mocks.
// This will execute the file's code, calling our mocked mongoose.Schema()
// and populating our test objects (statics, methods, virtuals, etc.).
import KnowledgebaseFile from './knowledgebase.files.model.js';

describe('KnowledgebaseFile Model', () => {
  let mockQueryContext;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the 'this' context for static methods, simulating the Mongoose query chain
    mockQueryContext = {
      find: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 'some-id' }]),
    };
  });

  describe('Schema Definition', () => {
    it('should have all required fields defined with correct types', () => {
      expect(schemaDefinition.fileName.type).toBe(String);
      expect(schemaDefinition.fileName.required).toBe(true);
      expect(schemaDefinition.originalName.type).toBe(String);
      expect(schemaDefinition.originalName.required).toBe(true);
      expect(schemaDefinition.fileType.type).toBe(String);
      expect(schemaDefinition.fileType.required).toBe(true);
      expect(schemaDefinition.fileSize.type).toBe(Number);
      expect(schemaDefinition.fileSize.required).toBe(true);
      expect(schemaDefinition.gcsUrl.type).toBe(String);
      expect(schemaDefinition.gcsUrl.required).toBe(true);
      expect(schemaDefinition.gcsPath.type).toBe(String);
      expect(schemaDefinition.gcsPath.required).toBe(true);
      expect(schemaDefinition.documentId.type).toBe(String);
      expect(schemaDefinition.documentId.required).toBe(true);
      expect(schemaDefinition.knowledgebotId.type).toBe(String);
      expect(schemaDefinition.knowledgebotId.required).toBe(true);
      expect(schemaDefinition.userId.type).toBe(String);
      expect(schemaDefinition.userId.required).toBe(true);
    });

    it('should have correct default values for optional fields', () => {
      expect(schemaDefinition.chunkCount.default).toBe(0);
      expect(schemaDefinition.isActive.default).toBe(true);
      expect(schemaDefinition.metadata.default).toEqual({});
      expect(schemaDefinition.tenantId.default).toBe(null);
    });
  });

  describe('Schema Options', () => {
    it('should enable timestamps', () => {
      expect(schemaOptions.timestamps).toBe(true);
    });

    it('should configure toJSON to include virtuals and transform output correctly', () => {
      expect(schemaOptions.toJSON.virtuals).toBe(true);
      const ret = { _id: '123', __v: 0, name: 'test' };
      const transformed = schemaOptions.toJSON.transform({}, ret);
      expect(transformed.id).toBe('123');
      expect(transformed._id).toBeUndefined();
      expect(transformed.__v).toBeUndefined();
      expect(transformed.name).toBe('test');
    });

    it('should configure toObject to include virtuals', () => {
      expect(schemaOptions.toObject.virtuals).toBe(true);
    });
  });

  describe('Indexes', () => {
    it('should define correct compound indexes for performance', () => {
      expect(indexes).toContainEqual({ knowledgebotId: 1, isActive: 1, createdAt: -1 });
      expect(indexes).toContainEqual({ userId: 1, isActive: 1, createdAt: -1 });
      expect(indexes).toContainEqual({ userId: 1, knowledgebotId: 1, isActive: 1, createdAt: -1 });
      expect(indexes).toContainEqual({ tenantId: 1, isActive: 1, createdAt: -1 });
      expect(indexes).toContainEqual({ createdAt: -1 });
      expect(indexes.length).toBe(5);
    });
  });

  describe('Virtuals', () => {
    describe('formattedFileSize', () => {
      const getter = virtuals.formattedFileSize.get;

      it('should return "0 Bytes" for 0 fileSize', () => {
        expect(getter.call({ fileSize: 0 })).toBe('0 Bytes');
      });

      it('should format bytes correctly', () => {
        expect(getter.call({ fileSize: 500 })).toBe('500 Bytes');
      });

      it('should format kilobytes correctly', () => {
        expect(getter.call({ fileSize: 1536 })).toBe('1.5 KB'); // 1.5 KB
      });

      it('should format megabytes correctly', () => {
        expect(getter.call({ fileSize: 1258291 })).toBe('1.2 MB'); // ~1.2 MB
      });

      it('should format gigabytes correctly', () => {
        expect(getter.call({ fileSize: 1610612736 })).toBe('1.5 GB'); // 1.5 GB
      });
    });
  });

  describe('Static Methods', () => {
    describe('findByKnowledgebotId', () => {
      it('should query for active files by default', async () => {
        await mockSchemaInstance.statics.findByKnowledgebotId.call(mockQueryContext, 'bot123');
        expect(mockQueryContext.find).toHaveBeenCalledWith({ knowledgebotId: 'bot123', isActive: true });
        expect(mockQueryContext.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(mockQueryContext.lean).toHaveBeenCalled();
      });

      it('should query for all files when activeOnly is false', async () => {
        await mockSchemaInstance.statics.findByKnowledgebotId.call(mockQueryContext, 'bot123', false);
        expect(mockQueryContext.find).toHaveBeenCalledWith({ knowledgebotId: 'bot123' });
      });
    });

    describe('findByUserId', () => {
      it('should query for active files by default', async () => {
        await mockSchemaInstance.statics.findByUserId.call(mockQueryContext, 'user123');
        expect(mockQueryContext.find).toHaveBeenCalledWith({ userId: 'user123', isActive: true });
        expect(mockQueryContext.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(mockQueryContext.lean).toHaveBeenCalled();
      });

      it('should query for all files when activeOnly is false', async () => {
        await mockSchemaInstance.statics.findByUserId.call(mockQueryContext, 'user123', false);
        expect(mockQueryContext.find).toHaveBeenCalledWith({ userId: 'user123' });
      });
    });

    describe('findByTenantId', () => {
      it('should query for active files by default', async () => {
        await mockSchemaInstance.statics.findByTenantId.call(mockQueryContext, 'tenant123');
        expect(mockQueryContext.find).toHaveBeenCalledWith({ tenantId: 'tenant123', isActive: true });
        expect(mockQueryContext.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(mockQueryContext.lean).toHaveBeenCalled();
      });

      it('should query for all files when activeOnly is false', async () => {
        await mockSchemaInstance.statics.findByTenantId.call(mockQueryContext, 'tenant123', false);
        expect(mockQueryContext.find).toHaveBeenCalledWith({ tenantId: 'tenant123' });
      });
    });

    describe('findByUserAndKnowledgebot', () => {
      it('should query for active files by default', async () => {
        await mockSchemaInstance.statics.findByUserAndKnowledgebot.call(mockQueryContext, 'user123', 'bot123');
        expect(mockQueryContext.find).toHaveBeenCalledWith({ userId: 'user123', knowledgebotId: 'bot123', isActive: true });
        expect(mockQueryContext.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(mockQueryContext.lean).toHaveBeenCalled();
      });

      it('should query for all files when activeOnly is false', async () => {
        await mockSchemaInstance.statics.findByUserAndKnowledgebot.call(mockQueryContext, 'user123', 'bot123', false);
        expect(mockQueryContext.find).toHaveBeenCalledWith({ userId: 'user123', knowledgebotId: 'bot123' });
      });
    });
  });

  describe('Instance Methods', () => {
    describe('softDelete', () => {
      it('should set isActive to false and save the document', async () => {
        const mockDoc = {
          isActive: true,
          save: vi.fn().mockResolvedValueThis(),
        };

        await mockSchemaInstance.methods.softDelete.call(mockDoc);

        expect(mockDoc.isActive).toBe(false);
        expect(mockDoc.save).toHaveBeenCalledTimes(1);
      });
    });
  });
});