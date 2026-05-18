import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { composioService } from './composio.service.js';
// import { ChatOpenAI } from "@langchain/openai";
// import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
// import { pull } from "langchain/hub";
// import { LangchainToolSet } from "@composio/langchain";

const integrationId = '5c9834e1-14b3-4c06-9262-606bce538a9f'; // Put your Composio Gmail integration ID here
const linkedInIntegrationId = 'ff2c1c00-03ca-4135-9fe7-afa775098c26'; // Put your Composio Gmail integration ID here
const entityId = 'default';

const getGmailIntegration = catchAsync(async (req, res) => {
  const result = await composioService.getGmailIntegrationService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully Get all Support Requests',
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
  const { userEmail } = req.body;
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
  const { integrationId } = req.body;
  const result =
    await composioService.initiateGmailConnectionService(integrationId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully Get all Support Requests',
    data: result,
  });
});
const sendEmail = catchAsync(async (req, res) => {
  const result = await composioService.sendEmailService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully Get all Support Requests',
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
  const result = await composioService.searchYouTubeService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully searched YouTube videos',
    data: result,
  });
});
const disconnectYouTubeAccount = catchAsync(async (req, res) => {
  const youtubConnectId = req.params.id;
  const result =
    await composioService.disconnectYouTubeAccountService(youtubConnectId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully searched YouTube videos',
    data: result,
  });
});

// =============================
//      LinkedIn Controller
// =============================

const startLinkedInOAuth = async (req, res) => {
  try {
    const redirectUrl = await composioService.getOAuthRedirectUrlService(
      linkedInIntegrationId,
      entityId
    );
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('LinkedIn OAuth Start Error:', err);
    res.status(500).send('Failed to start LinkedIn OAuth flow');
  }
};

const handleLinkedInCallback = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code in callback');

    const connectedAccount = await composioService.exchangeCodeService(
      code,
      linkedInIntegrationId,
      entityId
    );

    res.send(
      `LinkedIn Connected! Account ID: ${connectedAccount.connectedAccountId}`
    );
  } catch (err) {
    console.error('LinkedIn Callback Error:', err);
    res.status(500).send('Failed to complete LinkedIn OAuth callback');
  }
};

const postToLinkedIn = async (req, res) => {
  try {
    const { connectedAccountId, content } = req.body;
    if (!connectedAccountId || !content) {
      return res.status(400).send('Missing required fields');
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
  } catch (err) {
    console.error('LinkedIn Post Error:', err);
    res.status(500).send('Failed to post on LinkedIn');
  }
};

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
  const result = await composioService.createCalendarEventService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Event created successfully',
    data: result,
  });
});

const getCalendarEvents = catchAsync(async (req, res) => {
  const result = await composioService.getCalendarEventsService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched upcoming events',
    data: result,
  });
});
const deleteCalendarEvent = catchAsync(async (req, res) => {
  const result = await composioService.deleteCalendarEventService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Event deleted successfully',
    data: result,
  });
});
const updateCalendarEvent = catchAsync(async (req, res) => {
  const result = await composioService.updateCalendarEventService(req);
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
  const { integrationId } = req.body;
  const result =
    await composioService.initiateGithubConnectionService(integrationId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Initiated GitHub connection',
    data: result,
  });
});

const createGithubIssue = catchAsync(async (req, res) => {
  const result = await composioService.createGithubIssueService(req);
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
  const { integrationId } = req.body;
  const result =
    await composioService.initiateAmazonConnectionService(integrationId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Amazon connection initiated',
    data: result,
  });
});

const searchAmazonProduct = catchAsync(async (req, res) => {
  const result = await composioService.searchAmazonProductService(req);

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
  const result = await composioService.postTweetService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tweet posted successfully',
    data: result,
  });
});

const deleteTweet = catchAsync(async (req, res) => {
  const result = await composioService.deleteTweetService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tweet deleted successfully',
    data: result,
  });
});

const followTwitterUser = catchAsync(async (req, res) => {
  const result = await composioService.followTwitterUserService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Followed user successfully',
    data: result,
  });
});
const getTwitterUserByUsername = catchAsync(async (req, res) => {
  const result = await composioService.getTwitterUserByUsernameService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Twitter user info retrieved successfully',
    data: result,
  });
});
const sendDMByUsername = catchAsync(async (req, res) => {
  const result = await composioService.sendDMByUsernameService(req);

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
