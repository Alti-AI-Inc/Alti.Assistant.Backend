import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose'; // Import real mongoose to get Schema.Types for comparison

// Mock mongoose to prevent actual database operations
const mockSchemaInstance = {
  path: vi.fn().mockImplementation((path) => ({
    instance: 'String', // Default instance for path, can be refined if needed
    caster: { instance: 'ObjectID' }, // For ObjectId types
    options: {}, // For options like required, enum, ref
  })),
  obj: {}, // Will be populated with the schema definition passed to new mongoose.Schema()
};

const mockMongoose = {
  Schema: vi.fn(function (definition, options) {
    this.obj = definition; // Store the schema definition
    this.options = options; // Store schema options
    Object.assign(this, mockSchemaInstance); // Add mock methods
  }),
  model: vi.fn().mockImplementation((name, schema) => {
    // Return a mock model object that can be inspected
    return {
      modelName: name,
      schema: schema,
      // Add any other properties or methods you expect a Mongoose model to have
      find: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      // etc.
    };
  }),
  Types: {
    ObjectId: mongoose.Types.ObjectId, // Use real ObjectId for type comparison
    Mixed: mongoose.Types.Mixed, // Use real Mixed for type comparison
  },
};

// Replace the real mongoose with our mock before importing the model
vi.doMock('mongoose', () => ({ default: mockMongoose }));

// Now import the model after mongoose has been mocked
const BillingAuditLog = (await import('./billingAuditLog.model.js')).default;

describe('BillingAuditLog Model', () => {
  beforeEach(() => {
    // Clear mocks before each test to ensure isolation
    mockMongoose.Schema.mockClear();
    mockMongoose.model.mockClear();
    mockSchemaInstance.path.mockClear();
  });

  it('should define the BillingAuditLogSchema correctly', () => {
    // Ensure mongoose.Schema was called
    expect(mockMongoose.Schema).toHaveBeenCalledTimes(1);

    // Get the schema definition passed to mongoose.Schema
    const schemaDefinition = mockMongoose.Schema.mock.calls[0][0];
    const schemaOptions = mockMongoose.Schema.mock.calls[0][1];

    expect(schemaDefinition).toBeDefined();
    expect(schemaOptions).toBeDefined();

    // Verify schema fields
    expect(schemaDefinition.tenantId).toBeDefined();
    expect(schemaDefinition.tenantId.type).toBe(mockMongoose.Types.ObjectId);
    expect(schemaDefinition.tenantId.ref).toBe('Tenant');
    expect(schemaDefinition.tenantId.index).toBe(true);

    expect(schemaDefinition.userId).toBeDefined();
    expect(schemaDefinition.userId.type).toBe(mockMongoose.Types.ObjectId);
    expect(schemaDefinition.userId.ref).toBe('User');
    expect(schemaDefinition.userId.index).toBe(true);

    expect(schemaDefinition.action).toBeDefined();
    expect(schemaDefinition.action.type).toBe(String);
    expect(schemaDefinition.action.required).toBe(true);
    expect(schemaDefinition.action.enum).toEqual([
      'upgrade',
      'cancel',
      'seat_add',
      'seat_remove',
      'billing_portal',
      'webhook_failed',
      'dispute_created',
      'dispute_closed',
      'outage_detected',
    ]);

    expect(schemaDefinition.previousState).toBeDefined();
    expect(schemaDefinition.previousState.type).toBe(mockMongoose.Types.Mixed);
    expect(schemaDefinition.previousState.default).toBeNull();

    expect(schemaDefinition.newState).toBeDefined();
    expect(schemaDefinition.newState.type).toBe(mockMongoose.Types.Mixed);
    expect(schemaDefinition.newState.default).toBeNull();

    expect(schemaDefinition.ipAddress).toBeDefined();
    expect(schemaDefinition.ipAddress.type).toBe(String);
    expect(schemaDefinition.ipAddress.default).toBeNull();

    // Verify schema options
    expect(schemaOptions.timestamps).toBe(true);
  });

  it('should create the BillingAuditLog model correctly', () => {
    // Ensure mongoose.model was called
    expect(mockMongoose.model).toHaveBeenCalledTimes(1);

    // Get the arguments passed to mongoose.model
    const modelName = mockMongoose.model.mock.calls[0][0];
    const schemaPassedToModel = mockMongoose.model.mock.calls[0][1];

    expect(modelName).toBe('BillingAuditLog');
    // The schema passed to model should be an instance of our mock Schema
    expect(schemaPassedToModel).toBeInstanceOf(mockMongoose.Schema);

    // Verify that the exported BillingAuditLog is the result of mongoose.model
    expect(BillingAuditLog.modelName).toBe('BillingAuditLog');
    expect(BillingAuditLog.schema).toBeInstanceOf(mockMongoose.Schema);
  });

  it('should export the BillingAuditLog model as default', () => {
    expect(BillingAuditLog).toBeDefined();
    expect(BillingAuditLog.modelName).toBe('BillingAuditLog');
  });
});