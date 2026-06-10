import { describe, it, expect, vi } from 'vitest';

// Define a mock object for the Mongoose Schema instance.
// If the schema had methods (e.g., .virtual(), .pre(), .post()), they would be mocked here.
const mockSchemaInstance = {};

// Define a mock object for the entire 'mongoose' module.
const mockMongoose = {
  // Mock the Schema constructor. It should return our `mockSchemaInstance`.
  Schema: vi.fn((schemaDef, options) => {
    // We don't need to store schemaDef/options here as `mockMongoose.Schema.mock.calls`
    // will automatically capture them.
    return mockSchemaInstance;
  }),
  // Mock the model function. It should return a dummy object representing the model.
  model: vi.fn((name, schema) => {
    // We don't need to store name/schema here as `mockMongoose.model.mock.calls`
    // will automatically capture them.
    return {}; // Return a dummy object for the model
  }),
  // Mock Mongoose.Types.ObjectId for schema definition.
  Types: {
    ObjectId: vi.fn(),
  },
};

// Mock the 'mongoose' module globally. This must be done before the module under test is imported.
vi.mock('mongoose', () => mockMongoose);

// Import the module under test. This will trigger the calls to the mocked 'mongoose' functions.
// Adjust the path './notes.model' if your test file is not in the same directory as notes.model.js.
const Notes = require('./notes.model');

describe('Notes Model Definition', () => {
  // Since the module is imported once at the top level, `mongoose.Schema` and `mongoose.model`
  // are called only once when the test file loads. No `beforeEach` for resetting mocks is needed
  // unless the module was re-imported in each test.

  it('should define the Notes schema correctly with expected fields and options', () => {
    // Verify that `mongoose.Schema` was called exactly once.
    expect(mockMongoose.Schema).toHaveBeenCalledTimes(1);

    // Retrieve the arguments passed to the `mongoose.Schema` constructor.
    const [schemaDefinition, schemaOptions] = mockMongoose.Schema.mock.calls[0];

    // Assert the structure and properties of the schema definition.
    expect(schemaDefinition).toBeDefined();
    expect(schemaDefinition.title).toEqual({
      type: String,
      required: true,
      trim: true,
    });
    expect(schemaDefinition.description).toEqual({
      type: String,
      trim: true,
    });
    expect(schemaDefinition.userId).toEqual({
      type: mockMongoose.Types.ObjectId, // Ensure it uses the mocked ObjectId type
      ref: 'User',
      required: true,
    });

    // Assert the schema options.
    expect(schemaOptions).toBeDefined();
    expect(schemaOptions.timestamps).toBe(true);
  });

  it('should create the Notes model correctly using the defined schema', () => {
    // Verify that `mongoose.model` was called exactly once.
    expect(mockMongoose.model).toHaveBeenCalledTimes(1);

    // Retrieve the arguments passed to the `mongoose.model` function.
    const [modelName, schemaInstancePassedToModel] = mockMongoose.model.mock.calls[0];

    // Assert the model name.
    expect(modelName).toBe('Notes');

    // Assert that the schema instance passed to `mongoose.model` is the same
    // mock instance that was returned by `new mongoose.Schema()`.
    expect(schemaInstancePassedToModel).toBe(mockSchemaInstance);

    // Assert that the module exports the result of `mongoose.model`.
    // Since our mock `mongoose.model` returns `{}`, `Notes` should be `{}`.
    expect(Notes).toEqual({});
  });
});