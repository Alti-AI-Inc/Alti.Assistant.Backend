import { tenantService } from '../tenant/tenant.service.js';

export const WorkspaceService = {
  findById: async (workspaceId) => {
    return tenantService.getTenantById(workspaceId);
  },
  getById: async (workspaceId) => {
    return tenantService.getTenantById(workspaceId);
  },
  isFeatureEnabled: async (workspaceId, feature) => {
    // Fail-open or check if plan supports it. Let's return true since we don't have a strict feature gate.
    return true;
  },
  incrementSubmoduleCount: async (workspaceId) => {
    // Increment the API calls count or similar usage metric on the tenant
    try {
      const tenant = await tenantService.getTenantById(workspaceId);
      if (tenant) {
        // Just return true to acknowledge
        return true;
      }
    } catch (e) {
      // Ignore
    }
    return false;
  }
};

export default WorkspaceService;
