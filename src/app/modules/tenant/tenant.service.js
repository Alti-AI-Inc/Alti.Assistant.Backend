import httpStatus from 'http-status';
import mongoose from 'mongoose';
import crypto from 'crypto';
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

// Helper function for ObjectId validation
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Create a new tenant
 */
const createTenant = async (tenantData) => {
  // Use a Mongoose session for atomicity
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, slug, subdomain, ownerId, plan = 'free' } = tenantData;

    // Validate ownerId
    if (!isValidObjectId(ownerId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid owner ID');
    }

    // Check if slug is already taken
    const existingTenantBySlug = await Tenant.findOne({ slug }).session(session);
    if (existingTenantBySlug) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant slug already exists');
    }

    // Check if subdomain is already taken
    const existingTenantBySubdomain = await Tenant.findOne({ subdomain }).session(session);
    if (existingTenantBySubdomain) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Subdomain is already taken');
    }

    // Create tenant
    const [tenant] = await Tenant.create(
      [
        {
          name,
          slug,
          subdomain,
          ownerId,
          plan,
          status: plan === 'free' ? 'trial' : 'active',
        },
      ],
      { session }
    );

    // Create TenantMember record for owner
    await TenantMember.create(
      [
        {
          userId: ownerId,
          tenantId: tenant._id,
          role: 'admin',
          permissions: ['*'], // Full permissions for owner
          status: 'active',
          joinedAt: new Date(),
        },
      ],
      { session }
    );

    // Update user with tenant info
    const owner = await UserModel.findByIdAndUpdate(
      ownerId,
      {
        tenantId: tenant._id,
        tenantRole: 'admin',
        tenantPermissions: ['*'],
        activeTenantId: tenant._id, // Set as active tenant
      },
      { new: true, session }
    );

    if (!owner) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Owner user not found');
    }

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
      // Defensive assignment for tenant.subscription
      tenant.subscription = tenant.subscription || {};
      tenant.subscription.stripeCustomerId = stripeCustomer.id;
      await tenant.save({ session }); // Save within the transaction
      logger.info(
        `Stripe customer created for tenant: ${tenant._id}, customerId: ${stripeCustomer.id}`
      );
    } catch (error) {
      logger.error('Error creating Stripe customer for tenant:', error);
      // Don't fail tenant creation if Stripe customer creation fails, but log it.
      // The transaction will still commit if other parts succeed.
    }

    // Create free subscription for the tenant
    try {
      // Note: createFreeSubscription might start its own session/transaction if not designed to work with an external one.
      // For simplicity, assuming it's independent or handles sessions internally.
      // If it needs to be part of this transaction, it would need a session parameter.
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

    await session.commitTransaction();
    session.endSession();

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
    await session.abortTransaction();
    session.endSession();
    logger.error('Error creating tenant:', error);
    throw error;
  }
};

/**
 * Get tenant by ID
 * @param {string} tenantId - The ID of the tenant
 * @param {string} requestingUserId - The ID of the user making the request (for authorization)
 */
const getTenantById = async (tenantId, requestingUserId) => {
  if (!isValidObjectId(tenantId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }
  if (!isValidObjectId(requestingUserId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid requesting user ID');
  }

  // Check if requesting user is a member of this tenant
  const isMember = await TenantMember.exists({
    userId: requestingUserId,
    tenantId,
    status: 'active',
  });
  if (!isMember) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'User is not authorized to view this tenant'
    );
  }

  const tenant = await Tenant.findById(tenantId)
    .populate('ownerId', 'name email')
    .lean();

  // Remove debug log
  // console.log('Subscription aggregation result:', subscription);
  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  const subscription = await SubscriptionModel.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
    {
      $lookup: {
        from: 'products', // Assuming 'products' is the collection name for products
        localField: 'price', // Assuming 'price' field in SubscriptionModel stores stripePriceId
        foreignField: 'stripePriceId',
        as: 'price',
      },
    },
    { $unwind: { path: '$price', preserveNullAndEmptyArrays: true } }, // Use preserveNullAndEmptyArrays to keep subscriptions without a matching product
    { $sort: { createdAt: -1 } },
    { $limit: 1 },
  ]);

  return {
    ...tenant,
    subscription: subscription.length > 0 ? subscription[0] : null,
  };
};

/**
 * Update tenant
 * @param {string} tenantId - The ID of the tenant to update
 * @param {object} updates - The updates to apply
 * @param {string} updaterId - The ID of the user performing the update (for authorization)
 */
const updateTenant = async (tenantId, updates, updaterId) => {
  if (!isValidObjectId(tenantId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }
  if (!isValidObjectId(updaterId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid updater user ID');
  }

  const tenant = await Tenant.findById(tenantId);

  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  // Verify updater permissions
  const updater = await TenantMember.findOne({ userId: updaterId, tenantId });
  if (!updater || !['admin', 'manager'].includes(updater.role)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Insufficient permissions to update tenant settings'
    );
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

  logger.info(`Tenant updated: ${tenantId} by user: ${updaterId}`);

  return tenant;
};

/**
 * Delete tenant (soft delete)
 * @param {string} tenantId - The ID of the tenant to delete
 * @param {string} deleterId - The ID of the user performing the deletion (for authorization)
 */
const deleteTenant = async (tenantId, deleterId) => {
  if (!isValidObjectId(tenantId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }
  if (!isValidObjectId(deleterId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid deleter user ID');
  }

  const tenant = await Tenant.findById(tenantId);

  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  // Verify permissions - only owner or admin can delete tenants
  const deleter = await TenantMember.findOne({ userId: deleterId, tenantId });
  if (
    !deleter ||
    !['admin'].includes(deleter.role) // Only admins can delete
  ) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Insufficient permissions to delete tenant'
    );
  }

  // Ensure the deleter is the actual owner of the tenant
  if (tenant.ownerId.toString() !== deleterId.toString()) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only the tenant owner can delete the tenant'
    );
  }

  await tenant.softDelete();

  logger.info(`Tenant deleted: ${tenantId} by user: ${deleterId}`);
};

/** * Get all tenants/organizations for a user
 * @param {string} userId - The ID of the user
 */
const getUserTenants = async (userId) => {
  try {
    if (!isValidObjectId(userId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid user ID');
    }

    // Find all active memberships for the user
    let tenantMemberships = await TenantMember.find({
      userId,
      status: 'active',
    })
      .populate('tenantId', 'name slug subdomain status plan')
      .sort({ joinedAt: -1 });

    if (!tenantMemberships || tenantMemberships.length === 0) {
      const user = await UserModel.findById(userId);
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
        const newTenantInfo = await createTenant({
          name: workspaceName,
          slug: uniqueSlug,
          subdomain: uniqueSubdomain,
          ownerId: userId,
          plan: 'free',
        });

        // Construct the membership directly from the created tenant info
        tenantMemberships = [
          {
            tenantId: {
              _id: newTenantInfo.id,
              name: newTenantInfo.name,
              slug: newTenantInfo.slug,
              subdomain: newTenantInfo.subdomain,
              status: newTenantInfo.status,
              plan: newTenantInfo.plan,
            },
            role: 'admin', // Owner is always admin
            permissions: ['*'],
            joinedAt: new Date(),
          },
        ];
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
 * Switch user to a different tenant
 * @param {string} userId - The ID of the user
 * @param {string | null} tenantId - The ID of the tenant to switch to, or null for personal mode
 */
const switchTenant = async (userId, tenantId) => {
  try {
    if (!isValidObjectId(userId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid user ID');
    }
    if (tenantId && !isValidObjectId(tenantId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid tenant ID');
    }

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
 * @param {string} tenantId - The ID of the tenant
 * @param {string} requestingUserId - The ID of the user making the request (for authorization)
 * @param {object} options - Pagination options
 */
const getTenantMembers = async (tenantId, requestingUserId, options = {}) => {
  if (!isValidObjectId(tenantId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }
  if (!isValidObjectId(requestingUserId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid requesting user ID');
  }

  // Check if requesting user is a member of this tenant
  const isMember = await TenantMember.exists({
    userId: requestingUserId,
    tenantId,
    status: 'active',
  });
  if (!isMember) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'User is not authorized to view tenant members'
    );
  }

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
 * @param {object} invitationData - Data for the invitation
 * @param {string} invitationData.tenantId - The ID of the tenant
 * @param {string} invitationData.email - The email of the user to invite
 * @param {string} invitationData.role - The role to assign (e.g., 'member', 'manager', 'admin')
 * @param {string} invitationData.invitedBy - The ID of the user sending the invitation (for authorization)
 */
const inviteMember = async (invitationData) => {
  const { tenantId, email, role, invitedBy } = invitationData;

  if (!isValidObjectId(tenantId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }
  if (!isValidObjectId(invitedBy)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid inviter user ID');
  }
  // Basic email validation (more robust validation might be needed at controller/schema level)
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid email address');
  }
  // Validate role
  const allowedRoles = ['member', 'manager', 'admin'];
  if (!allowedRoles.includes(role)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid role: ${role}. Allowed roles are: ${allowedRoles.join(', ')}`);
  }

  // Check if tenant exists
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  // Verify inviter permissions
  const inviter = await TenantMember.findOne({ userId: invitedBy, tenantId });
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

  // Check if tenant can add more members (assuming this method exists and checks against limits)
  // This check might be redundant if subscription limits are already checked above,
  // but keeping it if tenant model has its own specific logic.
  if (typeof tenant.canAddMembers === 'function' && !tenant.canAddMembers()) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Tenant has reached maximum member limit'
    );
  }

  // Corrected check: Find user by email first, then check for existing membership
  const userToInvite = await UserModel.findOne({ email: email.toLowerCase() });
  if (userToInvite) {
    const existingMember = await TenantMember.findOne({
      tenantId,
      userId: userToInvite._id,
      status: 'active',
    });
    if (existingMember) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'User is already a member of this tenant'
      );
    }
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

  logger.info(`Invitation sent to ${email} for tenant ${tenantId} by ${invitedBy}`);

  return invitation;
};

/**
 * Update member role
 * @param {string} tenantId - The ID of the tenant
 * @param {string} userId - The ID of the user (member) whose role is to be updated
 * @param {string} role - The new role for the member
 * @param {string} updaterId - The ID of the user performing the update (for authorization)
 */
const updateMemberRole = async (tenantId, userId, role, updaterId) => {
  if (!isValidObjectId(tenantId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }
  if (!isValidObjectId(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid user ID');
  }
  if (!isValidObjectId(updaterId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid updater user ID');
  }
  // Validate role
  const allowedRoles = ['member', 'manager', 'admin'];
  if (!allowedRoles.includes(role)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid role: ${role}. Allowed roles are: ${allowedRoles.join(', ')}`);
  }

  // Verify updater permissions
  const updater = await TenantMember.findOne({ userId: updaterId, tenantId });
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

  // Find the active membership
  const tenantMember = await TenantMember.findOne({ userId, tenantId, status: 'active' });

  if (!tenantMember) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Member not found in tenant');
  }

  // Prevent changing the role of the tenant owner
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found'); // Should not happen if tenantMember exists
  }
  if (tenant.ownerId.toString() === userId.toString() && role !== 'admin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot change the role of the tenant owner');
  }
  // Prevent demoting an admin by a non-admin (or if the admin is the owner)
  if (tenantMember.role === 'admin' && role !== 'admin' && updater.role !== 'admin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only an admin can demote another admin.');
  }
  // If the target member is an admin and the updater is not the owner, prevent demotion
  if (tenantMember.role === 'admin' && role !== 'admin' && tenant.ownerId.toString() !== updaterId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only the tenant owner can demote an admin.');
  }


  // Update the role in the TenantMember record
  tenantMember.role = role;
  await tenantMember.save();

  // Update UserModel representation if user exists and this is their active/primary tenant
  const user = await UserModel.findById(userId);
  if (user) {
    if (user.tenantId?.toString() === tenantId.toString() || user.activeTenantId?.toString() === tenantId.toString()) {
      user.tenantRole = role;
      await user.save();
    }
  }

  logger.info(`Member role updated: ${userId} to ${role} in tenant ${tenantId} by ${updaterId}`);

  return tenantMember; // Return the updated tenant member, not the user model
};

/**
 * Remove member from tenant
 * @param {string} tenantId - The ID of the tenant
 * @param {string} userId - The ID of the user (member) to remove
 * @param {string} removedBy - The ID of the user performing the removal (for authorization)
 */
const removeMember = async (tenantId, userId, removedBy) => {
  if (!isValidObjectId(tenantId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }
  if (!isValidObjectId(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid user ID');
  }
  if (!isValidObjectId(removedBy)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid remover user ID');
  }

  // Find the tenant to check ownerId
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  // Find the member in TenantMember collection
  const tenantMember = await TenantMember.findOne({ userId, tenantId });

  if (!tenantMember) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Member not found in tenant');
  }

  // Corrected logic: Cannot remove the tenant owner
  if (tenant.ownerId.toString() === userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot remove the tenant owner');
  }

  // Verify permissions - only admin or manager can remove members
  const remover = await TenantMember.findOne({ userId: removedBy, tenantId });
  if (!remover || !['admin', 'manager'].includes(remover.role)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Insufficient permissions to remove members'
    );
  }
  // Managers cannot remove admins
  if (remover.role === 'manager' && tenantMember.role === 'admin') {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Managers cannot remove admin members'
    );
  }

  // Delete TenantMember record
  await TenantMember.deleteOne({ _id: tenantMember._id });

  // Update user's active tenant if this was their active tenant
  const user = await UserModel.findById(userId);
  if (user && user.activeTenantId?.toString() === tenantId.toString()) {
    user.activeTenantId = null;
    // Also clear tenant-specific roles/permissions if this was their primary tenant
    if (user.tenantId?.toString() === tenantId.toString()) {
      user.tenantId = null;
      user.tenantRole = null;
      user.tenantPermissions = [];
    }
    await user.save();
  }

  // Update tenant user count
  // The usage.usersCount should ideally be updated by a hook or a dedicated service
  // that counts active members, but for now, decrementing here.
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
 * @param {string} tenantId - The ID of the tenant
 * @param {string} requestingUserId - The ID of the user making the request (for authorization)
 */
const getTenantUsage = async (tenantId, requestingUserId) => {
  if (!isValidObjectId(tenantId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }
  if (!isValidObjectId(requestingUserId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid requesting user ID');
  }

  // Check if requesting user is a member of this tenant
  const isMember = await TenantMember.exists({
    userId: requestingUserId,
    tenantId,
    status: 'active',
  });
  if (!isMember) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'User is not authorized to view tenant usage'
    );
  }

  const tenant = await Tenant.findById(tenantId);

  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  return tenant.usage;
};

/**
 * Get tenant limits
 * @param {string} tenantId - The ID of the tenant
 * @param {string} requestingUserId - The ID of the user making the request (for authorization)
 */
const getTenantLimits = async (tenantId, requestingUserId) => {
  if (!isValidObjectId(tenantId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }
  if (!isValidObjectId(requestingUserId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid requesting user ID');
  }

  // Check if requesting user is a member of this tenant
  const isMember = await TenantMember.exists({
    userId: requestingUserId,
    tenantId,
    status: 'active',
  });
  if (!isMember) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'User is not authorized to view tenant limits'
    );
  }

  const tenant = await Tenant.findById(tenantId);

  if (!tenant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }

  return {
    limits: tenant.limits,
    usage: tenant.usage,
    percentageUsed: {
      apiCalls: (tenant.limits.maxApiCalls > 0) ? (tenant.usage.apiCallsUsed / tenant.limits.maxApiCalls) * 100 : 0,
      storage: (tenant.limits.maxStorage > 0) ? (tenant.usage.storageUsed / tenant.limits.maxStorage) * 100 : 0,
      users: (tenant.limits.maxUsers > 0) ? (tenant.usage.usersCount / tenant.limits.maxUsers) * 100 : 0,
    },
  };
};

/**
 * Check if subdomain is available
 * @param {string} subdomain - The subdomain to check
 */
const checkSubdomainAvailability = async (subdomain) => {
  if (!subdomain || typeof subdomain !== 'string' || subdomain.trim().length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Subdomain cannot be empty');
  }
  // Add more robust subdomain validation (e.g., length, allowed characters)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subdomain)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid subdomain format. Must be lowercase alphanumeric, can use hyphens but not start/end with them.');
  }

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
 * @param {string} tenantId - The ID of the tenant
 * @param {string} requestingUserId - The ID of the user making the request (for authorization)
 */
const getTenantUserCount = async (tenantId, requestingUserId) => {
  if (!isValidObjectId(tenantId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
  }
  if (!isValidObjectId(requestingUserId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid requesting user ID');
  }

  // Check if requesting user is a member of this tenant
  const isMember = await TenantMember.exists({
    userId: requestingUserId,
    tenantId,
    status: 'active',
  });
  if (!isMember) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'User is not authorized to view tenant user count'
    );
  }

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