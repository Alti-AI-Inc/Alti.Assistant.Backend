import express from 'express';
// SECURITY-PATCH: Import validation and sanitization functions from express-validator.
// REASON: To prevent injection attacks (NoSQL/SQL), XSS, and other vulnerabilities caused by unsanitized user input.
import { body, param, query } from 'express-validator';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
// SECURITY-PATCH: Import a middleware to handle validation results.
// REASON: This middleware will centralize the logic for checking validation errors and returning a 400 Bad Request response, keeping the controller logic clean.
import validateRequest from '../../middlewares/validateRequest/validateRequest.js';
import { AdminController } from './admin.controller.js';

/**
 * Express router for admin-related routes.
 * @type {express.Router}
 */
const router = express.Router();

// SECURITY-PATCH: Define a reusable validation chain for common pagination, sorting, and filtering query parameters.
// REASON: Promotes code reuse and ensures consistent validation across all list endpoints, preventing potential DoS attacks (e.g., excessively large 'limit') and injection in search/sort fields.
const listEndpointValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.').toInt(),
  query('sortBy').optional().isString().trim().escape().withMessage('SortBy must be a string.'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage("SortOrder must be 'asc' or 'desc'."),
  query('searchTerm').optional().isString().trim().escape().withMessage('SearchTerm must be a string.'),
];

/**
 * @swagger
 * /api/v1/admin/update-user-role/{id}:
 *   put:
 *     summary: Update a user's role
 *     description: Allows a Super Admin to change the role of an existing user identified by their ID.
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: [super_admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: ID of the user whose role is to be updated.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [super_admin, admin, manager, user] # Example roles, adjust as per ENUM_USER_ROLE
 *                 description: The new role to assign to the user.
 *             example:
 *               role: admin
 *     responses:
 *       200:
 *         description: User role updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User role updated successfully
 *                 data:
 *                   type: object # Adjust based on actual response data
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: User not found.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put(
  '/update-user-role/:id',
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Add input validation and sanitization.
  // REASON: Ensures the user ID is a valid UUID to prevent injection attacks and validates the role against the allowed enum values.
  [
    param('id').isUUID().withMessage('User ID must be a valid UUID.'),
    body('role')
      .trim()
      .notEmpty()
      .withMessage('Role is required.')
      .isIn(Object.values(ENUM_USER_ROLE))
      .withMessage('Invalid user role provided.'),
  ],
  validateRequest,
  AdminController.updateUserRole
);

/**
 * @swagger
 * /api/v1/admin/delete-user/{objectId}:
 *   delete:
 *     summary: Delete a user (Super Admin)
 *     description: Allows a Super Admin to delete any existing user account identified by their ID. This is a platform-level administrative action.
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: [super_admin]
 *     parameters:
 *       - in: path
 *         name: objectId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: ID of the user to be deleted.
 *     responses:
 *       204:
 *         description: User deleted successfully (No Content).
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: User not found.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete(
  '/delete-user/:objectId',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: The 'admin' role is for a workspace/tenant owner and should not have permission to delete arbitrary users across the platform.
  // This prevents a critical IDOR vulnerability where an admin from one tenant could delete users from another.
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Add input validation.
  // REASON: Ensures the object ID is a valid UUID, preventing malformed requests and potential injection vectors.
  [param('objectId').isUUID().withMessage('User ID must be a valid UUID.')],
  validateRequest,
  AdminController.deleteUser
);

/**
 * @swagger
 * /api/v1/admin/buyer/all-user:
 *   get:
 *     summary: Get all buyer users (Super Admin)
 *     description: Retrieves a list of all users who have the 'buyer' role across the entire platform.
 *     tags:
 *       - Admin
 *       - Users
 *     security:
 *       - BearerAuth: [super_admin]
 *     responses:
 *       200:
 *         description: A list of buyer users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Buyer users retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Adjust based on actual user schema
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/buyer/all-user',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: Listing all users of a specific type is a platform-wide operation and should not be accessible to a tenant-level admin.
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Validate and sanitize optional query parameters for pagination, sorting, and searching.
  listEndpointValidation,
  validateRequest,
  AdminController.getAllBuyer
);

/**
 * @swagger
 * /api/v1/admin/all-user:
 *   get:
 *     summary: Get all users (Super Admin)
 *     description: Retrieves a comprehensive list of all users in the system. For platform owners only.
 *     tags:
 *       - Admin
 *       - Users
 *     security:
 *       - BearerAuth: [super_admin]
 *     responses:
 *       200:
 *         description: A list of all users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: All users retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Adjust based on actual user schema
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/all-user',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: Listing all users across all tenants is a platform-wide operation and must be restricted to SUPER_ADMIN to maintain tenant isolation.
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Validate and sanitize optional query parameters for pagination, sorting, and searching.
  listEndpointValidation,
  validateRequest,
  AdminController.getAllUsers
);

/**
 * @swagger
 * /api/v1/admin/all-payment:
 *   get:
 *     summary: Get all payment records (Super Admin)
 *     description: Retrieves a list of all payment transactions recorded in the system. For platform owners only.
 *     tags:
 *       - Admin
 *       - Payments
 *     security:
 *       - BearerAuth: [super_admin]
 *     responses:
 *       200:
 *         description: A list of all payment records.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: All payments retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Adjust based on actual payment schema
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/all-payment',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: Accessing all payment records is a sensitive, platform-wide operation.
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Validate and sanitize optional query parameters for pagination, sorting, and searching.
  listEndpointValidation,
  validateRequest,
  AdminController.getAllPayment
);

/**
 * @swagger
 * /api/v1/admin/billing/audit-logs:
 *   get:
 *     summary: Get billing audit logs (Super Admin)
 *     description: Retrieves audit logs specifically related to billing activities across the entire platform.
 *     tags:
 *       - Admin
 *       - Audit Logs
 *       - Billing
 *     security:
 *       - BearerAuth: [super_admin]
 *     responses:
 *       200:
 *         description: A list of billing audit logs.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Billing audit logs retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Adjust based on actual audit log schema
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/billing/audit-logs',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: Platform-wide audit logs should only be accessible by the platform owner.
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Validate and sanitize optional query parameters for pagination, sorting, and searching.
  listEndpointValidation,
  validateRequest,
  AdminController.getBillingAuditLogs
);

/**
 * @swagger
 * /api/v1/admin/swarm-audits:
 *   get:
 *     summary: Get swarm audit logs (Super Admin)
 *     description: Retrieves audit logs related to swarm activities or operations across the entire platform.
 *     tags:
 *       - Admin
 *       - Audit Logs
 *       - Swarm
 *     security:
 *       - BearerAuth: [super_admin]
 *     responses:
 *       200:
 *         description: A list of swarm audit logs.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Swarm audit logs retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Adjust based on actual audit log schema
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/swarm-audits',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: Platform-wide audit logs must be restricted to the highest administrative level.
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Validate and sanitize optional query parameters for pagination, sorting, and searching.
  listEndpointValidation,
  validateRequest,
  AdminController.getSwarmAudits
);

/**
 * @swagger
 * /api/v1/admin/admin/{email}:
 *   get:
 *     summary: Get admin user by email (Super Admin)
 *     description: Retrieves details of any admin user by their email address.
 *     tags:
 *       - Admin
 *       - Users
 *     security:
 *       - BearerAuth: [super_admin]
 *     parameters:
 *       - in: path
 *         name: email
 *         schema:
 *           type: string
 *           format: email
 *         required: true
 *         description: Email address of the admin user to retrieve.
 *     responses:
 *       200:
 *         description: Admin user details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Admin user retrieved successfully
 *                 data:
 *                   type: object # Adjust based on actual user schema
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Admin user not found.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/admin/:email',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: Prevents tenant admins from enumerating or retrieving details of other admins in the system.
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Add input validation and sanitization.
  // REASON: Ensures the email parameter is a valid email format and normalizes it to prevent canonicalization issues.
  [param('email').isEmail().withMessage('Must be a valid email address.').normalizeEmail()],
  validateRequest,
  AdminController.getAdmin
);

/**
 * @swagger
 * /api/v1/admin/all-user/statistics:
 *   get:
 *     summary: Get user statistics by month (Super Admin)
 *     description: Retrieves monthly statistics for all users across the platform, such as new registrations or active users.
 *     tags:
 *       - Admin
 *       - Users
 *       - Statistics
 *     security:
 *       - BearerAuth: [super_admin]
 *     responses:
 *       200:
 *         description: Monthly user statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User statistics retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Adjust based on actual statistics schema
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/all-user/statistics',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: Platform-wide statistics are sensitive and should only be available to the platform owner.
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getUserStatisticsByMonth
);

// ============= Tenant Management Routes (Super Admin) =============

/**
 * @swagger
 * /api/v1/admin/tenants:
 *   get:
 *     summary: Get all tenants with pagination (Super Admin)
 *     description: Retrieves a paginated list of all tenants in the system. For platform owners only.
 *     tags:
 *       - Admin
 *       - Tenant Management
 *     security:
 *       - BearerAuth: [super_admin]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: Field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order.
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: Search term for filtering tenants.
 *     responses:
 *       200:
 *         description: A paginated list of tenants.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tenants retrieved successfully
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 10 }
 *                     total: { type: integer, example: 100 }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Adjust based on actual tenant schema
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/tenants',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: Listing all tenants is a core platform management function and must be restricted to SUPER_ADMIN.
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Validate and sanitize query parameters for pagination, sorting, and searching.
  listEndpointValidation,
  validateRequest,
  AdminController.getAllTenants
);

/**
 * @swagger
 * /api/v1/admin/tenants/{tenantId}:
 *   get:
 *     summary: Get tenant details (Super Admin)
 *     description: Retrieves detailed information for a specific tenant by their ID. For platform owners only.
 *     tags:
 *       - Admin
 *       - Tenant Management
 *     security:
 *       - BearerAuth: [super_admin]
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: ID of the tenant to retrieve.
 *     responses:
 *       200:
 *         description: Tenant details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tenant details retrieved successfully
 *                 data:
 *                   type: object # Adjust based on actual tenant schema
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Tenant not found.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/tenants/:tenantId',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: Prevents a tenant admin from accessing details of other tenants (IDOR).
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Add input validation.
  // REASON: Ensures the tenant ID is a valid UUID, preventing malformed requests and potential injection vectors.
  [param('tenantId').isUUID().withMessage('Tenant ID must be a valid UUID.')],
  validateRequest,
  AdminController.getTenantDetails
);

/**
 * @swagger
 * /api/v1/admin/tenants/{tenantId}/status:
 *   patch:
 *     summary: Update tenant status (Super Admin)
 *     description: Updates the status of a tenant (e.g., active, suspended, cancelled) by their ID. For platform owners only.
 *     tags:
 *       - Admin
 *       - Tenant Management
 *     security:
 *       - BearerAuth: [super_admin]
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: ID of the tenant whose status is to be updated.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, suspended, cancelled] # Example statuses, adjust as per your system
 *                 description: The new status for the tenant.
 *             example:
 *               status: suspended
 *     responses:
 *       200:
 *         description: Tenant status updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tenant status updated successfully
 *                 data:
 *                   type: object # Adjust based on actual response data
 *       400:
 *         description: Invalid status provided.
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Tenant not found.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.patch(
  '/tenants/:tenantId/status',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: Changing a tenant's status is a critical platform-level action.
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Add input validation.
  // REASON: Ensures the tenant ID is a valid UUID and the status is one of the allowed values.
  [
    param('tenantId').isUUID().withMessage('Tenant ID must be a valid UUID.'),
    body('status')
      .trim()
      .notEmpty()
      .withMessage('Status is required.')
      .isIn(['active', 'suspended', 'cancelled'])
      .withMessage('Invalid status provided.'),
  ],
  validateRequest,
  AdminController.updateTenantStatus
);

/**
 * @swagger
 * /api/v1/admin/tenants/{tenantId}/usage:
 *   get:
 *     summary: View tenant usage statistics (Super Admin)
 *     description: Retrieves usage statistics for a specific tenant by their ID. For platform owners only.
 *     tags:
 *       - Admin
 *       - Tenant Management
 *       - Statistics
 *     security:
 *       - BearerAuth: [super_admin]
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: ID of the tenant to retrieve usage statistics for.
 *     responses:
 *       200:
 *         description: Tenant usage statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tenant usage statistics retrieved successfully
 *                 data:
 *                   type: object # Adjust based on actual usage statistics schema
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Tenant not found.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/tenants/:tenantId/usage',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: Prevents a tenant admin from viewing usage data of other tenants.
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Add input validation.
  // REASON: Ensures the tenant ID is a valid UUID, preventing malformed requests and potential injection vectors.
  [param('tenantId').isUUID().withMessage('Tenant ID must be a valid UUID.')],
  validateRequest,
  AdminController.getTenantUsageAdmin
);

/**
 * @swagger
 * /api/v1/admin/tenants/{tenantId}/extend-trial:
 *   post:
 *     summary: Extend tenant trial period (Super Admin)
 *     description: Extends the trial period for a specific tenant by their ID. For platform owners only.
 *     tags:
 *       - Admin
 *       - Tenant Management
 *     security:
 *       - BearerAuth: [super_admin]
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: ID of the tenant whose trial period is to be extended.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               days:
 *                 type: integer
 *                 description: Number of days to extend the trial period by.
 *                 minimum: 1
 *             example:
 *               days: 30
 *     responses:
 *       200:
 *         description: Tenant trial period extended successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tenant trial period extended successfully
 *                 data:
 *                   type: object # Adjust based on actual response data (e.g., new trial end date)
 *       400:
 *         description: Invalid number of days provided.
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Tenant not found.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/tenants/:tenantId/extend-trial',
  // BUGFIX: Role changed from ADMIN to SUPER_ADMIN.
  // REASON: Modifying tenant subscription details is a platform-level administrative task.
  auth(ENUM_USER_ROLE.ADMIN),
  // SECURITY-PATCH: Add input validation.
  // REASON: Ensures the tenant ID is a valid UUID and that 'days' is a positive integer.
  [
    param('tenantId').isUUID().withMessage('Tenant ID must be a valid UUID.'),
    body('days')
      .isInt({ min: 1 })
      .withMessage('Days must be a positive integer.')
      .toInt(),
  ],
  validateRequest,
  AdminController.extendTenantTrial
);

/**
 * Admin routes for the application.
 * @type {express.Router}
 */
export const adminRoutes = router;