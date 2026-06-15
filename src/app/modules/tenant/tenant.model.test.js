import { vi, describe, it, expect, beforeEach } from 'vitest';

const {
  mockSchemaInstance
} = vi.hoisted(() => {
  // Define a mock object for the Schema instance that will be returned by new mongoose.Schema()
  const mockSchemaInstance = {
    index: vi.fn(),
    virtual: vi.fn(),
    set: vi.fn(),
    statics: {}, // Will be populated by the schema definition
    methods: {}, // Will be populated by the schema definition
  };

  return {
    mockSchemaInstance
  };
});

// Mock the mongoose module
vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal(); // Get actual mongoose for types like Schema.Types.Mixed

  // Create a mock Schema constructor that returns our mockSchemaInstance
  const MockSchemaConstructor = vi.fn().mockImplementation((definition, options) => {
    // Store the definition and options for later inspection
    mockSchemaInstance._definition = definition;
    mockSchemaInstance._options = options;
    return mockSchemaInstance;
  });

  // Attach Schema.Types to our mock Schema constructor so the model file can access them
  MockSchemaConstructor.Types = actualMongoose.default.Schema.Types;

  return {
    default: {
      Schema: MockSchemaConstructor,
      model: vi.fn().mockImplementation((name, schema) => {
        // This mock model will be the actual export
        const MockModel = function (data) {
          Object.assign(this, data);
          // Mock save for instance methods
          this.save = vi.fn().mockImplementation(function () {
            // Simulate saving by returning the current instance
            return Promise.resolve(this);
          });
        };
        // Mock query methods for static methods
        MockModel.find = vi.fn().mockReturnThis();
        MockModel.findById = vi.fn().mockReturnThis();
        MockModel.populate = vi.fn().mockReturnThis();
        MockModel.exec = vi.fn().mockResolvedValue(null); // Default for queries
        
        // Attach static methods from the schema definition
        Object.assign(MockModel, schema.statics);
        // Attach instance methods from the schema definition to the prototype
        Object.assign(MockModel.prototype, schema.methods);
        
        return MockModel;
      }),
      // Also expose Types directly on the mongoose default export for convenience if needed,
      // though the schema definition uses mongoose.Schema.Types
      Types: actualMongoose.default.Types,
    },
  };
});

// Now import the module under test, which will use the mocked mongoose
import mongoose from 'mongoose'; // This import gets the mocked mongoose
import Tenant from './tenant.model'; // This import uses the mocked mongoose

describe('Tenant Model', () => {
  let MockTenantModel;

  beforeEach(() => {
    // Clear all mocks before each test to ensure a clean state for schema definition checks
    vi.clearAllMocks();
    // Reset the internal state of mockSchemaInstance's methods
    mockSchemaInstance.index.mockClear();
    mockSchemaInstance.virtual.mockClear();
    mockSchemaInstance.set.mockClear();
    mockSchemaInstance.statics = {}; // Reset statics
    mockSchemaInstance.methods = {}; // Reset methods

    // The Tenant model is already imported, so `mongoose.Schema` and `mongoose.model`
    // have already been called. We can now inspect the arguments they were called with.
    MockTenantModel = Tenant; // The exported model is our mock
  });

  it('should define the Tenant schema correctly', () => {
    expect(mongoose.Schema).toHaveBeenCalledTimes(1);
    const schemaDefinition = mongoose.Schema.mock.calls[0][0];
    const schemaOptions = mongoose.Schema.mock.calls[0][1];

    // Check top-level fields
    expect(schemaDefinition.name).toEqual(
      expect.objectContaining({
        type: String,
        required: [true, 'Tenant name is required'],
        trim: true,
        minlength: [2, 'Tenant name must be at least 2 characters'],
        maxlength: [100, 'Tenant name cannot exceed 100 characters'],
      })
    );
    expect(schemaDefinition.slug).toEqual(
      expect.objectContaining({
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true,
      })
    );
    expect(schemaDefinition.subdomain).toEqual(
      expect.objectContaining({
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true,
        match: [
          /^[a-z0-9-]+$/,
          'Subdomain can only contain lowercase letters, numbers, and hyphens',
        ],
      })
    );
    expect(schemaDefinition.ownerId).toEqual(
      expect.objectContaining({
        type: mongoose.Schema.Types.ObjectId, // Use the mocked mongoose.Schema.Types.ObjectId
        ref: 'User',
        required: [true, 'Tenant must have an owner'],
        index: true,
      })
    );
    expect(schemaDefinition.status).toEqual(
      expect.objectContaining({
        type: String,
        enum: ['active', 'suspended', 'trial', 'cancelled'],
        default: 'trial',
        index: true,
      })
    );
    expect(schemaDefinition.plan).toEqual(
      expect.objectContaining({
        type: String,
        enum: ['free', 'explore', 'analyze', 'execute', 'command', 'enterprise'],
        default: 'free',
        index: true,
      })
    );

    // Check nested settings
    expect(schemaDefinition.settings.allowMemberInvites).toEqual(
      expect.objectContaining({ type: Boolean, default: true })
    );
    expect(schemaDefinition.settings.requireApproval).toEqual(
      expect.objectContaining({ type: Boolean, default: false })
    );
    expect(schemaDefinition.settings.maxMembers).toEqual(
      expect.objectContaining({ type: Number, default: 5 })
    );
    expect(schemaDefinition.settings.customBranding.logo).toBe(String);
    expect(schemaDefinition.settings.customBranding.primaryColor).toBe(String);

    // Check nested limits
    expect(schemaDefinition.limits.maxApiCalls).toEqual(
      expect.objectContaining({ type: Number, default: 1000 })
    );
    expect(schemaDefinition.limits.maxStorage).toEqual(
      expect.objectContaining({ type: Number, default: 5368709120 })
    );
    expect(schemaDefinition.limits.maxUsers).toEqual(
      expect.objectContaining({ type: Number, default: 5 })
    );

    // Check nested usage
    expect(schemaDefinition.usage.apiCallsUsed).toEqual(
      expect.objectContaining({ type: Number, default: 0 })
    );
    expect(schemaDefinition.usage.storageUsed).toEqual(
      expect.objectContaining({ type: Number, default: 0 })
    );
    expect(schemaDefinition.usage.usersCount).toEqual(
      expect.objectContaining({ type: Number, default: 1 })
    );
    // For Date.now, we check if the default is the function itself, not its result
    expect(schemaDefinition.usage.lastResetAt).toEqual(
      expect.objectContaining({ type: Date, default: Date.now })
    );

    // Check subscriptionId
    expect(schemaDefinition.subscriptionId).toEqual(
      expect.objectContaining({
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        default: null,
        index: true,
      })
    );

    // Check metadata
    expect(schemaDefinition.metadata.industry).toBe(String);
    expect(schemaDefinition.metadata.companySize).toBe(String);
    expect(schemaDefinition.metadata.useCase).toBe(String);
    expect(schemaDefinition.metadata.referralSource).toBe(String);
    expect(schemaDefinition.metadata.customFields).toBe(mongoose.Schema.Types.Mixed);

    // Check deletedAt
    expect(schemaDefinition.deletedAt).toEqual(
      expect.objectContaining({ type: Date, default: null })
    );

    // Check schema options
    expect(schemaOptions).toEqual(
      expect.objectContaining({
        timestamps: true,
      })
    );
  });

  it('should define schema indexes', () => {
    // The schema instance is created once when the module is imported.
    // We need to check the calls made to its `index` method.
    expect(mockSchemaInstance.index).toHaveBeenCalledTimes(4);
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ ownerId: 1, status: 1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ slug: 1 }, { unique: true });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ status: 1, plan: 1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('should define virtual fields', () => {
    expect(mockSchemaInstance.virtual).toHaveBeenCalledTimes(2);

    // Check 'members' virtual
    expect(mockSchemaInstance.virtual).toHaveBeenCalledWith('members', {
      ref: 'User',
      localField: '_id',
      foreignField: 'tenantId',
    });

    // Check 'subscription' virtual
    expect(mockSchemaInstance.virtual).toHaveBeenCalledWith('subscription', {
      ref: 'Subscription',
      localField: 'subscriptionId',
      foreignField: '_id',
      justOne: true,
    });
  });

  it('should enable virtuals in toJSON and toObject', () => {
    expect(mockSchemaInstance.set).toHaveBeenCalledTimes(2);
    expect(mockSchemaInstance.set).toHaveBeenCalledWith('toJSON', { virtuals: true });
    expect(mockSchemaInstance.set).toHaveBeenCalledWith('toObject', { virtuals: true });
  });

  describe('Static Methods', () => {
    // Clear mocks specific to static methods before each test in this block
    beforeEach(() => {
      MockTenantModel.find.mockClear().mockReturnThis();
      MockTenantModel.findById.mockClear().mockReturnThis();
      MockTenantModel.populate.mockClear().mockReturnThis();
      MockTenantModel.exec.mockClear().mockResolvedValue(null);
    });

    it('findActive should query for active and non-deleted tenants', async () => {
      const mockQueryResult = [{ _id: new mongoose.Types.ObjectId(), name: 'Active Tenant' }];
      MockTenantModel.exec.mockResolvedValue(mockQueryResult); // Resolve the query

      const result = await MockTenantModel.findActive();

      expect(MockTenantModel.find).toHaveBeenCalledWith({ status: 'active', deletedAt: null });
      expect(MockTenantModel.exec).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockQueryResult);
    });

    it('findWithSubscription should find by ID and populate subscriptionId', async () => {
      const tenantId = new mongoose.Types.ObjectId();
      const mockPopulatedTenant = { _id: tenantId, name: 'Test Tenant', subscription: { _id: new mongoose.Types.ObjectId(), plan: 'free' } };
      
      MockTenantModel.exec.mockResolvedValue(mockPopulatedTenant); // Resolve the query

      const result = await MockTenantModel.findWithSubscription(tenantId);

      expect(MockTenantModel.findById).toHaveBeenCalledWith(tenantId);
      expect(MockTenantModel.populate).toHaveBeenCalledWith('subscriptionId');
      expect(MockTenantModel.exec).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockPopulatedTenant);
    });
  });

  describe('Instance Methods', () => {
    let tenantInstance;
    let mockObjectId;

    beforeEach(() => {
      // Generate a consistent ObjectId for testing purposes
      mockObjectId = new mongoose.Types.ObjectId();
      
      tenantInstance = new MockTenantModel({
        _id: new mongoose.Types.ObjectId(), // Give it an _id for virtuals if needed
        name: 'Test Tenant',
        slug: 'test-tenant',
        subdomain: 'test-sub',
        ownerId: mockObjectId,
        status: 'active',
        plan: 'free',
        settings: {
          maxMembers: 10,
        },
        limits: {
          maxApiCalls: 1000,
          maxUsers: 5,
        },
        usage: {
          apiCallsUsed: 500,
          usersCount: 3,
          storageUsed: 100,
          lastResetAt: new Date(),
        },
      });
      // Ensure save is a fresh mock for each instance test
      tenantInstance.save = vi.fn().mockResolvedValue(tenantInstance);
    });

    it('canAddMembers should return true if usage.usersCount is less than limits.maxUsers', () => {
      tenantInstance.usage.usersCount = 3;
      tenantInstance.limits.maxUsers = 5;
      expect(tenantInstance.canAddMembers()).toBe(true);
    });

    it('canAddMembers should return false if usage.usersCount is equal to limits.maxUsers', () => {
      tenantInstance.usage.usersCount = 5;
      tenantInstance.limits.maxUsers = 5;
      expect(tenantInstance.canAddMembers()).toBe(false);
    });

    it('canAddMembers should return false if usage.usersCount is greater than limits.maxUsers', () => {
      tenantInstance.usage.usersCount = 6;
      tenantInstance.limits.maxUsers = 5;
      expect(tenantInstance.canAddMembers()).toBe(false);
    });

    it('hasReachedApiLimit should return true if usage.apiCallsUsed is greater than or equal to limits.maxApiCalls', () => {
      tenantInstance.usage.apiCallsUsed = 1000;
      tenantInstance.limits.maxApiCalls = 1000;
      expect(tenantInstance.hasReachedApiLimit()).toBe(true);

      tenantInstance.usage.apiCallsUsed = 1001;
      expect(tenantInstance.hasReachedApiLimit()).toBe(true);
    });

    it('hasReachedApiLimit should return false if usage.apiCallsUsed is less than limits.maxApiCalls', () => {
      tenantInstance.usage.apiCallsUsed = 999;
      tenantInstance.limits.maxApiCalls = 1000;
      expect(tenantInstance.hasReachedApiLimit()).toBe(false);
    });

    it('incrementUsage should increment apiCallsUsed by default amount and save', async () => {
      const initialApiCalls = tenantInstance.usage.apiCallsUsed;
      await tenantInstance.incrementUsage('apiCallsUsed');
      expect(tenantInstance.usage.apiCallsUsed).toBe(initialApiCalls + 1);
      expect(tenantInstance.save).toHaveBeenCalledTimes(1);
    });

    it('incrementUsage should increment storageUsed by a specified amount and save', async () => {
      const initialStorageUsed = tenantInstance.usage.storageUsed;
      await tenantInstance.incrementUsage('storageUsed', 1024);
      expect(tenantInstance.usage.storageUsed).toBe(initialStorageUsed + 1024);
      expect(tenantInstance.save).toHaveBeenCalledTimes(1);
    });

    it('incrementUsage should increment usersCount by a specified amount and save', async () => {
      const initialUsersCount = tenantInstance.usage.usersCount;
      await tenantInstance.incrementUsage('usersCount', 2);
      expect(tenantInstance.usage.usersCount).toBe(initialUsersCount + 2);
      expect(tenantInstance.save).toHaveBeenCalledTimes(1);
    });

    it('incrementUsage should initialize usage field if it does not exist and increment', async () => {
      // Simulate a scenario where a usage field might be missing (though schema defaults prevent this)
      delete tenantInstance.usage.apiCallsUsed;
      await tenantInstance.incrementUsage('apiCallsUsed', 5);
      expect(tenantInstance.usage.apiCallsUsed).toBe(5);
      expect(tenantInstance.save).toHaveBeenCalledTimes(1);
    });

    it('softDelete should set deletedAt and change status to cancelled and save', async () => {
      const mockDate = new Date('2023-01-01T00:00:00.000Z');
      vi.setSystemTime(mockDate); // Mock Date.now()

      await tenantInstance.softDelete();

      expect(tenantInstance.deletedAt).toEqual(mockDate);
      expect(tenantInstance.status).toBe('cancelled');
      expect(tenantInstance.save).toHaveBeenCalledTimes(1);

      // Restore system time
      vi.useRealTimers();
    });
  });
});