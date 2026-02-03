import axios from 'axios';
import { OpenAIToolSet } from 'composio-core';
import config from '../../../../../config/index.js';
import ApiError from '../../../../errors/ApiError.js';

const toolset = new OpenAIToolSet({ apiKey: config.composio.apiKey });

const headers = {
  'x-api-key': config.composio.apiKey,
  'Content-Type': 'application/json',
};

// =============================
//     Gmail Services
// =============================

const getGmailIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: gmailIntegrationId,
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });
  // const data = { integration, inputFields };
  // return data;
  const data = integration.id;
  return data;
};

const initiateGmailConnectionService = async integrationId => {
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId,
    entityId: 'default', // or user ID if multi-user
  });

  const data = {
    redirectUrl: connectedAccount.redirectUrl, // 🔁 Send user to this URL to authorize
    connectedAccountId: connectedAccount.connectedAccountId,
    connectionStatus: connectedAccount.connectionStatus,
  };
  return data;
};

const sendEmailService = async req => {
  const {
    integrationId,
    connectedAccountId,
    to,
    subject,
    message,
    isHtml = false,
  } = req.body;

  if (!connectedAccountId || !to || !subject || !message) {
    // return res.status(400).json({
    //   error:
    //     'Missing required fields: connectedAccountId, to, subject, message',
    // });
    throw new ApiError(
      400,
      'Missing required fields: connectedAccountId, to, subject, message',
    );
  }

  const actionId = 'GMAIL_SEND_EMAIL';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId,
      connectedAccountId,
      input: {
        user_id: 'me',
        recipient_email: to,
        subject,
        body: message,
        is_html: isHtml,
      },
    },
    {
      headers,
    },
  );

  const data = {
    success: true,
    data: response.data,
  };
  return data;
};

// =============================
//     Googlemeet Services
// =============================

const getGooglemeetIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: googlemeetIntegrationId,
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });

  return { integration, inputFields };
};

const initiateGooglemeetConnectionService = async integrationId => {
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId: integrationId,
    entityId: 'default', // Ideally use a real user ID here
  });
  return {
    redirectUrl: connectedAccount.redirectUrl,
    connectedAccountId: connectedAccount.connectedAccountId,
    connectionStatus: connectedAccount.connectionStatus,
  };
};
const createGoogleMeetService = async req => {
  const {
    integrationId,
    connectedAccountId,
    title,
    startTime,
    endTime,
    accessType = 'OPEN',
    entryPointAccess = 'ALL',
  } = req.body;

  if (
    !integrationId ||
    !connectedAccountId ||
    !title ||
    !startTime ||
    !endTime
  ) {
    throw new ApiError(400, 'Missing required fields');
  }

  const actionId = 'GOOGLEMEET_CREATE_MEET';

  try {
    const response = await axios.post(
      `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
      {
        connectedAccountId,
        input: {
          title,
          start_time: startTime,
          end_time: endTime,
          access_type: accessType || 'OPEN',
          entry_point_access: entryPointAccess || 'ALL',
        },
      },
      {
        headers,
      },
    );
    console.log(response, 'Response from Google Meet API:');
    return response.data;
  } catch (error) {
    console.log(error);
    throw new ApiError(500, 'Failed to create Google Meet');
  }
};
const getGoogleMeetDetailsService = async req => {
  const { integrationId, connectedAccountId, space_name } = req.body;
  if (!integrationId || !connectedAccountId || !space_name) {
    throw new ApiError(400, 'Missing required fields');
  }

  const actionId = 'GOOGLEMEET_GET_MEET';
  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: { space_name },
    },
    { headers },
  );
  return response.data;
};

// =============================
//   Google Calender Services
// =============================

const getGoogleCalenderIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: googleCalendarIntegrationId,
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });

  return { integration, inputFields };
};

const initiateGoogleCalendarConnectionService = async integrationId => {
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId,
    entityId: 'default',
  });

  return {
    redirectUrl: connectedAccount.redirectUrl,
    connectedAccountId: connectedAccount.connectedAccountId,
    connectionStatus: connectedAccount.connectionStatus,
  };
};
const createCalendarEventService = async req => {
  const {
    integrationId,
    connectedAccountId,
    summary,
    description,
    startTime,
    endTime,
    timezone = 'Asia/Dhaka',
  } = req.body;

  if (!connectedAccountId || !summary || !startTime || !endTime) {
    return {
      error:
        'Missing required fields: connectedAccountId, summary, startTime, endTime',
    };
  }

  const actionId = 'GOOGLECALENDAR_CREATE_EVENT';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId,
      connectedAccountId,
      input: {
        summary,
        description,
        start_datetime: startTime,
        end_datetime: endTime,
        timezone,
      },
    },
    {
      headers,
    },
  );

  return {
    success: true,
    data: response.data,
  };
};

const getCalendarEventsService = async req => {
  const { integrationId, connectedAccountId } = req.body;

  if (!connectedAccountId) {
    return { error: 'Missing required field: connectedAccountId' };
  }

  const actionId = 'GOOGLECALENDAR_EVENTS_LIST';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId,
      connectedAccountId,
      input: {
        calendarId: 'primary', // Use 'primary' for main calendar
      },
    },
    {
      headers,
    },
  );

  return response.data;
};
const deleteCalendarEventService = async req => {
  const {
    integrationId,
    connectedAccountId,
    eventId,
    calendarId = 'primary',
  } = req.body;

  if (!connectedAccountId || !integrationId || !eventId) {
    return {
      error: 'Missing required fields: connectedAccountId, eventId',
    };
  }

  const actionId = 'GOOGLECALENDAR_DELETE_EVENT';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId,
      connectedAccountId,
      input: {
        event_id: eventId,
        calendar_id: calendarId,
      },
    },
    {
      headers,
    },
  );

  return response.data;
};
const updateCalendarEventService = async req => {
  const {
    connectedAccountId,
    eventId,
    calendarId = 'primary',
    summary,
    description,
    startTime,
    endTime,
    timezone = 'Asia/Dhaka',
  } = req.body;

  if (!connectedAccountId || !eventId) {
    return { error: 'Missing required fields: connectedAccountId, eventId' };
  }

  const actionId = 'GOOGLECALENDAR_PATCH_EVENT';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: calendarIntegrationId,
      connectedAccountId,
      input: {
        calendar_id: calendarId,
        event_id: eventId,
        summary, // optional
        description, // optional
        start_time: startTime, // optional
        end_time: endTime, // optional
        timezone, // optional
      },
    },
    {
      headers: {
        'x-api-key': config.composio.apiKey,
        'Content-Type': 'application/json',
      },
    },
  );

  return response.data;
};
// =============================
//      Youtub Services
// =============================

const getYouTubeIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: youtubeIntegrationId,
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });

  return { integration, inputFields };
};
const initiateYouTubeConnectionService = async integrationId => {
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId,
    entityId: 'default',
  });

  return {
    redirectUrl: connectedAccount.redirectUrl,
    connectedAccountId: connectedAccount.connectedAccountId,
    connectionStatus: connectedAccount.connectionStatus,
  };
};

const searchYouTubeService = async req => {
  const { connectedAccountId, query } = req.body;

  if (!connectedAccountId || !query) {
    throw new ApiError(
      400,
      'Missing required fields: connectedAccountId, and query',
    );
  }

  const actionId = 'YOUTUBE_SEARCH_YOU_TUBE';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: youtubeIntegrationId,
      connectedAccountId,
      input: {
        q: query, // ✅ FIXED HERE
      },
    },
    {
      headers,
    },
  );

  return response.data;
};
const disconnectYouTubeAccountService = async connectedAccountId => {
  const response = await toolset.connectedAccounts.delete({
    connectedAccountId,
  });

  return {
    success: true,
    message: 'Disconnected successfully',
    response,
  };
};

export const composioGoogleService = {
  getGooglemeetIntegrationService,
  initiateGooglemeetConnectionService,
  createGoogleMeetService,
  getGoogleMeetDetailsService,
  getGoogleCalenderIntegrationService,
  initiateGoogleCalendarConnectionService,
  createCalendarEventService,
  getCalendarEventsService,
  deleteCalendarEventService,
  updateCalendarEventService,
  getYouTubeIntegrationService,
  initiateYouTubeConnectionService,
  searchYouTubeService,
  disconnectYouTubeAccountService,
};
