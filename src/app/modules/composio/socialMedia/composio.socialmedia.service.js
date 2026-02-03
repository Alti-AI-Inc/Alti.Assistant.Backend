import axios from 'axios';
import { OpenAIToolSet } from 'composio-core';
import config from '../../../../../config/index.js';

const toolset = new OpenAIToolSet({ apiKey: config.composio.apiKey });

const headers = {
  'x-api-key': config.composio.apiKey,
  'Content-Type': 'application/json',
};

// =============================
//      Twitter Services
// =============================
const getTwitterIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: twitterIntegrationId,
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });

  return { integration, inputFields };
};

const initiateTwitterConnectionService = async integrationId => {
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
      headers,
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
      headers,
    },
  );

  return { success: true, data: response.data };
};
const getTwitterUserId = async (connectedAccountId, username) => {
  const url = `https://backend.composio.dev/api/v2/actions/TWITTER_USER_LOOKUP_BY_USERNAMES/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: twitterIntegrationId,
      connectedAccountId,
      input: {
        usernames: [username],
        user__fields: ['id', 'name', 'username'],
      },
    },
    {
      headers,
    },
  );
  console.log(response, 'Response from Twitter API:');

  const userData = response.data?.data?.data?.[0];
  if (!userData?.id) throw new Error('User ID not found');
  return userData.id;
};

const followTwitterUserService = async req => {
  const { connectedAccountId, username } = req.body;

  if (!connectedAccountId || !username) {
    return { error: 'Missing required fields: connectedAccountId, username' };
  }

  // 1. Get authenticated (source) Twitter user ID
  const authenticatedUserId =
    await composioHelper.getAuthenticatedTwitterUserId(connectedAccountId);

  // 2. Get target Twitter user ID from username
  const targetUserId = await getTwitterUserId(connectedAccountId, username);

  console.log('Authenticated User ID:', authenticatedUserId);
  console.log('Target User ID:', targetUserId);
  console.log('Connected Account ID:', connectedAccountId);

  // 3. Call Follow action
  const followUrl = `https://backend.composio.dev/api/v2/actions/TWITTER_FOLLOW_USER/execute`;

  const response = await axios.post(
    followUrl,
    {
      integrationId: twitterIntegrationId,
      connectedAccountId,
      input: {
        id: authenticatedUserId, // ✅ Authenticated Twitter ID
        target_user_id: targetUserId, // ✅ Target Twitter ID
      },
    },
    {
      headers,
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
      headers,
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
      headers,
    },
  );
  console.log(
    'Response from Twitter API:',
    JSON.stringify(response.data, null, 2),
  );

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
        headers,
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

const getLinkedInIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: linkedInIntegrationId,
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });
  const data = integration.id;
  return data;
};

const initiateLinkedInConnectionService = async integrationId => {
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
const createLinkedinPostService = async req => {
  const { integrationId, connectedAccountId, text, visibility } = req.body;

  const actionId = 'LINKEDIN_CREATE_LINKED_IN_POST';

  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: {
        text,
        visibility: visibility || 'PUBLIC',
      },
    },
    {
      headers: { 'x-api-key': config.composio.apiKey },
    },
  );

  return response.data;
};

const deleteLinkedinPostService = async req => {
  const { integrationId, connectedAccountId, share_id } = req.body;

  const actionId = 'LINKEDIN_DELETE_LINKED_IN_POST';

  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: {
        share_id,
      },
    },
    {
      headers: { 'x-api-key': config.composio.apiKey },
    },
  );

  return response.data;
};

const getLinkedinProfileService = async req => {
  const { integrationId, connectedAccountId } = req.body;

  const actionId = 'LINKEDIN_GET_MY_INFO';

  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: {},
    },
    {
      headers: { 'x-api-key': config.composio.apiKey },
    },
  );

  return response.data;
};

const getLinkedinCompanyInfoService = async req => {
  const { integrationId, connectedAccountId } = req.body;

  const actionId = 'LINKEDIN_GET_COMPANY_INFO';

  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: {},
    },
    {
      headers: { 'x-api-key': config.composio.apiKey },
    },
  );

  return response.data;
};

export const composioSocialMediaService = {
  getLinkedInIntegrationService,
  initiateLinkedInConnectionService,
  createLinkedinPostService,
  deleteLinkedinPostService,
  getLinkedinProfileService,
  getLinkedinCompanyInfoService,
  getTwitterIntegrationService,
  initiateTwitterConnectionService,
  postTweetService,
  deleteTweetService,
  followTwitterUserService,
  getTwitterUserByUsernameService,
  sendDMByUsernameService,
};
