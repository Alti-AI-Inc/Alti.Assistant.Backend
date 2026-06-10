import mongoose from 'mongoose';
import Tenant from '../../tenant/tenant.model.js';
import User from '../../auth/auth.model.js';
import ScheduledWorkflow from '../../composio_v2/models/scheduledWorkflow.model.js';

const planLimitsConfig = {
  free: {
    workflows: 2,
    chatbot: 1,
  },
  explore: {
    workflows: 10,
    chatbot: 5,
  },
  execute: {
    workflows: 50,
    chatbot: 20,
  },
  command: {
    workflows: -1,
    chatbot: -1,
  },
  enterprise: {
    workflows: -1,
    chatbot: -1,
  }
};

/**
 * Checks if a workspace can create a new workflow.
 * @param {string} workspaceId - The ID of the workspace/tenant.
 * @returns {Promise<{ allowed: boolean, message?: string }>}
 */
export const canCreateWorkflow = async (workspaceId) => {
  try {
    const tenant = await Tenant.findById(workspaceId);
    if (!tenant) {
      return { allowed: false, message: 'Workspace/tenant not found.' };
    }

    if (tenant.status === 'suspended') {
      return { allowed: false, message: 'Workspace is suspended. Please contact support.' };
    }

    const plan = tenant.plan || 'free';
    const limit = planLimitsConfig[plan]?.workflows ?? -1;

    if (limit === -1) {
      return { allowed: true };
    }

    // Count workflows for all users in the tenant
    const tenantUsers = await User.find({ tenantId: tenant._id }).select('_id');
    const userIds = tenantUsers.map((u) => u._id);

    const count = await ScheduledWorkflow.countDocuments({
      userId: { $in: userIds },
      status: { $ne: 'deleted' },
    });

    if (count >= limit) {
      return {
        allowed: false,
        message: `Workflow creation limit reached (${limit}) for your ${plan} plan. Please upgrade your plan to create more workflows.`
      };
    }

    return { allowed: true };
  } catch (error) {
    return { allowed: false, message: `Error checking workflow creation limits: ${error.message}` };
  }
};

/**
 * Checks if a conversation can be continued.
 * @param {string} workspaceId - The ID of the workspace/tenant.
 * @param {string} conversationId - The ID of the conversation.
 * @returns {Promise<{ allowed: boolean, message?: string }>}
 */
export const canContinueConversation = async (workspaceId, conversationId) => {
  try {
    const tenant = await Tenant.findById(workspaceId);
    if (!tenant) {
      return { allowed: false, message: 'Workspace/tenant not found.' };
    }

    if (tenant.status === 'suspended') {
      return { allowed: false, message: 'Workspace is suspended. Please contact support.' };
    }

    const plan = tenant.plan || 'free';
    
    // For free plan, restrict to 15 messages per conversation as a safety cap
    if (plan === 'free') {
      const ChatHistory = mongoose.model('Chat-History');
      const count = await ChatHistory.countDocuments({ conversationId });
      if (count >= 15) {
        return {
          allowed: false,
          message: 'Free plan message limit per conversation reached (15). Please upgrade to continue.'
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    // Fail open if chat history model fails to resolve or count
    return { allowed: true };
  }
};

export const limitService = {
  canCreateWorkflow,
  canContinueConversation,
};

export default limitService;
