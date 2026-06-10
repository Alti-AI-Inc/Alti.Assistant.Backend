import Tenant from '../tenant/tenant.model.js';
import PlatformConfig from '../platform/platformConfig.model.js';

/**
 * Get global statistics for the platform.
 * @returns {Promise<{totalTenants: number, systemHealth: string}>}
 */
const getGlobalStatistics = async () => {
  const totalTenants = await Tenant.countDocuments();
  return {
    totalTenants,
    systemHealth: 'OK',
  };
};

/**
 * Retrieve all tenants with optional pagination and filters.
 * @param {object} options
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20]
 * @param {string} [options.status]
 * @param {string} [options.sortBy]
 * @returns {Promise<Array>}
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
 * Update the status of a specific tenant.
 * @param {string} tenantId
 * @param {string} status
 * @param {string} reason
 * @param {string} adminId
 * @returns {Promise<object|null>}
 */
const updateTenantStatus = async (tenantId, status, reason, adminId) => {
  return Tenant.findByIdAndUpdate(
    tenantId,
    { status, suspensionReason: reason, statusUpdatedBy: adminId },
    { new: true }
  ).lean();
};

/**
 * Override limits for a specific tenant.
 * @param {string} tenantId
 * @param {object} newLimits
 * @param {string} adminId
 * @returns {Promise<object|null>}
 */
const overrideTenantLimits = async (tenantId, newLimits, adminId) => {
  return Tenant.findByIdAndUpdate(
    tenantId,
    { limits: newLimits, limitsUpdatedBy: adminId },
    { new: true }
  ).lean();
};

/**
 * Get system configuration settings.
 * @returns {Promise<object>}
 */
const getSystemConfiguration = async () => {
  let config = await PlatformConfig.findOne({}).lean();
  if (!config) {
    config = await PlatformConfig.create({});
  }
  return config;
};

/**
 * Update system configuration settings.
 * @param {object} configUpdates
 * @param {string} adminId
 * @returns {Promise<object>}
 */
const updateSystemConfiguration = async (configUpdates, adminId) => {
  return PlatformConfig.findOneAndUpdate(
    {},
    { ...configUpdates, configUpdatedBy: adminId },
    { new: true, upsert: true }
  ).lean();
};

/**
 * Query system-wide logs.
 * @param {object} filter
 * @returns {Promise<Array>}
 */
const queryLogs = async (filter = {}) => {
  // Stub implementation for logs query, returning empty array.
  // In a real environment, this would integrate with a logging provider like GCP Logging or Datadog.
  return [];
};

export const platformAdminService = {
  getGlobalStatistics,
  getAllTenants,
  updateTenantStatus,
  overrideTenantLimits,
  getSystemConfiguration,
  updateSystemConfiguration,
  queryLogs,
};
