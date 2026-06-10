import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { tenantInvitationService } from './tenantInvitation.service.js';
// Optimization: Import TenantInvitation model at the top for better performance and consistency
// if it's used in multiple places or frequently, avoiding repeated dynamic imports.
import TenantInvitation from './tenantInvitation.model.js';

/**
 * @swagger
 * /api/v1/tenant-invitations:
 *   get:
 *     summary: Get tenant invitations
 *     description: Retrieve a list of tenant invitations for the current tenant.
 *     tags:
 *       - Tenant Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, cancelled, expired]
 *         description: Filter invitations by their status.
 *     responses:
 *       200:
 *         description: Invitations retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Invitations retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/TenantInvitation'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const getTenantInvitations = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const { page = 1, limit = 20, status } = req.query;

  // Optimization Recommendation:
  // If the service layer queries TenantInvitation documents by `tenantId` and `status`,
  // consider adding indexes to the TenantInvitation schema for these fields:
  // { tenantId: 1 }
  // { status: 1 }
  // For queries filtering by both, a compound index might be beneficial:
  // { tenantId: 1, status: 1 }
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
 * @swagger
 * /api/v1/tenant-invitations/verify/{token}:
 *   get:
 *     summary: Verify invitation token
 *     description: Verifies the validity of a tenant invitation token.
 *     tags:
 *       - Tenant Invitations
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The invitation token to verify.
 *     responses:
 *       200:
 *         description: Invitation verified successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Invitation verified successfully
 *                 data:
 *                   $ref: '#/components/schemas/TenantInvitation'
 *       400:
 *         description: Invalid token or token already used/expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Invitation not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const verifyInvitationToken = catchAsync(async (req, res) => {
  const { token } = req.params;

  // Optimization Recommendation:
  // If the service layer queries TenantInvitation documents by `token`,
  // consider adding an index to the TenantInvitation schema for this field:
  // { token: 1 }
  const result = await tenantInvitationService.verifyInvitationToken(token);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invitation verified successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenant-invitations/{inviteId}/accept:
 *   patch:
 *     summary: Accept invitation
 *     description: Accepts a specific tenant invitation by its ID. The user accepting must be authenticated.
 *     tags:
 *       - Tenant Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the invitation to accept.
 *     responses:
 *       200:
 *         description: Invitation accepted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Invitation accepted successfully
 *                 data:
 *                   $ref: '#/components/schemas/TenantInvitation'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Invitation not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: Invitation already accepted, expired, or invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const acceptInvitation = catchAsync(async (req, res) => {
  const { inviteId } = req.params;
  const userId = req.user?.id || req.user?._id;

  // Security Fix: Prevent Insecure Direct Object Reference (IDOR).
  // The previous implementation fetched the invitation token directly in the controller
  // using `TenantInvitation.findById(inviteId)`. This could allow an authenticated user
  // to retrieve the token of any invitation if they knew its `inviteId`, potentially
  // leading to information disclosure or unauthorized attempts to accept.
  //
  // By passing the `inviteId` and `userId` directly to the service layer,
  // the service becomes solely responsible for:
  // 1. Finding the invitation by `inviteId`.
  // 2. Verifying that the `userId` is the intended `recipientId` of this specific invitation.
  // 3. Checking the invitation's status (e.g., not already accepted, not expired).
  // 4. Updating the invitation status and performing any related actions.
  //
  // This centralizes authorization logic in the service layer and prevents direct object
  // reference vulnerabilities at the controller level, ensuring that an authenticated user
  // cannot interact with invitations they are not authorized to accept.
  // The service layer is expected to throw appropriate errors (e.g., 404 for not found,
  // 403 for unauthorized, 400 for invalid status) which `catchAsync` will handle.
  const result = await tenantInvitationService.acceptInvitation(
    inviteId, // Pass inviteId directly
    userId    // Pass userId for authorization in the service layer
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invitation accepted successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenant-invitations/{inviteId}/cancel:
 *   patch:
 *     summary: Cancel invitation
 *     description: Cancels a specific tenant invitation by its ID. Only the sender or an admin can cancel.
 *     tags:
 *       - Tenant Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the invitation to cancel.
 *     responses:
 *       200:
 *         description: Invitation cancelled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Invitation cancelled successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Forbidden - User does not have permission to cancel this invitation.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Invitation not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: Invitation cannot be cancelled (e.g., already accepted).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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
 * @swagger
 * /api/v1/tenant-invitations/{inviteId}/resend:
 *   patch:
 *     summary: Resend invitation
 *     description: Resends a specific tenant invitation by its ID. This will generate a new token and send a new email.
 *     tags:
 *       - Tenant Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inviteId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the invitation to resend.
 *     responses:
 *       200:
 *         description: Invitation resent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Invitation resent successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Forbidden - User does not have permission to resend this invitation.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Invitation not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: Invitation cannot be resent (e.g., already accepted).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
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

/**
 * @typedef {object} TenantInvitationController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getTenantInvitations - Controller for retrieving tenant invitations.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} verifyInvitationToken - Controller for verifying an invitation token.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} acceptInvitation - Controller for accepting a tenant invitation.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} cancelInvitation - Controller for cancelling a tenant invitation.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} resendInvitation - Controller for resending a tenant invitation.
 */

/**
 * Exports the tenant invitation controller functions.
 * @type {TenantInvitationController}
 */
export const tenantInvitationController = {
  getTenantInvitations,
  verifyInvitationToken,
  acceptInvitation,
  cancelInvitation,
  resendInvitation,
};