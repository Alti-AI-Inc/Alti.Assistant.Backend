import { Composio } from '@composio/core';
import config from '../../../../../config/index.js';
import ComposioAuth from '../../composio_v2/composio.model.js';
import AuthConfig from '../../composio_v2/authConfig.model.js';
import Tool from '../../composio_v2/tools.model.js';
import { logger } from '../../../../shared/logger.js';

const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

/**
 * Service for managing Composio apps and tools for workflow automation
 */
class ComposioIntegrationService {
  /**
   * Get user's connected and available apps
   */
  async getUserAvailableApps(userId) {
    try {
      logger.info(`Getting available apps for user ${userId}`);

      // Get all auth configs (available apps)
      const authConfigs = await AuthConfig.find({});

      // Get user's connected accounts
      const userConnections = await ComposioAuth.find({
        userId: userId,
      });

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
   * Get available tools for connected apps
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

      for (const app of connectedApps) {
        try {
          // Get tools from Composio for this app
          const tools = await composio.getTools(
            {
              apps: [app.app],
            },
            userId
          );

          toolsByApp[app.app] = tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            app: app.app,
            parameters: tool.parameters || {},
            slug: tool.slug || tool.name,
          }));
        } catch (toolError) {
          logger.warn(`Error getting tools for app ${app.app}:`, toolError);
          toolsByApp[app.app] = [];
        }
      }

      // Also get tools from our local database, scoped to requested apps if provided
      const localToolsQuery = appNames && appNames.length > 0
        ? { appName: { $in: appNames } }
        : {};
      const localTools = await Tool.find(localToolsQuery).limit(100); // Limit to prevent massive payload

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
   * Check if user has specific apps connected
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
        const appInfo = userApps.apps.find(
          (app) => app.app.toLowerCase() === normalizedAppName
        );

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
   * Get available apps list (for app detection in LangGraph)
   */
  async getAvailableAppsForDetection() {
    try {
      const authConfigs = await AuthConfig.find({});
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
   * Validate and filter detected apps against available apps
   */
  async validateDetectedApps(detectedApps, userId = null) {
    try {
      const availableAppsResult = await this.getAvailableAppsForDetection();

      if (!availableAppsResult.success) {
        throw new Error(availableAppsResult.error);
      }

      const { availableApps } = availableAppsResult;

      // Filter detected apps to only include available ones
      const validApps = detectedApps.filter((app) =>
        availableApps.includes(app.toLowerCase())
      );

      const invalidApps = detectedApps.filter(
        (app) => !availableApps.includes(app.toLowerCase())
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
        availableApps,
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
   * Get connection URL for an app
   */
  async getConnectionUrl(userId, appName) {
    try {
      const authConfig = await AuthConfig.findOne({
        app: { $regex: new RegExp(appName, 'i') },
      });

      if (!authConfig) {
        throw new Error(`App ${appName} is not available for connection`);
      }

      // Check if already connected
      const existingConnection = await ComposioAuth.findOne({
        userId: userId,
        authConfigId: authConfig.authConfigId,
        status: 'active',
      });

      if (existingConnection) {
        return {
          success: true,
          alreadyConnected: true,
          message: `Already connected to ${appName}`,
          connection: existingConnection,
        };
      }

      // Initiate new connection
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

export const composioIntegrationService = new ComposioIntegrationService();
