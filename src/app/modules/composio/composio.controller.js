import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { composioService } from './composio.service.js';
// Consolidated on Google Cloud native integrations

/**
 * @constant {string} integrationId - The Composio Gmail integration ID.
 * This ID is used to identify the specific Gmail integration within Composio.
 * It should be configured securely, ideally from environment variables.
 */
const integrationId = '5c9834e1-14b3-4c06-9262-606bce538a9f'; // Put your Composio Gmail integration ID here
/**
 * @constant {string} linkedInIntegrationId - The Composio LinkedIn integration ID.
 * This ID is used to identify the specific LinkedIn integration within Composio.
 * It should be configured securely, ideally from environment variables.
 */
const linkedInIntegrationId = 'ff2c1c00-03ca-4135-9fe7-afa775098c26'; // Put your Composio LinkedIn integration ID here
/**
 * @constant {string} githubIntegrationId - The Composio GitHub integration ID.
 * This is a placeholder and should be replaced with a securely configured ID.
 */
const githubIntegrationId = 'your-github-integration-id'; // Placeholder, should be configured securely
/**
 * @constant {string} amazonIntegrationId - The Composio Amazon integration ID.
 * This is a placeholder and should be replaced with a securely configured ID.
 */
const amazonIntegrationId = 'your-amazon-integration-id'; // Placeholder, should be configured securely
/**
 * @constant {string} entityId - The default entity ID for Composio integrations.
 * This might need to be dynamic based on the authenticated user or tenant in a multi-tenant application.
 */
const entityId = 'default'; // This might need to be dynamic based on authenticated user/tenant

/**
 * @typedef {object} ComposioResponse
 * @property {number} statusCode - The HTTP status code of the response.
 * @property {boolean} success - Indicates if the request was successful.
 * @property {string} message - A descriptive message for the response.
 * @property {object} data - The data returned by the API.
 */

/**
 * @swagger
 * /api/v1/composio/gmail:
 *   get:
 *     summary: Get Gmail Integration Information
 *     description: Retrieves information about the configured Gmail integration.
 *     tags:
 *       - Composio - Gmail
 *     responses:
 *       200:
 *         description: Successfully retrieved Gmail integration information.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Successfully fetched Gmail integration info
 *                 data:
 *                   type: object
 *                   description: Gmail integration details.
 *       500:
 *         description: Internal server error.
 */
const getGmailIntegration = catchAsync(async (req, res) => {
  const result = await composioService.getGmailIntegrationService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully fetched Gmail integration info', // Message seems generic, consider making it specific to Gmail integration
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/integrations:
 *   get:
 *     summary: Get All Composio Integrations
 *     description: Retrieves a list of all available and configured Composio integrations.
 *     tags:
 *       - Composio - General
 *     responses:
 *       200:
 *         description: Integrations retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Integrations retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "5c9834e1-14b3-4c06-9262-606bce538a9f"
 *                       name:
 *                         type: string
 *                         example: "Gmail"
 *                       status:
 *                         type: string
 *                         example: "connected"
 *                   description: An array of integration objects.
 *       500:
 *         description: Internal server error.
 */
const getAllIntegrations = catchAsync(async (req, res) => {
  const result = await composioService.getAllIntegrationsService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Integrations retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/gmail/authorize:
 *   post:
 *     summary: Authorize Gmail Integration
 *     description: Authorizes a Gmail account for use with Composio.
 *     tags:
 *       - Composio - Gmail
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userEmail
 *             properties:
 *               userEmail:
 *                 type: string
 *                 format: email
 *                 description: The email address of the user to authorize.
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Successfully authorized Gmail integration.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Successfully authorized Gmail integration
 *                 data:
 *                   type: object
 *                   description: Authorization details.
 *       400:
 *         description: Bad request, e.g., missing userEmail.
 *       500:
 *         description: Internal server error.
 */
const authorizeGmailIntegration = catchAsync(async (req, res) => {
  const { userEmail } = req.body;

  const result =
    await composioService.authorizeGmailIntegrationService(userEmail);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully authorized Gmail integration',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/gmail/send-email-composio:
 *   post:
 *     summary: Send Email using Composio Gmail Integration
 *     description: Sends an email through the authorized Gmail account using Composio.
 *     tags:
 *       - Composio - Gmail
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *               - body
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *                 description: Recipient's email address.
 *                 example: recipient@example.com
 *               subject:
 *                 type: string
 *                 description: Subject of the email.
 *                 example: Meeting Reminder
 *               body:
 *                 type: string
 *                 description: HTML or plain text body of the email.
 *                 example: <p>Hi,</p><p>Just a reminder about our meeting tomorrow.</p>
 *               from:
 *                 type: string
 *                 format: email
 *                 description: Optional sender's email address (if different from authorized account).
 *                 example: sender@example.com
 *               cc:
 *                 type: string
 *                 format: email
 *                 description: Optional CC recipient's email address.
 *                 example: cc@example.com
 *               bcc:
 *                 type: string
 *                 format: email
 *                 description: Optional BCC recipient's email address.
 *                 example: bcc@example.com
 *             example:
 *               to: "test@example.com"
 *               subject: "Hello from Composio"
 *               body: "This is a test email sent via Composio."
 *     responses:
 *       200:
 *         description: Email sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Email sent successfully
 *                 data:
 *                   type: object
 *                   description: Details of the sent email.
 *       400:
 *         description: Bad request, e.g., missing required email fields.
 *       500:
 *         description: Internal server error.
 */
const sendEmailWithComposio = catchAsync(async (req, res) => {
  // userEmail is destructured but not used, passing req.body directly to service
  // Ensure the service expects the full body or extract specific fields.
  const result = await composioService.sendGmailFromAuthorizedAccountService(
    req.body
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Email sent successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/gmail/initiate-connection:
 *   get:
 *     summary: Initiate Gmail Connection
 *     description: Initiates the connection process for Gmail, typically returning an OAuth URL.
 *     tags:
 *       - Composio - Gmail
 *     responses:
 *       200:
 *         description: Successfully initiated Gmail connection.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Successfully initiated Gmail connection
 *                 data:
 *                   type: object
 *                   properties:
 *                     authorizationUrl:
 *                       type: string
 *                       format: url
 *                       example: "https://accounts.google.com/o/oauth2/auth?..."
 *                   description: The authorization URL to redirect the user to.
 *       500:
 *         description: Internal server error.
 */
const initiateGmailConnection = catchAsync(async (req, res) => {
  // Security Fix: Using the hardcoded integrationId instead of taking it from req.body
  // Taking integrationId from req.body could lead to IDOR if not properly validated by the service.
  const result =
    await composioService.initiateGmailConnectionService(integrationId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully initiated Gmail connection', // Message seems generic, made it specific
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/gmail/send-email:
 *   post:
 *     summary: Send Email (Generic)
 *     description: Sends an email using a generic email service, potentially leveraging Composio.
 *                  Requires user authentication for context.
 *     tags:
 *       - Composio - Gmail
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *               - html
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *                 description: Recipient's email address.
 *                 example: recipient@example.com
 *               subject:
 *                 type: string
 *                 description: Subject of the email.
 *                 example: Important Update
 *               html:
 *                 type: string
 *                 description: HTML content of the email.
 *                 example: <p>Hello,</p><p>This is an important update.</p>
 *               from:
 *                 type: string
 *                 format: email
 *                 description: Optional sender's email address.
 *                 example: sender@example.com
 *               text:
 *                 type: string
 *                 description: Optional plain text content of the email.
 *                 example: Hello, This is an important update.
 *             example:
 *               to: "another@example.com"
 *               subject: "Generic Email Test"
 *               html: "<h1>Hello!</h1><p>This is a generic email test.</p>"
 *     responses:
 *       200:
 *         description: Email sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Email sent successfully
 *                 data:
 *                   type: object
 *                   description: Details of the sent email.
 *       400:
 *         description: Bad request, e.g., missing required email fields.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
const sendEmail = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (body, user) instead of the entire req object
  const result = await composioService.sendEmailService({
    body: req.body,
    user: req.user, // Assuming user is available from authentication middleware
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Email sent successfully', // Message seems generic, made it specific
    data: result,
  });
});

// =============================
//      Youtub Controller
// =============================

/**
 * @swagger
 * /api/v1/composio/youtube:
 *   get:
 *     summary: Get YouTube Integration Information
 *     description: Retrieves information about the configured YouTube integration.
 *     tags:
 *       - Composio - YouTube
 *     responses:
 *       200:
 *         description: Successfully fetched YouTube integration info.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Successfully fetched YouTube integration info
 *                 data:
 *                   type: object
 *                   description: YouTube integration details.
 *       500:
 *         description: Internal server error.
 */
const getYouTubeIntegration = catchAsync(async (req, res) => {
  const result = await composioService.getYouTubeIntegrationService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully fetched YouTube integration info',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/youtube/initiate-connection:
 *   get:
 *     summary: Initiate YouTube Connection
 *     description: Initiates the connection process for YouTube, typically returning an OAuth URL.
 *     tags:
 *       - Composio - YouTube
 *     responses:
 *       200:
 *         description: Successfully initiated YouTube connection.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Successfully initiated YouTube connection
 *                 data:
 *                   type: object
 *                   properties:
 *                     authorizationUrl:
 *                       type: string
 *                       format: url
 *                       example: "https://accounts.google.com/o/oauth2/auth?..."
 *                   description: The authorization URL to redirect the user to.
 *       500:
 *         description: Internal server error.
 */
const initiateYouTubeConnection = catchAsync(async (req, res) => {
  const result = await composioService.initiateYouTubeConnectionService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully initiated YouTube connection',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/youtube/search:
 *   get:
 *     summary: Search YouTube Videos
 *     description: Searches for YouTube videos based on a query. Requires user authentication for context.
 *     tags:
 *       - Composio - YouTube
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         required: true
 *         description: The search query for YouTube videos.
 *         example: "Node.js tutorial"
 *       - in: query
 *         name: maxResults
 *         schema:
 *           type: number
 *           default: 10
 *         description: The maximum number of results to return.
 *         example: 5
 *     responses:
 *       200:
 *         description: Successfully searched YouTube videos.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Successfully searched YouTube videos
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: object
 *                         properties:
 *                           videoId:
 *                             type: string
 *                             example: "dQw4w9WgXcQ"
 *                       snippet:
 *                         type: object
 *                         properties:
 *                           title:
 *                             type: string
 *                             example: "Rick Astley - Never Gonna Give You Up (Official Music Video)"
 *                           description:
 *                             type: string
 *                             example: "The official video for “Never Gonna Give You Up” by Rick Astley"
 *                   description: An array of YouTube video search results.
 *       400:
 *         description: Bad request, e.g., missing search query.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
const searchYouTube = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (query, user) instead of the entire req object
  const result = await composioService.searchYouTubeService({
    query: req.query,
    user: req.user, // Assuming user is available from authentication middleware
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully searched YouTube videos',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/youtube/disconnect/{id}:
 *   delete:
 *     summary: Disconnect YouTube Account
 *     description: Disconnects a specific YouTube account integration using its connection ID.
 *     tags:
 *       - Composio - YouTube
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the YouTube connection to disconnect.
 *         example: "youtube-conn-123"
 *     responses:
 *       200:
 *         description: Successfully disconnected YouTube account.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Successfully disconnected YouTube account
 *                 data:
 *                   type: object
 *                   description: Confirmation of disconnection.
 *       400:
 *         description: Bad request, e.g., missing connection ID.
 *       500:
 *         description: Internal server error.
 */
const disconnectYouTubeAccount = catchAsync(async (req, res) => {
  // Bug Fix: Corrected typo from 'youtubConnectId' to 'youtubeConnectId'
  const youtubeConnectId = req.params.id;
  const result =
    await composioService.disconnectYouTubeAccountService(youtubeConnectId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully disconnected YouTube account', // Message seems generic, made it specific
    data: result,
  });
});

// =============================
//      LinkedIn Controller
// =============================

/**
 * @swagger
 * /api/v1/composio/linkedin/oauth/start:
 *   get:
 *     summary: Start LinkedIn OAuth Flow
 *     description: Initiates the OAuth process for LinkedIn, redirecting the user to LinkedIn's authorization page.
 *     tags:
 *       - Composio - LinkedIn
 *     responses:
 *       302:
 *         description: Redirects to the LinkedIn OAuth authorization URL.
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               format: url
 *               example: "https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=..."
 *       500:
 *         description: Internal server error.
 */
const startLinkedInOAuth = catchAsync(async (req, res) => {
  // Bug Fix: Wrapped in catchAsync for consistent error handling
  const redirectUrl = await composioService.getOAuthRedirectUrlService(
    linkedInIntegrationId,
    entityId
  );
  // For redirects, res.redirect is the correct approach, not sendResponse
  res.redirect(redirectUrl);
});

/**
 * @swagger
 * /api/v1/composio/linkedin/oauth/callback:
 *   get:
 *     summary: Handle LinkedIn OAuth Callback
 *     description: Handles the callback from LinkedIn after user authorization, exchanging the authorization code for an access token.
 *     tags:
 *       - Composio - LinkedIn
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: The authorization code received from LinkedIn.
 *         example: "AQV_..."
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: The state parameter passed during the initial OAuth request (for CSRF protection).
 *         example: "random_string"
 *     responses:
 *       200:
 *         description: LinkedIn account successfully connected.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: LinkedIn Connected! Account ID: linkedin-acc-123
 *                 data:
 *                   type: object
 *                   properties:
 *                     connectedAccountId:
 *                       type: string
 *                       example: "linkedin-acc-123"
 *                     provider:
 *                       type: string
 *                       example: "linkedin"
 *                   description: Details of the newly connected LinkedIn account.
 *       400:
 *         description: Bad request, e.g., missing authorization code.
 *       500:
 *         description: Internal server error.
 */
const handleLinkedInCallback = catchAsync(async (req, res) => {
  // Bug Fix: Wrapped in catchAsync for consistent error handling
  // Bug Fix: Using sendResponse for consistent API response format
  const { code } = req.query;
  if (!code) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Missing code in callback',
    });
  }

  const connectedAccount = await composioService.exchangeCodeService(
    code,
    linkedInIntegrationId,
    entityId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `LinkedIn Connected! Account ID: ${connectedAccount.connectedAccountId}`,
    data: connectedAccount, // Returning the connectedAccount object for consistency
  });
});

/**
 * @swagger
 * /api/v1/composio/linkedin/post:
 *   post:
 *     summary: Post to LinkedIn
 *     description: Creates a new post on LinkedIn using a connected account.
 *     tags:
 *       - Composio - LinkedIn
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - connectedAccountId
 *               - content
 *             properties:
 *               connectedAccountId:
 *                 type: string
 *                 description: The ID of the connected LinkedIn account to post from.
 *                 example: "linkedin-acc-123"
 *               content:
 *                 type: string
 *                 description: The text content of the post.
 *                 example: "Excited to share my latest project! #development #nodejs"
 *             example:
 *               connectedAccountId: "linkedin-acc-123"
 *               content: "Just posted an update via Composio!"
 *     responses:
 *       200:
 *         description: Post created successfully on LinkedIn.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Post created successfully on LinkedIn
 *                 data:
 *                   type: object
 *                   properties:
 *                     postId:
 *                       type: string
 *                       example: "urn:li:share:123456789"
 *                   description: Details of the created post.
 *       400:
 *         description: Bad request, e.g., missing connectedAccountId or content.
 *       500:
 *         description: Internal server error.
 */
const postToLinkedIn = catchAsync(async (req, res) => {
  // Bug Fix: Wrapped in catchAsync for consistent error handling
  // Bug Fix: Using sendResponse for consistent API response format
  const { connectedAccountId, content } = req.body;
  if (!connectedAccountId || !content) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Missing required fields: connectedAccountId or content',
    });
  }

  const result = await composioService.postToLinkedInService(
    linkedInIntegrationId,
    connectedAccountId,
    content
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Post created successfully on LinkedIn',
    data: result,
  });
});

// =============================
//   Google Calender Services
// =============================

/**
 * @swagger
 * /api/v1/composio/google-calendar/initiate-connection:
 *   get:
 *     summary: Initiate Google Calendar Connection
 *     description: Initiates the connection process for Google Calendar, typically returning an OAuth URL.
 *     tags:
 *       - Composio - Google Calendar
 *     responses:
 *       200:
 *         description: Google Calendar connection URL generated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Google Calendar connection URL generated
 *                 data:
 *                   type: object
 *                   properties:
 *                     authorizationUrl:
 *                       type: string
 *                       format: url
 *                       example: "https://accounts.google.com/o/oauth2/auth?..."
 *                   description: The authorization URL to redirect the user to.
 *       500:
 *         description: Internal server error.
 */
const initiateGoogleCalendarConnection = catchAsync(async (req, res) => {
  const result =
    await composioService.initiateGoogleCalendarConnectionService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Google Calendar connection URL generated',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/google-calendar/events:
 *   post:
 *     summary: Create Google Calendar Event
 *     description: Creates a new event in the user's Google Calendar. Requires user authentication for context.
 *     tags:
 *       - Composio - Google Calendar
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - summary
 *               - start
 *               - end
 *             properties:
 *               summary:
 *                 type: string
 *                 description: Title of the calendar event.
 *                 example: Team Meeting
 *               description:
 *                 type: string
 *                 description: Detailed description of the event.
 *                 example: Discuss Q3 strategy and project updates.
 *               location:
 *                 type: string
 *                 description: Location of the event.
 *                 example: Conference Room A
 *               start:
 *                 type: object
 *                 required:
 *                   - dateTime
 *                   - timeZone
 *                 properties:
 *                   dateTime:
 *                     type: string
 *                     format: date-time
 *                     description: Start date and time of the event (ISO 8601 format).
 *                     example: "2024-12-25T09:00:00-07:00"
 *                   timeZone:
 *                     type: string
 *                     description: Time zone of the start time.
 *                     example: "America/Los_Angeles"
 *               end:
 *                 type: object
 *                 required:
 *                   - dateTime
 *                   - timeZone
 *                 properties:
 *                   dateTime:
 *                     type: string
 *                     format: date-time
 *                     description: End date and time of the event (ISO 8601 format).
 *                     example: "2024-12-25T10:00:00-07:00"
 *                   timeZone:
 *                     type: string
 *                     description: Time zone of the end time.
 *                     example: "America/Los_Angeles"
 *               attendees:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: "attendee@example.com"
 *                 description: List of attendees for the event.
 *             example:
 *               summary: "Project Sync"
 *               description: "Weekly project synchronization meeting."
 *               location: "Virtual Meeting"
 *               start:
 *                 dateTime: "2024-12-01T10:00:00-05:00"
 *                 timeZone: "America/New_York"
 *               end:
 *                 dateTime: "2024-12-01T11:00:00-05:00"
 *                 timeZone: "America/New_York"
 *               attendees:
 *                 - email: "john.doe@example.com"
 *                 - email: "jane.smith@example.com"
 *     responses:
 *       200:
 *         description: Event created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Event created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "event123abc"
 *                     htmlLink:
 *                       type: string
 *                       format: url
 *                       example: "https://www.google.com/calendar/event?eid=..."
 *                   description: Details of the created calendar event.
 *       400:
 *         description: Bad request, e.g., missing required event fields.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
const createCalendarEvent = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (body, user) instead of the entire req object
  const result = await composioService.createCalendarEventService({
    body: req.body,
    user: req.user, // Assuming user is available from authentication middleware
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Event created successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/google-calendar/events:
 *   get:
 *     summary: Get Google Calendar Events
 *     description: Retrieves a list of events from the user's Google Calendar. Requires user authentication for context.
 *     tags:
 *       - Composio - Google Calendar
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeMin
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Lower bound (exclusive) for an event's start time to filter by.
 *         example: "2024-11-01T00:00:00Z"
 *       - in: query
 *         name: timeMax
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Upper bound (exclusive) for an event's end time to filter by.
 *         example: "2024-12-31T23:59:59Z"
 *       - in: query
 *         name: maxResults
 *         schema:
 *           type: number
 *           default: 10
 *         description: Maximum number of events to return.
 *         example: 5
 *       - in: query
 *         name: singleEvents
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to expand recurring events into individual instances.
 *         example: true
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [startTime, updated]
 *           default: startTime
 *         description: The order of the events returned in the result.
 *         example: startTime
 *     responses:
 *       200:
 *         description: Fetched upcoming events successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Fetched upcoming events
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "event123abc"
 *                       summary:
 *                         type: string
 *                         example: "Team Standup"
 *                       start:
 *                         type: object
 *                         properties:
 *                           dateTime:
 *                             type: string
 *                             format: date-time
 *                       end:
 *                         type: object
 *                         properties:
 *                           dateTime:
 *                             type: string
 *                             format: date-time
 *                   description: An array of calendar events.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
const getCalendarEvents = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (query, user) instead of the entire req object
  const result = await composioService.getCalendarEventsService({
    query: req.query,
    user: req.user, // Assuming user is available from authentication middleware
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched upcoming events',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/google-calendar/events/{id}:
 *   delete:
 *     summary: Delete Google Calendar Event
 *     description: Deletes a specific event from the user's Google Calendar by its ID. Requires user authentication for context.
 *     tags:
 *       - Composio - Google Calendar
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the calendar event to delete.
 *         example: "event123abc"
 *     responses:
 *       200:
 *         description: Event deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Event deleted successfully
 *                 data:
 *                   type: object
 *                   description: Confirmation of event deletion.
 *       400:
 *         description: Bad request, e.g., missing event ID.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Event not found.
 *       500:
 *         description: Internal server error.
 */
const deleteCalendarEvent = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (params, user) instead of the entire req object
  const result = await composioService.deleteCalendarEventService({
    params: req.params,
    user: req.user, // Assuming user is available from authentication middleware
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Event deleted successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/google-calendar/events/{id}:
 *   patch:
 *     summary: Update Google Calendar Event
 *     description: Updates an existing event in the user's Google Calendar by its ID. Requires user authentication for context.
 *     tags:
 *       - Composio - Google Calendar
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the calendar event to update.
 *         example: "event123abc"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               summary:
 *                 type: string
 *                 description: New title of the calendar event.
 *                 example: Updated Team Meeting
 *               description:
 *                 type: string
 *                 description: Updated detailed description of the event.
 *                 example: Discuss Q3 strategy and project updates (updated agenda).
 *               location:
 *                 type: string
 *                 description: New location of the event.
 *                 example: Virtual Meeting Room
 *               start:
 *                 type: object
 *                 properties:
 *                   dateTime:
 *                     type: string
 *                     format: date-time
 *                     description: New start date and time of the event (ISO 8601 format).
 *                     example: "2024-12-25T09:30:00-07:00"
 *                   timeZone:
 *                     type: string
 *                     description: New time zone of the start time.
 *                     example: "America/Los_Angeles"
 *               end:
 *                 type: object
 *                 properties:
 *                   dateTime:
 *                     type: string
 *                     format: date-time
 *                     description: New end date and time of the event (ISO 8601 format).
 *                     example: "2024-12-25T10:30:00-07:00"
 *                   timeZone:
 *                     type: string
 *                     description: New time zone of the end time.
 *                     example: "America/Los_Angeles"
 *               attendees:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: "new_attendee@example.com"
 *                 description: Updated list of attendees for the event.
 *             example:
 *               summary: "Updated Project Sync"
 *               location: "New Virtual Room"
 *               start:
 *                 dateTime: "2024-12-01T10:30:00-05:00"
 *                 timeZone: "America/New_York"
 *     responses:
 *       200:
 *         description: Event updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Event updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "event123abc"
 *                     summary:
 *                       type: string
 *                       example: "Updated Team Meeting"
 *                   description: Details of the updated calendar event.
 *       400:
 *         description: Bad request, e.g., invalid event data.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Event not found.
 *       500:
 *         description: Internal server error.
 */
const updateCalendarEvent = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (params, body, user) instead of the entire req object
  const result = await composioService.updateCalendarEventService({
    params: req.params,
    body: req.body,
    user: req.user, // Assuming user is available from authentication middleware
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Event updated successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/github:
 *   get:
 *     summary: Get GitHub Integration Information
 *     description: Retrieves information about the configured GitHub integration.
 *     tags:
 *       - Composio - GitHub
 *     responses:
 *       200:
 *         description: Successfully fetched GitHub integration info.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Fetched GitHub integration
 *                 data:
 *                   type: object
 *                   description: GitHub integration details.
 *       500:
 *         description: Internal server error.
 */
const getGithubIntegration = catchAsync(async (req, res) => {
  const result = await composioService.getGithubIntegrationService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched GitHub integration',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/github/initiate-connection:
 *   get:
 *     summary: Initiate GitHub Connection
 *     description: Initiates the connection process for GitHub, typically returning an OAuth URL.
 *     tags:
 *       - Composio - GitHub
 *     responses:
 *       200:
 *         description: Initiated GitHub connection.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Initiated GitHub connection
 *                 data:
 *                   type: object
 *                   properties:
 *                     authorizationUrl:
 *                       type: string
 *                       format: url
 *                       example: "https://github.com/login/oauth/authorize?..."
 *                   description: The authorization URL to redirect the user to.
 *       500:
 *         description: Internal server error.
 */
const initiateGithubConnection = catchAsync(async (req, res) => {
  // Security Fix: Using a configured integrationId instead of taking it from req.body
  // Taking integrationId from req.body could lead to IDOR if not properly validated by the service.
  const result =
    await composioService.initiateGithubConnectionService(githubIntegrationId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Initiated GitHub connection',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/github/issues:
 *   post:
 *     summary: Create GitHub Issue
 *     description: Creates a new issue in a specified GitHub repository. Requires user authentication for context.
 *     tags:
 *       - Composio - GitHub
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - owner
 *               - repo
 *               - title
 *             properties:
 *               owner:
 *                 type: string
 *                 description: The owner of the GitHub repository.
 *                 example: "octocat"
 *               repo:
 *                 type: string
 *                 description: The name of the GitHub repository.
 *                 example: "hello-world"
 *               title:
 *                 type: string
 *                 description: The title of the new issue.
 *                 example: "Bug: Login button not working"
 *               body:
 *                 type: string
 *                 description: The body text of the new issue.
 *                 example: "The login button on the homepage does not respond to clicks."
 *               labels:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Labels to apply to the issue.
 *                 example: ["bug", "frontend"]
 *               assignees:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Logins of users to assign to the issue.
 *                 example: ["monalisa"]
 *             example:
 *               owner: "my-org"
 *               repo: "my-project"
 *               title: "New Feature Request: Dark Mode"
 *               body: "Users are requesting a dark mode option for the application interface."
 *               labels: ["enhancement"]
 *     responses:
 *       200:
 *         description: GitHub issue created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: GitHub issue created
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                       example: 1
 *                     html_url:
 *                       type: string
 *                       format: url
 *                       example: "https://github.com/octocat/hello-world/issues/1"
 *                     title:
 *                       type: string
 *                       example: "Bug: Login button not working"
 *                   description: Details of the created GitHub issue.
 *       400:
 *         description: Bad request, e.g., missing required fields.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
const createGithubIssue = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (body, user) instead of the entire req object
  const result = await composioService.createGithubIssueService({
    body: req.body,
    user: req.user, // Assuming user is available from authentication middleware
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'GitHub issue created',
    data: result,
  });
});

// =============================
//     Amazon Controller
// =============================

/**
 * @swagger
 * /api/v1/composio/amazon/initiate-connection:
 *   get:
 *     summary: Initiate Amazon Connection
 *     description: Initiates the connection process for Amazon, typically returning an OAuth URL or similar.
 *     tags:
 *       - Composio - Amazon
 *     responses:
 *       200:
 *         description: Amazon connection initiated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Amazon connection initiated
 *                 data:
 *                   type: object
 *                   properties:
 *                     authorizationUrl:
 *                       type: string
 *                       format: url
 *                       example: "https://www.amazon.com/ap/oa?client_id=..."
 *                   description: The authorization URL to redirect the user to.
 *       500:
 *         description: Internal server error.
 */
const initiateAmazonConnection = catchAsync(async (req, res) => {
  // Security Fix: Using a configured integrationId instead of taking it from req.body
  // Taking integrationId from req.body could lead to IDOR if not properly validated by the service.
  const result =
    await composioService.initiateAmazonConnectionService(amazonIntegrationId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Amazon connection initiated',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/amazon/search-product:
 *   get:
 *     summary: Search Amazon Products
 *     description: Searches for products on Amazon based on a query. Requires user authentication for context.
 *     tags:
 *       - Composio - Amazon
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: keywords
 *         schema:
 *           type: string
 *         required: true
 *         description: The keywords to search for on Amazon.
 *         example: "laptop"
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Optional product category to narrow the search.
 *         example: "Electronics"
 *       - in: query
 *         name: brand
 *         schema:
 *           type: string
 *         description: Optional brand to filter products.
 *         example: "Dell"
 *     responses:
 *       200:
 *         description: Amazon product search successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Amazon product search successful
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       asin:
 *                         type: string
 *                         example: "B08L8HPW6M"
 *                       title:
 *                         type: string
 *                         example: "Apple MacBook Air M1 Chip"
 *                       price:
 *                         type: object
 *                         properties:
 *                           amount:
 *                             type: number
 *                             example: 999.99
 *                           currency:
 *                             type: string
 *                             example: "USD"
 *                       productUrl:
 *                         type: string
 *                         format: url
 *                         example: "https://www.amazon.com/..."
 *                   description: An array of Amazon product search results.
 *       400:
 *         description: Bad request, e.g., missing keywords.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
const searchAmazonProduct = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (query, user) instead of the entire req object
  const result = await composioService.searchAmazonProductService({
    query: req.query,
    user: req.user, // Assuming user is available from authentication middleware
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Amazon product search successful',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/twitter/initiate-connection:
 *   get:
 *     summary: Initiate Twitter Connection
 *     description: Initiates the connection process for Twitter, typically returning an OAuth URL.
 *     tags:
 *       - Composio - Twitter
 *     responses:
 *       200:
 *         description: Twitter connection URL generated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Twitter connection URL generated
 *                 data:
 *                   type: object
 *                   properties:
 *                     authorizationUrl:
 *                       type: string
 *                       format: url
 *                       example: "https://api.twitter.com/oauth/authorize?oauth_token=..."
 *                   description: The authorization URL to redirect the user to.
 *       500:
 *         description: Internal server error.
 */
const initiateTwitterConnection = catchAsync(async (req, res) => {
  const result = await composioService.initiateTwitterConnectionService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Twitter connection URL generated',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/twitter/tweet:
 *   post:
 *     summary: Post a Tweet
 *     description: Posts a new tweet to the user's Twitter account. Requires user authentication for context.
 *     tags:
 *       - Composio - Twitter
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: The content of the tweet.
 *                 example: "Hello Twitter from Composio! #API"
 *             example:
 *               text: "Just posted my first tweet via Composio integration!"
 *     responses:
 *       200:
 *         description: Tweet posted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tweet posted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "1460323737035677698"
 *                     text:
 *                       type: string
 *                       example: "Hello Twitter from Composio! #API"
 *                   description: Details of the posted tweet.
 *       400:
 *         description: Bad request, e.g., missing tweet text.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
const postTweet = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (body, user) instead of the entire req object
  const result = await composioService.postTweetService({
    body: req.body,
    user: req.user, // Assuming user is available from authentication middleware
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tweet posted successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/twitter/tweet/{id}:
 *   delete:
 *     summary: Delete a Tweet
 *     description: Deletes a specific tweet by its ID from the user's Twitter account. Requires user authentication for context.
 *     tags:
 *       - Composio - Twitter
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the tweet to delete.
 *         example: "1460323737035677698"
 *     responses:
 *       200:
 *         description: Tweet deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tweet deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "1460323737035677698"
 *                     deleted:
 *                       type: boolean
 *                       example: true
 *                   description: Confirmation of tweet deletion.
 *       400:
 *         description: Bad request, e.g., missing tweet ID.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: Tweet not found or not authorized to delete.
 *       500:
 *         description: Internal server error.
 */
const deleteTweet = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (params, user) instead of the entire req object
  const result = await composioService.deleteTweetService({
    params: req.params,
    user: req.user, // Assuming user is available from authentication middleware
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tweet deleted successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/twitter/follow:
 *   post:
 *     summary: Follow a Twitter User
 *     description: Follows a specified Twitter user. Requires user authentication for context.
 *     tags:
 *       - Composio - Twitter
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetUsername
 *             properties:
 *               targetUsername:
 *                 type: string
 *                 description: The username of the Twitter user to follow.
 *                 example: "elonmusk"
 *             example:
 *               targetUsername: "nodejs"
 *     responses:
 *       200:
 *         description: Followed user successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Followed user successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     following:
 *                       type: boolean
 *                       example: true
 *                     target_user_id:
 *                       type: string
 *                       example: "2244994945"
 *                   description: Confirmation of following the user.
 *       400:
 *         description: Bad request, e.g., missing targetUsername.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
const followTwitterUser = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (body, user) instead of the entire req object
  const result = await composioService.followTwitterUserService({
    body: req.body,
    user: req.user, // Assuming user is available from authentication middleware
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Followed user successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/twitter/user/{username}:
 *   get:
 *     summary: Get Twitter User by Username
 *     description: Retrieves information about a Twitter user by their username. Requires user authentication for context.
 *     tags:
 *       - Composio - Twitter
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         schema:
 *           type: string
 *         required: true
 *         description: The username of the Twitter user to retrieve.
 *         example: "twitterdev"
 *       - in: query
 *         name: userFields
 *         schema:
 *           type: string
 *         description: Comma-separated list of user fields to include in the response (e.g., "profile_image_url,public_metrics").
 *         example: "description,location"
 *     responses:
 *       200:
 *         description: Twitter user info retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Twitter user info retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "2244994945"
 *                     name:
 *                       type: string
 *                       example: "Twitter Dev"
 *                     username:
 *                       type: string
 *                       example: "TwitterDev"
 *                     description:
 *                       type: string
 *                       example: "The official Twitter account for Twitter's developer platform."
 *                     profile_image_url:
 *                       type: string
 *                       format: url
 *                       example: "https://pbs.twimg.com/profile_images/..."
 *                   description: Details of the Twitter user.
 *       400:
 *         description: Bad request, e.g., missing username.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       404:
 *         description: User not found.
 *       500:
 *         description: Internal server error.
 */
const getTwitterUserByUsername = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (params, query, user) instead of the entire req object
  const result = await composioService.getTwitterUserByUsernameService({
    params: req.params,
    query: req.query,
    user: req.user, // Assuming user is available from authentication middleware
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Twitter user info retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/twitter/dm:
 *   post:
 *     summary: Send Direct Message by Username
 *     description: Sends a direct message to a specified Twitter user by their username. Requires user authentication for context.
 *     tags:
 *       - Composio - Twitter
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipientUsername
 *               - message
 *             properties:
 *               recipientUsername:
 *                 type: string
 *                 description: The username of the recipient.
 *                 example: "twitteruser"
 *               message:
 *                 type: string
 *                 description: The content of the direct message.
 *                 example: "Hi, checking in about our previous conversation."
 *             example:
 *               recipientUsername: "anotheruser"
 *               message: "Just sent you a DM via Composio!"
 *     responses:
 *       200:
 *         description: Message sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Message sent successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     dm_id:
 *                       type: string
 *                       example: "1460323737035677698"
 *                     text:
 *                       type: string
 *                       example: "Hi, checking in about our previous conversation."
 *                   description: Details of the sent direct message.
 *       400:
 *         description: Bad request, e.g., missing recipientUsername or message.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
const sendDMByUsername = catchAsync(async (req, res) => {
  // Design Fix: Pass specific data (body, user) instead of the entire req object
  const result = await composioService.sendDMByUsernameService({
    body: req.body,
    user: req.user, // Assuming user is available from authentication middleware
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Message sent successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/composio/connected-accounts:
 *   get:
 *     summary: Get All Connected Accounts
 *     description: Retrieves a list of all accounts connected via Composio for the authenticated user.
 *     tags:
 *       - Composio - General
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connected accounts retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Connected accounts retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       connectedAccountId:
 *                         type: string
 *                         example: "gmail-acc-123"
 *                       provider:
 *                         type: string
 *                         example: "gmail"
 *                       status:
 *                         type: string
 *                         example: "active"
 *                       userIdentifier:
 *                         type: string
 *                         example: "user@example.com"
 *                   description: An array of connected account objects.
 *       401:
 *         description: Unauthorized, authentication token is missing or invalid.
 *       500:
 *         description: Internal server error.
 */
const getAllConnectedAccountsService = catchAsync(async (req, res) => {
  const result = await composioService.getAllConnectedAccountsService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Connected accounts retrieved successfully',
    data: result,
  });
});

/**
 * @namespace composioController
 * @description Controller for handling Composio integration related API requests.
 * This object consolidates all the endpoint handlers for various Composio-powered services
 * like Gmail, YouTube, LinkedIn, Google Calendar, GitHub, Amazon, and Twitter.
 */
export const composioController = {
  getGmailIntegration,
  initiateGmailConnection,
  sendEmail,
  getYouTubeIntegration,
  initiateYouTubeConnection,
  searchYouTube,
  disconnectYouTubeAccount,
  startLinkedInOAuth,
  handleLinkedInCallback,
  postToLinkedIn,
  initiateGoogleCalendarConnection,
  createCalendarEvent,
  getCalendarEvents,
  deleteCalendarEvent,
  updateCalendarEvent,
  getGithubIntegration,
  initiateGithubConnection,
  createGithubIssue,
  initiateAmazonConnection,
  searchAmazonProduct,
  initiateTwitterConnection,
  postTweet,
  deleteTweet,
  followTwitterUser,
  getTwitterUserByUsername,
  sendDMByUsername,
  getAllIntegrations,
  authorizeGmailIntegration,
  sendEmailWithComposio,
  getAllConnectedAccountsService,
};