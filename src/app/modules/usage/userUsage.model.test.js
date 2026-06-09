import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Mock mongoose
const mockMongoose = {
  Schema: class MockSchema {
    constructor(definition, options) {
      this.definition = definition;
      this.options = options;
      this.statics = {}; // This is where static methods will be added by the schema definition
      this.methods = {};
      this.virtuals = {};
      this.indexes = [];
    }
    index(fields, options) {
      this.indexes.push({ fields, options });
    }
  },
  model: vi.fn((name, schema) => {
    // This is the actual mock model that will be returned by mongoose.model
    // It needs to have the static methods defined on the schema,
    // AND the methods that the static methods call on 'this' (the model itself).
    const MockModel = {
      // Mock the methods that the static functions call on 'this' (the model instance)
      findOneAndUpdate: vi.fn(),
      findOne: vi.fn(),
      // sort returns 'this' for chaining, so it needs to return the mock model
      sort: vi.fn().mockReturnThis(),
      // Expose the statics defined on the schema
      ...schema.statics,
    };
    return MockModel;
  }),
  Types: {
    ObjectId: class MockObjectId {
      constructor(id) {
        this.id = id || '60c728b29b1d4e001c8e4a1b'; // Default mock ID
      }
      toString() {
        return this.id;
      }
      equals(other) {
        return this.id === (other ? other.toString() : null);
      }
    },
  },
};

vi.mock('mongoose', () => ({
  default: mockMongoose,
}));

// Import the module under test AFTER mocking mongoose
import UserUsageModel from './userUsage.model';

describe('UserUsageModel static methods', () => {
  let mockUserId;
  let mockTenantId;
  let fixedDate;
  let normalizedDate;

  beforeAll(() => {
    // Set a fixed system time for consistent date calculations
    fixedDate = new Date('2023-10-27T10:00:00.000Z');
    vi.setSystemTime(fixedDate);

    normalizedDate = new Date(fixedDate);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    mockUserId = new mockMongoose.Types.ObjectId('user123');
    mockTenantId = new mockMongoose.Types.ObjectId('tenant456');
  });

  afterAll(() => {
    vi.useRealTimers(); // Restore real timers after all tests
  });

  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
    // Ensure sort returns the model itself for chaining
    UserUsageModel.sort.mockReturnThis();
  });

  // --- getOrCreateToday tests ---
  it('getOrCreateToday should find and return an existing document for user and tenant', async () => {
    const existingDoc = {
      userId: mockUserId,
      tenantId: mockTenantId,
      date: normalizedDate,
      requestsUsed: 5,
      storageUsed: 100,
    };
    UserUsageModel.findOneAndUpdate.mockResolvedValue(existingDoc);

    const result = await UserUsageModel.getOrCreateToday(mockUserId, mockTenantId);

    expect(UserUsageModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: mockUserId, tenantId: mockTenantId, date: normalizedDate },
      { $setOnInsert: { requestsUsed: 0 } },
      { upsert: true, new: true }
    );
    expect(result).toEqual(existingDoc);
  });

  it('getOrCreateToday should create a new document if none exists for user and tenant', async () => {
    const newDoc = {
      userId: mockUserId,
      tenantId: mockTenantId,
      date: normalizedDate,
      requestsUsed: 0,
      storageUsed: 0,
    };
    UserUsageModel.findOneAndUpdate.mockResolvedValue(newDoc);

    const result = await UserUsageModel.getOrCreateToday(mockUserId, mockTenantId);

    expect(UserUsageModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: mockUserId, tenantId: mockTenantId, date: normalizedDate },
      { $setOnInsert: { requestsUsed: 0 } },
      { upsert: true, new: true }
    );
    expect(result).toEqual(newDoc);
  });

  it('getOrCreateToday should handle null tenantId (personal mode)', async () => {
    const newDoc = {
      userId: mockUserId,
      tenantId: null,
      date: normalizedDate,
      requestsUsed: 0,
      storageUsed: 0,
    };
    UserUsageModel.findOneAndUpdate.mockResolvedValue(newDoc);

    const result = await UserUsageModel.getOrCreateToday(mockUserId, null);

    expect(UserUsageModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: mockUserId, tenantId: null, date: normalizedDate },
      { $setOnInsert: { requestsUsed: 0 } },
      { upsert: true, new: true }
    );
    expect(result).toEqual(newDoc);
  });

  // --- incrementRequest tests ---
  it('incrementRequest should increment requestsUsed for today for user and tenant', async () => {
    const updatedDoc = {
      userId: mockUserId,
      tenantId: mockTenantId,
      date: normalizedDate,
      requestsUsed: 1,
      storageUsed: 100,
    };
    UserUsageModel.findOneAndUpdate.mockResolvedValue(updatedDoc);

    const result = await UserUsageModel.incrementRequest(mockUserId, mockTenantId);

    expect(UserUsageModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: mockUserId, tenantId: mockTenantId, date: normalizedDate },
      { $inc: { requestsUsed: 1 } },
      { upsert: true, new: true }
    );
    expect(result).toEqual(updatedDoc);
  });

  it('incrementRequest should handle null tenantId', async () => {
    const updatedDoc = {
      userId: mockUserId,
      tenantId: null,
      date: normalizedDate,
      requestsUsed: 1,
      storageUsed: 100,
    };
    UserUsageModel.findOneAndUpdate.mockResolvedValue(updatedDoc);

    const result = await UserUsageModel.incrementRequest(mockUserId, null);

    expect(UserUsageModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: mockUserId, tenantId: null, date: normalizedDate },
      { $inc: { requestsUsed: 1 } },
      { upsert: true, new: true }
    );
    expect(result).toEqual(updatedDoc);
  });

  // --- getTodayRequests tests ---
  it('getTodayRequests should return the current request count if document exists for user and tenant', async () => {
    const existingDoc = {
      userId: mockUserId,
      tenantId: mockTenantId,
      date: normalizedDate,
      requestsUsed: 15,
      storageUsed: 100,
    };
    UserUsageModel.findOne.mockResolvedValue(existingDoc);

    const result = await UserUsageModel.getTodayRequests(mockUserId, mockTenantId);

    expect(UserUsageModel.findOne).toHaveBeenCalledWith(
      { userId: mockUserId, tenantId: mockTenantId, date: normalizedDate }
    );
    expect(result).toBe(15);
  });

  it('getTodayRequests should return 0 if no document exists for today for user and tenant', async () => {
    UserUsageModel.findOne.mockResolvedValue(null);

    const result = await UserUsageModel.getTodayRequests(mockUserId, mockTenantId);

    expect(UserUsageModel.findOne).toHaveBeenCalledWith(
      { userId: mockUserId, tenantId: mockTenantId, date: normalizedDate }
    );
    expect(result).toBe(0);
  });

  it('getTodayRequests should handle null tenantId', async () => {
    const existingDoc = {
      userId: mockUserId,
      tenantId: null,
      date: normalizedDate,
      requestsUsed: 15,
      storageUsed: 100,
    };
    UserUsageModel.findOne.mockResolvedValue(existingDoc);

    const result = await UserUsageModel.getTodayRequests(mockUserId, null);

    expect(UserUsageModel.findOne).toHaveBeenCalledWith(
      { userId: mockUserId, tenantId: null, date: normalizedDate }
    );
    expect(result).toBe(15);
  });

  // --- updateStorage tests ---
  it('updateStorage should increment storageUsed by a positive amount for user and tenant', async () => {
    const docReturnedByFindOneAndUpdate = {
      userId: mockUserId,
      tenantId: mockTenantId,
      date: normalizedDate,
      requestsUsed: 5,
      storageUsed: 150, // After increment
      save: vi.fn().mockResolvedValue(this), // Mock save method on the document
    };
    UserUsageModel.findOneAndUpdate.mockResolvedValue(docReturnedByFindOneAndUpdate);

    const result = await UserUsageModel.updateStorage(mockUserId, mockTenantId, 50);

    expect(UserUsageModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: mockUserId, tenantId: mockTenantId, date: normalizedDate },
      { $inc: { storageUsed: 50 } },
      { upsert: true, new: true }
    );
    expect(result).toEqual(docReturnedByFindOneAndUpdate);
    expect(docReturnedByFindOneAndUpdate.save).not.toHaveBeenCalled(); // Should not call save if not negative
  });

  it('updateStorage should decrement storageUsed by a negative amount for user and tenant', async () => {
    const docReturnedByFindOneAndUpdate = {
      userId: mockUserId,
      tenantId: mockTenantId,
      date: normalizedDate,
      requestsUsed: 5,
      storageUsed: 70, // After decrement
      save: vi.fn().mockResolvedValue(this),
    };
    UserUsageModel.findOneAndUpdate.mockResolvedValue(docReturnedByFindOneAndUpdate);

    const result = await UserUsageModel.updateStorage(mockUserId, mockTenantId, -30);

    expect(UserUsageModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: mockUserId, tenantId: mockTenantId, date: normalizedDate },
      { $inc: { storageUsed: -30 } },
      { upsert: true, new: true }
    );
    expect(result).toEqual(docReturnedByFindOneAndUpdate);
    expect(docReturnedByFindOneAndUpdate.save).not.toHaveBeenCalled();
  });

  it('updateStorage should clamp storageUsed to 0 if it goes negative and call save', async () => {
    const docBeforeClamp = {
      userId: mockUserId,
      tenantId: mockTenantId,
      date: normalizedDate,
      requestsUsed: 5,
      storageUsed: -20, // Simulate update making it negative
      save: vi.fn().mockResolvedValue(this), // Mock save method on the document
    };
    UserUsageModel.findOneAndUpdate.mockResolvedValue(docBeforeClamp);

    const result = await UserUsageModel.updateStorage(mockUserId, mockTenantId, -50); // Initial storage 30, subtract 50 -> -20

    expect(UserUsageModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: mockUserId, tenantId: mockTenantId, date: normalizedDate },
      { $inc: { storageUsed: -50 } },
      { upsert: true, new: true }
    );
    expect(docBeforeClamp.storageUsed).toBe(0); // Should be clamped
    expect(docBeforeClamp.save).toHaveBeenCalledTimes(1); // Should call save
    expect(result).toEqual(docBeforeClamp); // Result should be the clamped doc
  });

  it('updateStorage should handle null tenantId', async () => {
    const docReturnedByFindOneAndUpdate = {
      userId: mockUserId,
      tenantId: null,
      date: normalizedDate,
      requestsUsed: 5,
      storageUsed: 150,
      save: vi.fn().mockResolvedValue(this),
    };
    UserUsageModel.findOneAndUpdate.mockResolvedValue(docReturnedByFindOneAndUpdate);

    const result = await UserUsageModel.updateStorage(mockUserId, null, 50);

    expect(UserUsageModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: mockUserId, tenantId: null, date: normalizedDate },
      { $inc: { storageUsed: 50 } },
      { upsert: true, new: true }
    );
    expect(result).toEqual(docReturnedByFindOneAndUpdate);
  });

  // --- getTotalStorage tests ---
  it('getTotalStorage should return storageUsed from the latest document for user and tenant', async () => {
    const latestDoc = {
      userId: mockUserId,
      tenantId: mockTenantId,
      date: new Date('2023-10-27T00:00:00.000Z'),
      requestsUsed: 10,
      storageUsed: 500,
    };
    UserUsageModel.findOne.mockResolvedValue(latestDoc);

    const result = await UserUsageModel.getTotalStorage(mockUserId, mockTenantId);

    expect(UserUsageModel.findOne).toHaveBeenCalledWith({ userId: mockUserId, tenantId: mockTenantId });
    expect(UserUsageModel.sort).toHaveBeenCalledWith({ date: -1 });
    expect(result).toBe(500);
  });

  it('getTotalStorage should return 0 if no documents are found for user and tenant', async () => {
    UserUsageModel.findOne.mockResolvedValue(null);

    const result = await UserUsageModel.getTotalStorage(mockUserId, mockTenantId);

    expect(UserUsageModel.findOne).toHaveBeenCalledWith({ userId: mockUserId, tenantId: mockTenantId });
    expect(UserUsageModel.sort).toHaveBeenCalledWith({ date: -1 });
    expect(result).toBe(0);
  });

  it('getTotalStorage should handle null tenantId', async () => {
    const latestDoc = {
      userId: mockUserId,
      tenantId: null,
      date: new Date('2023-10-27T00:00:00.000Z'),
      requestsUsed: 10,
      storageUsed: 500,
    };
    UserUsageModel.findOne.mockResolvedValue(latestDoc);

    const result = await UserUsageModel.getTotalStorage(mockUserId, null);

    expect(UserUsageModel.findOne).toHaveBeenCalledWith({ userId: mockUserId, tenantId: null });
    expect(UserUsageModel.sort).toHaveBeenCalledWith({ date: -1 });
    expect(result).toBe(500);
  });
});