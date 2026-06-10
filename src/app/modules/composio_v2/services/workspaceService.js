import Tenant from '../../tenant/tenant.model.js';
import TenantMember from '../../tenant/tenantMember.model.js';

export const WorkspaceService = {
  checkPlanLimits: async (workspaceId) => {
    try {
      const tenant = await Tenant.findById(workspaceId);
      if (!tenant) return false;
      return tenant.canAddMembers();
    } catch (e) {
      return false;
    }
  },
  checkManagerLimit: async (workspaceId) => {
    try {
      const count = await TenantMember.countDocuments({
        tenantId: workspaceId,
        role: 'manager',
        status: 'active'
      });
      return count < 5;
    } catch (e) {
      return false;
    }
  },
  getDashboardMetrics: async (workspaceId) => {
    try {
      const totalMembers = await TenantMember.countDocuments({
        tenantId: workspaceId,
        status: 'active'
      });
      return {
        totalMembers,
        activeMembersLast30Days: totalMembers,
        conversationsThisMonth: 0,
        apiCallsThisMonth: 0
      };
    } catch (e) {
      return {
        totalMembers: 0,
        activeMembersLast30Days: 0,
        conversationsThisMonth: 0,
        apiCallsThisMonth: 0
      };
    }
  }
};

export default WorkspaceService;
