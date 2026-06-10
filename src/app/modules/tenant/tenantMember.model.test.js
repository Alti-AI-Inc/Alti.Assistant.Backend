import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

// Mock the Mongoose module.
// This setup allows us to intercept calls to `mongoose.model` and `mongoose.Schema`,
// returning a mock model with spies on its query methods.
vi.mock('mongoose', async () => {
  const actualMongoose = await vi.importActual('mongoose');
  const Schema = vi.fn().mockImplementation((schemaDef, options) => {
    // Create a real schema instance to allow for index testing etc.
    const schema = new actualMongoose.Schema(schemaDef, options);
    // Attach statics and methods to the schema instance so we can test them.
    schema.statics = schemaDef.statics || {};
    schema.methods = schemaDef.methods || {};
    return schema;
  });

  const model = vi.fn().mockImplementation((name, schema) => {
    // The mock model will have the static methods from the schema definition.
    // It will also have spies for Mongoose's query methods.
    const mockModel = {
      ...schema.statics,
      schema, // Attach the schema for testing instance methods and indexes
      findOne: vi.fn(),
      find: vi.fn(),
    };
    return mockModel;
  });

  return {
    ...actualMongoose,
    Schema,
    model,
    default: {
      ...actualMongoose,
      Schema,
      model,
    },
  };
});

// Import the model *after* the mock has been set up.
// This ensures it uses our mocked version of Mongoose.
import TenantMember from './tenantMember.model.js';

describe('TenantMember Model', () => {
  const userId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    // Reset mocks before each test to ensure isolation.
    vi.clearAllMocks();
  });

  describe('Static Methods', () => {
    describe('isMember', () => {
      it('should return true if an active membership exists', async () => {
        TenantMember.findOne.mockResolvedValue({ userId, tenantId, status: 'active' });
        const result = await TenantMember.isMember(userId, tenantId);
        expect(TenantMember.findOne).toHaveBeenCalledWith({
          userId,
          tenantId,
          status: 'active',
        });
        expect(result).toBe(true);
      });

      it('should return false if membership is not active (e.g., invited)', async () => {
        // findOne will return null if the query for 'active' status finds nothing
        TenantMember.findOne.mockResolvedValue(null);
        const result = await TenantMember.isMember(userId, tenantId);
        expect(TenantMember.findOne).toHaveBeenCalledWith({
          userId,
          tenantId,
          status: 'active',
        });
        expect(result).toBe(false);
      });

      it('should return false if no membership exists at all', async () => {
        TenantMember.findOne.mockResolvedValue(null);
        const result = await TenantMember.isMember(userId, tenantId);
        expect(TenantMember.findOne).toHaveBeenCalledWith({
          userId,
          tenantId,
          status: 'active',
        });
        expect(result).toBe(false);
      });
    });

    describe('getUserRole', () => {
      it('should return role and permissions for an active member', async () => {
        const mockMembership = { role: 'admin', permissions: ['read', 'write'] };
        const query = {
          select: vi.fn().mockResolvedValue(mockMembership),
        };
        TenantMember.findOne.mockReturnValue(query);

        const result = await TenantMember.getUserRole(userId, tenantId);

        expect(TenantMember.findOne).toHaveBeenCalledWith({
          userId,
          tenantId,
          status: 'active',
        });
        expect(query.select).toHaveBeenCalledWith('role permissions');
        expect(result).toEqual(mockMembership);
      });

      it('should return null if no active membership exists', async () => {
        const query = {
          select: vi.fn().mockResolvedValue(null),
        };
        TenantMember.findOne.mockReturnValue(query);

        const result = await TenantMember.getUserRole(userId, tenantId);

        expect(TenantMember.findOne).toHaveBeenCalledWith({
          userId,
          tenantId,
          status: 'active',
        });
        expect(query.select).toHaveBeenCalledWith('role permissions');
        expect(result).toBeNull();
      });
    });

    describe('getUserTenants', () => {
      it('should find active tenants for a user and populate tenant details, sorted by last access', async () => {
        const mockTenants = [{ tenantId: { name: 'Tenant A' } }, { tenantId: { name: 'Tenant B' } }];
        const query = {
          populate: vi.fn().mockReturnThis(),
          sort: vi.fn().mockResolvedValue(mockTenants),
        };
        TenantMember.find.mockReturnValue(query);

        const result = await TenantMember.getUserTenants(userId);

        expect(TenantMember.find).toHaveBeenCalledWith({
          userId,
          status: 'active',
        });
        expect(query.populate).toHaveBeenCalledWith('tenantId', 'name slug subdomain plan status');
        expect(query.sort).toHaveBeenCalledWith({ lastAccessedAt: -1 });
        expect(result).toEqual(mockTenants);
      });
    });

    describe('getTenantMembers', () => {
      it('should find active and invited members for a tenant and populate user/inviter details', async () => {
        const mockMembers = [{ userId: { email: 'test@test.com' } }];
        const query = {
          populate: vi.fn().mockReturnThis(),
          sort: vi.fn().mockResolvedValue(mockMembers),
        };
        TenantMember.find.mockReturnValue(query);

        const result = await TenantMember.getTenantMembers(tenantId);

        expect(TenantMember.find).toHaveBeenCalledWith({
          tenantId,
          status: { $in: ['active', 'invited'] },
        });
        expect(query.populate).toHaveBeenCalledWith('userId', 'email firstName lastName avatar');
        expect(query.populate).toHaveBeenCalledWith('invitedBy', 'email firstName lastName');
        expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(result).toEqual(mockMembers);
      });
    });
  });

  describe('Instance Methods', () => {
    describe('updateLastAccessed', () => {
      let fakeDate;

      beforeEach(() => {
        fakeDate = new Date('2023-10-27T10:00:00.000Z');
        vi.useFakeTimers();
        vi.setSystemTime(fakeDate);
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should update lastAccessedAt to the current time and save the document', async () => {
        const mockMemberInstance = {
          lastAccessedAt: new Date('2023-01-01T00:00:00.000Z'),
          save: vi.fn().mockResolvedValue(this),
        };

        // The method is defined on the schema's `methods` object. We invoke it
        // using `.call()` to provide our mock instance as the `this` context.
        await TenantMember.schema.methods.updateLastAccessed.call(mockMemberInstance);

        expect(mockMemberInstance.lastAccessedAt).toEqual(fakeDate);
        expect(mockMemberInstance.save).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Schema and Indexes', () => {
    // Access the schema instance created by our mock
    const schema = mongoose.Schema.mock.results[0].value;

    it('should have a compound unique index on userId and tenantId to prevent duplicates', () => {
      const index = schema.indexes().find(idx => idx[0].userId === 1 && idx[0].tenantId === 1);
      expect(index).toBeDefined();
      expect(index[1].unique).toBe(true);
    });

    it('should have an index on userId and status for efficient user tenant lookups', () => {
      const index = schema.indexes().find(idx => idx[0].userId === 1 && idx[0].status === 1);
      expect(index).toBeDefined();
    });

    it('should have an index on tenantId and status for efficient tenant member lookups', () => {
      const index = schema.indexes().find(idx => idx[0].tenantId === 1 && idx[0].status === 1);
      expect(index).toBeDefined();
    });

    it('should define required fields correctly', () => {
      expect(schema.path('userId').isRequired).toBe(true);
      expect(schema.path('tenantId').isRequired).toBe(true);
      expect(schema.path('role').isRequired).toBe(true);
    });

    it('should have correct default values', () => {
      expect(schema.path('role').defaultValue).toBe('user');
      expect(schema.path('status').defaultValue).toBe('active');
      expect(schema.path('permissions').defaultValue).toEqual([]);
    });
  });
});