import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { PlatformController } from './platform.controller.js';
import Tenant from '../tenant/tenant.model.js';
import PlatformConfig from '../platform/platformConfig.model.js';
import sendResponse from '../../../shared/sendResponse.js';
import catchAsync from '../../../shared/catchAsync.js';

// Mock dependencies
vi.mock('../../../shared/catchAsync.js', () => ({
  default: vi.fn().mockImplementation(fn => fn), // Mock catchAsync to just return the function it's passed
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));

vi.mock('../tenant/tenant.model.js');
vi.mock('../platform/platformConfig.model.js');

describe('PlatformController', () => {
  let req;
  let res;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      params: {},
      body: {},
      user: {}, // Mock user for potential role checks in middleware (not tested here)
    };
    res = {}; // Mock res object, sendResponse will be used to check the output
  });

  describe('getAllTenants', () => {
    it('should retrieve all tenants and send a success response', async () => {
      const mockTenants = [{ name: 'Tenant A' }, { name: 'Tenant B' }];
      const leanMock = vi.fn().mockResolvedValue(mockTenants);
      Tenant.find = vi.fn().mockReturnValue({ lean: leanMock });

      await PlatformController.getAllTenants(req, res);

      expect(Tenant.find).toHaveBeenCalledWith({});
      expect(leanMock).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Tenants retrieved successfully',
        data: mockTenants,
      });
    });
  });

  describe('suspendTenant', () => {
    it('should suspend a tenant and send the updated tenant data', async () => {
      const tenantId = '65a9a7a7d3a7b3a3a3a3a3a3';
      const updatedTenant = { _id: tenantId, status: 'suspended' };
      req.params.id = tenantId;
      const leanMock = vi.fn().mockResolvedValue(updatedTenant);
      Tenant.findByIdAndUpdate = vi.fn().mockReturnValue({ lean: leanMock });

      await PlatformController.suspendTenant(req, res);

      expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(
        tenantId,
        { status: 'suspended' },
        { new: true }
      );
      expect(leanMock).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Tenant suspended successfully',
        data: updatedTenant,
      });
    });
  });

  describe('unsuspendTenant', () => {
    it('should unsuspend a tenant and send the updated tenant data', async () => {
      const tenantId = '65a9a7a7d3a7b3a3a3a3a3a3';
      const updatedTenant = { _id: tenantId, status: 'active' };
      req.params.id = tenantId;
      const leanMock = vi.fn().mockResolvedValue(updatedTenant);
      Tenant.findByIdAndUpdate = vi.fn().mockReturnValue({ lean: leanMock });

      await PlatformController.unsuspendTenant(req, res);

      expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(
        tenantId,
        { status: 'active' },
        { new: true }
      );
      expect(leanMock).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Tenant unsuspended successfully',
        data: updatedTenant,
      });
    });
  });

  describe('overrideTenantLimits', () => {
    it('should update tenant limits and send the updated tenant data', async () => {
      const tenantId = '65a9a7a7d3a7b3a3a3a3a3a3';
      const newLimits = { maxUsers: 100, maxTokens: 50000 };
      const updatedTenant = { _id: tenantId, limits: newLimits };
      req.params.id = tenantId;
      req.body = newLimits;
      const leanMock = vi.fn().mockResolvedValue(updatedTenant);
      Tenant.findByIdAndUpdate = vi.fn().mockReturnValue({ lean: leanMock });

      await PlatformController.overrideTenantLimits(req, res);

      expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(
        tenantId,
        { limits: newLimits },
        { new: true }
      );
      expect(leanMock).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Tenant limits updated successfully',
        data: updatedTenant,
      });
    });
  });

  describe('getSystemConfig', () => {
    it('should retrieve existing system config', async () => {
      const mockConfig = { setting: 'value' };
      const leanMock = vi.fn().mockResolvedValue(mockConfig);
      PlatformConfig.findOne = vi.fn().mockReturnValue({ lean: leanMock });
      PlatformConfig.create = vi.fn();

      await PlatformController.getSystemConfig(req, res);

      expect(PlatformConfig.findOne).toHaveBeenCalledWith({});
      expect(leanMock).toHaveBeenCalled();
      expect(PlatformConfig.create).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'System configuration retrieved successfully',
        data: mockConfig,
      });
    });

    it('should create a new system config if one does not exist', async () => {
      const newConfig = { _id: 'newConfig123' };
      const leanMock = vi.fn().mockResolvedValue(null);
      PlatformConfig.findOne = vi.fn().mockReturnValue({ lean: leanMock });
      PlatformConfig.create = vi.fn().mockResolvedValue(newConfig);

      await PlatformController.getSystemConfig(req, res);

      expect(PlatformConfig.findOne).toHaveBeenCalledWith({});
      expect(leanMock).toHaveBeenCalled();
      expect(PlatformConfig.create).toHaveBeenCalledWith({});
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'System configuration retrieved successfully',
        data: newConfig,
      });
    });
  });

  describe('updateSystemConfig', () => {
    it('should update the system config and send the updated data', async () => {
      const newConfig = { setting: 'newValue' };
      const updatedConfig = { _id: 'config123', ...newConfig };
      req.body = newConfig;
      const leanMock = vi.fn().mockResolvedValue(updatedConfig);
      PlatformConfig.findOneAndUpdate = vi.fn().mockReturnValue({ lean: leanMock });

      await PlatformController.updateSystemConfig(req, res);

      expect(PlatformConfig.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        newConfig,
        { new: true, upsert: true }
      );
      expect(leanMock).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'System configuration updated successfully',
        data: updatedConfig,
      });
    });
  });

  describe('getGlobalLogs', () => {
    it('should send a success response with an empty array for logs', async () => {
      await PlatformController.getGlobalLogs(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Logs retrieved successfully',
        data: [],
      });
    });
  });

  describe('getGlobalStats', () => {
    it('should retrieve and return global statistics', async () => {
      const tenantCount = 42;
      Tenant.countDocuments = vi.fn().mockResolvedValue(tenantCount);

      await PlatformController.getGlobalStats(req, res);

      expect(Tenant.countDocuments).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Global statistics retrieved successfully',
        data: {
          totalTenants: tenantCount,
          systemHealth: 'OK',
        },
      });
    });
  });

  it('should use catchAsync for all controller methods', () => {
    Object.values(PlatformController).forEach(() => {
      expect(catchAsync).toHaveBeenCalled();
    });
    // Ensure catchAsync was called for each of the 8 controller functions
    expect(catchAsync).toHaveBeenCalledTimes(8);
  });
});