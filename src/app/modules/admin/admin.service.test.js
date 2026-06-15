import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminService } from './admin.service.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import paginationHelpers from '../../helpers/paginationHelpers.js';
import UserModel from '../auth/auth.model.js';
import SubscriptionModel from '../payment/payment.model.js';
import mongoose from 'mongoose';

// Mock external dependencies
vi.mock('../../../../config/index.js', () => ({
  default: {
    superAdminEmail: 'superadmin@example.com',
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../helpers/paginationHelpers.js', () => ({
  default: {
    calculatePagination: vi.fn().mockImplementation((options) => ({
      page: options.page || 1,
      limit: options.limit || 10,
      skip: ((options.page || 1) - 1) * (options.limit || 10),
      sortBy: options.sortBy || 'createdAt',
      sortOrder: options.sortOrder || 'desc',
    })),
  },
}));

// Mock Mongoose models and their chainable methods
const mockExec = vi.fn();
const mockSelect = vi.fn().mockImplementation(() => ({ exec: mockExec }));
const mockSort = vi.fn().mockImplementation(() => ({ select: mockSelect, exec: mockExec }));
const mockSkip = vi.fn().mockImplementation(() => ({ sort: mockSort, select: mockSelect, exec: mockExec }));
const mockLimit = vi.fn().mockImplementation(
  () => ({ skip: mockSkip, sort: mockSort, select: mockSelect, exec: mockExec })
);
const mockPopulate = vi.fn().mockImplementation(
  () => ({ sort: mockSort, skip: mockSkip, limit: mockLimit, exec: mockExec })
);

const {
  mockFind,
  mockFindOne,
  mockCountDocuments,
  mockUpdateOne,
  mockDeleteOne,
  mockAggregate,
  mockFindById,
  mockFindByIdAndUpdate,
  mockSave,
  mockToObject
} = vi.hoisted(() => {
  const mockFind = vi.fn().mockImplementation(() => ({
    select: mockSelect,
    sort: mockSort,
    skip: mockSkip,
    limit: mockLimit,
    populate: mockPopulate,
    exec: mockExec,
  }));
  const mockFindOne = vi.fn().mockImplementation(() => ({ exec: mockExec }));
  const mockCountDocuments = vi.fn().mockImplementation(() => ({ exec: mockExec }));
  const mockUpdateOne = vi.fn().mockImplementation(() => ({ exec: mockExec }));
  const mockDeleteOne = vi.fn().mockImplementation(() => ({ exec: mockExec }));
  const mockAggregate = vi.fn().mockImplementation(() => ({ exec: mockExec }));
  const mockFindById = vi.fn().mockImplementation(() => ({ populate: mockPopulate, exec: mockExec }));
  const mockFindByIdAndUpdate = vi.fn().mockImplementation(() => ({ exec: mockExec }));
  const mockSave = vi.fn();
  const mockToObject = vi.fn();

  return {
    mockFind,
    mockFindOne,
    mockCountDocuments,
    mockUpdateOne,
    mockDeleteOne,
    mockAggregate,
    mockFindById,
    mockFindByIdAndUpdate,
    mockSave,
    mockToObject
  };
});

vi.mock('../auth/auth.model.js', () => ({
  default: {
    find: mockFind,
    findOne: mockFindOne,
    countDocuments: mockCountDocuments,
    updateOne: mockUpdateOne,
    deleteOne: mockDeleteOne,
    aggregate: mockAggregate,
    findById: mockFindById,
    toObject: mockToObject,
    save: mockSave,
  },
}));

vi.mock('../payment/payment.model.js', () => ({
  default: {
    find: mockFind,
    countDocuments: mockCountDocuments,
  },
}));

vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();
  return {
    ...actualMongoose,
    Types: {
      ObjectId: vi.fn().mockImplementation((id) => ({
        _id: id,
        toString: () => id,
        equals: (other) => id === other.toString(),
      })),
    },
  };
});

// Mock dynamic imports for tenant, billing, and swarm models/services
vi.mock('../tenant/tenant.model.js', () => ({
  default: {
    find: mockFind,
    countDocuments: mockCountDocuments,
    findById: mockFindById,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    save: mockSave,
    toObject: mockToObject,
  },
}));

vi.mock('../subscription/billingAuditLog.model.js', () => ({
  default: {
    find: mockFind,
    countDocuments: mockCountDocuments,
  },
}));

vi.mock('../swarm/swarmAudit.model.js', () => ({
  default: {
    find: mockFind,
    countDocuments: mockCountDocuments,
  },
}));

vi.mock('../tenant/tenant.service.js', () => ({
  tenantService: {
    getTenantUsage: vi.fn(),
  },
}));

describe('AdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock chainable methods for each test
    mockExec.mockResolvedValue([]);
    mockSelect.mockReturnThis();
    mockSort.mockReturnThis();
    mockSkip.mockReturnThis();
    mockLimit.mockReturnThis();
    mockPopulate.mockReturnThis();
    mockFind.mockReturnThis();
    mockFindOne.mockReturnThis();
    mockCountDocuments.mockReturnThis();
    mockUpdateOne.mockReturnThis();
    mockDeleteOne.mockReturnThis();
    mockAggregate.mockReturnThis();
    mockFindById.mockReturnThis();
    mockFindByIdAndUpdate.mockReturnThis();
    mockSave.mockResolvedValue(true);
    mockToObject.mockImplementation(function () { return { ...this }; }); // Simulate Mongoose .toObject()
    mongoose.Types.ObjectId.isValid = vi.fn().mockImplementation(() => true); // Default to valid ObjectId
  });

  describe('getAllUsersService', () => {
    it('should return all users with default pagination and no filters', async () => {
      const mockUsers = [{ email: 'test1@example.com' }, { email: 'test2@example.com' }];
      mockExec.mockResolvedValueOnce(mockUsers).mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      const result = await AdminService.getAllUsersService({}, {});

      expect(UserModel.find).toHaveBeenCalledWith({ $and: [{}] });
      expect(UserModel.countDocuments).toHaveBeenCalledWith({ $and: [{}] });
      expect(UserModel.countDocuments).toHaveBeenCalledWith({ isSubscribed: true });
      expect(UserModel.countDocuments).toHaveBeenCalledWith({ isSubscribed: { $ne: true } });
      expect(UserModel.countDocuments).toHaveBeenCalledWith({ role: 'unauthorized' });
      expect(paginationHelpers.calculatePagination).toHaveBeenCalledWith({});
      expect(result).toEqual({
        meta: {
          page: 1,
          limit: 10,
          total: 2,
          paidUser: 1,
          freeUser: 1,
          unverifyUsers: 0,
        },
        data: mockUsers,
      });
    });

    it('should apply search term filter', async () => {
      const mockUsers = [{ email: 'search@example.com' }];
      mockExec.mockResolvedValueOnce(mockUsers).mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      const filters = { searchTerm: 'search' };
      const paginationOptions = {};
      const result = await AdminService.getAllUsersService(filters, paginationOptions);

      expect(UserModel.find).toHaveBeenCalledWith({
        $and: [
          {},
          {
            $or: [
              { email: { $regex: 'search', $options: 'i' } },
              { firstName: { $regex: 'search', $options: 'i' } },
              { lastName: { $regex: 'search', $options: 'i' } },
            ],
          },
        ],
      });
      expect(result.data).toEqual(mockUsers);
    });

    it('should apply pagination and sorting options', async () => {
      const mockUsers = [{ email: 'sorted@example.com' }];
      mockExec.mockResolvedValueOnce(mockUsers).mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      const filters = {};
      const paginationOptions = { page: 2, limit: 5, sortBy: 'email', sortOrder: 'asc' };
      await AdminService.getAllUsersService(filters, paginationOptions);

      expect(paginationHelpers.calculatePagination).toHaveBeenCalledWith(paginationOptions);
      expect(mockSort).toHaveBeenCalledWith({ email: 'asc' });
      expect(mockSkip).toHaveBeenCalledWith(5);
      expect(mockLimit).toHaveBeenCalledWith(5);
    });
  });

  describe('getAllBuyerServices', () => {
    it('should return all users with role "buyer"', async () => {
      const mockBuyers = [{ email: 'buyer1@example.com', role: 'buyer' }];
      mockExec.mockResolvedValue(mockBuyers);

      const result = await AdminService.getAllBuyerServices();

      expect(UserModel.find).toHaveBeenCalledWith({ role: 'buyer' });
      expect(result).toEqual(mockBuyers);
    });
  });

  describe('getSellerServiceById', () => {
    it('should return a user by ID', async () => {
      const mockUser = { _id: 'someId', email: 'seller@example.com', role: 'seller' };
      mockExec.mockResolvedValue(mockUser);

      const result = await AdminService.getSellerServiceById('someId');

      expect(UserModel.findOne).toHaveBeenCalledWith({ _id: 'someId' });
      expect(logger.info).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(mockUser);
    });

    it('should return null if user not found', async () => {
      mockExec.mockResolvedValue(null);

      const result = await AdminService.getSellerServiceById('nonExistentId');

      expect(UserModel.findOne).toHaveBeenCalledWith({ _id: 'nonExistentId' });
      expect(logger.info).toHaveBeenCalledWith(null);
      expect(result).toBeNull();
    });
  });

  describe('updateUserRoleService', () => {
    it('should update the user role successfully', async () => {
      const mockUpdateResult = { acknowledged: true, modifiedCount: 1 };
      mockExec.mockResolvedValue(mockUpdateResult);

      const result = await AdminService.updateUserRoleService('userId123', 'admin');

      expect(UserModel.updateOne).toHaveBeenCalledWith(
        { _id: 'userId123' },
        { $set: { role: 'admin' } },
        { runValidators: true }
      );
      expect(result).toEqual(mockUpdateResult);
    });
  });

  describe('deleteUserService', () => {
    it('should delete a user successfully if not super_admin or admin', async () => {
      const mockUser = { _id: 'userId123', role: 'user' };
      const mockDeleteResult = { acknowledged: true, deletedCount: 1 };
      mockExec.mockResolvedValueOnce(mockUser).mockResolvedValueOnce(mockDeleteResult);

      const result = await AdminService.deleteUserService('userId123', 'admin');

      expect(mongoose.Types.ObjectId).toHaveBeenCalledWith('userId123');
      expect(UserModel.findOne).toHaveBeenCalledWith({ _id: { _id: 'userId123', toString: expect.any(Function), equals: expect.any(Function) } });
      expect(UserModel.deleteOne).toHaveBeenCalledWith({ _id: { _id: 'userId123', toString: expect.any(Function), equals: expect.any(Function) } });
      expect(result).toEqual(mockDeleteResult);
    });

    it('should delete an admin user if requester is super_admin', async () => {
      const mockUser = { _id: 'adminId', role: 'admin' };
      const mockDeleteResult = { acknowledged: true, deletedCount: 1 };
      mockExec.mockResolvedValueOnce(mockUser).mockResolvedValueOnce(mockDeleteResult);

      const result = await AdminService.deleteUserService('adminId', 'super_admin');

      expect(UserModel.findOne).toHaveBeenCalledWith({ _id: { _id: 'adminId', toString: expect.any(Function), equals: expect.any(Function) } });
      expect(UserModel.deleteOne).toHaveBeenCalledWith({ _id: { _id: 'adminId', toString: expect.any(Function), equals: expect.any(Function) } });
      expect(result).toEqual(mockDeleteResult);
    });

    it('should throw an error for invalid user ID format', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);
      await expect(AdminService.deleteUserService('invalidId', 'admin')).rejects.toThrow('Invalid user ID format');
      expect(mongoose.Types.ObjectId.isValid).toHaveBeenCalledWith('invalidId');
      expect(UserModel.findOne).not.toHaveBeenCalled();
    });

    it('should throw an error if user not found', async () => {
      mockExec.mockResolvedValueOnce(null); // User not found

      await expect(AdminService.deleteUserService('nonExistentId', 'admin')).rejects.toThrow('User not found');
      expect(UserModel.findOne).toHaveBeenCalledWith({ _id: { _id: 'nonExistentId', toString: expect.any(Function), equals: expect.any(Function) } });
      expect(UserModel.deleteOne).not.toHaveBeenCalled();
    });

    it('should throw an error if trying to delete a super_admin', async () => {
      const mockUser = { _id: 'superAdminId', role: 'super_admin' };
      mockExec.mockResolvedValueOnce(mockUser);

      await expect(AdminService.deleteUserService('superAdminId', 'admin')).rejects.toThrow('Cannot delete a super_admin user');
      expect(UserModel.findOne).toHaveBeenCalledWith({ _id: { _id: 'superAdminId', toString: expect.any(Function), equals: expect.any(Function) } });
      expect(UserModel.deleteOne).not.toHaveBeenCalled();
    });

    it('should throw an error if non-super_admin tries to delete an admin', async () => {
      const mockUser = { _id: 'adminId', role: 'admin' };
      mockExec.mockResolvedValueOnce(mockUser);

      await expect(AdminService.deleteUserService('adminId', 'user')).rejects.toThrow('Only a super_admin can delete an admin user');
      expect(UserModel.findOne).toHaveBeenCalledWith({ _id: { _id: 'adminId', toString: expect.any(Function), equals: expect.any(Function) } });
      expect(UserModel.deleteOne).not.toHaveBeenCalled();
    });
  });

  describe('getAdminServices', () => {
    it('should return true if email matches super admin email from config', async () => {
      const result = await AdminService.getAdminServices('superadmin@example.com');
      expect(result).toBe(true);
      expect(UserModel.findOne).not.toHaveBeenCalled();
    });

    it('should return true if user is an admin in DB', async () => {
      mockExec.mockResolvedValue({ email: 'admin@example.com', role: 'admin' });
      const result = await AdminService.getAdminServices('admin@example.com');
      expect(result).toBe(true);
      expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'admin@example.com' });
    });

    it('should return true if user is a super_admin in DB', async () => {
      mockExec.mockResolvedValue({ email: 'db_superadmin@example.com', role: 'super_admin' });
      const result = await AdminService.getAdminServices('db_superadmin@example.com');
      expect(result).toBe(true);
      expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'db_superadmin@example.com' });
    });

    it('should return false if user is not an admin or super_admin', async () => {
      mockExec.mockResolvedValue({ email: 'user@example.com', role: 'user' });
      const result = await AdminService.getAdminServices('user@example.com');
      expect(result).toBe(false);
      expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'user@example.com' });
    });

    it('should return false if email does not match config and user not found in DB', async () => {
      mockExec.mockResolvedValue(null);
      const result = await AdminService.getAdminServices('nonexistent@example.com');
      expect(result).toBe(false);
      expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'nonexistent@example.com' });
    });

    it('should handle case-insensitivity for super admin email from config', async () => {
      const result = await AdminService.getAdminServices('SuperAdmin@example.com');
      expect(result).toBe(true);
    });
  });

  describe('getUserStatisticsByMonthService', () => {
    it('should return user statistics grouped by month and year', async () => {
      const mockAggregationResult = [
        { _id: { year: 2023, month: 1 }, count: 5 },
        { _id: { year: 2023, month: 2 }, count: 10 },
        { _id: { year: 2024, month: 1 }, count: 7 },
      ];
      mockExec.mockResolvedValue(mockAggregationResult);

      const result = await AdminService.getUserStatisticsByMonthService();

      expect(UserModel.aggregate).toHaveBeenCalledWith([
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1 },
        },
      ]);
      expect(result).toEqual({
        statusCode: 200,
        success: true,
        message: 'Get User Statistics Successfully',
        data: [
          {
            count: 15,
            year: 2023,
            totalMonth: 2,
            month: {
              January: 5,
              February: 10,
            },
          },
          {
            count: 7,
            year: 2024,
            totalMonth: 1,
            month: {
              January: 7,
            },
          },
        ],
      });
    });

    it('should return empty data if no aggregation results', async () => {
      mockExec.mockResolvedValue([]);

      const result = await AdminService.getUserStatisticsByMonthService();

      expect(result.data).toEqual([]);
    });
  });

  describe('getAllPaymentService', () => {
    it('should return all payments with default pagination and no filters', async () => {
      const mockPayments = [{ transactionId: 'tx1', plan_name: 'professional' }];
      mockExec.mockResolvedValueOnce(mockPayments).mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const result = await AdminService.getAllPaymentService({}, {});

      expect(SubscriptionModel.find).toHaveBeenCalledWith({ $and: [{}] });
      expect(SubscriptionModel.countDocuments).toHaveBeenCalledWith({ $and: [{}] });
      expect(SubscriptionModel.countDocuments).toHaveBeenCalledWith({ paymentStatus: 'paid' });
      expect(SubscriptionModel.countDocuments).toHaveBeenCalledWith({ plan_name: 'free' });
      expect(SubscriptionModel.countDocuments).toHaveBeenCalledWith({ plan_name: 'professional' });
      expect(SubscriptionModel.countDocuments).toHaveBeenCalledWith({ plan_name: 'personal' });
      expect(SubscriptionModel.countDocuments).toHaveBeenCalledWith({ plan_name: 'business' });
      expect(paginationHelpers.calculatePagination).toHaveBeenCalledWith({});
      expect(result).toEqual({
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          paidUser: 1,
          freeUser: 0,
          professionalPlan: 1,
          personalPlan: 0,
          businessPlan: 0,
        },
        data: mockPayments,
      });
    });

    it('should apply search term filter for payments', async () => {
      const mockPayments = [{ transactionId: 'searchTx', plan_name: 'personal' }];
      mockExec.mockResolvedValueOnce(mockPayments).mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      const filters = { searchTerm: 'searchTx' };
      const paginationOptions = {};
      const result = await AdminService.getAllPaymentService(filters, paginationOptions);

      expect(SubscriptionModel.find).toHaveBeenCalledWith({
        $and: [
          {},
          {
            $or: [
              { price: { $regex: 'searchTx', $options: 'i' } },
              { plan_name: { $regex: 'searchTx', $options: 'i' } },
              { duration: { $regex: 'searchTx', $options: 'i' } },
              { expiresAt: { $regex: 'searchTx', $options: 'i' } },
            ],
          },
        ],
      });
      expect(result.data).toEqual(mockPayments);
    });
  });

  describe('getAllTenantsService', () => {
    it('should return all tenants with default pagination and no filters', async () => {
      const mockTenants = [{ name: 'Tenant A', slug: 'tenant-a' }];
      mockExec.mockResolvedValueOnce(mockTenants).mockResolvedValueOnce(1);

      const result = await AdminService.getAllTenantsService({}, {});

      expect(mockFind).toHaveBeenCalledWith({});
      expect(mockCountDocuments).toHaveBeenCalledWith({});
      expect(paginationHelpers.calculatePagination).toHaveBeenCalledWith({});
      expect(mockPopulate).toHaveBeenCalledWith('ownerId', 'name email');
      expect(result).toEqual({
        meta: { page: 1, limit: 10, total: 1 },
        data: mockTenants,
      });
    });

    it('should apply search term and filter data for tenants', async () => {
      const mockTenants = [{ name: 'Search Tenant', slug: 'search-tenant' }];
      mockExec.mockResolvedValueOnce(mockTenants).mockResolvedValueOnce(1);

      const filters = { searchTerm: 'search', status: 'active' };
      const paginationOptions = {};
      await AdminService.getAllTenantsService(filters, paginationOptions);

      expect(mockFind).toHaveBeenCalledWith({
        $and: [
          {
            $or: [
              { name: { $regex: 'search', $options: 'i' } },
              { slug: { $regex: 'search', $options: 'i' } },
            ],
          },
          { $and: [{ status: 'active' }] },
        ],
      });
    });
  });

  describe('getTenantDetailsService', () => {
    it('should return tenant details with member count', async () => {
      const mockTenant = { _id: 'tenantId1', name: 'Test Tenant', ownerId: 'ownerId1', toObject: mockToObject };
      const mockOwner = { _id: 'ownerId1', name: 'Owner Name', email: 'owner@example.com' };
      mockExec.mockResolvedValueOnce(mockTenant); // For findById
      mockExec.mockResolvedValueOnce(5); // For countDocuments
      mockToObject.mockReturnValue({ ...mockTenant, ownerId: mockOwner });

      const result = await AdminService.getTenantDetailsService('tenantId1');

      expect(mockFindById).toHaveBeenCalledWith('tenantId1');
      expect(mockPopulate).toHaveBeenCalledWith('ownerId', 'name email');
      expect(UserModel.countDocuments).toHaveBeenCalledWith({ tenantId: 'tenantId1' });
      expect(result).toEqual({ ...mockTenant, ownerId: mockOwner, memberCount: 5 });
    });

    it('should throw an error if tenant not found', async () => {
      mockExec.mockResolvedValueOnce(null); // Tenant not found

      await expect(AdminService.getTenantDetailsService('nonExistentTenantId')).rejects.toThrow('Tenant not found');
    });
  });

  describe('updateTenantStatusService', () => {
    it('should update tenant status successfully', async () => {
      const mockUpdatedTenant = { _id: 'tenantId1', status: 'inactive' };
      mockExec.mockResolvedValue(mockUpdatedTenant);

      const result = await AdminService.updateTenantStatusService('tenantId1', 'inactive');

      expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
        'tenantId1',
        { status: 'inactive' },
        { new: true, runValidators: true }
      );
      expect(result).toEqual(mockUpdatedTenant);
    });

    it('should throw an error if tenant not found during update', async () => {
      mockExec.mockResolvedValue(null);

      await expect(AdminService.updateTenantStatusService('nonExistentTenantId', 'active')).rejects.toThrow('Tenant not found');
    });
  });

  describe('getTenantUsageService', () => {
    it('should call tenantService.getTenantUsage', async () => {
      const mockUsage = { cpu: '10%', memory: '20%' };
      const { tenantService } = await import('../tenant/tenant.service.js');
      tenantService.getTenantUsage.mockResolvedValue(mockUsage);

      const result = await AdminService.getTenantUsageService('tenantId1');

      expect(tenantService.getTenantUsage).toHaveBeenCalledWith('tenantId1');
      expect(result).toEqual(mockUsage);
    });
  });

  describe('extendTenantTrialService', () => {
    it('should extend trial for an existing tenant', async () => {
      const initialTrialEnd = new Date();
      const mockTenant = {
        _id: 'tenantId1',
        trialEndsAt: initialTrialEnd,
        save: mockSave,
      };
      mockExec.mockResolvedValue(mockTenant);

      const daysToExtend = 7;
      const result = await AdminService.extendTenantTrialService('tenantId1', daysToExtend);

      const expectedNewTrialEnd = new Date(initialTrialEnd);
      expectedNewTrialEnd.setDate(expectedNewTrialEnd.getDate() + daysToExtend);

      expect(mockFindById).toHaveBeenCalledWith('tenantId1');
      expect(mockTenant.trialEndsAt.toDateString()).toEqual(expectedNewTrialEnd.toDateString());
      expect(mockSave).toHaveBeenCalled();
      expect(result).toEqual(mockTenant);
    });

    it('should set trial end from current date if not existing', async () => {
      const mockTenant = {
        _id: 'tenantId1',
        trialEndsAt: null,
        save: mockSave,
      };
      mockExec.mockResolvedValue(mockTenant);

      const daysToExtend = 5;
      const result = await AdminService.extendTenantTrialService('tenantId1', daysToExtend);

      const expectedNewTrialEnd = new Date();
      expectedNewTrialEnd.setDate(expectedNewTrialEnd.getDate() + daysToExtend);

      expect(mockFindById).toHaveBeenCalledWith('tenantId1');
      expect(result.trialEndsAt.toDateString()).toEqual(expectedNewTrialEnd.toDateString());
      expect(mockSave).toHaveBeenCalled();
      expect(result).toEqual(mockTenant);
    });

    it('should throw an error if tenant not found', async () => {
      mockExec.mockResolvedValue(null);

      await expect(AdminService.extendTenantTrialService('nonExistentTenantId', 10)).rejects.toThrow('Tenant not found');
    });
  });

  describe('getBillingAuditLogsService', () => {
    it('should return billing audit logs with default pagination and sorting', async () => {
      const mockLogs = [{ action: 'login', ipAddress: '127.0.0.1' }];
      mockExec.mockResolvedValueOnce(mockLogs).mockResolvedValueOnce(1);

      const result = await AdminService.getBillingAuditLogsService({}, {});

      expect(mockFind).toHaveBeenCalledWith({});
      expect(mockCountDocuments).toHaveBeenCalledWith({});
      expect(paginationHelpers.calculatePagination).toHaveBeenCalledWith({});
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 }); // Default sort
      expect(mockPopulate).toHaveBeenCalledWith('tenantId', 'name slug');
      expect(mockPopulate).toHaveBeenCalledWith('userId', 'email role firstName lastName');
      expect(result).toEqual({
        meta: { page: 1, limit: 10, total: 1 },
        data: mockLogs,
      });
    });

    it('should apply search term and action filter for billing logs', async () => {
      const mockLogs = [{ action: 'payment_success', ipAddress: '192.168.1.1' }];
      mockExec.mockResolvedValueOnce(mockLogs).mockResolvedValueOnce(1);

      const filters = { searchTerm: 'payment', action: 'payment_success' };
      const paginationOptions = { sortBy: 'action', sortOrder: 'asc' };
      await AdminService.getBillingAuditLogsService(filters, paginationOptions);

      expect(mockFind).toHaveBeenCalledWith({
        $and: [
          {
            $or: [
              { action: { $regex: 'payment', $options: 'i' } },
              { ipAddress: { $regex: 'payment', $options: 'i' } },
            ],
          },
          { action: 'payment_success' },
        ],
      });
      expect(mockSort).toHaveBeenCalledWith({ action: 'asc' });
    });
  });

  describe('getSwarmAuditsService', () => {
    it('should return swarm audits with default pagination and sorting', async () => {
      const mockAudits = [{ userId: 'user1', toolName: 'toolA', status: 'success' }];
      mockExec.mockResolvedValueOnce(mockAudits).mockResolvedValueOnce(1);

      const result = await AdminService.getSwarmAuditsService({}, {});

      expect(mockFind).toHaveBeenCalledWith({});
      expect(mockCountDocuments).toHaveBeenCalledWith({});
      expect(paginationHelpers.calculatePagination).toHaveBeenCalledWith({});
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 }); // Default sort
      expect(result).toEqual({
        meta: { page: 1, limit: 10, total: 1 },
        data: mockAudits,
      });
    });

    it('should apply search term, status, and toolName filters for swarm audits', async () => {
      const mockAudits = [{ userId: 'user2', toolName: 'toolB', status: 'failed', errorMessage: 'error' }];
      mockExec.mockResolvedValueOnce(mockAudits).mockResolvedValueOnce(1);

      const filters = { searchTerm: 'error', status: 'failed', toolName: 'toolB' };
      const paginationOptions = { sortBy: 'toolName', sortOrder: 'desc' };
      await AdminService.getSwarmAuditsService(filters, paginationOptions);

      expect(mockFind).toHaveBeenCalledWith({
        $and: [
          {
            $or: [
              { userId: { $regex: 'error', $options: 'i' } },
              { toolName: { $regex: 'error', $options: 'i' } },
              { errorMessage: { $regex: 'error', $options: 'i' } },
            ],
          },
          { status: 'failed' },
          { toolName: 'toolB' },
        ],
      });
      expect(mockSort).toHaveBeenCalledWith({ toolName: 'desc' });
    });
  });
});