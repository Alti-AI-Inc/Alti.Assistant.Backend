import { usageService } from '../usage/usage.service.js';

export const TenantUsageService = {
  checkQuota: async (tenantId, action, amount = 1) => {
    return usageService.canMakeApiCall({ workspaceId: tenantId }, action, amount);
  },
  trackUsage: async (tenantId, userId, action, amount = 1) => {
    return usageService.recordApiCall({ workspaceId: tenantId, userId }, { service: action, cost: amount });
  }
};

export default TenantUsageService;
