import Tenant from '../../tenant/tenant.model.js';
import TenantMember from '../../tenant/tenantMember.model.js';

/**
 * @namespace WorkspaceService
 * @description A collection of service functions for managing workspace (tenant) related operations.
 */
export const WorkspaceService = {
  /**
   * Checks if a workspace can add more members based on its current subscription plan limits.
   * This function operates within a multi-tenant context.
   * @async
   * @function checkPlanLimits
   * @memberof WorkspaceService
   * @param {string} workspaceId - The unique identifier of the workspace (tenant).
   * @returns {Promise<boolean>} A promise that resolves to `true` if the workspace can add more members, `false` otherwise or if an error occurs.
   */
  checkPlanLimits: async (workspaceId) => {
    try {
      const tenant = await Tenant.findById(workspaceId);
      if (!tenant) return false;
      return tenant.canAddMembers();
    } catch (e) {
      return false;
    }
  },

  /**
   * Checks if a workspace has reached its limit for members with the 'manager' role.
   * The current limit is hardcoded to 5 managers.
   * This function operates within a multi-tenant context.
   * @async
   * @function checkManagerLimit
   * @memberof WorkspaceService
   * @param {string} workspaceId - The unique identifier of the workspace (tenant).
   * @returns {Promise<boolean>} A promise that resolves to `true` if the number of active managers is less than 5, `false` otherwise or if an error occurs.
   */
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

  /**
   * Retrieves key dashboard metrics for a specific workspace.
   * Currently, it calculates the total number of active members. Other metrics are placeholders.
   * This function operates within a multi-tenant context.
   * @async
   * @function getDashboardMetrics
   * @memberof WorkspaceService
   * @param {string} workspaceId - The unique identifier of the workspace (tenant).
   * @returns {Promise<object>} A promise that resolves to an object containing dashboard metrics. On error, it returns an object with all metrics as 0.
   * @property {number} totalMembers - The total number of active members in the workspace.
   * @property {number} activeMembersLast30Days - Placeholder for active members in the last 30 days, currently mirrors totalMembers.
   * @property {number} conversationsThisMonth - Placeholder for conversations this month.
   * @property {number} apiCallsThisMonth - Placeholder for API calls this month.
   */
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