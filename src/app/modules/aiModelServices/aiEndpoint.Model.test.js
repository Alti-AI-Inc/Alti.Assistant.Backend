import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Schema.Types.ObjectId
class MockObjectId {}

// Mock Schema instance methods
const mockSchemaInstance = {
  // This `path` mock is crucial for checking schema type properties
  path: vi.fn().mockImplementation((key) => {
    // Access the schema definition that was passed to the constructor.
    // Since the constructor is called only once at module load, we get it from `mockSchemaConstructor.mock.calls[0][0]`.
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    const field = schemaDefinition[key];
    if (!field) return undefined;

    let instanceType;
    if (field.type === String) instanceType = 'String';
    else if (field.type === Number) instanceType = 'Number';
    else if (field.type === Boolean) instanceType = 'Boolean';
    else if (field.type === MockObjectId) instanceType = 'ObjectId';
    else if (field.type && field.type.name) instanceType = field.type.name; // Fallback for other types

    return {
      instance: instanceType,
      isRequired: field.required || false,
      isUnique: field.unique || false,
      defaultValue: field.default,
      options: field, // Store all options for detailed checks
    };
  }),
  // Mongoose automatically handles `index: true` in schema definition,
  // so `schema.index()` is not explicitly called in the source file.
  // We include it here for completeness if the schema were to use it.
  index: vi.fn(),
};

const {
  mockSchemaConstructor,
  mockModel
} = vi.hoisted(() => {
  // Mock Schema constructor
  const mockSchemaConstructor = vi.fn(function(definition, options) {
    // Assign mock methods to `this` to simulate a Mongoose Schema instance
    Object.assign(this, mockSchemaInstance);
    this.definition = definition; // Store the definition for inspection
    this.options = options; // Store options too
    return this; // Return `this` to simulate constructor behavior
  });

  // Mock mongoose.model
  const mockModel = vi.fn().mockImplementation((name, schema) => {
    // Return a dummy model object that includes the schema for verification
    return { modelName: name, schema: schema };
  });

  return {
    mockSchemaConstructor,
    mockModel
  };
});

// Set up the mock for the 'mongoose' module
vi.mock('mongoose', () => ({
  default: {
    Schema: mockSchemaConstructor,
    model: mockModel,
    // Expose Schema.Types for ObjectId
    Schema: {
      Types: {
        ObjectId: MockObjectId, // Use our mock ObjectId
      },
    },
  },
}));

// Import the file under test AFTER mocking mongoose.
// This import will trigger the calls to `new mongoose.Schema()` and `mongoose.model()`.
import AiEndpoint from './aiEndpoint.Model';

describe('AiEndpoint Model', () => {
  // These variables will hold the arguments captured from the initial module load
  let capturedSchemaDefinition;
  let capturedSchemaOptions;
  let capturedSchemaInstance;
  let capturedModelName;
  let capturedModelSchema;

  beforeEach(() => {
    // Clear mocks for methods that might be called multiple times within tests (like `path`)
    mockSchemaInstance.path.mockClear();
    mockSchemaInstance.index.mockClear();

    // Capture the arguments from the *initial* module import, which happens once.
    // We don't clear `mockSchemaConstructor` or `mockModel` because they were called only once.
    expect(mockSchemaConstructor).toHaveBeenCalledTimes(1);
    capturedSchemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    capturedSchemaOptions = mockSchemaConstructor.mock.calls[0][1];
    capturedSchemaInstance = mockSchemaConstructor.mock.results[0].value; // The returned mockSchemaInstance

    expect(mockModel).toHaveBeenCalledTimes(1);
    capturedModelName = mockModel.mock.calls[0][0];
    capturedModelSchema = mockModel.mock.calls[0][1];
  });

  it('should define the AiEndpoint schema with correct fields and properties', () => {
    expect(capturedSchemaDefinition).toBeDefined();

    // Check each field's type, required, unique, default, ref, index properties
    expect(capturedSchemaDefinition.title).toEqual({ type: String, required: true, unique: true });
    expect(capturedSchemaDefinition.nickName).toEqual({ type: String, required: true, unique: true });
    expect(capturedSchemaDefinition.enabled).toEqual({ type: Boolean, default: false });
    expect(capturedSchemaDefinition.default).toEqual({ type: Boolean, default: false });
    expect(capturedSchemaDefinition.addPath).toEqual({ type: String, required: true });
    expect(capturedSchemaDefinition.historyPath).toEqual({ type: String, required: true });
    expect(capturedSchemaDefinition.deletePath).toEqual({ type: String, required: true });

    // For tenantId, check against our MockObjectId
    expect(capturedSchemaDefinition.tenantId.type).toBe(MockObjectId);
    expect(capturedSchemaDefinition.tenantId.ref).toBe('Tenant');
    expect(capturedSchemaDefinition.tenantId.default).toBeNull();
    expect(capturedSchemaDefinition.tenantId.index).toBe(true);

    // Use the mocked schemaInstance.path() to verify properties as Mongoose would
    const titlePath = capturedSchemaInstance.path('title');
    expect(titlePath.instance).toBe('String');
    expect(titlePath.isRequired).toBe(true);
    expect(titlePath.isUnique).toBe(true);

    const enabledPath = capturedSchemaInstance.path('enabled');
    expect(enabledPath.instance).toBe('Boolean');
    expect(enabledPath.isRequired).toBe(false);
    expect(enabledPath.defaultValue).toBe(false);

    const tenantIdPath = capturedSchemaInstance.path('tenantId');
    expect(tenantIdPath.instance).toBe('ObjectId');
    expect(tenantIdPath.options.ref).toBe('Tenant');
    expect(tenantIdPath.options.index).toBe(true);
  });

  it('should create the AiEndpoint model with the correct name and schema instance', () => {
    expect(capturedModelName).toBe('AiEndpoint');
    expect(capturedModelSchema).toBe(capturedSchemaInstance); // Ensure it's the same schema instance

    // Verify that the exported AiEndpoint is the result of mongoose.model
    expect(AiEndpoint).toEqual({ modelName: 'AiEndpoint', schema: capturedSchemaInstance });
  });

  it('should not pass any specific options to the schema constructor', () => {
    // Mongoose Schema constructor can take options as a second argument.
    // In this file, no options are passed, so it should be undefined.
    expect(capturedSchemaOptions).toBeUndefined();
  });
});