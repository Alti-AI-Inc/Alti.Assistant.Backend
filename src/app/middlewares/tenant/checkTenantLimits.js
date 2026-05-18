import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Tenant from '../../modules/tenant/tenant.model.js';

/**
 * Limit types for different resources
 */
export const LimitType = {
  API_CALL: 'api_call',
  STORAGE: 'storage',
  USER: 'user',
};

/**
 * Check if tenant has reached their API call limit
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const checkApiCallLimit = async (req, res, next) => {
  try {
    console.log('Checking API call limit middleware', req);
    const tenantId = req.tenantId;

    if (!tenantId) {
      logger.warn('No tenantId found in request for API call limit check');
      return next(
        new ApiError(httpStatus.BAD_REQUEST, 'Tenant context required')
      );
    }

    const tenant = await Tenant.findById(tenantId);

    if (!tenant) {
      return next(new ApiError(httpStatus.NOT_FOUND, 'Tenant not found'));
    }

    // Check if tenant has unlimited API calls (-1 means unlimited)
    if (tenant.limits.maxApiCalls === -1) {
      return next();
    }

    // Check if limit is reached
    if (tenant.usage.apiCallsUsed >= tenant.limits.maxApiCalls) {
      logger.warn('Tenant API call limit reached', {
        tenantId: tenant._id,
        tenantName: tenant.name,
        used: tenant.usage.apiCallsUsed,
        limit: tenant.limits.maxApiCalls,
      });

      return next(
        new ApiError(
          httpStatus.TOO_MANY_REQUESTS,
          `API call limit reached. You have used ${tenant.usage.apiCallsUsed} of ${tenant.limits.maxApiCalls} calls. Please upgrade your plan or wait for the monthly reset.`,
          false,
          {
            limitType: LimitType.API_CALL,
            used: tenant.usage.apiCallsUsed,
            limit: tenant.limits.maxApiCalls,
            resetAt: tenant.usage.lastResetAt,
            plan: tenant.plan,
          }
        )
      );
    }

    // Increment API call count
    await tenant.incrementUsage('apiCallsUsed', 1);

    logger.debug('API call tracked', {
      tenantId: tenant._id,
      used: tenant.usage.apiCallsUsed + 1,
      limit: tenant.limits.maxApiCalls,
    });

    next();
  } catch (error) {
    logger.error('Error checking API call limit', { error: error.message });
    next(error);
  }
};

/**
 * Check if tenant has reached their storage limit
 * @param {number} fileSize - Size of file in bytes
 */
export const checkStorageLimit = (fileSize = 0) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenantId;

      if (!tenantId) {
        logger.warn('No tenantId found in request for storage limit check');
        return next(
          new ApiError(httpStatus.BAD_REQUEST, 'Tenant context required')
        );
      }

      const tenant = await Tenant.findById(tenantId);

      if (!tenant) {
        return next(new ApiError(httpStatus.NOT_FOUND, 'Tenant not found'));
      }

      // Check if tenant has unlimited storage (-1 means unlimited)
      if (tenant.limits.maxStorage === -1) {
        return next();
      }

      // Check if adding this file would exceed limit
      const newStorageUsed = tenant.usage.storageUsed + fileSize;

      if (newStorageUsed > tenant.limits.maxStorage) {
        logger.warn('Tenant storage limit would be exceeded', {
          tenantId: tenant._id,
          tenantName: tenant.name,
          currentUsed: tenant.usage.storageUsed,
          fileSize,
          newTotal: newStorageUsed,
          limit: tenant.limits.maxStorage,
        });

        return next(
          new ApiError(
            httpStatus.PAYLOAD_TOO_LARGE,
            `Storage limit would be exceeded. Current usage: ${formatBytes(tenant.usage.storageUsed)}, File size: ${formatBytes(fileSize)}, Limit: ${formatBytes(tenant.limits.maxStorage)}. Please upgrade your plan or free up space.`,
            false,
            {
              limitType: LimitType.STORAGE,
              used: tenant.usage.storageUsed,
              fileSize,
              limit: tenant.limits.maxStorage,
              plan: tenant.plan,
            }
          )
        );
      }

      // Store file size in request for later tracking
      req.uploadFileSize = fileSize;

      next();
    } catch (error) {
      logger.error('Error checking storage limit', { error: error.message });
      next(error);
    }
  };
};

/**
 * Track storage usage after successful upload
 * Call this after file upload succeeds
 */
export const trackStorageUsage = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const fileSize = req.uploadFileSize || 0;

    if (!tenantId || fileSize === 0) {
      return next();
    }

    const tenant = await Tenant.findById(tenantId);

    if (tenant) {
      await tenant.incrementUsage('storageUsed', fileSize);

      logger.info('Storage usage tracked', {
        tenantId: tenant._id,
        fileSize: formatBytes(fileSize),
        totalUsed: formatBytes(tenant.usage.storageUsed + fileSize),
        limit: formatBytes(tenant.limits.maxStorage),
      });
    }

    next();
  } catch (error) {
    logger.error('Error tracking storage usage', { error: error.message });
    // Don't fail the request if tracking fails
    next();
  }
};

/**
 * Check if tenant can add more users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const checkUserLimit = async (req, res, next) => {
  try {
    console.log('Checking user limit middleware', req);
    const tenantId = req?.user?.currentTenantId || req?.user?.tenantId;

    if (!tenantId) {
      logger.warn('No tenantId found in request for user limit check');
      return next(
        new ApiError(httpStatus.BAD_REQUEST, 'Tenant context required')
      );
    }

    const tenant = await Tenant.findById(tenantId);

    if (!tenant) {
      return next(new ApiError(httpStatus.NOT_FOUND, 'Tenant not found'));
    }

    // Check if tenant has unlimited users (-1 means unlimited)
    if (tenant.limits.maxUsers === -1) {
      return next();
    }

    // Check if limit is reached
    if (tenant.usage.usersCount >= tenant.limits.maxUsers) {
      logger.warn('Tenant user limit reached', {
        tenantId: tenant._id,
        tenantName: tenant.name,
        currentUsers: tenant.usage.usersCount,
        limit: tenant.limits.maxUsers,
      });

      return next(
        new ApiError(
          httpStatus.FORBIDDEN,
          `User limit reached. You have ${tenant.usage.usersCount} of ${tenant.limits.maxUsers} users. Please upgrade your plan to add more team members.`,
          false,
          {
            limitType: LimitType.USER,
            used: tenant.usage.usersCount,
            limit: tenant.limits.maxUsers,
            plan: tenant.plan,
          }
        )
      );
    }

    next();
  } catch (error) {
    logger.error('Error checking user limit', { error: error.message });
    next(error);
  }
};

/**
 * Get tenant usage statistics
 * Adds usage data to request object
 */
export const getTenantUsage = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      return next();
    }

    const tenant = await Tenant.findById(tenantId);

    if (tenant) {
      req.tenantUsage = {
        apiCalls: {
          used: tenant.usage.apiCallsUsed,
          limit: tenant.limits.maxApiCalls,
          percentage:
            tenant.limits.maxApiCalls === -1
              ? 0
              : Math.round(
                  (tenant.usage.apiCallsUsed / tenant.limits.maxApiCalls) * 100
                ),
        },
        storage: {
          used: tenant.usage.storageUsed,
          limit: tenant.limits.maxStorage,
          percentage:
            tenant.limits.maxStorage === -1
              ? 0
              : Math.round(
                  (tenant.usage.storageUsed / tenant.limits.maxStorage) * 100
                ),
          usedFormatted: formatBytes(tenant.usage.storageUsed),
          limitFormatted:
            tenant.limits.maxStorage === -1
              ? 'Unlimited'
              : formatBytes(tenant.limits.maxStorage),
        },
        users: {
          used: tenant.usage.usersCount,
          limit: tenant.limits.maxUsers,
          percentage:
            tenant.limits.maxUsers === -1
              ? 0
              : Math.round(
                  (tenant.usage.usersCount / tenant.limits.maxUsers) * 100
                ),
        },
        plan: tenant.plan,
        status: tenant.status,
        lastResetAt: tenant.usage.lastResetAt,
      };
    }

    next();
  } catch (error) {
    logger.error('Error getting tenant usage', { error: error.message });
    // Don't fail the request
    next();
  }
};

/**
 * Format bytes to human-readable format
 * @param {number} bytes - Size in bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted size
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (bytes === -1) return 'Unlimited';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Check multiple limits at once
 * Useful for endpoints that use multiple resources
 */
export const checkMultipleLimits = (...limitChecks) => {
  return async (req, res, next) => {
    for (const checkFn of limitChecks) {
      await new Promise((resolve, reject) => {
        checkFn(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      }).catch((err) => {
        throw err;
      });
    }
    next();
  };
};

export default {
  checkApiCallLimit,
  checkStorageLimit,
  trackStorageUsage,
  checkUserLimit,
  getTenantUsage,
  checkMultipleLimits,
  LimitType,
};
