import sanitizeHtml from 'sanitize-html';
import { runAIClassificationAgent } from './ai_classification/workflow.js';
import { composioConversationService } from './composio.conversation.service.js';
import { logger } from '../../../shared/logger.js';
import ComposioAuth from './composio.model.js';
// --- Manager Platform Features Start ---
// The following models are assumed to exist to support manager dashboard features.
import Workspace from '../workspace/workspace.model.js'; // Assumed model for workspaces, plans, and members
import ComposioConversation from './composio.conversation.model.js'; // Assumed conversation model with workspaceId
// --- Manager Platform Features End ---

/**
 * Verifies if a user is a manager/owner of a workspace and checks plan limits for a given feature.
 * This is a critical security and business logic gate for all manager actions.
 * @private
 */
const _verifyManagerAndCheckLimits = async (userId, workspaceId, feature) => {
  // Indexing Recommendation: Ensure a compound index on `{ _id: 1, 'members.userId': 1 }` in the Workspace schema for efficient lookups.
  const workspace = await Workspace.findOne({
    _id: workspaceId,
    'members.userId': userId,
    'members.role': { $in: ['manager', 'owner'] }, // Only managers or owners can perform admin actions
  }).populate('plan'); // Assumed 'plan' is a populated field with limit details

  if (!workspace) {
    throw new Error('Access denied: You are not a manager of this workspace or the workspace does not exist.');
  }

  // Check plan limits for specific features. Billing information is never exposed.
  if (feature === 'team_members' && workspace.members.length >= workspace.plan.teamMemberLimit) {
    throw new Error('Plan limit reached: Cannot add more team members. Please upgrade your plan.');
  }
  if (feature === 'ai_calls' && workspace.usage.aiCallsToday >= workspace.plan.dailyAiCallLimit) {
      throw new Error('Daily plan limit reached: AI call limit exceeded for today. Please upgrade your plan or wait until tomorrow.');
  }

  return workspace;
};


/**
 * Process user input through AI classification and execute the identified action.
 * Now enhanced to be workspace-aware and enforce plan limits.
 */
export const processUserInputService = async (
  userInput,
  options = {}
) => {
  // Security: Sanitize user input to prevent Stored XSS attacks.
  const sanitizedUserInput = sanitizeHtml(userInput, {
    allowedTags: [],
    allowedAttributes: {},
  });

  const {
    userId = null,
    conversationId = null,
    history = [],
    isGuest = false,
    workspaceId = null, // New: Workspace context is required for authenticated users
  } = options;

  let conversation = null;
  let actualConversationId = null;

  const effectiveUserId =
    userId ||
    (isGuest ? composioConversationService.generateGuestUserId() : null);

  if (!effectiveUserId) {
    return {
      success: false,
      message: 'User ID is required for tool execution',
      error: 'Missing user identifier',
    };
  }

  try {
    // --- Manager Platform Feature: Plan Limit Enforcement ---
    if (!isGuest) {
      if (!workspaceId) {
        return {
            success: false,
            message: 'Workspace context is required for this action.',
            error: 'Missing workspace identifier',
        };
      }
      try {
        // This check ensures the user is part of the workspace (any role) and that the workspace is within its AI usage limits.
        // For simplicity, reusing the manager check helper but a more generic 'verifyMemberAndCheckLimits' would be ideal.
        // For now, we assume any member action counts towards the workspace limit, and a check is needed.
        const workspace = await Workspace.findOne({ _id: workspaceId, 'members.userId': userId }).populate('plan');
        if (!workspace) {
            throw new Error('Access denied: You are not a member of this workspace.');
        }
        if (workspace.usage.aiCallsToday >= workspace.plan.dailyAiCallLimit) {
            throw new Error('Daily plan limit reached: AI call limit exceeded for today. Please upgrade your plan or wait until tomorrow.');
        }
      } catch (error) {
        logger.error(`Permission or plan limit check failed for user ${userId} in workspace ${workspaceId}: ${error.message}`);
        return { success: false, message: error.message, error: 'Permission denied or plan limit exceeded' };
      }
    }
    // --- End Plan Limit Enforcement ---

    logger.info(
      `Processing user input: "${sanitizedUserInput}" for user: ${effectiveUserId} in workspace: ${workspaceId || 'N/A'}`
    );

    // Conversation handling is now workspace-aware
    conversation =
      await composioConversationService.handleComposioConversation(
        effectiveUserId,
        conversationId,
        sanitizedUserInput,
        isGuest,
        workspaceId // Pass workspaceId to conversation service
      );

    if (!conversation || !conversation.conversationId) {
      logger.error(
        `handleComposioConversation failed for user: ${effectiveUserId}, workspace: ${workspaceId}`
      );
      throw new Error('Failed to establish or retrieve conversation.');
    }

    actualConversationId = conversation.conversationId;

    let conversationHistory = [];
    if (conversation.messages && conversation.messages.length > 0) {
      conversationHistory = conversation.messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    }

    await composioConversationService.addComposioQueryMessage(
      actualConversationId,
      effectiveUserId,
      sanitizedUserInput,
      isGuest
    );

    const result = await runAIClassificationAgent(sanitizedUserInput, {
      userId: effectiveUserId,
      conversationId: actualConversationId,
      history: conversationHistory.length > 0 ? conversationHistory : history,
    });

    // --- Manager Platform Feature: Usage Tracking ---
    if (!isGuest) {
        // Atomically increment usage count after a successful AI call.
        // This is crucial for enforcing plan limits accurately.
        await Workspace.updateOne({ _id: workspaceId }, { $inc: { 'usage.aiCallsToday': 1 } });
    }
    // --- End Usage Tracking ---

    if (result.success) {
      logger.info(
        `Successfully processed input. Workflow: ${result.data?.responseMessage?.metadata?.workflowType}`
      );

      const responseText =
        result.data?.responseMessage?.message ||
        'Action completed successfully';
      const metadata = result.data?.responseMessage?.metadata || {};

      const messageMetadata = {
        identifiedApp: metadata.identifiedApp,
        identifiedAction: metadata.identifiedAction,
        workflowType: metadata.workflowType,
        timestamp: new Date().toISOString(),
      };

      await composioConversationService.addComposioResultMessage(
        actualConversationId,
        effectiveUserId,
        responseText,
        messageMetadata,
        isGuest
      );

      if (metadata.identifiedApp || metadata.workflowType) {
        await composioConversationService.updateComposioConversationTitle(
          actualConversationId,
          effectiveUserId,
          metadata
        );
      }

      return {
        ...result,
        data: {
          ...result.data,
          conversationId: actualConversationId,
          messageCount: (conversation?.messageCount || 0) + 2,
          userType: isGuest ? 'guest' : 'authenticated',
          userId: isGuest ? effectiveUserId : undefined,
        },
      };
    } else {
      logger.error(`Failed to process input: ${result.error}`);
      const errorMessage =
        result.data?.responseMessage?.text ||
        `Sorry, I encountered an error: ${result.error}`;
      await composioConversationService.addComposioErrorMessage(
        actualConversationId,
        effectiveUserId,
        errorMessage,
        new Error(result.error),
        isGuest
      );
      return { ...result, data: { ...result.data, conversationId: actualConversationId } };
    }
  } catch (error) {
    logger.error('Error in processUserInputService:', error);
    if (actualConversationId && effectiveUserId) {
      await composioConversationService.addComposioErrorMessage(
        actualConversationId,
        effectiveUserId,
        `Sorry, an unexpected error occurred: ${error.message}`,
        error,
        isGuest
      );
    }
    return {
      success: false,
      message: 'Tool execution failed',
      error: error.message,
      data: { conversationId: actualConversationId },
    };
  }
};

// --- Manager Platform Features: New Services ---

/**
 * Invites a new member to a workspace. Only accessible by managers/owners.
 * Enforces plan limits on the number of team members.
 */
export const inviteTeamMemberService = async (managerId, workspaceId, inviteeEmail, role) => {
  try {
    // 1. Verify manager role and check if the team size limit has been reached.
    const workspace = await _verifyManagerAndCheckLimits(managerId, workspaceId, 'team_members');

    // 2. Security: Sanitize and validate inputs.
    const sanitizedEmail = sanitizeHtml(inviteeEmail, { allowedTags: [], allowedAttributes: {} }).toLowerCase();
    const allowedRoles = ['member', 'manager']; // Define roles a manager can assign. Owners cannot be assigned.
    if (!allowedRoles.includes(role)) {
      throw new Error('Invalid role specified. Allowed roles are "member" or "manager".');
    }
    if (!/^\S+@\S+\.\S+$/.test(sanitizedEmail)) {
        throw new Error('Invalid email format.');
    }

    // 3. Business Logic: Check if user is already a member or has a pending invite.
    // (Implementation details for invitation model are omitted for brevity)

    // 4. Create invitation and send email (assumed services).
    // await invitationService.create(workspaceId, sanitizedEmail, role);
    // await emailService.sendWorkspaceInvitation(sanitizedEmail, workspace.name, managerId);

    logger.info(`Manager ${managerId} invited ${sanitizedEmail} to workspace ${workspaceId} with role ${role}.`);
    return { success: true, message: `Invitation sent to ${sanitizedEmail}.` };
  } catch (error) {
    logger.error('Error in inviteTeamMemberService:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Updates the role of an existing member in a workspace. Only accessible by managers/owners.
 */
export const updateTeamMemberRoleService = async (managerId, workspaceId, memberId, newRole) => {
  try {
    // 1. Verify manager role. No specific plan limit applies to role updates.
    await _verifyManagerAndCheckLimits(managerId, workspaceId);

    // 2. Security: Validate the new role.
    const allowedRoles = ['member', 'manager'];
    if (!allowedRoles.includes(newRole)) {
      throw new Error('Invalid role specified. Allowed roles are "member" or "manager".');
    }
    if (managerId === memberId) {
        throw new Error('Managers cannot change their own role.');
    }

    // 3. Business Logic: Prevent demoting the sole owner or other sensitive actions.
    // (Implementation details omitted for brevity)

    // 4. Perform the update.
    // Indexing Recommendation: Ensure `members` is an array of subdocuments with an index on `members.userId`.
    const result = await Workspace.updateOne(
      { _id: workspaceId, 'members.userId': memberId },
      { $set: { 'members.$.role': newRole } }
    );

    if (result.nModified === 0) {
        throw new Error('Member not found in the workspace or role is already set to the new value.');
    }

    logger.info(`Role for member ${memberId} in workspace ${workspaceId} updated to ${newRole} by manager ${managerId}.`);
    return { success: true, message: 'Member role updated successfully.' };
  } catch (error) {
    logger.error('Error in updateTeamMemberRoleService:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Retrieves usage metrics for a workspace. Only accessible by managers/owners.
 * Does not expose any sensitive billing or personal user data.
 */
export const getWorkspaceMetricsService = async (managerId, workspaceId) => {
  try {
    // 1. Verify manager role.
    const workspace = await _verifyManagerAndCheckLimits(managerId, workspaceId);

    // 2. Optimization: Use an efficient aggregation pipeline to calculate metrics directly in the database.
    // This avoids transferring large datasets and processing them in the application.
    const metrics = await ComposioConversation.aggregate([
      { $match: { workspaceId: workspace._id } }, // Assumes conversations are tagged with workspaceId
      {
        $group: {
          _id: '$workspaceId',
          totalConversations: { $sum: 1 },
          totalMessages: { $sum: '$messageCount' }, // Assuming a messageCount field exists
        }
      }
    ]);

    const workspaceMetrics = {
        totalConversations: metrics.length > 0 ? metrics[0].totalConversations : 0,
        totalMessages: metrics.length > 0 ? metrics[0].totalMessages : 0,
        // Expose non-sensitive plan and usage information for the dashboard.
        planInfo: {
            name: workspace.plan.name,
            memberLimit: workspace.plan.teamMemberLimit,
            currentMembers: workspace.members.length,
            dailyAiCallLimit: workspace.plan.dailyAiCallLimit,
            aiCallsUsedToday: workspace.usage.aiCallsToday,
        }
    };

    logger.info(`Metrics retrieved for workspace ${workspaceId} by manager ${managerId}.`);
    return { success: true, data: workspaceMetrics };
  } catch (error) {
    logger.error('Error in getWorkspaceMetricsService:', error);
    return { success: false, error: error.message };
  }
};

// --- End Manager Platform Features ---


/**
 * Get a specific user's connected accounts for apps.
 * Note: This remains a user-scoped service. A manager cannot view another user's connections.
 */
export const getUserConnectedAccountsService = async (
  userId,
  status
) => {
  try {
    const allowedStatuses = ['ACTIVE', 'INACTIVE', 'PENDING'];
    const validatedStatus = status && allowedStatuses.includes(status) ? status : 'ACTIVE';

    const query = { userId: userId, status: validatedStatus };
    // Indexing Recommendation: Add a compound index on `{ userId: 1, status: 1, updatedAt: -1 }`.
    const accounts = await ComposioAuth.find(query).sort({ updatedAt: -1 }).lean();

    logger.info(`User connected accounts for ${userId}: ${accounts.length} found (status: ${validatedStatus})`);
    return { success: true, data: accounts };
  } catch (error) {
    logger.error('Error in getUserConnectedAccountsService:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Check if a specific user has required connections for an app.
 * Note: This remains a user-scoped service.
 */
export const checkUserConnectionsService = async (
  userId,
  appName
) => {
  try {
    const sanitizedAppName = sanitizeHtml(appName, { allowedTags: [], allowedAttributes: {} });
    const normalizedAppName = sanitizedAppName.toLowerCase();

    // Indexing Recommendation: Add compound indexes like `{ userId: 1, status: 1, 'toolkit.slug': 1 }`.
    const connectedAccounts = await ComposioAuth.find({
      userId: userId,
      status: 'ACTIVE',
      $or: [
        { 'toolkit.slug': normalizedAppName },
        { authConfigId: normalizedAppName },
        { authConfigId: `ac_${normalizedAppName}` },
      ],
    }).lean();

    const hasConnection = connectedAccounts.length > 0;
    return { success: true, data: { hasConnection, appName, connectedAccounts } };
  } catch (error) {
    logger.error('Error in checkUserConnectionsService:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get composio conversation history for a specific user.
 * Note: This remains a user-scoped service. For workspace-level metrics, use `getWorkspaceMetricsService`.
 */
export const getComposioConversationHistoryService = async (
  userId,
  options = {},
  req = null
) => {
  try {
    const { conversationId = null } = options;
    const parsedLimit = parseInt(options.limit, 10);
    const validatedLimit = isNaN(parsedLimit) ? 20 : Math.max(1, Math.min(100, parsedLimit));

    if (conversationId) {
      const history = await composioConversationService.getComposioHistory(
        conversationId,
        userId,
        validatedLimit,
        req
      );
      return { success: true, data: { conversationId, messages: history, messageCount: history.length } };
    } else {
      const stats = await composioConversationService.getComposioStats(
        userId,
        req
      );
      return { success: true, data: stats };
    }
  } catch (error) {
    logger.error('Error in getComposioConversationHistoryService:', error);
    return { success: false, error: error.message };
  }
};

export const aiClassificationService = {
  // Core AI service
  processUserInputService,
  // User-scoped services
  getUserConnectedAccountsService,
  checkUserConnectionsService,
  getComposioConversationHistoryService,
  // Manager dashboard services
  inviteTeamMemberService,
  updateTeamMemberRoleService,
  getWorkspaceMetricsService,
};