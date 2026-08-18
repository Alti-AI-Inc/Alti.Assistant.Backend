import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { tenantService } from '../tenant/tenant.service.js';
import { tenantInvitationService } from '../tenant/tenantInvitation.service.js';

// Invite member
export const inviteMember = catchAsync(async (req, res) => {
  const tenantId =
    req.params.workspaceId || req.user?.currentTenantId || req.user?.tenantId;
  const inviterId = req.user?.id || req.user?._id;
  const { email, role } = req.body;

  const result = await tenantService.inviteMember({
    tenantId,
    email,
    role,
    invitedBy: inviterId,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Invitation sent successfully',
    data: result,
  });
});

// Invite team member (alias)
export const inviteTeamMember = inviteMember;

// Get pending invitations
export const getPendingInvitations = catchAsync(async (req, res) => {
  const tenantId =
    req.params.workspaceId || req.user?.currentTenantId || req.user?.tenantId;
  const { page = 1, limit = 20, status = 'pending' } = req.query;

  const result = await tenantInvitationService.getTenantInvitations(tenantId, {
    page,
    limit,
    status,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Pending invitations retrieved successfully',
    data: result,
  });
});

// Cancel invitation
export const cancelInvitation = catchAsync(async (req, res) => {
  const { invitationId, inviteId } = req.params;
  const targetInviteId = inviteId || invitationId;

  await tenantInvitationService.cancelInvitation(targetInviteId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invitation cancelled successfully',
  });
});

// Revoke invitation (alias)
export const revokeInvitation = cancelInvitation;

// Get team members
export const getTeamMembers = catchAsync(async (req, res) => {
  const tenantId =
    req.params.workspaceId || req.user?.currentTenantId || req.user?.tenantId;
  const { page = 1, limit = 20 } = req.query;

  const result = await tenantService.getTenantMembers(tenantId, {
    page,
    limit,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Team members retrieved successfully',
    data: result,
  });
});

// Update member role
export const updateMemberRole = catchAsync(async (req, res) => {
  const tenantId =
    req.params.workspaceId || req.user?.currentTenantId || req.user?.tenantId;
  const { userId } = req.params;
  const { role } = req.body;
  const updaterId = req.user?.id || req.user?._id;

  const result = await tenantService.updateMemberRole(
    tenantId,
    userId,
    role,
    updaterId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Member role updated successfully',
    data: result,
  });
});

// Update team member role (alias)
export const updateTeamMemberRole = updateMemberRole;

// Remove member
export const removeMember = catchAsync(async (req, res) => {
  const tenantId =
    req.params.workspaceId || req.user?.currentTenantId || req.user?.tenantId;
  const { userId } = req.params;
  const removedBy = req.user?.id || req.user?._id;

  const result = await tenantService.removeMember(tenantId, userId, removedBy);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Member removed successfully',
    data: result,
  });
});

// Remove team member (alias)
export const removeTeamMember = removeMember;

export const managerController = {
  inviteMember,
  inviteTeamMember,
  getPendingInvitations,
  cancelInvitation,
  revokeInvitation,
  getTeamMembers,
  updateMemberRole,
  updateTeamMemberRole,
  removeMember,
  removeTeamMember,
};

export default managerController;
