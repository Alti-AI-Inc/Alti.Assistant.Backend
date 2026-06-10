import { createCyberdeskClient } from 'cyberdesk';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import config from '../../../../config/index.js';

/**
 * @typedef {object} PlatformContext
 * @property {string} tenantId - The identifier for the current tenant.
 * @property {string} userId - The identifier for the user making the request.
 * @property {boolean} [isPlatformOwner=false] - Flag indicating if the user is a Platform Owner/Super Admin.
 */

/**
 * @typedef {object} CyberdeskClient
 * Represents the Cyberdesk API client instance.
 */

// In-memory store to simulate a persistent tenant configuration database for suspension status.
// In a real, multi-instance application, this would be backed by a distributed cache (e.g., Redis) or a database.
const tenantSuspensionState = new Map();

/**
 * Centralized logger for consistent, structured logging.
 * @param {'INFO' | 'WARNING' | 'ERROR'} severity - The log level. Must be a GCP Cloud Logging compatible severity string.
 * @param {string} message - The log message.
 * @param {PlatformContext} context - The context of the request (tenant, user).
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
      isPlatformOwner: context?.isPlatformOwner,
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
 * It also exposes a `reinitialize` method for Platform Owners to update the client configuration live.
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
   * for Platform Owners to update the API key without a service restart.
   * @param {string} newApiKey - The new Cyberdesk API key.
   */
  getInstance.reinitialize = (newApiKey) => {
    log('WARNING', 'Platform Owner is re-initializing the Cyberdesk client singleton.', { isPlatformOwnerAction: true });
    initialize(newApiKey);
  };

  return getInstance;
})();

// --- Platform Owner / Super Admin Functions ---

/**
 * [Platform Owner] Lists all active Cyberdesk desktops across all tenants.
 * Can be filtered, for example, by tenantId.
 * @async
 * @param {PlatformContext} context - The request context. Must have `isPlatformOwner: true`.
 * @param {object} [filters={}] - Optional filters to apply, e.g., `{ 'metadata.tenantId': 'tenant-123' }`.
 * @returns {Promise<object>} A promise that resolves with the list of desktops.
 * @throws {ApiError} If the user is not a Platform Owner or if the API call fails.
 */
const listAllDesktops = async (context, filters = {}) => {
  if (!context?.isPlatformOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Platform Owner privileges.');
  }
  log('INFO', 'Platform Owner: Listing all active Cyberdesk desktops', context, { filters });
  // Assumes the Cyberdesk SDK has a method `listDesktops` that can accept filters.
  const result = await getCyberdeskClient().listDesktops({ query: filters });

  if ('error' in result) {
    log('ERROR', 'Platform Owner: Failed to list desktops', context, { error: result.error });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Failed to retrieve desktop list');
  }
  return result;
};

/**
 * [Platform Owner] Lists all tenants known to the system and their suspension status.
 * In this implementation, "known" tenants are those who have an entry in the suspension state map.
 * A more robust implementation would query a dedicated tenant database.
 * @async
 * @param {PlatformContext} context - The request context. Must have `isPlatformOwner: true`.
 * @returns {Promise<Array<object>>} A promise that resolves with a list of tenants and their status.
 * @throws {ApiError} If the user is not a Platform Owner.
 */
const listTenants = async (context) => {
  if (!context?.isPlatformOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Platform Owner privileges.');
  }
  log('INFO', 'Platform Owner: Listing all known tenants and their suspension status', context);

  const tenants = [];
  for (const [tenantId, isSuspended] of tenantSuspensionState.entries()) {
    tenants.push({ tenantId, isSuspended });
  }

  // This is a simple implementation. A real one might also list tenants from a database
  // who don't have an explicit suspension state (and would be considered active).
  return tenants;
};

/**
 * [Platform Owner] Retrieves global usage statistics for the Cyberdesk platform.
 * @async
 * @param {PlatformContext} context - The request context. Must have `isPlatformOwner: true`.
 * @returns {Promise<object>} A promise that resolves with global statistics.
 * @throws {ApiError} If the user is not a Platform Owner or if the API call fails.
 */
const getGlobalStats = async (context) => {
  if (!context?.isPlatformOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Platform Owner privileges.');
  }
  log('INFO', 'Platform Owner: Fetching global Cyberdesk statistics', context);
  // Assumes the Cyberdesk SDK has a method for retrieving platform-wide stats.
  const result = await getCyberdeskClient().getUsageStatistics();

  if ('error' in result) {
    log('ERROR', 'Platform Owner: Failed to fetch global stats', context, { error: result.error });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Failed to retrieve global statistics');
  }
  return result;
};

/**
 * [Platform Owner] Retrieves global logs.
 * NOTE: This is a mock implementation. A real system would query a centralized logging service (e.g., Elasticsearch, Datadog).
 * @async
 * @param {PlatformContext} context - The request context. Must have `isPlatformOwner: true`.
 * @param {object} [filters={}] - Optional filters for the log query (e.g., severity, tenantId).
 * @returns {Promise<object>} A promise that resolves with a list of log entries.
 * @throws {ApiError} If the user is not a Platform Owner.
 */
const getGlobalLogs = async (context, filters = {}) => {
  if (!context?.isPlatformOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Platform Owner privileges.');
  }
  log('INFO', 'Platform Owner: Querying global logs', context, { filters });
  // This is a mock response. In a real system, you would query your logging backend here.
  return {
    success: true,
    message: 'Log query successful (mocked response).',
    logs: [
      {
        timestamp: new Date().toISOString(),
        severity: 'WARNING',
        message: 'Platform Owner is updating suspension status for tenant tenant-456',
        service: 'CyberdeskService',
        context: { tenantId: context.tenantId, userId: context.userId, isPlatformOwner: true },
        details: { tenantId: 'tenant-456', isSuspended: true },
      },
      {
        timestamp: new Date().toISOString(),
        severity: 'INFO',
        message: 'Cyberdesk desktop launched successfully',
        service: 'CyberdeskService',
        context: { tenantId: 'tenant-123', userId: 'user-abc', isPlatformOwner: false },
        details: { result: { id: 'desktop-xyz' } },
      },
    ],
  };
};

/**
 * [Platform Owner] Retrieves the current, non-sensitive platform configuration.
 * Sensitive values like the API key will be masked.
 * @async
 * @param {PlatformContext} context - The request context. Must have `isPlatformOwner: true`.
 * @returns {Promise<object>} A promise that resolves with the current configuration.
 * @throws {ApiError} If the user is not a Platform Owner.
 */
const getPlatformConfig = async (context) => {
  if (!context?.isPlatformOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Platform Owner privileges.');
  }
  log('INFO', 'Platform Owner: Fetching platform configuration', context);

  // Helper to mask sensitive strings for security.
  const maskString = (str) => (str ? `${str.substring(0, 4)}...${str.slice(-4)}` : 'Not Set');

  return {
    cyberdeskApiKey: maskString(config.cyberdesk_api_key),
    defaultDesktopTimeoutMs: config.cyberdesk_default_timeout_ms || 600000,
    // Add other relevant config values here as the platform grows.
  };
};

/**
 * [Platform Owner] Updates system-wide Cyberdesk configuration, such as the API key.
 * Includes a verification step to ensure the new key is valid before applying it.
 * @async
 * @param {PlatformContext} context - The request context. Must have `isPlatformOwner: true`.
 * @param {object} newCyberdeskConfig - The new configuration object. e.g., { apiKey: '...', defaultTimeout: 900000 }
 * @returns {Promise<object>} A promise that resolves with a success message.
 * @throws {ApiError} If the user is not a Platform Owner or the new config is invalid.
 */
const updatePlatformConfig = async (context, newCyberdeskConfig) => {
  if (!context?.isPlatformOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Platform Owner privileges.');
  }

  log('WARNING', 'Platform Owner: Updating platform-wide Cyberdesk configuration', context, { newCyberdeskConfig });

  if (newCyberdeskConfig.apiKey) {
    try {
      // Create a temporary client to test the new key without disrupting the current singleton.
      const tempClient = createCyberdeskClient({ apiKey: newCyberdeskConfig.apiKey });
      // Verification step: Make a low-impact call to verify the new key.
      await tempClient.getUsageStatistics();
      // If successful, re-initialize the singleton for real.
      getCyberdeskClient.reinitialize(newCyberdeskConfig.apiKey);
      log('INFO', 'Platform Owner: Cyberdesk client re-initialized with new, verified API key.', context);
    } catch (error) {
      log('ERROR', 'Platform Owner: New API key is invalid. Configuration change rejected.', context, { error: error.message });
      throw new ApiError(httpStatus.BAD_REQUEST, 'The provided API key is invalid. Configuration was not updated.');
    }
  }

  // In a real system, other config values would be persisted to a database or config store.
  // For example: config.cyberdesk_default_timeout_ms = newCyberdeskConfig.defaultTimeout;

  return { success: true, message: 'Platform configuration updated successfully.' };
};

/**
 * [Platform Owner] Sets the suspension status for a tenant.
 * A suspended tenant cannot launch new desktops.
 * If a tenant is being suspended, all their active desktops will be terminated automatically.
 * @async
 * @param {PlatformContext} context - The request context. Must have `isPlatformOwner: true`.
 * @param {string} tenantId - The ID of the tenant to suspend or unsuspend.
 * @param {boolean} isSuspended - True to suspend, false to unsuspend.
 * @returns {Promise<object>} A promise that resolves with a summary of the actions taken.
 * @throws {ApiError} If the user is not a Platform Owner.
 */
const setTenantSuspensionStatus = async (context, tenantId, isSuspended) => {
  if (!context?.isPlatformOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Platform Owner privileges.');
  }
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant ID is required.');
  }

  const action = isSuspended ? 'suspending' : 'unsuspending';
  log('WARNING', `Platform Owner is ${action} tenant ${tenantId}`, context, { tenantId, isSuspended });
  tenantSuspensionState.set(tenantId, isSuspended);

  let terminationResult = null;
  // If suspending, also terminate all running desktops for that tenant as a security and cost-control measure.
  if (isSuspended) {
    log('INFO', `Automatically terminating all desktops for newly suspended tenant ${tenantId}`, context);
    try {
      terminationResult = await terminateAllDesktopsForTenant(context, tenantId);
    } catch (error) {
      // Log the error but don't fail the entire suspension operation. The tenant is still marked as suspended.
      log('ERROR', `Failed to automatically terminate desktops for suspended tenant ${tenantId}`, context, { error: error.message });
      terminationResult = { success: false, message: `Termination failed: ${error.message}` };
    }
  }

  const message = `Tenant ${tenantId} has been ${isSuspended ? 'suspended' : 'unsuspended'}.`;
  return {
    success: true,
    message,
    terminationDetails: terminationResult, // Provide details of the automatic termination if it occurred.
  };
};

/**
 * [Platform Owner] Terminates all running desktops for a specific tenant.
 * This is a critical function for tenant suspension enforcement or other administrative actions.
 * @async
 * @param {PlatformContext} context - The request context. Must have `isPlatformOwner: true`.
 * @param {string} tenantIdToTerminate - The ID of the tenant whose desktops will be terminated.
 * @returns {Promise<object>} A promise that resolves with a summary of the termination operations.
 * @throws {ApiError} If the user is not a Platform Owner or if the operation fails.
 */
const terminateAllDesktopsForTenant = async (context, tenantIdToTerminate) => {
  if (!context?.isPlatformOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Platform Owner privileges.');
  }
  if (!tenantIdToTerminate) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant ID is required for this operation.');
  }

  log('WARNING', 'Platform Owner: Initiating termination of all desktops for a tenant', context, { tenantIdToTerminate });

  // Step 1: List all desktops for the specified tenant using metadata filter.
  const listResult = await listAllDesktops(context, { 'metadata.tenantId': tenantIdToTerminate });
  const desktopsToTerminate = listResult.data;

  if (!desktopsToTerminate || desktopsToTerminate.length === 0) {
    log('INFO', `Platform Owner: No active desktops found for tenant ${tenantIdToTerminate}.`, context);
    return { success: true, message: 'No active desktops found for the specified tenant.', terminatedCount: 0 };
  }

  // Step 2: Terminate each desktop in parallel. The inner `terminateDesktop` call is authorized by the Platform Owner context.
  const terminationPromises = desktopsToTerminate.map(desktop =>
    terminateDesktop(context, desktop.id)
  );
  const results = await Promise.allSettled(terminationPromises);

  const successfulTerminations = results.filter(r => r.status === 'fulfilled').length;
  const failedTerminations = results.length - successfulTerminations;

  log('INFO', `Platform Owner: Termination process completed for tenant ${tenantIdToTerminate}.`, context, {
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

// --- Core Service Functions (with Platform Owner enhancements) ---

/**
 * Launches a new Cyberdesk virtual desktop instance, with context and overrides for Platform Owners.
 * @async
 * @param {PlatformContext} context - The request context, containing tenant and user info.
 * @param {object} [options={}] - Optional parameters for launching. Platform Owners can use this to override defaults.
 * @returns {Promise<object>} A promise that resolves with the result of the desktop launch operation.
 * @throws {ApiError} If the Cyberdesk API returns an error or the tenant is suspended.
 */
const launchDesktop = async (context, options = {}) => {
  const { tenantId, userId, isPlatformOwner } = context;

  // Ensure tenant exists in the state map for tracking purposes. Default to not suspended.
  // This populates the list of known tenants for the `listTenants` admin function.
  if (!tenantSuspensionState.has(tenantId)) {
    tenantSuspensionState.set(tenantId, false);
  }

  // A suspended tenant cannot launch new desktops, but a Platform Owner can override this for administrative purposes.
  if (tenantSuspensionState.get(tenantId) && !isPlatformOwner) {
    log('WARNING', 'Blocked launch attempt from suspended tenant', context);
    throw new ApiError(httpStatus.FORBIDDEN, 'This tenant account is suspended. Please contact support.');
  }

  // Platform Owner can override default settings. Regular tenants use configured limits.
  const defaultTimeout = config.cyberdesk_default_timeout_ms || 600000;
  const body = {
    timeout_ms: isPlatformOwner && options.timeout_ms ? options.timeout_ms : defaultTimeout,
    // Pass tenant and user info as metadata for global oversight, filtering, and billing/tracking.
    metadata: {
      tenantId,
      userId,
    },
    // Allow platform owner to specify other advanced options not available to tenants.
    ...(isPlatformOwner && options.advanced ? options.advanced : {}),
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
 * Retrieves information about a specific Cyberdesk virtual desktop.
 * Enforces tenant isolation but allows Platform Owners to view any desktop.
 * @async
 * @param {PlatformContext} context - The request context for logging and authorization checks.
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

  // Authorization check: Ensure the desktop belongs to the tenant, unless the user is a Platform Owner.
  const desktopTenantId = result?.data?.metadata?.tenantId;
  if (!context.isPlatformOwner && desktopTenantId !== context.tenantId) {
    log('WARNING', 'Access denied to desktop belonging to another tenant', context, { desktopId, desktopTenantId });
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied. You do not have permission to view this desktop.');
  }

  return result;
};

/**
 * Performs a mouse click action within a specified Cyberdesk virtual desktop.
 * Platform Owners can perform this action on any desktop.
 * @async
 * @param {PlatformContext} context - The request context for logging and authorization.
 * @param {string} desktopId - The unique identifier of the desktop.
 * @param {number} x - The X-coordinate for the mouse click.
 * @param {number} y - The Y-coordinate for the mouse click.
 * @returns {Promise<object>} A promise that resolves with the result of the action.
 * @throws {ApiError} If the API returns an error or the user is not authorized.
 */
const clickMouse = async (context, desktopId, x, y) => {
  // This call implicitly handles authorization (tenant isolation vs. platform owner) and existence check.
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
 * Executes a bash command within a specified Cyberdesk virtual desktop.
 * Platform Owners can perform this action on any desktop.
 * @async
 * @param {PlatformContext} context - The request context for logging and authorization.
 * @param {string} desktopId - The unique identifier of the desktop.
 * @param {string} command - The bash command string to execute.
 * @returns {Promise<object>} A promise that resolves with the command execution result.
 * @throws {ApiError} If the API returns an error or the user is not authorized.
 */
const executeBash = async (context, desktopId, command) => {
  // This call implicitly handles authorization (tenant isolation vs. platform owner) and existence check.
  await getDesktopInfo(context, desktopId);

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
 * Platform Owners can perform this action on any desktop.
 * @async
 * @param {PlatformContext} context - The request context for logging and authorization.
 * @param {string} desktopId - The unique identifier of the desktop to terminate.
 * @returns {Promise<object>} A promise that resolves with the termination operation result.
 * @throws {ApiError} If the API returns an error or the user is not authorized.
 */
const terminateDesktop = async (context, desktopId) => {
  // This call implicitly handles authorization (tenant isolation vs. platform owner) and existence check.
  await getDesktopInfo(context, desktopId);

  log('INFO', 'Terminating Cyberdesk desktop', context, { desktopId });
  const result = await getCyberdeskClient().terminateDesktop({ path: { id: desktopId } });
  if ('error' in result) {
    log('ERROR', 'Cyberdesk desktop termination failed', context, { desktopId, error: result.error });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, result.error.message || 'Cyberdesk Termination Error');
  }
  return result;
};

/**
 * @namespace cyberdeskService
 * @description Provides a collection of functions for interacting with the Cyberdesk API,
 * including standard user operations and enhanced features for Platform Owners.
 */
export const cyberdeskService = {
  // Platform Owner Features (Oversight)
  listAllDesktops,
  listTenants,
  getGlobalStats,
  getGlobalLogs,
  // Platform Owner Features (Configuration)
  getPlatformConfig,
  updatePlatformConfig,
  // Platform Owner Features (Tenant Management)
  setTenantSuspensionStatus,
  terminateAllDesktopsForTenant,
  // Standard Features (with Platform Owner overrides)
  launchDesktop,
  getDesktopInfo,
  clickMouse,
  executeBash,
  terminateDesktop,
};