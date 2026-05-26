import cron from 'node-cron';
import { dockerWorkspaceService } from '../../modules/docker/dockerWorkspace.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Periodically audits active containers to suspend or clean up idle ones
 */
export const startWorkspaceCleanupCron = () => {
  logger.info('[CRON] Registering Docker Workspace Cleanup daemon (runs every 5 minutes)...');
  
  cron.schedule('*/5 * * * *', async () => {
    try {
      await dockerWorkspaceService.auditActiveWorkspaces();
    } catch (error) {
      logger.error('[CRON ERROR] Failed running Docker Workspace audit:', error);
    }
  });
};
