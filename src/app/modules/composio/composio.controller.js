import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { composioService } from './composio.service.js';
// Consolidated on Google Cloud native integrations

const integrationId = '5c9834e1-14b3-4c06-9262-606bce538a9f'; // Put your Composio Gmail integration ID here
const linkedInIntegrationId = 'ff2c1c00-03ca-4135-9fe7-afa775098c26'; // Put your Composio LinkedIn integration ID here
const githubIntegrationId = 'your-github-integration-id'; // Placeholder, should be configured securely
const amazonIntegrationId = 'your-amazon-integration-id'; // Placeholder, should be configured securely
const entityId = 'default'; // This might need to be dynamic based on authenticated user/tenant

const getGmailIntegration = catchAsync(async (req, res) => {
  const result = await composioService.getGmailIntegrationService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully Get all Support Requests', // Message seems generic, consider making it specific to Gmail integration
    data: result,
  });
});

const getAllIntegrations = catchAsync(async (req, res) => {
  const result = await composioService.getAllIntegrationsService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Integrations retrieved successfully',
    data: result,
  });
});

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

const getYouTubeIntegration = catchAsync(async (req, res) => {
  const result = await composioService.getYouTubeIntegrationService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully fetched YouTube integration info',
    data: result,
  });
});

const initiateYouTubeConnection = catchAsync(async (req, res) => {
  const result = await composioService.initiateYouTubeConnectionService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully initiated YouTube connection',
    data: result,
  });
});

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

const startLinkedInOAuth = catchAsync(async (req, res) => {
  // Bug Fix: Wrapped in catchAsync for consistent error handling
  const redirectUrl = await composioService.getOAuthRedirectUrlService(
    linkedInIntegrationId,
    entityId
  );
  // For redirects, res.redirect is the correct approach, not sendResponse
  res.redirect(redirectUrl);
});

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

const getGithubIntegration = catchAsync(async (req, res) => {
  const result = await composioService.getGithubIntegrationService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched GitHub integration',
    data: result,
  });
});

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

const initiateTwitterConnection = catchAsync(async (req, res) => {
  const result = await composioService.initiateTwitterConnectionService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Twitter connection URL generated',
    data: result,
  });
});

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

const getAllConnectedAccountsService = catchAsync(async (req, res) => {
  const result = await composioService.getAllConnectedAccountsService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Connected accounts retrieved successfully',
    data: result,
  });
});

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