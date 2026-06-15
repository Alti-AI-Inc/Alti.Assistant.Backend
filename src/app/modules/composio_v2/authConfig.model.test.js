import { describe, it, expect, vi } from 'vitest';

// Mock mongoose before importing the model
const mockSchemaInstance = {
  index: vi.fn(), // Mock the index method
  paths: {}, // Will be populated by the mock Schema constructor
  options: {}, // Will be populated by the mock Schema constructor
  indexes: vi.fn().mockImplementation(() => []), // Mock the indexes method to return an array of indexes
};

// Mock mongoose.Types.ObjectId as a function/constructor
const MockObjectId = function() {};

const {
  mockMongoose
} = vi.hoisted(() => {
  const mockMongoose = {
    Schema: vi.fn().mockImplementation((definition, options) => {
      // Simulate Mongoose's internal path processing for basic checks
      mockSchemaInstance.paths = {};
      for (const key in definition) {
        const fieldDef = definition[key];
        // Simulate a SchemaType object for basic checks
        mockSchemaInstance.paths[key] = {
          path: key,
          instance: fieldDef.type === String ? 'String' :
                    fieldDef.type === Boolean ? 'Boolean' :
                    fieldDef.type === Number ? 'Number' :
                    fieldDef.type === Date ? 'Date' :
                    fieldDef.type === MockObjectId ? 'ObjectID' : // Check against our mock ObjectId
                    undefined, // Default or other types
          isRequired: fieldDef.required || false,
          defaultValue: fieldDef.default,
          options: fieldDef, // Keep original definition for deeper checks
          caster: fieldDef.ref ? { options: { ref: fieldDef.ref } } : undefined, // Simulate ref property
          _index: fieldDef.index, // Simulate index property
        };
      }
      mockSchemaInstance.options = options;
      return mockSchemaInstance;
    }),
    model: vi.fn().mockImplementation((name, schema) => {
      // Return a mock model that exposes the schema
      return { modelName: name, schema: schema };
    }),
    Types: {
      ObjectId: MockObjectId, // Use our mock ObjectId
    },
  };

  return {
    mockMongoose
  };
});

vi.mock('mongoose', () => mockMongoose);

// Import the model AFTER mocking mongoose
import AuthConfig from './authConfig.model';

describe('AuthConfig Model', () => {
  it('should define the AuthConfigSchema correctly', () => {
    expect(mockMongoose.Schema).toHaveBeenCalledTimes(1);
    const [schemaDefinition, schemaOptions] = mockMongoose.Schema.mock.calls[0];

    // Check schema definition structure
    expect(schemaDefinition).toBeDefined();
    expect(schemaDefinition.app).toBeDefined();
    expect(schemaDefinition.authConfigId).toBeDefined();
    expect(schemaDefinition.authSchema).toBeDefined();
    expect(schemaDefinition.isComposioManaged).toBeDefined();
    expect(schemaDefinition.tenantId).toBeDefined();

    // Check schema options
    expect(schemaOptions).toEqual({ timestamps: true });
  });

  it('should have correct field types and properties', () => {
    const schemaPaths = mockSchemaInstance.paths;

    // app field
    expect(schemaPaths.app.instance).toBe('String');
    expect(schemaPaths.app.isRequired).toBe(true);
    expect(schemaPaths.app.options.index).toBe(true); // Check explicit index property

    // authConfigId field
    expect(schemaPaths.authConfigId.instance).toBe('String');
    expect(schemaPaths.authConfigId.isRequired).toBe(true);

    // authSchema field
    expect(schemaPaths.authSchema.instance).toBe('String');
    expect(schemaPaths.authSchema.isRequired).toBe(false); // required: false

    // isComposioManaged field
    expect(schemaPaths.isComposioManaged.instance).toBe('Boolean');
    expect(schemaPaths.isComposioManaged.defaultValue).toBe(false);

    // tenantId field
    expect(schemaPaths.tenantId.instance).toBe('ObjectID'); // Mongoose maps ObjectId to ObjectID
    expect(schemaPaths.tenantId.isRequired).toBe(false);
    expect(schemaPaths.tenantId.defaultValue).toBe(null);
    expect(schemaPaths.tenantId.caster.options.ref).toBe('Tenant');
    expect(schemaPaths.tenantId.options.index).toBe(true); // Check explicit index property
  });

  it('should have timestamps enabled', () => {
    expect(mockSchemaInstance.options.timestamps).toBe(true);
  });

  it('should define a compound unique index on app and tenantId', () => {
    expect(mockSchemaInstance.index).toHaveBeenCalledTimes(1);
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ app: 1, tenantId: 1 }, { unique: true });
  });

  it('should create and export the AuthConfig model', () => {
    expect(mockMongoose.model).toHaveBeenCalledTimes(1);
    expect(mockMongoose.model).toHaveBeenCalledWith('AuthConfig', mockSchemaInstance);
    expect(AuthConfig).toBeDefined();
    expect(AuthConfig.modelName).toBe('AuthConfig');
    expect(AuthConfig.schema).toBe(mockSchemaInstance);
  });
});