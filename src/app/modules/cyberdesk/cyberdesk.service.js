import { createCyberdeskClient } from 'cyberdesk';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import config from '../../../../config/index.js';

/**
 * @typedef {object} UserContext
 * @property {string} tenantId - The identifier for the current tenant.
 * @property {string} userId - The identifier for the user making the request.
 * @property {'super_admin' | 'admin' | 'manager' | 'user'} role - The role of the user.
 * @property {string[]} [managedUserIds] - For managers, a list of user IDs they oversee.
 */

/**
 * @typedef {object} CyberdeskClient
 * Represents the Cyberdesk API client instance.
 */

// In-memory store to simulate a persistent tenant configuration database for suspension status.
// In a real, multi-instance application, this would be backed by a distributed cache (e.g., Redis) or a database.
const tenantSuspensionState = new Map();

// In-memory store for tenant-specific configurations and limits.
// In a real application, this would be a 'TenantSettings' table in a database.
const tenantConfiguration = new Map([
  ['default', { maxActiveDesktops: 10, allowBashAccess: true }], // Default settings for new tenants
  // Example: Tenant 'tenant-123' has a lower limit and disabled bash.
  ['tenant-123', { maxActiveDesktops: 5, allowBashAccess: false }],
]);

/**
 * Centralized logger for consistent, structured logging compatible with GCP Cloud Logging.
 */
const logger = {
  /**
   * @private
   * @param {'INFO' | 'WARNING' | 'ERROR'} severity - The log level.
   * @param {string} message - The log message.
   * @param {UserContext} context - The context of the request.
   * @param {object} [details={}] - Additional structured details.
   */
  _log: (severity, message, context, details = {}) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      severity,
      message,
      service: 'CyberdeskService',
      context: {
        tenantId: context?.tenantId,
        userId: context?.userId,
        role: context?.role,
      },
      ...details,
    };
    // In a real application, this would use a proper logger like Winston.
    // The output is a single line of JSON, which is automatically parsed by GCP Cloud Logging.
    console.log(JSON.stringify(logEntry));
  },

  /**
   * Logs an informational message.
   * @param {string} message - The log message.
   * @param {UserContext} context - The request context.
   * @param {object} [details] - Additional details.
   */
  info: (message, context, details) => logger._log('INFO', message, context, details),

  /**
   * Logs a warning message.
   * @param {string} message - The log message.
   * @param {UserContext} context - The request context.
   * @param {object} [details] - Additional details.
   */
  warn: (message, context, details) => logger._log('WARNING', message, context, details),

  /**
   * Logs an error message, including stack trace and error details.
   * @param {string} message - The log message.
   * @param {UserContext} context - The request context.
   * @param {Error} error - The error object.
   * @param {object} [details] - Additional details.
   */
  error: (message, context, error, details) => {
    const errorDetails = {
      ...details,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error instanceof ApiError && {
          isOperational: error.isOperational,
          statusCode: error.statusCode,
        }),
      },
    };
    logger._log('ERROR', message, context, errorDetails);
  },
};

/**
 * A singleton getter function for the Cyberdesk API client.
 * This function ensures that the Cyberdesk client is initialized only once
 * and reused across all calls. It lazily initializes the client when first accessed.
 * It also exposes a `reinitialize` method for Super Admins to update the client configuration live.
 *
 * @returns {CyberdeskClient & { reinitialize: (newApiKey: string) => void }} The initialized Cyberdesk API client instance with an added reinitialize method.
 */
const getCyberdeskClient = (() => {
  let _client = null;

  const initialize = (apiKeyOverride = null) => {
    const apiKey = (apiKeyOverride || config.cyberdesk_api_key || '').replace(/^\uFEFF+/, '');
    if (!apiKey) {
      // Use a generic logger context as this might be called at startup
      logger.error('Cyberdesk API key is missing. The service will not function.', {}, new Error('Cyberdesk API key is not configured.'));
      throw new Error('Cyberdesk API key is not configured.');
    }
    _client = createCyberdeskClient({ apiKey });
  };

  const getInstance = () => {
    if (!_client) {
      initialize();
    }
    return _client;
  };

  /**
   * Re-initializes the singleton client instance. This is a privileged operation
   * for Super Admins to update the API key without a service restart.
   * @param {string} newApiKey - The new Cyberdesk API key.
   */
  getInstance.reinitialize = (newApiKey) => {
    logger.warn('Super Admin is re-initializing the Cyberdesk client singleton.', {}, { isSuperAdminAction: true });
    initialize(newApiKey);
  };

  return getInstance;
})();

// --- Authorization Helpers ---

/**
 * Checks if the user is a Super Admin (Platform Owner).
 * @param {UserContext} context The user context.
 * @returns {boolean}
 */
const _isSuperAdmin = (context) => context?.role === 'super_admin';

/**
 * Checks if the user is an Admin for their tenant (Workspace Owner).
 * @param {UserContext} context The user context.
 * @returns {boolean}
 */
const _isTenantAdmin = (context) => context?.role === 'admin';

/**
 * Checks if the user is a Manager.
 * @param {UserContext} context The user context.
 * @returns {boolean}
 */
const _isManager = (context) => context?.role === 'manager';

/**
 * Centralized authorization check for accessing a desktop resource.
 * @param {UserContext} context - The context of the user making the request.
 * @param {object} desktop - The full desktop object from the Cyberdesk API.
 * @throws {ApiError} If the user is not authorized to access the desktop.
 */
const _authorizeDesktopAccess = (context, desktop) => {
  if (!desktop || !desktop.metadata) {
    // This is an internal system error, not a user error.
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Desktop metadata is missing, cannot perform authorization.');
  }

  const { tenantId, userId, role, managedUserIds = [] } = context;
  const { tenantId: desktopTenantId, userId: desktopOwnerId } = desktop.metadata;

  // Rule 1: Super Admins can access anything.
  if (_isSuperAdmin(context)) {
    return;
  }

  // Rule 2: Enforce tenant boundary for all other roles.
  if (desktopTenantId !== tenantId) {
    logger.warn('Access denied to desktop belonging to another tenant', context, { desktopId: desktop.id, desktopTenantId });
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied. You do not have permission to view this resource.');
  }

  // Rule 3: Tenant Admins can access any desktop within their tenant.
  if (_isTenantAdmin(context)) {
    return;
  }

  // Rule 4: Managers can access their own desktops and those of their managed users.
  if (_isManager(context)) {
    if (desktopOwnerId === userId || managedUserIds.includes(desktopOwnerId)) {
      return;
    }
  }

  // Rule 5: Regular users can only access their own desktops.
  if (desktopOwnerId === userId) {
    return;
  }

  // If none of the above rules match, deny access.
  logger.warn('Authorization failed for desktop access', context, { desktopId: desktop.id, desktopOwnerId });
  throw new ApiError(httpStatus.FORBIDDEN, 'Access denied. You do not have permission to perform this action on this resource.');
};

// --- Super Admin Functions ---

/**
 * [Super Admin] Helper to list all desktops across all tenants.
 * @private
 * @param {UserContext} context - The request context. Must have `role: 'super_admin'`.
 * @param {object} [filters={}] - Optional filters to apply.
 * @returns {Promise<object>} A promise that resolves with the list of desktops.
 */
const _listAllPlatformDesktops = async (context, filters = {}) => {
  if (!_isSuperAdmin(context)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Super Admin privileges.');
  }
  logger.info('Super Admin: Listing all active Cyberdesk desktops', context, { filters });
  try {
    const result = await getCyberdeskClient().listDesktops({ query: filters });

    if ('error' in result) {
      const apiError = new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Failed to retrieve desktop list');
      logger.error('Super Admin: Cyberdesk API failed to list desktops', context, apiError, { cyberdeskError: result.error });
      throw apiError;
    }
    return result;
  } catch (error) {
    logger.error('Super Admin: Unhandled exception while listing desktops', context, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while retrieving the desktop list.');
  }
};

/**
 * [Super Admin] Lists all tenants known to the system and their suspension status.
 * @async
 * @param {UserContext} context - The request context. Must have `role: 'super_admin'`.
 * @returns {Promise<Array<object>>} A promise that resolves with a list of tenants and their status.
 * @throws {ApiError} If the user is not a Super Admin.
 */
const listTenants = async (context) => {
  if (!_isSuperAdmin(context)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Super Admin privileges.');
  }
  logger.info('Super Admin: Listing all known tenants and their suspension status', context);
  try {
    const tenants = [];
    for (const [tenantId, isSuspended] of tenantSuspensionState.entries()) {
      tenants.push({ tenantId, isSuspended });
    }
    return tenants;
  } catch (error) {
    logger.error('Super Admin: Failed to list tenants from in-memory store', context, error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while listing tenants.');
  }
};

/**
 * [Super Admin] Retrieves global usage statistics for the Cyberdesk platform.
 * @async
 * @param {UserContext} context - The request context. Must have `role: 'super_admin'`.
 * @returns {Promise<object>} A promise that resolves with global statistics.
 * @throws {ApiError} If the user is not a Super Admin or if the API call fails.
 */
const getGlobalStats = async (context) => {
  if (!_isSuperAdmin(context)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Super Admin privileges.');
  }
  logger.info('Super Admin: Fetching global Cyberdesk statistics', context);
  try {
    const result = await getCyberdeskClient().getUsageStatistics();

    if ('error' in result) {
      const apiError = new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Failed to retrieve global statistics');
      logger.error('Super Admin: Cyberdesk API failed to fetch global stats', context, apiError, { cyberdeskError: result.error });
      throw apiError;
    }
    return result;
  } catch (error) {
    logger.error('Super Admin: Unhandled exception while fetching global stats', context, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while retrieving global statistics.');
  }
};

/**
 * [Super Admin] Retrieves global logs.
 * @async
 * @param {UserContext} context - The request context. Must have `role: 'super_admin'`.
 * @param {object} [filters={}] - Optional filters for the log query.
 * @returns {Promise<object>} A promise that resolves with a list of log entries.
 * @throws {ApiError} If the user is not a Super Admin.
 */
const getGlobalLogs = async (context, filters = {}) => {
  if (!_isSuperAdmin(context)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Super Admin privileges.');
  }
  logger.info('Super Admin: Querying global logs', context, { filters });
  try {
    // This is a mock response. In a real system, you would query your logging backend here.
    return {
      success: true,
      message: 'Log query successful (mocked response).',
      logs: [
        {
          timestamp: new Date().toISOString(),
          severity: 'WARNING',
          message: 'Super Admin is updating suspension status for tenant tenant-456',
          service: 'CyberdeskService',
          context: { tenantId: context.tenantId, userId: context.userId, role: 'super_admin' },
          details: { tenantId: 'tenant-456', isSuspended: true },
        },
      ],
    };
  } catch (error) {
    logger.error('Super Admin: Failed to query global logs', context, error, { filters });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while querying logs.');
  }
};

/**
 * [Super Admin] Retrieves the current, non-sensitive platform configuration.
 * @async
 * @param {UserContext} context - The request context. Must have `role: 'super_admin'`.
 * @returns {Promise<object>} A promise that resolves with the current configuration.
 * @throws {ApiError} If the user is not a Super Admin.
 */
const getPlatformConfig = async (context) => {
  if (!_isSuperAdmin(context)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Super Admin privileges.');
  }
  logger.info('Super Admin: Fetching platform configuration', context);
  try {
    const maskString = (str) => (str ? `${str.substring(0, 4)}...${str.slice(-4)}` : 'Not Set');
    return {
      cyberdeskApiKey: maskString(config.cyberdesk_api_key),
      defaultDesktopTimeoutMs: config.cyberdesk_default_timeout_ms || 600000,
    };
  } catch (error) {
    logger.error('Super Admin: Failed to get platform config', context, error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while retrieving platform configuration.');
  }
};

/**
 * [Super Admin] Updates system-wide Cyberdesk configuration.
 * @async
 * @param {UserContext} context - The request context. Must have `role: 'super_admin'`.
 * @param {object} newCyberdeskConfig - The new configuration object.
 * @returns {Promise<object>} A promise that resolves with a success message.
 * @throws {ApiError} If the user is not a Super Admin or the new config is invalid.
 */
const updatePlatformConfig = async (context, newCyberdeskConfig) => {
  if (!_isSuperAdmin(context)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Super Admin privileges.');
  }
  logger.warn('Super Admin: Updating platform-wide Cyberdesk configuration', context, { newCyberdeskConfig });

  try {
    if (newCyberdeskConfig.apiKey) {
      try {
        // Validate the new key by making a simple, low-cost API call.
        const tempClient = createCyberdeskClient({ apiKey: newCyberdeskConfig.apiKey });
        await tempClient.getUsageStatistics();
        // If validation succeeds, re-initialize the singleton client.
        getCyberdeskClient.reinitialize(newCyberdeskConfig.apiKey);
        logger.info('Super Admin: Cyberdesk client re-initialized with new, verified API key.', context);
      } catch (validationError) {
        logger.error('Super Admin: New API key is invalid. Configuration change rejected.', context, validationError);
        throw new ApiError(httpStatus.BAD_REQUEST, 'The provided API key is invalid. Configuration was not updated.');
      }
    }
    return { success: true, message: 'Platform configuration updated successfully.' };
  } catch (error) {
    logger.error('Super Admin: Unhandled exception during platform config update', context, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while updating platform configuration.');
  }
};

/**
 * [Super Admin] Sets the suspension status for a tenant.
 * @async
 * @param {UserContext} context - The request context. Must have `role: 'super_admin'`.
 * @param {string} tenantId - The ID of the tenant to suspend or unsuspend.
 * @param {boolean} isSuspended - True to suspend, false to unsuspend.
 * @returns {Promise<object>} A promise that resolves with a summary of the actions taken.
 * @throws {ApiError} If the user is not a Super Admin.
 */
const setTenantSuspensionStatus = async (context, tenantId, isSuspended) => {
  if (!_isSuperAdmin(context)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Super Admin privileges.');
  }
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant ID is required.');
  }

  try {
    const action = isSuspended ? 'suspending' : 'unsuspending';
    logger.warn(`Super Admin is ${action} tenant ${tenantId}`, context, { tenantId, isSuspended });
    tenantSuspensionState.set(tenantId, isSuspended);

    let terminationResult = null;
    if (isSuspended) {
      logger.info(`Automatically terminating all desktops for newly suspended tenant ${tenantId}`, context);
      try {
        terminationResult = await terminateAllDesktopsForTenant(context, tenantId);
      } catch (error) {
        // Log the termination failure but do not fail the suspension operation itself.
        logger.error(`Failed to automatically terminate desktops for suspended tenant ${tenantId}`, context, error);
        terminationResult = { success: false, message: `Termination failed: ${error.message}` };
      }
    }

    const message = `Tenant ${tenantId} has been ${isSuspended ? 'suspended' : 'unsuspended'}.`;
    return { success: true, message, terminationDetails: terminationResult };
  } catch (error) {
    logger.error(`Super Admin: Failed to set tenant suspension status for ${tenantId}`, context, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while updating tenant status.');
  }
};

/**
 * [Super Admin] Terminates all running desktops for a specific tenant.
 * @async
 * @param {UserContext} context - The request context. Must have `role: 'super_admin'`.
 * @param {string} tenantIdToTerminate - The ID of the tenant whose desktops will be terminated.
 * @returns {Promise<object>} A promise that resolves with a summary of the termination operations.
 * @throws {ApiError} If the user is not a Super Admin or if the operation fails.
 */
const terminateAllDesktopsForTenant = async (context, tenantIdToTerminate) => {
  if (!_isSuperAdmin(context)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Super Admin privileges.');
  }
  if (!tenantIdToTerminate) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant ID is required for this operation.');
  }

  logger.warn('Super Admin: Initiating termination of all desktops for a tenant', context, { tenantIdToTerminate });

  try {
    const listResult = await _listAllPlatformDesktops(context, { 'metadata.tenantId': tenantIdToTerminate });
    const desktopsToTerminate = listResult.data;

    if (!desktopsToTerminate || desktopsToTerminate.length === 0) {
      return { success: true, message: 'No active desktops found for the specified tenant.', terminatedCount: 0 };
    }

    // Promise.allSettled is used to ensure all termination attempts complete, even if some fail.
    const terminationPromises = desktopsToTerminate.map((desktop) => terminateDesktop(context, desktop.id));
    const results = await Promise.allSettled(terminationPromises);

    const successfulTerminations = results.filter((r) => r.status === 'fulfilled').length;
    const failedTerminations = results.length - successfulTerminations;

    logger.info(`Super Admin: Termination process completed for tenant ${tenantIdToTerminate}.`, context, {
      totalFound: desktopsToTerminate.length,
      successfulTerminations,
      failedTerminations,
    });

    return {
      success: failedTerminations === 0,
      message: `Termination process completed. ${successfulTerminations} succeeded, ${failedTerminations} failed.`,
      terminatedCount: successfulTerminations,
      failedCount: failedTerminations,
    };
  } catch (error) {
    logger.error(`Super Admin: Failed to terminate all desktops for tenant ${tenantIdToTerminate}`, context, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred during the bulk termination process.');
  }
};

// --- Tenant Admin Functions ---

/**
 * [Admin] Retrieves usage statistics for the admin's tenant.
 * @async
 * @param {UserContext} context - The request context. Must have `role: 'admin'` or `'super_admin'`.
 * @returns {Promise<object>} A promise that resolves with tenant-specific statistics.
 * @throws {ApiError} If the user is not a Tenant Admin or if the API call fails.
 */
const getTenantStats = async (context) => {
  if (!_isTenantAdmin(context) && !_isSuperAdmin(context)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Admin privileges.');
  }
  const { tenantId } = context;
  logger.info(`Admin: Fetching Cyberdesk statistics for tenant ${tenantId}`, context);

  try {
    // Assumes the Cyberdesk SDK allows filtering usage statistics by metadata.
    const result = await getCyberdeskClient().getUsageStatistics({ query: { 'metadata.tenantId': tenantId } });

    if ('error' in result) {
      const apiError = new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Failed to retrieve tenant statistics');
      logger.error(`Admin: Cyberdesk API failed to fetch stats for tenant ${tenantId}`, context, apiError, { cyberdeskError: result.error });
      throw apiError;
    }
    return result;
  } catch (error) {
    logger.error(`Admin: Unhandled exception while fetching stats for tenant ${tenantId}`, context, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while retrieving tenant statistics.');
  }
};

// --- Core Service Functions (Role-Aware) ---

/**
 * Launches a new Cyberdesk virtual desktop instance, respecting tenant limits and permissions.
 * @async
 * @param {UserContext} context - The request context, containing tenant, user, and role info.
 * @param {object} [options={}] - Optional parameters for launching.
 * @returns {Promise<object>} A promise that resolves with the result of the desktop launch operation.
 * @throws {ApiError} If the tenant is suspended, limits are exceeded, or the API returns an error.
 */
const launchDesktop = async (context, options = {}) => {
  const { tenantId, userId, role } = context;

  try {
    if (!tenantSuspensionState.has(tenantId)) {
      tenantSuspensionState.set(tenantId, false);
    }

    if (tenantSuspensionState.get(tenantId) && !_isSuperAdmin(context)) {
      logger.warn('Blocked launch attempt from suspended tenant', context);
      throw new ApiError(httpStatus.FORBIDDEN, 'This tenant account is suspended. Please contact support.');
    }

    const tenantConfig = tenantConfiguration.get(tenantId) || tenantConfiguration.get('default');
    const canBypassLimits = _isSuperAdmin(context) || _isTenantAdmin(context);

    if (tenantConfig.maxActiveDesktops && !canBypassLimits) {
      const listResult = await getCyberdeskClient().listDesktops({ query: { 'metadata.tenantId': tenantId } });
      if ('error' in listResult) {
        const apiError = new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Could not verify usage limits. Please try again.');
        logger.error('Failed to query active desktops for usage limit check', context, apiError, { cyberdeskError: listResult.error });
        throw apiError;
      }
      const activeDesktopsCount = listResult.data?.length || 0;

      if (activeDesktopsCount >= tenantConfig.maxActiveDesktops) {
        logger.warn('Tenant has reached the maximum active desktop limit.', context, { limit: tenantConfig.maxActiveDesktops, current: activeDesktopsCount });
        throw new ApiError(httpStatus.FORBIDDEN, `Your organization has reached the maximum limit of ${tenantConfig.maxActiveDesktops} active desktops.`);
      }
    }

    const defaultTimeout = config.cyberdesk_default_timeout_ms || 600000;
    const body = {
      timeout_ms: _isSuperAdmin(context) && options.timeout_ms ? options.timeout_ms : defaultTimeout,
      metadata: { tenantId, userId, role },
      ...(_isSuperAdmin(context) && options.advanced ? options.advanced : {}),
    };

    logger.info('Attempting to launch Cyberdesk desktop', context, { body });
    const result = await getCyberdeskClient().launchDesktop({ body });

    if ('error' in result) {
      const apiError = new ApiError(httpStatus.BAD_REQUEST, result.error.message || 'Cyberdesk API Error');
      logger.error('Cyberdesk launch failed', context, apiError, { cyberdeskError: result.error, desktopId: result.id });
      throw apiError;
    }

    logger.info('Cyberdesk desktop launched successfully', context, { result });
    return result;
  } catch (error) {
    logger.error('Failed to launch desktop', context, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while launching the desktop.');
  }
};

/**
 * Lists active Cyberdesk desktops based on user role and permissions.
 * @async
 * @param {UserContext} context - The user's context, including role and managed users.
 * @param {object} [filters={}] - Optional filters to apply. Security filters cannot be overridden by non-admins.
 * @returns {Promise<object>} A promise that resolves with the list of desktops.
 */
const listDesktops = async (context, filters = {}) => {
  const { tenantId, userId, role, managedUserIds = [] } = context;
  let securityFilters = {};

  try {
    if (_isSuperAdmin(context)) {
      securityFilters = { ...filters };
      logger.info('Super Admin: Listing desktops for platform', context, { filters });
    } else if (_isTenantAdmin(context)) {
      securityFilters = { ...filters, 'metadata.tenantId': tenantId };
      logger.info('Admin: Listing desktops for tenant', context, { filters });
    } else if (_isManager(context)) {
      const userIdsToQuery = [userId, ...managedUserIds];
      securityFilters = { ...filters, 'metadata.tenantId': tenantId, 'metadata.userId': { $in: userIdsToQuery } };
      logger.info('Manager: Listing desktops for self and managed users', context, { filters });
    } else {
      securityFilters = { ...filters, 'metadata.tenantId': tenantId, 'metadata.userId': userId };
      logger.info('User: Listing own desktops', context, { filters });
    }

    const result = await getCyberdeskClient().listDesktops({ query: securityFilters });

    if ('error' in result) {
      const apiError = new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Failed to retrieve desktop list');
      logger.error('Cyberdesk API failed to list desktops', context, apiError, { cyberdeskError: result.error, filters: securityFilters });
      throw apiError;
    }
    return result;
  } catch (error) {
    logger.error('Failed to list desktops', context, error, { filters: securityFilters });
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while listing desktops.');
  }
};

/**
 * Retrieves information about a specific Cyberdesk virtual desktop, enforcing role-based access control.
 * @async
 * @param {UserContext} context - The request context for logging and authorization checks.
 * @param {string} desktopId - The unique identifier of the desktop.
 * @returns {Promise<object>} A promise that resolves with the desktop's information.
 * @throws {ApiError} If the desktop is not found, an API error occurs, or the user is not authorized.
 */
const getDesktopInfo = async (context, desktopId) => {
  logger.info('Fetching Cyberdesk desktop info', context, { desktopId });
  try {
    const result = await getCyberdeskClient().getDesktop({ path: { id: desktopId } });

    if ('error' in result) {
      const apiError = new ApiError(httpStatus.NOT_FOUND, result.error.message || 'Desktop not found');
      logger.error('Cyberdesk API failed to fetch desktop info', context, apiError, { desktopId, cyberdeskError: result.error });
      throw apiError;
    }

    // Throws ApiError on auth failure, which will be caught and re-thrown.
    _authorizeDesktopAccess(context, result.data);

    return result;
  } catch (error) {
    logger.error('Failed to get desktop info', context, error, { desktopId });
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while retrieving desktop information.');
  }
};

/**
 * Performs a mouse click action within a specified Cyberdesk virtual desktop.
 * @async
 * @param {UserContext} context - The request context for logging and authorization.
 * @param {string} desktopId - The unique identifier of the desktop.
 * @param {number} x - The X-coordinate for the mouse click.
 * @param {number} y - The Y-coordinate for the mouse click.
 * @returns {Promise<object>} A promise that resolves with the result of the action.
 * @throws {ApiError} If the API returns an error or the user is not authorized.
 */
const clickMouse = async (context, desktopId, x, y) => {
  try {
    // Authorization is handled within getDesktopInfo
    await getDesktopInfo(context, desktopId);

    logger.info('Executing mouse click', context, { desktopId, x, y });
    const result = await getCyberdeskClient().executeComputerAction({
      path: { id: desktopId },
      body: { type: 'click_mouse', x, y, button: 'left' },
    });
    if ('error' in result) {
      const apiError = new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Cyberdesk Action Error');
      logger.error('Cyberdesk mouse click action failed', context, apiError, { desktopId, cyberdeskError: result.error });
      throw apiError;
    }
    return result;
  } catch (error) {
    logger.error('Failed to execute mouse click', context, error, { desktopId, x, y });
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while performing the click action.');
  }
};

/**
 * Executes a bash command within a specified Cyberdesk virtual desktop, respecting tenant policies.
 * @async
 * @param {UserContext} context - The request context for logging and authorization.
 * @param {string} desktopId - The unique identifier of the desktop.
 * @param {string} command - The bash command string to execute.
 * @returns {Promise<object>} A promise that resolves with the command execution result.
 * @throws {ApiError} If the API returns an error, the user is not authorized, or bash is disabled for the tenant.
 */
const executeBash = async (context, desktopId, command) => {
  try {
    // Authorization is handled within getDesktopInfo
    const desktopInfoResult = await getDesktopInfo(context, desktopId);
    const desktop = desktopInfoResult.data;

    const tenantConfig = tenantConfiguration.get(desktop.metadata.tenantId) || tenantConfiguration.get('default');
    if (!tenantConfig.allowBashAccess && !_isSuperAdmin(context)) {
      logger.warn('User attempted to execute bash command, but it is disabled for the tenant.', context, { desktopId });
      throw new ApiError(httpStatus.FORBIDDEN, 'Bash access is disabled for your organization.');
    }

    logger.info('Executing bash command', context, { desktopId, command });
    const result = await getCyberdeskClient().executeBashAction({
      path: { id: desktopId },
      body: { command },
    });
    if ('error' in result) {
      const apiError = new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Cyberdesk Bash Action Error');
      logger.error('Cyberdesk bash execution failed', context, apiError, { desktopId, command, cyberdeskError: result.error });
      throw apiError;
    }
    return result;
  } catch (error) {
    logger.error('Failed to execute bash command', context, error, { desktopId, command });
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while executing the bash command.');
  }
};

/**
 * Terminates a running Cyberdesk virtual desktop instance.
 * @async
 * @param {UserContext} context - The request context for logging and authorization.
 * @param {string} desktopId - The unique identifier of the desktop to terminate.
 * @returns {Promise<object>} A promise that resolves with the termination operation result.
 * @throws {ApiError} If the API returns an error or the user is not authorized.
 */
const terminateDesktop = async (context, desktopId) => {
  try {
    // Authorization is handled within getDesktopInfo
    await getDesktopInfo(context, desktopId);

    logger.info('Terminating Cyberdesk desktop', context, { desktopId });
    const result = await getCyberdeskClient().terminateDesktop({ path: { id: desktopId } });
    if ('error' in result) {
      const apiError = new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Cyberdesk Termination Error');
      logger.error('Cyberdesk desktop termination failed', context, apiError, { desktopId, cyberdeskError: result.error });
      throw apiError;
    }
    return result;
  } catch (error) {
    logger.error('Failed to terminate desktop', context, error, { desktopId });
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while terminating the desktop.');
  }
};

export const cyberdeskService = {
  // Super Admin (Platform) Features
  listTenants,
  getGlobalStats,
  getGlobalLogs,
  getPlatformConfig,
  updatePlatformConfig,
  setTenantSuspensionStatus,
  terminateAllDesktopsForTenant,
  // Tenant Admin Features
  getTenantStats,
  // Role-Aware Core Features
  launchDesktop,
  listDesktops,
  getDesktopInfo,
  clickMouse,
  executeBash,
  terminateDesktop,
};