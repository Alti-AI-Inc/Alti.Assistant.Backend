import httpStatus from 'http-status';
import mongoose from 'mongoose';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Tenant from './tenant.model.js';
import TenantMember from './tenantMember.model.js';
import TenantInvitation from './tenantInvitation.model.js';
import UserModel from '../auth/auth.model.js';
import { tenantInvitationService } from './tenantInvitation.service.js';
import subscriptionService from '../subscription/subscription.service.js';
import SubscriptionModel from '../subscription/subscription.model.js';
import { createCustomerService } from '../stripe/customer/stripe.service.js';

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
    const owner = await UserModel.findByIdAndUpdate(
      ownerId,
      {
        tenantId: tenant._id,
        tenantRole: 'owner',
        tenantPermissions: ['*'],
        activeTenantId: tenant._id, // Set as active tenant
      },
      { new: true }
    );

    // Create Stripe customer for the tenant
    try {
      const stripeCustomer = await createCustomerService({
        email: owner.email,
        name: tenant.name,
        metadata: {
          tenantId: tenant._id.toString(),
          tenantSlug: tenant.slug,
          ownerId: ownerId.toString(),
        },
      });

      // Update tenant with Stripe customer ID
      tenant.subscription = {
        ...tenant.subscription,
        stripeCustomerId: stripeCustomer.id,
      };
      await tenant.save();

      logger.info(
        `Stripe customer created for tenant: ${tenant._id}, customerId: ${stripeCustomer.id}`
      );
    } catch (error) {
      logger.error('Error creating Stripe customer for tenant:', error);
      // Don't fail tenant creation if Stripe customer creation fails
    }

    // Create free subscription for the tenant
    try {
      const subscription = await subscriptionService.createFreeSubscription(
        ownerId,
        tenant._id
      );
      logger.info(`Free subscription created for tenant: ${tenant._id}`, {
        subscriptionId: subscription._id,
      });
    } catch (subscriptionError) {
      // Log but don't fail tenant creation if subscription fails
      logger.error('Failed to create subscription for new tenant:', {
        tenantId: tenant._id,
        ownerId,
        error: subscriptionError.message,
      });
    }

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
  if (!mongoose.Types.ObjectId.isValid(tenantId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  const tenant = await Tenant.findById(tenantId)
    .populate('ownerId', 'name email')
    .lean();

  const subscription = await SubscriptionModel.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
    {
      $lookup: {
        from: 'products',
        localField: 'price',
        foreignField: 'stripePriceId',
        as: 'price',
      },
    },
    { $unwind: '$price' },
    { $sort: { createdAt: -1 } },
    { $limit: 1 },
  ]);
  console.log('Subscription aggregation result:', subscription);
  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  return {
    ...tenant,
    subscription: subscription.length > 0 ? subscription[0] : null,
  };
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

/** * Get all tenants/organizations for a user
 */
const getUserTenants = async (userId) => {
  try {
    // Find all active memberships for the user
    const tenantMemberships = await TenantMember.find({
      userId,
      status: 'active',
    })
      .populate('tenantId', 'name slug subdomain status plan')
      .sort({ joinedAt: -1 });

    if (!tenantMemberships || tenantMemberships.length === 0) {
      return {
        tenants: [],
        total: 0,
      };
    }

    // Format the response
    const tenants = tenantMemberships
      .map((membership) => {
        if (!membership.tenantId) return null;
        return {
          id: membership.tenantId._id,
          name: membership.tenantId.name,
          slug: membership.tenantId.slug,
          subdomain: membership.tenantId.subdomain,
          status: membership.tenantId.status,
          plan: membership.tenantId.plan,
          role: membership.role,
          permissions: membership.permissions,
          joinedAt: membership.joinedAt,
        };
      })
      .filter(Boolean);

    logger.info(`Retrieved ${tenants.length} tenants for user: ${userId}`);

    return {
      tenants,
      total: tenants.length,
    };
  } catch (error) {
    logger.error('Error fetching user tenants:', error);
    throw error;
  }
};

/**
 * Switch user to a different tenant
 */
const switchTenant = async (userId, tenantId) => {
  try {
    // Handle personal mode (no organization)
    if (!tenantId || tenantId === null) {
      logger.info(`User ${userId} switched to personal mode`);
      return {
        tenantId: null,
        tenantName: 'Personal',
        mode: 'personal',
        role: null,
        permissions: [],
      };
    }

    // Verify user is a member of the tenant
    const tenantMembership = await TenantMember.findOne({
      userId,
      tenantId,
      status: 'active',
    });

    if (!tenantMembership) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'User is not a member of this tenant'
      );
    }

    // Get the tenant details
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
    }

    logger.info(`User ${userId} switched to tenant ${tenantId}`);

    return {
      tenantId: tenant._id,
      tenantName: tenant.name,
      mode: 'organization',
      role: tenantMembership.role,
      permissions: tenantMembership.permissions,
    };
  } catch (error) {
    logger.error('Error switching tenant:', error);
    throw error;
  }
};

/**
 * Get tenant members
 */
const getTenantMembers = async (tenantId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const members = await TenantMember.find({ tenantId, status: 'active' })
    .populate('userId', 'name email')
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await TenantMember.countDocuments({
    tenantId,
    status: 'active',
  });

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

  // Check tenant's subscription to see if they can invite team members
  const subscription =
    await subscriptionService.getTenantSubscription(tenantId);
  if (!subscription) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'No subscription found. Please upgrade to invite team members.'
    );
  }

  if (!subscription.limits.canInviteTeam) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Free plan is limited to 1 user. Please upgrade to Explore or higher to invite team members.'
    );
  }

  // Check if seat limit is reached (available seats = total - used)
  if (!subscription.limits.unlimitedSeats && subscription.seats.used >= subscription.seats.total) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Seat limit reached. Please purchase more seats on your billing page before inviting additional team members.'
    );
  }

  // Check if tenant can add more members
  if (!tenant.canAddMembers()) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Tenant has reached maximum member limit'
    );
  }

  // Check if user is already a member
  const existingMember = await TenantMember.findOne({
    tenantId,
    status: 'active',
  }).populate({
    path: 'userId',
    match: { email: email.toLowerCase() },
  });

  if (existingMember && existingMember.userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'User is already a member of this tenant'
    );
  }

  // Check for pending invitation
  const pendingInvitations = await TenantInvitation.findPendingByEmail(email);
  const hasPendingInvitation = pendingInvitations.some(
    (inv) => inv.tenantId.toString() === tenantId.toString()
  );

  if (hasPendingInvitation) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'User already has a pending invitation'
    );
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
  let user = await UserModel.findOne({ _id: userId, tenantId });

  if (!user) {
    // It might be a pending invitation being updated
    const invitation = await TenantInvitation.findOne({ _id: userId, tenantId });
    if (invitation) {
      invitation.role = role;
      await invitation.save();
      logger.info(`Invitation role updated: ${userId} to ${role}`);
      return invitation;
    }
    throw new ApiError(httpStatus.NOT_FOUND, 'Member or invitation not found');
  }

  // We now allow changing roles freely, including to/from owner, as requested
  // by the admin functionality.
  user.tenantRole = role;
  await user.save();

  // Also update TenantMember
  const tenantMember = await TenantMember.findOne({ userId, tenantId });
  if (tenantMember) {
    tenantMember.role = role;
    await tenantMember.save();
  }

  logger.info(`Member role updated: ${userId} to ${role}`);

  return user;
};

/**
 * Remove member from tenant
 */
const removeMember = async (tenantId, userId, removedBy) => {
  // Find the member in TenantMember collection
  const tenantMember = await TenantMember.findOne({ userId, tenantId });

  if (!tenantMember) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Member not found in tenant');
  }

  if (tenantMember.role === 'owner') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot remove tenant owner');
  }

  // Verify permissions - only owner or admin can remove members
  const remover = await TenantMember.findOne({ userId: removedBy, tenantId });
  if (!remover || !['owner', 'admin'].includes(remover.role)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Insufficient permissions to remove members'
    );
  }

  // Delete TenantMember record
  await TenantMember.deleteOne({ _id: tenantMember._id });

  // Update user's active tenant if this was their active tenant
  const user = await UserModel.findById(userId);
  if (user && user.activeTenantId?.toString() === tenantId.toString()) {
    user.activeTenantId = null;
    await user.save();
  }

  // Update tenant user count
  const tenant = await Tenant.findById(tenantId);
  if (tenant) {
    tenant.usage.usersCount = Math.max(0, tenant.usage.usersCount - 1);
    await tenant.save();
  }

  // Remove seat from subscription if paid plan
  try {
    const subscription =
      await subscriptionService.getTenantSubscription(tenantId);
    if (
      subscription &&
      subscription.plan !== 'free' &&
      subscription.status === 'active'
    ) {
      await subscriptionService.removeSeatFromSubscription(
        subscription._id,
        userId
      );
      logger.info(
        `Removed seat from subscription ${subscription._id} for user ${userId}`
      );
    }
  } catch (seatError) {
    logger.error('Error removing seat after member removal:', seatError);
    // Don't fail member removal if seat removal fails
  }

  logger.info(
    `Member removed: ${userId} from tenant ${tenantId} by ${removedBy}`
  );

  return {
    message: 'Member removed successfully',
    userId,
    tenantId,
  };
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
  const existingTenant = await Tenant.findOne({
    subdomain: subdomain.toLowerCase(),
  });

  return {
    subdomain: subdomain.toLowerCase(),
    available: !existingTenant,
    message: existingTenant
      ? 'Subdomain is already taken'
      : 'Subdomain is available',
  };
};

/**
 * Get tenant active user/member count
 */
const getTenantUserCount = async (tenantId) => {
  const count = await TenantMember.countDocuments({
    tenantId,
    status: 'active',
  });

  return {
    usersCount: count,
  };
};

export const tenantService = {
  createTenant,
  getTenantById,
  getTenantUserCount,
  updateTenant,
  deleteTenant,
  getUserTenants,
  switchTenant,
  getTenantMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  getTenantUsage,
  getTenantLimits,
  checkSubdomainAvailability,
};
