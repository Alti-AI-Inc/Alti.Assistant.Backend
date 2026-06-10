import httpStatus from 'http-status';
import crypto from 'crypto';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Chatbot from './chatbot.model.js';
import Tenant from '../tenant/tenant.model.js'; // Added for plan limit checks
import User from '../auth/auth.model.js'; // Added for workspace metrics and role management
import Invitation from '../tenant/tenantInvitation.model.js'; // Added for team invitations
import { emailService } from '../../../shared/email.service.js'; // Added for sending invitations
import { withTenantContext } from '../../helpers/tenantQuery.js';

// Recommended indexes for chatbot.model.js to improve query performance:
// 1. For `getChatbots` by userId and isActive, with sorting:
//    ChatbotSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
// 2. For `getChatbots` by shared tenant projects, with sorting:
//    ChatbotSchema.index({ isShared: 1, tenantId: 1, isActive: 1, createdAt: -1 });
// 3. For `getChatbotById`, `updateChatbot`, `deleteChatbot` (if _id is not the only filter):
//    ChatbotSchema.index({ _id: 1, tenantId: 1, isShared: 1, isActive: 1 });
// 4. For plan limit checks:
//    ChatbotSchema.index({ tenantId: 1, isActive: 1 });

/**
 * Creates a new chatbot for a specific user, enforcing plan limits.
 * Incorporates tenant context from the request object.
 *
 * @param {object} chatbotData - The data for the new chatbot.
 * @param {string} userId - The ID of the user creating the chatbot.
 * @param {import('express').Request} req - The Express request object, used for tenant context and plan validation.
 * @returns {Promise<object>} A promise that resolves to the created chatbot object.
 * @throws {ApiError} If plan limits are exceeded or an internal server error occurs.
 */
const createChatbot = async (chatbotData, userId, req) => {
  // A valid workspace context (tenant) is required to check subscription limits.
  if (!req || !req.tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A workspace context is required to create a chatbot.');
  }

  try {
    // Improvement: Check plan limits before creating a new chatbot.
    const tenant = await Tenant.findById(req.tenantId).populate('plan').lean();
    if (!tenant || !tenant.plan) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Invalid workspace or subscription plan.');
    }

    const chatbotLimit = tenant.plan.chatbotLimit || 0;
    const currentChatbotCount = await Chatbot.countDocuments({ tenantId: req.tenantId, isActive: true });

    if (currentChatbotCount >= chatbotLimit) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Chatbot limit reached. Please upgrade your plan to create more.');
    }

    // Proceed with chatbot creation
    const payload = { ...chatbotData, userId };
    const chatbot = new Chatbot(withTenantContext(req, payload));
    await chatbot.save();
    logger.info(`Chatbot created: ${chatbot._id} for user: ${userId} in tenant: ${req.tenantId}`);
    return chatbot.toObject();
  } catch (error) {
    logger.error('Error creating chatbot:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create chatbot');
  }
};

/**
 * Retrieves a list of chatbots for a given user.
 * If a tenant ID is present in the request, it also includes shared chatbots for that tenant.
 *
 * @param {string} userId - The ID of the user whose chatbots are to be retrieved.
 * @param {import('express').Request | null} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of chatbot objects.
 * @throws {ApiError} If there is an internal server error during chatbot retrieval.
 */
const getChatbots = async (userId, req = null) => {
  try {
    let query;
    if (req && req.tenantId) {
      // This query correctly fetches both the user's personal projects and shared team projects.
      query = {
        isActive: true,
        $or: [
          { userId },
          { isShared: true, tenantId: req.tenantId }
        ]
      };
    } else {
      // Fallback for users not in a tenant context, showing only their personal bots.
      query = { userId, isActive: true };
    }
    
    const chatbots = await Chatbot.find(query).sort({ createdAt: -1 }).lean();
    return chatbots;
  } catch (error) {
    logger.error('Error fetching chatbots:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch chatbots');
  }
};

/**
 * Retrieves a single chatbot by its ID.
 * Ensures the user has permission to view it (either as owner or as a member of the workspace for shared bots).
 *
 * @param {string} chatbotId - The ID of the chatbot to retrieve.
 * @param {string} userId - The ID of the user requesting the chatbot.
 * @param {import('express').Request | null} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<object>} A promise that resolves to the chatbot object.
 * @throws {ApiError} If the chatbot is not found or permission is denied.
 */
const getChatbotById = async (chatbotId, userId, req = null) => {
  try {
    // Improvement: Broaden query to allow managers/team members to access shared chatbots, not just the owner.
    const query = { _id: chatbotId, isActive: true };

    if (req && req.tenantId) {
      query.$or = [
        { userId }, // The user is the owner
        { isShared: true, tenantId: req.tenantId } // The bot is shared in the user's workspace
      ];
    } else {
      query.userId = userId; // Fallback for non-tenant context
    }

    const chatbot = await Chatbot.findOne(query).lean();
    if (!chatbot) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Chatbot not found or you do not have permission to view it.');
    }
    return chatbot;
  } catch (error) {
    logger.error(`Error fetching chatbot ${chatbotId}:`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch chatbot');
  }
};

/**
 * Updates an existing chatbot by its ID.
 * Ensures the user has permission to update it (as owner or for shared bots in their workspace).
 *
 * @param {string} chatbotId - The ID of the chatbot to update.
 * @param {string} userId - The ID of the user performing the update.
 * @param {object} updateData - The data to update the chatbot with.
 * @param {import('express').Request | null} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<object>} A promise that resolves to the updated chatbot object.
 * @throws {ApiError} If the chatbot is not found or permission is denied.
 */
const updateChatbot = async (chatbotId, userId, updateData, req = null) => {
  try {
    // Improvement: Allow managers/team members to update shared chatbots.
    const query = { _id: chatbotId, isActive: true };

    if (req && req.tenantId) {
      query.$or = [
        { userId },
        { isShared: true, tenantId: req.tenantId }
      ];
    } else {
      query.userId = userId;
    }

    const chatbot = await Chatbot.findOneAndUpdate(
      query,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!chatbot) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Chatbot not found or you do not have permission to update it.');
    }
    logger.info(`Chatbot updated: ${chatbotId}`);
    return chatbot;
  } catch (error) {
    logger.error(`Error updating chatbot ${chatbotId}:`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update chatbot');
  }
};

/**
 * Soft deletes a chatbot by setting its `isActive` status to `false`.
 * Ensures the user has permission to delete it.
 *
 * @param {string} chatbotId - The ID of the chatbot to delete.
 * @param {string} userId - The ID of the user performing the deletion.
 * @param {import('express').Request | null} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<object>} A promise that resolves to an object with a success message.
 * @throws {ApiError} If the chatbot is not found or permission is denied.
 */
const deleteChatbot = async (chatbotId, userId, req = null) => {
  try {
    // Improvement: Allow managers/team members to delete shared chatbots.
    const query = { _id: chatbotId };

    if (req && req.tenantId) {
      query.$or = [
        { userId },
        { isShared: true, tenantId: req.tenantId }
      ];
    } else {
      query.userId = userId;
    }

    const result = await Chatbot.findOneAndUpdate(
      query,
      { isActive: false }
    ).select('_id').lean();

    if (!result) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Chatbot not found or you do not have permission to delete it.');
    }
    logger.info(`Chatbot soft-deleted: ${chatbotId}`);
    return { message: 'Chatbot deleted successfully' };
  } catch (error) {
    logger.error(`Error deleting chatbot ${chatbotId}:`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to delete chatbot');
  }
};

// --- Manager Dashboard Features ---

/**
 * Retrieves key metrics for a given workspace (tenant).
 * Intended for manager/admin roles to display on a dashboard.
 *
 * @param {string} tenantId - The ID of the tenant/workspace.
 * @returns {Promise<object>} A promise that resolves to an object with workspace metrics.
 * @throws {ApiError} If the tenant is not found or an error occurs.
 */
const getWorkspaceMetrics = async (tenantId) => {
  try {
    const tenant = await Tenant.findById(tenantId).populate('plan').lean();
    if (!tenant) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Workspace not found.');
    }

    const chatbotCount = await Chatbot.countDocuments({ tenantId, isActive: true });
    const memberCount = await User.countDocuments({ tenantId, status: 'active' });

    return {
      plan: tenant.plan.name,
      limits: {
        chatbots: {
          current: chatbotCount,
          max: tenant.plan.chatbotLimit || 0,
        },
        members: {
          current: memberCount,
          max: tenant.plan.memberLimit || 0,
        },
      },
    };
  } catch (error) {
    logger.error(`Error fetching metrics for tenant ${tenantId}:`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch workspace metrics.');
  }
};

/**
 * Invites a new member to the workspace via email, checking plan limits.
 *
 * @param {string} tenantId - The ID of the tenant/workspace to invite to.
 * @param {string} inviterId - The ID of the user sending the invitation.
 * @param {object} invitationDetails - Details of the invitation.
 * @param {string} invitationDetails.email - The email of the person to invite.
 * @param {string} invitationDetails.role - The role to assign to the new member (e.g., 'member', 'manager').
 * @returns {Promise<object>} A promise that resolves to a success message.
 * @throws {ApiError} If limits are exceeded, user already exists, or an error occurs.
 */
const inviteTeamMember = async (tenantId, inviterId, { email, role }) => {
  try {
    const tenant = await Tenant.findById(tenantId).populate('plan').lean();
    if (!tenant) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Workspace not found.');
    }

    // 1. Check if member limit is reached
    const memberLimit = tenant.plan.memberLimit || 1;
    const currentMemberCount = await User.countDocuments({ tenantId, status: 'active' });
    if (currentMemberCount >= memberLimit) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Team member limit reached. Please upgrade your plan.');
    }

    // 2. Check if user is already in the team
    const existingUser = await User.findOne({ email, tenantId }).lean();
    if (existingUser) {
      throw new ApiError(httpStatus.CONFLICT, 'User with this email is already a member of this workspace.');
    }

    // 3. Check for an existing, valid invitation
    const existingInvite = await Invitation.findOne({ email, tenantId, status: 'pending' });
    if (existingInvite) {
      throw new ApiError(httpStatus.CONFLICT, 'An invitation has already been sent to this email address.');
    }

    // 4. Create invitation token and record
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitation = new Invitation({
      tenantId,
      email,
      role,
      invitedBy: inviterId,
      token: invitationToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24-hour expiry
    });
    await invitation.save();

    // 5. Send invitation email
    await emailService.sendWorkspaceInvitation({
      to: email,
      tenantName: tenant.name,
      invitationLink: `${process.env.FRONTEND_URL}/accept-invite?token=${invitationToken}`,
    });

    logger.info(`Invitation sent to ${email} for tenant ${tenantId} by user ${inviterId}`);
    return { message: 'Invitation sent successfully.' };
  } catch (error) {
    logger.error(`Error sending invitation for tenant ${tenantId}:`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to send invitation.');
  }
};

/**
 * Updates the role of a member within a workspace.
 * NOTE: Assumes authorization (e.g., only admins/managers can call this) is handled before this service is called.
 *
 * @param {string} tenantId - The ID of the tenant/workspace.
 * @param {string} memberId - The ID of the member whose role is to be updated.
 * @param {string} newRole - The new role to assign.
 * @returns {Promise<object>} A promise that resolves to the updated user object.
 * @throws {ApiError} If the user is not found or an error occurs.
 */
const updateMemberRole = async (tenantId, memberId, newRole) => {
  try {
    const validRoles = ['admin', 'manager', 'member', 'viewer'];
    if (!validRoles.includes(newRole)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid role specified.');
    }

    const userToUpdate = await User.findOne({ _id: memberId, tenantId });

    if (!userToUpdate) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Team member not found in this workspace.');
    }

    // Prevent changing the role of the workspace owner for security.
    if (userToUpdate.role === 'owner') {
        throw new ApiError(httpStatus.FORBIDDEN, 'The workspace owner role cannot be changed.');
    }

    userToUpdate.role = newRole;
    await userToUpdate.save();

    logger.info(`User ${memberId} role updated to ${newRole} in tenant ${tenantId}`);
    return userToUpdate.toObject();
  } catch (error) {
    logger.error(`Error updating role for user ${memberId} in tenant ${tenantId}:`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update member role.');
  }
};

/**
 * @typedef {object} ChatbotAndManagerService
 * @property {function(object, string, import('express').Request): Promise<object>} createChatbot
 * @property {function(string, import('express').Request | null): Promise<Array<object>>} getChatbots
 * @property {function(string, string, import('express').Request | null): Promise<object>} getChatbotById
 * @property {function(string, string, object, import('express').Request | null): Promise<object>} updateChatbot
 * @property {function(string, string, import('express').Request | null): Promise<object>} deleteChatbot
 * @property {function(string): Promise<object>} getWorkspaceMetrics
 * @property {function(string, string, {email: string, role: string}): Promise<object>} inviteTeamMember
 * @property {function(string, string, string): Promise<object>} updateMemberRole
 */

/**
 * Exports an object containing all chatbot and manager-related service functions.
 * @type {ChatbotAndManagerService}
 */
export const chatbotService = {
  // Chatbot CRUD
  createChatbot,
  getChatbots,
  getChatbotById,
  updateChatbot,
  deleteChatbot,
  // Manager Dashboard Features
  getWorkspaceMetrics,
  inviteTeamMember,
  updateMemberRole,
};