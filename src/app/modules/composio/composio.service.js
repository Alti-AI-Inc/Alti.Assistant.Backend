import axios from 'axios';
import { OpenAIToolSet } from 'composio-core';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { Composio } from '@composio/core';
import { GoogleGenerativeAI } from '@google/generative-ai';

// The global 'integrationId' constant was unused and has been removed.

/**
 * @constant {OpenAIToolSet} toolset - An instance of OpenAIToolSet initialized with the Composio API key.
 * Used for interacting with Composio's integration management functionalities.
 */
const toolset = new OpenAIToolSet({ apiKey: config.composio.apiKey });

/**
 * @constant {Composio} composio - An instance of the Composio core library.
 * Used for authorizing toolkits, fetching tools, and handling tool calls.
 */
const composio = new Composio();

/**
 * Recursively capitalizes 'type' fields in a JSON schema and sanitizes it for Gemini compatibility.
 * This function modifies the schema to ensure that type values are uppercase (e.g., 'string' becomes 'STRING', 'int' becomes 'INTEGER')
 * and removes unsupported complex schema structures like 'oneOf', 'anyOf', 'allOf', and specific keys like 'format', 'additionalProperties'.
 * It also removes 'NULL' types as Gemini does not support them within properties.
 *
 * @param {object} schema - The JSON schema object to process.
 * @returns {object} The sanitized and type-capitalized JSON schema.
 */
const capitalizeTypes = (schema) => {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  // Strip unsupported complex schema structures that fail Gemini validation
  if (schema.oneOf || schema.anyOf || schema.allOf) {
    const subSchema = schema.oneOf?.[0] || schema.anyOf?.[0] || schema.allOf?.[0];
    if (subSchema && typeof subSchema === 'object') {
      return capitalizeTypes(subSchema);
    }
    // If subSchema is not an object or doesn't exist, it will be returned as is,
    // effectively stripping the complex structure.
  }

  const newSchema = Array.isArray(schema) ? [] : {};

  for (const [key, value] of Object.entries(schema)) {
    // Strip keys not supported by Gemini schemas
    if (['format', 'additionalProperties', 'anyOf', 'oneOf', 'allOf'].includes(key)) {
      continue;
    }

    if (key === 'type' && typeof value === 'string') {
      let typeVal = value.toUpperCase();
      if (typeVal === 'INT') typeVal = 'INTEGER';
      if (typeVal === 'NULL') continue; // Gemini doesn't support NULL type inside properties
      newSchema[key] = typeVal;
    } else if (typeof value === 'object') {
      newSchema[key] = capitalizeTypes(value);
    } else {
      newSchema[key] = value;
    }
  }

  return newSchema;
};

/**
 * Retrieves details about the Gmail integration and its required input fields.
 * This service fetches the specific Gmail integration by its ID and then
 * gets the parameters needed to interact with it.
 *
 * @returns {Promise<object>} An object containing the integration details and its required input fields.
 * @returns {object} .integration - The Gmail integration object.
 * @returns {object} .inputFields - The required input fields for the Gmail integration.
 */
const getGmailIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: '32b20636-3b36-4aeb-8931-5bc614ddec45',
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });
  const data = { integration, inputFields };
  return data;
};

/**
 * Initiates the OAuth authorization flow for Gmail integration for a given user.
 * This service requests an authorization URL from Composio, which the user
 * must visit to grant permissions.
 *
 * @param {string} userEmail - The email of the user for whom to authorize the Gmail integration.
 * @returns {Promise<object>} An object containing the redirect URL for the OAuth flow.
 * @returns {string} .redirectUrl - The URL to which the user should be redirected to authorize Gmail.
 */
const authorizeGmailIntegrationService = async (userEmail) => {
  const connectionRequest = await composio.toolkits.authorize(
    userEmail,
    'gmail'
  );

  // redirect the user to the OAuth flow
  const redirectUrl = connectionRequest.redirectUrl;
  console.log('Redirect URL:', redirectUrl);
  return {
    redirectUrl,
  };
};

/**
 * Sends an email using the Gmail integration via Composio, leveraging Gemini for function calling.
 * This service takes email details and a connected account ID, fetches the `GMAIL_SEND_EMAIL` tool,
 * translates its schema for Gemini, uses Gemini to generate the tool call, and then executes it
 * through Composio's provider.
 *
 * @param {object} body - The request body containing email details and user information.
 * @param {string} body.userEmail - The email of the user sending the email.
 * @param {string} body.toEmail - The recipient's email address.
 * @param {string} body.subject - The subject of the email.
 * @param {string} body.content - The body content of the email.
 * @param {string} body.connectedAccountId - The ID of the connected Gmail account to use for sending.
 * @returns {Promise<object>} The result of the email sending operation from the Composio API.
 * @throws {ApiError} 400 - If any required fields are missing.
 * @throws {ApiError} 500 - If Gemini fails to generate a Gmail send tool call.
 */
const sendGmailFromAuthorizedAccountService = async (body) => {
  console.log('Sending email with Composio...', body);

  // Fetch tools for your user and execute
  const userEmail = body.userEmail;
  const toEmail = body.toEmail;
  const subject = body.subject;
  const content = body.content;
  const connectedAccountId = body.connectedAccountId; // Ensure you pass the connected account ID

  // Validate required fields
  if (!userEmail || !toEmail || !subject || !content || !connectedAccountId) {
    throw new ApiError(
      400,
      'Missing required fields: userEmail, toEmail, subject, content, connectedAccountId'
    );
  }

  const toolsForResponses = await composio.tools.get(
    userEmail,
    {
      tools: ['GMAIL_SEND_EMAIL'],
      connectedAccountId: connectedAccountId,
    },
    {
      recipient_email: 'admin@altihq.com', // Fixed typo: 'reciepient_email' to 'recipient_email'
    }
  );

  const task = `Send an email to ${toEmail} from ${userEmail} with the subject ${subject} and the body ${content}`;

  // Call Gemini using native @google/generative-ai
  const apiKey = config.gemini_secret_key || process.env.GEMINI_API_KEY;
  const ai = new GoogleGenerativeAI(apiKey);

  // Translate Composio OpenAI tools to Gemini function declarations
  const geminiTools = toolsForResponses.map(t => {
    const functionDecl = {
      name: t.function.name,
      description: t.function.description,
    };
    if (t.function.parameters) {
      functionDecl.parameters = capitalizeTypes(t.function.parameters);
    }
    return { functionDeclarations: [functionDecl] };
  });

  const contents = [
    {
      role: 'user',
      parts: [{ text: task }]
    }
  ];

  const modelInstance = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: geminiTools
  }, {
    systemInstruction: 'You are a helpful assistant that can help with tasks.'
  });

  const response = await modelInstance.generateContent({ contents });
  const functionCalls = response.response.functionCalls();

  if (!functionCalls || functionCalls.length === 0) {
    throw new ApiError(500, 'Gemini failed to generate Gmail send tool call');
  }

  // Map Gemini function calling responses to the mocked OpenAI completion format
  const tool_calls = functionCalls.map((call, index) => ({
    id: `call_${Date.now()}_${index}`,
    type: 'function',
    function: {
      name: call.name,
      arguments: JSON.stringify(call.args)
    }
  }));

  const mockOpenAIMsg = {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: tool_calls
        }
      }
    ]
  };

  // Execute the tool calls using mock OpenAI completions
  const result = await composio.provider.handleToolCalls(userEmail, mockOpenAIMsg, {
    connectedAccountId: connectedAccountId, // Ensure you pass the connected account ID
  });
  console.log(result);
  // Will return the raw response from the GMAIL_SEND_EMAIL API.
  // Removed unconditional success log, as 'result' should be checked for actual success/failure.
};

/**
 * Retrieves a list of all connected accounts for a specific integration and entity.
 *
 * @param {string} integrationId - The ID of the integration (e.g., Gmail, YouTube).
 * @param {string} entityId - The ID of the user/entity whose connected accounts are to be listed.
 *                            This should be derived from the authenticated user in a multi-user environment.
 * @returns {Promise<Array<object>>} An array of connected account objects.
 * @throws {ApiError} 400 - If `integrationId` or `entityId` is missing.
 */
const getAllConnectedAccountsService = async (integrationId, entityId) => {
  // entityId should be derived from the authenticated user in a multi-user environment.
  if (!integrationId) {
    throw new ApiError(400, 'integrationId is required to list connected accounts.');
  }
  if (!entityId) {
    throw new ApiError(400, 'entityId is required to list connected accounts.');
  }
  const connected_accounts = await composio.connectedAccounts.list({
    integrationId, // Used the passed integrationId instead of a hardcoded one.
    entityId,
  });
  console.log(connected_accounts.current_page);
  return connected_accounts.items;
};

/**
 * Retrieves a list of all available Composio integrations and specifically finds the Gmail integration.
 *
 * @returns {Promise<object>} An object containing all integrations, the Gmail integration object, and its ID.
 * @returns {Array<object>} .allIntegrations - An array of all available integration objects.
 * @returns {object} .gmailIntegration - The specific Gmail integration object.
 * @returns {string} .gmailIntegrationId - The ID of the Gmail integration.
 */
const getAllIntegrationsService = async () => {
  const allIntegrations = await toolset.integrations.list();

  // Find Gmail integration
  const gmailIntegration = allIntegrations.items.find(
    (integration) =>
      integration.name.toLowerCase().includes('gmail') ||
      integration.name.toLowerCase().includes('google mail')
  );

  console.log('Gmail Integration:', gmailIntegration);

  return {
    allIntegrations: allIntegrations.items,
    gmailIntegration,
    gmailIntegrationId: gmailIntegration?.id,
  };
};

/**
 * Initiates the connection process for a Gmail account.
 * This involves getting a redirect URL for OAuth and details about the new connected account.
 *
 * @param {string} integrationId - The ID of the Gmail integration.
 * @param {string} entityId - The ID of the user/entity initiating the connection.
 *                            This should be derived from the authenticated user in a multi-user environment.
 * @returns {Promise<object>} An object containing the redirect URL, connected account ID, and connection status.
 * @returns {string} .redirectUrl - The URL to redirect the user to for OAuth authorization.
 * @returns {string} .connectedAccountId - The ID of the newly initiated connected account.
 * @returns {string} .connectionStatus - The current status of the connection.
 * @throws {ApiError} 400 - If `entityId` is missing.
 */
const initiateGmailConnectionService = async (integrationId, entityId) => {
  // entityId should be derived from the authenticated user in a multi-user environment.
  if (!entityId) {
    throw new ApiError(400, 'entityId is required for initiating connection.');
  }
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId,
    entityId, // Use the provided entityId
  });

  const data = {
    redirectUrl: connectedAccount.redirectUrl, // 🔁 Send user to this URL to authorize
    connectedAccountId: connectedAccount.connectedAccountId,
    connectionStatus: connectedAccount.connectionStatus,
  };
  return data;
};

/**
 * Sends an email using a connected Gmail account via the Composio API.
 * This service directly calls the Composio backend to execute the `GMAIL_SEND_EMAIL` action.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing email details.
 * @param {string} req.body.integrationId - The ID of the Gmail integration.
 * @param {string} req.body.connectedAccountId - The ID of the connected Gmail account to use.
 * @param {string} req.body.to - The recipient's email address.
 * @param {string} req.body.subject - The subject of the email.
 * @param {string} req.body.message - The body content of the email.
 * @param {boolean} [req.body.isHtml=false] - Whether the email body is HTML.
 * @returns {Promise<object>} An object indicating success and the response data from the Composio API.
 * @returns {boolean} .success - True if the request was successfully sent to Composio.
 * @returns {object} .data - The raw response data from the Composio API.
 * @throws {ApiError} 400 - If any required fields (`connectedAccountId`, `to`, `subject`, `message`) are missing.
 */
const sendEmailService = async (req) => {
  const {
    integrationId,
    connectedAccountId,
    to,
    subject,
    message,
    isHtml = false,
  } = req.body;

  if (!connectedAccountId || !to || !subject || !message) {
    throw new ApiError(
      400,
      'Missing required fields: connectedAccountId, to, subject, message'
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
    }
  );

  // Consider adding checks for response.data.success or specific error codes from the external API
  const data = {
    success: true,
    data: response.data,
  };
  return data;
};

// =============================
//      Youtub Services
// =============================

/**
 * @constant {string} youtubeIntegrationId - The hardcoded ID for the YouTube integration.
 */
const youtubeIntegrationId = 'f16f5b45-f9fa-4d65-b319-e9046564edee';

/**
 * Retrieves details about the YouTube integration and its required input fields.
 *
 * @returns {Promise<object>} An object containing the integration details and its required input fields.
 * @returns {object} .integration - The YouTube integration object.
 * @returns {object} .inputFields - The required input fields for the YouTube integration.
 */
const getYouTubeIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: youtubeIntegrationId,
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });

  return { integration, inputFields };
};

/**
 * Initiates the connection process for a YouTube account.
 * This involves getting a redirect URL for OAuth and details about the new connected account.
 *
 * @param {string} entityId - The ID of the user/entity initiating the connection.
 *                            This should be derived from the authenticated user in a multi-user environment.
 * @returns {Promise<object>} An object containing the redirect URL, connected account ID, and connection status.
 * @returns {string} .redirectUrl - The URL to redirect the user to for OAuth authorization.
 * @returns {string} .connectedAccountId - The ID of the newly initiated connected account.
 * @returns {string} .connectionStatus - The current status of the connection.
 * @throws {ApiError} 400 - If `entityId` is missing.
 */
const initiateYouTubeConnectionService = async (entityId) => {
  // entityId should be derived from the authenticated user in a multi-user environment.
  if (!entityId) {
    throw new ApiError(400, 'entityId is required for initiating connection.');
  }
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId: youtubeIntegrationId,
    entityId,
  });

  return {
    redirectUrl: connectedAccount.redirectUrl,
    connectedAccountId: connectedAccount.connectedAccountId,
    connectionStatus: connectedAccount.connectionStatus,
  };
};

/**
 * Searches for YouTube videos using a connected YouTube account via the Composio API.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing search parameters.
 * @param {string} req.body.connectedAccountId - The ID of the connected YouTube account to use.
 * @param {string} req.body.query - The search query string.
 * @returns {Promise<object>} The response data from the Composio API containing search results.
 * @throws {ApiError} 400 - If `connectedAccountId` or `query` is missing.
 */
const searchYouTubeService = async (req) => {
  const { connectedAccountId, query } = req.body;

  if (!connectedAccountId || !query) {
    throw new ApiError(
      400,
      'Missing required fields: connectedAccountId, and query'
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
    }
  );

  // Consider adding checks for response.data.success or specific error codes from the external API
  return response.data;
};

/**
 * Disconnects a YouTube account from Composio.
 *
 * @param {string} connectedAccountId - The ID of the connected YouTube account to disconnect.
 * @returns {Promise<object>} An object indicating success and the response from the Composio API.
 * @returns {boolean} .success - True if the account was successfully disconnected.
 * @returns {string} .message - A success message.
 * @returns {object} .response - The raw response from the Composio API.
 */
const disconnectYouTubeAccountService = async (connectedAccountId) => {
  const response = await toolset.connectedAccounts.delete({
    connectedAccountId,
  });

  // Consider adding checks for response.success or specific error codes from the external API
  return {
    success: true,
    message: 'Disconnected successfully',
    response,
  };
};

// =============================
//      Twitter Services
// =============================

/**
 * @constant {string} twitterIntegrationId - The hardcoded ID for the Twitter integration.
 */
const twitterIntegrationId = '03615643-b71c-4a13-a012-4f7f94d92bc8';

/**
 * Initiates the connection process for a Twitter account.
 * This involves getting a redirect URL for OAuth and details about the new connected account.
 *
 * @param {string} entityId - The ID of the user/entity initiating the connection.
 *                            This should be derived from the authenticated user in a multi-user environment.
 * @returns {Promise<object>} An object containing the redirect URL, connected account ID, and connection status.
 * @returns {string} .redirectUrl - The URL to redirect the user to for OAuth authorization.
 * @returns {string} .connectedAccountId - The ID of the newly initiated connected account.
 * @returns {string} .connectionStatus - The current status of the connection.
 * @throws {ApiError} 400 - If `entityId` is missing.
 */
const initiateTwitterConnectionService = async (entityId) => {
  // entityId should be derived from the authenticated user in a multi-user environment.
  if (!entityId) {
    throw new ApiError(400, 'entityId is required for initiating connection.');
  }
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId: twitterIntegrationId,
    entityId,
  });

  return {
    redirectUrl: connectedAccount.redirectUrl,
    connectedAccountId: connectedAccount.connectedAccountId,
    connectionStatus: connectedAccount.connectionStatus,
  };
};

/**
 * Posts a tweet using a connected Twitter account via the Composio API.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing tweet details.
 * @param {string} req.body.connectedAccountId - The ID of the connected Twitter account to use.
 * @param {string} req.body.text - The content of the tweet.
 * @returns {Promise<object>} An object indicating success and the response data from the Composio API.
 * @returns {boolean} .success - True if the tweet was successfully posted.
 * @returns {object} .data - The raw response data from the Composio API.
 * @throws {ApiError} 400 - If `connectedAccountId` or `text` is missing.
 */
const postTweetService = async (req) => {
  const { connectedAccountId, text } = req.body;

  if (!connectedAccountId || !text) {
    // Consistent error handling: throw ApiError instead of returning an object
    throw new ApiError(400, 'Missing required fields: connectedAccountId, text');
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
    }
  );

  // Consider adding checks for response.data.success or specific error codes from the external API
  return {
    success: true,
    data: response.data,
  };
};

/**
 * Deletes a tweet using a connected Twitter account via the Composio API.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing tweet details.
 * @param {string} req.body.connectedAccountId - The ID of the connected Twitter account to use.
 * @param {string} req.body.tweetId - The ID of the tweet to delete.
 * @returns {Promise<object>} An object indicating success and the response data from the Composio API.
 * @returns {boolean} .success - True if the tweet was successfully deleted.
 * @returns {object} .data - The raw response data from the Composio API.
 * @throws {ApiError} 400 - If `connectedAccountId` or `tweetId` is missing.
 */
const deleteTweetService = async (req) => {
  const { connectedAccountId, tweetId } = req.body;

  if (!connectedAccountId || !tweetId) {
    // Consistent error handling: throw ApiError instead of returning an object
    throw new ApiError(400, 'Missing required fields: connectedAccountId, tweetId');
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
    }
  );

  // Consider adding checks for response.data.success or specific error codes from the external API
  return { success: true, data: response.data };
};

/**
 * Follows a Twitter user using a connected Twitter account via the Composio API.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing user details.
 * @param {string} req.body.connectedAccountId - The ID of the connected Twitter account to use.
 * @param {string} req.body.username - The username of the Twitter user to follow.
 * @returns {Promise<object>} An object indicating success and the response data from the Composio API.
 * @returns {boolean} .success - True if the user was successfully followed.
 * @returns {object} .data - The raw response data from the Composio API.
 * @throws {ApiError} 400 - If `connectedAccountId` or `username` is missing.
 */
const followTwitterUserService = async (req) => {
  const { connectedAccountId, username } = req.body;

  if (!connectedAccountId || !username) {
    // Consistent error handling: throw ApiError instead of returning an object
    throw new ApiError(400, 'Missing required fields: connectedAccountId, username');
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
    }
  );

  // Consider adding checks for response.data.success or specific error codes from the external API
  return { success: true, data: response.data };
};

/**
 * Retrieves Twitter user information by username using a connected Twitter account via the Composio API.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing user details.
 * @param {string} req.body.connectedAccountId - The ID of the connected Twitter account to use.
 * @param {string} req.body.username - The username of the Twitter user to look up.
 * @returns {Promise<object>} An object indicating success and the response data from the Composio API.
 * @returns {boolean} .success - True if the user lookup was successful.
 * @returns {object} .data - The raw response data from the Composio API.
 * @throws {ApiError} 400 - If `connectedAccountId` or `username` is missing.
 */
const getTwitterUserByUsernameService = async (req) => {
  const { connectedAccountId, username } = req.body;

  if (!connectedAccountId || !username) {
    // Consistent error handling: throw ApiError instead of returning an object
    throw new ApiError(400, 'Missing required fields: connectedAccountId, username');
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
    }
  );

  // Consider adding checks for response.data.success or specific error codes from the external API
  return { success: true, data: response.data };
};

/**
 * Retrieves the user ID of a Twitter user by their username using a connected Twitter account.
 * This is a helper function used internally by other Twitter services.
 *
 * @param {string} connectedAccountId - The ID of the connected Twitter account to use.
 * @param {string} username - The username of the Twitter user.
 * @returns {Promise<string>} The user ID of the Twitter user.
 * @throws {ApiError} 404 - If the Twitter user is not found.
 */
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
  console.log(
    'Response from Twitter API:',
    JSON.stringify(response.data, null, 2)
  );

  const users = response.data.data.data;
  if (users && users.length > 0) {
    return users[0].id;
  }
  throw new ApiError(404, 'Twitter user not found'); // Throws ApiError for consistency
};

/**
 * Sends a direct message to a Twitter user by their username using a connected Twitter account via the Composio API.
 * This service first resolves the username to a user ID and then sends the message.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing message details.
 * @param {string} req.body.connectedAccountId - The ID of the connected Twitter account to use.
 * @param {string} req.body.username - The username of the recipient Twitter user.
 * @param {string} req.body.text - The content of the direct message.
 * @returns {Promise<object>} An object indicating success and the response data from the Composio API.
 * @returns {boolean} .success - True if the direct message was successfully sent.
 * @returns {object} .data - The raw response data from the Composio API.
 * @throws {ApiError} 400 - If `connectedAccountId`, `username`, or `text` is missing.
 * @throws {ApiError} 500 - If there's an error sending the direct message (e.g., user not found).
 */
const sendDMByUsernameService = async (req) => {
  const { connectedAccountId, username, text } = req.body;

  if (!connectedAccountId || !username || !text) {
    // Consistent error handling: throw ApiError instead of returning an object
    throw new ApiError(
      400,
      'Missing required fields: connectedAccountId, username, text',
    );
  }

  try {
    const participant_id = await getUserIdFromUsername(
      connectedAccountId,
      username
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
      }
    );

    // Consider adding checks for response.data.success or specific error codes from the external API
    return { success: true, data: response.data };
  } catch (error) {
    // Consistent error handling: throw ApiError instead of returning an object
    throw new ApiError(500, error.message || 'Failed to send direct message');
  }
};
// =============================
//      LinkedIn Services
// =============================

/**
 * Retrieves the OAuth redirect URL for initiating a LinkedIn connection.
 *
 * @param {string} integrationId - The ID of the LinkedIn integration.
 * @param {string} entityId - The ID of the user/entity initiating the connection.
 *                            This should be derived from the authenticated user in a multi-user environment.
 * @returns {Promise<string>} The redirect URL for LinkedIn OAuth authorization.
 * @throws {ApiError} 400 - If `entityId` is missing.
 */
const getLinkedInOAuthRedirectUrlService = async (integrationId, entityId) => {
  // entityId should be derived from the authenticated user in a multi-user environment.
  if (!entityId) {
    throw new ApiError(400, 'entityId is required for initiating connection.');
  }
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId,
    entityId,
  });
  return connectedAccount.redirectUrl;
};

/**
 * Exchanges an OAuth authorization code for a connected LinkedIn account.
 * This completes the OAuth flow after the user has granted permissions.
 *
 * @param {string} code - The authorization code received from the LinkedIn OAuth redirect.
 * @param {string} integrationId - The ID of the LinkedIn integration.
 * @param {string} entityId - The ID of the user/entity for whom the code is being exchanged.
 *                            This should be derived from the authenticated user in a multi-user environment.
 * @returns {Promise<object>} The connected account object after successful code exchange.
 * @throws {ApiError} 400 - If `entityId` is missing.
 */
const exchangeCodeLinkedInService = async (code, integrationId, entityId) => {
  // entityId should be derived from the authenticated user in a multi-user environment.
  if (!entityId) {
    throw new ApiError(400, 'entityId is required for exchanging code.');
  }
  const connectedAccount = await toolset.connectedAccounts.exchangeCode({
    code,
    integrationId,
    entityId,
  });
  return connectedAccount;
};

/**
 * Retrieves the required input fields for posting to LinkedIn.
 * This service primarily fetches the schema for what parameters are needed for a LinkedIn post action.
 *
 * @param {string} integrationId - The ID of the LinkedIn integration.
 * @param {string} connectedAccountId - The ID of the connected LinkedIn account.
 * @param {string} content - (Currently unused in this function, but might be for future validation/context).
 * @returns {Promise<object>} The expected input fields schema for a LinkedIn post.
 */
const getLinkedInPostInputFieldsService = async (
  integrationId,
  connectedAccountId,
  content
) => {
  const integration = await toolset.integrations.get({
    integrationId: 'ff2c1c00-03ca-4135-9fe7-afa775098c26',
  });
  const expectedInputFields = await toolset.integrations.getRequiredParams(
    integration.id
  );
  // Collect auth params from your users

  console.log(expectedInputFields);
  return expectedInputFields;
  // This service currently only fetches input fields. If the intention was to post,
  // additional logic for executing the LinkedIn post action would be needed here.
};

// =============================
//   Google Calender Services
// =============================

/**
 * @constant {string} calendarIntegrationId - The hardcoded ID for the Google Calendar integration.
 */
const calendarIntegrationId = '21c69c18-54ef-464b-a181-dc82f3e5b089';

/**
 * Initiates the connection process for a Google Calendar account.
 * This involves getting a redirect URL for OAuth and details about the new connected account.
 *
 * @param {string} entityId - The ID of the user/entity initiating the connection.
 *                            This should be derived from the authenticated user in a multi-user environment.
 * @returns {Promise<object>} An object containing the redirect URL, connected account ID, and connection status.
 * @returns {string} .redirectUrl - The URL to redirect the user to for OAuth authorization.
 * @returns {string} .connectedAccountId - The ID of the newly initiated connected account.
 * @returns {string} .connectionStatus - The current status of the connection.
 * @throws {ApiError} 400 - If `entityId` is missing.
 */
const initiateGoogleCalendarConnectionService = async (entityId) => {
  // entityId should be derived from the authenticated user in a multi-user environment.
  if (!entityId) {
    throw new ApiError(400, 'entityId is required for initiating connection.');
  }
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId: calendarIntegrationId,
    entityId,
  });

  return {
    redirectUrl: connectedAccount.redirectUrl,
    connectedAccountId: connectedAccount.connectedAccountId,
    connectionStatus: connectedAccount.connectionStatus,
  };
};

/**
 * Creates a new Google Calendar event using a connected Google Calendar account via the Composio API.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing event details.
 * @param {string} req.body.connectedAccountId - The ID of the connected Google Calendar account to use.
 * @param {string} req.body.summary - The summary (title) of the event.
 * @param {string} [req.body.description] - The description of the event.
 * @param {string} req.body.startTime - The start date and time of the event (ISO 8601 format).
 * @param {string} req.body.endTime - The end date and time of the event (ISO 8601 format).
 * @param {string} [req.body.timezone='Asia/Dhaka'] - The timezone for the event.
 * @returns {Promise<object>} An object indicating success and the response data from the Composio API.
 * @returns {boolean} .success - True if the event was successfully created.
 * @returns {object} .data - The raw response data from the Composio API.
 * @throws {ApiError} 400 - If `connectedAccountId`, `summary`, `startTime`, or `endTime` is missing.
 */
const createCalendarEventService = async (req) => {
  const {
    connectedAccountId,
    summary,
    description,
    startTime,
    endTime,
    timezone = 'Asia/Dhaka',
  } = req.body;

  if (!connectedAccountId || !summary || !startTime || !endTime) {
    // Consistent error handling: throw ApiError instead of returning an object
    throw new ApiError(
      400,
      'Missing required fields: connectedAccountId, summary, startTime, endTime',
    );
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
    }
  );

  // Consider adding checks for response.data.success or specific error codes from the external API
  return {
    success: true,
    data: response.data,
  };
};

/**
 * Retrieves a list of calendar events from a connected Google Calendar account via the Composio API.
 * By default, it fetches events from the 'primary' calendar.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing account details.
 * @param {string} req.body.connectedAccountId - The ID of the connected Google Calendar account to use.
 * @returns {Promise<object>} The response data from the Composio API containing calendar events.
 * @throws {ApiError} 400 - If `connectedAccountId` is missing.
 */
const getCalendarEventsService = async (req) => {
  const { connectedAccountId } = req.body;

  if (!connectedAccountId) {
    // Consistent error handling: throw ApiError instead of returning an object
    throw new ApiError(400, 'Missing required field: connectedAccountId');
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
    }
  );

  // Consider adding checks for response.data.success or specific error codes from the external API
  return response.data;
};

/**
 * Deletes a Google Calendar event using a connected Google Calendar account via the Composio API.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing event details.
 * @param {string} req.body.connectedAccountId - The ID of the connected Google Calendar account to use.
 * @param {string} req.body.eventId - The ID of the event to delete.
 * @param {string} [req.body.calendarId='primary'] - The ID of the calendar from which to delete the event.
 * @returns {Promise<object>} The response data from the Composio API after deleting the event.
 * @throws {ApiError} 400 - If `connectedAccountId` or `eventId` is missing.
 */
const deleteCalendarEventService = async (req) => {
  const { connectedAccountId, eventId, calendarId = 'primary' } = req.body;

  if (!connectedAccountId || !eventId) {
    // Consistent error handling: throw ApiError instead of returning an object
    throw new ApiError(
      400,
      'Missing required fields: connectedAccountId, eventId',
    );
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
    }
  );

  // Consider adding checks for response.data.success or specific error codes from the external API
  return response.data;
};

/**
 * Updates an existing Google Calendar event using a connected Google Calendar account via the Composio API.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing event details.
 * @param {string} req.body.connectedAccountId - The ID of the connected Google Calendar account to use.
 * @param {string} req.body.eventId - The ID of the event to update.
 * @param {string} [req.body.calendarId='primary'] - The ID of the calendar where the event is located.
 * @param {string} [req.body.summary] - The new summary (title) of the event.
 * @param {string} [req.body.description] - The new description of the event.
 * @param {string} [req.body.startTime] - The new start date and time of the event (ISO 8601 format).
 * @param {string} [req.body.endTime] - The new end date and time of the event (ISO 8601 format).
 * @param {string} [req.body.timezone='Asia/Dhaka'] - The new timezone for the event.
 * @returns {Promise<object>} The response data from the Composio API after updating the event.
 * @throws {ApiError} 400 - If `connectedAccountId` or `eventId` is missing.
 */
const updateCalendarEventService = async (req) => {
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
    // Consistent error handling: throw ApiError instead of returning an object
    throw new ApiError(400, 'Missing required fields: connectedAccountId, eventId');
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
    }
  );

  // Consider adding checks for response.data.success or specific error codes from the external API
  return response.data;
};

// =============================
//      GItHub Services
// =============================

/**
 * @constant {string} githubIntegrationId - The hardcoded ID for the GitHub integration.
 */
const githubIntegrationId = '394bc42b-5fa8-4777-8e08-6fed12510deb';

/**
 * Retrieves details about the GitHub integration and its required input fields.
 *
 * @returns {Promise<object>} An object containing the integration details and its required input fields.
 * @returns {object} .integration - The GitHub integration object.
 * @returns {object} .inputFields - The required input fields for the GitHub integration.
 */
const getGithubIntegrationService = async () => {
  const integration = await toolset.integrations.get({
    integrationId: githubIntegrationId,
  });

  const inputFields = await toolset.integrations.getRequiredParams({
    integrationId: integration.id,
  });

  return { integration, inputFields };
};

/**
 * Initiates the connection process for a GitHub account.
 * This involves getting a redirect URL for OAuth and details about the new connected account.
 *
 * @param {string} integrationId - The ID of the GitHub integration.
 * @param {string} entityId - The ID of the user/entity initiating the connection.
 *                            This should be derived from the authenticated user in a multi-user environment.
 * @returns {Promise<object>} An object containing the redirect URL, connected account ID, and connection status.
 * @returns {string} .redirectUrl - The URL to redirect the user to for OAuth authorization.
 * @returns {string} .connectedAccountId - The ID of the newly initiated connected account.
 * @returns {string} .connectionStatus - The current status of the connection.
 * @throws {ApiError} 400 - If `entityId` is missing.
 */
const initiateGithubConnectionService = async (integrationId, entityId) => {
  // entityId should be derived from the authenticated user in a multi-user environment.
  if (!entityId) {
    throw new ApiError(400, 'entityId is required for initiating connection.');
  }
  const connectedAccount = await toolset.connectedAccounts.initiate({
    integrationId,
    entityId,
  });

  return {
    redirectUrl: connectedAccount.redirectUrl,
    connectedAccountId: connectedAccount.connectedAccountId,
    connectionStatus: connectedAccount.connectionStatus,
  };
};

/**
 * Creates a new GitHub issue in a specified repository using a connected GitHub account via the Composio API.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing issue details.
 * @param {string} req.body.connectedAccountId - The ID of the connected GitHub account to use.
 * @param {string} req.body.owner - The owner of the repository (e.g., username or organization name).
 * @param {string} req.body.repo - The name of the repository.
 * @param {string} req.body.title - The title of the new issue.
 * @param {string} [req.body.body] - The body content of the new issue.
 * @returns {Promise<object>} The response data from the Composio API after creating the issue.
 * @throws {ApiError} 400 - If `connectedAccountId`, `owner`, `repo`, or `title` is missing.
 */
const createGithubIssueService = async (req) => {
  const { connectedAccountId, owner, repo, title, body } = req.body;

  if (!connectedAccountId || !owner || !repo || !title) {
    // Consistent error handling: throw ApiError instead of returning an object
    throw new ApiError(400, 'Missing required fields: connectedAccountId, owner, repo, title');
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
    }
  );

  // Consider adding checks for response.data.success or specific error codes from the external API
  return response.data;
};
// =============================
//      Amazon Services
// =============================
/**
 * @constant {string} amazonIntegrationId - Placeholder for the Amazon integration ID.
 * This needs to be defined with the actual ID when Amazon integration is implemented.
 */
const amazonIntegrationId = 'YOUR_AMAZON_INTEGRATION_ID'; // Placeholder: Define the Amazon integration ID

/**
 * Initiates the connection process for an Amazon account.
 * This service dynamically finds the Amazon integration ID and then
 * gets a redirect URL for OAuth and details about the new connected account.
 *
 * @param {string} entityId - The ID of the user/entity initiating the connection.
 *                            This should be derived from the authenticated user in a multi-user environment.
 * @returns {Promise<object>} An object containing the redirect URL, connected account ID, and connection status.
 * @returns {string} .redirectUrl - The URL to redirect the user to for OAuth authorization.
 * @returns {string} .connectedAccountId - The ID of the newly initiated connected account.
 * @returns {string} .connectionStatus - The current status of the connection.
 * @throws {ApiError} 400 - If `entityId` is missing.
 * @throws {ApiError} 404 - If the Amazon integration is not found.
 */
const initiateAmazonConnectionService = async (entityId) => {
  // entityId should be derived from the authenticated user in a multi-user environment.
  if (!entityId) {
    throw new ApiError(400, 'entityId is required for initiating connection.');
  }
  // 1. Get all integrations
  const allIntegrationsResponse = await toolset.integrations.list();
  const integrations = allIntegrationsResponse.items || [];

  // 2. Find Amazon integration
  const amazonIntegration = integrations.find((integration) =>
    integration.name.toLowerCase().includes('amazon')
  );

  if (!amazonIntegration) {
    throw new ApiError(404, 'Amazon integration not found'); // Throws ApiError for consistency
  }

  // 3. Initiate OAuth connection
  const connectionRequest = await toolset.connectedAccounts.initiate({
    integrationId: amazonIntegration.id,
    entityId, // Use the provided entityId
  });

  return {
    redirectUrl: connectionRequest.redirectUrl,
    connectedAccountId: connectionRequest.connectedAccountId,
    connectionStatus: connectionRequest.connectionStatus,
  };
};

// /**
//  * Searches for Amazon products using a connected Amazon account via the Composio API.
//  *
//  * @param {object} req - The Express request object.
//  * @param {object} req.body - The request body containing search parameters.
//  * @param {string} req.body.connectedAccountId - The ID of the connected Amazon account to use.
//  * @param {string} req.body.query - The search query string.
//  * @returns {Promise<object>} The response data from the Composio API containing search results.
//  * @throws {ApiError} 400 - If `connectedAccountId` or `query` is missing.
//  */
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

/**
 * @namespace composioService
 * @description A collection of services for interacting with various integrations via Composio.
 * This object exports functions to manage connections, authorize accounts, and perform actions
 * across different platforms like Gmail, YouTube, LinkedIn, Google Calendar, GitHub, Twitter, and Amazon.
 */
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
  getLinkedInPostInputFieldsService, // Renamed from postToLinkedInService
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
  sendDMByUsernameService,
  getAllIntegrationsService,
  authorizeGmailIntegrationService,
  sendGmailFromAuthorizedAccountService,
  getAllConnectedAccountsService,
};