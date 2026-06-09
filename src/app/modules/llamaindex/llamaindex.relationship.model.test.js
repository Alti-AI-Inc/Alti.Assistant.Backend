import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose'; // This will be the mocked mongoose

// Mock mongoose at the top level
vi.mock('mongoose', () => {
  const mockSchemaInstance = {
    definition: {}, // To store the raw schema definition passed to the constructor
    options: {},    // To store the raw schema options passed to the constructor
    index: vi.fn(), // Mock the index method on the schema instance
  };

  const mockMongoose = {
    Schema: vi.fn((definition, options) => {
      // Store the definition and options for inspection
      mockSchemaInstance.definition = definition;
      mockSchemaInstance.options = options;
      return mockSchemaInstance; // Return the mock instance
    }),
    model: vi.fn((name, schema) => {
      // For testing, we can return the schema instance itself or a simple mock object
      // Returning the schema instance allows us to verify it was passed correctly.
      return schema;
    }),
    models: {}, // Mock mongoose.models to control existing models cache
  };

  return mockMongoose;
});

let DocumentRelationship;
let DocumentRelationshipSchemaInstance;

describe('DocumentRelationship Model', () => {
  beforeEach(async () => {
    // Clear all mocks (call history and implementations) before each test
    vi.clearAllMocks();
    // Reset mongoose.models cache to ensure a clean state for model creation
    mongoose.models = {};

    // Dynamically import the module under test.
    // This ensures that the module's code runs with the fresh mocks.
    const module = await import('./llamaindex.relationship.model.js');
    DocumentRelationship = module.default;

    // Get the schema instance returned by the mocked mongoose.Schema constructor
    // This allows us to inspect its properties and method calls (like .index())
    DocumentRelationshipSchemaInstance = mongoose.Schema.mock.results[0]?.value;
  });

  it('should define the DocumentRelationshipSchema correctly', () => {
    expect(mongoose.Schema).toHaveBeenCalledTimes(1);
    const schemaConstructorArgs = mongoose.Schema.mock.calls[0];
    const schemaDefinition = schemaConstructorArgs[0];
    const schemaOptions = schemaConstructorArgs[1];

    // Verify schema options
    expect(schemaOptions).toEqual({ timestamps: true });
    expect(DocumentRelationshipSchemaInstance.options).toEqual({ timestamps: true });

    // Verify individual field definitions
    expect(schemaDefinition.userId).toEqual({ type: String, required: true, index: true });
    expect(schemaDefinition.sourceDocId).toEqual({ type: String, required: true, index: true });
    expect(schemaDefinition.targetDocId).toEqual({ type: String, required: true, index: true });

    expect(schemaDefinition.relationType).toEqual({
      type: String,
      required: true,
      enum: ['shared_entity', 'cross_reference', 'hierarchical', 'dependency', 'topic_similarity'],
      default: 'topic_similarity'
    });

    expect(schemaDefinition.confidence).toEqual({
      type: Number,
      default: 0.5,
      min: 0,
      max: 1
    });

    expect(schemaDefinition.sharedConcepts).toEqual({
      type: [String],
      default: []
    });

    expect(schemaDefinition.description).toEqual({
      type: String,
      default: ''
    });
  });

  it('should apply the compound unique index', () => {
    expect(DocumentRelationshipSchemaInstance.index).toHaveBeenCalledTimes(1);
    expect(DocumentRelationshipSchemaInstance.index).toHaveBeenCalledWith(
      { userId: 1, sourceDocId: 1, targetDocId: 1 },
      { unique: true }
    );
  });

  it('should create the DocumentRelationship model if it does not exist', () => {
    expect(mongoose.model).toHaveBeenCalledTimes(1);
    expect(mongoose.model).toHaveBeenCalledWith('DocumentRelationship', DocumentRelationshipSchemaInstance);
    expect(DocumentRelationship).toBe(DocumentRelationshipSchemaInstance); // Our mock returns the schema instance
  });

  it('should retrieve an existing DocumentRelationship model without recreating it', async () => {
    // Simulate an existing model being present in mongoose.models
    const existingModel = { name: 'ExistingDocumentRelationshipMock' };
    mongoose.models.DocumentRelationship = existingModel;

    // Clear mocks before re-importing to ensure we only count calls from this specific scenario
    vi.clearAllMocks();

    // Re-import the module. This time, it should find the model in mongoose.models
    const module = await import('./llamaindex.relationship.model.js');
    const ReimportedDocumentRelationship = module.default;

    // Expect mongoose.Schema and mongoose.model NOT to have been called
    // because the existing model was found and reused.
    expect(mongoose.Schema).not.toHaveBeenCalled();
    expect(mongoose.model).not.toHaveBeenCalled();
    expect(ReimportedDocumentRelationship).toBe(existingModel);
  });
});