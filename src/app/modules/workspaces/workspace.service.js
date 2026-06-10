import TenantMember from '../tenant/tenantMember.model.js';

export const workspaceService = {
  isManagerOf: async (authenticatedUser, targetUserId) => {
    const workspaceId = authenticatedUser.workspaceId;
    if (!workspaceId) return false;

    const managerMember = await TenantMember.findOne({
      userId: authenticatedUser.id || authenticatedUser._id,
      tenantId: workspaceId,
      status: 'active'
    }).lean();

    if (!managerMember || !['admin', 'manager'].includes(managerMember.role)) {
      return false;
    }

    const targetMember = await TenantMember.findOne({
      userId: targetUserId,
      tenantId: workspaceId,
      status: 'active'
    }).lean();

    return !!targetMember;
  }
};

export default workspaceService;
