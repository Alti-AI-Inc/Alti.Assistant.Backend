import Tenant from '../modules/tenant/tenant.model.js';
import User from '../modules/auth/auth.model.js';
import WorkflowExecution from '../modules/workflow_automation/models/workflowExecution.model.js';

const planLimitsConfig = {
  free: {
    workflowExecution: 10,
  },
  explore: {
    workflowExecution: 100,
  },
  execute: {
    workflowExecution: 1000,
  },
  command: {
    workflowExecution: -1,
  },
  enterprise: {
    workflowExecution: -1,
  }
};

/**
 * Checks if a workspace is allowed to execute a feature based on its current plan limits.
 * @param {string} workspaceId - The ID of the workspace/tenant.
 * @param {string} featureName - The name of the feature (e.g. 'workflowExecution').
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
export const checkUsageAndPermissions = async (workspaceId, featureName) => {
  try {
    const tenant = await Tenant.findById(workspaceId);
    if (!tenant) {
      return { allowed: false, reason: 'Workspace/tenant not found.' };
    }

    if (tenant.status === 'suspended') {
      return { allowed: false, reason: 'Workspace is suspended. Please contact support.' };
    }

    if (tenant.status === 'cancelled') {
      return { allowed: false, reason: 'Workspace has been cancelled. Please reactivate.' };
    }

    if (featureName === 'workflowExecution') {
      const plan = tenant.plan || 'free';
      const limit = planLimitsConfig[plan]?.workflowExecution ?? -1;

      if (limit === -1) {
        return { allowed: true };
      }

      // Count monthly executions
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const tenantUsers = await User.find({ tenantId: tenant._id }).select('_id');
      const userIds = tenantUsers.map((u) => u._id);

      const count = await WorkflowExecution.countDocuments({
        $or: [
          { workspaceId: tenant._id },
          { userId: { $in: userIds } }
        ],
        createdAt: { $gte: startOfMonth },
      });

      if (count >= limit) {
        return {
          allowed: false,
          reason: `Monthly workflow execution limit reached (${limit}). Please upgrade your plan.`
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    return { allowed: false, reason: `Error checking plan limits: ${error.message}` };
  }
};

export default {
  checkUsageAndPermissions,
};
