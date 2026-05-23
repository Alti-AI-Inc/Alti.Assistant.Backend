import { Composio } from '@composio/core';
import config from '../../../../../config/index.js';
import ComposioAuth from '../../composio_v2/composio.model.js';
import AuthConfig from '../../composio_v2/authConfig.model.js';
import { logger } from '../../../../shared/logger.js';

const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

// Connection health thresholds
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days without refresh
const TOKEN_EXPIRY_BUFFER_MS = 60 * 60 * 1000; // 1 hour buffer before expiry

/**
 * ConnectionHealthService
 * 
 * Proactive health monitor for Composio OAuth connections.
 * Validates token freshness, API reachability, and connection status
 * for all of a user's connected app accounts.
 */
class ConnectionHealthService {
  /**
   * Check the health of all connected accounts for a user.
   * 
   * @param {string} userId - The user ID to check
   * @returns {Object} Health summary categorized by status
   */
  async checkConnectionHealth(userId) {
    try {
      logger.info(`ConnectionHealth: checking health for user ${userId}`);

      // Get all user connections
      const connections = await ComposioAuth.find({ userId });

      if (!connections || connections.length === 0) {
        return {
          success: true,
          userId,
          totalConnections: 0,
          healthy: [],
          stale: [],
          expired: [],
          errors: [],
          summary: 'No connections found for this user.',
          checkedAt: new Date().toISOString(),
        };
      }

      const healthy = [];
      const stale = [];
      const expired = [];
      const errors = [];

      for (const connection of connections) {
        const healthCheck = await this._checkSingleConnection(connection);

        switch (healthCheck.status) {
          case 'healthy':
            healthy.push(healthCheck);
            break;
          case 'stale':
            stale.push(healthCheck);
            break;
          case 'expired':
            expired.push(healthCheck);
            break;
          case 'error':
            errors.push(healthCheck);
            break;
          default:
            errors.push(healthCheck);
        }
      }

      const summary = this._buildSummary(healthy, stale, expired, errors);

      return {
        success: true,
        userId,
        totalConnections: connections.length,
        healthy,
        stale,
        expired,
        errors,
        summary,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('ConnectionHealth: error checking health:', error);
      return {
        success: false,
        userId,
        error: error.message,
        totalConnections: 0,
        healthy: [],
        stale: [],
        expired: [],
        errors: [{ error: error.message }],
        summary: `Health check failed: ${error.message}`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Check the health of a single connection.
   * @private
   */
  async _checkSingleConnection(connection) {
    const result = {
      connectedAccountId: connection.connectedAccountId,
      authConfigId: connection.authConfigId,
      status: 'unknown',
      app: connection.toolkit?.slug || 'unknown',
      localStatus: connection.status,
      lastUpdated: connection.updatedAt || connection.createdAt,
      details: {},
    };

    try {
      // Resolve app name from AuthConfig if not in toolkit
      if (result.app === 'unknown') {
        const authConfig = await AuthConfig.findOne({
          authConfigId: connection.authConfigId,
        });
        if (authConfig) {
          result.app = authConfig.app;
        }
      }

      // Check local status first — skip API call for obviously dead connections
      if (connection.status === 'failed' || connection.status === 'revoked') {
        result.status = 'expired';
        result.details = {
          reason: `Local status is "${connection.status}"`,
          recommendation: 'Re-authenticate this app connection.',
        };
        return result;
      }

      if (connection.status === 'pending') {
        result.status = 'stale';
        result.details = {
          reason: 'Connection was initiated but never completed.',
          recommendation: 'Complete the OAuth flow or remove this pending connection.',
        };
        return result;
      }

      // Check staleness based on last update time
      const now = Date.now();
      const lastUpdate = new Date(connection.updatedAt || connection.createdAt).getTime();
      const age = now - lastUpdate;

      if (age > STALE_THRESHOLD_MS) {
        result.status = 'stale';
        result.details = {
          reason: `Connection has not been refreshed in ${Math.round(age / (24 * 60 * 60 * 1000))} days.`,
          ageMs: age,
          recommendation: 'Token may be expired. Consider re-authenticating.',
        };
        return result;
      }

      // Verify with Composio API
      try {
        const remoteAccount = await composio.connectedAccounts.get(
          connection.connectedAccountId
        );

        if (!remoteAccount) {
          result.status = 'expired';
          result.details = {
            reason: 'Connected account not found on Composio servers.',
            recommendation: 'Re-authenticate this app connection.',
          };
          return result;
        }

        const remoteStatus = remoteAccount.status || remoteAccount.data?.status;

        if (remoteStatus === 'ACTIVE' || remoteStatus === 'active') {
          result.status = 'healthy';
          result.details = {
            remoteStatus,
            verifiedAt: new Date().toISOString(),
            ageMs: age,
          };
        } else if (remoteStatus === 'EXPIRED' || remoteStatus === 'expired') {
          result.status = 'expired';
          result.details = {
            remoteStatus,
            reason: 'OAuth token has expired on Composio.',
            recommendation: 'Re-authenticate this app connection.',
          };
        } else {
          result.status = 'stale';
          result.details = {
            remoteStatus,
            reason: `Unexpected remote status: ${remoteStatus}`,
            recommendation: 'Verify connection and re-authenticate if needed.',
          };
        }
      } catch (apiError) {
        // API call failed — connection is still locally present but unverifiable
        result.status = 'stale';
        result.details = {
          reason: `Could not verify with Composio API: ${apiError.message}`,
          recommendation: 'API may be temporarily unavailable. Try again later.',
        };
      }

      return result;
    } catch (err) {
      result.status = 'error';
      result.details = {
        error: err.message,
        recommendation: 'Unexpected error during health check.',
      };
      return result;
    }
  }

  /**
   * Attempt to refresh a stale connection for a specific app.
   * 
   * @param {string} userId
   * @param {string} appName
   * @returns {Object} Refresh result with new connection URL if needed
   */
  async refreshStaleConnection(userId, appName) {
    try {
      logger.info(`ConnectionHealth: refreshing ${appName} for user ${userId}`);

      // Find the auth config for this app
      const authConfig = await AuthConfig.findOne({
        app: { $regex: new RegExp(appName, 'i') },
      });

      if (!authConfig) {
        return {
          success: false,
          error: `App "${appName}" not found in auth configurations.`,
        };
      }

      // Find existing connection
      const existingConnection = await ComposioAuth.findOne({
        userId,
        authConfigId: authConfig.authConfigId,
      });

      if (!existingConnection) {
        return {
          success: false,
          error: `No existing connection found for ${appName}.`,
        };
      }

      // Initiate re-authentication
      const connectionUrl = await composio.connectedAccounts.initiate(
        userId,
        authConfig.authConfigId
      );

      // Update the existing record with new pending connection
      await ComposioAuth.updateOne(
        { _id: existingConnection._id },
        {
          $set: {
            connectedAccountId: connectionUrl.id,
            integrationId: connectionUrl.integrationId,
            redirectUrl: connectionUrl.redirectUrl,
            status: 'pending',
            updatedAt: new Date(),
          },
        }
      );

      return {
        success: true,
        app: appName,
        message: `Re-authentication initiated for ${appName}. User must complete the OAuth flow.`,
        redirectUrl: connectionUrl.redirectUrl,
        newConnectedAccountId: connectionUrl.id,
      };
    } catch (error) {
      logger.error(`ConnectionHealth: refresh error for ${appName}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Build a human-readable summary of the health check.
   * @private
   */
  _buildSummary(healthy, stale, expired, errors) {
    const parts = [];

    if (healthy.length > 0) {
      parts.push(`${healthy.length} healthy (${healthy.map((h) => h.app).join(', ')})`);
    }
    if (stale.length > 0) {
      parts.push(`${stale.length} stale (${stale.map((s) => s.app).join(', ')})`);
    }
    if (expired.length > 0) {
      parts.push(`${expired.length} expired (${expired.map((e) => e.app).join(', ')})`);
    }
    if (errors.length > 0) {
      parts.push(`${errors.length} errors`);
    }

    if (parts.length === 0) return 'No connections found.';
    return parts.join(' | ');
  }
}

export const connectionHealthService = new ConnectionHealthService();
