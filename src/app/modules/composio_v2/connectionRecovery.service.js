import ComposioAuth from './composio.model.js';
import { actionAuditService } from './actionAudit.service.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { Composio } from '@composio/core';

/**
 * @constant {Composio} composio - An instance of the Composio SDK initialized with the organization's API key.
 * This instance is used to interact with the Composio platform, specifically for managing connected accounts.
 */
const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

/**
 * Attempts an asynchronous background recovery/refresh cycle for a specific OAuth connection.
 * This function fetches the local connection record, logs an audit event, and then attempts
 * to verify and potentially refresh the connection's status and tokens with the upstream
 * Composio API. It updates the local connection record based on the upstream status.
 *
 * @param {string} connectionId - The unique identifier (MongoDB ObjectId) of the local ComposioAuth connection record.
 * @param {string} userId - The unique identifier of the user who owns this connection.
 * @returns {Promise<{ success: boolean, message?: string, error?: string, connection?: object }>} A promise that resolves to an object indicating the success or failure of the recovery attempt.
 *   - `success`: `true` if the connection was successfully verified and recovered, `false` otherwise.
 *   - `message`: A success message if `success` is `true`.
 *   - `error`: An error message if `success` is `false`.
 *   - `connection`: The updated ComposioAuth connection object if recovery was successful.
 * @throws {Error} Throws an error if the local connection is not found, if there's no `connectedAccountId` for upstream verification,
 *   or if the upstream Composio API indicates a non-active status (e.g., 'REVOKED', 'FAILED') requiring re-authentication.
 */
const attemptAutoRecovery = async (connectionId, userId) => {
  const tStart = Date.now();
  logger.info(`ConnectionRecovery: starting auto-recovery cycle for connection ${connectionId}`);

  // Fetch connection details
  const connection = await ComposioAuth.findOne({ _id: connectionId, userId });
  if (!connection) {
    throw new Error(`ComposioAuth connection not found: ${connectionId}`);
  }

  // Pre-log recovery attempt
  let auditLogId = null;
  try {
    const log = await actionAuditService.logStart({
      userId,
      app: connection.toolkit?.slug || connection.authConfigId?.replace(/^ac_/, '') || 'unknown_app',
      action: 'connection_auto_recovery',
      params: { connectionId, authConfigId: connection.authConfigId },
      executionId: `rec_${Date.now()}`,
      stepIndex: 0,
    });
    auditLogId = log?._id;
  } catch (err) {
    // Non-fatal
  }

  try {
    // Verify connection status with the real Composio API
    let recoverySucceeded = false;

    if (connection.connectedAccountId) {
      logger.info(`ConnectionRecovery: verifying connection ${connection.connectedAccountId} with Composio API`);
      try {
        // Use Composio SDK to check the upstream connection status
        const upstreamConnection = await composio.connectedAccounts.get(connection.connectedAccountId);
        
        if (upstreamConnection && (upstreamConnection.status === 'ACTIVE' || upstreamConnection.status === 'active')) {
          // Connection is valid upstream — sync our local record
          connection.status = 'ACTIVE';
          if (upstreamConnection.data?.accessToken) {
            connection.accessToken = upstreamConnection.data.accessToken;
          }
          if (upstreamConnection.data?.refreshToken) {
            connection.refreshToken = upstreamConnection.data.refreshToken;
          }
          recoverySucceeded = true;
          logger.info(`ConnectionRecovery: upstream verification confirmed ACTIVE for ${connection.connectedAccountId}`);
        } else {
          logger.warn(`ConnectionRecovery: upstream status for ${connection.connectedAccountId} is ${upstreamConnection?.status || 'unknown'}`);
          // Connection is not active upstream — mark as failed
          connection.status = 'FAILED';
          await connection.save();
          throw new Error(`Upstream connection status is ${upstreamConnection?.status || 'unknown'}. Re-authentication required.`);
        }
      } catch (sdkError) {
        // If SDK call fails, the connection may have been revoked or is inaccessible
        logger.warn(`ConnectionRecovery: Composio SDK verification failed for ${connection.connectedAccountId}: ${sdkError.message}`);
        
        // Don't mark as failed if it's just a network error — keep current status
        if (sdkError.message?.includes('not found') || sdkError.message?.includes('revoked')) {
          connection.status = 'REVOKED';
          await connection.save();
        }
        throw sdkError;
      }
    } else {
      logger.warn(`ConnectionRecovery: no connectedAccountId for ${connectionId}, cannot verify upstream`);
      throw new Error('No connectedAccountId available for recovery verification.');
    }

    if (recoverySucceeded) {
      await connection.save();

      // Log success in audit trail
      if (auditLogId) {
        await actionAuditService.logComplete(auditLogId, {
          success: true,
          durationMs: Date.now() - tStart,
          result: {
            status: 'ACTIVE',
            message: 'Connection verified active with Composio API.',
            timestamp: new Date().toISOString(),
          },
        });
      }

      logger.info(`ConnectionRecovery: connection ${connectionId} successfully recovered (status: ACTIVE)`);
      return { success: true, message: 'OAuth connection verified and recovered.', connection };
    } else {
      throw new Error('Recovery verification did not confirm active status.');
    }
  } catch (recoveryErr) {
    logger.error(`ConnectionRecovery: recovery failed for connection ${connectionId}:`, recoveryErr.message);

    // Log failure in audit trail
    if (auditLogId) {
      await actionAuditService.logComplete(auditLogId, {
        success: false,
        durationMs: Date.now() - tStart,
        error: recoveryErr.message,
      });
    }

    return { success: false, error: recoveryErr.message };
  }
};

/**
 * Scans all connected accounts for a given user and triggers background recovery attempts
 * for connections that are in a 'EXPIRED', 'FAILED', or 'PENDING' status.
 * This function initiates `attemptAutoRecovery` for each problematic connection in a fire-and-forget manner.
 *
 * @param {string} userId - The unique identifier of the user whose connections are to be checked.
 * @returns {Promise<{ success: boolean, message: string, recoveredCount: number }>} A promise that resolves to an object indicating the outcome of the heartbeat scan.
 *   - `success`: `true` if the scan completed, `false` if an error occurred.
 *   - `message`: A descriptive message about the heartbeat's activity.
 *   - `recoveredCount`: The number of connections for which recovery cycles were triggered.
 * @throws {Error} Throws an error if there's a problem querying the database for connections.
 */
const runHeartbeatRecovery = async (userId) => {
  try {
    const warningConnections = await ComposioAuth.find({
      userId,
      status: { $in: ['EXPIRED', 'FAILED', 'PENDING'] },
    });

    if (warningConnections.length === 0) {
      return { success: true, message: 'All connected integrations are healthy.', recoveredCount: 0 };
    }

    let recoveredCount = 0;
    for (const conn of warningConnections) {
      // Fire-and-forget background recovery execution
      attemptAutoRecovery(conn._id, userId).catch(() => {});
      recoveredCount++;
    }

    return {
      success: true,
      message: `Heartbeat triggered recovery cycles for ${recoveredCount} expired/failed connection(s).`,
      recoveredCount,
    };
  } catch (err) {
    logger.error('ConnectionRecovery heartbeat failed:', err);
    throw err;
  }
};

/**
 * @namespace connectionRecoveryService
 * @description Provides services for managing and recovering Composio OAuth connections.
 * This service includes functionalities to attempt individual connection recovery and to
 * run a heartbeat scan across all user connections to identify and trigger recovery for
 * problematic ones.
 */
export const connectionRecoveryService = {
  /**
   * @function attemptAutoRecovery
   * @memberof connectionRecoveryService
   * @description Attempts an asynchronous background recovery/refresh cycle for a specific OAuth connection.
   * @see {@link attemptAutoRecovery} for detailed documentation.
   */
  attemptAutoRecovery,
  /**
   * @function runHeartbeatRecovery
   * @memberof connectionRecoveryService
   * @description Scans all connected accounts for a given user and triggers background recovery attempts
   * for connections that are in a 'EXPIRED', 'FAILED', or 'PENDING' status.
   * @see {@link runHeartbeatRecovery} for detailed documentation.
   */
  runHeartbeatRecovery,
};