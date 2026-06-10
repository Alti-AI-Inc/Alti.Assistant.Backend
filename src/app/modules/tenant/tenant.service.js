import httpStatus from 'http-status';
import mongoose from 'mongoose';
import crypto from 'crypto';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Tenant from './tenant.model.js'; // Index: slug, subdomain, ownerId
import TenantMember from './tenantMember.model.js'; // Index: userId, tenantId, status, joinedAt (for sort)
import TenantInvitation from './tenantInvitation.model.js'; // Index: email, tenantId
import UserModel from '../auth/auth.model.js'; // Index: email
import { tenantInvitationService } from './tenantInvitation.service.js';
import subscriptionService from '../subscription/subscription.service.js';
import SubscriptionModel from '../subscription/subscription.model.js'; // Index: tenantId, price
import { createCustomerService } from '../stripe/customer/stripe.service.js';

/**
 * @typedef {object} TenantData
 * @property {string} name - The name of the tenant.
 * @property {string} slug - A unique URL-friendly identifier for the tenant.
 * @property {string} subdomain - A unique subdomain for the tenant.
 * @property {mongoose.Types.ObjectId} ownerId - The ID of the user who owns the tenant.
 * @property {string} [plan='free'] - The subscription plan for the tenant (e.g., 'free', 'explore', 'pro').
 */

/**
 * @typedef {object} TenantOutput
 * @property {mongoose.Types.ObjectId} id - The ID of the created tenant.
 * @property {string} name - The name of the tenant.
 * @property {string} slug - The slug of the tenant.
 * @property {string} subdomain - The subdomain of the tenant.
 * @property {string} status - The current status of the tenant (e.g., 'trial', 'active').
 * @property {string} plan - The subscription plan of the tenant.
 */

/**
 * Create a new tenant, set the owner as an admin member, create a Stripe customer,
 * and provision a free subscription.
 *
 * @async
 * @param {TenantData} tenantData - The data for creating the new tenant.
 * @returns {Promise<TenantOutput>} A promise that resolves to the essential details of the created tenant.
 * @throws {ApiError} If the slug or subdomain is already taken, or if there's an issue during creation.
 */
const createTenant = async (tenantData) => {
  try {
    const { name, slug, subdomain, ownerId, plan = 'free' } = tenantData;

    // Check if slug is already taken
    // OPTIMIZATION: Added .lean() as we only need to check for existence.
    // INDEXING RECOMMENDATION: Ensure 'slug' field in Tenant model has a unique index.
    const existingTenant = await Tenant.findOne({ slug }).lean();
    if (existingTenant) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant slug already exists');
    }

    // Check if subdomain is already taken
    // OPTIMIZATION: Added .lean() as we only need to check for existence.
    // INDEXING RECOMMENDATION: Ensure 'subdomain' field in Tenant model has a unique index.
    const existingSubdomain = await Tenant.findOne({ subdomain }).lean();
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
    // INDEXING RECOMMENDATION: Ensure 'userId' and 'tenantId' fields in TenantMember model are indexed.
    await TenantMember.create({
      userId: ownerId,
      tenantId: tenant._id,
      role: 'admin',
      permissions: ['*'], // Full permissions for owner
      status: 'active',
      joinedAt: new Date(),
    });

    // Update user with tenant info (keep for backward compatibility)
    // 'ownerId' is _id, which is already indexed.
    const owner = await UserModel.findByIdAndUpdate(
      ownerId,
      {
        tenantId: tenant._id,
        tenantRole: 'admin',
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
 * Get a tenant by its ID, populating owner details and its active subscription.
 *
 * @async
 * @param {string | mongoose.Types.ObjectId} tenantId - The ID of the tenant to retrieve.
 * @returns {Promise<object>} A promise that resolves to the tenant object, including populated owner and subscription details.
 * @throws {ApiError} If the tenantId is invalid or the tenant is not found.
 */
const getTenantById = async (tenantId) => {
  if (!mongoose.Types.ObjectId.isValid(tenantId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  // 'tenantId' is _id, which is already indexed.
  // INDEXING RECOMMENDATION: Ensure 'ownerId' field in Tenant model is indexed if not already.
  const tenant = await Tenant.findById(tenantId)
    .populate('ownerId', 'name email')
    .lean(); // Already uses .lean()

  // INDEXING RECOMMENDATION: Ensure 'tenantId' field in SubscriptionModel is indexed.
  // INDEXING RECOMMENDATION: Ensure 'price' field in SubscriptionModel and 'stripePriceId' in Product model are indexed for $lookup.
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
 * Update an existing tenant's details.
 * Only specific fields like 'name', 'settings', and 'metadata' are allowed to be updated.
 * Requires 'admin' or 'manager' role for the updater.
 *
 * @async
 * @param {string | mongoose.Types.ObjectId} tenantId - The ID of the tenant to update.
 * @param {object} updates - An object containing the fields to update (e.g., { name: 'New Name' }).
 * @param {string | mongoose.Types.ObjectId} [updaterId] - The ID of the user performing the update, used for permission checks.
 * @returns {Promise<object>} A promise that resolves to the updated tenant object.
 * @throws {ApiError} If the tenant is not found, updates are invalid, or the updater has insufficient permissions.
 */
const updateTenant = async (tenantId, updates, updaterId) => {
  // 'tenantId' is _id, which is already indexed.
  const tenant = await Tenant.findById(tenantId);

  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  // Verify updater permissions
  if (updaterId) {
    // OPTIMIZATION: Added .lean() as 'updater' is only used for permission checks.
    // INDEXING RECOMMENDATION: Ensure 'userId' and 'tenantId' fields in TenantMember model are indexed.
    const updater = await TenantMember.findOne({ userId: updaterId, tenantId }).lean();
    if (!updater || !['admin', 'manager'].includes(updater.role)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Insufficient permissions to update tenant settings'
      );
    }
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
 * Soft deletes a tenant by marking it as deleted.
 *
 * @async
 * @param {string | mongoose.Types.ObjectId} tenantId - The ID of the tenant to soft delete.
 * @returns {Promise<void>} A promise that resolves when the tenant is soft deleted.
 * @throws {ApiError} If the tenant is not found.
 */
const deleteTenant = async (tenantId) => {
  // 'tenantId' is _id, which is already indexed.
  const tenant = await Tenant.findById(tenantId);

  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  await tenant.softDelete();

  logger.info(`Tenant deleted: ${tenantId}`);
};

/**
 * @typedef {object} UserTenant
 * @property {mongoose.Types.ObjectId} id - The ID of the tenant.
 * @property {string} name - The name of the tenant.
 * @property {string} slug - The slug of the tenant.
 * @property {string} subdomain - The subdomain of the tenant.
 * @property {string} status - The status of the tenant.
 * @property {string} plan - The plan of the tenant.
 * @property {string} role - The user's role within this tenant.
 * @property {string[]} permissions - The user's permissions within this tenant.
 * @property {Date} joinedAt - The date the user joined this tenant.
 */

/**
 * @typedef {object} UserTenantsResult
 * @property {UserTenant[]} tenants - An array of tenant details the user is a member of.
 * @property {number} total - The total number of tenants the user is a member of.
 */

/**
 * Get all active tenants/organizations for a specific user.
 * If the user has no tenants, it attempts to auto-create a default free tenant for them.
 *
 * @async
 * @param {string | mongoose.Types.ObjectId} userId - The ID of the user.
 * @returns {Promise<UserTenantsResult>} A promise that resolves to an object containing a list of tenants and their total count.
 * @throws {ApiError} If there's an error fetching or auto-creating tenants.
 */
const getUserTenants = async (userId) => {
  try {
    // Find all active memberships for the user
    // OPTIMIZATION: Added .lean() as 'tenantMemberships' is only read and transformed.
    // INDEXING RECOMMENDATION: Ensure 'userId', 'status', 'tenantId', and 'joinedAt' fields in TenantMember model are indexed.
    let tenantMemberships = await TenantMember.find({
      userId,
      status: 'active',
    })
      .populate('tenantId', 'name slug subdomain status plan')
      .sort({ joinedAt: -1 })
      .lean();

    if (!tenantMemberships || tenantMemberships.length === 0) {
      // OPTIMIZATION: Added .lean() as 'user' is only read for email/username.
      // 'userId' is _id, which is already indexed.
      const user = await UserModel.findById(userId).lean();
      if (!user) {
        return {
          tenants: [],
          total: 0,
        };
      }

      const emailPrefix = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'workspace';
      const randomSuffix = crypto.randomBytes(3).toString('hex');
      const uniqueSlug = `${emailPrefix}-${randomSuffix}`;
      const uniqueSubdomain = `${emailPrefix}-${randomSuffix}`;
      const workspaceName = `${user.username || user.email.split('@')[0]}'s Workspace`;

      logger.info(`Auto-creating tenant for user ${userId} in getUserTenants: slug=${uniqueSlug}, subdomain=${uniqueSubdomain}`);

      try {
        await createTenant({
          name: workspaceName,
          slug: uniqueSlug,
          subdomain: uniqueSubdomain,
          ownerId: userId,
          plan: 'free',
        });

        // Refetch memberships after creation
        // OPTIMIZATION: Added .lean() as 'tenantMemberships' is only read and transformed.
        // INDEXING RECOMMENDATION: Ensure 'userId', 'status', 'tenantId', and 'joinedAt' fields in TenantMember model are indexed.
        tenantMemberships = await TenantMember.find({
          userId,
          status: 'active',
        })
          .populate('tenantId', 'name slug subdomain status plan')
          .sort({ joinedAt: -1 })
          .lean();
      } catch (createError) {
        logger.error('Failed to auto-create tenant in getUserTenants:', createError);
        return {
          tenants: [],
          total: 0,
        };
      }
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
 * @typedef {object} SwitchedTenantInfo
 * @property {mongoose.Types.ObjectId | null} tenantId - The ID of the switched tenant, or null for personal mode.
 * @property {string} tenantName - The name of the switched tenant, or 'Personal'.
 * @property {string} mode - The mode ('organization' or 'personal').
 * @property {string | null} role - The user's role in the tenant, or null for personal mode.
 * @property {string[]} permissions - The user's permissions in the tenant, or an empty array for personal mode.
 */

/**
 * Switches the user's active tenant context.
 * If `tenantId` is null, it switches to a 'personal' mode.
 * Otherwise, it verifies the user is an active member of the specified tenant and returns its details.
 *
 * @async
 * @param {string | mongoose.Types.ObjectId} userId - The ID of the user switching tenants.
 * @param {string | mongoose.Types.ObjectId | null} tenantId - The ID of the tenant to switch to, or null for personal mode.
 * @returns {Promise<SwitchedTenantInfo>} A promise that resolves to an object containing the details of the switched tenant or personal mode.
 * @throws {ApiError} If the user is not a member of the specified tenant or the tenant is not found.
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
    // OPTIMIZATION: Added .lean() as 'tenantMembership' is only read.
    // INDEXING RECOMMENDATION: Ensure 'userId', 'tenantId', and 'status' fields in TenantMember model are indexed.
    const tenantMembership = await TenantMember.findOne({
      userId,
      tenantId,
      status: 'active',
    }).lean();

    if (!tenantMembership) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'User is not a member of this tenant'
      );
    }

    // Get the tenant details
    // OPTIMIZATION: Added .lean() as 'tenant' is only read.
    // 'tenantId' is _id, which is already indexed.
    const tenant = await Tenant.findById(tenantId).lean();
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
 * @typedef {object} TenantMemberPopulated
 * @property {mongoose.Types.ObjectId} _id - The ID of the tenant member record.
 * @property {object} userId - Populated user object with 'name' and 'email'.
 * @property {mongoose.Types.ObjectId} tenantId - The ID of the tenant.
 * @property {string} role - The role of the member (e.g., 'admin', 'member').
 * @property {string[]} permissions - The permissions assigned to the member.
 * @property {string} status - The status of the membership (e.g., 'active').
 * @property {Date} joinedAt - The date the member joined.
 */

/**
 * @typedef {object} TenantMembersResult
 * @property {TenantMemberPopulated[]} members - An array of tenant member objects with populated user details.
 * @property {object} pagination - Pagination details.
 * @property {number} pagination.page - The current page number.
 * @property {number} pagination.limit - The number of items per page.
 * @property {number} pagination.total - The total number of members.
 * @property {number} pagination.pages - The total number of pages.
 */

/**
 * Get a paginated list of active members for a specific tenant.
 *
 * @async
 * @param {string | mongoose.Types.ObjectId} tenantId - The ID of the tenant.
 * @param {object} [options] - Pagination options.
 * @param {number} [options.page=1] - The page number for pagination.
 * @param {number} [options.limit=20] - The maximum number of members per page.
 * @returns {Promise<TenantMembersResult>} A promise that resolves to an object containing members and pagination info.
 */
const getTenantMembers = async (tenantId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  // OPTIMIZATION: Already uses .lean().
  // INDEXING RECOMMENDATION: Ensure 'tenantId', 'status', and 'userId' fields in TenantMember model are indexed.
  const members = await TenantMember.find({ tenantId, status: 'active' })
    .populate('userId', 'name email')
    .skip(skip)
    .limit(limit)
    .lean();

  // INDEXING RECOMMENDATION: Ensure 'tenantId' and 'status' fields in TenantMember model are indexed.
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
 * @typedef {object} InvitationData
 * @property {mongoose.Types.ObjectId} tenantId - The ID of the tenant to invite to.
 * @property {string} email - The email of the user to invite.
 * @property {string} role - The role to assign to the invited user (e.g., 'member', 'manager', 'admin').
 * @property {mongoose.Types.ObjectId} invitedBy - The ID of the user sending the invitation.
 */

/**
 * Invites a new member to a tenant by creating a TenantInvitation record.
 * Performs checks for tenant existence, inviter permissions, subscription limits,
 * existing membership, and pending invitations.
 *
 * @async
 * @param {InvitationData} invitationData - The data for the invitation.
 * @returns {Promise<object>} A promise that resolves to the created invitation object.
 * @throws {ApiError} If the tenant is not found, inviter has insufficient permissions,
 *                     subscription limits are reached, user is already a member, or
 *                     a pending invitation already exists for the user.
 */
const inviteMember = async (invitationData) => {
  const { tenantId, email, role, invitedBy } = invitationData;

  // Check if tenant exists
  // OPTIMIZATION: Added .lean() as 'tenant' is only read for existence and canAddMembers().
  // 'tenantId' is _id, which is already indexed.
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  // Verify inviter permissions
  if (invitedBy) {
    // OPTIMIZATION: Added .lean() as 'inviter' is only read for permissions.
    // INDEXING RECOMMENDATION: Ensure 'userId' and 'tenantId' fields in TenantMember model are indexed.
    const inviter = await TenantMember.findOne({ userId: invitedBy, tenantId }).lean();
    if (!inviter || !['admin', 'manager'].includes(inviter.role)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Insufficient permissions to invite members'
      );
    }
    // Prevent managers from inviting admins
    if (inviter.role === 'manager' && role === 'admin') {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Managers cannot invite users as admin'
      );
    }
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
  // OPTIMIZATION: Added .lean() as 'existingMember' is only read.
  // INDEXING RECOMMENDATION: Ensure 'tenantId' and 'status' fields in TenantMember model are indexed.
  // INDEXING RECOMMENDATION: Ensure 'email' field in UserModel is indexed for the populate match.
  const existingMember = await TenantMember.findOne({
    tenantId,
    status: 'active',
  }).populate({
    path: 'userId',
    match: { email: email.toLowerCase() },
  }).lean();

  if (existingMember && existingMember.userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'User is already a member of this tenant'
    );
  }

  // Check for pending invitation
  // INDEXING RECOMMENDATION: Ensure 'email' and 'tenantId' fields in TenantInvitation model are indexed.
  // Assuming findPendingByEmail internally uses .lean() if it's a read-only operation.
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
 * Updates the role of an existing tenant member or a pending invitation.
 * Requires 'admin' or 'manager' role for the updater, with restrictions on promoting to 'admin'.
 *
 * @async
 * @param {string | mongoose.Types.ObjectId} tenantId - The ID of the tenant.
 * @param {string | mongoose.Types.ObjectId} userId - The ID of the user (or invitation ID if pending) whose role is to be updated.
 * @param {string} role - The new role for the member (e.g., 'member', 'manager', 'admin').
 * @param {string | mongoose.Types.ObjectId} [updaterId] - The ID of the user performing the update, used for permission checks.
 * @returns {Promise<object>} A promise that resolves to the updated tenant member or invitation object.
 * @throws {ApiError} If the member or invitation is not found, or if the updater has insufficient permissions.
 */
const updateMemberRole = async (tenantId, userId, role, updaterId) => {
  // Verify updater permissions
  if (updaterId) {
    // OPTIMIZATION: Added .lean() as 'updater' is only read for permissions.
    // INDEXING RECOMMENDATION: Ensure 'userId' and 'tenantId' fields in TenantMember model are indexed.
    const updater = await TenantMember.findOne({ userId: updaterId, tenantId }).lean();
    if (!updater || !['admin', 'manager'].includes(updater.role)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Insufficient permissions to update roles'
      );
    }
    // Prevent managers from granting admin roles
    if (updater.role === 'manager' && role === 'admin') {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Managers cannot promote users to admin'
      );
    }
  }

  // 1. Search for active membership first as it's the source of truth
  // INDEXING RECOMMENDATION: Ensure 'userId' and 'tenantId' fields in TenantMember model are indexed.
  const tenantMember = await TenantMember.findOne({ userId, tenantId });

  if (!tenantMember) {
    // 2. It might be a pending invitation being updated
    // INDEXING RECOMMENDATION: Ensure '_id' and 'tenantId' fields in TenantInvitation model are indexed.
    const invitation = await TenantInvitation.findOne({ _id: userId, tenantId });
    if (invitation) {
      invitation.role = role;
      await invitation.save();
      logger.info(`Invitation role updated: ${userId} to ${role}`);
      return invitation;
    }
    throw new ApiError(httpStatus.NOT_FOUND, 'Member or invitation not found');
  }

  // Prevent downgrading or modifying existing admins directly via this endpoint
  // unless we have specific rules for admin management
  if (tenantMember.role === 'admin' && role !== 'admin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot change the role of an existing admin');
  }

  // 3. Update the role in the TenantMember record
  tenantMember.role = role;
  await tenantMember.save();

  // 4. Update UserModel representation if user exists
  // 'userId' is _id, which is already indexed.
  const user = await UserModel.findById(userId);
  if (user) {
    // If this is currently their active or primary tenant in their profile, sync it
    if (user.tenantId?.toString() === tenantId.toString() || user.activeTenantId?.toString() === tenantId.toString()) {
      user.tenantRole = role;
      await user.save();
    }
  }

  logger.info(`Member role updated: ${userId} to ${role}`);

  return user || tenantMember;
};

/**
 * @typedef {object} RemoveMemberResult
 * @property {string} message - A confirmation message.
 * @property {mongoose.Types.ObjectId} userId - The ID of the user who was removed.
 * @property {mongoose.Types.ObjectId} tenantId - The ID of the tenant from which the user was removed.
 */

/**
 * Removes a member from a tenant.
 * Prevents removal of the tenant owner (admin).
 * Requires 'admin' or 'manager' role for the remover.
 * Also updates user's active tenant if the removed tenant was active,
 * adjusts tenant user count, and removes a seat from the subscription if applicable.
 *
 * @async
 * @param {string | mongoose.Types.ObjectId} tenantId - The ID of the tenant.
 * @param {string | mongoose.Types.ObjectId} userId - The ID of the user to remove.
 * @param {string | mongoose.Types.ObjectId} removedBy - The ID of the user performing the removal.
 * @returns {Promise<RemoveMemberResult>} A promise that resolves to a confirmation object.
 * @throws {ApiError} If the member is not found, the member is the tenant owner, or the remover has insufficient permissions.
 */
const removeMember = async (tenantId, userId, removedBy) => {
  // Find the member in TenantMember collection
  // INDEXING RECOMMENDATION: Ensure 'userId' and 'tenantId' fields in TenantMember model are indexed.
  const tenantMember = await TenantMember.findOne({ userId, tenantId });

  if (!tenantMember) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Member not found in tenant');
  }

  if (tenantMember.role === 'admin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot remove tenant owner');
  }

  // Verify permissions - only owner or admin can remove members
  // OPTIMIZATION: Added .lean() as 'remover' is only read for permissions.
  // INDEXING RECOMMENDATION: Ensure 'userId' and 'tenantId' fields in TenantMember model are indexed.
  const remover = await TenantMember.findOne({ userId: removedBy, tenantId }).lean();
  if (!remover || !['admin', 'manager'].includes(remover.role)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Insufficient permissions to remove members'
    );
  }

  // Delete TenantMember record
  await TenantMember.deleteOne({ _id: tenantMember._id });

  // Update user's active tenant if this was their active tenant
  // 'userId' is _id, which is already indexed.
  const user = await UserModel.findById(userId);
  if (user) {
    if (user.activeTenantId?.toString() === tenantId.toString()) {
      user.activeTenantId = null;
      await user.save();
    }
  }

  // Update tenant user count
  // 'tenantId' is _id, which is already indexed.
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
 * Get tenant usage statistics.
 *
 * @async
 * @param {string | mongoose.Types.ObjectId} tenantId - The ID of the tenant.
 * @returns {Promise<object>} A promise that resolves to the tenant's usage statistics object.
 * @throws {ApiError} If the tenant is not found.
 */
const getTenantUsage = async (tenantId) => {
  // OPTIMIZATION: Added .lean() as 'tenant' is only read for its 'usage' field.
  // 'tenantId' is _id, which is already indexed.
  const tenant = await Tenant.findById(tenantId).lean();

  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  return tenant.usage;
};

/**
 * @typedef {object} TenantLimitsResult
 * @property {object} limits - The defined limits for the tenant (e.g., maxApiCalls, maxStorage, maxUsers).
 * @property {object} usage - The current usage statistics for the tenant (e.g., apiCallsUsed, storageUsed, usersCount).
 * @property {object} percentageUsed - The percentage of each limit currently used.
 * @property {number} percentageUsed.apiCalls - Percentage of API calls limit used.
 * @property {number} percentageUsed.storage - Percentage of storage limit used.
 * @property {number} percentageUsed.users - Percentage of user limit used.
 */

/**
 * Get tenant limits and current usage, including percentage used for each metric.
 *
 * @async
 * @param {string | mongoose.Types.ObjectId} tenantId - The ID of the tenant.
 * @returns {Promise<TenantLimitsResult>} A promise that resolves to an object containing limits, usage, and percentage used.
 * @throws {ApiError} If the tenant is not found.
 */
const getTenantLimits = async (tenantId) => {
  // OPTIMIZATION: Added .lean() as 'tenant' is only read for its 'limits' and 'usage' fields.
  // 'tenantId' is _id, which is already indexed.
  const tenant = await Tenant.findById(tenantId).lean();

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
 * @typedef {object} SubdomainAvailabilityResult
 * @property {string} subdomain - The subdomain that was checked.
 * @property {boolean} available - True if the subdomain is available, false otherwise.
 * @property {string} message - A message indicating availability status.
 */

/**
 * Checks if a given subdomain is available for a new tenant.
 *
 * @async
 * @param {string} subdomain - The subdomain to check.
 * @returns {Promise<SubdomainAvailabilityResult>} A promise that resolves to an object indicating subdomain availability.
 */
const checkSubdomainAvailability = async (subdomain) => {
  // OPTIMIZATION: Added .lean() as 'existingTenant' is only used for existence check.
  // INDEXING RECOMMENDATION: Ensure 'subdomain' field in Tenant model has a unique index.
  const existingTenant = await Tenant.findOne({
    subdomain: subdomain.toLowerCase(),
  }).lean();

  return {
    subdomain: subdomain.toLowerCase(),
    available: !existingTenant,
    message: existingTenant
      ? 'Subdomain is already taken'
      : 'Subdomain is available',
  };
};

/**
 * @typedef {object} TenantUserCountResult
 * @property {number} usersCount - The total count of active members in the tenant.
 */

/**
 * Get the count of active users/members for a specific tenant.
 *
 * @async
 * @param {string | mongoose.Types.ObjectId} tenantId - The ID of the tenant.
 * @returns {Promise<TenantUserCountResult>} A promise that resolves to an object containing the count of active users.
 */
const getTenantUserCount = async (tenantId) => {
  // INDEXING RECOMMENDATION: Ensure 'tenantId' and 'status' fields in TenantMember model are indexed.
  const count = await TenantMember.countDocuments({
    tenantId,
    status: 'active',
  });

  return {
    usersCount: count,
  };
};

/**
 * @namespace tenantService
 * @description Provides service functions for managing tenants and their members.
 */
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