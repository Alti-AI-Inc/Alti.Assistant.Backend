import { describe, it, expect, vi, beforeEach } from 'vitest';
import { platformAdminService } from './platformAdmin.service.js';
import Tenant from '../tenant/tenant.model.js';
import PlatformConfig from '../platform/platformConfig.model.js';

vi.mock('../tenant/tenant.model.js', () => ({
  default: {
    countDocuments: vi.fn(),
    find: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock('../platform/platformConfig.model.js', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

describe('platformAdminService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getGlobalStatistics', () => {
    it('should return the total number of tenants and system health', async () => {
      Tenant.countDocuments.mockResolvedValue(123);

      const stats = await platformAdminService.getGlobalStatistics();

      expect(Tenant.countDocuments).toHaveBeenCalledOnce();
      expect(stats).toEqual({
        totalTenants: 123,
        systemHealth: 'OK',
      });
    });
  });

  describe('getAllTenants', () => {
    const mockLean = vi.fn();
    const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
    const mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockSort = vi.fn().mockReturnValue({ skip: mockSkip, limit: mockLimit }); // sort can be skipped

    beforeEach(() => {
        mockLean.mockReset();
        mockLimit.mockReset().mockReturnValue({ lean: mockLean });
        mockSkip.mockReset().mockReturnValue({ limit: mockLimit });
        mockSort.mockReset().mockReturnValue({ skip: mockSkip, limit: mockLimit });
        Tenant.find.mockReturnValue({ sort: mockSort, skip: mockSkip, limit: mockLimit });
    });

    it('should get all tenants with default pagination', async () => {
      const mockTenants = [{ name: 'Tenant A' }, { name: 'Tenant B' }];
      mockLean.mockResolvedValue(mockTenants);

      const result = await platformAdminService.getAllTenants();

      expect(Tenant.find).toHaveBeenCalledWith({});
      expect(mockSort).not.toHaveBeenCalled();
      expect(mockSkip).toHaveBeenCalledWith(0); // (1 - 1) * 20
      expect(mockLimit).toHaveBeenCalledWith(20);
      expect(mockLean).toHaveBeenCalledOnce();
      expect(result).toEqual(mockTenants);
    });

    it('should handle custom pagination', async () => {
      mockLean.mockResolvedValue([]);
      const options = { page: 3, limit: 10 };

      await platformAdminService.getAllTenants(options);

      expect(Tenant.find).toHaveBeenCalledWith({});
      expect(mockSkip).toHaveBeenCalledWith(20); // (3 - 1) * 10
      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should apply status filter', async () => {
      mockLean.mockResolvedValue([]);
      const options = { status: 'active' };

      await platformAdminService.getAllTenants(options);

      expect(Tenant.find).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should apply sorting', async () => {
      mockLean.mockResolvedValue([]);
      const options = { sortBy: '-createdAt' };

      await platformAdminService.getAllTenants(options);

      expect(mockSort).toHaveBeenCalledWith('-createdAt');
    });
  });

  describe('updateTenantStatus', () => {
    it('should call findByIdAndUpdate with correct parameters and return the updated tenant', async () => {
      const updatedTenant = { _id: 'tenant1', status: 'suspended', suspensionReason: 'payment_due' };
      const mockLean = vi.fn().mockResolvedValue(updatedTenant);
      Tenant.findByIdAndUpdate.mockReturnValue({ lean: mockLean });

      const result = await platformAdminService.updateTenantStatus(
        'tenant1',
        'suspended',
        'payment_due',
        'admin123'
      );

      expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(
        'tenant1',
        {
          status: 'suspended',
          suspensionReason: 'payment_due',
          statusUpdatedBy: 'admin123',
        },
        { new: true }
      );
      expect(mockLean).toHaveBeenCalledOnce();
      expect(result).toEqual(updatedTenant);
    });
  });

  describe('overrideTenantLimits', () => {
    it('should call findByIdAndUpdate with correct limit parameters', async () => {
      const newLimits = { maxUsers: 50, maxAssistants: 10 };
      const updatedTenant = { _id: 'tenant1', limits: newLimits };
      const mockLean = vi.fn().mockResolvedValue(updatedTenant);
      Tenant.findByIdAndUpdate.mockReturnValue({ lean: mockLean });

      const result = await platformAdminService.overrideTenantLimits(
        'tenant1',
        newLimits,
        'admin123'
      );

      expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(
        'tenant1',
        {
          limits: newLimits,
          limitsUpdatedBy: 'admin123',
        },
        { new: true }
      );
      expect(mockLean).toHaveBeenCalledOnce();
      expect(result).toEqual(updatedTenant);
    });
  });

  describe('getSystemConfiguration', () => {
    it('should return the system configuration', async () => {
      const mockConfig = { settingA: 'valueA' };
      const mockLean = vi.fn().mockResolvedValue(mockConfig);
      PlatformConfig.findOneAndUpdate.mockReturnValue({ lean: mockLean });

      const result = await platformAdminService.getSystemConfiguration();

      expect(PlatformConfig.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        { $setOnInsert: {} },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      expect(mockLean).toHaveBeenCalledOnce();
      expect(result).toEqual(mockConfig);
    });
  });

  describe('updateSystemConfiguration', () => {
    it('should call findOneAndUpdate with correct parameters', async () => {
      const updates = { maintenanceMode: true };
      const updatedConfig = { maintenanceMode: true, configUpdatedBy: 'admin123' };
      const mockLean = vi.fn().mockResolvedValue(updatedConfig);
      PlatformConfig.findOneAndUpdate.mockReturnValue({ lean: mockLean });

      const result = await platformAdminService.updateSystemConfiguration(updates, 'admin123');

      expect(PlatformConfig.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        {
          maintenanceMode: true,
          configUpdatedBy: 'admin123',
        },
        { new: true, upsert: true }
      );
      expect(mockLean).toHaveBeenCalledOnce();
      expect(result).toEqual(updatedConfig);
    });
  });

  describe('queryLogs', () => {
    it('should return an empty array as it is a stub implementation', async () => {
      const logs = await platformAdminService.queryLogs({ level: 'error' });
      expect(logs).toEqual([]);
    });
  });
});