import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { tenantService } from './tenant.service.js';
import TenantMember from './tenantMember.model.js';
import { jwtHelpers } from '../../helpers/jwtHelpers.js';
import config from '../../../../config/index.js';

/**
 * Create a new tenant
 */
const createTenant = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?._id;
  const userRole = req.user?.role;
  const { name, slug, subdomain, plan } = req.body;

  const result = await tenantService.createTenant({
    name,
    slug,
    subdomain,
    ownerId: userId,
    plan,
  });

  // Generate new access token with currentTenantId in payload
  const accessToken = jwtHelpers.createToken(
    {
      _id: userId,
      role: userRole,
      currentTenantId: result.id,
    },
    config.jwt.access_token,
    config.jwt.access_expires_in
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Tenant created successfully',
    data: {
      ...result,
      accessToken,
    },
  });
});

/**
 * Get current user's tenant
 */
const getCurrentTenant = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;

  if (!tenantId) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'User is not associated with any tenant',
    });
  }

  const result = await tenantService.getTenantById(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant retrieved successfully',
    data: result,
  });
});

/**
 * Update tenant settings
 */
const updateTenantSettings = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const updates = req.body;

  const result = await tenantService.updateTenant(tenantId, updates);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant updated successfully',
    data: result,
  });
});

/**
 * Delete tenant (admin only)
 */
const deleteTenant = catchAsync(async (req, res) => {
  const { tenantId } = req.params;

  await tenantService.deleteTenant(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant deleted successfully',
  });
});

/**
 * Switch to a different tenant or personal mode
 * @body tenantId - Tenant ID to switch to, or null/"personal" for personal mode
 */
const switchTenant = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?._id;
  const userRole = req.user?.role;
  let { tenantId } = req.body;

  // Handle personal mode switching
  const isPersonalMode =
    !tenantId || tenantId === 'personal' || tenantId === 'null';

  if (isPersonalMode) {
    tenantId = null;
  }

  const result = await tenantService.switchTenant(userId, tenantId);

  // Fetch all user's tenants for the token payload
  const tenantMemberships = await TenantMember.find({
    userId,
    status: 'active',
  }).select('tenantId role');

  const tenants = tenantMemberships.map((membership) => ({
    tenantId: membership.tenantId,
    role: membership.role,
  }));

  // Generate new access token with currentTenantId in payload (null for personal mode)
  const accessToken = jwtHelpers.createToken(
    {
      _id: userId,
      role: userRole,
      currentTenantId: tenantId,
      tenants: tenants,
    },
    config.jwt.access_token,
    config.jwt.access_expires_in
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: isPersonalMode
      ? 'Switched to personal mode successfully'
      : 'Tenant switched successfully',
    data: {
      ...result,
      accessToken,
      mode: isPersonalMode ? 'personal' : 'organization',
    },
  });
});

/**
 * Get tenant members
 */
const getTenantMembers = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const { page = 1, limit = 20 } = req.query;

  const result = await tenantService.getTenantMembers(tenantId, {
    page,
    limit,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant members retrieved successfully',
    data: result,
  });
});

/**
 * Invite user to tenant
 */
const inviteMember = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const userId = req.user?.id || req.user?._id;
  const { email, role } = req.body;

  const result = await tenantService.inviteMember({
    tenantId,
    email,
    role,
    invitedBy: userId,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Invitation sent successfully',
    data: result,
  });
});

/**
 * Update member role
 */
const updateMemberRole = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const { userId } = req.params;
  const { role } = req.body;

  const result = await tenantService.updateMemberRole(tenantId, userId, role);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Member role updated successfully',
    data: result,
  });
});

/**
 * Remove member from tenant
 */
const removeMember = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const { userId } = req.params;
  const removedBy = req.user._id;

  const result = await tenantService.removeMember(tenantId, userId, removedBy);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Member removed successfully',
    data: result,
  });
});

/**
 * Get tenant usage statistics
 */
const getTenantUsage = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;

  const result = await tenantService.getTenantUsage(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant usage retrieved successfully',
    data: result,
  });
});

/**
 * Get tenant limits
 */
const getTenantLimits = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;

  const result = await tenantService.getTenantLimits(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant limits retrieved successfully',
    data: result,
  });
});

/**
 * Check if subdomain is available
 */
const checkSubdomainAvailability = catchAsync(async (req, res) => {
  const { subdomain } = req.query;

  const result = await tenantService.checkSubdomainAvailability(subdomain);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

/**
 * Get all tenants for logged-in user
 */
const getUserTenants = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?._id;

  const result = await tenantService.getUserTenants(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User tenants retrieved successfully',
    data: result,
  });
});

/**
 * Get tenant by ID
 */
const getTenantById = catchAsync(async (req, res) => {
  const { tenantId } = req.params;

  const result = await tenantService.getTenantById(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant retrieved successfully',
    data: result,
  });
});

/**
 * Get tenant user count
 */
const getTenantUserCount = catchAsync(async (req, res) => {
  const { tenantId } = req.params;

  const result = await tenantService.getTenantUserCount(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant user count retrieved successfully',
    data: result,
  });
});

export const tenantController = {
  createTenant,
  getCurrentTenant,
  getTenantById,
  getTenantUserCount,
  updateTenantSettings,
  deleteTenant,
  switchTenant,
  getTenantMembers,
  getUserTenants,
  inviteMember,
  updateMemberRole,
  removeMember,
  getTenantUsage,
  getTenantLimits,
  checkSubdomainAvailability,
};
