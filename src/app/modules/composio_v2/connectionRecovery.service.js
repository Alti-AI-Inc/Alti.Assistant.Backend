import ComposioAuth from './composio.model.js';
import { actionAuditService } from './actionAudit.service.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { Composio } from '@composio/core';

// Initialize Composio SDK
const composio = new Composio({
  apiKey: config.composio.orgApiKey,
});

/**
 * Attempts an asynchronous background recovery/refresh cycle for an OAuth connection.
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
 * Scans all connected accounts and triggers background refreshes for failed/expired connections.
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

export const connectionRecoveryService = {
  attemptAutoRecovery,
  runHeartbeatRecovery,
};
