import axios from 'axios';
import { OpenAIToolSet } from 'composio-core';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';

const integrationId = '5c9834e1-14b3-4c06-9262-606bce538a9f';
const toolset = new OpenAIToolSet({ apiKey: config.composio.apiKey });

const getGmailIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: '9716ebb0-5dfa-420c-9033-2cae4f5b61ae',
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });
  const data = { integration, inputFields };
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
      headers: {
        'x-api-key': config.composio.apiKey,
        'Content-Type': 'application/json',
      },
    },
  );

  const data = {
    success: true,
    data: response.data,
  };
  return data;
};

// =============================
//      Youtub Services
// =============================

const youtubeIntegrationId = 'f16f5b45-f9fa-4d65-b319-e9046564edee';
const getYouTubeIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: youtubeIntegrationId,
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });

  return { integration, inputFields };
};
const initiateYouTubeConnectionService = async () => {
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId: youtubeIntegrationId,
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
      headers: {
        'x-api-key': config.composio.apiKey,
        'Content-Type': 'application/json',
      },
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

// =============================
//      Twitter Services
// =============================

const twitterIntegrationId = '03615643-b71c-4a13-a012-4f7f94d92bc8';
const initiateTwitterConnectionService = async () => {
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId: twitterIntegrationId,
    entityId: 'default',
  });

  return {
    redirectUrl: connectedAccount.redirectUrl,
    connectedAccountId: connectedAccount.connectedAccountId,
    connectionStatus: connectedAccount.connectionStatus,
  };
};

const postTweetService = async req => {
  const { connectedAccountId, text } = req.body;

  if (!connectedAccountId || !text) {
    return { error: 'Missing required fields: connectedAccountId, text' };
  }

  const actionId = 'TWITTER_CREATION_OF_A_POST';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: twitterIntegrationId,
      connectedAccountId,
      input: { text },
    },
    {
      headers: {
        'x-api-key': config.composio.apiKey,
        'Content-Type': 'application/json',
      },
    },
  );

  return {
    success: true,
    data: response.data,
  };
};
const deleteTweetService = async req => {
  const { connectedAccountId, tweetId } = req.body;

  if (!connectedAccountId || !tweetId) {
    return { error: 'Missing required fields: connectedAccountId, tweetId' };
  }

  const actionId = 'TWITTER_POST_DELETE_BY_POST_ID';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: twitterIntegrationId,
      connectedAccountId,
      input: {
        post_id: tweetId,
      },
    },
    {
      headers: {
        'x-api-key': config.composio.apiKey,
        'Content-Type': 'application/json',
      },
    },
  );

  return { success: true, data: response.data };
};

const followTwitterUserService = async req => {
  const { connectedAccountId, username } = req.body;

  if (!connectedAccountId || !username) {
    return { error: 'Missing required fields: connectedAccountId, username' };
  }

  const actionId = 'TWITTER_FOLLOW_USER';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: twitterIntegrationId,
      connectedAccountId,
      input: { username },
    },
    {
      headers: {
        'x-api-key': config.composio.apiKey,
        'Content-Type': 'application/json',
      },
    },
  );

  return { success: true, data: response.data };
};
const getTwitterUserByUsernameService = async req => {
  const { connectedAccountId, username } = req.body;

  if (!connectedAccountId || !username) {
    return { error: 'Missing required fields: connectedAccountId, username' };
  }

  const actionId = 'TWITTER_USER_LOOKUP_BY_USERNAMES';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: twitterIntegrationId,
      connectedAccountId,
      input: { usernames: [username] }, // note: array of usernames expected
    },
    {
      headers: {
        'x-api-key': config.composio.apiKey,
        'Content-Type': 'application/json',
      },
    },
  );

  return { success: true, data: response.data };
};

const getUserIdFromUsername = async (connectedAccountId, username) => {
  const actionId = 'TWITTER_USER_LOOKUP_BY_USERNAMES';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: twitterIntegrationId,
      connectedAccountId,
      input: { usernames: [username] },
    },
    {
      headers: {
        'x-api-key': config.composio.apiKey,
        'Content-Type': 'application/json',
      },
    }
  );
console.log('Response from Twitter API:', JSON.stringify(response.data, null, 2));


  const users = response.data.data.data;
  if (users && users.length > 0) {
    return users[0].id;
  }
  throw new Error('User not found');
};

// Step 2: Send DM by user ID (participant_id)
const sendDMByUsernameService = async req => {
  const { connectedAccountId, username, text } = req.body;

  if (!connectedAccountId || !username || !text) {
    return {
      error: 'Missing required fields: connectedAccountId, username, text',
    };
  }

  try {
    const participant_id = await getUserIdFromUsername(
      connectedAccountId,
      username,
    );

    const actionId = 'TWITTER_SEND_A_NEW_MESSAGE_TO_A_USER';
    const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

    const response = await axios.post(
      url,
      {
        integrationId: twitterIntegrationId,
        connectedAccountId,
        input: {
          participant_id, // Use participant_id instead of target_user_id
          text,
        },
      },
      {
        headers: {
          'x-api-key': config.composio.apiKey,
          'Content-Type': 'application/json',
        },
      },
    );

    return { success: true, data: response.data };
  } catch (error) {
    return { error: error.message };
  }
};
// =============================
//      LinkedIn Services
// =============================

const getLinkedInOAuthRedirectUrlService = async (integrationId, entityId) => {
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId,
    entityId,
  });
  return connectedAccount.redirectUrl;
};

const exchangeCodeLinkedInService = async (code, integrationId, entityId) => {
  const connectedAccount = await toolset.connectedAccounts.exchangeCode({
    code,
    integrationId,
    entityId,
  });
  return connectedAccount;
};

const postToLinkedInService = async (
  integrationId,
  connectedAccountId,
  content,
) => {
  const integration = await toolset.integrations.get({
    integrationId: 'ff2c1c00-03ca-4135-9fe7-afa775098c26',
  });
  const expectedInputFields = await toolset.integrations.getRequiredParams(
    integration.id,
  );
  // Collect auth params from your users

  console.log(expectedInputFields);
  return expectedInputFields;
};

// =============================
//   Google Calender Services
// =============================

const calendarIntegrationId = '21c69c18-54ef-464b-a181-dc82f3e5b089';
const initiateGoogleCalendarConnectionService = async () => {
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId: calendarIntegrationId,
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
      integrationId: calendarIntegrationId,
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
      headers: {
        'x-api-key': config.composio.apiKey,
        'Content-Type': 'application/json',
      },
    },
  );

  return {
    success: true,
    data: response.data,
  };
};

const getCalendarEventsService = async req => {
  const { connectedAccountId } = req.body;

  if (!connectedAccountId) {
    return { error: 'Missing required field: connectedAccountId' };
  }

  const actionId = 'GOOGLECALENDAR_EVENTS_LIST';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: calendarIntegrationId,
      connectedAccountId,
      input: {
        calendarId: 'primary', // Use 'primary' for main calendar
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
const deleteCalendarEventService = async req => {
  const { connectedAccountId, eventId, calendarId = 'primary' } = req.body;

  if (!connectedAccountId || !eventId) {
    return {
      error: 'Missing required fields: connectedAccountId, eventId',
    };
  }

  const actionId = 'GOOGLECALENDAR_DELETE_EVENT';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: calendarIntegrationId,
      connectedAccountId,
      input: {
        event_id: eventId,
        calendar_id: calendarId,
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
//      GItHub Services
// =============================

const githubIntegrationId = '394bc42b-5fa8-4777-8e08-6fed12510deb';

const getGithubIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: githubIntegrationId,
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });

  return { integration, inputFields };
};

const initiateGithubConnectionService = async integrationId => {
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
const createGithubIssueService = async req => {
  const { connectedAccountId, owner, repo, title, body } = req.body;

  if (!connectedAccountId || !owner || !repo || !title) {
    return { error: 'Missing required fields' };
  }

  const actionId = 'GITHUB_CREATE_ISSUE';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: githubIntegrationId,
      connectedAccountId,
      input: {
        owner,
        repo,
        title,
        body,
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
//      Amazon Services
// =============================
const initiateAmazonConnectionService = async () => {
  // 1. Get all integrations
  const allIntegrationsResponse = await toolset.integrations.list();
  const integrations = allIntegrationsResponse.items || [];

  // 2. Find Amazon integration
  const amazonIntegration = integrations.find(integration =>
    integration.name.toLowerCase().includes('amazon'),
  );

  if (!amazonIntegration) {
    throw new Error('Amazon integration not found');
  }

  // 3. Initiate OAuth connection
  const connectionRequest = await toolset.connectedAccounts.initiate({
    integrationId: amazonIntegration.id,
    entityId: 'default', // Change as needed, "default" works for testing
  });

  return {
    redirectUrl: connectionRequest.redirectUrl,
    connectedAccountId: connectionRequest.connectedAccountId,
    connectionStatus: connectionRequest.connectionStatus,
  };
};

// const searchAmazonProductService = async req => {
//   const { connectedAccountId, query } = req.body;

//   if (!connectedAccountId || !query) {
//     return { error: 'Missing required fields: connectedAccountId, query' };
//   }

//   const actionId = 'AMAZON_SEARCH_PRODUCT';
//   const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

//   const response = await axios.post(
//     url,
//     {
//       integrationId: amazonIntegrationId, // Replace with your ID
//       connectedAccountId,
//       input: { query },
//     },
//     {
//       headers: {
//         'x-api-key': config.composio.apiKey,
//         'Content-Type': 'application/json',
//       },
//     },
//   );

//   return response.data;
// };

export const composioService = {
  getGmailIntegrationService,
  initiateGmailConnectionService,
  sendEmailService,
  getYouTubeIntegrationService,
  initiateYouTubeConnectionService,
  searchYouTubeService,
  disconnectYouTubeAccountService,
  getLinkedInOAuthRedirectUrlService,
  exchangeCodeLinkedInService,
  postToLinkedInService,
  initiateGoogleCalendarConnectionService,
  createCalendarEventService,
  getCalendarEventsService,
  deleteCalendarEventService,
  updateCalendarEventService,
  getGithubIntegrationService,
  initiateGithubConnectionService,
  createGithubIssueService,
  initiateAmazonConnectionService,
  // searchAmazonProductService,
  initiateTwitterConnectionService,
  postTweetService,
  deleteTweetService,
  followTwitterUserService,
  getTwitterUserByUsernameService,
  sendDMByUsernameService ,
};
