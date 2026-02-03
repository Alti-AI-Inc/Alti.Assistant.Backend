import express from 'express';
import { composioGoogleController } from './google/composio.google.controller.js';
import { composioOthersController } from './others/composio.others.controller.js';
import { composioProductivityController } from './productivity/composio.productivity.controller.js';
import { composioSocialMediaController } from './socialMedia/composio.socialmedia.controller.js';

const router = express.Router();

// Gmail routes
router.get('/gmail/auth/start', composioGoogleController.getGmailIntegration);
router.post(
  '/gmail/auth/connect',
  composioGoogleController.initiateGmailConnection,
);
router.post('/gmail/send-email', composioGoogleController.sendEmail);

// YouTube routes
router.get(
  '/youtube/integration',
  composioGoogleController.getYouTubeIntegration,
);
router.post(
  '/youtube/connect',
  composioGoogleController.initiateYouTubeConnection,
);
router.post('/youtube/search', composioGoogleController.searchYouTube);
router.delete(
  '/youtube/disconnect/:id',
  composioGoogleController.disconnectYouTubeAccount,
);

// LinkedIn routes
router.get(
  '/linkedin/auth/start',
  composioSocialMediaController.getLinkedInIntegration,
);
router.post(
  '/linkedin/auth/connect',
  composioSocialMediaController.initiateLinkedInConnection,
);
router.post(
  '/linkedin/create-post',
  composioSocialMediaController.createLinkedinPost,
);
router.delete(
  '/linkedin/delete-post',
  composioSocialMediaController.deleteLinkedinPost,
);
router.get('/linkedin/me', composioSocialMediaController.getLinkedinProfile);
router.get(
  '/linkedin/company-info',
  composioSocialMediaController.getLinkedinCompanyInfo,
);

// Google Calendar routes
router.get(
  '/calendar/integration',
  composioGoogleController.initiateGoogleCalenderConnection,
);
router.post(
  '/calendar/connect',
  composioGoogleController.initiateGoogleCalendarConnection,
);
router.post(
  '/calendar/create-event',
  composioGoogleController.createCalendarEvent,
);
router.post('/calendar/get-events', composioGoogleController.getCalendarEvents);
router.delete(
  '/calendar/delete-event',
  composioGoogleController.deleteCalendarEvent,
);
router.patch(
  '/calendar/update-event',
  composioGoogleController.updateCalendarEvent,
);

// GitHub routes
router.get(
  '/github/integration',
  composioOthersController.getGithubIntegration,
);
router.post(
  '/github/connect',
  composioOthersController.initiateGithubConnection,
);
router.post('/github/create-repo', composioOthersController.createGitHubRepo);
router.post(
  '/github/pull-requests',
  composioOthersController.listGitHubPullRequests,
);
router.post('/github/branches', composioOthersController.listGitHubBranches);
router.post('/github/create-issue', composioOthersController.createGithubIssue);
router.post('/github/follow-user', composioOthersController.followGitHubUser);
router.post('/github/unfollow', composioOthersController.unfollowGitHubUser);
router.post(
  '/github/following',
  composioOthersController.listFollowingGitHubUsers,
);
router.post(
  '/github/followers',
  composioOthersController.listGitHubFollowers,
);
router.post('/github/myself-repos', composioOthersController.listGitHubRepos);
router.post(
  '/github/another-repos',
  composioOthersController.listOfOtherGitHubRepos,
);

// Amazon Routes
router.post(
  '/amazon/connect',
  composioOthersController.initiateAmazonConnection,
);
router.post('/amazon/search', composioOthersController.searchAmazonProduct);

// Twitter Routes
router.get(
  '/twitter/integration',
  composioSocialMediaController.getTwitterIntegration,
);
router.post(
  '/twitter/connect',
  composioSocialMediaController.initiateTwitterConnection,
);
router.post('/twitter/post', composioSocialMediaController.postTweet);
router.post(
  '/twitter/follow-user',
  composioSocialMediaController.followTwitterUser,
);
router.post('/twitter/delete-tweet', composioSocialMediaController.deleteTweet);
router.post(
  '/twitter/user-lookup',
  composioSocialMediaController.getTwitterUserByUsername,
);
router.post(
  '/twitter/send-message',
  composioSocialMediaController.twitterSendDMByUsername,
);

// Slack Routes
router.get(
  '/slack/integration',
  composioProductivityController.getSlackIntegration,
);
router.post(
  '/slack/connect',
  composioProductivityController.initiateSlackConnection,
);
router.post(
  '/slack/send-channel-message',
  composioProductivityController.sendMessageToChannel,
);
router.post(
  '/slack/send-user-message',
  composioProductivityController.sendMessageToUser,
);
router.post(
  '/slack/list-channels',
  composioProductivityController.listSlackChannels,
);
router.post(
  '/slack/create-channel',
  composioProductivityController.createSlackChannel,
);

// Googlemeet Routes
router.get(
  '/googlemeet/integration',
  composioGoogleController.getGooglemeetIntegration,
);
router.post(
  '/googlemeet/connect',
  composioGoogleController.initiateGooglemeetConnection,
);
router.post(
  '/googlemeet/create-meeting',
  composioGoogleController.createMeetController,
);
router.post(
  '/googlemeet/meet-details',
  composioGoogleController.getGoogleMeetDetails,
);

// Notion routes
router.get(
  '/notion/integration',
  composioProductivityController.getNotionIntegration,
);
router.post(
  '/notion/connect',
  composioProductivityController.initiateNotionConnection,
);
router.post(
  '/notion/create-page',
  composioProductivityController.createNotionPage,
);
router.post(
  '/notion/create-database',
  composioProductivityController.createNotionDatabase,
);
router.post(
  '/notion/append-content',
  composioProductivityController.appendToNotionPage,
);
router.post(
  '/notion/create-comment',
  composioProductivityController.createNotionComment,
);
router.post(
  '/notion/fetch-comments',
  composioProductivityController.fetchNotionComments,
);
router.post(
  '/notion/delete-block',
  composioProductivityController.deleteNotionBlock,
);

export const composioRoutes = router;
