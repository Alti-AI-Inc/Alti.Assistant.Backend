import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Tenant from './tenant.model.js';
import TenantMember from './tenantMember.model.js';
import TenantInvitation from './tenantInvitation.model.js';
import UserModel from '../auth/auth.model.js';
import { tenantInvitationService } from './tenantInvitation.service.js';

/**
 * Create a new tenant
 */
const createTenant = async (tenantData) => {
  try {
    const { name, slug, subdomain, ownerId, plan = 'free' } = tenantData;

    // Check if slug is already taken
    const existingTenant = await Tenant.findOne({ slug });
    if (existingTenant) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant slug already exists');
    }

    // Check if subdomain is already taken
    const existingSubdomain = await Tenant.findOne({ subdomain });
    if (existingSubdomain) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Subdomain is already taken');
    }

    // Create tenant
    const tenant = await Tenant.create({
      name,
      slug,
      subdomain,
      ownerId,
      plan,
      status: plan === 'free' ? 'trial' : 'active',
    });

    // Create TenantMember record for owner
    await TenantMember.create({
      userId: ownerId,
      tenantId: tenant._id,
      role: 'owner',
      permissions: ['*'], // Full permissions for owner
      status: 'active',
      joinedAt: new Date(),
    });

    // Update user with tenant info (keep for backward compatibility)
    await UserModel.findByIdAndUpdate(ownerId, {
      tenantId: tenant._id,
      tenantRole: 'owner',
      tenantPermissions: ['*'],
      activeTenantId: tenant._id, // Set as active tenant
    });

    logger.info(`Tenant created: ${tenant._id} by user: ${ownerId}`);

    return {
      id: tenant._id,
      name: tenant.name,
      slug: tenant.slug,
      subdomain: tenant.subdomain,
      status: tenant.status,
      plan: tenant.plan,
    };
  } catch (error) {
    logger.error('Error creating tenant:', error);
    throw error;
  }
};

/**
 * Get tenant by ID
 */
const getTenantById = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId).populate('ownerId', 'name email');

  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  return tenant;
};

/**
 * Update tenant
 */
const updateTenant = async (tenantId, updates) => {
  const tenant = await Tenant.findById(tenantId);

  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  // Only allow certain fields to be updated
  const allowedUpdates = ['name', 'settings', 'metadata'];
  const updateKeys = Object.keys(updates);

  const isValidUpdate = updateKeys.every((key) => allowedUpdates.includes(key));

  if (!isValidUpdate) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid updates');
  }

  Object.assign(tenant, updates);
  await tenant.save();

  logger.info(`Tenant updated: ${tenantId}`);

  return tenant;
};

/**
 * Delete tenant (soft delete)
 */
const deleteTenant = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId);

  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  await tenant.softDelete();

  logger.info(`Tenant deleted: ${tenantId}`);
};

/**
 * Get tenant members
 */
const getTenantMembers = async (tenantId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const members = await UserModel.find({ tenantId })
    .select('name email avatar tenantRole createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await UserModel.countDocuments({ tenantId });

  return {
    members,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Invite member to tenant
 */
const inviteMember = async (invitationData) => {
  const { tenantId, email, role, invitedBy } = invitationData;

  // Check if tenant exists
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  // Check if tenant can add more members
  if (!tenant.canAddMembers()) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Tenant has reached maximum member limit'
    );
  }

  // Check if user is already a member
  const existingMember = await UserModel.findOne({ email, tenantId });
  if (existingMember) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User is already a member');
  }

  // Check for pending invitation
  const pendingInvitations = await TenantInvitation.findPendingByEmail(email);
  const hasPendingInvitation = pendingInvitations.some(
    (inv) => inv.tenantId.toString() === tenantId.toString()
  );

  if (hasPendingInvitation) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User already has a pending invitation');
  }

  // Create invitation
  const invitation = await tenantInvitationService.createInvitation({
    tenantId,
    email,
    role,
    invitedBy,
  });

  logger.info(`Invitation sent to ${email} for tenant ${tenantId}`);

  return invitation;
};

/**
 * Update member role
 */
const updateMemberRole = async (tenantId, userId, role) => {
  const user = await UserModel.findOne({ _id: userId, tenantId });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Member not found');
  }

  if (user.tenantRole === 'owner') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot change owner role');
  }

  user.tenantRole = role;
  await user.save();

  logger.info(`Member role updated: ${userId} to ${role}`);

  return user;
};

/**
 * Remove member from tenant
 */
const removeMember = async (tenantId, userId) => {
  const user = await UserModel.findOne({ _id: userId, tenantId });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Member not found');
  }

  if (user.tenantRole === 'owner') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot remove tenant owner');
  }

  user.tenantId = null;
  user.tenantRole = null;
  user.tenantPermissions = [];
  await user.save();

  // Update tenant user count
  const tenant = await Tenant.findById(tenantId);
  if (tenant) {
    tenant.usage.usersCount = Math.max(0, tenant.usage.usersCount - 1);
    await tenant.save();
  }

  logger.info(`Member removed: ${userId} from tenant ${tenantId}`);
};

/**
 * Get tenant usage statistics
 */
const getTenantUsage = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId);

  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  return tenant.usage;
};

/**
 * Get tenant limits
 */
const getTenantLimits = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId);

  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  return {
    limits: tenant.limits,
    usage: tenant.usage,
    percentageUsed: {
      apiCalls: (tenant.usage.apiCallsUsed / tenant.limits.maxApiCalls) * 100,
      storage: (tenant.usage.storageUsed / tenant.limits.maxStorage) * 100,
      users: (tenant.usage.usersCount / tenant.limits.maxUsers) * 100,
    },
  };
};

/**
 * Check if subdomain is available
 */
const checkSubdomainAvailability = async (subdomain) => {
  const existingTenant = await Tenant.findOne({ subdomain: subdomain.toLowerCase() });

  return {
    subdomain: subdomain.toLowerCase(),
    available: !existingTenant,
    message: existingTenant
      ? 'Subdomain is already taken'
      : 'Subdomain is available',
  };
};

export const tenantService = {
  createTenant,
  getTenantById,
  updateTenant,
  deleteTenant,
  getTenantMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  getTenantUsage,
  getTenantLimits,
  checkSubdomainAvailability,
};
