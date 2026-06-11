import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceService } from './workspaceService.js';
import Tenant from '../../tenant/tenant.model.js';
import TenantMember from '../../tenant/tenantMember.model.js';

vi.mock('../../tenant/tenant.model.js', () => ({
  default: {
    findById: vi.fn()
  }
}));

vi.mock('../../tenant/tenantMember.model.js', () => ({
  default: {
    countDocuments: vi.fn()
  }
}));

describe('WorkspaceService', () => {
  const workspaceId = 'tenant-123';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('checkPlanLimits', () => {
    it('should return true if tenant exists and can add members', async () => {
      const mockTenant = {
        canAddMembers: vi.fn().mockReturnValue(true)
      };
      Tenant.findById.mockResolvedValue(mockTenant);

      const result = await WorkspaceService.checkPlanLimits(workspaceId);

      expect(Tenant.findById).toHaveBeenCalledWith(workspaceId);
      expect(mockTenant.canAddMembers).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false if tenant exists but cannot add members', async () => {
      const mockTenant = {
        canAddMembers: vi.fn().mockReturnValue(false)
      };
      Tenant.findById.mockResolvedValue(mockTenant);

      const result = await WorkspaceService.checkPlanLimits(workspaceId);

      expect(Tenant.findById).toHaveBeenCalledWith(workspaceId);
      expect(mockTenant.canAddMembers).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should return false if tenant is not found', async () => {
      Tenant.findById.mockResolvedValue(null);

      const result = await WorkspaceService.checkPlanLimits(workspaceId);

      expect(Tenant.findById).toHaveBeenCalledWith(workspaceId);
      expect(result).toBe(false);
    });

    it('should return false if Tenant.findById throws an error', async () => {
      Tenant.findById.mockRejectedValue(new Error('Database error'));

      const result = await WorkspaceService.checkPlanLimits(workspaceId);

      expect(Tenant.findById).toHaveBeenCalledWith(workspaceId);
      expect(result).toBe(false);
    });
  });

  describe('checkManagerLimit', () => {
    it('should return true if manager count is less than 5', async () => {
      TenantMember.countDocuments.mockResolvedValue(4);

      const result = await WorkspaceService.checkManagerLimit(workspaceId);

      expect(TenantMember.countDocuments).toHaveBeenCalledWith({
        tenantId: workspaceId,
        role: 'manager',
        status: 'active'
      });
      expect(result).toBe(true);
    });

    it('should return false if manager count is exactly 5', async () => {
      TenantMember.countDocuments.mockResolvedValue(5);

      const result = await WorkspaceService.checkManagerLimit(workspaceId);

      expect(TenantMember.countDocuments).toHaveBeenCalledWith({
        tenantId: workspaceId,
        role: 'manager',
        status: 'active'
      });
      expect(result).toBe(false);
    });

    it('should return false if manager count is more than 5', async () => {
      TenantMember.countDocuments.mockResolvedValue(6);

      const result = await WorkspaceService.checkManagerLimit(workspaceId);

      expect(TenantMember.countDocuments).toHaveBeenCalledWith({
        tenantId: workspaceId,
        role: 'manager',
        status: 'active'
      });
      expect(result).toBe(false);
    });

    it('should return false if TenantMember.countDocuments throws an error', async () => {
      TenantMember.countDocuments.mockRejectedValue(new Error('Database error'));

      const result = await WorkspaceService.checkManagerLimit(workspaceId);

      expect(TenantMember.countDocuments).toHaveBeenCalledWith({
        tenantId: workspaceId,
        role: 'manager',
        status: 'active'
      });
      expect(result).toBe(false);
    });
  });

  describe('getDashboardMetrics', () => {
    it('should return correct metrics when members are found', async () => {
      const memberCount = 15;
      TenantMember.countDocuments.mockResolvedValue(memberCount);

      const result = await WorkspaceService.getDashboardMetrics(workspaceId);

      expect(TenantMember.countDocuments).toHaveBeenCalledWith({
        tenantId: workspaceId,
        status: 'active'
      });
      expect(result).toEqual({
        totalMembers: memberCount,
        activeMembersLast30Days: memberCount,
        conversationsThisMonth: 0,
        apiCallsThisMonth: 0
      });
    });

    it('should return correct metrics when no members are found', async () => {
      TenantMember.countDocuments.mockResolvedValue(0);

      const result = await WorkspaceService.getDashboardMetrics(workspaceId);

      expect(TenantMember.countDocuments).toHaveBeenCalledWith({
        tenantId: workspaceId,
        status: 'active'
      });
      expect(result).toEqual({
        totalMembers: 0,
        activeMembersLast30Days: 0,
        conversationsThisMonth: 0,
        apiCallsThisMonth: 0
      });
    });

    it('should return zeroed metrics if TenantMember.countDocuments throws an error', async () => {
      TenantMember.countDocuments.mockRejectedValue(new Error('Database error'));

      const result = await WorkspaceService.getDashboardMetrics(workspaceId);

      expect(TenantMember.countDocuments).toHaveBeenCalledWith({
        tenantId: workspaceId,
        status: 'active'
      });
      expect(result).toEqual({
        totalMembers: 0,
        activeMembersLast30Days: 0,
        conversationsThisMonth: 0,
        apiCallsThisMonth: 0
      });
    });
  });
});