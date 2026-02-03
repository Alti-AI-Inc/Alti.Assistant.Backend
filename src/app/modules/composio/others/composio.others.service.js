import axios from 'axios';
import { OpenAIToolSet } from 'composio-core';
import config from '../../../../../config/index.js';
import ApiError from '../../../../errors/ApiError.js';
import { githubIntegrationId } from '../composio.constant.js';

const toolset = new OpenAIToolSet({ apiKey: config.composio.apiKey });

const headers = {
  'x-api-key': config.composio.apiKey,
  'Content-Type': 'application/json',
};
// =============================
//      GItHub Services
// =============================

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
    integrationId: integrationId,
    entityId: 'default', // Ideally use a real user ID here
  });
  return {
    redirectUrl: connectedAccount.redirectUrl,
    connectedAccountId: connectedAccount.connectedAccountId,
    connectionStatus: connectedAccount.connectionStatus,
  };
};

const createGitHubRepoService = async req => {
  const { integrationId, connectedAccountId, name, auto_init } = req.body;

  if (!connectedAccountId || !name) {
    throw new Error('Missing required fields');
  }

  const actionId = 'GITHUB_CREATE_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER';

  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId,
      connectedAccountId,
      input: {
        name,
        private: false,
        auto_init,
      },
    },
    {
      headers: { 'x-api-key': config.composio.apiKey },
    },
  );

  return response.data;
};

const getAPullRequestsService = async req => {
  const { integrationId, connectedAccountId, owner, repo, pull_number } =
    req.body;

  if (!connectedAccountId || !owner || !repo) {
    throw new ApiError(
      400,
      'Missing required fields: connectedAccountId, owner, repo',
    );
  }
  // const actionId = 'GITHUB_PULLS_GET';
  const actionId = 'GITHUB_LIST_PULL_REQUESTS';
  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/${actionId}/execute`,
    {
      integrationId: integrationId,
      connectedAccountId,
      input: { owner, repo, pull_number },
    },
    {
      headers,
    },
  );
  console.log(response, 'Response from GitHub API:');
  return response.data;
};
const listGitHubBranchesService = async req => {
  const { connectedAccountId, owner, repo } = req.body;

  if (!connectedAccountId || !owner || !repo) {
    throw new ApiError(
      400,
      'Missing required fields: connectedAccountId, owner, repo',
    );
  }

  const response = await axios.post(
    `https://backend.composio.dev/api/v2/actions/GITHUB_REPO_S_LIST_BRANCHES/execute`,
    {
      integrationId: githubIntegrationId,
      connectedAccountId,
      input: { owner, repo },
    },
    {
      headers,
    },
  );
  console.log(response, 'Response from GitHub API:');

  return response.data;
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
      headers,
    },
  );

  return response.data;
};

const listGitHubReposService = async req => {
  const { connectedAccountId } = req.body;

  if (!connectedAccountId) {
    throw new ApiError(400, 'Missing required field: connectedAccountId');
  }

  // const actionId = 'GITHUB_LIST_REPOSITORIES_FOR_A_USER';
  const actionId = 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: githubIntegrationId,
      connectedAccountId,
      input: {}, // GitHub repo list may not require input, or pass `{ visibility: 'all' }`, etc.
    },
    {
      headers,
    },
  );

  return response.data;
};

const listOfOthersGitHubReposService = async req => {
  const { connectedAccountId, username } = req.body;

  if (!connectedAccountId || !username) {
    throw new ApiError(
      400,
      'Missing required fields: connectedAccountId and username',
    );
  }

  const actionId = 'GITHUB_LIST_REPOSITORIES_FOR_A_USER';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: githubIntegrationId,
      connectedAccountId,
      input: {
        username, // 👈 required input
      },
    },
    {
      headers,
    },
  );

  return response.data;
};
const followGitHubUserService = async req => {
  const { connectedAccountId, username } = req.body;

  if (!connectedAccountId || !username) {
    throw new ApiError(
      400,
      'Missing required fields: connectedAccountId and username',
    );
  }

  const actionId = 'GITHUB_FOLLOW_A_USER';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: githubIntegrationId,
      connectedAccountId,
      input: {
        username,
      },
    },
    {
      headers,
    },
  );

  return response.data;
};
const unfollowGitHubUserService = async req => {
  const { connectedAccountId, username } = req.body;

  if (!connectedAccountId || !username) {
    throw new ApiError(
      400,
      'Missing required fields: connectedAccountId and username',
    );
  }

  const actionId = 'GITHUB_UNFOLLOW_A_USER';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: githubIntegrationId,
      connectedAccountId,
      input: {
        username,
      },
    },
    {
      headers,
    },
  );

  return response.data;
};
const listFollowingGitHubUsersService = async req => {
  const { connectedAccountId } = req.body;

  if (!connectedAccountId) {
    throw new ApiError(400, 'Missing required field: connectedAccountId');
  }

  const actionId = 'GITHUB_LIST_THE_PEOPLE_THE_AUTHENTICATED_USER_FOLLOWS';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: githubIntegrationId,
      connectedAccountId,
      input: {},
    },
    {
      headers,
    },
  );

  return response.data;
};
const listGitHubFollowersService = async req => {
  const { connectedAccountId } = req.body;

  if (!connectedAccountId) {
    throw new ApiError(400, 'Missing required field: connectedAccountId');
  }

  const actionId = 'GITHUB_LIST_FOLLOWERS_OF_THE_AUTHENTICATED_USER';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: githubIntegrationId,
      connectedAccountId,
      input: {},
    },
    {
      headers,
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

const searchAmazonProductService = async req => {
  const { connectedAccountId, query } = req.body;

  if (!connectedAccountId || !query) {
    return { error: 'Missing required fields: connectedAccountId, query' };
  }

  const actionId = 'AMAZON_SEARCH_PRODUCT';
  const url = `https://backend.composio.dev/api/v2/actions/${actionId}/execute`;

  const response = await axios.post(
    url,
    {
      integrationId: amazonIntegrationId, // Replace with your ID
      connectedAccountId,
      input: { query },
    },
    {
      headers,
    },
  );

  return response.data;
};

export const composioOthersService = {
  getGithubIntegrationService,
  initiateGithubConnectionService,
  createGitHubRepoService,
  getAPullRequestsService,
  listGitHubBranchesService,
  createGithubIssueService,
  listGitHubReposService,
  followGitHubUserService,
  unfollowGitHubUserService,
  listFollowingGitHubUsersService,
  listGitHubFollowersService,
  listOfOthersGitHubReposService,
  initiateAmazonConnectionService,
  searchAmazonProductService,
};
