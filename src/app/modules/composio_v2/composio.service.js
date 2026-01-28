import { Composio } from "@composio/core";
import config from "../../../../config/index.js";
import ComposionAuth from './composio.model.js'
import AuthConfig from "./authConfig.model.js";
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import Conversation from '../conversations/conversation.model.js';
import { aiClassificationService } from "./aiClassification.service.js";
import { withTenantContext, withTenantFilter } from '../../helpers/tenantQuery.js';

const composio = new Composio({
  apiKey: config.composio.orgApiKey,
})

const initiateComposioAuth = async (body, req = null) => {
  const { app_name, user_id } = body;

  try {

    const auth_config = await AuthConfig.findOne({ app: app_name });
    console.log(`Found Auth Config for app ${app_name}:`, auth_config);

    const auth_config_id = auth_config ? auth_config.authConfigId : null;
    console.log(`Auth Config ID for app ${app_name}:`, auth_config_id);
    const existingAuthQuery = { userId: user_id, authConfigId: auth_config_id, status: 'ACTIVE' };
    const existingComposioAuth = await ComposionAuth.findOne(
      req ? withTenantFilter(req, existingAuthQuery) : existingAuthQuery
    );
    console.log(`Existing Composio Auth for user ${user_id} and app ${app_name}:`, existingComposioAuth);

    if (existingComposioAuth) {
      console.log(`Found existing Composio auth for user ${user_id}:`, existingComposioAuth);
      // You may want to handle re-authentication or token refresh here
      return { authConfig: existingComposioAuth, message: 'User is already authenticated' };
    }
    const connectionUrl = await composio.connectedAccounts.initiate(
      user_id,
      auth_config_id
    );
    // await connectionUrl.waitForConnection();
    const composioAuth = new ComposionAuth(
      req ? withTenantContext(req, {
        userId: user_id,
        authConfigId: auth_config_id,
        connectedAccountId: connectionUrl.id,
        integrationId: connectionUrl.integrationId,
        redirectUrl: connectionUrl.redirectUrl,
        status: 'pending',
        toolkit: {
          slug: app_name,
        }
      }) : {
        userId: user_id,
        authConfigId: auth_config_id,
        connectedAccountId: connectionUrl.id,
        integrationId: connectionUrl.integrationId,
        redirectUrl: connectionUrl.redirectUrl,
        status: 'pending',
        toolkit: {
          slug: app_name,
        }
      }
    );
    await composioAuth.save();
    console.log('Composio connection initiated successfully', connectionUrl);
    return { authConfig: connectionUrl };
  } catch (error) {
    console.error('Error initiating Composio auth:', error);
    throw new Error('Failed to initiate authentication');
  }
};

const waitForConnection = async (connectedAccountId) => {
  try {
    const connection = await composio.connectedAccounts.waitForConnection(connectedAccountId);
    console.log('Composio connection established successfully', connection);
    await ComposionAuth.updateOne(
      { connectedAccountId: connectedAccountId },
      { status: connection.data.status, accessToken: connection.data.accessToken, refreshToken: connection.data.refreshToken, idToken: connection.data.idToken, toolkit: connection.toolkit },
      { upsert: true }
    );
    // Return the connection details
    return { connection };
  } catch (error) {
    console.error('Error waiting for Composio connection:', error);
    throw new Error('Failed to establish connection');
  }
};

/**
 * Generate a unique conversation ID for Composio conversations
 * @returns {string} A unique conversation ID
 */
const generateComposioConversationId = () => {
  return `composio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Generate a guest user ID
 * @returns {string} A unique guest user ID
 */
const generateGuestUserId = () => {
  return `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handle Composio conversation creation or retrieval
 * @param {string} userId 
 * @param {string} conversationId 
 * @param {string} message 
 * @param {boolean} isGuest 
 * @returns {Object} conversation object
 */
const handleComposioConversation = async (userId, conversationId, message, isGuest = false) => {
  try {
    let conversation;

    if (conversationId) {
      // Try to find existing conversation
      conversation = await Conversation.findByConversationId(conversationId, userId);

      if (!conversation) {
        throw new Error('Conversation not found');
      }
    } else {
      // Create new conversation
      const newConversationId = generateComposioConversationId();

      conversation = new Conversation({
        conversationId: newConversationId,
        userId: userId,
        title: message.length > 50 ? `${message.substring(0, 50)}...` : message,
        messages: [],
        metadata: {
          category: 'composio',
          userType: isGuest ? 'guest' : 'authenticated',
          isGuest: isGuest
        },
        status: 'active'
      });

      await conversation.save();
    }

    return conversation;
  } catch (error) {
    console.error('Error handling composio conversation:', error);
    throw error;
  }
};

/**
 * Add user message to conversation
 * @param {string} conversationId 
 * @param {string} userId 
 * @param {string} message 
 * @param {boolean} isGuest 
 */
const addComposioQueryMessage = async (conversationId, userId, message, isGuest = false) => {
  try {
    const conversation = await Conversation.findByConversationId(conversationId, userId);

    if (conversation) {
      conversation.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date(),
        metadata: {
          isGuest: isGuest,
          type: 'composio_query'
        }
      });

      conversation.lastActivity = new Date();
      conversation.messageCount = conversation.messages.length;

      await conversation.save();
    }
  } catch (error) {
    console.error('Error adding composio query message:', error);
    throw error;
  }
};

/**
 * Add assistant response to conversation
 * @param {string} conversationId 
 * @param {string} userId 
 * @param {string} response 
 * @param {Object} metadata 
 * @param {boolean} isGuest 
 */
const addComposioResponseMessage = async (conversationId, userId, response, metadata = {}, isGuest = false) => {
  try {
    const conversation = await Conversation.findByConversationId(conversationId, userId);

    if (conversation) {
      conversation.messages.push({
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        metadata: {
          isGuest: isGuest,
          type: 'composio_response',
          ...metadata
        }
      });

      conversation.lastActivity = new Date();
      conversation.messageCount = conversation.messages.length;

      await conversation.save();
    }
  } catch (error) {
    console.error('Error adding composio response message:', error);
    throw error;
  }
};

/**
 * Process Composio conversation using AI classification
 * @param {Object} inputs 
 * @returns {Object} processing result
 */
const processComposioConversation = async (inputs) => {
  try {
    const { query, conversationContext, history, userId, conversationId } = inputs;

    // Use the existing AI classification service to process the user input
    const result = await aiClassificationService.processUserInputService(query, {
      userId,
      conversationId,
      history: conversationContext
    });

    if (result.success) {
      return {
        response: result.data.response || 'Task completed successfully',
        metadata: {
          identifiedApp: result.data.identifiedApp,
          identifiedAction: result.data.identifiedAction,
          confidence: result.data.confidence,
          executionResult: result.data.executionResult
        },
        executionResult: result.data.executionResult
      };
    } else {
      return {
        response: result.error || 'Failed to process your request',
        metadata: {
          error: result.error
        },
        executionResult: null
      };
    }
  } catch (error) {
    console.error('Error processing composio conversation:', error);
    return {
      response: 'I encountered an error while processing your request. Please try again.',
      metadata: {
        error: error.message
      },
      executionResult: null
    };
  }
};

export const composioService = {
  initiateComposioAuth,
  waitForConnection,
  generateComposioConversationId,
  generateGuestUserId,
  handleComposioConversation,
  addComposioQueryMessage,
  addComposioResponseMessage,
  processComposioConversation
};