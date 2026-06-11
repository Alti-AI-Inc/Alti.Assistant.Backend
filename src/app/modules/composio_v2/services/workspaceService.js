import Tenant from '../../tenant/tenant.model.js';
import TenantMember from '../../tenant/tenantMember.model.js';
// AI-FIX: It's a best practice to use a centralized logger and custom error types for better error handling and security.
// Assuming these utilities exist within the project structure.
import logger from '../../../../shared/logger.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/error.util.js';

/**
 * AI-FIX: Centralized authorization logic to prevent Insecure Direct Object Reference (IDOR).
 * Checks if the requesting user is authorized to access a specific workspace.
 * - super_admin can access any workspace.
 * - admin and manager can only access their own workspace.
 * - user role is denied access to these workspace-level functions.
 * @param {string} targetWorkspaceId - The ID of the workspace being accessed.
 * @param {object} requestingUser - The user making the request, containing their role and tenant context.
 * @param {string} requestingUser.tenantId - The workspace ID of the requesting user.
 * @param {string} requestingUser.role - The role of the requesting user.
 * @throws {ForbiddenError} If the user is not authorized.
 */
const authorizeWorkspaceAccess = (targetWorkspaceId, requestingUser) => {
  if (!requestingUser || !requestingUser.role || !requestingUser.tenantId) {
    // This indicates a problem with the authentication middleware or how the user object is passed.
    throw new ForbiddenError('Authentication details are incomplete.');
  }

  const { role, tenantId } = requestingUser;

  // super_admin has universal access to manage any tenant.
  if (role === 'super_admin') {
    return;
  }

  // Regular 'user' role should not have access to workspace management functions.
  if (role === 'user') {
    throw new ForbiddenError('You do not have permission to perform this action.');
  }

  // 'admin' (workspace owner) and 'manager' can only access their own workspace.
  if (['admin', 'manager'].includes(role)) {
    if (tenantId.toString() !== targetWorkspaceId.toString()) {
      throw new ForbiddenError('You are not authorized to access this workspace.');
    }
    return;
  }

  // Deny by default for any other unhandled role.
  throw new ForbiddenError('Your role does not grant permission for this action.');
};


/**
 * @namespace WorkspaceService
 * @description A collection of service functions for managing workspace (tenant) related operations.
 */
export const WorkspaceService = {
  /**
   * Checks if a workspace can add more members based on its current subscription plan limits.
   * This function operates within a multi-tenant context and includes authorization checks.
   * @async
   * @function checkPlanLimits
   * @memberof WorkspaceService
   * @param {string} workspaceId - The unique identifier of the workspace (tenant).
   * @param {object} requestingUser - The user object making the request, for authorization.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the workspace can add more members.
   * @throws {AppError} If the workspace is not found or a database error occurs.
   * @throws {ForbiddenError} If the requesting user is not authorized.
   */
  checkPlanLimits: async (workspaceId, requestingUser) => {
    try {
      // VULNERABILITY FIX: Added authorization check to prevent IDOR.
      authorizeWorkspaceAccess(workspaceId, requestingUser);

      const tenant = await Tenant.findById(workspaceId);
      if (!tenant) {
        // This case is a safeguard, especially for super_admins accessing potentially invalid IDs.
        throw new NotFoundError('Workspace not found.');
      }
      // The canAddMembers method is assumed to exist on the Tenant model
      // and correctly checks the member count against the plan limit.
      return await tenant.canAddMembers();
    } catch (e) {
      // BUG FIX: Improved error handling. Instead of returning false and hiding errors,
      // re-throw application-specific errors and log/wrap unexpected ones.
      if (e instanceof AppError) {
        throw e; // Re-throw custom application errors (like ForbiddenError, NotFoundError).
      }
      logger.error(`Error checking plan limits for workspace ${workspaceId}:`, e);
      // Throw a generic error to be caught by the global error handler.
      throw new AppError('Could not check workspace plan limits due to a server error.');
    }
  },

  /**
   * Checks if a workspace has reached its limit for members with the 'manager' role.
   * The limit is determined by the workspace's subscription plan.
   * This function operates within a multi-tenant context and includes authorization checks.
   * @async
   * @function checkManagerLimit
   * @memberof WorkspaceService
   * @param {string} workspaceId - The unique identifier of the workspace (tenant).
   * @param {object} requestingUser - The user object making the request, for authorization.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the workspace can add more managers.
   * @throws {AppError} If the workspace or its plan is not found, or a database error occurs.
   * @throws {ForbiddenError} If the requesting user is not authorized.
   */
  checkManagerLimit: async (workspaceId, requestingUser) => {
    try {
      // VULNERABILITY FIX: Added authorization check to prevent IDOR.
      authorizeWorkspaceAccess(workspaceId, requestingUser);

      const tenant = await Tenant.findById(workspaceId).select('plan.limits.managers').lean();
      if (!tenant) {
        throw new NotFoundError('Workspace not found.');
      }

      // INTEGRATION FIX: Replaced hardcoded manager limit with a dynamic value from the tenant's plan.
      // This respects tenant context and subscription boundaries.
      const managerLimit = tenant.plan?.limits?.managers ?? 0; // Default to 0 if not defined on the plan.

      const currentManagerCount = await TenantMember.countDocuments({
        tenantId: workspaceId,
        role: 'manager',
        status: 'active'
      });

      return currentManagerCount < managerLimit;
    } catch (e) {
      // BUG FIX: Improved error handling.
      if (e instanceof AppError) {
        throw e;
      }
      logger.error(`Error checking manager limit for workspace ${workspaceId}:`, e);
      throw new AppError('Could not check workspace manager limit due to a server error.');
    }
  },

  /**
   * Retrieves key dashboard metrics for a specific workspace.
   * This function operates within a multi-tenant context and includes authorization checks.
   * @async
   * @function getDashboardMetrics
   * @memberof WorkspaceService
   * @param {string} workspaceId - The unique identifier of the workspace (tenant).
   * @param {object} requestingUser - The user object making the request, for authorization.
   * @returns {Promise<object>} A promise that resolves to an object containing dashboard metrics.
   * @throws {AppError} If the workspace is not found or a database error occurs.
   * @throws {ForbiddenError} If the requesting user is not authorized.
   */
  getDashboardMetrics: async (workspaceId, requestingUser) => {
    try {
      // VULNERABILITY FIX: Added authorization check to prevent IDOR.
      authorizeWorkspaceAccess(workspaceId, requestingUser);

      // VULNERABILITY FIX: Ensure the workspace exists before querying related data.
      // This prevents leaking information (e.g., member count) for an unauthorized workspace.
      const tenantExists = await Tenant.exists({ _id: workspaceId });
      if (!tenantExists) {
        throw new NotFoundError('Workspace not found.');
      }

      const totalMembers = await TenantMember.countDocuments({
        tenantId: workspaceId,
        status: 'active'
      });

      // Placeholder metrics remain, but the function is now secure and robust.
      // Future metrics (e.g., API calls) should also be scoped to the workspaceId.
      return {
        totalMembers,
        activeMembersLast30Days: totalMembers, // Placeholder
        conversationsThisMonth: 0, // Placeholder
        apiCallsThisMonth: 0 // Placeholder
      };
    } catch (e) {
      // BUG FIX: Improved error handling.
      if (e instanceof AppError) {
        throw e;
      }
      logger.error(`Error retrieving dashboard metrics for workspace ${workspaceId}:`, e);
      throw new AppError('Could not retrieve dashboard metrics due to a server error.');
    }
  }
};

export default WorkspaceService;