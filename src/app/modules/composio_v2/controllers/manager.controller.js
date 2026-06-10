import { managerController as baseManagerController } from '../../manager/manager.controller.js';

export const getWorkspaceMetricsController = baseManagerController.getWorkspaceMetrics;
export const getTeamMembersController = baseManagerController.getTeamMembers;
export const updateMemberRoleController = baseManagerController.updateMemberRole;
export const inviteMemberController = baseManagerController.inviteMember;

export const managerController = {
  getWorkspaceMetricsController,
  getTeamMembersController,
  updateMemberRoleController,
  inviteMemberController,
};

export default managerController;
