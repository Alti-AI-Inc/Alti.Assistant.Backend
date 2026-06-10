import { Composio } from '@composio/core';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import ComposionAuth from './composio.model.js';
import AuthConfig from './authConfig.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import Conversation from '../conversations/conversation.model.js';
import { aiClassificationService } from './aiClassification.service.js';
import {
  withTenantContext,
  withTenantFilter,
} from '../../helpers/tenantQuery.js';
// Security Patch: Import modules for input sanitization and encryption.
import sanitizeHtml from 'sanitize-html';
import crypto from 'crypto';

// --- Security Enhancements ---

/**
 * Default options for sanitize-html to strip all HTML tags and attributes, preventing Stored XSS.
 * @type {import('sanitize-html').IOptions}
 */
const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

/**
 * Configuration for AES-256-GCM encryption.
 * @type {string}
 */
const ALGORITHM = 'aes-256-gcm';
/**
 * GCM standard IV size is 12 bytes.
 * @type {number}
 */
const IV_LENGTH_BYTES = 12; // GCM standard IV size is 12 bytes.
/**
 * The name of the secret in GCP Secret Manager containing the 64-char hex-encoded key.
 * @type {string}
 */
const ENCRYPTION_KEY_SECRET = 'db-encryption-key'; // The name of the secret in GCP Secret Manager containing the 64-char hex-encoded key.

/**
 * In-memory cache for the encryption key to reduce Secret Manager calls.
 * @type {Buffer | undefined}
 */
let encryptionKey;

/**
 * Fetches the database encryption key from GCP Secret Manager.
 * The key is expected to be a 64-character hex-encoded string (representing 32 bytes).
 * @returns {Promise<Buffer>} The encryption key as a Buffer.
 * @throws {Error} If the key is not found or has an invalid format.
 */
async function getEncryptionKey() {
  if (encryptionKey) {
    return encryptionKey;
  }
  const keyHex = await getSecret(ENCRYPTION_KEY_SECRET);
  if (!keyHex || keyHex.length !== 64) {
    console.error(`Encryption key '${ENCRYPTION_KEY_SECRET}' is invalid. It must be a 64-character hex string.`);
    throw new Error(`Encryption key '${ENCRYPTION_KEY_SECRET}' must be a 64-character hex string.`);
  }
  encryptionKey = Buffer.from(keyHex, 'hex');
  return encryptionKey;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param {string} text - The plaintext to encrypt.
 * @returns {Promise<string|null>} The encrypted string in 'iv:authtag:ciphertext' hex format, or null if input is falsy.
 */
async function encrypt(text) {
  if (!text) {
    return null;
  }
  const key = await getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Store IV and authTag with the ciphertext for decryption.
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * NOTE: This function is not actively used in this file but is provided for completeness
 * to demonstrate how to retrieve and use the encrypted tokens elsewhere in the application.
 * @param {string} encryptedText - The encrypted string in 'iv:authtag:ciphertext' hex format.
 * @returns {Promise<string|null>} The decrypted plaintext, or null if input is invalid.
 */
async function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') {
    return null;
  }
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    console.error('Invalid encrypted text format. Expected "iv:authtag:ciphertext".');
    // Returning null is safer than throwing an error or returning the input.
    return null;
  }

  try {
    const key = await getEncryptionKey();
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt data:', error);
    return null;
  }
}

// --- End Security Enhancements ---

// Optimization Recommendation:
// For AuthConfig model, consider adding an index on the 'app' field for faster lookups:
// AuthConfigSchema.index({ app: 1 });

// Optimization Recommendation:
// For ComposionAuth model, consider adding indexes for improved query performance:
// - Index on 'userId' and 'status' for common filtering.
// - Index on 'authConfigId' for direct lookups.
// - Index on 'toolkit.slug' for toolkit-based searches.
// - Index on 'connectedAccountId' for updates.
// Example:
// ComposionAuthSchema.index({ userId: 1, status: 1 });
// ComposionAuthSchema.index({ authConfigId: 1 });
// ComposionAuthSchema.index({ 'toolkit.slug': 1 });
// ComposionAuthSchema.index({ connectedAccountId: 1 });

// Optimization Recommendation:
// For Conversation model, consider adding a compound index on 'conversationId' and 'userId'
// for the findByConversationId method:
// ConversationSchema.index({ conversationId: 1, userId: 1 });

// --- GCP Secret Manager Integration ---

/**
 * GCP Secret Manager client for securely fetching secrets.
 * @type {SecretManagerServiceClient}
 */
const secretManagerClient = new SecretManagerServiceClient();
/**
 * In-memory cache for secrets to reduce latency and API calls.
 * @type {Map<string, string>}
 */
const secretCache = new Map();

/**
 * Fetches a secret from GCP Secret Manager with in-memory caching to reduce latency and API calls.
 * @param {string} secretName - The name of the secret to fetch.
 * @returns {Promise<string>} The secret value.
 * @throws {Error} If the GCP project ID is not set or the secret cannot be accessed.
 */
async function getSecret(secretName) {
  if (secretCache.has(secretName)) {
    return secretCache.get(secretName);
  }
  // The GCP_PROJECT_ID is automatically available in most GCP environments like Cloud Run.
  const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error('GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT environment variable must be set.');
    throw new Error('GCP project ID is not configured.');
  }
  const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
  try {
    const [version] = await secretManagerClient.accessSecretVersion({ name });
    const payload = version.payload.data.toString('utf8');
    secretCache.set(secretName, payload);
    return payload;
  } catch (error) {
    console.error(`Failed to access secret: ${name}`, error);
    throw new Error(`Could not retrieve secret: ${secretName}. Ensure it exists and the service account has 'Secret Manager Secret Accessor' role.`);
  }
}

/**
 * Singleton instance of the Composio SDK.
 * @type {Composio | undefined}
 */
let composioInstance;

/**
 * Lazily initializes and returns a singleton instance of the Composio SDK.
 * It retrieves the API key by first checking for the 'COMPOSIO_ORG_API_KEY' environment variable
 * (ideal for Cloud Run secret injection) and then falling back to GCP Secret Manager.
 * @returns {Promise<Composio>} The initialized Composio SDK instance.
 * @throws {Error} If the API key cannot be found in either environment variables or Secret Manager.
 */
async function getComposioInstance() {
  if (composioInstance) {
    return composioInstance;
  }

  // Prioritize environment variables, then fall back to Secret Manager.
  // This is ideal for environments like Cloud Run where secrets can be injected as env vars.
  const apiKey = process.env.COMPOSIO_ORG_API_KEY || await getSecret('composio-org-api-key');

  if (!apiKey) {
    throw new Error('Composio API key is not configured. Set COMPOSIO_ORG_API_KEY environment variable or a secret named "composio-org-api-key" in Secret Manager.');
  }

  composioInstance = new Composio({ apiKey });
  return composioInstance;
}

/**
 * Initiates the Composio authentication flow for a given application and user.
 * It checks for existing authentication, creates a default AuthConfig if not found,
 * and then initiates a new connection with Composio.
 *
 * @description This service is multi-tenant aware. If an Express `req` object is provided,
 * it will automatically filter queries and scope new records to the user's tenant.
 *
 * @param {object} body - The request body containing authentication details.
 * @param {string} body.app_name - The name of the application for which to initiate authentication.
 * @param {string} body.user_id - The ID of the user initiating the authentication.
 * @param {import('express').Request} [req=null] - Optional Express request object, used for tenant context filtering.
 * @returns {Promise<object>} An object containing either the existing `authConfig` if already authenticated,
 *   or the `connectionUrl` details for a new authentication flow.
 * @throws {Error} If the authentication initiation fails.
 */
const initiateComposioAuth = async (body, req = null) => {
  const { app_name, user_id } = body;

  try {
    // AuthConfig is potentially modified and saved later, so .lean() is not suitable here.
    let auth_config = await AuthConfig.findOne({ app: app_name });
    if (!auth_config) {
      console.log(`AuthConfig for app ${app_name} not found in DB. Proactively creating default...`);
      auth_config = new AuthConfig({
        app: app_name,
        authConfigId: `ac_${app_name}`,
        isComposioManaged: true,
      });
      await auth_config.save();
    }
    console.log(`Found Auth Config for app ${app_name}:`, auth_config);

    let auth_config_id = auth_config.authConfigId;
    console.log(`Auth Config ID for app ${app_name}:`, auth_config_id);
    const normalizedAppName = app_name.toLowerCase();
    const existingAuthQuery = {
      userId: user_id,
      status: 'ACTIVE',
      $or: [
        { authConfigId: auth_config_id },
        { 'toolkit.slug': normalizedAppName },
        { authConfigId: normalizedAppName },
      ],
    };
    // Optimization: Using .lean() as existingComposioAuth is only read and not modified.
    const existingComposioAuth = await ComposionAuth.findOne(
      req ? withTenantFilter(req, existingAuthQuery) : existingAuthQuery
    ).lean();
    console.log(
      `Existing Composio Auth for user ${user_id} and app ${app_name}:`,
      existingComposioAuth
    );

    if (existingComposioAuth) {
      console.log(
        `Found existing Composio auth for user ${user_id}:`,
        existingComposioAuth
      );
      // You may want to handle re-authentication or token refresh here
      return {
        authConfig: existingComposioAuth,
        message: 'User is already authenticated',
      };
    }
    let connectionUrl;
    try {
      // Get the lazily-initialized Composio client
      const composio = await getComposioInstance();
      connectionUrl = await composio.connectedAccounts.initiate(
        user_id,
        auth_config_id
      );
    } catch (initiateError) {
      console.warn(`[v2] Custom config ${auth_config_id} initiation failed: ${initiateError.message}. Falling back to globally managed credentials using app_name: ${app_name}...`);
      
      // Get the lazily-initialized Composio client for fallback
      const composio = await getComposioInstance();
      // Fallback: use app_name directly as auth_config_id
      connectionUrl = await composio.connectedAccounts.initiate(
        user_id,
        app_name
      );
      
      // Persist the corrected config ID in database
      auth_config.authConfigId = app_name;
      await auth_config.save();
      
      // Update our local tracking variable
      auth_config_id = app_name;
    }

    // await connectionUrl.waitForConnection();
    const composioAuth = new ComposionAuth(
      req
        ? withTenantContext(req, {
            userId: user_id,
            authConfigId: auth_config_id,
            connectedAccountId: connectionUrl.id,
            integrationId: connectionUrl.integrationId,
            redirectUrl: connectionUrl.redirectUrl,
            status: 'PENDING',
            toolkit: {
              slug: app_name,
            },
          })
        : {
            userId: user_id,
            authConfigId: auth_config_id,
            connectedAccountId: connectionUrl.id,
            integrationId: connectionUrl.integrationId,
            redirectUrl: connectionUrl.redirectUrl,
            status: 'PENDING',
            toolkit: {
              slug: app_name,
            },
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

/**
 * Waits for a Composio connection to be established and updates the database
 * with the connection status and tokens. Tokens are encrypted before being stored.
 *
 * @param {string} connectedAccountId - The ID of the connected account to wait for.
 * @returns {Promise<object>} An object containing the established `connection` details.
 * @throws {Error} If waiting for the connection fails.
 */
const waitForConnection = async (connectedAccountId) => {
  try {
    // Get the lazily-initialized Composio client
    const composio = await getComposioInstance();
    const connection =
      await composio.connectedAccounts.waitForConnection(connectedAccountId);
    console.log('Composio connection established successfully', connection);

    // Security Patch: Encrypt tokens before storing them in the database to protect sensitive credentials at rest.
    const updatePayload = {
      status: (connection.data.status || 'ACTIVE').toUpperCase(),
      toolkit: connection.toolkit,
    };

    if (connection.data.accessToken) {
      updatePayload.accessToken = await encrypt(connection.data.accessToken);
    }
    if (connection.data.refreshToken) {
      updatePayload.refreshToken = await encrypt(connection.data.refreshToken);
    }
    if (connection.data.idToken) {
      updatePayload.idToken = await encrypt(connection.data.idToken);
    }

    await ComposionAuth.updateOne(
      { connectedAccountId: connectedAccountId },
      updatePayload,
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
 * Generate a unique conversation ID for Composio conversations.
 * @returns {string} A unique conversation ID in the format `composio-timestamp-randomstring`.
 */
const generateComposioConversationId = () => {
  return `composio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Generate a guest user ID.
 * @returns {string} A unique guest user ID in the format `guest-timestamp-randomstring`.
 */
const generateGuestUserId = () => {
  return `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handles the creation or retrieval of a Composio-related conversation.
 * If a `conversationId` is provided, it attempts to find an existing conversation.
 * Otherwise, it creates a new conversation with a generated ID and initial message.
 *
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {string | null | undefined} conversationId - The ID of an existing conversation, or null/undefined to create a new one.
 * @param {string} message - The initial message for a new conversation, or a message to update the title if existing.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @returns {Promise<import('mongoose').Document>} The conversation document (either newly created or retrieved).
 * @throws {Error} If an existing conversation is not found or if there's an error during creation/retrieval.
 */
const handleComposioConversation = async (
  userId,
  conversationId,
  message,
  isGuest = false
) => {
  try {
    let conversation;

    if (conversationId) {
      // Try to find existing conversation
      // The conversation object is modified and saved later, so .lean() is not suitable here.
      conversation = await Conversation.findByConversationId(
        conversationId,
        userId
      );

      if (!conversation) {
        throw new Error('Conversation not found');
      }
    } else {
      // Create new conversation
      const newConversationId = generateComposioConversationId();

      // Security Patch: Sanitize user-provided message to prevent Stored XSS vulnerabilities.
      const sanitizedMessage = sanitizeHtml(message, sanitizeOptions);

      conversation = new Conversation({
        conversationId: newConversationId,
        userId: userId,
        title: sanitizedMessage.length > 50 ? `${sanitizedMessage.substring(0, 50)}...` : sanitizedMessage,
        messages: [],
        metadata: {
          category: 'composio',
          userType: isGuest ? 'guest' : 'authenticated',
          isGuest: isGuest,
        },
        status: 'active',
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
 * Adds a user's query message to an existing Composio conversation.
 *
 * @param {string} conversationId - The ID of the conversation to which the message will be added.
 * @param {string} userId - The ID of the user sending the message.
 * @param {string} message - The content of the user's message.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @returns {Promise<void>}
 * @throws {Error} If an error occurs while adding the message to the conversation.
 */
const addComposioQueryMessage = async (
  conversationId,
  userId,
  message,
  isGuest = false
) => {
  try {
    // Security Patch: Sanitize user-provided message to prevent Stored XSS.
    const sanitizedMessage = sanitizeHtml(message, sanitizeOptions);

    // Optimization: Use updateOne with $push to atomically add the message.
    // This is more efficient than fetching the entire document, modifying it in memory, and saving it back.
    // It reduces network overhead (avoids transferring the full messages array) and prevents potential race conditions.
    // We assume Conversation.findByConversationId is equivalent to a findOne on conversationId and userId.
    const updatePayload = {
      $push: {
        messages: {
          role: 'user',
          content: sanitizedMessage,
          timestamp: new Date(),
          metadata: {
            isGuest: isGuest,
            type: 'composio_query',
          },
        },
      },
      $set: { lastActivity: new Date() },
      $inc: { messageCount: 1 },
    };

    // This operation will not throw an error if the document is not found,
    // matching the original logic's `if (conversation)` check.
    await Conversation.updateOne({ conversationId, userId }, updatePayload);
  } catch (error) {
    console.error('Error adding composio query message:', error);
    throw error;
  }
};

/**
 * Adds an assistant's response message to an existing Composio conversation.
 *
 * @param {string} conversationId - The ID of the conversation to which the response will be added.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {string} response - The content of the assistant's response.
 * @param {object} [metadata={}] - Additional metadata to be stored with the message.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @returns {Promise<void>}
 * @throws {Error} If an error occurs while adding the response message to the conversation.
 */
const addComposioResponseMessage = async (
  conversationId,
  userId,
  response,
  metadata = {},
  isGuest = false
) => {
  try {
    // Security Patch: Sanitize assistant response to prevent Stored XSS, as it may echo user input.
    const sanitizedResponse = sanitizeHtml(response, sanitizeOptions);

    // Optimization: Use updateOne with $push for an atomic and efficient update.
    // This avoids a read-modify-write cycle, reducing network traffic and preventing race conditions.
    // We assume Conversation.findByConversationId is equivalent to a findOne on conversationId and userId.
    const updatePayload = {
      $push: {
        messages: {
          role: 'assistant',
          content: sanitizedResponse,
          timestamp: new Date(),
          metadata: {
            isGuest: isGuest,
            type: 'composio_response',
            ...metadata,
          },
        },
      },
      $set: { lastActivity: new Date() },
      $inc: { messageCount: 1 },
    };

    // This operation will not throw an error if the document is not found,
    // matching the original logic's `if (conversation)` check.
    await Conversation.updateOne({ conversationId, userId }, updatePayload);
  } catch (error) {
    console.error('Error adding composio response message:', error);
    throw error;
  }
};

/**
 * Processes a Composio conversation query using the AI classification service.
 * It takes user input, conversation context, and history to determine the appropriate
 * action and application, then executes it.
 *
 * @param {object} inputs - The input object for processing the conversation.
 * @param {string} inputs.query - The user's natural language query.
 * @param {Array<object>} inputs.conversationContext - The context of the current conversation.
 * @param {Array<object>} inputs.history - The historical messages of the conversation.
 * @param {string} inputs.userId - The ID of the user making the query.
 * @param {string} inputs.conversationId - The ID of the current conversation.
 * @returns {Promise<object>} An object containing the AI's response, metadata about the classification
 *   (identified app, action, confidence), and the execution result.
 */
const processComposioConversation = async (inputs) => {
  try {
    const { query, conversationContext, history, userId, conversationId } =
      inputs;

    // Security Patch: Sanitize user-provided query to prevent XSS or other injection attacks in downstream services.
    const sanitizedQuery = sanitizeHtml(query, sanitizeOptions);

    // Use the existing AI classification service to process the user input
    const result = await aiClassificationService.processUserInputService(
      sanitizedQuery,
      {
        userId,
        conversationId,
        history: conversationContext,
      }
    );

    if (result.success) {
      return {
        response: result.data.response || 'Task completed successfully',
        metadata: {
          identifiedApp: result.data.identifiedApp,
          identifiedAction: result.data.identifiedAction,
          confidence: result.data.confidence,
          executionResult: result.data.executionResult,
        },
        executionResult: result.data.executionResult,
      };
    } else {
      return {
        response: result.error || 'Failed to process your request',
        metadata: {
          error: result.error,
        },
        executionResult: null,
      };
    }
  } catch (error) {
    console.error('Error processing composio conversation:', error);
    return {
      response:
        'I encountered an error while processing your request. Please try again.',
      metadata: {
        error: error.message,
      },
      executionResult: null,
    };
  }
};

/**
 * @typedef {object} ComposioService
 * @property {function(object, import('express').Request=): Promise<object>} initiateComposioAuth - Initiates the Composio authentication flow.
 * @property {function(string): Promise<object>} waitForConnection - Waits for a Composio connection to be established.
 * @property {function(): string} generateComposioConversationId - Generates a unique ID for Composio conversations.
 * @property {function(): string} generateGuestUserId - Generates a unique ID for guest users.
 * @property {function(string, string | null | undefined, string, boolean=): Promise<import('mongoose').Document>} handleComposioConversation - Creates or retrieves a Composio conversation.
 * @property {function(string, string, string, boolean=): Promise<void>} addComposioQueryMessage - Adds a user's query message to a conversation.
 * @property {function(string, string, string, object=, boolean=): Promise<void>} addComposioResponseMessage - Adds an assistant's response message to a conversation.
 * @property {function(object): Promise<object>} processComposioConversation - Processes a Composio conversation query using AI classification.
 */

/**
 * Service module for interacting with Composio functionalities, including authentication,
 * connection management, and conversation handling.
 * @type {ComposioService}
 */
export const composioService = {
  initiateComposioAuth,
  waitForConnection,
  generateComposioConversationId,
  generateGuestUserId,
  handleComposioConversation,
  addComposioQueryMessage,
  addComposioResponseMessage,
  processComposioConversation,
};