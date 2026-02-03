import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { composioGoogleService } from './composio.google.service.js';
// =============================
//     Gmail Controller
// =============================
const getGmailIntegration = catchAsync(async (req, res) => {
  const result = await composioGoogleService.getGmailIntegrationService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully Get all Support Requests',
    data: result,
  });
});
const initiateGmailConnection = catchAsync(async (req, res) => {
  const { integrationId } = req.body;
  const result =
    await composioGoogleService.initiateGmailConnectionService(integrationId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully Get all Support Requests',
    data: result,
  });
});
const sendEmail = catchAsync(async (req, res) => {
  const result = await composioGoogleService.sendEmailService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully Get all Support Requests',
    data: result,
  });
});

// =============================
//     Googlemeet Controller
// =============================

const getGooglemeetIntegration = catchAsync(async (req, res) => {
  const result = await composioGoogleService.getGooglemeetIntegrationService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched Slack integration',
    data: result,
  });
});

const initiateGooglemeetConnection = catchAsync(async (req, res) => {
  const { integrationId } = req.body;
  const result =
    await composioGoogleService.initiateGooglemeetConnectionService(
      integrationId,
    );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Initiated Slack connection',
    data: result,
  });
});
const createMeetController = catchAsync(async (req, res) => {
  const result = await composioGoogleService.createGoogleMeetService(req);
  res.status(200).json({
    success: true,
    message: 'Google Meet created successfully',
    data: result,
  });
});
const getGoogleMeetDetails = catchAsync(async (req, res) => {
  const result = await composioGoogleService.getGoogleMeetDetailsService(req);
  res.status(200).json({
    success: true,
    message: 'Google Meet details fetched successfully',
    data: result,
  });
});

// =============================
//   Google Calender Controller
// =============================

const initiateGoogleCalenderConnection = catchAsync(async (req, res) => {
  const result =
    await composioGoogleService.getGoogleCalenderIntegrationService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Twitter connection URL generated',
    data: result,
  });
});
const initiateGoogleCalendarConnection = catchAsync(async (req, res) => {
  const { integrationId } = req.body;
  const result =
    await composioGoogleService.initiateGoogleCalendarConnectionService(
      integrationId,
    );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Google Calendar connection URL generated',
    data: result,
  });
});

const createCalendarEvent = catchAsync(async (req, res) => {
  const result = await composioGoogleService.createCalendarEventService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Event created successfully',
    data: result,
  });
});

const getCalendarEvents = catchAsync(async (req, res) => {
  const result = await composioGoogleService.getCalendarEventsService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched upcoming events',
    data: result,
  });
});
const deleteCalendarEvent = catchAsync(async (req, res) => {
  const result = await composioGoogleService.deleteCalendarEventService(req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Event deleted successfully',
    data: result,
  });
});
const updateCalendarEvent = catchAsync(async (req, res) => {
  const result = await composioGoogleService.updateCalendarEventService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Event updated successfully',
    data: result,
  });
});

// =============================
//      Youtub Controller
// =============================

const getYouTubeIntegration = catchAsync(async (req, res) => {
  const result = await composioGoogleService.getYouTubeIntegrationService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully fetched YouTube integration info',
    data: result,
  });
});

const initiateYouTubeConnection = catchAsync(async (req, res) => {
  const { integrationId } = req.body;
  const result =
    await composioGoogleService.initiateYouTubeConnectionService(integrationId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully initiated YouTube connection',
    data: result,
  });
});

const searchYouTube = catchAsync(async (req, res) => {
  const result = await composioGoogleService.searchYouTubeService(req);

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
    await composioGoogleService.disconnectYouTubeAccountService(
      youtubConnectId,
    );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Successfully searched YouTube videos',
    data: result,
  });
});

export const composioGoogleController = {
  getGmailIntegration,
  initiateGmailConnection,
  sendEmail,
  getGmailIntegration,
  initiateGmailConnection,
  sendEmail,
  initiateGoogleCalenderConnection,
  initiateGoogleCalendarConnection,
  createCalendarEvent,
  getCalendarEvents,
  deleteCalendarEvent,
  updateCalendarEvent,
  getGooglemeetIntegration,
  initiateGooglemeetConnection,
  createMeetController,
  getGoogleMeetDetails,
  getYouTubeIntegration,
  initiateYouTubeConnection,
  searchYouTube,
  disconnectYouTubeAccount,
};
