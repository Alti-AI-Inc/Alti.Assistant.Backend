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

router.get('/all/integrations', asyncHandler(composioController.getAllIntegrations));
router.get(
  '/connected-accounts',
  asyncHandler(composioController.getAllConnectedAccountsService)
);

// Gmail routes
router.get('/gmail/integration', asyncHandler(composioController.getGmailIntegration));
router.post('/gmail/authorize', asyncHandler(composioController.authorizeGmailIntegration));
router.post('/gmail/connect', asyncHandler(composioController.initiateGmailConnection));
router.post('/gmail/send-email', asyncHandler(composioController.sendEmailWithComposio));

// YouTube routes
router.get('/youtube/integration', asyncHandler(composioController.getYouTubeIntegration));
router.post('/youtube/connect', asyncHandler(composioController.initiateYouTubeConnection));
router.post('/youtube/search', asyncHandler(composioController.searchYouTube));
router.delete(
  '/youtube/disconnect/:id',
  asyncHandler(composioController.disconnectYouTubeAccount)
);

// LinkedIn routes
router.get('/linkedin/auth/start', asyncHandler(composioController.startLinkedInOAuth));
router.get(
  '/linkedin/auth/callback',
  asyncHandler(composioController.handleLinkedInCallback)
);
router.post('/linkedin/post', asyncHandler(composioController.postToLinkedIn));

// Google Calendar routes
router.post(
  '/calendar/connect',
  asyncHandler(composioController.initiateGoogleCalendarConnection)
);
router.post('/calendar/create-event', asyncHandler(composioController.createCalendarEvent));
router.post('/calendar/events', asyncHandler(composioController.getCalendarEvents));
router.delete('/calendar/delete-event', asyncHandler(composioController.deleteCalendarEvent));
router.patch('/calendar/update-event', asyncHandler(composioController.updateCalendarEvent));

// GitHub routes
router.get('/github/integration', asyncHandler(composioController.getGithubIntegration));
router.post('/github/connect', asyncHandler(composioController.initiateGithubConnection));
router.post('/github/create-issue', asyncHandler(composioController.createGithubIssue));

// Amazon Routes
router.post('/amazon/connect', asyncHandler(composioController.initiateAmazonConnection));
router.post('/amazon/search', asyncHandler(composioController.searchAmazonProduct));

// Twitter Routes
router.post('/twitter/connect', asyncHandler(composioController.initiateTwitterConnection));
router.post('/twitter/post', asyncHandler(composioController.postTweet));
router.post('/twitter/follow-user', asyncHandler(composioController.followTwitterUser));
router.post('/twitter/delete-tweet', asyncHandler(composioController.deleteTweet));
router.post(
  '/twitter/user-lookup',
  asyncHandler(composioController.getTwitterUserByUsername)
);
router.post('/twitter/send-message', asyncHandler(composioController.sendDMByUsername));

// =================================================================
// Manager Dashboard Routes
// =================================================================
// These routes provide functionality for the Manager Dashboard,
// focusing on team management, invitations, and metrics, while
// respecting plan limitations and restricting access to sensitive data like billing.

// Create a dedicated router for manager-specific endpoints to apply common middleware.
const managerRouter = express.Router();

// Apply authentication and role-based access control to all manager routes.
// This ensures only authenticated users with the 'manager' role can access these features.
managerRouter.use(authMiddleware, roleMiddleware('manager'));

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