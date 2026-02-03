import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { composioSocialMediaService } from './composio.socialmedia.service.js';

// =============================
//      LinkedIn Controller
// =============================

const getLinkedInIntegration = catchAsync(async (req, res) => {
  const result =
    await composioSocialMediaService.getLinkedInIntegrationService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get LinkedIn integration successfully',
    data: result,
  });
});
const initiateLinkedInConnection = catchAsync(async (req, res) => {
  const { integrationId } = req.body;
  const result =
    await composioSocialMediaService.initiateLinkedInConnectionService(
      integrationId,
    );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LinkedIn connection URL generated',
    data: result,
  });
});
const createLinkedinPost = catchAsync(async (req, res) => {
  const result =
    await composioSocialMediaService.createLinkedinPostService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Post created successfully',
    data: result,
  });
});

const deleteLinkedinPost = catchAsync(async (req, res) => {
  const result =
    await composioSocialMediaService.deleteLinkedinPostService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Post deleted successfully',
    data: result,
  });
});

const getLinkedinProfile = catchAsync(async (req, res) => {
  const result =
    await composioSocialMediaService.getLinkedinProfileService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched LinkedIn profile',
    data: result,
  });
});

const getLinkedinCompanyInfo = catchAsync(async (req, res) => {
  const result =
    await composioSocialMediaService.getLinkedinCompanyInfoService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched LinkedIn company info',
    data: result,
  });
});

// =============================
//     Twitter Controller
// =============================

const getTwitterIntegration = catchAsync(async (req, res) => {
  const result =
    await composioSocialMediaService.getTwitterIntegrationService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched Slack integration',
    data: result,
  });
});
const twitterSendDMByUsername = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.sendDMByUsernameService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Message sent successfully',
    data: result,
  });
});
const initiateTwitterConnection = catchAsync(async (req, res) => {
  const { integrationId } = req.body;
  const result =
    await composioSocialMediaService.initiateTwitterConnectionService(
      integrationId,
    );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Twitter connection URL generated',
    data: result,
  });
});

const postTweet = catchAsync(async (req, res) => {
  const result = await composioSocialMediaService.postTweetService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tweet posted successfully',
    data: result,
  });
});

const deleteTweet = catchAsync(async (req, res) => {
  const result = await composioSocialMediaService.deleteTweetService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tweet deleted successfully',
    data: result,
  });
});

const followTwitterUser = catchAsync(async (req, res) => {
  const result = await composioSocialMediaService.followTwitterUserService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Followed user successfully',
    data: result,
  });
});
const getTwitterUserByUsername = catchAsync(async (req, res) => {
  const result =
    await composioSocialMediaService.getTwitterUserByUsernameService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Twitter user info retrieved successfully',
    data: result,
  });
});

export const composioSocialMediaController = {
  getLinkedInIntegration,
  twitterSendDMByUsername,
  initiateLinkedInConnection,
  createLinkedinPost,
  deleteLinkedinPost,
  getLinkedinProfile,
  getLinkedinCompanyInfo,
  getTwitterIntegration,
  initiateTwitterConnection,
  postTweet,
  deleteTweet,
  followTwitterUser,
  getTwitterUserByUsername,
};
