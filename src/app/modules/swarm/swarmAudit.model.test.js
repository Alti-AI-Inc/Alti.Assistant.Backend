import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock mongoose to control its behavior and capture schema/model definitions
const mockSchemaInstance = {
  path: vi.fn().mockReturnThis(), // Mock path method to allow chaining
  required: vi.fn().mockReturnThis(),
  enum: vi.fn().mockReturnThis(),
  default: vi.fn().mockReturnThis(),
  index: vi.fn().mockReturnThis(),
  add: vi.fn(),
  set: vi.fn(),
  // Add other schema methods if they were used in the model file (e.g., pre, post, method, static, virtual)
};

const mockMongoose = {
  Schema: vi.fn(function(definition, options) {
    // Store the definition and options on the mock function itself for easy access in tests
    mockMongoose.Schema.lastDefinition = definition;
    mockMongoose.Schema.lastOptions = options;
    return mockSchemaInstance; // Return a consistent mock schema instance
  }),
  model: vi.fn((name, schema) => ({ name, schema, isMongooseModel: true })), // Return a mock model object
  models: {}, // Simulate mongoose.models cache
};

// Apply the mock for the 'mongoose' module
vi.mock('mongoose', () => ({
  default: mockMongoose,
}));

describe('SwarmAudit Model', () => {
  let SwarmAuditModule; // To hold the imported module
  let SwarmAuditModel; // To hold the default export (the Mongoose model)

  beforeEach(async () => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();

    // Reset mongoose.models cache for each test
    mockMongoose.models = {};

    // Clear captured schema definition/options from previous test runs
    mockMongoose.Schema.lastDefinition = undefined;
    mockMongoose.Schema.lastOptions = undefined;

    // Dynamically import the module under test.
    // This ensures that the module is re-evaluated with fresh mocks for each test,
    // which is crucial for testing the `mongoose.models.SwarmAudit || ...` logic.
    SwarmAuditModule = await import('../swarmAudit.model');
    SwarmAuditModel = SwarmAuditModule.default;
  });

  it('should define the SwarmAuditSchema correctly', () => {
    // Verify that mongoose.Schema constructor was called exactly once
    expect(mockMongoose.Schema).toHaveBeenCalledTimes(1);

    // Retrieve the captured schema definition and options
    const schemaDefinition = mockMongoose.Schema.lastDefinition;
    const schemaOptions = mockMongoose.Schema.lastOptions;

    expect(schemaDefinition).toBeDefined();
    expect(schemaOptions).toBeDefined();

    // Test userId field
    expect(schemaDefinition.userId).toEqual({
      type: String,
      required: true,
      index: true,
    });

    // Test toolName field
    expect(schemaDefinition.toolName).toEqual({
      type: String,
      required: true,
      index: true,
    });

    // Test type field
    expect(schemaDefinition.type).toEqual({
      type: String,
      enum: ['dynamic-skill', 'standard-tool', 'reflection-self-healing'],
      default: 'dynamic-skill',
      index: true,
    });

    // Test attempts array field and its sub-schema
    expect(Array.isArray(schemaDefinition.attempts)).toBe(true);
    const attemptSubSchema = schemaDefinition.attempts[0];
    expect(attemptSubSchema.attempt).toBe(Number);
    expect(attemptSubSchema.timestamp).toEqual({ type: Date, default: Date.now });
    expect(attemptSubSchema.missingPackage).toBe(String);
    expect(attemptSubSchema.installSuccess).toBe(Boolean);
    expect(attemptSubSchema.stdout).toBe(String);
    expect(attemptSubSchema.stderr).toBe(String);
    expect(attemptSubSchema.durationMs).toBe(Number);

    // Test status field
    expect(schemaDefinition.status).toEqual({
      type: String,
      enum: ['success', 'failed', 'security-blocked', 'resource-aborted'],
      required: true,
      index: true,
    });

    // Test finalResult field
    expect(schemaDefinition.finalResult).toEqual({
      type: String,
    });

    // Test errorMessage field
    expect(schemaDefinition.errorMessage).toEqual({
      type: String,
    });

    // Test schema options (timestamps)
    expect(schemaOptions.timestamps).toBe(true);
  });

  it('should create and export the SwarmAudit model if it is not already defined in mongoose.models', () => {
    // Verify that mongoose.model was called exactly once
    expect(mockMongoose.model).toHaveBeenCalledTimes(1);
    // Verify it was called with the correct name and the schema instance
    expect(mockMongoose.model).toHaveBeenCalledWith('SwarmAudit', mockSchemaInstance);
    // Verify the exported model is the one created by our mock
    expect(SwarmAuditModel).toBeDefined();
    expect(SwarmAuditModel.name).toBe('SwarmAudit');
    expect(SwarmAuditModel.isMongooseModel).toBe(true); // Custom flag from our mock
  });

  it('should use an existing model if already defined in mongoose.models', async () => {
    // Clear mocks and reset state for this specific test
    vi.clearAllMocks();
    mockMongoose.models = {};
    mockMongoose.Schema.lastDefinition = undefined;
    mockMongoose.Schema.lastOptions = undefined;

    // Simulate an existing model in mongoose.models *before* re-importing the module
    const existingModel = { name: 'ExistingSwarmAuditModel', isMongooseModel: true, find: vi.fn() };
    mockMongoose.models.SwarmAudit = existingModel;

    // Re-import the module. It should now pick up the existing model.
    const { default: SwarmAuditModelFromReimport } = await import('../swarmAudit.model');

    // The Schema constructor should still be called once to define the schema,
    // even if the model itself isn't re-created.
    expect(mockMongoose.Schema).toHaveBeenCalledTimes(1);
    // mongoose.model should NOT be called because an existing model was found
    expect(mockMongoose.model).not.toHaveBeenCalled();
    // The exported model should be the existing one
    expect(SwarmAuditModelFromReimport).toBe(existingModel);
    expect(SwarmAuditModelFromReimport.name).toBe('ExistingSwarmAuditModel');
  });
});