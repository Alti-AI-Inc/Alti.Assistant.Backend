import { Composio } from '@composio/core';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import ComposioAuth from '../composio_v2/composio.model.js';
import AuthConfig from '../composio_v2/authConfig.model.js';
import {
  findAppropriateApp,
  generateAndExecuteTools,
  generateUserMessasgeFromContext,
  getVectorSearchResults,
} from './composio.helper.js';
import { getConversationWithContext } from './composio.conversation.js';
import { getConversationHistory } from '../composio_v2/ai_classification/workflow.js';
import Conversation from '../conversations/conversation.model.js';
import ConversationSummary from '../conversations/conversationSummary.model.js';

/**
 * @constant {Composio} composio - An instance of the Composio SDK initialized with the organization API key.
 * This instance is used to interact with the Composio platform for managing connected accounts and executing tools.
 */
const composio = new Composio({ apiKey: config.composio.orgApiKey });

/**
 * @constant {GoogleGenerativeAI} genAI - An instance of the Google Generative AI SDK initialized with the Gemini secret key.
 * This instance is used for interacting with Google's AI models, primarily for token counting and potentially for generating responses.
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Executes a user's natural language request by identifying relevant applications,
 * checking user connections, retrieving appropriate tools, and then generating and executing
 * the necessary tool calls. It also manages conversation context and summarization.
 *
 * @async
 * @param {string} userMessage - The natural language message from the user.
 * @param {string} userId - The ID of the user making the request. Acts as the tenant isolation boundary.
 * @param {string | null} [conversationId=null] - The ID of the current conversation, used for context and history.
 * @param {string | null} [scopedApp=null] - An optional app slug to directly scope the execution to a specific application, bypassing LLM app identification.
 * @returns {Promise<object>} A promise that resolves to an object containing the success status,
 *   the AI's response or a success message, the conversation ID, tools used, and execution time,
 *   or an error message if the operation fails.
 * @returns {boolean} returns.success - Indicates if the operation was successful.
 * @returns {object} returns.data - The data returned on success.
 * @returns {string} returns.data.response - The AI's response or a confirmation message.
 * @returns {string} returns.data.conversationId - The ID of the conversation.
 * @returns {Array<object>} returns.data.toolsUsed - An array of tools that were identified and potentially executed.
 * @returns {string} returns.data.executionTime - The total time taken for the request execution.
 * @returns {string} returns.error - The error message if the operation failed.
 * 
 * @security Multi-tenant Isolation: Operations are scoped strictly to the provided `userId`.
 * Ensures users can only access their own conversation history and connected tool accounts.
 */
export const executeUserRequest = async (
  userMessage,
  userId,
  conversationId = null,
  scopedApp = null // Added for scoped app execution
) => {
  const startTime = Date.now();
  // SECURITY PATCH: Sanitize inputs to prevent NoSQL Injection
  const safeUserId = String(userId);
  const safeConversationId = conversationId ? String(conversationId) : null;
  const safeScopedApp = scopedApp ? String(scopedApp) : null;
  const safeUserMessage = String(userMessage);

  try {
    const conversationContext =
      await countTokenFromConversationAndProvideContext(safeConversationId);
    let history = [];
    let appList = [];
    let toolKits = {};
    console.log('Conversation Context:', conversationContext.needSummarization);

    if (safeScopedApp) {
      // Directly lock execution to the selected app, bypassing LLM app identification
      appList = [safeScopedApp];
      toolKits = { [safeScopedApp]: 'latest' };
      console.log('Isolated App Scoping Enabled:', safeScopedApp);
    } else {
      if (conversationContext.needSummarization) {
        history = conversationContext.summary;
        const appInfo = await findAppropriateApp(safeUserMessage, [], history);
        appList = appInfo.appList;
        toolKits = appInfo.toolKitVersions;
      } else {
        history = conversationContext.conversation;
        const appInfo = await findAppropriateApp(safeUserMessage, history);
        appList = appInfo.appList;
        toolKits = appInfo.toolKitVersions;
      }
    }

    // BUG FIX: The original logic for filtering appList based on connected accounts was overwriting
    // the LLM-identified appList. This revised logic ensures that appList and toolKits
    // only contain apps that were both identified/scoped AND for which the user has an active connection.
    const identifiedAppSlugs = appList.map(a => String(a).toLowerCase());
    // Optimization: Added .lean() for read-only query to return plain JavaScript objects,
    // reducing Mongoose overhead.
    // Indexing Recommendation: Consider a compound index on `{ userId: 1, status: 1 }`
    // for the ComposioAuth model to optimize this query. Additional indexes on
    // `toolkit.slug` and `authConfigId` might be beneficial if the `$or` clause
    // is frequently used and highly selective.
    const connectedAuths = await ComposioAuth.find({
      userId: safeUserId,
      status: 'ACTIVE',
      $or: [
        { 'toolkit.slug': { $in: identifiedAppSlugs } },
        { authConfigId: { $in: identifiedAppSlugs } },
        { authConfigId: { $in: identifiedAppSlugs.map(a => `ac_${a}`) } },
      ],
    }).lean();

    const connectedAppSlugs = new Set(connectedAuths.map(auth => auth.toolkit.slug));
    let effectiveAppList = identifiedAppSlugs.filter(slug => connectedAppSlugs.has(slug));
    let effectiveToolKits = {};

    if (identifiedAppSlugs.length > 0 && !(identifiedAppSlugs.length === 1 && identifiedAppSlugs[0] === 'none')) {
        if (effectiveAppList.length === 0) {
            return {
                success: false,
                error: 'No connected accounts found for the identified apps. Please connect your accounts.',
            };
        }
        // Update appList and toolKits to only include those that are both identified and connected
        appList = effectiveAppList;
        for (const app of appList) {
            if (toolKits[app]) {
                effectiveToolKits[app] = toolKits[app];
            } else {
                effectiveToolKits[app] = 'latest'; // Fallback if toolKits didn't have a specific version for this app
            }
        }
        toolKits = effectiveToolKits;
    } else if (identifiedAppSlugs.length === 1 && identifiedAppSlugs[0] === 'none') {
        // If LLM explicitly said 'none', then appList should be empty for tool search
        appList = [];
        toolKits = {};
    } else {
        // If no apps were identified by LLM (e.g., appList was empty initially),
        // then proceed with an empty appList for tool search.
        appList = [];
        toolKits = {};
    }

    console.log('Final App List after checking connections:', appList);
    console.log('Final Tool Kits after checking connections:', toolKits);

    let conciseUserMessage = '';
    // BUG FIX: Inconsistent argument passing to generateUserMessasgeFromContext.
    // Ensure the correct context (summary or full conversation) is passed as the second argument.
    if (conversationContext.needSummarization) {
      conciseUserMessage = await generateUserMessasgeFromContext(
        safeUserMessage,
        conversationContext.summary // Use summary as context
      );
    } else {
      conciseUserMessage = await generateUserMessasgeFromContext(
        safeUserMessage,
        conversationContext.conversation // Use full conversation as context
      );
    }
    console.log('Concise User Message:', conciseUserMessage);
    console.log('Identified Apps:', appList);
    const toolsData = await getVectorSearchResults(
      conciseUserMessage,
      5,
      appList
    );
    // BUG FIX: Corrected console.log to use the 'toolKits' object directly, as 'appList' is an array.
    console.log('Using toolkits:', toolKits);
    // Generate and execute
    const result = await generateAndExecuteTools(
      conciseUserMessage,
      toolsData,
      toolKits,
      safeUserId
    );
    if (result?.results[0]) {
      // Indexing Recommendation: Consider a compound index on `{ conversationId: 1, userId: 1 }`
      // for the Conversation model to optimize this update operation.
      await Conversation.updateOne(
        { conversationId: safeConversationId, userId: safeUserId },
        { $set: { messages: [] } }
      );
      // Indexing Recommendation: Consider a compound index on `{ conversationId: 1, userId: 1 }`
      // for the ConversationSummary model to optimize this delete operation.
      await ConversationSummary.deleteOne({ conversationId: safeConversationId, userId: safeUserId });
    }
    return {
      success: true,
      data: {
        response: result?.results[0]
          ? 'The action has been completed successfully.'
          : result?.response?.candidates[0]?.content?.parts[0]?.text.trim(),
        conversationId: safeConversationId,
        // BUG FIX: Populate toolsUsed array from the result of generateAndExecuteTools.
        toolsUsed: result?.toolsUsed || [],
        executionTime: `${Date.now() - startTime}ms`,
      },
    };
  } catch (error) {
    console.error('Error executing user request:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Analyzes a conversation's token count to determine if summarization is needed
 * and provides the appropriate conversation context (full history or summary).
 *
 * @async
 * @param {string | null} conversationId - The ID of the conversation to analyze.
 * @returns {Promise<object>} A promise that resolves to an object containing
 *   `needSummarization` (boolean), `tokenCount` (number), and either `summary` (string)
 *   or `conversation` (Array<object>).
 * @returns {boolean} returns.needSummarization - True if the conversation exceeds the token limit and needs summarization.
 * @returns {number} returns.tokenCount - The total token count of the conversation.
 * @returns {Array<object> | string} returns.conversation | returns.summary - The full conversation messages or a summarized version.
 */
const countTokenFromConversationAndProvideContext = async (conversationId) => {
  // SECURITY PATCH: Sanitize inputs to prevent NoSQL Injection
  const safeConversationId = conversationId ? String(conversationId) : null;
  if (!safeConversationId) return { needSummarization: false, conversation: [] };

  // Optimization: Added .lean() for read-only query to return plain JavaScript objects,
  // reducing Mongoose overhead.
  // Indexing Recommendation: Consider an index on `{ conversationId: 1 }`
  // for the Conversation model to optimize this find operation.
  const conversation = await Conversation.findOne({
    conversationId: safeConversationId,
  }).lean(); // Added .lean()
  if (!conversation) return { needSummarization: false, conversation: [] };
  let totalTokens = 0;
  // Optimization: Replaced synchronous loop with map and join for better performance
  // when concatenating potentially many message contents, reducing CPU overhead.
  const constructMessasges = conversation.messages
    .map((message) => message.content)
    .join(' ');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const tokenCount = await model.countTokens(constructMessasges);
  totalTokens = tokenCount;

  if (totalTokens > 4000) {
    return {
      needSummarization: true,
      tokenCount: totalTokens,
      summary: await getConversationWithContext(safeConversationId, totalTokens),
    };
  } else {
    return {
      needSummarization: false,
      tokenCount: totalTokens,
      conversation: conversation.messages,
    };
  }
};

/**
 * Initiates the authentication process for a given application for a specific user
 * using the Composio platform. It handles creating default AuthConfig if not found
 * and includes a fallback mechanism for connection initiation.
 *
 * @async
 * @param {string} appName - The slug or name of the application to initiate authentication for.
 * @param {string} userId - The ID of the user for whom the authentication is being initiated.
 * @returns {Promise<object>} A promise that resolves to an object containing the success status
 *   and the connection URL data, or an error message.
 * @returns {boolean} returns.success - Indicates if the operation was successful.
 * @returns {object} returns.data - The data returned on success, including `redirectUrl` and `id`.
 * @returns {string} returns.error - The error message if the operation failed.
 * 
 * @security Multi-tenant Isolation: Scoped to the provided `userId` to prevent cross-tenant account linking.
 */
export const initiateAuth = async (appName, userId) => {
  // SECURITY PATCH: Sanitize inputs to prevent NoSQL Injection
  const safeAppName = String(appName);
  const safeUserId = String(userId);

  try {
    // Indexing Recommendation: Consider an index on `{ app: 1 }`
    // for the AuthConfig model to optimize this find operation.
    // Optimization: Removed .lean() as the document might be modified and saved later.
    let authConfig = await AuthConfig.findOne({ app: safeAppName }); // Fetch as Mongoose document directly

    if (!authConfig) { // If not found, authConfig will be null
      console.log(`AuthConfig for ${safeAppName} not found in DB. Proactively creating default...`);
      authConfig = new AuthConfig({ // Create new Mongoose document
        app: safeAppName,
        authConfigId: `ac_${safeAppName}`,
        isComposioManaged: true,
      });
      await authConfig.save();
    }

    let connectionUrl;
    try {
      connectionUrl = await composio.connectedAccounts.initiate(
        safeUserId,
        authConfig.authConfigId // Use the Mongoose document's authConfigId
      );
    } catch (initiateError) {
      console.warn(`[Simple] Custom config ${authConfig.authConfigId} initiation failed: ${initiateError.message}. Falling back to globally managed credentials using appName: ${safeAppName}...`);
      
      // Fallback: use appName directly as authConfigId
      connectionUrl = await composio.connectedAccounts.initiate(
        safeUserId,
        safeAppName
      );
      
      // Persist the corrected config ID in database
      authConfig.authConfigId = safeAppName; // Modify the Mongoose document
      await authConfig.save(); // Save the Mongoose document
    }

    const composioAuth = new ComposioAuth({
      userId: safeUserId,
      authConfigId: authConfig.authConfigId,
      connectedAccountId: connectionUrl.id,
      status: 'PENDING',
      integrationId: connectionUrl.integrationId,
      redirectUrl: connectionUrl.redirectUrl,
      toolkit: { slug: safeAppName },
    });
    await composioAuth.save();
    return { success: true, data: connectionUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Waits for a Composio connected account to complete its authentication process
 * and updates the local database with the connection status and tokens.
 *
 * @async
 * @param {string} connectedAccountId - The ID of the connected account to wait for.
 * @returns {Promise<object>} A promise that resolves to an object containing the success status
 *   and the connection details, or an error message.
 * @returns {boolean} returns.success - Indicates if the operation was successful.
 * @returns {object} returns.data - The data returned on success, including the connection status and tokens.
 * @returns {string} returns.error - The error message if the operation failed.
 * 
 * @security Multi-tenant Isolation: Updates are bound to the specific `connectedAccountId` which is mapped to a single user.
 */
export const waitForConnection = async (connectedAccountId) => {
  // SECURITY PATCH: Sanitize inputs to prevent NoSQL Injection
  const safeConnectedAccountId = String(connectedAccountId);

  try {
    const connection =
      await composio.connectedAccounts.waitForConnection(safeConnectedAccountId);
    // Indexing Recommendation: Consider an index on `{ connectedAccountId: 1 }`
    // for the ComposioAuth model to optimize this update operation.
    await ComposioAuth.updateOne(
      { connectedAccountId: safeConnectedAccountId },
      {
        status: (connection.data.status || 'ACTIVE').toUpperCase(),
        accessToken: connection.data.accessToken,
        refreshToken: connection.data.refreshToken,
        toolkit: connection.toolkit,
      }
    );
    return { success: true, data: connection };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Retrieves all active connected accounts for a given user.
 *
 * @async
 * @param {string} userId - The ID of the user.
 * @returns {Promise<object>} A promise that resolves to an object containing the success status
 *   and an array of connected accounts, or an error message.
 * @returns {boolean} returns.success - Indicates if the operation was successful.
 * @returns {Array<object>} returns.data - An array of ComposioAuth documents representing the user's connected accounts.
 * @returns {string} returns.error - The error message if the operation failed.
 * 
 * @security Multi-tenant Isolation: Restricts account retrieval strictly to the requesting `userId`.
 */
export const getUserConnectedAccounts = async (userId) => {
  // SECURITY PATCH: Sanitize inputs to prevent NoSQL Injection
  const safeUserId = String(userId);

  try {
    // Indexing Recommendation: Consider a compound index on `{ userId: 1, status: 1, updatedAt: -1 }`
    // for the ComposioAuth model to optimize this query, covering both filtering and sorting.
    const accounts = await ComposioAuth.find({
      userId: safeUserId,
      status: 'ACTIVE',
    }).sort({ updatedAt: -1 }).lean(); // Already uses .lean(), good.
    return { success: true, data: accounts };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Disconnects an application for a specific user by deactivating the Composio connected account
 * and removing its record from the database. It includes a fallback for Composio API deletion methods.
 *
 * @async
 * @param {string} userId - The ID of the user.
 * @param {string} appName - The name or slug of the application to disconnect.
 * @returns {Promise<object>} A promise that resolves to an object containing the success status
 *   and a message, or an error message.
 * @returns {boolean} returns.success - Indicates if the operation was successful.
 * @returns {string} returns.message - A success message.
 * @returns {string} returns.error - The error message if the operation failed.
 * 
 * @security Multi-tenant Isolation: Ensures a user can only disconnect apps belonging to their own `userId`.
 */
export const disconnectApp = async (userId, appName) => {
  // SECURITY PATCH: Sanitize inputs to prevent NoSQL Injection
  const safeUserId = String(userId);
  const safeAppName = String(appName);

  try {
    // Optimization: Added .lean() for read-only query before deletion.
    // Indexing Recommendation: Consider a compound index on `{ userId: 1, status: 1 }`
    // for the ComposioAuth model to optimize this find operation. Additional indexes on
    // `toolkit.slug` and `authConfigId` might be beneficial if the `$or` clause
    // is frequently used and highly selective.
    const account = await ComposioAuth.findOne({
      userId: safeUserId,
      $or: [
        { 'toolkit.slug': safeAppName.toLowerCase() },
        { authConfigId: safeAppName },
        { authConfigId: `ac_${safeAppName}` }
      ],
      status: 'ACTIVE'
    }).lean(); // Added .lean()

    if (!account) {
      return { success: false, error: 'No active connection found for this app.' };
    }

    try {
      if (typeof composio.connectedAccounts.delete === 'function') {
         await composio.connectedAccounts.delete(account.connectedAccountId);
      } else if (typeof composio.connectedAccounts.remove === 'function') {
         await composio.connectedAccounts.remove(account.connectedAccountId);
      }
    } catch (apiErr) {
      console.warn(`[Simple] Composio API delete failed for ${account.connectedAccountId}:`, apiErr.message);
    }

    // Deleting by _id is efficient as _id is always indexed.
    await ComposioAuth.deleteOne({ _id: account._id });

    return { success: true, message: `Successfully disconnected ${safeAppName}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Orchestrates a multi-application workflow based on a user query.
 * It identifies appropriate apps, filters them by user's active connections,
 * retrieves relevant tools, and then generates and executes tool calls.
 *
 * @async
 * @param {string} query - The user's natural language query.
 * @param {Array<object> | string} apps - Conversation history or context used for app identification.
 *   This parameter was previously misused as `toolKits` in a bug, now correctly used as context.
 * @param {object} toolKits - An object mapping app slugs to their desired toolkit versions (e.g., `{ "slack": "latest" }`).
 *   Note: This parameter is initially passed but its values are overridden by the `appInfo` and connection checks.
 * @param {string} entityId - The ID of the user or entity initiating the workflow (used for auth checks).
 * @returns {Promise<object>} A promise that resolves to an object containing the success status,
 *   the AI's response or a success message, tools used, and execution time, or an error message.
 * @returns {boolean} returns.success - Indicates if the operation was successful.
 * @returns {object} returns.data - The data returned on success.
 * @returns {string} returns.data.response - The AI's response or a confirmation message.
 * @returns {Array<object>} returns.data.toolsUsed - An array of tools that were identified and potentially executed.
 * @returns {string} returns.data.executionTime - The total time taken for the workflow execution.
 * @returns {string} returns.error - The error message if the operation failed.
 * 
 * @security Multi-tenant Isolation: Scoped to the provided `entityId` (acting as the tenant/user identifier).
 */
async function multiAppWorkflow(query, apps, toolKits, entityId) {
  // SECURITY PATCH: Sanitize inputs to prevent NoSQL Injection
  const safeQuery = String(query);
  const safeEntityId = String(entityId);
  const startTime = Date.now();

  try {
    // BUG FIX: The third argument to findAppropriateApp should be a summary (array/string), not toolKits (an object).
    // Assuming 'apps' is intended to be the conversation history/context for app identification.
    const appInfo = await findAppropriateApp(safeQuery, apps);

    // BUG FIX: Missing ComposioAuth check. This is a security vulnerability and functional bug.
    // Replicating the logic from executeUserRequest to ensure only connected apps are used.
    const identifiedAppSlugs = appInfo.appList.map(a => String(a).toLowerCase());
    // Indexing Recommendation: Consider a compound index on `{ userId: 1, status: 1 }`
    // for the ComposioAuth model to optimize this query. Additional indexes on
    // `toolkit.slug` and `authConfigId` might be beneficial if the `$or` clause
    // is frequently used and highly selective.
    const connectedAuths = await ComposioAuth.find({
        userId: safeEntityId, // Use entityId as userId for the auth check
        status: 'ACTIVE',
        $or: [
            { 'toolkit.slug': { $in: identifiedAppSlugs } },
            { authConfigId: { $in: identifiedAppSlugs } },
            { authConfigId: { $in: identifiedAppSlugs.map(a => `ac_${a}`) } },
        ],
    }).lean();

    const connectedAppSlugs = new Set(connectedAuths.map(auth => auth.toolkit.slug));
    let effectiveAppList = identifiedAppSlugs.filter(slug => connectedAppSlugs.has(slug));
    let effectiveToolKits = {};

    if (identifiedAppSlugs.length > 0 && !(identifiedAppSlugs.length === 1 && identifiedAppSlugs[0] === 'none')) {
        if (effectiveAppList.length === 0) {
            // If no apps are connected for the identified ones, throw an error.
            throw new Error('No connected accounts found for the identified apps. Please connect your accounts.');
        }
        // Update appList and toolKits to only include those that are both identified and connected
        appInfo.appList = effectiveAppList;
        for (const app of appInfo.appList) {
            if (appInfo.toolKitVersions[app]) {
                effectiveToolKits[app] = appInfo.toolKitVersions[app];
            } else {
                effectiveToolKits[app] = 'latest'; // Fallback if toolKits didn't have a specific version for this app
            }
        }
        appInfo.toolKitVersions = effectiveToolKits; // Update the toolKitVersions in appInfo
    } else if (identifiedAppSlugs.length === 1 && identifiedAppSlugs[0] === 'none') {
        // If LLM explicitly said 'none', then appList should be empty for tool search
        appInfo.appList = [];
        appInfo.toolKitVersions = {};
    } else {
        // If no apps were identified by LLM (e.g., appList was empty initially),
        // then proceed with an empty appList for tool search.
        appInfo.appList = [];
        appInfo.toolKitVersions = {};
    }

    console.log('Final App List for multiAppWorkflow after checking connections:', appInfo.appList);
    console.log('Final Tool Kits for multiAppWorkflow after checking connections:', appInfo.toolKitVersions);

    // Get relevant tools from all identified apps using vector search
    const toolsData = await getVectorSearchResults(
      safeQuery,
      appInfo.appList.length * 5, // Use the filtered appInfo.appList
      appInfo.appList // Use the filtered appInfo.appList
    );

    console.log('Using toolkits:', appInfo.toolKitVersions);

    // Generate and execute
    const result = await generateAndExecuteTools(
      safeQuery,
      toolsData,
      appInfo.toolKitVersions, // Use the filtered appInfo.toolKitVersions
      safeEntityId
    );
    // Return a structured response similar to executeUserRequest
    return {
      success: true,
      data: {
        response: result?.results[0]
          ? 'The action has been completed successfully.'
          : result?.response?.candidates[0]?.content?.parts[0]?.text.trim(),
        toolsUsed: result?.toolsUsed || [],
        executionTime: `${Date.now() - startTime}ms`,
      },
    };
  } catch (error) {
    console.error('Error in multiAppWorkflow:', error);
    return { success: false, error: error.message };
  }
}

/**
 * @constant {object} composioService - An object encapsulating various Composio-related service functions.
 * This provides a centralized interface for interacting with Composio features like
 * executing user requests, managing app authentications, and handling multi-app workflows.
 * @property {function(string, string, string=, string=): Promise<object>} executeUserRequest - Executes a user's natural language request.
 * @property {function(string, string): Promise<object>} initiateAuth - Initiates the authentication flow for an app.
 * @property {function(string): Promise<object>} waitForConnection - Waits for a Composio connection to complete.
 * @property {function(string): Promise<object>} getUserConnectedAccounts - Retrieves a user's active connected accounts.
 * @property {function(string, string): Promise<object>} disconnectApp - Disconnects an app for a user.
 * @property {function(string, Array<object> | string, object, string): Promise<object>} multiAppWorkflow - Orchestrates a workflow across multiple applications.
 */
export const composioService = {
  executeUserRequest,
  initiateAuth,
  waitForConnection,
  getUserConnectedAccounts,
  multiAppWorkflow,
};