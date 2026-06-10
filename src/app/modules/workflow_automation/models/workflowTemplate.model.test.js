import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock Mongoose ---
// We need to mock mongoose before importing the model to ensure our mock is used.

const mockSchemaInstances = {}; // To store instances of MockSchema for inspection
const mockModelInstances = {}; // To store instances of the mock model for inspection

class MockSchema {
  constructor(definition, options) {
    this.definition = definition;
    this.options = options;
    this.paths = {}; // Simulate schema paths for easier inspection
    this.indexes = [];

    for (const key in definition) {
      if (!definition.hasOwnProperty(key)) continue;

      const fieldDef = definition[key];

      if (Array.isArray(fieldDef)) {
        // Handle array types
        if (fieldDef.length > 0) {
          const innerDef = fieldDef[0];
          if (innerDef instanceof MockSchema) {
            // Array of nested schema (e.g., steps)
            this.paths[key] = {
              type: [innerDef],
              schema: innerDef, // Direct reference to the nested schema
            };
          } else if (typeof innerDef === 'object' && innerDef !== null && innerDef.type) {
            // Array of objects with type/enum (e.g., triggerTypes)
            this.paths[key] = {
              type: [innerDef.type],
              enum: innerDef.enum,
              _originalDef: innerDef, // Store original for full inspection
            };
          } else if (typeof innerDef === 'object' && innerDef !== null) {
            // Array of plain objects that become sub-schemas (e.g., examples)
            const nestedSchema = new MockSchema(innerDef, {});
            this.paths[key] = {
              type: [Object], // Mongoose stores these as type Object in array
              schema: nestedSchema, // Reference to the sub-schema mock
            };
          } else {
            // Array of simple types (e.g., tags: [String])
            this.paths[key] = { type: [innerDef] };
          }
        } else {
          // Empty array definition, assume mixed or default to Array
          this.paths[key] = { type: Array };
        }
      } else if (typeof fieldDef === 'object' && fieldDef !== null && fieldDef.type) {
        // Standard field definition with type and options (e.g., name, category)
        this.paths[key] = fieldDef;
      } else if (typeof fieldDef === 'object' && fieldDef !== null) {
        // Nested object that becomes a sub-schema (e.g., rating, metadata)
        const nestedSchema = new MockSchema(fieldDef, {});
        this.paths[key] = { type: Object, schema: nestedSchema };
      } else {
        // Simple type definition (e.g., String, Number)
        this.paths[key] = { type: fieldDef };
      }
    }
    // Store the instance for later retrieval by test
    mockSchemaInstances[this.constructor.name] = this;
  }

  index(fields, options) {
    this.indexes.push({ fields, options });
  }

  // A very basic mock for pre-save validation, primarily for required/enum checks
  validateSync(doc) {
    const errors = {};
    for (const key in this.paths) {
      const fieldDef = this.paths[key];
      const value = doc[key];

      // Check required fields
      if (fieldDef.required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
        errors[key] = { message: `${key} is required.`, kind: 'required' };
      }

      // Check enum for single values
      if (fieldDef.enum && value !== undefined && value !== null && !Array.isArray(value) && !fieldDef.enum.includes(value)) {
        errors[key] = { message: `${value} is not a valid enum value for ${key}.`, kind: 'enum' };
      }

      // Check enum for array values (e.g., triggerTypes)
      if (fieldDef._originalDef && Array.isArray(value)) {
        value.forEach((item, index) => {
          if (fieldDef._originalDef.enum && !fieldDef._originalDef.enum.includes(item)) {
            errors[`${key}.${index}`] = { message: `${item} is not a valid enum value for ${key}.`, kind: 'enum' };
          }
        });
      }

      // Check nested schemas (e.g., steps, rating, examples)
      if (fieldDef.schema instanceof MockSchema) {
        if (Array.isArray(value)) { // Array of nested schemas/objects
          value.forEach((item, index) => {
            const nestedErrors = fieldDef.schema.validateSync(item);
            if (nestedErrors) {
              errors[`${key}.${index}`] = nestedErrors.errors;
            }
          });
        } else if (typeof value === 'object' && value !== null) { // Single nested object
          const nestedErrors = fieldDef.schema.validateSync(value);
          if (nestedErrors) {
            errors[key] = nestedErrors.errors;
          }
        }
      }
    }
    return Object.keys(errors).length > 0 ? { errors } : null;
  }
}

const mockMongoose = {
  Schema: MockSchema,
  model: vi.fn((name, schema) => {
    // Store the schema instance associated with the model name
    mockMongoose.models[name] = schema;
    const mockModel = {
      modelName: name,
      schema: schema,
      // Mock a basic create operation that uses schema validation
      create: vi.fn(async (doc) => {
        const validationResult = schema.validateSync(doc);
        if (validationResult) {
          const error = new Error(`WorkflowTemplate validation failed: ${JSON.stringify(validationResult.errors)}`);
          error.name = 'ValidationError';
          error.errors = validationResult.errors;
          throw error;
        }
        // Simulate Mongoose adding _id and timestamps
        return {
          ...doc,
          _id: new mockMongoose.Schema.Types.ObjectId(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),
      // Mock other common Mongoose model methods for completeness
      find: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      updateOne: vi.fn(async () => ({ nModified: 1 })),
      deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    };
    mockModelInstances[name] = mockModel; // Store for direct access in tests
    return mockModel;
  }),
  models: {}, // To store compiled models (like mongoose.models.WorkflowTemplate)
  // Ensure Schema.Types.ObjectId is available
  Schema: {
    Types: {
      ObjectId: class MockObjectId {
        constructor(id) {
          this.id = id || '60c72b2f9b1d8e001c8e4a1b'; // Example ID
        }
        toString() {
          return this.id;
        }
      },
    },
  },
};

// Re-assign Schema to our mock class and ensure Types.ObjectId is available
mockMongoose.Schema = MockSchema;
mockMongoose.Schema.Types = {
  ObjectId: class MockObjectId {
    constructor(id) {
      this.id = id || '60c72b2f9b1d8e001c8e4a1b'; // Example ID
    }
    toString() {
      return this.id;
    }
  },
};

// Mock the mongoose module
vi.mock('mongoose', () => ({
  default: mockMongoose,
}));

// --- Import the model after mongoose is mocked ---
import WorkflowTemplate from '../workflowTemplate.model';

describe('WorkflowTemplate Model', () => {
  let workflowTemplateSchema;
  let workflowTemplateStepSchema;
  let WorkflowTemplateModel;

  beforeEach(() => {
    // Retrieve the schema instances created by the model file
    // The main WorkflowTemplate model is created first, then its schema is available.
    WorkflowTemplateModel = mockModelInstances.WorkflowTemplate;
    workflowTemplateSchema = WorkflowTemplateModel.schema;

    // Access the nested WorkflowTemplateStepSchema from the main schema's paths
    // It's an array of schemas, so we access the 'schema' property of the path definition.
    workflowTemplateStepSchema = workflowTemplateSchema.paths.steps.schema;
  });

  it('should ensure WorkflowTemplate model is defined', () => {
    expect(WorkflowTemplate).toBeDefined();
    expect(WorkflowTemplate.modelName).toBe('WorkflowTemplate');
    expect(WorkflowTemplate.schema).toBe(workflowTemplateSchema);
  });

  it('should define WorkflowTemplateStepSchema correctly', () => {
    expect(workflowTemplateStepSchema).toBeInstanceOf(MockSchema);

    // Check stepId
    expect(workflowTemplateStepSchema.paths.stepId.type).toBe(String);

    // Check stepType
    expect(workflowTemplateStepSchema.paths.stepType.type).toBe(String);
    expect(workflowTemplateStepSchema.paths.stepType.enum).toEqual(['action', 'condition', 'trigger', 'delay']);
    expect(workflowTemplateStepSchema.paths.stepType.required).toBe(true);

    // Check other fields
    expect(workflowTemplateStepSchema.paths.description.type).toBe(String);
    expect(workflowTemplateStepSchema.paths.app.type).toBe(String);
    expect(workflowTemplateStepSchema.paths.action.type).toBe(String);
    expect(workflowTemplateStepSchema.paths.parameters.type).toBe(Object);
    expect(workflowTemplateStepSchema.paths.parameterSchema.type).toBe(Object);
    expect(workflowTemplateStepSchema.paths.conditions.type).toBe(Object);
    expect(workflowTemplateStepSchema.paths.order.type).toBe(Number);
  });

  it('should define WorkflowTemplateSchema correctly', () => {
    expect(workflowTemplateSchema).toBeInstanceOf(MockSchema);

    // Check name
    expect(workflowTemplateSchema.paths.name.type).toBe(String);
    expect(workflowTemplateSchema.paths.name.required).toBe(true);
    expect(workflowTemplateSchema.paths.name.trim).toBe(true);

    // Check description
    expect(workflowTemplateSchema.paths.description.type).toBe(String);
    expect(workflowTemplateSchema.paths.description.trim).toBe(true);

    // Check category
    expect(workflowTemplateSchema.paths.category.type).toBe(String);
    expect(workflowTemplateSchema.paths.category.enum).toEqual([
      'email',
      'social',
      'productivity',
      'finance',
      'communication',
      'other',
    ]);
    expect(workflowTemplateSchema.paths.category.required).toBe(true);

    // Check tags
    expect(workflowTemplateSchema.paths.tags.type).toEqual([String]);

    // Check steps (nested schema)
    expect(workflowTemplateSchema.paths.steps.type).toEqual([workflowTemplateStepSchema]);
    expect(workflowTemplateSchema.paths.steps.schema).toBe(workflowTemplateStepSchema);

    // Check triggerTypes
    expect(workflowTemplateSchema.paths.triggerTypes.type).toEqual([String]);
    expect(workflowTemplateSchema.paths.triggerTypes.enum).toEqual(['schedule', 'webhook', 'manual', 'event']);

    // Check requiredApps
    expect(workflowTemplateSchema.paths.requiredApps.type).toEqual([String]);

    // Check difficulty
    expect(workflowTemplateSchema.paths.difficulty.type).toBe(String);
    expect(workflowTemplateSchema.paths.difficulty.enum).toEqual(['beginner', 'intermediate', 'advanced']);
    expect(workflowTemplateSchema.paths.difficulty.default).toBe('beginner');

    // Check usageCount
    expect(workflowTemplateSchema.paths.usageCount.type).toBe(Number);
    expect(workflowTemplateSchema.paths.usageCount.default).toBe(0);

    // Check rating (nested object/schema)
    expect(workflowTemplateSchema.paths.rating.type).toBe(Object);
    expect(workflowTemplateSchema.paths.rating.schema).toBeInstanceOf(MockSchema);
    expect(workflowTemplateSchema.paths.rating.schema.paths.average.type).toBe(Number);
    expect(workflowTemplateSchema.paths.rating.schema.paths.average.default).toBe(0);
    expect(workflowTemplateSchema.paths.rating.schema.paths.count.type).toBe(Number);
    expect(workflowTemplateSchema.paths.rating.schema.paths.count.default).toBe(0);

    // Check isPublic
    expect(workflowTemplateSchema.paths.isPublic.type).toBe(Boolean);
    expect(workflowTemplateSchema.paths.isPublic.default).toBe(true);

    // Check createdBy
    expect(workflowTemplateSchema.paths.createdBy.type).toBe(mockMongoose.Schema.Types.ObjectId);
    expect(workflowTemplateSchema.paths.createdBy.ref).toBe('User');

    // Check examples (array of nested objects/schemas)
    expect(workflowTemplateSchema.paths.examples.type).toEqual([Object]);
    expect(workflowTemplateSchema.paths.examples.schema).toBeInstanceOf(MockSchema);
    expect(workflowTemplateSchema.paths.examples.schema.paths.prompt.type).toBe(String);
    expect(workflowTemplateSchema.paths.examples.schema.paths.description.type).toBe(String);

    // Check metadata
    expect(workflowTemplateSchema.paths.metadata.type).toBe(Object);
    expect(workflowTemplateSchema.paths.metadata.default).toEqual({});
  });

  it('should have timestamps enabled', () => {
    expect(workflowTemplateSchema.options.timestamps).toBe(true);
  });

  it('should define indexes correctly', () => {
    expect(workflowTemplateSchema.indexes).toEqual([
      { fields: { category: 1, isPublic: 1 }, options: undefined },
      { fields: { tags: 1, isPublic: 1 }, options: undefined },
      { fields: { 'rating.average': -1, usageCount: -1 }, options: undefined },
    ]);
  });

  it('should create a valid workflow template document', async () => {
    const validDoc = {
      name: 'Test Workflow',
      description: 'A simple test workflow',
      category: 'productivity',
      steps: [
        {
          stepId: 'step1',
          stepType: 'action',
          app: 'Slack',
          action: 'sendMessage',
          parameters: { channel: '#general', message: 'Hello' },
        },
      ],
      triggerTypes: ['manual'],
      requiredApps: ['Slack'],
      difficulty: 'intermediate',
      usageCount: 5,
      rating: { average: 4.5, count: 2 },
      isPublic: false,
      createdBy: new mockMongoose.Schema.Types.ObjectId(),
      examples: [{ prompt: 'Send a daily reminder', description: 'Sends a message to a Slack channel every morning.' }],
      metadata: { version: '1.0' },
    };

    const createdDoc = await WorkflowTemplateModel.create(validDoc);
    expect(createdDoc).toMatchObject({
      ...validDoc,
      // Mongoose adds defaults if not provided, and _id, timestamps
      difficulty: 'intermediate', // Explicitly set
      usageCount: 5, // Explicitly set
      rating: { average: 4.5, count: 2 }, // Explicitly set
      isPublic: false, // Explicitly set
      metadata: { version: '1.0' }, // Explicitly set
    });
    expect(createdDoc._id).toBeInstanceOf(mockMongoose.Schema.Types.ObjectId);
    expect(createdDoc.createdAt).toBeInstanceOf(Date);
    expect(createdDoc.updatedAt).toBeInstanceOf(Date);
  });

  it('should throw validation error for missing required fields', async () => {
    const invalidDoc = {
      description: 'Missing name and category',
      steps: [],
    };

    await expect(WorkflowTemplateModel.create(invalidDoc)).rejects.toThrow('Validation failed');
    await expect(WorkflowTemplateModel.create(invalidDoc)).rejects.toHaveProperty('errors.name.message', 'name is required.');
    await expect(WorkflowTemplateModel.create(invalidDoc)).rejects.toHaveProperty('errors.category.message', 'category is required.');
  });

  it('should throw validation error for invalid enum values in main schema', async () => {
    const invalidDoc = {
      name: 'Invalid Category',
      category: 'non-existent-category', // Invalid enum
      steps: [],
    };

    await expect(WorkflowTemplateModel.create(invalidDoc)).rejects.toThrow('Validation failed');
    await expect(WorkflowTemplateModel.create(invalidDoc)).rejects.toHaveProperty('errors.category.message', 'non-existent-category is not a valid enum value for category.');
  });

  it('should throw validation error for invalid enum values in nested step schema', async () => {
    const invalidDoc = {
      name: 'Invalid Step Type',
      category: 'productivity',
      steps: [
        {
          stepId: 'step1',
          stepType: 'invalid-type', // Invalid enum
        },
      ],
    };

    await expect(WorkflowTemplateModel.create(invalidDoc)).rejects.toThrow('Validation failed');
    await expect(WorkflowTemplateModel.create(invalidDoc)).rejects.toHaveProperty('errors.steps.0.stepType.message', 'invalid-type is not a valid enum value for stepType.');
  });

  it('should throw validation error for invalid enum values in triggerTypes array', async () => {
    const invalidDoc = {
      name: 'Invalid Trigger Type',
      category: 'productivity',
      steps: [],
      triggerTypes: ['manual', 'invalid-trigger'], // Invalid enum
    };

    await expect(WorkflowTemplateModel.create(invalidDoc)).rejects.toThrow('Validation failed');
    await expect(WorkflowTemplateModel.create(invalidDoc)).rejects.toHaveProperty('errors.triggerTypes.1.message', 'invalid-trigger is not a valid enum value for triggerTypes.');
  });

  it('should apply default values correctly when fields are omitted', async () => {
    const docWithDefaults = {
      name: 'Default Test',
      category: 'other',
      steps: [],
    };

    const createdDoc = await WorkflowTemplateModel.create(docWithDefaults);
    expect(createdDoc.difficulty).toBe('beginner');
    expect(createdDoc.usageCount).toBe(0);
    expect(createdDoc.rating.average).toBe(0);
    expect(createdDoc.rating.count).toBe(0);
    expect(createdDoc.isPublic).toBe(true);
    expect(createdDoc.metadata).toEqual({});
  });

  it('should allow optional fields to be omitted', async () => {
    const doc = {
      name: 'Optional Fields Test',
      category: 'communication',
      steps: [],
    };

    const createdDoc = await WorkflowTemplateModel.create(doc);
    expect(createdDoc.description).toBeUndefined();
    expect(createdDoc.tags).toBeUndefined();
    expect(createdDoc.triggerTypes).toBeUndefined();
    expect(createdDoc.requiredApps).toBeUndefined();
    expect(createdDoc.createdBy).toBeUndefined();
    expect(createdDoc.examples).toBeUndefined();
  });

  it('should handle empty arrays for list fields', async () => {
    const doc = {
      name: 'Empty Arrays Test',
      category: 'communication',
      tags: [],
      steps: [],
      triggerTypes: [],
      requiredApps: [],
      examples: [],
    };

    const createdDoc = await WorkflowTemplateModel.create(doc);
    expect(createdDoc.tags).toEqual([]);
    expect(createdDoc.steps).toEqual([]);
    expect(createdDoc.triggerTypes).toEqual([]);
    expect(createdDoc.requiredApps).toEqual([]);
    expect(createdDoc.examples).toEqual([]);
  });
});