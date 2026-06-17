import mongoose from 'mongoose';
import Tenant from '../../modules/tenant/tenant.model.js';
import User from '../../modules/auth/auth.model.js';
import ScheduledWorkflow from '../../modules/workflow_automation/models/scheduledWorkflow.model.js';
import WorkflowExecution from '../../modules/workflow_automation/models/workflowExecution.model.js';
import Chatbot from '../../modules/chatbots/chatbot.model.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';

const planLimitsConfig = {
  free: {
    workflows: 2,
    executions: 10,
    team_members: 1,
    user: 1,
    chatbot: 1,
  },
  explore: {
    workflows: 10,
    executions: 100,
    team_members: 5,
    user: 5,
    chatbot: 5,
  },
  execute: {
    workflows: 50,
    executions: 1000,
    team_members: 20,
    user: 20,
    chatbot: 20,
  },
  command: {
    workflows: -1,
    executions: -1,
    team_members: -1,
    user: -1,
    chatbot: -1,
  },
  enterprise: {
    workflows: -1,
    executions: -1,
    team_members: -1,
    user: -1,
    chatbot: -1,
  }
};

/**
 * Middleware to check workspace/plan resource limits
 * Supports two calling patterns:
 * 1. Factory pattern: checkPlanLimits('workflows') -> returns middleware
 * 2. Direct pattern: checkPlanLimits(req, res, next) -> acts as 'team_members' limit check
 */
export const checkPlanLimits = (limitTypeOrReq, res, next) => {
  const runLimitCheck = async (limitType, req, res, next) => {
    try {
      const tenantId = req.tenantId || req.user?.currentTenantId || req.user?.tenantId;

      if (!tenantId) {
        return next(
          new ApiError(httpStatus.BAD_REQUEST, 'Tenant context is required to verify plan limits.')
        );
      }

      const tenant = req.tenant || await Tenant.findById(tenantId);
      if (!tenant) {
        return next(new ApiError(httpStatus.NOT_FOUND, 'Workspace/tenant not found.'));
      }

      const plan = tenant.plan || 'free';
      let limit = planLimitsConfig[plan]?.[limitType] !== undefined 
        ? planLimitsConfig[plan][limitType] 
        : -1;

      // Allow tenant-specific custom overrides from limits object
      if (limitType === 'team_members' || limitType === 'user') {
        if (tenant.limits?.maxUsers !== undefined) {
          limit = tenant.limits.maxUsers;
        }
      }

      // If limit is -1, it means unlimited
      if (limit === -1) {
        return next();
      }

      let count = 0;

      if (limitType === 'workflows') {
        // Count workflows for all users in the tenant
        const tenantUsers = await User.find({ tenantId: tenant._id }).select('_id');
        const userIds = tenantUsers.map((u) => u._id);
        count = await ScheduledWorkflow.countDocuments({
          userId: { $in: userIds },
          status: { $ne: 'deleted' },
        });
      } else if (limitType === 'executions') {
        // Count executions in the current calendar month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const tenantUsers = await User.find({ tenantId: tenant._id }).select('_id');
        const userIds = tenantUsers.map((u) => u._id);

        count = await WorkflowExecution.countDocuments({
          $or: [
            { workspaceId: tenant._id },
            { userId: { $in: userIds } }
          ],
          createdAt: { $gte: startOfMonth },
        });
      } else if (limitType === 'team_members' || limitType === 'user') {
        // Count total active users in the tenant
        count = await User.countDocuments({ tenantId: tenant._id });
      } else if (limitType === 'chatbot') {
        // Count active chatbots in the tenant
        count = await Chatbot.countDocuments({
          tenantId: tenant._id,
          isActive: true,
        });
      }

      if (count >= limit) {
        return next(
          new ApiError(
            httpStatus.UNPROCESSABLE_ENTITY,
            `Workspace plan limit for ${limitType} reached. Limit: ${limit}, Current: ${count}. Please upgrade your plan.`
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  if (typeof limitTypeOrReq === 'string') {
    // Factory pattern: return a middleware function
    return (req, res, next) => runLimitCheck(limitTypeOrReq, req, res, next);
  } else {
    // Direct pattern: execute immediately checking team_members limit
    const req = limitTypeOrReq;
    return runLimitCheck('team_members', req, res, next);
  }
};

export default checkPlanLimits;
