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
//      Slack  services
// =============================

const getSlackIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: slackIntegrationId,
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });

  return { integration, inputFields };
};

const initiateSlackConnectionService = async integrationId => {
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
const sendMessageToChannelService = async req => {
  const { integrationId, connectedAccountId, channel, text } = req.body;
  if (!integrationId || !connectedAccountId || !channel || !text) {
    throw new ApiError(400, 'Missing required fields');
  }

  const actionId = 'SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL';
  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    { integrationId, connectedAccountId, input: { channel, text } },
    { headers },
  );
  return response.data;
};

const sendMessageToUserService = async req => {
  const { integrationId, connectedAccountId, user, text } = req.body;
  if (!integrationId || !connectedAccountId || !user || !text) {
    throw new ApiError(400, 'Missing required fields');
  }

  const actionId = 'SLACK_SEND_MESSAGE_TO_USER';
  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    { integrationId, connectedAccountId, input: { user, text } },
    { headers },
  );
  return response.data;
};

const listSlackChannelsService = async req => {
  const { integrationId, connectedAccountId } = req.body;
  if (!integrationId || !connectedAccountId) {
    throw new ApiError(400, 'Missing required fields');
  }

  const actionId = 'SLACK_LIST_CHANNELS';
  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    { integrationId, connectedAccountId, input: {} },
    { headers },
  );
  return response.data;
};

const createSlackChannelService = async req => {
  const { integrationId, connectedAccountId, name, is_private } = req.body;
  if (!integrationId || !connectedAccountId || !name) {
    throw new ApiError(400, 'Missing required fields');
  }

  const actionId = 'SLACK_CREATE_CHANNEL';
  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: { name, is_private: is_private ?? false },
    },
    { headers },
  );
  return response.data;
};

// =============================
//     Notion Services
// =============================

const getNotionIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: notionIntegrationId,
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });

  return { integration, inputFields };
};

const initiateNotionConnectionService = async integrationId => {
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

const createNotionPageService = async req => {
  const {
    integrationId,
    connectedAccountId,
    parent_page_id,
    title,
    icon,
    cover,
  } = req.body;

  if (!connectedAccountId || !title || !parent_page_id) {
    throw new Error('Missing required fields');
  }

  const actionId = 'NOTION_CREATE_NOTION_PAGE';

  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: {
        parent_id: parent_page_id,
        title,
        icon: icon || null,
        cover: cover || null,
      },
    },
    {
      headers: { 'x-api-key': config.composio.apiKey },
    },
  );

  return response.data;
};
const createNotionDatabaseService = async req => {
  const {
    integrationId,
    connectedAccountId,
    parent_page_id,
    title,
    properties,
  } = req.body;
  const actionId = 'NOTION_CREATE_DATABASE';

  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: {
        parent_page_id,
        title,
        properties,
      },
    },
    {
      headers: { 'x-api-key': config.composio.apiKey },
    },
  );

  return response.data;
};

const appendToNotionPageService = async req => {
  const { integrationId, connectedAccountId, page_id, blocks } = req.body;
  const actionId = 'NOTION_APPEND_BLOCK_CHILDREN_TO_PAGE';

  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: {
        page_id,
        blocks,
      },
    },
    {
      headers: { 'x-api-key': config.composio.apiKey },
    },
  );

  return response.data;
};

const createNotionCommentService = async req => {
  const { integrationId, connectedAccountId, parent_id, rich_text } = req.body;
  const actionId = 'NOTION_CREATE_COMMENT';

  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: {
        parent_id,
        rich_text,
      },
    },
    {
      headers: { 'x-api-key': config.composio.apiKey },
    },
  );

  return response.data;
};

const fetchNotionCommentsService = async req => {
  const { integrationId, connectedAccountId, block_id } = req.body;
  const actionId = 'NOTION_FETCH_COMMENTS';

  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: {
        block_id,
      },
    },
    {
      headers: { 'x-api-key': config.composio.apiKey },
    },
  );

  return response.data;
};

const deleteNotionBlockService = async req => {
  const { integrationId, connectedAccountId, block_id } = req.body;
  const actionId = 'NOTION_DELETE_BLOCK';

  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: {
        block_id,
      },
    },
    {
      headers: { 'x-api-key': config.composio.apiKey },
    },
  );

  return response.data;
};
export const composioProdcutivityService = {
  getSlackIntegrationService,
  initiateSlackConnectionService,
  sendMessageToChannelService,
  sendMessageToUserService,
  listSlackChannelsService,
  createSlackChannelService,
  getNotionIntegrationService,
  initiateNotionConnectionService,
  createNotionPageService,
  createNotionDatabaseService,
  appendToNotionPageService,
  createNotionCommentService,
  fetchNotionCommentsService,
  deleteNotionBlockService,
};
