import httpStatus from 'http-status';
import { logger } from '../../../shared/logger.js'; // GCP-compatible structured JSON logger
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import Tenant from '../tenant/tenant.model.js';
import PlatformConfig from '../platform/platformConfig.model.js';

/**
 * @openapi
 * /platform/tenants:
 *   get:
 *     summary: Get all tenants
 *     description: Retrieves a list of all tenants in the system. Requires SuperAdmin role.
 *     tags:
 *       - Platform
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of all tenants.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Tenant'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
const getAllTenants = catchAsync(async (req, res) => {
  // NOTE: This query is already optimized with .lean(). For very large tenant counts,
  // consider implementing pagination (e.g., using query parameters for limit and page)
  // and sorting to avoid sending a massive payload and to make the query more efficient.
  const result = await Tenant.find({}).lean();

  // GCP Logging: Log the administrative action for audit purposes.
  // The log is an object, which will be serialized into structured JSON by the logger.
  // The `logger.info` method will automatically assign severity: 'INFO'.
  logger.info({
    message: `SuperAdmin retrieved all tenants`,
    actor: req.user.id, // Assuming user ID is available on the request object
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenants retrieved successfully',
    data: result,
  });
});

/**
 * @openapi
 * /platform/tenants/{id}/suspend:
 *   patch:
 *     summary: Suspend a tenant
 *     description: Marks a specific tenant's status as 'suspended'. Requires SuperAdmin role.
 *     tags:
 *       - Platform
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tenant to suspend.
 *     responses:
 *       200:
 *         description: The tenant was suspended successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Tenant'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Tenant not found.
 */
const suspendTenant = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await Tenant.findByIdAndUpdate(
    id,
    { status: 'suspended' },
    { new: true }
  ).lean();

  // GCP Logging: Log the administrative action with WARNING severity due to its impact.
  // The `logger.warn` method will automatically assign severity: 'WARNING'.
  logger.warn({
    message: `SuperAdmin suspended tenant`,
    actor: req.user.id,
    tenantId: id,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant suspended successfully',
    data: result,
  });
});

/**
 * @openapi
 * /platform/tenants/{id}/unsuspend:
 *   patch:
 *     summary: Unsuspend a tenant
 *     description: Marks a specific tenant's status as 'active'. Requires SuperAdmin role.
 *     tags:
 *       - Platform
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tenant to unsuspend.
 *     responses:
 *       200:
 *         description: The tenant was unsuspended successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Tenant'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Tenant not found.
 */
const unsuspendTenant = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await Tenant.findByIdAndUpdate(
    id,
    { status: 'active' },
    { new: true }
  ).lean();

  // GCP Logging: Log the administrative action.
  logger.info({
    message: `SuperAdmin unsuspended tenant`,
    actor: req.user.id,
    tenantId: id,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant unsuspended successfully',
    data: result,
  });
});

/**
 * @openapi
 * /platform/tenants/{id}/limits:
 *   patch:
 *     summary: Override tenant limits
 *     description: Updates the usage limits for a specific tenant. Requires SuperAdmin role.
 *     tags:
 *       - Platform
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tenant whose limits are to be updated.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TenantLimits'
 *     responses:
 *       200:
 *         description: The tenant limits were updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Tenant'
 *       400:
 *         description: Bad request (invalid update data).
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Tenant not found.
 */
const overrideTenantLimits = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const result = await Tenant.findByIdAndUpdate(
    id,
    { limits: updateData },
    { new: true }
  ).lean();

  // GCP Logging: Log the administrative action with WARNING severity due to its impact.
  logger.warn({
    message: `SuperAdmin overrode tenant limits`,
    actor: req.user.id,
    tenantId: id,
    newLimits: updateData,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant limits updated successfully',
    data: result,
  });
});

/**
 * @openapi
 * /platform/config:
 *   get:
 *     summary: Get system configuration
 *     description: Retrieves the global platform configuration. If no configuration exists, a default one is created. Requires SuperAdmin role.
 *     tags:
 *       - Platform
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The system configuration.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/PlatformConfig'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
const getSystemConfig = catchAsync(async (req, res) => {
  // OPTIMIZATION: Use a single atomic `findOneAndUpdate` with `upsert` and `$setOnInsert`.
  // This avoids a potential second database call if the config doesn't exist
  // and is more robust than a separate find and create.
  // `setDefaultsOnInsert: true` ensures schema defaults are applied on creation.
  const result = await PlatformConfig.findOneAndUpdate(
    {},
    { $setOnInsert: {} },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  // GCP Logging: Log the administrative action.
  logger.info({
    message: 'SuperAdmin retrieved system configuration',
    actor: req.user.id,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'System configuration retrieved successfully',
    data: result,
  });
});

/**
 * @openapi
 * /platform/config:
 *   patch:
 *     summary: Update system configuration
 *     description: Updates the global platform configuration. Creates one if it doesn't exist. Requires SuperAdmin role.
 *     tags:
 *       - Platform
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PlatformConfig'
 *     responses:
 *       200:
 *         description: The system configuration was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/PlatformConfig'
 *       400:
 *         description: Bad request (invalid configuration data).
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
const updateSystemConfig = catchAsync(async (req, res) => {
  const newConfig = req.body;
  const result = await PlatformConfig.findOneAndUpdate({}, newConfig, {
    new: true,
    upsert: true,
  }).lean();

  // GCP Logging: Log the critical administrative action with WARNING severity.
  logger.warn({
    message: 'SuperAdmin updated system configuration',
    actor: req.user.id,
    newConfig,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'System configuration updated successfully',
    data: result,
  });
});

/**
 * @openapi
 * /platform/logs:
 *   get:
 *     summary: Get global logs
 *     description: Retrieves global system-level logs. **Note: This is currently a placeholder and returns an empty array.** Requires SuperAdmin role.
 *     tags:
 *       - Platform
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of global logs (currently empty).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items: {}
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
const getGlobalLogs = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Logs retrieved successfully',
    data: [],
  });
});

/**
 * @openapi
 * /platform/stats:
 *   get:
 *     summary: Get global statistics
 *     description: Retrieves high-level statistics about the platform, such as total number of tenants and system health. Requires SuperAdmin role.
 *     tags:
 *       - Platform
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: An object containing global statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalTenants:
 *                       type: integer
 *                     systemHealth:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
const getGlobalStats = catchAsync(async (req, res) => {
  // OPTIMIZATION: Use `estimatedDocumentCount` instead of `countDocuments`.
  // For counting all documents in a collection, `estimatedDocumentCount` is significantly faster
  // as it uses collection metadata rather than performing a full collection scan.
  // The result is an approximation but is perfectly suitable for a high-level statistics dashboard.
  const totalTenants = await Tenant.estimatedDocumentCount();

  // GCP Logging: Log the administrative action.
  logger.info({
    message: 'SuperAdmin retrieved global statistics',
    actor: req.user.id,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Global statistics retrieved successfully',
    data: {
      totalTenants,
      systemHealth: 'OK',
    },
  });
});

/**
 * A collection of controller functions for platform-level management.
 * These endpoints are intended for SuperAdmin users to manage the entire platform,
 * including tenants and system-wide configurations.
 * @namespace PlatformController
 */
export const PlatformController = {
  getAllTenants,
  suspendTenant,
  unsuspendTenant,
  overrideTenantLimits,
  getSystemConfig,
  updateSystemConfig,
  getGlobalLogs,
  getGlobalStats,
};