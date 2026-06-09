import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import pick from '../../middlewares/other/pick.js';
import { paginationFields } from './admin.constant.js';
import { AdminService } from './admin.service.js';

/**
 * @swagger
 * /api/v1/admin/buyers:
 *   get:
 *     summary: Get all paid users (buyers).
 *     description: Retrieves a list of all users who have made a payment or are designated as 'buyers'.
 *     tags:
 *       - Admin - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved all paid users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Get All Paid User
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       email:
 *                         type: string
 *                       role:
 *                         type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
/**
 * Controller for retrieving all users designated as 'buyers' or paid users.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getAllBuyer = catchAsync(async (req, res) => {
  // const buyers = await UserModel.findOne({ role: 'buyer' })
  const buyers = await AdminService.getAllBuyerServices();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get All Paid User',
    data: buyers,
  });
});

/**
 * @swagger
 * /api/v1/admin/users/{objectId}:
 *   delete:
 *     summary: Delete a user by ID.
 *     description: Deletes a user from the system based on their unique ID. Requires admin privileges.
 *     tags:
 *       - Admin - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: objectId
 *         schema:
 *           type: string
 *           format: objectId
 *         required: true
 *         description: The ID of the user to delete.
 *     responses:
 *       200:
 *         description: User deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User Delete Successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: number
 *                       example: 1
 *       400:
 *         description: Bad request, user could not be deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: fail
 *                 error:
 *                   type: string
 *                   example: Could't delete the user
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Controller for deleting a user by their ID.
 * @param {import('express').Request} req - The Express request object, containing `objectId` in params and `user.role` for authorization.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const deleteUser = catchAsync(async (req, res) => {
  const objectId = req.params?.objectId;
  const requesterRole = req.user?.role || 'admin'; // Default to 'admin' if role is not present (should be from auth middleware)
  const result = await AdminService.deleteUserService(objectId, requesterRole);

  if (!result.deletedCount) {
    return res.status(400).json({
      status: 'fail',
      error: "Could't delete the user",
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User Delete Successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/admin/users:
 *   get:
 *     summary: Get all users with filtering and pagination.
 *     description: Retrieves a list of all users, with options for searching by term, email, first name, last name, and pagination.
 *     tags:
 *       - Admin - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: Search term to filter users by (e.g., name, email).
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: Filter users by email address.
 *       - in: query
 *         name: firstName
 *         schema:
 *           type: string
 *         description: Filter users by first name.
 *       - in: query
 *         name: lastName
 *         schema:
 *           type: string
 *         description: Filter users by last name.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Number of items per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (ascending or descending).
 *     responses:
 *       200:
 *         description: Users retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Users find Successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: number
 *                         limit:
 *                           type: number
 *                         total:
 *                           type: number
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           email:
 *                             type: string
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           role:
 *                             type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
/**
 * Controller for retrieving all users with filtering and pagination capabilities.
 * @param {import('express').Request} req - The Express request object, containing query parameters for filters and pagination.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getAllUsers = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'searchTerm',
    'email',
    'firstName',
    'lastName',
  ]);

  const paginationOptions = pick(req.query, paginationFields);

  const users = await AdminService.getAllUsersService(
    filters,
    paginationOptions
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Users find Successfully',
    data: users,
  });
});

/**
 * @swagger
 * /api/v1/admin/users/{id}/role:
 *   patch:
 *     summary: Update a user's role.
 *     description: Updates the role of a specific user identified by their ID. Requires admin privileges.
 *     tags:
 *       - Admin - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: objectId
 *         required: true
 *         description: The ID of the user whose role is to be updated.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 description: The new role for the user (e.g., 'admin', 'user', 'buyer', 'tenant').
 *                 example: tenant
 *     responses:
 *       200:
 *         description: User role updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Update Role successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     role:
 *                       type: string
 *                       example: tenant
 *       400:
 *         description: Bad request, role is required or invalid input.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: role is required in the request body
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Controller for updating a user's role.
 * @param {import('express').Request} req - The Express request object, containing `id` in params and `role` in body.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const updateUserRole = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role) {
    return res.status(400).json({
      success: false,
      error: 'role is required in the request body',
    });
  }

  const result = await AdminService.updateUserRoleService(id, role);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Update Role successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/admin/admins/{email}:
 *   get:
 *     summary: Get an admin user by email.
 *     description: Retrieves the details of an admin user based on their email address.
 *     tags:
 *       - Admin - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: email
 *         schema:
 *           type: string
 *           format: email
 *         required: true
 *         description: The email address of the admin user to retrieve.
 *     responses:
 *       200:
 *         description: Admin user retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Admin get Successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                       example: admin
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Controller for retrieving an admin user by their email address.
 * @param {import('express').Request} req - The Express request object, containing `email` in params.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getAdmin = catchAsync(async (req, res) => {
  const { email } = req.params;
  const admin = await AdminService.getAdminServices(email);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Admin get Successfully',
    data: admin,
  });
});

/**
 * @swagger
 * /api/v1/admin/user-statistics-by-month:
 *   get:
 *     summary: Get user registration statistics by month.
 *     description: Retrieves statistics on user registrations, grouped by month. Useful for tracking growth.
 *     tags:
 *       - Admin - Analytics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Get User Statistics Successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         description: Month and year (e.g., "2023-01").
 *                       count:
 *                         type: number
 *                         description: Number of users registered in that month.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
/**
 * Controller for retrieving user registration statistics grouped by month.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getUserStatisticsByMonth = catchAsync(async (req, res) => {
  const result = await AdminService.getUserStatisticsByMonthService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get User Statistics Successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/admin/payments:
 *   get:
 *     summary: Get all payment records with filtering and pagination.
 *     description: Retrieves a list of all payment transactions, with options for searching by term, price, plan name, duration, and pagination.
 *     tags:
 *       - Admin - Payments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: Search term to filter payments (e.g., transaction ID, user email).
 *       - in: query
 *         name: price
 *         schema:
 *           type: number
 *         description: Filter payments by exact price.
 *       - in: query
 *         name: plan_name
 *         schema:
 *           type: string
 *         description: Filter payments by plan name.
 *       - in: query
 *         name: duration
 *         schema:
 *           type: string
 *         description: Filter payments by plan duration.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Number of items per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (ascending or descending).
 *     responses:
 *       200:
 *         description: Payment records retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Get All Paid User
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: number
 *                         limit:
 *                           type: number
 *                         total:
 *                           type: number
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           userId:
 *                             type: string
 *                           plan_name:
 *                             type: string
 *                           price:
 *                             type: number
 *                           status:
 *                             type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
/**
 * Controller for retrieving all payment records with filtering and pagination.
 * @param {import('express').Request} req - The Express request object, containing query parameters for filters and pagination.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getAllPayment = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'searchTerm',
    'price',
    'plan_name',
    'duration',
  ]);

  const paginationOptions = pick(req.query, paginationFields);

  const result = await AdminService.getAllPaymentService(
    filters,
    paginationOptions
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get All Paid User',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/admin/tenants:
 *   get:
 *     summary: Get all tenants with filtering and pagination.
 *     description: Retrieves a list of all tenant accounts, with options for searching by term, status, plan, and pagination.
 *     tags:
 *       - Admin - Tenants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: Search term to filter tenants (e.g., tenant name, email).
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, trial, suspended]
 *         description: Filter tenants by their current status.
 *       - in: query
 *         name: plan
 *         schema:
 *           type: string
 *         description: Filter tenants by their subscription plan.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Number of items per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (ascending or descending).
 *     responses:
 *       200:
 *         description: Tenants retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tenants retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: number
 *                         limit:
 *                           type: number
 *                         total:
 *                           type: number
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           status:
 *                             type: string
 *                           plan:
 *                             type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
/**
 * Controller for retrieving all tenants with filtering and pagination.
 * @param {import('express').Request} req - The Express request object, containing query parameters for filters and pagination.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getAllTenants = catchAsync(async (req, res) => {
  const filters = pick(req.query, ['searchTerm', 'status', 'plan']);
  const paginationOptions = pick(req.query, paginationFields);

  const result = await AdminService.getAllTenantsService(
    filters,
    paginationOptions
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenants retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/admin/tenants/{tenantId}:
 *   get:
 *     summary: Get tenant details by ID.
 *     description: Retrieves detailed information for a specific tenant account using its ID.
 *     tags:
 *       - Admin - Tenants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: objectId
 *         required: true
 *         description: The ID of the tenant to retrieve.
 *     responses:
 *       200:
 *         description: Tenant details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tenant details retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     status:
 *                       type: string
 *                     plan:
 *                       type: string
 *                     trialEndDate:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Controller for retrieving details of a specific tenant.
 * @param {import('express').Request} req - The Express request object, containing `tenantId` in params.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getTenantDetails = catchAsync(async (req, res) => {
  const { tenantId } = req.params;

  const result = await AdminService.getTenantDetailsService(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant details retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/admin/tenants/{tenantId}/status:
 *   patch:
 *     summary: Update tenant status.
 *     description: Updates the operational status of a specific tenant account (e.g., active, suspended).
 *     tags:
 *       - Admin - Tenants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: objectId
 *         required: true
 *         description: The ID of the tenant whose status is to be updated.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive, trial, suspended]
 *                 description: The new status for the tenant.
 *                 example: suspended
 *     responses:
 *       200:
 *         description: Tenant status updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tenant status updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: suspended
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Controller for updating the status of a specific tenant.
 * @param {import('express').Request} req - The Express request object, containing `tenantId` in params and `status` in body.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const updateTenantStatus = catchAsync(async (req, res) => {
  const { tenantId } = req.params;
  const { status } = req.body;

  const result = await AdminService.updateTenantStatusService(tenantId, status);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant status updated successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/admin/tenants/{tenantId}/usage:
 *   get:
 *     summary: Get tenant usage statistics.
 *     description: Retrieves usage statistics for a specific tenant, such as API calls, storage, or other relevant metrics.
 *     tags:
 *       - Admin - Tenants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: objectId
 *         required: true
 *         description: The ID of the tenant to retrieve usage for.
 *     responses:
 *       200:
 *         description: Tenant usage retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tenant usage retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tenantId:
 *                       type: string
 *                     apiCalls:
 *                       type: number
 *                     storageUsedGB:
 *                       type: number
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Controller for retrieving usage statistics for a specific tenant.
 * @param {import('express').Request} req - The Express request object, containing `tenantId` in params.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getTenantUsageAdmin = catchAsync(async (req, res) => {
  const { tenantId } = req.params;

  const result = await AdminService.getTenantUsageService(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant usage retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/admin/tenants/{tenantId}/extend-trial:
 *   patch:
 *     summary: Extend tenant trial period.
 *     description: Extends the trial period for a specific tenant by a given number of days.
 *     tags:
 *       - Admin - Tenants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: objectId
 *         required: true
 *         description: The ID of the tenant whose trial is to be extended.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - days
 *             properties:
 *               days:
 *                 type: number
 *                 minimum: 1
 *                 description: The number of days to extend the trial by.
 *                 example: 7
 *     responses:
 *       200:
 *         description: Tenant trial extended successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Tenant trial extended successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     trialEndDate:
 *                       type: string
 *                       format: date-time
 *                       description: The new trial end date.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Controller for extending the trial period of a specific tenant.
 * @param {import('express').Request} req - The Express request object, containing `tenantId` in params and `days` in body.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const extendTenantTrial = catchAsync(async (req, res) => {
  const { tenantId } = req.params;
  const { days } = req.body;

  const result = await AdminService.extendTenantTrialService(tenantId, days);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant trial extended successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/admin/billing-audit-logs:
 *   get:
 *     summary: Retrieve billing audit logs.
 *     description: Fetches a list of billing-related audit logs, with options for searching by term, action type, and pagination.
 *     tags:
 *       - Admin - Audits
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: Search term to filter audit logs (e.g., user ID, transaction ID).
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter logs by specific billing action (e.g., 'invoice_generated', 'payment_failed').
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Number of items per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (ascending or descending).
 *     responses:
 *       200:
 *         description: Billing audit logs retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Billing audit logs retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: number
 *                         limit:
 *                           type: number
 *                         total:
 *                           type: number
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           userId:
 *                             type: string
 *                           action:
 *                             type: string
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           details:
 *                             type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
/**
 * Controller for retrieving billing audit logs with filtering and pagination.
 * @param {import('express').Request} req - The Express request object, containing query parameters for filters and pagination.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getBillingAuditLogs = catchAsync(async (req, res) => {
  const filters = pick(req.query, ['searchTerm', 'action']);
  const paginationOptions = pick(req.query, paginationFields);

  const result = await AdminService.getBillingAuditLogsService(
    filters,
    paginationOptions
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Billing audit logs retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/admin/swarm-audits:
 *   get:
 *     summary: Retrieve swarm execution audit logs.
 *     description: Fetches a list of swarm execution audit logs, with options for searching by term, status, tool name, and pagination.
 *     tags:
 *       - Admin - Audits
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: Search term to filter audit logs (e.g., execution ID, user ID).
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [success, failed, pending, running]
 *         description: Filter logs by execution status.
 *       - in: query
 *         name: toolName
 *         schema:
 *           type: string
 *         description: Filter logs by the name of the tool used in the swarm.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Number of items per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (ascending or descending).
 *     responses:
 *       200:
 *         description: Swarm audits retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Swarm audits retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: number
 *                         limit:
 *                           type: number
 *                         total:
 *                           type: number
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           executionId:
 *                             type: string
 *                           userId:
 *                             type: string
 *                           toolName:
 *                             type: string
 *                           status:
 *                             type: string
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           details:
 *                             type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
/**
 * Controller for retrieving swarm execution audit logs with filtering and pagination.
 * @param {import('express').Request} req - The Express request object, containing query parameters for filters and pagination.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getSwarmAudits = catchAsync(async (req, res) => {
  const filters = pick(req.query, ['searchTerm', 'status', 'toolName']);
  const paginationOptions = pick(req.query, paginationFields);

  const result = await AdminService.getSwarmAuditsService(
    filters,
    paginationOptions
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Swarm audits retrieved successfully',
    data: result,
  });
});

/**
 * @namespace AdminController
 * @description Controller functions for administrative tasks, including user management, tenant management, payments, and audit logs.
 */
export const AdminController = {
  getAllBuyer,
  deleteUser,
  getAllUsers,
  updateUserRole,
  getAdmin,
  getUserStatisticsByMonth,
  getAllPayment,
  getAllTenants,
  getTenantDetails,
  updateTenantStatus,
  getTenantUsageAdmin,
  extendTenantTrial,
  getBillingAuditLogs,
  getSwarmAudits,
};