import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// Mock mongoose to prevent actual database interactions
vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();

  // Mock Schema constructor
  const mockSchemaInstance = {
    // Add any methods or properties that might be called on a schema instance if needed
  };
  const mockSchema = vi.fn(() => mockSchemaInstance);
  mockSchema.Types = actualMongoose.Schema.Types; // Keep original Types for validation

  // Mock model function
  const mockModel = vi.fn((name, schema) => ({
    // Simulate a Mongoose model instance
    modelName: name,
    schema: schema,
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    // ... other common model methods
  }));

  return {
    ...actualMongoose,
    default: {
      ...actualMongoose.default,
      Schema: mockSchema,
      model: mockModel,
    },
    Schema: mockSchema,
    model: mockModel,
  };
});

// Import the module under test AFTER mocking mongoose
// This ensures that when tools.model.js is evaluated, it uses our mocked mongoose
const Tool = await import('./tools.model.js').then(m => m.default);

describe('Tool Model', () => {
  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
  });

  it('should define the ToolSchema correctly with expected fields and types', () => {
    // Expect mongoose.Schema to have been called once
    expect(mongoose.Schema).toHaveBeenCalledTimes(1);

    // Get the arguments passed to the Schema constructor
    const [schemaDefinition, schemaOptions] = mongoose.Schema.mock.calls[0];

    // Verify schema definition
    expect(schemaDefinition).toBeDefined();
    expect(schemaDefinition.slug).toEqual({ type: String, required: true });
    expect(schemaDefinition.name).toEqual({ type: String, required: true });
    expect(schemaDefinition.description).toEqual({ type: String, required: false });
    expect(schemaDefinition.appName).toEqual({ type: String, required: false });
    expect(schemaDefinition.embedding).toEqual({ type: [Number], required: false });
    expect(schemaDefinition.tenantId).toEqual({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    });

    // Verify schema options
    expect(schemaOptions).toBeDefined();
    expect(schemaOptions.strict).toBe(false);
  });

  it('should create the Tool model correctly using the defined schema', () => {
    // Expect mongoose.model to have been called once
    expect(mongoose.model).toHaveBeenCalledTimes(1);

    // Get the arguments passed to the model function
    const [modelName, schemaInstance] = mongoose.model.mock.calls[0];

    // Verify the model name
    expect(modelName).toBe('Tool');

    // Verify that the schema instance passed to model is the one created by mongoose.Schema
    // Since mongoose.Schema is mocked to return a specific instance, we can check for that.
    expect(schemaInstance).toBeInstanceOf(Object); // It's our mock object
    // More robust check: ensure it's the *same* instance returned by the Schema constructor
    expect(schemaInstance).toBe(mongoose.Schema.mock.results[0].value);
  });

  it('should export the created Tool model', () => {
    // Verify that the default export is the result of mongoose.model
    // Since mongoose.model is mocked to return a specific object, we can check for that.
    expect(Tool).toBeDefined();
    expect(Tool.modelName).toBe('Tool');
    expect(Tool.schema).toBe(mongoose.Schema.mock.results[0].value);
  });
});