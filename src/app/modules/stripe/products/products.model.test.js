import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock mongoose
const mockSchemaInstance = {
  path: vi.fn(),
};

const mockSchemaConstructor = vi.fn((definition, options) => {
  return mockSchemaInstance;
});

const mockObjectId = vi.fn();

// Attach Types to the mockSchemaConstructor directly, as it's a static property
mockSchemaConstructor.Types = {
  ObjectId: mockObjectId,
};

const mockModel = vi.fn(() => ({})); // Return a simple object for the model

vi.mock('mongoose', () => ({
  default: {
    Schema: mockSchemaConstructor,
    model: mockModel,
    Types: {
      ObjectId: mockObjectId, // Also provide at top-level mongoose.Types for robustness
    },
  },
}));

// Import the model AFTER mocking mongoose
import Product from './products.model';

describe('Product Model', () => {
  beforeEach(() => {
    // Clear mocks before each test to ensure isolation, though for a module
    // that's imported once, the calls will only happen on initial load.
    vi.clearAllMocks();
  });

  it('should define the product schema correctly', () => {
    expect(mockSchemaConstructor).toHaveBeenCalledTimes(1);
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    const schemaOptions = mockSchemaConstructor.mock.calls[0][1];

    expect(schemaDefinition).toBeDefined();
    expect(schemaOptions).toEqual({ timestamps: true });

    // Basic checks for top-level fields existence
    expect(schemaDefinition.plan).toBeDefined();
    expect(schemaDefinition.name).toBeDefined();
    expect(schemaDefinition.displayName).toBeDefined();
    expect(schemaDefinition.description).toBeDefined();
    expect(schemaDefinition.price).toBeDefined();
    expect(schemaDefinition.currency).toBeDefined();
    expect(schemaDefinition.interval).toBeDefined();
    expect(schemaDefinition.stripeProductId).toBeDefined();
    expect(schemaDefinition.stripePriceId).toBeDefined();
    expect(schemaDefinition.features).toBeDefined();
    expect(schemaDefinition.featuresList).toBeDefined();
    expect(schemaDefinition.metadata).toBeDefined();
    expect(schemaDefinition.isActive).toBeDefined();
    expect(schemaDefinition.isVisible).toBeDefined();
    expect(schemaDefinition.sortOrder).toBeDefined();
    expect(schemaDefinition.tenantId).toBeDefined();
  });

  it('should create a Mongoose model named "StripeProduct" with the defined schema', () => {
    expect(mockModel).toHaveBeenCalledTimes(1);
    expect(mockModel).toHaveBeenCalledWith('StripeProduct', mockSchemaInstance);
    // Verify that the exported Product is the result of the mocked model call
    expect(Product).toBe(mockModel.mock.results[0].value);
  });

  it('should have correct properties for "plan" field', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.plan).toEqual({
      type: String,
      required: true,
      enum: ['free', 'explore', 'execute', 'command'],
    });
  });

  it('should have correct properties for "name" field', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.name).toEqual({ type: String, required: true });
  });

  it('should have correct properties for "displayName" field', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.displayName).toEqual({ type: String, required: true });
  });

  it('should have correct properties for "description" field', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.description).toEqual({ type: String, required: true });
  });

  it('should have correct properties for "price" field', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.price).toEqual({ type: Number, required: true });
  });

  it('should have correct properties for "currency" field', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.currency).toEqual({ type: String, default: 'usd' });
  });

  it('should have correct properties for "interval" field', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.interval).toEqual({ type: String, default: 'month', enum: ['month', 'year'] });
  });

  it('should have unique constraints for "stripeProductId" and "stripePriceId" fields', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.stripeProductId).toEqual({ type: String, required: true, unique: true });
    expect(schemaDefinition.stripePriceId).toEqual({ type: String, required: true, unique: true });
  });

  it('should define "features" sub-document correctly', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.features.dailyRequestLimit).toEqual({ type: Number, required: true });
    expect(schemaDefinition.features.ragType).toEqual({
      type: String,
      required: true,
      enum: ['none', 'basic_text', 'advanced_multimodal', 'premium_agentic'],
    });
    expect(schemaDefinition.features.storagePerUser).toEqual({ type: Number, required: true });
    expect(schemaDefinition.features.canInviteTeam).toEqual({ type: Boolean, required: true });
  });

  it('should define "featuresList" as an array of strings', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.featuresList).toEqual([{ type: String }]);
  });

  it('should define "metadata" as a Map of String', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.metadata).toEqual({
      type: Map,
      of: String,
    });
  });

  it('should have correct default values for "isActive", "isVisible", and "sortOrder"', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.isActive).toEqual({ type: Boolean, default: true });
    expect(schemaDefinition.isVisible).toEqual({ type: Boolean, default: true });
    expect(schemaDefinition.sortOrder).toEqual({ type: Number, default: 0 });
  });

  it('should define "tenantId" as an ObjectId reference with default null and index', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    expect(schemaDefinition.tenantId).toEqual({
      type: mockObjectId, // This should be the mocked ObjectId
      ref: 'Tenant',
      default: null,
      index: true,
    });
  });
});