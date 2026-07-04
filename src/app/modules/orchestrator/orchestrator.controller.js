import httpStatus from 'http-status';
import { logger } from '../../../shared/logger.js'; // Import the pre-configured Winston logger for structured logging.
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { orchestratorService } from './orchestrator.service.js';
// Assume a service exists for platform administration tasks.
// This service would handle the business logic for managing tenants, configs, etc.
import { platformAdminService } from './platformAdmin.service.js';

// ===================================================================================
// == Standard User-Facing Endpoints
// ===================================================================================

const routePrompt = catchAsync(async (req, res) => {
  const { message, prompt, sessionId, conversationId, category, stream } = req.body;
  const userPrompt = message || prompt;
  // Safely access user ID from the authenticated user object, using optional chaining.
  const userId = req.user?.id || req.user?._id || req.user?.userId;
  // Platform Owner check: Allow Platform Owner to impersonate a user for testing/debugging.
  // The actual user ID to be acted upon would be passed in the request body.
  const effectiveUserId = req.user?.role === 'PLATFORM_OWNER' && req.body.impersonatedUserId ? req.body.impersonatedUserId : userId;

  logger.info('Orchestrator routePrompt request received', {
    severity: 'INFO',
    userId,
    effectiveUserId,
    sessionId,
    conversationId,
    category,
    promptLength: userPrompt?.length || 0,
    isImpersonating: !!(req.user?.role === 'PLATFORM_OWNER' && req.body.impersonatedUserId),
    stream: !!stream,
  });

  if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
    logger.warn('Validation failed: Prompt message is required and cannot be empty.', {
      severity: 'WARNING',
      userId,
      sessionId,
      conversationId,
      validationError: 'empty_prompt',
    });
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Prompt message is required and cannot be empty.',
    });
  }

  if (!effectiveUserId) {
    logger.warn('Validation failed: Effective User ID is missing from request.', {
      severity: 'WARNING',
      sessionId,
      conversationId,
      validationError: 'missing_user_id',
    });
    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message: 'User ID is missing or invalid. Authentication required.',
    });
  }

  const tenantId = req.headers?.['x-tenant-id'] || req.headers?.['x-workspace-id'] || req.query?.tenantId || req.query?.workspaceId;

  if (stream === true || stream === 'true') {
    return orchestratorService.classifyAndDispatchStream(
      userPrompt,
      sessionId,
      effectiveUserId,
      conversationId,
      tenantId,
      category,
      req,
      res
    );
  }

  const result = await orchestratorService.classifyAndDispatch(userPrompt, sessionId, effectiveUserId, conversationId, tenantId, category, req);

  logger.info('Prompt successfully routed and processed', {
    severity: 'INFO',
    userId,
    effectiveUserId,
    sessionId,
    conversationId,
    resultType: result?.type,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Prompt successfully routed and processed.',
    data: result,
  });
});

// ===================================================================================
// == Platform Owner / Super Admin Endpoints
// == NOTE: All routes using these controllers MUST be protected by an authorization
// == middleware that verifies req.user.role === 'PLATFORM_OWNER'.
// ===================================================================================

/**
 * @description Get global, platform-wide statistics for oversight.
 * @access PLATFORM_OWNER
 */
const getGlobalStatistics = catchAsync(async (req, res) => {
  const adminId = req.user?.id;
  // Allow filtering statistics by a date range for more granular insights.
  const { from, to } = req.query;
  const options = { from, to };

  logger.info('Platform Owner requested global statistics', {
    severity: 'NOTICE',
    adminId,
    options,
  });

  const stats = await platformAdminService.getGlobalStatistics(options);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Global statistics retrieved successfully.',
    data: stats,
  });
});

/**
 * @description Manually provision a new tenant on the platform.
 * @access PLATFORM_OWNER
 */
const createTenant = catchAsync(async (req, res) => {
  const adminId = req.user?.id;
  const tenantData = req.body; // e.g., { name: 'New Corp', plan: 'enterprise', adminEmail: 'admin@newcorp.com' }

  // Basic validation for required fields.
  if (!tenantData.name || !tenantData.adminEmail) {
    logger.warn('Invalid request to create tenant', {
      severity: 'WARNING',
      adminId,
      tenantData,
      reason: 'Missing required fields (name, adminEmail)',
    });
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Tenant name and adminEmail are required.',
    });
  }

  logger.info('Platform Owner is creating a new tenant', {
    severity: 'NOTICE',
    adminId,
    tenantData,
  });

  const newTenant = await platformAdminService.createTenant(tenantData, adminId);

  sendResponse(res, {
    statusCode: httpStatus.CREATED, // Use 201 Created for new resources.
    success: true,
    message: 'Tenant created successfully.',
    data: newTenant,
  });
});

/**
 * @description Get a list of all tenants on the platform with filtering and pagination.
 * @access PLATFORM_OWNER
 */
const getAllTenants = catchAsync(async (req, res) => {
  const adminId = req.user?.id;
  // Add pagination, filtering, and searching from query params for scalability.
  const { page = 1, limit = 20, status, sortBy, search } = req.query;
  const options = {
    page: parseInt(page, 10), // Ensure numeric types for pagination.
    limit: parseInt(limit, 10),
    status,
    sortBy,
    search,
  };

  logger.info('Platform Owner requested list of all tenants', {
    severity: 'NOTICE',
    adminId,
    options,
  });

  const tenants = await platformAdminService.getAllTenants(options);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All tenants retrieved successfully.',
    data: tenants,
  });
});

/**
 * @description Get detailed information for a single tenant by their ID.
 * @access PLATFORM_OWNER
 */
const getTenantById = catchAsync(async (req, res) => {
  const adminId = req.user?.id;
  const { tenantId } = req.params;

  logger.info('Platform Owner requested details for a single tenant', {
    severity: 'NOTICE',
    adminId,
    tenantId,
  });

  const tenant = await platformAdminService.getTenantById(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant details retrieved successfully.',
    data: tenant,
  });
});

/**
 * @description Suspend or unsuspend a tenant.
 * @access PLATFORM_OWNER
 */
const updateTenantStatus = catchAsync(async (req, res) => {
  const adminId = req.user?.id;
  const { tenantId } = req.params;
  const { status, reason } = req.body; // Expecting status: 'active' or 'suspended'

  if (!tenantId || !status || !['active', 'suspended'].includes(status)) {
    logger.warn('Invalid request to update tenant status', {
      severity: 'WARNING',
      adminId,
      tenantId,
      status,
      reason: 'Missing or invalid parameters',
    });
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Tenant ID and a valid status ("active" or "suspended") are required.',
    });
  }

  logger.info(`Platform Owner is updating tenant status`, {
    severity: 'NOTICE',
    adminId,
    tenantId,
    newStatus: status,
    reason, // Capturing the reason is crucial for audit trails.
  });

  const updatedTenant = await platformAdminService.updateTenantStatus(tenantId, status, reason, adminId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Tenant ${tenantId} has been successfully ${status}.`,
    data: updatedTenant,
  });
});

/**
 * @description Override limits or configuration for a specific tenant.
 * @access PLATFORM_OWNER
 */
const overrideTenantLimits = catchAsync(async (req, res) => {
  const adminId = req.user?.id;
  const { tenantId } = req.params;
  const newLimits = req.body; // e.g., { maxUsers: 1000, monthlyTokenLimit: 50000000, features: { customModels: true } }

  logger.info('Platform Owner is overriding tenant limits', {
    severity: 'NOTICE',
    adminId,
    tenantId,
    newLimits,
  });

  const updatedTenant = await platformAdminService.overrideTenantLimits(tenantId, newLimits, adminId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Successfully updated limits for tenant ${tenantId}.`,
    data: updatedTenant,
  });
});

/**
 * @description Delete a tenant from the platform.
 * @access PLATFORM_OWNER
 * @note This is a destructive action. The service layer should handle soft vs. hard delete logic.
 */
const deleteTenant = catchAsync(async (req, res) => {
  const adminId = req.user?.id;
  const { tenantId } = req.params;

  logger.warn('Platform Owner is deleting a tenant. This is a high-impact action.', {
    severity: 'WARNING',
    adminId,
    tenantId,
  });

  await platformAdminService.deleteTenant(tenantId, adminId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Tenant ${tenantId} has been successfully deleted.`,
    data: null,
  });
});

/**
 * @description Get the current system-wide configuration.
 * @access PLATFORM_OWNER
 */
const getSystemConfiguration = catchAsync(async (req, res) => {
  const adminId = req.user?.id;
  logger.info('Platform Owner requested system configuration', {
    severity: 'NOTICE',
    adminId,
  });

  const config = await platformAdminService.getSystemConfiguration();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'System configuration retrieved successfully.',
    data: config,
  });
});

/**
 * @description Update the system-wide configuration.
 * @access PLATFORM_OWNER
 */
const updateSystemConfiguration = catchAsync(async (req, res) => {
  const adminId = req.user?.id;
  const configUpdates = req.body;

  logger.warn('Platform Owner is updating system-wide configuration. This is a high-impact action.', {
    severity: 'WARNING', // Use a higher severity for critical changes
    adminId,
    configUpdates,
  });

  const updatedConfig = await platformAdminService.updateSystemConfiguration(configUpdates, adminId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'System configuration updated successfully.',
    data: updatedConfig,
  });
});

/**
 * @description Query global system logs with advanced filtering, sorting, and pagination.
 * @access PLATFORM_OWNER
 */
const queryGlobalLogs = catchAsync(async (req, res) => {
  const adminId = req.user?.id;
  // Enhanced filtering, pagination, and sorting options from query params.
  const {
    level,
    service,
    userId,
    tenantId,
    startTime,
    endTime,
    page = 1,
    limit = 100,
    sortBy = 'timestamp',
    sortOrder = 'desc',
    search, // Add a free-text search capability.
  } = req.query;
  const filter = {
    level,
    service,
    userId,
    tenantId,
    startTime,
    endTime,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sortBy,
    sortOrder,
    search,
  };

  logger.info('Platform Owner is querying global logs', {
    severity: 'NOTICE',
    adminId,
    filter,
  });

  // In a real application, this service would interact with your logging provider's API
  // (e.g., GCP Logging, Datadog, ELK) to fetch structured logs.
  const logs = await platformAdminService.queryLogs(filter);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Logs retrieved successfully.',
    data: logs,
  });
});

export const orchestratorController = {
  // User-facing
  routePrompt,
  // Platform Owner / Super Admin
  getGlobalStatistics,
  createTenant,
  getAllTenants,
  getTenantById,
  updateTenantStatus,
  overrideTenantLimits,
  deleteTenant,
  getSystemConfiguration,
  updateSystemConfiguration,
  queryGlobalLogs,
};