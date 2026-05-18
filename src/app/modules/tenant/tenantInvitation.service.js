import httpStatus from 'http-status';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import TenantInvitation from './tenantInvitation.model.js';
import Tenant from './tenant.model.js';
import UserModel from '../auth/auth.model.js';
import { jwtHelpers } from '../../helpers/jwtHelpers.js';
import { sendInvitationEmail } from './tenantInvitation.email.js';
import subscriptionService from '../subscription/subscription.service.js';

/**
 * Create a new invitation
 */
const createInvitation = async (invitationData) => {
  const { tenantId, email, role, invitedBy } = invitationData;

  try {
    // Generate unique token
    const token = TenantInvitation.generateToken();

    // Get tenant and inviter info
    const tenant = await Tenant.findById(tenantId);
    const inviter = await UserModel.findById(invitedBy);

    if (!tenant || !inviter) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Tenant or inviter not found');
    }

    // Create invitation with 7 day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await TenantInvitation.create({
      tenantId,
      email: email.toLowerCase(),
      role,
      invitedBy,
      token,
      expiresAt,
      metadata: {
        inviterName: inviter.name || inviter.email,
        tenantName: tenant.name,
      },
    });

    // Send invitation email with retry logic
    try {
      await sendInvitationEmail({
        email,
        token,
        inviterName: inviter.name || inviter.email,
        tenantName: tenant.name,
        role,
        expiryDays: 7,
      });

      logger.info(`Invitation email sent successfully: ${invitation._id} for ${email}`);
    } catch (emailError) {
      // Log error but don't fail invitation creation
      logger.error(`Failed to send invitation email for ${invitation._id}:`, emailError);
      // Update invitation status to indicate email pending
      invitation.status = 'pending_email';
      await invitation.save();
    }

    logger.info(`Invitation created: ${invitation._id} for ${email}`);

    return {
      id: invitation._id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
    };
  } catch (error) {
    logger.error('Error creating invitation:', error);
    throw error;
  }
};

/**
 * Verify invitation token
 */
const verifyInvitationToken = async (token) => {
  const invitation = await TenantInvitation.findByToken(token);

  if (!invitation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invalid or expired invitation');
  }

  if (invitation.isExpired()) {
    invitation.status = 'expired';
    await invitation.save();
    throw new ApiError(httpStatus.GONE, 'Invitation has expired');
  }

  const isUserExistWithEmail = await UserModel.exists({ email: invitation.email });
  return {
    id: invitation._id,
    email: invitation.email,
    role: invitation.role,
    isUserExistWithEmail: !!isUserExistWithEmail,
    tenantName: invitation.metadata.tenantName,
    inviterName: invitation.metadata.inviterName,
    expiresAt: invitation.expiresAt,
  };
};

/**
 * Accept invitation
 */
const acceptInvitation = async (token, userId) => {
  const invitation = await TenantInvitation.findByToken(token);

  if (!invitation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invalid or expired invitation');
  }

  if (invitation.isExpired()) {
    invitation.status = 'expired';
    await invitation.save();
    throw new ApiError(httpStatus.GONE, 'Invitation has expired');
  }

  // Get user
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  console.log('User email:', user.email);
  console.log('Invitation email:', invitation.email);
  // Check if user email matches invitation
  if (user.email.toLowerCase() !== invitation.email) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Invitation email does not match user email'
    );
  }

  // Update user with tenant info
  user.tenantId = invitation.tenantId;
  user.tenantRole = invitation.role;
  user.tenantPermissions = invitation.role === 'admin' ? ['manage_members', 'manage_content'] : ['view_content'];
  await user.save();

  // Update tenant user count
  const tenant = await Tenant.findById(invitation.tenantId);
  if (tenant) {
    tenant.usage.usersCount += 1;
    await tenant.save();
  }

  // Add seat to subscription if paid plan
  try {
    const subscription = await subscriptionService.getTenantSubscription(invitation.tenantId);
    if (subscription && subscription.plan !== 'free' && subscription.status === 'active') {
      await subscriptionService.addSeatToSubscription(subscription._id, userId);
      logger.info(`Added seat to subscription ${subscription._id} for user ${userId}`);
    }
  } catch (seatError) {
    logger.error('Error adding seat after invitation acceptance:', seatError);
    // Don't fail invitation acceptance if seat addition fails
  }

  // Mark invitation as accepted
  await invitation.markAsAccepted(userId);

  logger.info(`Invitation accepted: ${invitation._id} by user: ${userId}`);

  return {
    tenantId: invitation.tenantId,
    role: invitation.role,
    tenantName: invitation.metadata.tenantName,
  };
};

/**
 * Cancel invitation
 */
const cancelInvitation = async (invitationId) => {
  const invitation = await TenantInvitation.findById(invitationId);

  if (!invitation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invitation not found');
  }

  if (invitation.status !== 'pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Can only cancel pending invitations');
  }

  await invitation.cancel();

  logger.info(`Invitation cancelled: ${invitationId}`);
};

/**
 * Resend invitation
 */
const resendInvitation = async (invitationId) => {
  const invitation = await TenantInvitation.findById(invitationId);

  if (!invitation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invitation not found');
  }

  if (invitation.status !== 'pending' && invitation.status !== 'pending_email') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Can only resend pending invitations');
  }

  if (invitation.isExpired()) {
    throw new ApiError(httpStatus.GONE, 'Invitation has expired. Please create a new one');
  }

  // Resend email with retry logic
  try {
    await sendInvitationEmail({
      email: invitation.email,
      token: invitation.token,
      inviterName: invitation.metadata.inviterName,
      tenantName: invitation.metadata.tenantName,
      role: invitation.role,
      expiryDays: 7,
    });

    // Update status if it was pending_email
    if (invitation.status === 'pending_email') {
      invitation.status = 'pending';
      await invitation.save();
    }

    logger.info(`Invitation resent successfully: ${invitationId}`);
  } catch (emailError) {
    logger.error(`Failed to resend invitation email for ${invitationId}:`, emailError);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to send invitation email. Please try again later.'
    );
  }
};

/**
 * Get pending invitations for a tenant
 */
const getTenantInvitations = async (tenantId, options = {}) => {
  const { page = 1, limit = 20, status = 'pending' } = options;
  const skip = (page - 1) * limit;

  const query = { tenantId };
  if (status) {
    query.status = status;
  }

  const invitations = await TenantInvitation.find(query)
    .populate('invitedBy', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await TenantInvitation.countDocuments(query);

  return {
    invitations,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

export const tenantInvitationService = {
  createInvitation,
  verifyInvitationToken,
  acceptInvitation,
  cancelInvitation,
  resendInvitation,
  getTenantInvitations,
};
