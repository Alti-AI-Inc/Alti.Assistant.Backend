import express from 'express';
import { composioController } from './composio.controller.js';
// Import necessary middleware and a new controller for manager features.
// These are assumed to exist in the project structure.
import { authMiddleware, roleMiddleware } from '../auth/auth.middleware.js';
import { planLimitMiddleware } from '../billing/planLimit.middleware.js';
import { managerController } from '../manager/manager.controller.js';

const router = express.Router();

/**
 * A utility function to wrap asynchronous route handlers, ensuring that any exceptions
 * are caught and passed to the Express error-handling middleware.
 * This prevents unhandled promise rejections from crashing the server.
 * @param {Function} fn The asynchronous controller function to wrap.
 * @returns {Function} An Express route handler function.
 */
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

/**
 * @openapi
 * /composio/all/integrations:
 *   get:
 *     summary: Get all available Composio integrations
 *     description: Retrieves a list of all integrations available through the Composio service. Requires user authentication.
 *     tags:
 *       - Composio
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of available integrations.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.get('/all/integrations', asyncHandler(composioController.getAllIntegrations));

/**
 * @openapi
 * /composio/connected-accounts:
 *   get:
 *     summary: Get all connected accounts for the user
 *     description: Retrieves a list of all third-party accounts the authenticated user has connected via Composio within their current workspace.
 *     tags:
 *       - Composio
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of the user's connected accounts.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.get(
  '/connected-accounts',
  asyncHandler(composioController.getAllConnectedAccountsService)
);

// Gmail routes
/**
 * @openapi
 * /composio/gmail/integration:
 *   get:
 *     summary: Get Gmail integration details
 *     description: Retrieves details about the Gmail integration provided by Composio.
 *     tags:
 *       - Composio
 *       - Gmail
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Gmail integration details.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.get('/gmail/integration', asyncHandler(composioController.getGmailIntegration));

/**
 * @openapi
 * /composio/gmail/authorize:
 *   post:
 *     summary: Authorize Gmail integration
 *     description: Handles the authorization step for connecting a Gmail account, typically part of an OAuth flow.
 *     tags:
 *       - Composio
 *       - Gmail
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Authorization successful.
 *       400:
 *         description: Bad Request, missing required parameters.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.post('/gmail/authorize', asyncHandler(composioController.authorizeGmailIntegration));

/**
 * @openapi
 * /composio/gmail/connect:
 *   post:
 *     summary: Initiate Gmail connection
 *     description: Starts the process of connecting a new Gmail account for the authenticated user.
 *     tags:
 *       - Composio
 *       - Gmail
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection process initiated successfully.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.post('/gmail/connect', asyncHandler(composioController.initiateGmailConnection));

/**
 * @openapi
 * /composio/gmail/send-email:
 *   post:
 *     summary: Send an email via Gmail
 *     description: Sends an email using a connected Gmail account. This is a billable action and is subject to plan limits.
 *     tags:
 *       - Composio
 *       - Gmail
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to:
 *                 type: string
 *                 example: "recipient@example.com"
 *               subject:
 *                 type: string
 *                 example: "Hello from Alti.Assistant"
 *               body:
 *                 type: string
 *                 example: "This is the body of the email."
 *     responses:
 *       200:
 *         description: Email sent successfully.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'action' exceeded.
 *       400:
 *         description: Bad Request, invalid email parameters.
 */
apiRouter.post(
  '/gmail/send-email',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.sendEmailWithComposio)
);

// YouTube routes
/**
 * @openapi
 * /composio/youtube/integration:
 *   get:
 *     summary: Get YouTube integration details
 *     description: Retrieves details about the YouTube integration provided by Composio.
 *     tags:
 *       - Composio
 *       - YouTube
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: YouTube integration details.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.get('/youtube/integration', asyncHandler(composioController.getYouTubeIntegration));

/**
 * @openapi
 * /composio/youtube/connect:
 *   post:
 *     summary: Initiate YouTube connection
 *     description: Starts the process of connecting a new YouTube account for the authenticated user.
 *     tags:
 *       - Composio
 *       - YouTube
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection process initiated successfully.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.post('/youtube/connect', asyncHandler(composioController.initiateYouTubeConnection));

/**
 * @openapi
 * /composio/youtube/search:
 *   post:
 *     summary: Search for videos on YouTube
 *     description: Performs a video search on YouTube using a connected account. This is a billable action and is subject to plan limits.
 *     tags:
 *       - Composio
 *       - YouTube
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 example: "Node.js tutorials"
 *     responses:
 *       200:
 *         description: Search results returned successfully.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'action' exceeded.
 */
apiRouter.post(
  '/youtube/search',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.searchYouTube)
);

/**
 * @openapi
 * /composio/youtube/disconnect/{id}:
 *   delete:
 *     summary: Disconnect a YouTube account
 *     description: Disconnects a previously connected YouTube account for the user.
 *     tags:
 *       - Composio
 *       - YouTube
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the connected YouTube account.
 *     responses:
 *       200:
 *         description: Account disconnected successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Connected account not found.
 */
apiRouter.delete(
  '/youtube/disconnect/:id',
  asyncHandler(composioController.disconnectYouTubeAccount) // Disconnecting is an admin action, not typically metered.
);

// LinkedIn routes
/**
 * @openapi
 * /composio/linkedin/auth/start:
 *   get:
 *     summary: Start LinkedIn OAuth flow
 *     description: Initiates the OAuth 2.0 authorization flow for connecting a LinkedIn account.
 *     tags:
 *       - Composio
 *       - LinkedIn
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       302:
 *         description: Redirects to the LinkedIn authorization page.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.get('/linkedin/auth/start', asyncHandler(composioController.startLinkedInOAuth));

/**
 * @openapi
 * /composio/linkedin/auth/callback:
 *   get:
 *     summary: Handle LinkedIn OAuth callback
 *     description: Handles the callback from LinkedIn after user authorization to complete the connection process.
 *     tags:
 *       - Composio
 *       - LinkedIn
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: LinkedIn account connected successfully.
 *       400:
 *         description: Bad Request, invalid callback parameters.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.get(
  '/linkedin/auth/callback',
  asyncHandler(composioController.handleLinkedInCallback)
);

/**
 * @openapi
 * /composio/linkedin/post:
 *   post:
 *     summary: Create a post on LinkedIn
 *     description: Publishes a new post to a connected LinkedIn profile. This is a billable action and is subject to plan limits.
 *     tags:
 *       - Composio
 *       - LinkedIn
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 example: "Excited to share my new project built with Alti.Assistant!"
 *     responses:
 *       201:
 *         description: Post created successfully.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'action' exceeded.
 */
apiRouter.post(
  '/linkedin/post',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.postToLinkedIn)
);

// Google Calendar routes
/**
 * @openapi
 * /composio/calendar/connect:
 *   post:
 *     summary: Initiate Google Calendar connection
 *     description: Starts the process of connecting a new Google Calendar account for the authenticated user.
 *     tags:
 *       - Composio
 *       - Google Calendar
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection process initiated successfully.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.post(
  '/calendar/connect',
  asyncHandler(composioController.initiateGoogleCalendarConnection)
);

/**
 * @openapi
 * /composio/calendar/create-event:
 *   post:
 *     summary: Create a Google Calendar event
 *     description: Creates a new event in a connected Google Calendar. This is a billable action and is subject to plan limits.
 *     tags:
 *       - Composio
 *       - Google Calendar
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               summary:
 *                 type: string
 *                 example: "Team Meeting"
 *               start:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-09-27T10:00:00-07:00"
 *               end:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-09-27T11:00:00-07:00"
 *     responses:
 *       201:
 *         description: Event created successfully.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'action' exceeded.
 */
apiRouter.post(
  '/calendar/create-event',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.createCalendarEvent)
);

/**
 * @openapi
 * /composio/calendar/events:
 *   post:
 *     summary: Get Google Calendar events
 *     description: Retrieves a list of events from a connected Google Calendar, optionally within a specified time range.
 *     tags:
 *       - Composio
 *       - Google Calendar
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               timeMin:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-09-01T00:00:00Z"
 *               timeMax:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-09-30T23:59:59Z"
 *     responses:
 *       200:
 *         description: A list of calendar events.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.post('/calendar/events', asyncHandler(composioController.getCalendarEvents));

/**
 * @openapi
 * /composio/calendar/delete-event:
 *   delete:
 *     summary: Delete a Google Calendar event
 *     description: Deletes a specific event from a connected Google Calendar. This is a billable action and is subject to plan limits.
 *     tags:
 *       - Composio
 *       - Google Calendar
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               eventId:
 *                 type: string
 *                 example: "uniqueeventid123"
 *     responses:
 *       200:
 *         description: Event deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'action' exceeded.
 *       404:
 *         description: Event not found.
 */
apiRouter.delete(
  '/calendar/delete-event',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.deleteCalendarEvent)
);

/**
 * @openapi
 * /composio/calendar/update-event:
 *   patch:
 *     summary: Update a Google Calendar event
 *     description: Updates an existing event in a connected Google Calendar. This is a billable action and is subject to plan limits.
 *     tags:
 *       - Composio
 *       - Google Calendar
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               eventId:
 *                 type: string
 *                 example: "uniqueeventid123"
 *               updates:
 *                 type: object
 *                 properties:
 *                   summary:
 *                     type: string
 *                     example: "Updated Team Meeting"
 *     responses:
 *       200:
 *         description: Event updated successfully.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'action' exceeded.
 *       404:
 *         description: Event not found.
 */
apiRouter.patch(
  '/calendar/update-event',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.updateCalendarEvent)
);

// GitHub routes
/**
 * @openapi
 * /composio/github/integration:
 *   get:
 *     summary: Get GitHub integration details
 *     description: Retrieves details about the GitHub integration provided by Composio.
 *     tags:
 *       - Composio
 *       - GitHub
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: GitHub integration details.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.get('/github/integration', asyncHandler(composioController.getGithubIntegration));

/**
 * @openapi
 * /composio/github/connect:
 *   post:
 *     summary: Initiate GitHub connection
 *     description: Starts the process of connecting a new GitHub account for the authenticated user.
 *     tags:
 *       - Composio
 *       - GitHub
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection process initiated successfully.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.post('/github/connect', asyncHandler(composioController.initiateGithubConnection));

/**
 * @openapi
 * /composio/github/create-issue:
 *   post:
 *     summary: Create a GitHub issue
 *     description: Creates a new issue in a specified GitHub repository. This is a billable action and is subject to plan limits.
 *     tags:
 *       - Composio
 *       - GitHub
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               owner:
 *                 type: string
 *                 example: "owner-name"
 *               repo:
 *                 type: string
 *                 example: "repo-name"
 *               title:
 *                 type: string
 *                 example: "New Feature Request"
 *               body:
 *                 type: string
 *                 example: "Details about the new feature."
 *     responses:
 *       201:
 *         description: Issue created successfully.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'action' exceeded.
 */
apiRouter.post(
  '/github/create-issue',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.createGithubIssue)
);

// Amazon Routes
/**
 * @openapi
 * /composio/amazon/connect:
 *   post:
 *     summary: Initiate Amazon connection
 *     description: Starts the process of connecting a new Amazon account for the authenticated user.
 *     tags:
 *       - Composio
 *       - Amazon
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection process initiated successfully.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.post('/amazon/connect', asyncHandler(composioController.initiateAmazonConnection));

/**
 * @openapi
 * /composio/amazon/search:
 *   post:
 *     summary: Search for a product on Amazon
 *     description: Searches for products on Amazon. This is a billable action and is subject to plan limits.
 *     tags:
 *       - Composio
 *       - Amazon
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 example: "wireless headphones"
 *     responses:
 *       200:
 *         description: Search results returned successfully.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'action' exceeded.
 */
apiRouter.post(
  '/amazon/search',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.searchAmazonProduct)
);

// Twitter Routes
/**
 * @openapi
 * /composio/twitter/connect:
 *   post:
 *     summary: Initiate Twitter (X) connection
 *     description: Starts the process of connecting a new Twitter (X) account for the authenticated user.
 *     tags:
 *       - Composio
 *       - Twitter
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection process initiated successfully.
 *       401:
 *         description: Unauthorized.
 */
apiRouter.post('/twitter/connect', asyncHandler(composioController.initiateTwitterConnection));

/**
 * @openapi
 * /composio/twitter/post:
 *   post:
 *     summary: Post a tweet
 *     description: Publishes a new tweet to a connected Twitter (X) account. This is a billable action and is subject to plan limits.
 *     tags:
 *       - Composio
 *       - Twitter
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 example: "Hello Twitter! #AltiAssistant"
 *     responses:
 *       201:
 *         description: Tweet posted successfully.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'action' exceeded.
 */
apiRouter.post(
  '/twitter/post',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.postTweet)
);

/**
 * @openapi
 * /composio/twitter/follow-user:
 *   post:
 *     summary: Follow a Twitter user
 *     description: Follows a specified user on Twitter (X). This is a billable action and is subject to plan limits.
 *     tags:
 *       - Composio
 *       - Twitter
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: "twitterdev"
 *     responses:
 *       200:
 *         description: User followed successfully.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'action' exceeded.
 */
apiRouter.post(
  '/twitter/follow-user',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.followTwitterUser)
);

/**
 * @openapi
 * /composio/twitter/delete-tweet:
 *   post:
 *     summary: Delete a tweet
 *     description: Deletes a specific tweet from a connected Twitter (X) account. This is a billable action and is subject to plan limits.
 *     tags:
 *       - Composio
 *       - Twitter
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tweetId:
 *                 type: string
 *                 example: "1234567890123456789"
 *     responses:
 *       200:
 *         description: Tweet deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'action' exceeded.
 *       404:
 *         description: Tweet not found.
 */
apiRouter.post(
  '/twitter/delete-tweet',
  planLimitMiddleware('action'), // Enforce plan limits on this action.
  asyncHandler(composioController.deleteTweet)
);

/**
 * @openapi
 * /composio/twitter/user-lookup:
 *   post:
 *     summary: Look up a Twitter user by username
 *     description: Retrieves profile information for a given Twitter (X) username.
 *     tags:
 *       - Composio
 *       - Twitter
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: "twitterdev"
 *     responses:
 *       200:
 *         description: User information retrieved successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: User not found.
 */
apiRouter.post(
  '/twitter/user-lookup',
  asyncHandler(composioController.getTwitterUserByUsername)
);

/**
 * @openapi
 * /composio/twitter/send-message:
 *   post:
 *     summary: Send a direct message on Twitter
 *     description: Sends a direct message to a specified user on Twitter (X). This is a billable action and is subject to plan limits.
 *     tags:
 *       - Composio
 *       - Twitter
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: "recipient_user"
 *               message:
 *                 type: string
 *                 example: "Hello, this is a direct message."
 *     responses:
 *       200:
 *         description: Message sent successfully.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'action' exceeded.
 */
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

/**
 * @openapi
 * /composio/manager/team/members:
 *   get:
 *     summary: Get team members
 *     description: Fetches a list of all members within the manager's workspace. Requires 'manager' or 'admin' role.
 *     tags:
 *       - Manager
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of team members.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - User does not have manager or admin role.
 */
managerRouter.get('/team/members', asyncHandler(managerController.getTeamMembers));

/**
 * @openapi
 * /composio/manager/team/members/{memberId}/role:
 *   patch:
 *     summary: Update a team member's role
 *     description: Updates the role of a specific team member within the workspace. Requires 'manager' or 'admin' role.
 *     tags:
 *       - Manager
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the team member to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, manager]
 *                 example: "user"
 *     responses:
 *       200:
 *         description: Member role updated successfully.
 *       400:
 *         description: Bad Request - Invalid role specified.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - User does not have manager or admin role.
 *       404:
 *         description: Team member not found.
 */
managerRouter.patch('/team/members/:memberId/role', asyncHandler(managerController.updateMemberRole));

/**
 * @openapi
 * /composio/manager/team/members/{memberId}:
 *   delete:
 *     summary: Remove a team member
 *     description: Removes a member from the workspace. Requires 'manager' or 'admin' role.
 *     tags:
 *       - Manager
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the team member to remove.
 *     responses:
 *       200:
 *         description: Member removed successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - User does not have manager or admin role.
 *       404:
 *         description: Team member not found.
 */
managerRouter.delete('/team/members/:memberId', asyncHandler(managerController.removeMember));

/**
 * @openapi
 * /composio/manager/team/invitations:
 *   post:
 *     summary: Invite a new member
 *     description: Sends an invitation to a new user to join the workspace. This action is subject to the plan's member limit. Requires 'manager' or 'admin' role.
 *     tags:
 *       - Manager
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "new.member@example.com"
 *               role:
 *                 type: string
 *                 enum: [user, manager]
 *                 example: "user"
 *     responses:
 *       201:
 *         description: Invitation sent successfully.
 *       400:
 *         description: Bad Request - User is already a member or has a pending invitation.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment Required - Plan limit for 'members' exceeded.
 *       403:
 *         description: Forbidden - User does not have manager or admin role.
 */
managerRouter.post(
  '/team/invitations',
  planLimitMiddleware('members'), // Checks against the 'members' limit in the plan.
  asyncHandler(managerController.inviteMember)
);

/**
 * @openapi
 * /composio/manager/team/invitations:
 *   get:
 *     summary: Get pending invitations
 *     description: Retrieves a list of pending invitations for the workspace. Requires 'manager' or 'admin' role.
 *     tags:
 *       - Manager
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of pending invitations.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - User does not have manager or admin role.
 */
managerRouter.get('/team/invitations', asyncHandler(managerController.getPendingInvitations));

/**
 * @openapi
 * /composio/manager/team/invitations/{invitationId}:
 *   delete:
 *     summary: Cancel a pending invitation
 *     description: Cancels a previously sent, pending invitation. Requires 'manager' or 'admin' role.
 *     tags:
 *       - Manager
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the invitation to cancel.
 *     responses:
 *       200:
 *         description: Invitation cancelled successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - User does not have manager or admin role.
 *       404:
 *         description: Invitation not found.
 */
managerRouter.delete('/team/invitations/:invitationId', asyncHandler(managerController.cancelInvitation));

// --- Workspace Metrics ---

/**
 * @openapi
 * /composio/manager/workspace/metrics:
 *   get:
 *     summary: Get workspace metrics
 *     description: Provides access to workspace-level metrics and analytics. Requires 'manager' or 'admin' role.
 *     tags:
 *       - Manager
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workspace metrics data.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - User does not have manager or admin role.
 */
managerRouter.get('/workspace/metrics', asyncHandler(managerController.getWorkspaceMetrics));

// Mount the manager-specific routes under a '/manager' prefix for clear namespacing.
router.use('/manager', managerRouter);

/**
 * Express router for Composio integration and manager-related endpoints.
 * @type {express.Router}
 */
export const composioRoutes = router;