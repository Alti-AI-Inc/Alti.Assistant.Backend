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

/**
 * Centralized logger for consistent, structured logging.
 * @param {'INFO' | 'WARN' | 'ERROR'} severity - The log level.
 * @param {string} message - The log message.
 * @param {PlatformContext} context - The context of the request (tenant, user).
 * @param {object} [details={}] - Additional details to include in the log.
 */
const log = (severity, message, context, details = {}) => {
  const logEntry = {
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
  // In a real application, this would use a proper logger like Winston
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
    log('WARN', 'Platform Owner is re-initializing the Cyberdesk client singleton.', { isPlatformOwnerAction: true });
    initialize(newApiKey);
  };

  return getInstance;
})();

// --- Platform Owner / Admin Functions ---

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
 * [Platform Owner] Terminates all running desktops for a specific tenant.
 * This is a critical function for tenant suspension.
 * @async
 * @param {PlatformContext} context - The request context. Must have `isPlatformOwner: true`.
 * @param {string} tenantIdToSuspend - The ID of the tenant whose desktops will be terminated.
 * @returns {Promise<object>} A promise that resolves with a summary of the termination operations.
 * @throws {ApiError} If the user is not a Platform Owner or if the operation fails.
 */
const terminateAllDesktopsForTenant = async (context, tenantIdToSuspend) => {
  if (!context?.isPlatformOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Platform Owner privileges.');
  }
  if (!tenantIdToSuspend) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant ID is required for this operation.');
  }

  log('WARN', 'Platform Owner: Initiating termination of all desktops for a tenant', context, { tenantIdToSuspend });

  // Step 1: List all desktops for the specified tenant using metadata filter.
  const listResult = await listAllDesktops(context, { 'metadata.tenantId': tenantIdToSuspend });
  const desktopsToTerminate = listResult.data;

  if (!desktopsToTerminate || desktopsToTerminate.length === 0) {
    log('INFO', `Platform Owner: No active desktops found for tenant ${tenantIdToSuspend}.`, context);
    return { success: true, message: 'No active desktops found for the specified tenant.', terminatedCount: 0 };
  }

  // Step 2: Terminate each desktop in parallel.
  const terminationPromises = desktopsToTerminate.map(desktop =>
    terminateDesktop(context, desktop.id)
  );
  const results = await Promise.allSettled(terminationPromises);

  const successfulTerminations = results.filter(r => r.status === 'fulfilled').length;
  const failedTerminations = results.length - successfulTerminations;

  log('INFO', `Platform Owner: Termination process completed for tenant ${tenantIdToSuspend}.`, context, {
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

/**
 * [Platform Owner] Updates system-wide Cyberdesk configuration, such as the API key.
 * @async
 * @param {PlatformContext} context - The request context. Must have `isPlatformOwner: true`.
 * @param {object} newCyberdeskConfig - The new configuration object. e.g., { apiKey: '...', defaultTimeout: 900000 }
 * @returns {Promise<object>} A promise that resolves with a success message.
 * @throws {ApiError} If the user is not a Platform Owner.
 */
const updatePlatformConfig = async (context, newCyberdeskConfig) => {
  if (!context?.isPlatformOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: This action requires Platform Owner privileges.');
  }

  log('WARN', 'Platform Owner: Updating platform-wide Cyberdesk configuration', context, { newCyberdeskConfig });

  if (newCyberdeskConfig.apiKey) {
    getCyberdeskClient.reinitialize(newCyberdeskConfig.apiKey);
    log('INFO', 'Platform Owner: Cyberdesk client re-initialized with new API key.', context);
  }

  // In a real system, other config values would be persisted to a database or config store.
  // For example: config.cyberdesk_default_timeout_ms = newCyberdeskConfig.defaultTimeout;

  return { success: true, message: 'Platform configuration updated successfully.' };
};


// --- Core Service Functions ---

/**
 * Launches a new Cyberdesk virtual desktop instance, with context and overrides for Platform Owners.
 * @async
 * @param {PlatformContext} context - The request context, containing tenant and user info.
 * @param {object} [options={}] - Optional parameters for launching. Platform Owners can use this to override defaults.
 * @returns {Promise<object>} A promise that resolves with the result of the desktop launch operation.
 * @throws {ApiError} If the Cyberdesk API returns an error during the launch process.
 */
const launchDesktop = async (context, options = {}) => {
  const { tenantId, userId, isPlatformOwner } = context;

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
 * @async
 * @param {PlatformContext} context - The request context for logging and authorization checks.
 * @param {string} desktopId - The unique identifier of the desktop.
 * @returns {Promise<object>} A promise that resolves with the desktop's information.
 * @throws {ApiError} If the desktop is not found or an API error occurs.
 */
const getDesktopInfo = async (context, desktopId) => {
  log('INFO', 'Fetching Cyberdesk desktop info', context, { desktopId });
  const result = await getCyberdeskClient().getDesktop({ path: { id: desktopId } });
  if ('error' in result) {
    log('ERROR', 'Failed to fetch Cyberdesk desktop info', context, { desktopId, error: result.error });
    throw new ApiError(httpStatus.NOT_FOUND, result.error.message || 'Desktop not found');
  }
  return result;
};

/**
 * Performs a mouse click action within a specified Cyberdesk virtual desktop.
 * @async
 * @param {PlatformContext} context - The request context for logging.
 * @param {string} desktopId - The unique identifier of the desktop.
 * @param {number} x - The X-coordinate for the mouse click.
 * @param {number} y - The Y-coordinate for the mouse click.
 * @returns {Promise<object>} A promise that resolves with the result of the action.
 * @throws {ApiError} If the API returns an error.
 */
const clickMouse = async (context, desktopId, x, y) => {
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
 * @async
 * @param {PlatformContext} context - The request context for logging.
 * @param {string} desktopId - The unique identifier of the desktop.
 * @param {string} command - The bash command string to execute.
 * @returns {Promise<object>} A promise that resolves with the command execution result.
 * @throws {ApiError} If the API returns an error.
 */
const executeBash = async (context, desktopId, command) => {
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
 * @param {PlatformContext} context - The request context for logging.
 * @param {string} desktopId - The unique identifier of the desktop to terminate.
 * @returns {Promise<object>} A promise that resolves with the termination operation result.
 * @throws {ApiError} If the API returns an error.
 */
const terminateDesktop = async (context, desktopId) => {
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
  // Platform Owner Features
  listAllDesktops,
  getGlobalStats,
  terminateAllDesktopsForTenant,
  updatePlatformConfig,
  // Standard Features
  launchDesktop,
  getDesktopInfo,
  clickMouse,
  executeBash,
  terminateDesktop,
};