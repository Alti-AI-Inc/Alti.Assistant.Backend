/**
 * @typedef {Object} AppConnectionInfo
 * @property {string} app - The name of the application.
 * @property {string} authConfigId - The unique ID of the authentication configuration for the app.
 * @property {boolean} isConnected - True if the user has an active connection to this app, false otherwise.
 * @property {'active'|'pending'|'not_connected'|string} connectionStatus - The status of the user's connection to this app.
 * @property {string} [connectedAccountId] - The ID of the connected account if `isConnected` is true.
 * @property {string} [integrationId] - The ID of the integration if `isConnected` is true.
 */

/**
 * @typedef {Object} GetUserAvailableAppsResult
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} [error] - Error message if the operation failed.
 * @property {AppConnectionInfo[]} apps - All available apps, including connection status.
 * @property {AppConnectionInfo[]} connectedApps - Apps to which the user is currently connected.
 * @property {AppConnectionInfo[]} availableForConnection - Apps that are available but not yet connected by the user.
 */

/**
 * @typedef {Object} ToolParameter
 * @property {string} name - The name of the parameter.
 * @property {string} type - The data type of the parameter (e.g., 'string', 'number', 'boolean').
 * @property {string} description - A description of the parameter.
 * @property {boolean} [required] - Indicates if the parameter is required.
 */

/**
 * @typedef {Object} ToolInfo
 * @property {string} name - The name of the tool.
 * @property {string} description - A description of what the tool does.
 * @property {string} app - The name of the application this tool belongs to.
 * @property {Object.<string, ToolParameter>} parameters - An object mapping parameter names to their definitions.
 * @property {string} slug - A unique slug for the tool.
 */

/**
 * @typedef {Object} LocalToolInfo
 * @property {string} name - The name of the local tool.
 * @property {string} description - A description of what the local tool does.
 * @property {string} slug - A unique slug for the local tool.
 */

/**
 * @typedef {Object} GetUserAvailableToolsResult
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} [error] - Error message if the operation failed.
 * @property {Object.<string, ToolInfo[]>} toolsByApp - An object where keys are app names and values are arrays of tools available for that app.
 * @property {string[]} connectedApps - An array of names of apps the user is connected to and for which tools were fetched.
 * @property {LocalToolInfo[]} localTools - An array of tools available from the local database.
 * @property {number} totalTools - The total number of tools fetched from all sources.
 */

/**
 * @typedef {Object} AppConnectionStatus
 * @property {string} app - The name of the application.
 * @property {boolean} isConnected - True if the user has an active connection to this app, false otherwise.
 * @property {'active'|'pending'|'not_connected'|string} status - The status of the user's connection to this app.
 * @property {string} [authConfigId] - The unique ID of the authentication configuration for the app.
 * @property {string} [connectedAccountId] - The ID of the connected account if `isConnected` is true.
 */

/**
 * @typedef {Object} CheckAppConnectionsResult
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} [error] - Error message if the operation failed.
 * @property {boolean} allConnected - True if the user is connected to all `requiredApps`, false otherwise.
 * @property {AppConnectionStatus[]} connectionStatus - An array detailing the connection status for each requested app.
 * @property {string[]} missingConnections - An array of app names that are required but not connected.
 * @property {string[]} connectedApps - An array of app names that are required and connected.
 */

/**
 * @typedef {Object} GetAvailableAppsForDetectionResult
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} [error] - Error message if the operation failed.
 * @property {string[]} availableApps - A combined, deduplicated list of all apps available for detection (from auth configs, local tools, and platform apps).
 * @property {string[]} authConfigApps - Apps derived from authentication configurations.
 * @property {string[]} toolApps - Apps derived from local tool definitions.
 */

/**
 * @typedef {Object} ValidateDetectedAppsResult
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} [error] - Error message if the operation failed.
 * @property {string[]} validApps - An array of detected app names that are recognized as available.
 * @property {string[]} invalidApps - An array of detected app names that are not recognized as available.
 * @property {string[]} availableApps - The full list of all available apps for detection.
 * @property {CheckAppConnectionsResult|null} connectionStatus - The connection status for `validApps` if `userId` was provided, otherwise null.
 */

/**
 * @typedef {Object} ComposioConnectionUrlResponse
 * @property {string} id - The ID of the connected account.
 * @property {string} integrationId - The ID of the integration.
 * @property {string} redirectUrl - The URL to redirect the user to for completing the connection.
 */

/**
 * @typedef {Object} GetConnectionUrlResult
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} [error] - Error message if the operation failed.
 * @property {boolean} [alreadyConnected] - True if the app is already connected for the user.
 * @property {string} [message] - A message, typically indicating if already connected.
 * @property {Object} [connection] - Details of the existing connection if `alreadyConnected` is true.
 * @property {string} [connectionUrl] - The URL to initiate a new connection if `alreadyConnected` is false.
 * @property {string} [connectedAccountId] - The ID of the connected account if a new connection was initiated.
 * @property {Object} [authConfig] - The authentication configuration details for the app.
 */

import { Composio } from '@composio/core';
import config from '../../../../../config/index.js';
// GCP: Import the Pub/Sub client for asynchronous task offloading.
import { PubSub } from '@google-cloud/pubsub';
import ComposioAuth from '../../composio_v2/composio.model.js';
import AuthConfig from '../../composio_v2/authConfig.model.js';
import Tool from '../../composio_v2/tools.model.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Initializes the Composio SDK with the organization's API key.
 * This instance is used to interact with the Composio platform for operations like
 * fetching tools and initiating app connections.
 * @type {Composio}
 */
const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

// GCP: Initialize the Pub/Sub client.
/**
 * Google Cloud Pub/Sub client instance for publishing messages to topics.
 * Used for offloading long-running tasks like tool synchronization to background workers.
 * @type {PubSub}
 */
const pubSubClient = new PubSub();
// GCP: Define the Pub/Sub topic name for tool synchronization tasks.
// It's recommended to manage this via environment variables or a config file.
/**
 * The name of the Google Cloud Pub/Sub topic used for dispatching tool synchronization tasks.
 * This allows the API to respond quickly while a background process handles fetching and updating tool data.
 * @type {string}
 */
const toolsSyncTopicName =
  config.gcp?.pubsub?.topics?.toolsSync || 'composio-tools-sync';

/**
 * Service for managing Composio apps and tools for workflow automation.
 * Provides functionalities to retrieve user's connected apps, available tools,
 * check connection statuses, and initiate new app connections. This service acts as a bridge
 * between the application's backend and the Composio platform, handling data retrieval,
 * caching strategies, and background processing triggers.
 * @class ComposioIntegrationService
 */
class ComposioIntegrationService {
  /**
   * Retrieves a list of all available Composio apps, indicating which ones the user is connected to.
   * It fetches all globally available authentication configurations and cross-references them with the
   * user-specific connections stored in the local database to determine the connection status for each app.
   *
   * @memberof ComposioIntegrationService
   * @param {string} userId - The unique identifier of the user. This is a multi-tenant context parameter.
   * @returns {Promise<GetUserAvailableAppsResult>} An object containing the success status,
   *   a list of all available apps with their connection status,
   *   apps the user is connected to, and apps available for connection.
   */
  async getUserAvailableApps(userId) {
    try {
      logger.info(`Getting available apps for user ${userId}`);

      // Get all auth configs (available apps)
      // Optimization: Using .lean() for read-only queries returns plain JavaScript objects,
      // which improves performance by skipping Mongoose document instantiation overhead.
      // Indexing Recommendation: Consider an index on `AuthConfig.app` if queries often filter or sort by app name.
      const authConfigs = await AuthConfig.find({}).lean();

      // Get user's connected accounts
      // Optimization: Using .lean() for read-only queries.
      // Indexing Recommendation: Add an index on `ComposioAuth.userId` for efficient lookups.
      const userConnections = await ComposioAuth.find({
        userId: userId,
      }).lean();

      // Map connected accounts by app for efficient O(1) average time lookup.
      const connectedAppsMap = new Map();
      userConnections.forEach((connection) => {
        if (connection.authConfigId) {
          connectedAppsMap.set(connection.authConfigId, {
            connectedAccountId: connection.connectedAccountId,
            status: connection.status,
            authConfigId: connection.authConfigId,
            integrationId: connection.integrationId,
          });
        }
      });

      // Build available apps list
      const availableApps = authConfigs.map((config) => {
        const connection = connectedAppsMap.get(config.authConfigId);
        return {
          app: config.app,
          authConfigId: config.authConfigId,
          isConnected: !!connection && connection.status === 'active',
          connectionStatus: connection?.status || 'not_connected',
          connectedAccountId: connection?.connectedAccountId,
          integrationId: connection?.integrationId,
        };
      });

      return {
        success: true,
        apps: availableApps,
        connectedApps: availableApps.filter((app) => app.isConnected),
        availableForConnection: availableApps.filter((app) => !app.isConnected),
      };
    } catch (error) {
      logger.error('Error getting user available apps:', error);
      return {
        success: false,
        error: error.message,
        apps: [],
        connectedApps: [],
        availableForConnection: [],
      };
    }
  }

  /**
   * Retrieves available tools for the user's connected apps from the local database.
   * This function provides a fast response using cached/previously synced data and triggers
   * an asynchronous background job via Pub/Sub to refresh the tool data from the Composio platform.
   * This ensures a responsive user experience while keeping the tool data eventually consistent.
   *
   * @memberof ComposioIntegrationService
   * @param {string} userId - The unique identifier of the user. This is a multi-tenant context parameter.
   * @param {string[]} [appNames=null] - An optional array of app names (case-insensitive) to filter the tools by. If null, tools for all connected apps are returned.
   * @returns {Promise<GetUserAvailableToolsResult>} An object containing the success status,
   *   tools grouped by app from the local cache, a list of connected app names for which tools were fetched,
   *   generic local tools, and the total count of tools.
   */
  async getUserAvailableTools(userId, appNames = null) {
    try {
      logger.info(`Getting available tools for user ${userId} from local cache`, {
        appNames,
      });

      const userApps = await this.getUserAvailableApps(userId);
      if (!userApps.success) {
        throw new Error(userApps.error);
      }

      let connectedApps = userApps.connectedApps;
      if (appNames && appNames.length > 0) {
        const lowerCaseAppNames = new Set(
          appNames.map((name) => name.toLowerCase())
        );
        connectedApps = connectedApps.filter((app) =>
          lowerCaseAppNames.has(app.app.toLowerCase())
        );
      }

      const connectedAppNames = connectedApps.map((app) => app.app);

      // GCP: Asynchronously trigger a background job to refresh the tools from Composio.
      // This is a non-blocking, fire-and-forget operation. The user gets an immediate
      // response based on the currently stored data, ensuring the API remains fast.
      this._triggerToolsSync(userId, connectedAppNames).catch((err) => {
        // The trigger function already logs errors; this prevents unhandled promise rejections.
        logger.warn(
          'Background tool sync trigger failed, but request will proceed with cached data.',
          err.message
        );
      });

      // --- DATA RETRIEVAL FROM LOCAL DB ---
      // Fetch tools that have been previously synced and stored for this user.
      // NOTE: This assumes the 'Tool' schema has been extended with `userId` and `source` fields
      // to differentiate user-specific, synced tools from generic local tools.
      const userToolsQuery = {
        userId: userId,
        appName: { $in: connectedAppNames },
        source: 'composio', // Assumed field to mark tools synced from Composio
      };
      const syncedTools = await Tool.find(userToolsQuery).lean();

      const toolsByApp = {};
      syncedTools.forEach((tool) => {
        if (!toolsByApp[tool.appName]) {
          toolsByApp[tool.appName] = [];
        }
        toolsByApp[tool.appName].push({
          name: tool.name,
          description: tool.description,
          app: tool.appName,
          parameters: tool.parameters || {}, // Assumes 'parameters' field exists on the model
          slug: tool.slug || tool.name,
        });
      });

      // Also get generic tools from our local database (not user-specific).
      const localToolsQuery = {
        source: { $ne: 'composio' }, // Or however generic tools are identified, e.g., `userId: null`
      };
      if (appNames && appNames.length > 0) {
        localToolsQuery.appName = { $in: appNames };
      }
      const localTools = await Tool.find(localToolsQuery).limit(100).lean();

      return {
        success: true,
        toolsByApp,
        connectedApps: connectedAppNames,
        localTools: localTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          slug: tool.slug,
        })),
        totalTools: Object.values(toolsByApp).flat().length + localTools.length,
      };
    } catch (error) {
      logger.error('Error getting user available tools:', error);
      return {
        success: false,
        error: error.message,
        toolsByApp: {},
        connectedApps: [],
        localTools: [],
        totalTools: 0,
      };
    }
  }

  /**
   * Handles the background processing for a tool sync message received from a Pub/Sub subscription.
   * This function is designed to be executed by a background worker (e.g., a Cloud Function or a dedicated service).
   * It fetches the latest tool definitions from the Composio API for the specified user and apps,
   * and then performs a bulk upsert operation to update the local database, ensuring the local cache is up-to-date.
   *
   * @memberof ComposioIntegrationService
   * @param {object} message - The message payload from the Pub/Sub topic.
   * @param {string} message.userId - The user ID for whom to sync tools.
   * @param {string[]} message.appNames - The list of app names to sync.
   * @returns {Promise<void>} A promise that resolves when the synchronization process is complete or rejects on error.
   */
  async handleToolsSyncEvent({ userId, appNames }) {
    logger.info(`Handling tools sync event for user ${userId}`, { appNames });
    if (!userId || !appNames || appNames.length === 0) {
      logger.warn('Invalid tools sync message received. Aborting.');
      return;
    }

    try {
      // Use Promise.all to fetch tools for all apps concurrently.
      const toolPromises = appNames.map(async (appName) => {
        try {
          const tools = await composio.getTools({ apps: [appName] }, userId);
          return {
            appName,
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters || {},
              slug: tool.slug || tool.name,
            })),
          };
        } catch (toolError) {
          logger.error(
            `Error getting tools from Composio for app ${appName} during background sync:`,
            toolError
          );
          return { appName, tools: [] }; // Continue even if one app fails
        }
      });

      const results = await Promise.all(toolPromises);

      // Use bulk operations for efficient database updates.
      const bulkOps = [];
      for (const result of results) {
        if (result.tools.length > 0) {
          for (const tool of result.tools) {
            // `updateOne` with `upsert: true` will insert a new tool if it doesn't exist
            // or update it if it does. The filter should uniquely identify a tool for a user.
            // NOTE: This assumes the 'Tool' schema is extended with `userId`, `source`, and `parameters`.
            const filter = {
              userId: userId,
              appName: result.appName,
              slug: tool.slug,
              source: 'composio',
            };
            const update = {
              $set: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
                lastSyncedAt: new Date(), // Recommended: track sync time
              },
            };
            bulkOps.push({ updateOne: { filter, update, upsert: true } });
          }
        }
      }

      if (bulkOps.length > 0) {
        logger.info(
          `Performing ${bulkOps.length} bulk operations to update tools for user ${userId}.`
        );
        await Tool.bulkWrite(bulkOps);
        logger.info(`Successfully synced and updated tools for user ${userId}.`);
      } else {
        logger.info(`No new tools found to sync for user ${userId}.`);
      }
    } catch (error) {
      logger.error(
        `Unhandled error during handleToolsSyncEvent for user ${userId}:`,
        error
      );
      // Depending on the subscriber setup, re-throwing the error can signal
      // a processing failure to Pub/Sub and trigger a retry.
      throw error;
    }
  }

  /**
   * Checks the connection status for a list of specified applications for a given user.
   * It determines if the user has an active connection to each required app.
   * Includes special handling for internal or platform-level "apps" (e.g., 'chat', 'research')
   * that are always considered connected and do not require external authentication.
   *
   * @memberof ComposioIntegrationService
   * @param {string} userId - The unique identifier of the user. This is a multi-tenant context parameter.
   * @param {string[]} requiredApps - An array of app names (case-insensitive) to check for connection status.
   * @returns {Promise<CheckAppConnectionsResult>} An object indicating the overall connection status (`allConnected`),
   *   a detailed status for each app, a list of missing connections, and a list of connected apps.
   */
  async checkAppConnections(userId, requiredApps) {
    try {
      const userApps = await this.getUserAvailableApps(userId);

      if (!userApps.success) {
        throw new Error(userApps.error);
      }

      const connectedAppNames = new Set(
        userApps.connectedApps.map((app) => app.app.toLowerCase())
      );

      // Optimization: Convert userApps.apps to a Map for O(1) average lookup time,
      // which is more efficient than `array.find()` inside a loop.
      const userAppsMap = new Map(
        userApps.apps.map((app) => [app.app.toLowerCase(), app])
      );

      const connectionStatus = requiredApps.map((appName) => {
        const normalizedAppName = appName.toLowerCase();
        const platformApps = [
          'chat',
          'research',
          'agents',
          'data',
          'apps',
          'google_cloud',
          'google_workspace',
        ];
        if (platformApps.includes(normalizedAppName)) {
          return {
            app: appName,
            isConnected: true,
            status: 'active',
            authConfigId: normalizedAppName,
            connectedAccountId: normalizedAppName,
          };
        }

        const isConnected = connectedAppNames.has(normalizedAppName);
        // Optimization: Use map lookup instead of array.find for better performance
        const appInfo = userAppsMap.get(normalizedAppName);

        return {
          app: appName,
          isConnected,
          status: appInfo?.connectionStatus || 'not_connected',
          authConfigId: appInfo?.authConfigId,
          connectedAccountId: appInfo?.connectedAccountId,
        };
      });

      const missingConnections = connectionStatus.filter(
        (app) => !app.isConnected
      );

      return {
        success: true,
        allConnected: missingConnections.length === 0,
        connectionStatus,
        missingConnections: missingConnections.map((app) => app.app),
        connectedApps: connectionStatus
          .filter((app) => app.isConnected)
          .map((app) => app.app),
      };
    } catch (error) {
      logger.error('Error checking app connections:', error);
      return {
        success: false,
        error: error.message,
        allConnected: false,
        connectionStatus: [],
        missingConnections: requiredApps,
        connectedApps: [],
      };
    }
  }

  /**
   * Retrieves a comprehensive list of all applications available for detection.
   * This list is aggregated from three sources:
   * 1. Apps defined in `AuthConfig` (configurable integrations).
   * 2. Apps associated with locally defined `Tool`s.
   * 3. A predefined list of internal platform "apps".
   * The resulting list is deduplicated and is typically used for validating app names detected in user prompts.
   * This operation is not user-specific.
   *
   * @memberof ComposioIntegrationService
   * @returns {Promise<GetAvailableAppsForDetectionResult>} An object containing the success status,
   *   a combined list of all available apps, and the lists from the individual sources.
   */
  async getAvailableAppsForDetection() {
    try {
      // Optimization: Using .lean() for read-only queries.
      // Indexing Recommendation: Consider an index on `AuthConfig.app` for potential filtering/sorting.
      const authConfigs = await AuthConfig.find({}).lean();
      // Indexing Recommendation: Add an index on `Tool.appName` for efficient `distinct` queries.
      const toolApps = await Tool.find({}).distinct('appName');

      // Get app names from auth configs
      const authConfigApps = authConfigs.map((config) =>
        config.app.toLowerCase()
      );

      const platformApps = [
        'chat',
        'research',
        'agents',
        'data',
        'apps',
        'google_cloud',
        'google_workspace',
      ];

      // Combine and deduplicate using a Set for efficiency.
      const allAvailableApps = [
        ...new Set([...authConfigApps, ...toolApps, ...platformApps]),
      ];

      return {
        success: true,
        availableApps: allAvailableApps,
        authConfigApps: authConfigApps,
        toolApps: toolApps,
      };
    } catch (error) {
      logger.error('Error getting available apps for detection:', error);
      return {
        success: false,
        error: error.message,
        availableApps: [],
        authConfigApps: [],
        toolApps: [],
      };
    }
  }

  /**
   * Validates a list of detected app names against the globally available apps list.
   * If a `userId` is provided, it also checks the user's connection status for the apps that are deemed valid.
   * This is useful for determining which detected tools a user can actually execute.
   *
   * @memberof ComposioIntegrationService
   * @param {string[]} detectedApps - An array of app names (case-insensitive) that have been detected.
   * @param {string} [userId=null] - The unique identifier of the user. If provided, connection status for valid apps will be checked.
   * @returns {Promise<ValidateDetectedAppsResult>} An object containing the success status,
   *   lists of valid and invalid detected apps, the full list of all available apps for reference,
   *   and (if `userId` was provided) the connection status for the valid apps.
   */
  async validateDetectedApps(detectedApps, userId = null) {
    try {
      const availableAppsResult = await this.getAvailableAppsForDetection();

      if (!availableAppsResult.success) {
        throw new Error(availableAppsResult.error);
      }

      // Optimization: Convert availableApps to a Set for O(1) average lookup time
      // when checking for existence, which is more efficient than `array.includes()`.
      const availableAppsSet = new Set(availableAppsResult.availableApps);

      // Partition detected apps into valid and invalid lists
      const validApps = [];
      const invalidApps = [];
      for (const app of detectedApps) {
        if (availableAppsSet.has(app.toLowerCase())) {
          validApps.push(app);
        } else {
          invalidApps.push(app);
        }
      }

      let connectionStatus = null;
      if (userId && validApps.length > 0) {
        const connectionCheck = await this.checkAppConnections(
          userId,
          validApps
        );
        connectionStatus = connectionCheck.success ? connectionCheck : null;
      }

      return {
        success: true,
        validApps,
        invalidApps,
        availableApps: availableAppsResult.availableApps, // Return original array for consistency
        connectionStatus,
      };
    } catch (error) {
      logger.error('Error validating detected apps:', error);
      return {
        success: false,
        error: error.message,
        validApps: [],
        invalidApps: detectedApps,
        availableApps: [],
        connectionStatus: null,
      };
    }
  }

  /**
   * Generates a connection URL for a specified application, allowing a user to connect their account.
   * It first checks if the user already has an active connection to the app. If so, it returns the existing
   * connection details. If not, it initiates a new connection flow via the Composio SDK, saves a 'PENDING'
   * connection record in the local database, and returns the redirect URL for the user to complete the authentication.
   *
   * @memberof ComposioIntegrationService
   * @param {string} userId - The unique identifier of the user initiating the connection. This is a multi-tenant context parameter.
   * @param {string} appName - The name of the app (case-insensitive) for which to get the connection URL.
   * @returns {Promise<GetConnectionUrlResult>} An object containing the success status,
   *   a flag indicating if already connected, the connection URL (if a new connection is initiated),
   *   or details of the existing connection.
   */
  async getConnectionUrl(userId, appName) {
    try {
      // Optimization: Using .lean() for read-only queries.
      // Indexing Recommendation: Add an index on `AuthConfig.app`.
      // Performance Note: Case-insensitive regex queries can be slow and may not fully utilize an index.
      // For better performance, consider using a case-insensitive collation on the index or storing a
      // normalized (e.g., lowercase) version of the `app` field to query against with an exact match.
      const authConfig = await AuthConfig.findOne({
        app: { $regex: new RegExp(`^${appName}`, 'i') }, // Anchored regex is more performant
      }).lean();

      if (!authConfig) {
        throw new Error(`App ${appName} is not available for connection`);
      }

      // Check if already connected
      // Optimization: Using .lean() for read-only queries.
      // Indexing Recommendation: Add a compound index on `ComposioAuth.{userId, authConfigId, status}`
      // for highly efficient lookup of existing, active connections.
      const existingConnection = await ComposioAuth.findOne({
        userId: userId,
        authConfigId: authConfig.authConfigId,
        status: 'active',
      }).lean();

      if (existingConnection) {
        return {
          success: true,
          alreadyConnected: true,
          message: `Already connected to ${appName}`,
          connection: existingConnection,
        };
      }

      // Initiate new connection
      /** @type {ComposioConnectionUrlResponse} */
      const connectionUrl = await composio.connectedAccounts.initiate(
        userId,
        authConfig.authConfigId
      );

      // Save connection record
      const composioAuth = new ComposioAuth({
        userId: userId,
        authConfigId: authConfig.authConfigId,
        connectedAccountId: connectionUrl.id,
        status: 'PENDING',
        integrationId: connectionUrl.integrationId,
        redirectUrl: connectionUrl.redirectUrl,
        toolkit: { slug: appName },
      });

      await composioAuth.save();

      return {
        success: true,
        alreadyConnected: false,
        connectionUrl: connectionUrl.redirectUrl,
        connectedAccountId: connectionUrl.id,
        authConfig: authConfig,
      };
    } catch (error) {
      logger.error(`Error getting connection URL for ${appName}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Triggers a background job to sync tools from Composio for a user's connected apps.
   * This is a fire-and-forget operation that publishes a message to a Google Cloud Pub/Sub topic.
   * A separate background worker will consume this message to perform the actual data synchronization,
   * preventing the main API request from being blocked by a potentially long-running process.
   *
   * @memberof ComposioIntegrationService
   * @param {string} userId - The unique identifier of the user.
   * @param {string[]} appNames - An array of app names to sync tools for.
   * @returns {Promise<void>} A promise that resolves once the message is published, or rejects on a publishing error.
   * @private
   */
  async _triggerToolsSync(userId, appNames) {
    if (!userId || !appNames || appNames.length === 0) {
      logger.info(
        'Skipping tools sync trigger due to missing userId or appNames.'
      );
      return;
    }

    try {
      const message = {
        userId,
        appNames,
        timestamp: new Date().toISOString(),
      };
      const dataBuffer = Buffer.from(JSON.stringify(message));

      const messageId = await pubSubClient
        .topic(toolsSyncTopicName)
        .publishMessage({ data: dataBuffer });
      logger.info(
        `Tools sync message ${messageId} published for user ${userId} for apps: ${appNames.join(
          ', '
        )}.`
      );
    } catch (error) {
      // Log the error but don't throw, to avoid failing the primary user request.
      // The main `getUserAvailableTools` function should still return cached data.
      logger.error(
        `Failed to publish tools sync message for user ${userId}:`,
        error
      );
    }
  }
}

/**
 * A singleton instance of the ComposioIntegrationService.
 * This instance is exported for use throughout the application, ensuring that
 * only one instance of the service is created and used.
 * @type {ComposioIntegrationService}
 * @exports composioIntegrationService
 */
export const composioIntegrationService = new ComposioIntegrationService();