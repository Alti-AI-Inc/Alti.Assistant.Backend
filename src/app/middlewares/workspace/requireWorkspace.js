import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Tenant from '../../modules/tenant/tenant.model.js';
import { jwtHelpers } from '../../helpers/jwtHelpers.js';
import config from '../../../../config/index.js';

/**
 * Middleware to require and validate workspace/tenant context.
 * Resolves workspaceId from headers, query params, or JWT token.
 */
export const requireWorkspace = async (req, res, next) => {
  try {
    let tenantId = req.tenantId || req.headers['x-workspace-id'] || req.headers['x-tenant-id'] || req.query.workspaceId || req.query.tenantId;

    // If not found in headers/query, try to decode Authorization token
    if (!tenantId && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const verifiedUser = jwtHelpers.verifyToken(token, config.jwt.access_token);
        if (verifiedUser) {
          req.user = verifiedUser;
          tenantId = verifiedUser.currentTenantId || verifiedUser.tenantId;
        }
      } catch (jwtErr) {
        // Log token parsing failure but don't fail yet (auth middleware will handle authentication errors)
        logger.debug('requireWorkspace: Failed to parse token for workspace extraction:', jwtErr.message);
      }
    }

    if (!tenantId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Workspace context is required. Please specify a workspace ID in headers (x-workspace-id) or query parameters.'
      );
    }

    // Verify tenant exists and is active
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Workspace not found.');
    }

    if (tenant.status === 'suspended') {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Your workspace has been suspended. Please contact support.'
      );
    }

    if (tenant.status === 'cancelled') {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Your workspace has been cancelled. Please reactivate to continue.'
      );
    }

    // Attach workspace/tenant context to request object
    req.tenantId = tenantId;
    req.tenant = tenant;
    req.workspaceId = tenantId;

    next();
  } catch (error) {
    next(error);
  }
};

export default requireWorkspace;
