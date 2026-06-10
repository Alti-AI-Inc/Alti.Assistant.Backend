/**
 * @typedef {Object} AppConnectionInfo
 * @property {string} app - The name of the application.
 * @property {string} authConfigId - The unique ID of the authentication configuration for the app.
 * @property {boolean} isConnected - True if the user has an active connection to this app, false otherwise.
 * @property {'active'|'pending'|'not_connected'|string} connectionStatus - The status of the user's connection to the app.
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
 * @property {'active'|'pending'|'not_connected'|string} status - The status of the user's connection to the app.
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
import ComposioAuth from '../../composio_v2/composio.model.js';
import AuthConfig from '../../composio_v2/authConfig.model.js';
import Tool from '../../composio_v2/tools.model.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Initializes the Composio SDK with the organization's API key.
 * @type {Composio}
 */
const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

/**
 * Service for managing Composio apps and tools for workflow automation.
 * Provides functionalities to retrieve user's connected apps, available tools,
 * check connection statuses, and initiate new app connections.
 */
class ComposioIntegrationService {
  /**
   * Retrieves a list of all available Composio apps, indicating which ones the user is connected to.
   * It fetches authentication configurations and user-specific connections to determine the status.
   *
   * @memberof ComposioIntegrationService
   * @param {string} userId - The unique identifier of the user.
   * @returns {Promise<GetUserAvailableAppsResult>} An object containing the success status,
   *   a list of all available apps with their connection status,
   *   apps the user is connected to, and apps available for connection.
   */
  async getUserAvailableApps(userId) {
    try {
      logger.info(`Getting available apps for user ${userId}`);

      // Get all auth configs (available apps)
      // Optimization: Add .lean() for read-only queries to return plain JavaScript objects,
      // which can improve performance by skipping Mongoose document instantiation overhead.
      // Indexing Recommendation: Consider an index on `AuthConfig.app` if queries often filter or sort by app name.
      const authConfigs = await AuthConfig.find({}).lean();

      // Get user's connected accounts
      // Optimization: Add .lean() for read-only queries.
      // Indexing Recommendation: Add an index on `ComposioAuth.userId` for efficient lookups.
      const userConnections = await ComposioAuth.find({
        userId: userId,
      }).lean();

      // Map connected accounts by app
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
   * Retrieves available tools for the user's connected apps, optionally filtered by specific app names.
   * It fetches tools from both the Composio platform and a local database.
   *
   * @memberof ComposioIntegrationService
   * @param {string} userId - The unique identifier of the user.
   * @param {string[]} [appNames=null] - An optional array of app names (case-insensitive) to filter the tools by.
   * @returns {Promise<GetUserAvailableToolsResult>} An object containing the success status,
   *   tools grouped by app, a list of connected app names, local tools, and the total count of tools.
   */
  async getUserAvailableTools(userId, appNames = null) {
    try {
      logger.info(`Getting available tools for user ${userId}`, { appNames });

      const userApps = await this.getUserAvailableApps(userId);

      if (!userApps.success) {
        throw new Error(userApps.error);
      }

      // Filter to connected apps only
      let connectedApps = userApps.connectedApps;

      // Filter by specific app names if provided
      if (appNames && appNames.length > 0) {
        connectedApps = connectedApps.filter((app) =>
          appNames.includes(app.app.toLowerCase())
        );
      }

      // Get tools for connected apps from Composio
      const toolsByApp = {};

      // Optimization: Use Promise.all to run external API calls concurrently
      // instead of sequentially in a loop, improving overall response time.
      // If composio.getTools supports fetching tools for multiple apps in a single call,
      // a single batch call would be even more efficient.
      const toolPromises = connectedApps.map(async (app) => {
        try {
          const tools = await composio.getTools(
            {
              apps: [app.app], // Assuming this can take an array of app names for batching, but currently used for single app
            },
            userId
          );

          return {
            app: app.app,
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              app: app.app,
              parameters: tool.parameters || {},
              slug: tool.slug || tool.name,
            })),
          };
        } catch (toolError) {
          logger.warn(`Error getting tools for app ${app.app}:`, toolError);
          return { app: app.app, tools: [] };
        }
      });

      const results = await Promise.all(toolPromises);
      results.forEach((result) => {
        toolsByApp[result.app] = result.tools;
      });

      // Also get tools from our local database, scoped to requested apps if provided
      const localToolsQuery = appNames && appNames.length > 0
        ? { appName: { $in: appNames } }
        : {};
      // Optimization: Add .lean() for read-only queries.
      // Indexing Recommendation: Add an index on `Tool.appName` for efficient filtering, especially with `$in` queries.
      const localTools = await Tool.find(localToolsQuery).limit(100).lean();

      return {
        success: true,
        toolsByApp,
        connectedApps: connectedApps.map((app) => app.app),
        localTools: localTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          slug: tool.slug,
        })),
        totalTools: Object.values(toolsByApp).flat().length,
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
   * Checks the connection status for a list of specified applications for a given user.
   * Includes special handling for platform-level "apps" that are always considered connected.
   *
   * @memberof ComposioIntegrationService
   * @param {string} userId - The unique identifier of the user.
   * @param {string[]} requiredApps - An array of app names (case-insensitive) to check for connection status.
   * @returns {Promise<CheckAppConnectionsResult>} An object indicating overall connection status,
   *   individual app statuses, a list of missing connections, and a list of connected apps.
   */
  async checkAppConnections(userId, requiredApps) {
    try {
      const userApps = await this.getUserAvailableApps(userId);

      if (!userApps.success) {
        throw new Error(userApps.error);
      }

      const connectedAppNames = userApps.connectedApps.map((app) =>
        app.app.toLowerCase()
      );

      // Optimization: Convert userApps.apps to a Map for O(1) average lookup
      // when checking `appInfo`, which is more efficient for larger arrays than `array.find()`.
      const userAppsMap = new Map(userApps.apps.map(app => [app.app.toLowerCase(), app]));

      const connectionStatus = requiredApps.map((appName) => {
        const normalizedAppName = appName.toLowerCase();
        const platformApps = ['chat', 'research', 'agents', 'data', 'apps', 'google_cloud', 'google_workspace'];
        if (platformApps.includes(normalizedAppName)) {
          return {
            app: appName,
            isConnected: true,
            status: 'active',
            authConfigId: normalizedAppName,
            connectedAccountId: normalizedAppName,
          };
        }

        const isConnected = connectedAppNames.includes(normalizedAppName);
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
   * Retrieves a comprehensive list of all applications available for detection,
   * combining apps from authentication configurations, local tool definitions, and predefined platform apps.
   * This list is typically used for validating detected app names in contexts like LangGraph.
   *
   * @memberof ComposioIntegrationService
   * @returns {Promise<GetAvailableAppsForDetectionResult>} An object containing the success status,
   *   a combined list of all available apps, apps from auth configs, and apps from local tools.
   */
  async getAvailableAppsForDetection() {
    try {
      // Optimization: Add .lean() for read-only queries.
      // Indexing Recommendation: Consider an index on `AuthConfig.app` if queries often filter or sort by app name.
      const authConfigs = await AuthConfig.find({}).lean();
      // Indexing Recommendation: Add an index on `Tool.appName` for efficient distinct queries.
      const toolApps = await Tool.find({}).distinct('appName');

      // Get app names from auth configs
      const availableApps = authConfigs.map((config) =>
        config.app.toLowerCase()
      );

      const platformApps = ['chat', 'research', 'agents', 'data', 'apps', 'google_cloud', 'google_workspace'];

      // Combine and deduplicate
      const allAvailableApps = [...new Set([...availableApps, ...toolApps, ...platformApps])];

      return {
        success: true,
        availableApps: allAvailableApps,
        authConfigApps: availableApps,
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
   * Validates a list of detected app names against the globally available apps.
   * Optionally checks the connection status for valid apps for a specific user.
   *
   * @memberof ComposioIntegrationService
   * @param {string[]} detectedApps - An array of app names (case-insensitive) that have been detected.
   * @param {string} [userId=null] - The unique identifier of the user. If provided, connection status for valid apps will be checked.
   * @returns {Promise<ValidateDetectedAppsResult>} An object containing the success status,
   *   lists of valid and invalid detected apps, all available apps, and optionally the connection status.
   */
  async validateDetectedApps(detectedApps, userId = null) {
    try {
      const availableAppsResult = await this.getAvailableAppsForDetection();

      if (!availableAppsResult.success) {
        throw new Error(availableAppsResult.error);
      }

      // Optimization: Convert availableApps to a Set for O(1) average lookup time
      // when checking `includes`, which is more efficient for larger arrays.
      const availableAppsSet = new Set(availableAppsResult.availableApps);

      // Filter detected apps to only include available ones
      const validApps = detectedApps.filter((app) =>
        availableAppsSet.has(app.toLowerCase())
      );

      const invalidApps = detectedApps.filter(
        (app) => !availableAppsSet.has(app.toLowerCase())
      );

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
   * It first checks if the app is already connected for the user. If not, it initiates a new connection
   * via Composio and saves a pending connection record.
   *
   * @memberof ComposioIntegrationService
   * @param {string} userId - The unique identifier of the user initiating the connection.
   * @param {string} appName - The name of the app (case-insensitive) for which to get the connection URL.
   * @returns {Promise<GetConnectionUrlResult>} An object containing the success status,
   *   a flag indicating if already connected, the connection URL (if a new connection is initiated),
   *   or details of the existing connection.
   */
  async getConnectionUrl(userId, appName) {
    try {
      // Optimization: Add .lean() for read-only queries.
      // Indexing Recommendation: Add an index on `AuthConfig.app` for efficient lookups.
      // Note: Regex queries, especially with leading wildcards, can be slow even with indexes.
      // Consider storing a lowercase version of `app` or using a collation for case-insensitive exact matches.
      const authConfig = await AuthConfig.findOne({
        app: { $regex: new RegExp(appName, 'i') },
      }).lean();

      if (!authConfig) {
        throw new Error(`App ${appName} is not available for connection`);
      }

      // Check if already connected
      // Optimization: Add .lean() for read-only queries.
      // Indexing Recommendation: Add a compound index on `ComposioAuth.{userId, authConfigId, status}`
      // for efficient lookup of existing connections.
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
}

/**
 * Singleton instance of the ComposioIntegrationService.
 * @type {ComposioIntegrationService}
 * @exports composioIntegrationService
 */
export const composioIntegrationService = new ComposioIntegrationService();