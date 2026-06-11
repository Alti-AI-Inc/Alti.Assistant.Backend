import auth from '../../middlewares/auth/auth.js';
import { User } from '../../modules/user/user.model.js';
import { Workspace } from '../../modules/workspace/workspace.model.js';

/**
 * Base authentication middleware.
 * Ensures a user is logged in with a valid token.
 * Use this for routes that require any authenticated user, regardless of role or workspace.
 * Example: GET /api/v1/users/me
 */
export const authMiddleware = auth();

/**
 * Middleware to enforce workspace plan limits.
 * Prevents actions that would add a new user (e.g., sending an invitation)
 * if the workspace's user limit has been reached.
 * This should be applied to routes like POST /api/v1/workspaces/:workspaceId/invitations
 * AFTER an authentication middleware has run.
 */
export const checkPlanLimits = async (req, res, next) => {
    try {
        // This middleware must run after an authentication middleware (authMiddleware or roleMiddleware)
        // so that req.user and req.user.workspaceId are available.
        if (!req.user || !req.user.workspaceId) {
            // This case should ideally be caught by the preceding auth middleware, but this is a safeguard.
            return res.status(401).json({ message: 'Unauthorized: Missing user or workspace context.' });
        }

        const { workspaceId } = req.user;

        // Find the workspace to get its plan details
        const workspace = await Workspace.findById(workspaceId).select('plan').lean();
        if (!workspace || !workspace.plan || typeof workspace.plan.userLimit !== 'number') {
            // If no plan is found or it's misconfigured, deny the action to be safe.
            return res.status(403).json({ message: 'Forbidden: Workspace plan information is missing or invalid.' });
        }

        const { userLimit } = workspace.plan;

        // A userLimit of -1 signifies an unlimited plan.
        if (userLimit === -1) {
            return next(); // Bypass the check for unlimited plans.
        }

        // Count the number of active users currently in the workspace.
        // A more robust solution might also count pending invitations if they count towards the limit.
        const currentUserCount = await User.countDocuments({ workspaceId: workspaceId, status: 'active' });

        if (currentUserCount >= userLimit) {
            return res.status(403).json({
                message: `Forbidden: Your workspace has reached its user limit of ${userLimit}. Please upgrade your plan to add more members.`,
                code: 'PLAN_LIMIT_REACHED'
            });
        }

        next();
    } catch (error) {
        console.error('Plan Limit Middleware Error:', error);
        return res.status(500).json({ message: 'An internal error occurred while verifying your plan limits.' });
    }
};

/**
 * Advanced authorization middleware for role and tenancy-based access control.
 * This is a critical security control for the multi-tenant architecture.
 *
 * It performs the following checks in order:
 * 1. Authenticates the user using the base `auth()` middleware to verify the JWT.
 * 2. Allows 'super_admin' to bypass all subsequent checks for platform-wide access.
 * 3. Validates if the authenticated user's role is in the list of `allowedRoles`.
 * 4. Enforces strict tenant boundaries by ensuring users (including 'admin' and 'manager')
 *    can only operate within their own workspace context. It checks `req.params.workspaceId`
 *    against the user's `workspaceId` from their token.
 * 5. Enforces hierarchical boundaries and prevents privilege escalation. For instance, a 'manager'
 *    can only modify users they directly manage and cannot promote them to a higher role.
 *
 * CRITICAL: This middleware prevents Insecure Direct Object Reference (IDOR) vulnerabilities
 * by ensuring users cannot access resources outside their permitted scope, even if they guess the ID.
 *
 * @param {...string} allowedRoles - A list of roles allowed to access the route (e.g., 'admin', 'manager', 'user').
 *                                   If no roles are provided, it only checks for authentication and tenancy.
 */
export const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    // Step 1: Use the base authentication middleware to verify the JWT and attach the user to the request.
    // We wrap this in a custom middleware to add our more granular authorization logic.
    auth()(req, res, async (err) => {
      try {
        if (err) {
          // This could be an error from the underlying passport strategy (e.g., malformed JWT).
          return res.status(401).json({ message: 'Authentication error.' });
        }
        if (!req.user) {
          return res.status(401).json({ message: 'Unauthorized: Invalid or missing token.' });
        }

        const { role: userRole, workspaceId: userWorkspaceId, id: userId } = req.user;

        // Step 2: Super Admin Bypass
        // The 'super_admin' role has unrestricted access and bypasses all tenancy and hierarchy checks.
        if (userRole === 'super_admin') {
          return next();
        }

        // Step 3: Role-Based Access Control (RBAC)
        // Check if the user's role is in the list of allowed roles for this route.
        if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
          return res.status(403).json({ message: 'Forbidden: You do not have the required permissions for this action.' });
        }

        // Step 4: Tenant Context Boundary Enforcement (Multi-tenancy Security)
        // All roles other than 'super_admin' must be scoped to a workspace.
        if (!userWorkspaceId) {
            return res.status(403).json({ message: 'Forbidden: Your account is not associated with a workspace.' });
        }

        // If the route is parameterized with a workspaceId, we MUST verify that the user belongs to that workspace.
        // This prevents IDOR attacks where a user from workspace A tries to access workspace B's data.
        const targetWorkspaceId = req.params.workspaceId;
        if (targetWorkspaceId && targetWorkspaceId.toString() !== userWorkspaceId.toString()) {
          return res.status(403).json({ message: 'Forbidden: You do not have access to this workspace.' });
        }

        // Step 5: Hierarchical Integrity and Privilege Escalation Checks
        // This ensures managers can only affect users within their own hierarchy.
        const targetUserId = req.params.userId;
        if (targetUserId && targetUserId.toString() !== userId.toString()) {
            // If a user is trying to access/modify another user, we must verify their authority.
            // An 'admin' can access any user within their own workspace. We don't need a special check here
            // because the workspace check above already confines them.

            // A 'manager' has more restricted access.
            if (userRole === 'manager') {
                const targetUser = await User.findById(targetUserId).select('managerId workspaceId').lean();
                if (!targetUser) {
                    return res.status(404).json({ message: 'Target user not found.' });
                }
                // The target user must be in the same workspace AND be managed by the current manager.
                if (targetUser.workspaceId.toString() !== userWorkspaceId.toString() || targetUser.managerId?.toString() !== userId.toString()) {
                    return res.status(403).json({ message: 'Forbidden: You can only access users directly assigned to you.' });
                }

                // Privilege Escalation Prevention: A manager cannot promote a user to a role
                // equal to or higher than their own. This check inspects the request body.
                const newRole = req.body.role;
                if (newRole && (newRole === 'admin' || newRole === 'manager')) {
                    return res.status(403).json({ message: 'Forbidden: Managers cannot assign "admin" or "manager" roles.' });
                }
            }
        }

        // If all checks pass, proceed to the next middleware or controller.
        next();
      } catch (error) {
        // Catch any unexpected errors during the authorization process (e.g., database connection issue).
        console.error('Authorization Middleware Error:', error);
        return res.status(500).json({ message: 'An internal error occurred during authorization.' });
      }
    });
  };
};