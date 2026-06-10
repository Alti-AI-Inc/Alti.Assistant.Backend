import { tenantService } from '../modules/tenant/tenant.service.js';

export const WorkspaceService = {
  getById: async (workspaceId) => {
    return tenantService.getTenantById(workspaceId);
  },
  findById: async (workspaceId) => {
    return tenantService.getTenantById(workspaceId);
  }
};

export default WorkspaceService;
