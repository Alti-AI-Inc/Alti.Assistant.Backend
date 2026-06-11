import Tenant from '../tenant/tenant.model.js';
import PlatformConfig from '../platform/platformConfig.model.js';

/**
 * @fileoverview Service for platform-wide administrative operations.
 * All functions in this service are intended for users with the 'Platform Administrator' role.
 * These operations affect the entire platform and are not tenant-specific.
 * @module services/platformAdminService
 */

/**
 * Retrieves global statistics for the entire platform.
 * This includes metrics like the total number of tenants and overall system health.
 *
 * @permission Requires `Platform Administrator` role.
 * @async
 * @function getGlobalStatistics
 * @returns {Promise<{totalTenants: number, systemHealth: string}>} An object containing platform-wide statistics.
 */
const getGlobalStatistics = async () => {
  const totalTenants = await Tenant.countDocuments();
  return {
    totalTenants,
    systemHealth: 'OK',
  };
};

/**
 * Retrieves a list of all tenants on the platform, with support for pagination, filtering, and sorting.
 *
 * @permission Requires `Platform Administrator` role.
 * @async
 * @function getAllTenants
 * @param {object} [options={}] - The query options.
 * @param {number} [options.page=1] - The page number for pagination.
 * @param {number} [options.limit=20] - The number of tenants per page.
 * @param {string} [options.status] - Filter tenants by their status (e.g., 'active', 'suspended').
 * @param {string} [options.sortBy] - The field to sort by (e.g., 'createdAt:desc').
 * @returns {Promise<Array<Tenant>>} A promise that resolves to an array of tenant documents (as plain objects).
 */
const getAllTenants = async (options = {}) => {
  const filter = {};
  if (options.status) {
    filter.status = options.status;
  }
  const query = Tenant.find(filter);
  if (options.sortBy) {
    query.sort(options.sortBy);
  }
  const page = parseInt(options.page, 10) || 1;
  const limit = parseInt(options.limit, 10) || 20;
  query.skip((page - 1) * limit).limit(limit);
  return query.lean();
};

/**
 * Updates the status of a specific tenant (e.g., to 'active' or 'suspended').
 * Records the reason for the status change and the administrator who performed the action.
 *
 * @permission Requires `Platform Administrator` role.
 * @async
 * @function updateTenantStatus
 * @param {string} tenantId - The ID of the tenant to update.
 * @param {string} status - The new status for the tenant.
 * @param {string} reason - The reason for the status change.
 * @param {string} adminId - The ID of the administrator performing the update.
 * @returns {Promise<Tenant|null>} A promise that resolves to the updated tenant document (as a plain object), or null if not found.
 */
const updateTenantStatus = async (tenantId, status, reason, adminId) => {
  return Tenant.findByIdAndUpdate(
    tenantId,
    { status, suspensionReason: reason, statusUpdatedBy: adminId },
    { new: true }
  ).lean();
};

/**
 * Overrides the resource limits for a specific tenant.
 * This allows administrators to grant custom limits to a tenant, different from the default plan.
 *
 * @permission Requires `Platform Administrator` role.
 * @async
 * @function overrideTenantLimits
 * @param {string} tenantId - The ID of the tenant whose limits are to be overridden.
 * @param {object} newLimits - An object containing the new limit values.
 * @param {string} adminId - The ID of the administrator performing the override.
 * @returns {Promise<Tenant|null>} A promise that resolves to the updated tenant document (as a plain object), or null if not found.
 */
const overrideTenantLimits = async (tenantId, newLimits, adminId) => {
  return Tenant.findByIdAndUpdate(
    tenantId,
    { limits: newLimits, limitsUpdatedBy: adminId },
    { new: true }
  ).lean();
};

/**
 * Retrieves the global system configuration settings.
 * If no configuration exists, it creates and returns a default configuration.
 *
 * @permission Requires `Platform Administrator` role.
 * @async
 * @function getSystemConfiguration
 * @returns {Promise<PlatformConfig>} A promise that resolves to the system configuration document (as a plain object).
 */
const getSystemConfiguration = async () => {
  let config = await PlatformConfig.findOne({}).lean();
  if (!config) {
    config = await PlatformConfig.create({});
  }
  return config;
};

/**
 * Updates the global system configuration settings.
 * This uses an upsert operation to create the configuration if it doesn't exist.
 *
 * @permission Requires `Platform Administrator` role.
 * @async
 * @function updateSystemConfiguration
 * @param {object} configUpdates - An object containing the configuration fields to update.
 * @param {string} adminId - The ID of the administrator performing the update.
 * @returns {Promise<PlatformConfig>} A promise that resolves to the updated system configuration document (as a plain object).
 */
const updateSystemConfiguration = async (configUpdates, adminId) => {
  return PlatformConfig.findOneAndUpdate(
    {},
    { ...configUpdates, configUpdatedBy: adminId },
    { new: true, upsert: true }
  ).lean();
};

/**
 * Queries system-wide logs based on a given filter.
 * Note: This is a stub implementation. In a production environment, this would
 * integrate with a dedicated logging service (e.g., GCP Logging, Datadog, ELK stack).
 *
 * @permission Requires `Platform Administrator` role.
 * @async
 * @function queryLogs
 * @param {object} [filter={}] - The filter criteria for the log query.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of log entries. Currently returns an empty array.
 */
const queryLogs = async (filter = {}) => {
  // Stub implementation for logs query, returning empty array.
  // In a real environment, this would integrate with a logging provider like GCP Logging or Datadog.
  return [];
};

/**
 * A collection of service functions for platform administration.
 * These functions provide the business logic for managing the entire platform,
 * including tenants, configuration, and monitoring.
 * @type {{
 *   getGlobalStatistics: () => Promise<{totalTenants: number, systemHealth: string}>,
 *   getAllTenants: (options?: {page?: number, limit?: number, status?: string, sortBy?: string}) => Promise<Array<Tenant>>,
 *   updateTenantStatus: (tenantId: string, status: string, reason: string, adminId: string) => Promise<Tenant|null>,
 *   overrideTenantLimits: (tenantId: string, newLimits: object, adminId: string) => Promise<Tenant|null>,
 *   getSystemConfiguration: () => Promise<PlatformConfig>,
 *   updateSystemConfiguration: (configUpdates: object, adminId: string) => Promise<PlatformConfig>,
 *   queryLogs: (filter?: object) => Promise<Array<object>>
 * }}
 */
export const platformAdminService = {
  getGlobalStatistics,
  getAllTenants,
  updateTenantStatus,
  overrideTenantLimits,
  getSystemConfiguration,
  updateSystemConfiguration,
  queryLogs,
};