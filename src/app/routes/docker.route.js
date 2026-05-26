import express from 'express';
import { dockerWorkspaceService } from '../modules/docker/dockerWorkspace.service.js';
import httpStatus from 'http-status';
import auth from '../middlewares/auth/auth.js';

const router = express.Router();

/**
 * GET /api/v1/docker/metrics
 * Queries real-time resource utilization telemetry metrics for all active Docker container workspaces.
 * Secured with super_admin access controls.
 */
router.get(
  '/metrics',
  auth('super_admin'),
  async (req, res, next) => {
    try {
      const metrics = await dockerWorkspaceService.getAllActiveMetrics();
      res.status(httpStatus.OK).json({
        success: true,
        message: 'Active container workspaces metrics scraped successfully.',
        data: metrics
      });
    } catch (error) {
      next(error);
    }
  }
);

export const dockerRoutes = router;
