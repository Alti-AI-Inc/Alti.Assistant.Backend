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
 * Centralized logger for consistent, structured logging.
 * @param {'INFO' | 'WARNING' | 'ERROR'} severity - The log level. Must be a GCP Cloud Logging compatible severity string.
 * @param {string} message - The log message.
 * @param {UserContext} context - The context of the request (tenant, user, role).
 * @param {object} [details={}] - Additional details to include in the log.
 */
const log = (severity, message, context, details = {}) => {
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
  // In a real application, this would use a proper logger like Winston writing to a centralized logging system.
  // The output is a single line of JSON, which is automatically parsed by GCP Cloud Logging.
  console.log(JSON.stringify(logEntry));
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
      log('ERROR', 'Cyberdesk API key is missing. The service will not function.', {});
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
    log('WARNING', 'Super Admin is re-initializing the Cyberdesk client singleton.', { isSuperAdminAction: true });
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
    log('WARNING', 'Access denied to desktop belonging to another tenant', context, { desktopId: desktop.id, desktopTenantId });
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
  log('WARNING', 'Authorization failed for desktop access', context, { desktopId: desktop.id, desktopOwnerId });
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
  log('INFO', 'Super Admin: Listing all active Cyberdesk desktops', context, { filters });
  const result = await getCyberdeskClient().listDesktops({ query: filters });

  if ('error' in result) {
    log('ERROR', 'Super Admin: Failed to list desktops', context, { error: result.error });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Failed to retrieve desktop list');
  }
  return result;
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
  log('INFO', 'Super Admin: Listing all known tenants and their suspension status', context);

  const tenants = [];
  for (const [tenantId, isSuspended] of tenantSuspensionState.entries()) {
    tenants.push({ tenantId, isSuspended });
  }
  return tenants;
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
  log('INFO', 'Super Admin: Fetching global Cyberdesk statistics', context);
  const result = await getCyberdeskClient().getUsageStatistics();

  if ('error' in result) {
    log('ERROR', 'Super Admin: Failed to fetch global stats', context, { error: result.error });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Failed to retrieve global statistics');
  }
  return result;
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
  log('INFO', 'Super Admin: Querying global logs', context, { filters });
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
  log('INFO', 'Super Admin: Fetching platform configuration', context);
  const maskString = (str) => (str ? `${str.substring(0, 4)}...${str.slice(-4)}` : 'Not Set');
  return {
    cyberdeskApiKey: maskString(config.cyberdesk_api_key),
    defaultDesktopTimeoutMs: config.cyberdesk_default_timeout_ms || 600000,
  };
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
  log('WARNING', 'Super Admin: Updating platform-wide Cyberdesk configuration', context, { newCyberdeskConfig });

  if (newCyberdeskConfig.apiKey) {
    try {
      const tempClient = createCyberdeskClient({ apiKey: newCyberdeskConfig.apiKey });
      await tempClient.getUsageStatistics();
      getCyberdeskClient.reinitialize(newCyberdeskConfig.apiKey);
      log('INFO', 'Super Admin: Cyberdesk client re-initialized with new, verified API key.', context);
    } catch (error) {
      log('ERROR', 'Super Admin: New API key is invalid. Configuration change rejected.', context, { error: error.message });
      throw new ApiError(httpStatus.BAD_REQUEST, 'The provided API key is invalid. Configuration was not updated.');
    }
  }
  return { success: true, message: 'Platform configuration updated successfully.' };
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

  const action = isSuspended ? 'suspending' : 'unsuspending';
  log('WARNING', `Super Admin is ${action} tenant ${tenantId}`, context, { tenantId, isSuspended });
  tenantSuspensionState.set(tenantId, isSuspended);

  let terminationResult = null;
  if (isSuspended) {
    log('INFO', `Automatically terminating all desktops for newly suspended tenant ${tenantId}`, context);
    try {
      terminationResult = await terminateAllDesktopsForTenant(context, tenantId);
    } catch (error) {
      log('ERROR', `Failed to automatically terminate desktops for suspended tenant ${tenantId}`, context, { error: error.message });
      terminationResult = { success: false, message: `Termination failed: ${error.message}` };
    }
  }

  const message = `Tenant ${tenantId} has been ${isSuspended ? 'suspended' : 'unsuspended'}.`;
  return { success: true, message, terminationDetails: terminationResult };
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

  log('WARNING', 'Super Admin: Initiating termination of all desktops for a tenant', context, { tenantIdToTerminate });

  const listResult = await _listAllPlatformDesktops(context, { 'metadata.tenantId': tenantIdToTerminate });
  const desktopsToTerminate = listResult.data;

  if (!desktopsToTerminate || desktopsToTerminate.length === 0) {
    return { success: true, message: 'No active desktops found for the specified tenant.', terminatedCount: 0 };
  }

  const terminationPromises = desktopsToTerminate.map(desktop => terminateDesktop(context, desktop.id));
  const results = await Promise.allSettled(terminationPromises);

  const successfulTerminations = results.filter(r => r.status === 'fulfilled').length;
  const failedTerminations = results.length - successfulTerminations;

  log('INFO', `Super Admin: Termination process completed for tenant ${tenantIdToTerminate}.`, context, {
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
  log('INFO', `Admin: Fetching Cyberdesk statistics for tenant ${tenantId}`, context);

  // Assumes the Cyberdesk SDK allows filtering usage statistics by metadata.
  const result = await getCyberdeskClient().getUsageStatistics({ query: { 'metadata.tenantId': tenantId } });

  if ('error' in result) {
    log('ERROR', `Admin: Failed to fetch stats for tenant ${tenantId}`, context, { error: result.error });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Failed to retrieve tenant statistics');
  }
  return result;
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

  if (!tenantSuspensionState.has(tenantId)) {
    tenantSuspensionState.set(tenantId, false);
  }

  if (tenantSuspensionState.get(tenantId) && !_isSuperAdmin(context)) {
    log('WARNING', 'Blocked launch attempt from suspended tenant', context);
    throw new ApiError(httpStatus.FORBIDDEN, 'This tenant account is suspended. Please contact support.');
  }

  const tenantConfig = tenantConfiguration.get(tenantId) || tenantConfiguration.get('default');
  const canBypassLimits = _isSuperAdmin(context) || _isTenantAdmin(context);

  if (tenantConfig.maxActiveDesktops && !canBypassLimits) {
    const listResult = await getCyberdeskClient().listDesktops({ query: { 'metadata.tenantId': tenantId } });
    if ('error' in listResult) {
      log('ERROR', 'Failed to query active desktops for usage limit check', context, { error: listResult.error });
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Could not verify usage limits. Please try again.');
    }
    const activeDesktopsCount = listResult.data?.length || 0;

    if (activeDesktopsCount >= tenantConfig.maxActiveDesktops) {
      log('WARNING', 'Tenant has reached the maximum active desktop limit.', context, { limit: tenantConfig.maxActiveDesktops, current: activeDesktopsCount });
      // In a real system, this would trigger a notification to the tenant admin/manager.
      throw new ApiError(httpStatus.FORBIDDEN, `Your organization has reached the maximum limit of ${tenantConfig.maxActiveDesktops} active desktops.`);
    }
  }

  const defaultTimeout = config.cyberdesk_default_timeout_ms || 600000;
  const body = {
    timeout_ms: _isSuperAdmin(context) && options.timeout_ms ? options.timeout_ms : defaultTimeout,
    metadata: { tenantId, userId, role },
    ...(_isSuperAdmin(context) && options.advanced ? options.advanced : {}),
  };

  log('INFO', 'Attempting to launch Cyberdesk desktop', context, { body });
  const result = await getCyberdeskClient().launchDesktop({ body });

  if ('error' in result) {
    log('ERROR', 'Cyberdesk launch failed', context, { error: result.error, desktopId: result.id });
    throw new ApiError(httpStatus.BAD_REQUEST, result.error.message || 'Cyberdesk API Error');
  }

  log('INFO', 'Cyberdesk desktop launched successfully', context, { result });
  return result;
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

  if (_isSuperAdmin(context)) {
    securityFilters = { ...filters };
    log('INFO', 'Super Admin: Listing desktops for platform', context, { filters });
  } else if (_isTenantAdmin(context)) {
    securityFilters = { ...filters, 'metadata.tenantId': tenantId };
    log('INFO', 'Admin: Listing desktops for tenant', context, { filters });
  } else if (_isManager(context)) {
    const userIdsToQuery = [userId, ...managedUserIds];
    // This assumes the SDK supports an `$in` operator or similar for querying multiple values.
    securityFilters = { ...filters, 'metadata.tenantId': tenantId, 'metadata.userId': { $in: userIdsToQuery } };
    log('INFO', 'Manager: Listing desktops for self and managed users', context, { filters });
  } else {
    securityFilters = { ...filters, 'metadata.tenantId': tenantId, 'metadata.userId': userId };
    log('INFO', 'User: Listing own desktops', context, { filters });
  }

  const result = await getCyberdeskClient().listDesktops({ query: securityFilters });

  if ('error' in result) {
    log('ERROR', 'Failed to list desktops', context, { error: result.error, filters: securityFilters });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Failed to retrieve desktop list');
  }
  return result;
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
  log('INFO', 'Fetching Cyberdesk desktop info', context, { desktopId });
  const result = await getCyberdeskClient().getDesktop({ path: { id: desktopId } });

  if ('error' in result) {
    log('ERROR', 'Failed to fetch Cyberdesk desktop info', context, { desktopId, error: result.error });
    throw new ApiError(httpStatus.NOT_FOUND, result.error.message || 'Desktop not found');
  }

  _authorizeDesktopAccess(context, result.data);

  return result;
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
  await getDesktopInfo(context, desktopId);

  log('INFO', 'Executing mouse click', context, { desktopId, x, y });
  const result = await getCyberdeskClient().executeComputerAction({
    path: { id: desktopId },
    body: { type: 'click_mouse', x, y, button: 'left' },
  });
  if ('error' in result) {
    log('ERROR', 'Cyberdesk mouse click action failed', context, { desktopId, error: result.error });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Cyberdesk Action Error');
  }
  return result;
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
  const desktopInfoResult = await getDesktopInfo(context, desktopId);
  const desktop = desktopInfoResult.data;

  const tenantConfig = tenantConfiguration.get(desktop.metadata.tenantId) || tenantConfiguration.get('default');
  if (!tenantConfig.allowBashAccess && !_isSuperAdmin(context)) {
    log('WARNING', 'User attempted to execute bash command, but it is disabled for the tenant.', context, { desktopId });
    throw new ApiError(httpStatus.FORBIDDEN, 'Bash access is disabled for your organization.');
  }

  log('INFO', 'Executing bash command', context, { desktopId, command });
  const result = await getCyberdeskClient().executeBashAction({
    path: { id: desktopId },
    body: { command },
  });
  if ('error' in result) {
    log('ERROR', 'Cyberdesk bash execution failed', context, { desktopId, command, error: result.error });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Cyberdesk Bash Action Error');
  }
  return result;
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
  await getDesktopInfo(context, desktopId);

  log('INFO', 'Terminating Cyberdesk desktop', context, { desktopId });
  const result = await getCyberdeskClient().terminateDesktop({ path: { id: desktopId } });
  if ('error' in result) {
    log('ERROR', 'Cyberdesk desktop termination failed', context, { desktopId, error: result.error });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Cyberdesk Termination Error');
  }
  return result;
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