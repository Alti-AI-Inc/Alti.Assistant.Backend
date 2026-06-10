import express from 'express';
import { composioController } from './composio.controller.js';
// Import necessary middleware and a new controller for manager features.
// These are assumed to exist in the project structure.
import { authMiddleware, roleMiddleware } from '../auth/auth.middleware.js';
import { planLimitMiddleware } from '../billing/planLimit.middleware.js';
import { managerController } from '../manager/manager.controller.js';

const router = express.Router();

// Utility to wrap async controller functions for error handling.
// This ensures that any errors thrown by async functions are caught
// and passed to Express's error handling middleware, preventing
// unhandled promise rejections from crashing the server.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// =================================================================
// Composio Integration Routes
// =================================================================

// BUGFIX: All integration routes were publicly exposed without authentication.
// This is a critical security vulnerability, allowing unauthenticated users to perform actions.
// FIX: Create a dedicated router for API endpoints and apply authMiddleware to all of them.
// This ensures that only authenticated users can access these features, providing a user context (req.user)
// for controllers to correctly scope actions and data, preventing IDOR vulnerabilities.
const apiRouter = express.Router();
apiRouter.use(authMiddleware); // Apply authentication to all subsequent routes.

// BUGFIX: Plan limits were not being enforced on action-oriented routes.
// This would allow users to exceed their plan's usage limits (e.g., sending unlimited emails).
// FIX: Apply `planLimitMiddleware('action')` to all routes that perform a billable action.
// This ensures usage is tracked and propagated correctly, respecting tenant/workspace plan boundaries.
// We assume 'action' is a generic key for metered API calls in the subscription plan.

apiRouter.get('/all/integrations', asyncHandler(composioController.getAllIntegrations));
apiRouter.get(
  '/connected-accounts',
  asyncHandler(composioController.getAllConnectedAccountsService)
);

// Gmail routes
apiRouter.get('/gmail/integration', asyncHandler(composioController.getGmailIntegration));
apiRouter.post('/gmail/authorize', asyncHandler(composioController.authorizeGmailIntegration));
apiRouter.post('/gmail/connect', asyncHandler(composioController.initiateGmailConnection));
apiRouter.post(
  '/gmail/send-email',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.sendEmailWithComposio)
);

// YouTube routes
apiRouter.get('/youtube/integration', asyncHandler(composioController.getYouTubeIntegration));
apiRouter.post('/youtube/connect', asyncHandler(composioController.initiateYouTubeConnection));
apiRouter.post(
  '/youtube/search',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.searchYouTube)
);
apiRouter.delete(
  '/youtube/disconnect/:id',
  asyncHandler(composioController.disconnectYouTubeAccount) // Disconnecting is an admin action, not typically metered.
);

// LinkedIn routes
apiRouter.get('/linkedin/auth/start', asyncHandler(composioController.startLinkedInOAuth));
apiRouter.get(
  '/linkedin/auth/callback',
  asyncHandler(composioController.handleLinkedInCallback)
);
apiRouter.post(
  '/linkedin/post',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.postToLinkedIn)
);

// Google Calendar routes
apiRouter.post(
  '/calendar/connect',
  asyncHandler(composioController.initiateGoogleCalendarConnection)
);
apiRouter.post(
  '/calendar/create-event',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.createCalendarEvent)
);
apiRouter.post('/calendar/events', asyncHandler(composioController.getCalendarEvents));
apiRouter.delete(
  '/calendar/delete-event',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.deleteCalendarEvent)
);
apiRouter.patch(
  '/calendar/update-event',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.updateCalendarEvent)
);

// GitHub routes
apiRouter.get('/github/integration', asyncHandler(composioController.getGithubIntegration));
apiRouter.post('/github/connect', asyncHandler(composioController.initiateGithubConnection));
apiRouter.post(
  '/github/create-issue',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.createGithubIssue)
);

// Amazon Routes
apiRouter.post('/amazon/connect', asyncHandler(composioController.initiateAmazonConnection));
apiRouter.post(
  '/amazon/search',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.searchAmazonProduct)
);

// Twitter Routes
apiRouter.post('/twitter/connect', asyncHandler(composioController.initiateTwitterConnection));
apiRouter.post(
  '/twitter/post',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.postTweet)
);
apiRouter.post(
  '/twitter/follow-user',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.followTwitterUser)
);
apiRouter.post(
  '/twitter/delete-tweet',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.deleteTweet)
);
apiRouter.post(
  '/twitter/user-lookup',
  asyncHandler(composioController.getTwitterUserByUsername)
);
apiRouter.post(
  '/twitter/send-message',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.sendDMByUsername)
);

// Mount the secured API router.
router.use(apiRouter);

// =================================================================
// Manager Dashboard Routes
// =================================================================
// These routes provide functionality for the Manager Dashboard,
// focusing on team management, invitations, and metrics, while
// respecting plan limitations and restricting access to sensitive data like billing.
// NOTE: This section was already correctly implemented with proper auth and role middleware. No changes needed.

// Create a dedicated router for manager-specific endpoints to apply common middleware.
const managerRouter = express.Router();

// Apply authentication and role-based access control to all manager routes.
// This ensures only authenticated users with the 'manager' role can access these features.
managerRouter.use(authMiddleware, roleMiddleware('manager', 'admin')); // Also allow admin to perform manager actions.

// --- Team & Invitation Management ---

// Fetches a list of all members within the manager's workspace.
managerRouter.get('/team/members', asyncHandler(managerController.getTeamMembers));

// Updates the role of a specific team member.
managerRouter.patch('/team/members/:memberId/role', asyncHandler(managerController.updateMemberRole));

// Removes a member from the workspace.
managerRouter.delete('/team/members/:memberId', asyncHandler(managerController.removeMember));

// Sends an invitation to a new user to join the workspace.
// The planLimitMiddleware is crucial for preventing the manager from
// exceeding the number of allowed members according to the current subscription plan.
managerRouter.post(
  '/team/invitations',
  planLimitMiddleware('members'), // Checks against the 'members' limit in the plan.
  asyncHandler(managerController.inviteMember)
);

// Retrieves a list of pending invitations for the workspace.
managerRouter.get('/team/invitations', asyncHandler(managerController.getPendingInvitations));

// Cancels a previously sent, pending invitation.
managerRouter.delete('/team/invitations/:invitationId', asyncHandler(managerController.cancelInvitation));

// --- Workspace Metrics ---

// Provides access to workspace-level metrics and analytics for the manager.
// This endpoint is read-only and does not expose any billing or sensitive user information.
managerRouter.get('/workspace/metrics', asyncHandler(managerController.getWorkspaceMetrics));

// Mount the manager-specific routes under a '/manager' prefix for clear namespacing.
router.use('/manager', managerRouter);

export const composioRoutes = router;