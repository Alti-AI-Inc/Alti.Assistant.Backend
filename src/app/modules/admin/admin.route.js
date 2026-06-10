import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { AdminController } from './admin.controller.js';

/**
 * Express router for admin-related routes.
 * @type {express.Router}
 */
const router = express.Router();

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
 *                 enum: [super_admin, admin, buyer, seller, user] # Example roles, adjust as per ENUM_USER_ROLE
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
  auth(ENUM_USER_ROLE.SUPER_ADMIN),
  AdminController.updateUserRole
);

/**
 * @swagger
 * /api/v1/admin/delete-user/{objectId}:
 *   delete:
 *     summary: Delete a user
 *     description: Allows an Admin to delete an existing user account identified by their ID.
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: [admin]
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
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.deleteUser
);

/**
 * @swagger
 * /api/v1/admin/buyer/all-user:
 *   get:
 *     summary: Get all buyer users
 *     description: Retrieves a list of all users who have the 'buyer' role.
 *     tags:
 *       - Admin
 *       - Users
 *     security:
 *       - BearerAuth: [admin]
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
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getAllBuyer
);

/**
 * @swagger
 * /api/v1/admin/all-user:
 *   get:
 *     summary: Get all users
 *     description: Retrieves a comprehensive list of all users in the system.
 *     tags:
 *       - Admin
 *       - Users
 *     security:
 *       - BearerAuth: [admin]
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
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getAllUsers
);

/**
 * @swagger
 * /api/v1/admin/all-payment:
 *   get:
 *     summary: Get all payment records
 *     description: Retrieves a list of all payment transactions recorded in the system.
 *     tags:
 *       - Admin
 *       - Payments
 *     security:
 *       - BearerAuth: [admin]
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
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getAllPayment
);

/**
 * @swagger
 * /api/v1/admin/billing/audit-logs:
 *   get:
 *     summary: Get billing audit logs
 *     description: Retrieves audit logs specifically related to billing activities.
 *     tags:
 *       - Admin
 *       - Audit Logs
 *       - Billing
 *     security:
 *       - BearerAuth: [admin]
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
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getBillingAuditLogs
);

/**
 * @swagger
 * /api/v1/admin/swarm-audits:
 *   get:
 *     summary: Get swarm audit logs
 *     description: Retrieves audit logs related to swarm activities or operations.
 *     tags:
 *       - Admin
 *       - Audit Logs
 *       - Swarm
 *     security:
 *       - BearerAuth: [admin]
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
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getSwarmAudits
);

/**
 * @swagger
 * /api/v1/admin/admin/{email}:
 *   get:
 *     summary: Get admin user by email
 *     description: Retrieves details of an admin user by their email address.
 *     tags:
 *       - Admin
 *       - Users
 *     security:
 *       - BearerAuth: [admin]
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
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getAdmin
);

/**
 * @swagger
 * /api/v1/admin/all-user/statistics:
 *   get:
 *     summary: Get user statistics by month
 *     description: Retrieves monthly statistics for all users, such as new registrations or active users.
 *     tags:
 *       - Admin
 *       - Users
 *       - Statistics
 *     security:
 *       - BearerAuth: [admin]
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
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getUserStatisticsByMonth
);

// ============= Tenant Management Routes (Admin) =============

/**
 * @swagger
 * /api/v1/admin/tenants:
 *   get:
 *     summary: Get all tenants with pagination
 *     description: Retrieves a paginated list of all tenants in the system.
 *     tags:
 *       - Admin
 *       - Tenant Management
 *     security:
 *       - BearerAuth: [admin]
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
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/tenants',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getAllTenants
);

/**
 * @swagger
 * /api/v1/admin/tenants/{tenantId}:
 *   get:
 *     summary: Get tenant details
 *     description: Retrieves detailed information for a specific tenant by their ID.
 *     tags:
 *       - Admin
 *       - Tenant Management
 *     security:
 *       - BearerAuth: [admin]
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
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getTenantDetails
);

/**
 * @swagger
 * /api/v1/admin/tenants/{tenantId}/status:
 *   patch:
 *     summary: Update tenant status
 *     description: Updates the status of a tenant (e.g., active, suspended, cancelled) by their ID.
 *     tags:
 *       - Admin
 *       - Tenant Management
 *     security:
 *       - BearerAuth: [admin]
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
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.updateTenantStatus
);

/**
 * @swagger
 * /api/v1/admin/tenants/{tenantId}/usage:
 *   get:
 *     summary: View tenant usage statistics
 *     description: Retrieves usage statistics for a specific tenant by their ID.
 *     tags:
 *       - Admin
 *       - Tenant Management
 *       - Statistics
 *     security:
 *       - BearerAuth: [admin]
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
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getTenantUsageAdmin
);

/**
 * @swagger
 * /api/v1/admin/tenants/{tenantId}/extend-trial:
 *   post:
 *     summary: Extend tenant trial period
 *     description: Extends the trial period for a specific tenant by their ID.
 *     tags:
 *       - Admin
 *       - Tenant Management
 *     security:
 *       - BearerAuth: [admin]
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
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.extendTenantTrial
);

/**
 * Admin routes for the application.
 * @type {express.Router}
 */
export const adminRoutes = router;