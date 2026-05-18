import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Tenant from '../../modules/tenant/tenant.model.js';

/**
 * Extract tenant context from authenticated user
 * Adds tenantId and tenantRole to request object
 */
export const extractTenantContext = async (req, res, next) => {
  try {
    // Skip if no authenticated user
    if (!req.user) {
      return next();
    }

    const userId = req.user.id || req.user._id;
    const tenantId = req.user.currentTenantId || req.user.tenantId;
    const tenantRole = req.user.tenantRole;

    // If user has tenant, attach tenant context
    if (tenantId) {
      req.tenantId = tenantId;
      req.tenantRole = tenantRole;
      req.tenantPermissions = req.user.tenantPermissions || [];

      logger.info(`Tenant context extracted: ${tenantId} for user: ${userId}`);
    }

    next();
  } catch (error) {
    logger.error('Error extracting tenant context:', error);
    next(error);
  }
};

/**
 * Require that user belongs to a tenant
 * Use this middleware on routes that require tenant membership
 */
export const requireTenant = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'This action requires tenant membership. Please join or create a workspace first.'
      );
    }

    // Verify tenant is active
    const tenant = await Tenant.findById(req.tenantId);

    if (!tenant) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
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

    // Attach tenant to request for use in controllers
    req.tenant = tenant;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user has specific permission within tenant
 * @param {string|string[]} requiredPermissions - Permission(s) to check
 */
export const checkTenantPermission = (...requiredPermissions) => {
  return async (req, res, next) => {
    try {
      if (!req.tenantId) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Tenant membership required');
      }

      const userRole = req.tenantRole;
      const userPermissions = req.tenantPermissions || [];

      // Owners have all permissions
      if (userRole === 'owner') {
        return next();
      }

      // Check if user has wildcard permission
      if (userPermissions.includes('*')) {
        return next();
      }

      // Check if user has at least one of the required permissions
      const hasPermission = requiredPermissions.some((permission) =>
        userPermissions.includes(permission)
      );

      if (!hasPermission) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'You do not have permission to perform this action'
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check tenant limits before allowing action
 * @param {string} limitType - Type of limit to check ('apiCalls', 'storage', 'users')
 */
export const checkTenantLimits = (limitType) => {
  return async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return next();
      }

      const tenant = await Tenant.findById(req.tenantId);

      if (!tenant) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
      }

      // Check specific limit
      switch (limitType) {
        case 'apiCalls':
          if (tenant.hasReachedApiLimit()) {
            throw new ApiError(
              httpStatus.TOO_MANY_REQUESTS,
              'Your workspace has reached its API call limit. Please upgrade your plan.'
            );
          }
          break;

        case 'storage':
          if (tenant.usage.storageUsed >= tenant.limits.maxStorage) {
            throw new ApiError(
              httpStatus.INSUFFICIENT_STORAGE,
              'Your workspace has reached its storage limit. Please upgrade your plan.'
            );
          }
          break;

        case 'users':
          if (!tenant.canAddMembers()) {
            throw new ApiError(
              httpStatus.FORBIDDEN,
              'Your workspace has reached its member limit. Please upgrade your plan.'
            );
          }
          break;

        default:
          break;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Increment tenant usage after successful action
 * @param {string} usageType - Type of usage to increment ('apiCallsUsed', 'storageUsed')
 * @param {number} amount - Amount to increment (default: 1)
 */
export const incrementTenantUsage = (usageType, amount = 1) => {
  return async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return next();
      }

      const tenant = await Tenant.findById(req.tenantId);

      if (tenant) {
        await tenant.incrementUsage(usageType, amount);
        logger.info(
          `Tenant usage incremented: ${usageType} +${amount} for tenant ${req.tenantId}`
        );
      }

      next();
    } catch (error) {
      // Don't fail request if usage tracking fails
      logger.error('Error incrementing tenant usage:', error);
      next();
    }
  };
};

/**
 * Validate invitation token middleware
 * Verifies token and extracts invitation details
 */
export const validateInvitationToken = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Invitation token is required'
      );
    }

    const TenantInvitation = (
      await import('../../modules/tenant/tenantInvitation.model.js')
    ).default;

    const invitation = await TenantInvitation.findByToken(token);

    if (!invitation) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Invalid or expired invitation token'
      );
    }

    if (invitation.isExpired()) {
      invitation.status = 'expired';
      await invitation.save();
      throw new ApiError(httpStatus.GONE, 'This invitation has expired');
    }

    // Attach invitation to request
    req.invitation = invitation;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user is tenant owner or admin
 */
export const requireTenantAdmin = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Tenant membership required');
    }

    const userRole = req.tenantRole;

    if (userRole !== 'owner' && userRole !== 'admin') {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'This action requires owner or admin privileges'
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user is tenant owner
 */
export const requireTenantOwner = async (req, res, next) => {
  try {
    if (!req.tenantId) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Tenant membership required');
    }

    if (req.tenantRole !== 'owner') {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'This action requires owner privileges'
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

export default {
  extractTenantContext,
  requireTenant,
  checkTenantPermission,
  checkTenantLimits,
  incrementTenantUsage,
  validateInvitationToken,
  requireTenantAdmin,
  requireTenantOwner,
};
