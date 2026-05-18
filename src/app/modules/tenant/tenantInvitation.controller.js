import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { tenantInvitationService } from './tenantInvitation.service.js';

/**
 * Get tenant invitations
 */
const getTenantInvitations = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const { page = 1, limit = 20, status } = req.query;

  const result = await tenantInvitationService.getTenantInvitations(tenantId, {
    page,
    limit,
    status,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invitations retrieved successfully',
    data: result,
  });
});

/**
 * Verify invitation token
 */
const verifyInvitationToken = catchAsync(async (req, res) => {
  const { token } = req.params;

  const result = await tenantInvitationService.verifyInvitationToken(token);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invitation verified successfully',
    data: result,
  });
});

/**
 * Accept invitation
 */
const acceptInvitation = catchAsync(async (req, res) => {
  const { inviteId } = req.params;
  const userId = req.user?.id || req.user?._id;

  // Get invitation to get the token
  const TenantInvitation = (await import('./tenantInvitation.model.js'))
    .default;
  const invitation = await TenantInvitation.findById(inviteId);

  if (!invitation) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Invitation not found',
    });
  }

  const result = await tenantInvitationService.acceptInvitation(
    invitation.token,
    userId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invitation accepted successfully',
    data: result,
  });
});

/**
 * Cancel invitation
 */
const cancelInvitation = catchAsync(async (req, res) => {
  const { inviteId } = req.params;

  await tenantInvitationService.cancelInvitation(inviteId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invitation cancelled successfully',
  });
});

/**
 * Resend invitation
 */
const resendInvitation = catchAsync(async (req, res) => {
  const { inviteId } = req.params;

  await tenantInvitationService.resendInvitation(inviteId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invitation resent successfully',
  });
});

export const tenantInvitationController = {
  getTenantInvitations,
  verifyInvitationToken,
  acceptInvitation,
  cancelInvitation,
  resendInvitation,
};
