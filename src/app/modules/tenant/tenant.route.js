import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { tenantController } from './tenant.controller.js';
import { tenantInvitationController } from './tenantInvitation.controller.js';
import * as tenantValidation from './tenant.validation.js';
import { checkUserLimit } from '../../middlewares/tenant/checkTenantLimits.js';

const router = express.Router();

// ============= Tenant CRUD Routes =============

/**
 * @route   GET /api/v1/tenant/all
 * @desc    Get all tenants for logged-in user
 * @access  Private (Authenticated users)
 */
router.get(
  '/all',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getUserTenants
);

/**
 * @route   GET /api/v1/tenant/details/:tenantId
 * @desc    Get tenant details by ID
 * @access  Private (Authenticated users)
 */
router.get(
  '/details/:tenantId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getTenantById
);

/**
 * @route   GET /api/v1/tenant/user/:tenantId
 * @desc    Get tenant active user/member count
 * @access  Private (Authenticated users)
 */
router.get(
  '/user/:tenantId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getTenantUserCount
);

/**
 * @route   POST /api/v1/tenant/switch
 * @desc    Switch to a different tenant or personal mode (pass tenantId: null or "personal" for personal mode)
 * @body    { tenantId: string | null | "personal" }
 * @access  Private (Authenticated users)
 */
router.post(
  '/switch',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.switchTenant
);

/**
 * @route   POST /api/v1/tenant/create
 * @desc    Create a new tenant
 * @access  Private (Authenticated users)
 */
router.post(
  '/create',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.createTenantSchema),
  tenantController.createTenant
);

/**
 * @route   GET /api/v1/tenant/check-subdomain
 * @desc    Check if subdomain is available
 * @access  Public
 */
router.get('/check-subdomain', tenantController.checkSubdomainAvailability);

/**
 * @route   GET /api/v1/tenant/current
 * @desc    Get current user's tenant
 * @access  Private (Tenant members)
 */
router.get(
  '/current',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getCurrentTenant
);

/**
 * @route   PATCH /api/v1/tenant/settings
 * @desc    Update tenant settings
 * @access  Private (Tenant owner/admin)
 */
router.patch(
  '/settings',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.updateTenantSchema),
  tenantController.updateTenantSettings
);

/**
 * @route   DELETE /api/v1/tenant/:tenantId
 * @desc    Delete a tenant (admin only)
 * @access  Private (Admin only)
 */
// ============= Member Management Routes =============

/**
 * @route   GET /api/v1/tenant/members
 * @desc    Get all members of the tenant
 * @access  Private (Tenant members)
 */
router.get(
  '/members',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getTenantMembers
);

/**
 * @route   POST /api/v1/tenant/members/invite
 * @desc    Invite a user to join the tenant
 * @access  Private (Tenant owner/admin)
 */
router.post(
  '/members/invite',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  checkUserLimit, // Check if tenant can add more users
  validateRequest(tenantValidation.inviteMemberSchema),
  tenantController.inviteMember
);

/**
 * @route   GET /api/v1/tenant/members/invitations
 * @desc    Get all pending invitations for the tenant
 * @access  Private (Tenant owner/admin)
 */
router.get(
  '/members/invitations',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantInvitationController.getTenantInvitations
);

/**
 * @route   POST /api/v1/tenant/members/invitations/:token/verify
 * @desc    Verify an invitation token (Public - No auth required)
 * @access  Public
 */
router.post(
  '/members/invitations/:token/verify',
  validateRequest(tenantValidation.verifyInvitationTokenSchema),
  tenantInvitationController.verifyInvitationToken
);

/**
 * @route   POST /api/v1/tenant/members/invitations/:inviteId/accept
 * @desc    Accept an invitation
 * @access  Private (Authenticated user)
 */
router.post(
  '/members/invitations/:inviteId/accept',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.acceptInvitationSchema),
  tenantInvitationController.acceptInvitation
);

/**
 * @route   DELETE /api/v1/tenant/members/invitations/:inviteId
 * @desc    Cancel an invitation
 * @access  Private (Tenant owner/admin)
 */
router.delete(
  '/members/invitations/:inviteId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.cancelInvitationSchema),
  tenantInvitationController.cancelInvitation
);

/**
 * @route   POST /api/v1/tenant/members/invitations/:inviteId/resend
 * @desc    Resend an invitation email
 * @access  Private (Tenant owner/admin)
 */
router.post(
  '/members/invitations/:inviteId/resend',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.cancelInvitationSchema),
  tenantInvitationController.resendInvitation
);

/**
 * @route   PATCH /api/v1/tenant/members/:userId/role
 * @desc    Update a member's role
 * @access  Private (Tenant owner/admin)
 */
router.patch(
  '/members/:userId/role',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.updateMemberRoleSchema),
  tenantController.updateMemberRole
);

/**
 * @route   DELETE /api/v1/tenant/members/:userId
 * @desc    Remove a member from the tenant
 * @access  Private (Tenant owner/admin)
 */
router.delete(
  '/members/:userId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.removeMemberSchema),
  tenantController.removeMember
);

/**
 * @route   GET /api/v1/tenant/usage
 * @desc    Get tenant usage statistics
 * @access  Private (Tenant members)
 */
router.get(
  '/usage',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getTenantUsage
);

/**
 * @route   GET /api/v1/tenant/limits
 * @desc    Get tenant plan limits
 * @access  Private (Tenant members)
 */
router.get(
  '/limits',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getTenantLimits
);

/**
 * @route   DELETE /api/v1/tenant/:tenantId
 * @desc    Delete a tenant (admin only)
 * @access  Private (Admin only)
 */
router.delete(
  '/:tenantId',
  auth(ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.tenantIdParamSchema),
  tenantController.deleteTenant
);

export const tenantRoutes = router;
