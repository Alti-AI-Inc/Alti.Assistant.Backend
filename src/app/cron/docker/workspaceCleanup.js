import { dockerWorkspaceService } from '../../modules/docker/dockerWorkspace.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Periodically audits active containers to suspend or clean up idle ones
 */
export const workspaceCleanup = async (req, res) => {
  try {
    logger.info('[CRON] Running Docker Workspace audit via HTTP trigger');
    await dockerWorkspaceService.auditActiveWorkspaces();
    if (res) res.status(200).json({ success: true, message: 'Workspace cleanup completed' });
  } catch (error) {
    logger.error('[CRON ERROR] Failed running Docker Workspace audit:', error);
    if (res) res.status(500).json({ success: false, message: error.message });
  }
};
