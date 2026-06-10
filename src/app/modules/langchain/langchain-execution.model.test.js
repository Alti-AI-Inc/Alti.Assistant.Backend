import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock mongoose
const mockSchemaInstance = {}; // We don't need to mock methods on the schema instance itself for this test

const mockMongoose = {
  Schema: vi.fn((definition, options) => mockSchemaInstance), // Capture definition and options
  model: vi.fn((name, schema) => ({ name, schema, isMongooseModel: true })), // Return a mock model object
  models: {}, // Initially empty to simulate first-time model creation
  Schema: {
    Types: {
      ObjectId: 'ObjectId', // Mock the type reference
      Mixed: 'Mixed',       // Mock the type reference
    }
  }
};

// Mock mongoose globally for the test file
vi.mock('mongoose', () => ({
  default: mockMongoose,
}));

// Import the module *after* mocking mongoose.
// This import will trigger the execution of the module,
// which in turn calls new mongoose.Schema() and mongoose.model() for the first time.
// This is for the scenario where the model is NOT already defined.
import LangchainExecution from './langchain-execution.model';

describe('LangchainExecution Model Definition', () => {
  // No beforeEach needed for clearing mocks for the first set of tests,
  // as the module is imported once at the top level.
  // The state of mockMongoose.models is initially empty, so model() will be called.

  it('should define the LangchainExecution schema correctly', () => {
    expect(mockMongoose.Schema).toHaveBeenCalledTimes(1);

    const schemaDefinition = mockMongoose.Schema.mock.calls[0][0];
    const schemaOptions = mockMongoose.Schema.mock.calls[0][1];

    // Verify top-level fields
    expect(schemaDefinition).toHaveProperty('chainId');
    expect(schemaDefinition.chainId.type).toBe(mockMongoose.Schema.Types.ObjectId);
    expect(schemaDefinition.chainId.ref).toBe('LangchainChain');
    expect(schemaDefinition.chainId.required).toBe(true);
    expect(schemaDefinition.chainId.index).toBe(true);

    expect(schemaDefinition).toHaveProperty('userId');
    expect(schemaDefinition.userId.type).toBe(String);
    expect(schemaDefinition.userId.required).toBe(true);
    expect(schemaDefinition.userId.index).toBe(true);

    expect(schemaDefinition).toHaveProperty('inputs');
    expect(schemaDefinition.inputs.type).toBe(mockMongoose.Schema.Types.Mixed);
    expect(schemaDefinition.inputs.default).toEqual({});

    expect(schemaDefinition).toHaveProperty('outputs');
    expect(schemaDefinition.outputs.type).toBe(mockMongoose.Schema.Types.Mixed);
    expect(schemaDefinition.outputs.default).toEqual({});

    // Verify stepsExecution array of objects
    expect(schemaDefinition).toHaveProperty('stepsExecution');
    expect(Array.isArray(schemaDefinition.stepsExecution)).toBe(true);
    expect(schemaDefinition.stepsExecution.length).toBe(1); // It's an array with one object schema
    const stepSchema = schemaDefinition.stepsExecution[0];

    expect(stepSchema).toHaveProperty('stepName');
    expect(stepSchema.stepName.type).toBe(String);
    expect(stepSchema.stepName.required).toBe(true);

    expect(stepSchema).toHaveProperty('stepType');
    expect(stepSchema.stepType.type).toBe(String);
    expect(stepSchema.stepType.required).toBe(true);

    expect(stepSchema).toHaveProperty('input');
    expect(stepSchema.input).toBe(mockMongoose.Schema.Types.Mixed);

    expect(stepSchema).toHaveProperty('output');
    expect(stepSchema.output).toBe(mockMongoose.Schema.Types.Mixed);

    expect(stepSchema).toHaveProperty('durationMs');
    expect(stepSchema.durationMs).toBe(Number);

    expect(stepSchema).toHaveProperty('status');
    expect(stepSchema.status.type).toBe(String);
    expect(stepSchema.status.required).toBe(true);
    expect(stepSchema.status.enum).toEqual(['success', 'failed']);

    expect(stepSchema).toHaveProperty('error');
    expect(stepSchema.error).toBe(String);

    // Verify top-level status
    expect(schemaDefinition).toHaveProperty('status');
    expect(schemaDefinition.status.type).toBe(String);
    expect(schemaDefinition.status.required).toBe(true);
    expect(schemaDefinition.status.enum).toEqual(['running', 'success', 'failed']);
    expect(schemaDefinition.status.default).toBe('running');

    expect(schemaDefinition).toHaveProperty('totalDurationMs');
    expect(schemaDefinition.totalDurationMs.type).toBe(Number);
    expect(schemaDefinition.totalDurationMs.default).toBe(0);

    expect(schemaDefinition).toHaveProperty('gcsLogUri');
    expect(schemaDefinition.gcsLogUri.type).toBe(String);
    expect(schemaDefinition.gcsLogUri.default).toBe('');

    // Verify tokenUsage nested object
    expect(schemaDefinition).toHaveProperty('tokenUsage');
    expect(schemaDefinition.tokenUsage).toBeInstanceOf(Object); // It's a plain object for nested schema
    expect(schemaDefinition.tokenUsage).toHaveProperty('promptTokens');
    expect(schemaDefinition.tokenUsage.promptTokens.type).toBe(Number);
    expect(schemaDefinition.tokenUsage.promptTokens.default).toBe(0);

    expect(schemaDefinition.tokenUsage).toHaveProperty('completionTokens');
    expect(schemaDefinition.tokenUsage.completionTokens.type).toBe(Number);
    expect(schemaDefinition.tokenUsage.completionTokens.default).toBe(0);

    expect(schemaDefinition.tokenUsage).toHaveProperty('totalTokens');
    expect(schemaDefinition.tokenUsage.totalTokens.type).toBe(Number);
    expect(schemaDefinition.tokenUsage.totalTokens.default).toBe(0);

    // Verify schema options
    expect(schemaOptions).toEqual({ timestamps: true });
  });

  it('should define the LangchainExecution model with the correct name and schema', () => {
    expect(mockMongoose.model).toHaveBeenCalledTimes(1);
    expect(mockMongoose.model).toHaveBeenCalledWith('LangchainExecution', mockSchemaInstance);
  });

  it('should export the LangchainExecution model', () => {
    // The exported value should be the result of mongoose.model
    expect(LangchainExecution).toEqual({ name: 'LangchainExecution', schema: mockSchemaInstance, isMongooseModel: true });
  });

  it('should not redefine the model if it already exists in mongoose.models', async () => {
    // Clear mocks for this specific test
    mockMongoose.Schema.mockClear();
    mockMongoose.model.mockClear();

    // Simulate an existing model in mongoose.models
    const existingModel = { name: 'LangchainExecution', isExisting: true };
    mockMongoose.models.LangchainExecution = existingModel;

    // Reset module cache to ensure the module's top-level code is re-evaluated
    vi.resetModules();

    // Re-mock mongoose for this specific test after resetting modules
    // Ensure the models cache is set for this re-import
    vi.doMock('mongoose', () => {
      mockMongoose.models.LangchainExecution = existingModel;
      // Clear previous calls for this specific test (though they should already be clear from above)
      mockMongoose.Schema.mockClear();
      mockMongoose.model.mockClear();
      return { default: mockMongoose };
    });

    // Dynamically import the module again after resetting and re-mocking
    const { default: LangchainExecutionReimported } = await import('./langchain-execution.model');

    expect(mockMongoose.Schema).not.toHaveBeenCalled(); // Schema should not be created again
    expect(mockMongoose.model).not.toHaveBeenCalled(); // Model should not be defined again
    expect(LangchainExecutionReimported).toBe(existingModel); // Should return the existing model
  });
});