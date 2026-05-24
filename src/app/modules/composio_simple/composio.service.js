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

const composio = new Composio({ apiKey: config.composio.orgApiKey });
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

export const executeUserRequest = async (
  userMessage,
  userId,
  conversationId = null,
  scopedApp = null // Added for scoped app execution
) => {
  const startTime = Date.now();
  try {
    const conversationContext =
      await countTokenFromConversationAndProvideContext(conversationId);
    let history = [];
    let appList = [];
    let toolKits = {};
    console.log('Conversation Context:', conversationContext.needSummarization);

    if (scopedApp) {
      // Directly lock execution to the selected app, bypassing LLM app identification
      appList = [scopedApp];
      toolKits = { [scopedApp]: 'latest' };
      console.log('Isolated App Scoping Enabled:', scopedApp);
    } else {
      if (conversationContext.needSummarization) {
        history = conversationContext.summary;
        const appInfo = await findAppropriateApp(userMessage, [], history);
        appList = appInfo.appList;
        toolKits = appInfo.toolKitVersions;
      } else {
        history = conversationContext.conversation;
        const appInfo = await findAppropriateApp(userMessage, history);
        appList = appInfo.appList;
        toolKits = appInfo.toolKitVersions;
      }
    }

    const normalizedAppList = appList.map(a => a.toLowerCase());
    const composioAuth = await ComposioAuth.find({
      userId,
      status: 'ACTIVE',
      $or: [
        { 'toolkit.slug': { $in: normalizedAppList } },
        { authConfigId: { $in: normalizedAppList } },
        { authConfigId: { $in: normalizedAppList.map(a => `ac_${a}`) } },
      ],
    });
    console.log('Active Composio Auths for user:', composioAuth.length);
    if (
      composioAuth.length === 0 &&
      appList.length > 0 &&
      !(appList.length === 1 && appList[0] === 'none')
    ) {
      return {
        success: false,
        error:
          'No connected accounts found for the identified apps. Please connect your accounts.',
      };
    } else {
      appList = composioAuth.map((auth) => auth.toolkit.slug);
    }
    console.log('Final App List after checking connections:', appList);
    let conciseUserMessage = '';
    if (conversationContext.needSummarization) {
      conciseUserMessage = await generateUserMessasgeFromContext(
        userMessage,
        history
      );
    } else {
      conciseUserMessage = await generateUserMessasgeFromContext(
        userMessage,
        '',
        conversationContext.conversation
      );
    }
    console.log('Concise User Message:', conciseUserMessage);
    console.log('Identified Apps:', appList);
    const toolsData = await getVectorSearchResults(
      conciseUserMessage,
      5,
      appList
    );
    console.log('Using toolkits:', appList.toolKitVersions);
    // Generate and execute
    const result = await generateAndExecuteTools(
      conciseUserMessage,
      toolsData,
      toolKits,
      userId
    );
    if (result?.results[0]) {
      //Clear chat history if execution successful and clear summary
      await Conversation.updateOne(
        { conversationId, userId },
        { $set: { messages: [] } }
      );
      await ConversationSummary.deleteOne({ conversationId, userId });
    }
    return {
      success: true,
      data: {
        response: result?.results[0]
          ? 'The action has been completed successfully.'
          : result?.response?.candidates[0]?.content?.parts[0]?.text.trim(),
        conversationId,
        toolsUsed: [],
        executionTime: `${Date.now() - startTime}ms`,
      },
    };
  } catch (error) {
    console.error('Error executing user request:', error);
    return { success: false, error: error.message };
  }
};

const countTokenFromConversationAndProvideContext = async (conversationId) => {
  const conversation = await Conversation.findOne({
    conversationId: conversationId,
  });
  if (!conversation) return { needSummarization: false, conversation: [] };
  let totalTokens = 0;
  let constructMessasges = ``;
  for (const message of conversation.messages) {
    constructMessasges += ` ${message.content}`;
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
  const tokenCount = await model.countTokens(constructMessasges);
  totalTokens = tokenCount;

  if (totalTokens > 4000) {
    return {
      needSummarization: true,
      tokenCount: totalTokens,
      summary: await getConversationWithContext(conversationId, totalTokens),
    };
  } else {
    return {
      needSummarization: false,
      tokenCount: totalTokens,
      conversation: conversation.messages,
    };
  }
};

export const initiateAuth = async (appName, userId) => {
  try {
    let authConfig = await AuthConfig.findOne({ app: appName });
    if (!authConfig) {
      console.log(`AuthConfig for ${appName} not found in DB. Proactively creating default...`);
      authConfig = new AuthConfig({
        app: appName,
        authConfigId: `ac_${appName}`,
        isComposioManaged: true,
      });
      await authConfig.save();
    }
    let connectionUrl;
    try {
      connectionUrl = await composio.connectedAccounts.initiate(
        userId,
        authConfig.authConfigId
      );
    } catch (initiateError) {
      console.warn(`[Simple] Custom config ${authConfig.authConfigId} initiation failed: ${initiateError.message}. Falling back to globally managed credentials using appName: ${appName}...`);
      
      // Fallback: use appName directly as authConfigId
      connectionUrl = await composio.connectedAccounts.initiate(
        userId,
        appName
      );
      
      // Persist the corrected config ID in database
      authConfig.authConfigId = appName;
      await authConfig.save();
    }

    const composioAuth = new ComposioAuth({
      userId,
      authConfigId: authConfig.authConfigId,
      connectedAccountId: connectionUrl.id,
      status: 'PENDING',
      integrationId: connectionUrl.integrationId,
      redirectUrl: connectionUrl.redirectUrl,
      toolkit: { slug: appName },
    });
    await composioAuth.save();
    return { success: true, data: connectionUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const waitForConnection = async (connectedAccountId) => {
  try {
    const connection =
      await composio.connectedAccounts.waitForConnection(connectedAccountId);
    await ComposioAuth.updateOne(
      { connectedAccountId },
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

export const getUserConnectedAccounts = async (userId) => {
  try {
    const accounts = await ComposioAuth.find({
      userId,
      status: 'ACTIVE',
    }).sort({ updatedAt: -1 }).lean();
    return { success: true, data: accounts };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

async function multiAppWorkflow(query, apps, toolKits, entityId) {
  // Find appropriate apps (multiple)
  const appInfo = await findAppropriateApp(query, apps, toolKits);

  // Get relevant tools from all identified apps using vector search
  const toolsData = await getVectorSearchResults(
    query,
    appInfo.appList.length * 5,
    appInfo.appList
  );

  console.log('Using toolkits:', appInfo.toolKitVersions);

  // Generate and execute
  const result = await generateAndExecuteTools(
    query,
    toolsData,
    appInfo.toolKitVersions,
    entityId
  );
  return result;
}

export const composioService = {
  executeUserRequest,
  initiateAuth,
  waitForConnection,
  getUserConnectedAccounts,
  multiAppWorkflow,
};
