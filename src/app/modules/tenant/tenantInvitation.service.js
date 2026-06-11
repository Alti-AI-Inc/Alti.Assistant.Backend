/**
 * @file Manages the lifecycle of tenant invitations, including creation, verification, acceptance, and administration.
 * @module services/tenantInvitationService
 */

import httpStatus from 'http-status';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import TenantInvitation from './tenantInvitation.model.js';
import Tenant from './tenant.model.js';
import TenantMember from './tenantMember.model.js';
import UserModel from '../auth/auth.model.js';
import { jwtHelpers } from '../../helpers/jwtHelpers.js';
import { sendInvitationEmail } from './tenantInvitation.email.js';
import subscriptionService from '../subscription/subscription.service.js';

// Recommended indexes for TenantInvitation model (add these to your TenantInvitationSchema definition):
// TenantInvitationSchema.index({ token: 1 });
// TenantInvitationSchema.index({ tenantId: 1, status: 1 });

// Recommended index for UserModel (add this to your UserSchema definition):
// UserSchema.index({ email: 1 });

// Recommended index for TenantMember model (add this to your TenantMemberSchema definition):
// TenantMemberSchema.index({ userId: 1, tenantId: 1 });

/**
 * Data required to create a new tenant invitation.
 * @typedef {Object} CreateInvitationData
 * @property {string} tenantId - The ID of the tenant to which the invitation belongs.
 * @property {string} email - The email address of the person being invited.
 * @property {'admin' | 'member'} role - The role assigned to the invited person within the tenant.
 * @property {string} invitedBy - The ID of the user who sent the invitation.
 */

/**
 * Creates a new tenant invitation.
 * Generates a unique token, sets an expiry, and attempts to send an invitation email.
 * If email sending fails, the invitation status is updated to 'pending_email'.
 *
 * @description This service should be called by an authenticated user with administrative privileges within the specified tenant.
 * The `invitedBy` field should correspond to the ID of the currently authenticated user.
 *
 * @param {CreateInvitationData} invitationData - The data for creating the invitation.
 * @returns {Promise<Object>} An object containing details of the created invitation.
 * @property {string} id - The ID of the invitation.
 * @property {string} email - The email of the invited person.
 * @property {'admin' | 'member'} role - The role assigned.
 * @property {Date} expiresAt - The expiration date of the invitation.
 * @property {'pending' | 'pending_email'} status - The current status of the invitation.
 * @throws {ApiError} If the tenant or inviter is not found (httpStatus.NOT_FOUND).
 * @throws {Error} If any other error occurs during invitation creation.
 */
const createInvitation = async (invitationData) => {
  const { tenantId, email, role, invitedBy } = invitationData;

  try {
    // Generate unique token
    const token = TenantInvitation.generateToken();

    // Get tenant and inviter info
    // OPTIMIZATION: Added .lean() for read-only queries to improve performance
    const tenant = await Tenant.findById(tenantId).lean();
    // OPTIMIZATION: Added .lean() for read-only queries to improve performance
    const inviter = await UserModel.findById(invitedBy).lean();

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

      logger.info(
        `Invitation email sent successfully: ${invitation._id} for ${email}`
      );
    } catch (emailError) {
      // Log error but don't fail invitation creation
      logger.error(
        `Failed to send invitation email for ${invitation._id}:`,
        emailError
      );
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
 * Verifies an invitation token.
 * Checks if the invitation exists and has not expired. This is a public-facing service used when a user clicks an invitation link.
 *
 * @param {string} token - The unique token associated with the invitation.
 * @returns {Promise<Object>} An object containing invitation details and user existence status.
 * @property {string} id - The ID of the invitation.
 * @property {string} email - The email of the invited person.
 * @property {'admin' | 'member'} role - The role assigned.
 * @property {boolean} isUserExistWithEmail - True if a user with the invitation email already exists, false otherwise.
 * @property {string} tenantName - The name of the tenant.
 * @property {string} inviterName - The name or email of the inviter.
 * @property {Date} expiresAt - The expiration date of the invitation.
 * @throws {ApiError} If the invitation is invalid or not found (httpStatus.NOT_FOUND).
 * @throws {ApiError} If the invitation has expired (httpStatus.GONE).
 */
const verifyInvitationToken = async (token) => {
  // No .lean() here as invitation object might be modified and saved later (e.g., status update)
  const invitation = await TenantInvitation.findByToken(token);

  if (!invitation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invalid or expired invitation');
  }

  if (invitation.isExpired()) {
    invitation.status = 'expired';
    await invitation.save();
    throw new ApiError(httpStatus.GONE, 'Invitation has expired');
  }

  // UserModel.exists is already optimized for existence checks
  const isUserExistWithEmail = await UserModel.exists({
    email: invitation.email,
  });
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
 * Accepts a tenant invitation.
 * Validates the token and user, updates the user's tenant information,
 * creates a TenantMember record, increments the tenant's user count,
 * and marks the invitation as accepted. Also attempts to add a seat to the subscription if applicable.
 *
 * @description This service must be called by the authenticated user who is the recipient of the invitation.
 * The service validates that the authenticated user's email matches the email on the invitation.
 *
 * @param {string} token - The unique token from the invitation.
 * @param {string} userId - The ID of the user accepting the invitation (must be the authenticated user).
 * @returns {Promise<Object>} An object containing the tenant ID, role, and tenant name.
 * @property {string} tenantId - The ID of the tenant.
 * @property {'admin' | 'member'} role - The role assigned to the user within the tenant.
 * @property {string} tenantName - The name of the tenant.
 * @throws {ApiError} If the invitation is invalid or not found (httpStatus.NOT_FOUND).
 * @throws {ApiError} If the invitation has expired (httpStatus.GONE).
 * @throws {ApiError} If the user is not found (httpStatus.NOT_FOUND).
 * @throws {ApiError} If the invitation email does not match the user's email (httpStatus.FORBIDDEN).
 * @throws {ApiError} If the tenant's seat limit is reached (httpStatus.FORBIDDEN).
 */
const acceptInvitation = async (token, userId) => {
  // No .lean() here as invitation object will be modified and saved later
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
  // No .lean() here as user object will be modified and saved later
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Check if user email matches invitation
  if (user.email.toLowerCase() !== invitation.email) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Invitation email does not match user email'
    );
  }

  // OPTIMIZATION: Fetch subscription details once and reuse to avoid a second database call.
  const subscription = await subscriptionService.getTenantSubscription(
    invitation.tenantId
  );

  // Check if seat limit is reached
  if (subscription) {
    if (
      !subscription.limits.unlimitedSeats &&
      subscription.seats.used >= subscription.seats.total
    ) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Seat limit reached. This workspace cannot accept more members. Please ask the owner to purchase more seats.'
      );
    }
  }

  // Update user with tenant info
  user.tenantId = invitation.tenantId;
  user.tenantRole = invitation.role;
  user.tenantPermissions =
    invitation.role === 'admin'
      ? ['manage_members', 'manage_content']
      : ['view_content'];
  await user.save();

  // Create TenantMember record if not already present
  // OPTIMIZATION: Added .lean() as existingMember is only checked for existence and not modified
  const existingMember = await TenantMember.findOne({
    userId,
    tenantId: invitation.tenantId,
  }).lean();

  if (!existingMember) {
    await TenantMember.create({
      userId,
      tenantId: invitation.tenantId,
      role: invitation.role,
      permissions:
        invitation.role === 'admin'
          ? ['manage_members', 'manage_content']
          : ['view_content'],
      status: 'active',
      invitedBy: invitation.invitedBy,
      joinedAt: new Date(),
    });
  }

  // Atomically increment tenant user count to prevent race conditions
  await Tenant.findByIdAndUpdate(
    invitation.tenantId,
    { $inc: { 'usage.usersCount': 1 } },
    { new: true } // Return the updated document (optional, but good practice)
  );

  // Add seat to subscription if paid plan
  try {
    if (
      subscription &&
      subscription.plan !== 'free' &&
      subscription.status === 'active'
    ) {
      await subscriptionService.addSeatToSubscription(subscription._id, userId);
      logger.info(
        `Added seat to subscription ${subscription._id} for user ${userId}`
      );
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
 * Cancels a pending tenant invitation.
 *
 * @description This service should be called by an authenticated user with administrative privileges
 * for the tenant to which the invitation belongs. The controller layer is responsible for permission enforcement.
 *
 * @param {string} invitationId - The ID of the invitation to cancel.
 * @returns {Promise<void>} A promise that resolves when the invitation is cancelled.
 * @throws {ApiError} If the invitation is not found (httpStatus.NOT_FOUND).
 * @throws {ApiError} If the invitation is not in 'pending' status (httpStatus.BAD_REQUEST).
 */
const cancelInvitation = async (invitationId) => {
  // No .lean() here as invitation object will be modified and saved later
  const invitation = await TenantInvitation.findById(invitationId);

  if (!invitation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invitation not found');
  }

  if (invitation.status !== 'pending') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Can only cancel pending invitations'
    );
  }

  await invitation.cancel();

  logger.info(`Invitation cancelled: ${invitationId}`);
};

/**
 * Resends a pending or pending_email tenant invitation.
 *
 * @description This service should be called by an authenticated user with administrative privileges
 * for the tenant to which the invitation belongs. The controller layer is responsible for permission enforcement.
 *
 * @param {string} invitationId - The ID of the invitation to resend.
 * @returns {Promise<void>} A promise that resolves when the invitation email has been resent.
 * @throws {ApiError} If the invitation is not found (httpStatus.NOT_FOUND).
 * @throws {ApiError} If the invitation is not in 'pending' or 'pending_email' status (httpStatus.BAD_REQUEST).
 * @throws {ApiError} If the invitation has expired (httpStatus.GONE).
 * @throws {ApiError} If the email sending fails (httpStatus.INTERNAL_SERVER_ERROR).
 */
const resendInvitation = async (invitationId) => {
  // No .lean() here as invitation object might be modified and saved later
  const invitation = await TenantInvitation.findById(invitationId);

  if (!invitation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invitation not found');
  }

  if (
    invitation.status !== 'pending' &&
    invitation.status !== 'pending_email'
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Can only resend pending invitations'
    );
  }

  if (invitation.isExpired()) {
    throw new ApiError(
      httpStatus.GONE,
      'Invitation has expired. Please create a new one'
    );
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
    logger.error(
      `Failed to resend invitation email for ${invitationId}:`,
      emailError
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to send invitation email. Please try again later.'
    );
  }
};

/**
 * Options for retrieving tenant invitations.
 * @typedef {Object} GetTenantInvitationsOptions
 * @property {number} [page=1] - The page number for pagination.
 * @property {number} [limit=20] - The number of invitations per page.
 * @property {'pending' | 'accepted' | 'expired' | 'cancelled' | 'pending_email'} [status='pending'] - Filter invitations by status.
 */

/**
 * Represents a paginated list of invitations.
 * @typedef {Object} PaginatedInvitations
 * @property {Array<Object>} invitations - An array of invitation objects.
 * @property {Object} pagination - Pagination details.
 * @property {number} pagination.page - The current page number.
 * @property {number} pagination.limit - The limit of items per page.
 * @property {number} pagination.total - The total number of invitations matching the query.
 * @property {number} pagination.pages - The total number of pages.
 */

/**
 * Retrieves a paginated list of invitations for a specific tenant.
 *
 * @description This service should be called by an authenticated user who is a member (typically an admin)
 * of the specified tenant. The controller layer is responsible for ensuring the user has permission to view invitations for this tenant.
 *
 * @param {string} tenantId - The ID of the tenant.
 * @param {GetTenantInvitationsOptions} [options] - Options for pagination and filtering.
 * @returns {Promise<PaginatedInvitations>} An object containing the list of invitations and pagination information.
 */
const getTenantInvitations = async (tenantId, options = {}) => {
  const { page = 1, limit = 20, status = 'pending' } = options;
  const skip = (page - 1) * limit;

  const query = { tenantId };
  if (status) {
    query.status = status;
  }

  // OPTIMIZATION: Added .lean() for read-only queries to improve performance
  const invitations = await TenantInvitation.find(query)
    .populate('invitedBy', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(); // .lean() should be applied after populate

  // TenantInvitation.countDocuments is already optimized
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

/**
 * A service object encapsulating all business logic for tenant invitations.
 * This includes creating, verifying, accepting, canceling, resending, and listing invitations.
 * @namespace tenantInvitationService
 */
export const tenantInvitationService = {
  createInvitation,
  verifyInvitationToken,
  acceptInvitation,
  cancelInvitation,
  resendInvitation,
  getTenantInvitations,
};