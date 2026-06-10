import express from 'express';
import { composioController } from './composio.controller.js';

const router = express.Router();

// Utility to wrap async controller functions for error handling.
// This ensures that any errors thrown by async functions are caught
// and passed to Express's error handling middleware, preventing
// unhandled promise rejections from crashing the server.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

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

export const composioRoutes = router;