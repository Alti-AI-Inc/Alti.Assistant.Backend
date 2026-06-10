import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { tenantService } from './tenant.service.js';
import TenantMember from './tenantMember.model.js';
import { jwtHelpers } from '../../helpers/jwtHelpers.js';
import config from '../../../../config/index.js';

/**
 * @typedef {object} AuthUser
 * @property {string} _id - The user's ID.
 * @property {string} role - The user's role (e.g., 'admin', 'user', 'super_admin').
 * @property {string} [currentTenantId] - The ID of the tenant the user is currently operating within.
 * @property {Array<object>} [tenants] - An array of tenant memberships for the user.
 * @property {string} tenants.tenantId - The ID of the tenant.
 * @property {string} tenants.role - The user's role within that tenant.
 */

/**
 * @typedef {object} APIResponse
 * @property {number} statusCode - The HTTP status code of the response.
 * @property {boolean} success - Indicates if the request was successful.
 * @property {string} message - A descriptive message about the response.
 * @property {T} [data] - The actual data returned by the API.
 * @template T
 */

/**
 * @typedef {object} PaginationMeta
 * @property {number} page - The current page number.
 * @property {number} limit - The number of items per page.
 * @property {number} total - The total number of items available.
 */

/**
 * @typedef {object} PaginatedResponse
 * @property {Array<T>} data - The array of items for the current page.
 * @property {PaginationMeta} meta - Pagination metadata.
 * @template T
 */

/**
 * @swagger
 * /api/v1/tenants:
 *   post:
 *     summary: Create a new tenant
 *     description: Allows a logged-in user to create a new tenant organization. The user creating the tenant automatically becomes its owner.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - slug
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the tenant.
 *                 example: My New Company
 *               slug:
 *                 type: string
 *                 description: A unique slug for the tenant, often used in URLs.
 *                 example: my-new-company
 *               subdomain:
 *                 type: string
 *                 description: An optional subdomain for the tenant.
 *                 example: mycompany
 *               plan:
 *                 type: string
 *                 description: The subscription plan for the tenant (e.g., 'free', 'pro').
 *                 example: free
 *     responses:
 *       201:
 *         description: Tenant created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TenantCreationResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 * components:
 *   schemas:
 *     TenantCreationResponse:
 *       type: object
 *       properties:
 *         statusCode:
 *           type: number
 *           example: 201
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Tenant created successfully
 *         data:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               example: 652a8c3d7b9f1d001a000001
 *             name:
 *               type: string
 *               example: My New Company
 *             slug:
 *               type: string
 *               example: my-new-company
 *             subdomain:
 *               type: string
 *               example: mycompany
 *             ownerId:
 *               type: string
 *               example: 652a8c3d7b9f1d001a000002
 *             plan:
 *               type: string
 *               example: free
 *             accessToken:
 *               type: string
 *               description: New access token with currentTenantId set.
 *               example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *   responses:
 *     BadRequest:
 *       description: Bad request (e.g., missing required fields, invalid input, slug/subdomain already taken).
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     Unauthorized:
 *       description: Unauthorized (if no token or invalid token).
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     Forbidden:
 *       description: Forbidden (user does not have permission for this action).
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     NotFound:
 *       description: Not Found (resource not found).
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     Conflict:
 *       description: Conflict (e.g., resource already exists).
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         statusCode:
 *           type: number
 *           example: 400
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: Bad Request
 *         errorMessages:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               path:
 *                 type: string
 *               message:
 *                 type: string
 */
/**
 * Handles the creation of a new tenant.
 * The authenticated user creating the tenant is automatically assigned as the owner.
 * A new access token is generated and returned, including the ID of the newly created tenant as the `currentTenantId`.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const createTenant = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?._id;
  const userRole = req.user?.role;
  const { name, slug, subdomain, plan } = req.body;

  const result = await tenantService.createTenant({
    name,
    slug,
    subdomain,
    ownerId: userId,
    plan,
  });

  // Generate new access token with currentTenantId in payload
  const accessToken = jwtHelpers.createToken(
    {
      _id: userId,
      role: userRole,
      currentTenantId: result.id,
    },
    config.jwt.access_token,
    config.jwt.access_expires_in
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Tenant created successfully',
    data: {
      ...result,
      accessToken,
    },
  });
});

/**
 * @swagger
 * /api/v1/tenants/current:
 *   get:
 *     summary: Get the currently active tenant for the logged-in user
 *     description: Retrieves details of the tenant that the user is currently operating within, based on the 'currentTenantId' in the JWT payload.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current tenant retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TenantDetailsResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: User is not associated with any tenant or current tenant not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 * components:
 *   schemas:
 *     TenantDetailsResponse:
 *       type: object
 *       properties:
 *         statusCode:
 *           type: number
 *           example: 200
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Tenant retrieved successfully
 *         data:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               example: 652a8c3d7b9f1d001a000001
 *             name:
 *               type: string
 *               example: My Company
 *             slug:
 *               type: string
 *               example: my-company
 *             subdomain:
 *               type: string
 *               example: mycompany
 *             ownerId:
 *               type: string
 *               example: 652a8c3d7b9f1d001a000002
 *             plan:
 *               type: string
 *               example: pro
 *             createdAt:
 *               type: string
 *               format: date-time
 *             updatedAt:
 *               type: string
 *               format: date-time
 */
/**
 * Handles the retrieval of the currently active tenant for the authenticated user.
 * The `currentTenantId` is extracted from the user's JWT payload.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const getCurrentTenant = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;

  if (!tenantId) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'User is not associated with any tenant',
    });
  }

  const result = await tenantService.getTenantById(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenants/current:
 *   patch:
 *     summary: Update settings for the current tenant
 *     description: Allows an authorized user (e.g., tenant owner/admin) to update various settings of the currently active tenant.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New name for the tenant.
 *                 example: Updated Company Name
 *               slug:
 *                 type: string
 *                 description: New unique slug for the tenant.
 *                 example: updated-company-slug
 *               subdomain:
 *                 type: string
 *                 description: New subdomain for the tenant.
 *                 example: updatedcompany
 *               plan:
 *                 type: string
 *                 description: New subscription plan for the tenant.
 *                 example: premium
 *     responses:
 *       200:
 *         description: Tenant settings updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TenantDetailsResponse'
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
 * Handles the update of settings for the currently active tenant.
 * The `tenantId` is derived from the authenticated user's `currentTenantId`.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const updateTenantSettings = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const updaterId = req.user?.id || req.user?._id;
  const updates = req.body;

  const result = await tenantService.updateTenant(tenantId, updates, updaterId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant updated successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenants/{tenantId}:
 *   delete:
 *     summary: Delete a tenant (Admin only)
 *     description: Allows an administrator to delete a tenant by its ID. This action is typically restricted to super-admins.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tenant to delete.
 *         example: 652a8c3d7b9f1d001a000001
 *     responses:
 *       200:
 *         description: Tenant deleted successfully.
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
 *                   example: Tenant deleted successfully
 *                 data:
 *                   type: null
 *                   example: null
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Handles the deletion of a tenant by its ID.
 * This endpoint is typically restricted to users with 'admin' or 'super_admin' roles.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const deleteTenant = catchAsync(async (req, res) => {
  const { tenantId } = req.params;

  await tenantService.deleteTenant(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant deleted successfully',
  });
});

/**
 * @swagger
 * /api/v1/tenants/switch:
 *   post:
 *     summary: Switch the active tenant or enter personal mode
 *     description: Allows a user to switch their current operational context to a different tenant they are a member of, or to switch to a 'personal' mode (no active tenant). A new access token is returned with the updated 'currentTenantId' and a list of all user's tenants.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tenantId:
 *                 type: string
 *                 nullable: true
 *                 description: The ID of the tenant to switch to. Use 'null', 'personal', or omit for personal mode.
 *                 example: 652a8c3d7b9f1d001a000001
 *     responses:
 *       200:
 *         description: Tenant switched successfully or switched to personal mode.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TenantSwitchResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 * components:
 *   schemas:
 *     TenantSwitchResponse:
 *       type: object
 *       properties:
 *         statusCode:
 *           type: number
 *           example: 200
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Tenant switched successfully
 *         data:
 *           type: object
 *           properties:
 *             accessToken:
 *               type: string
 *               description: New access token with updated currentTenantId.
 *               example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *             mode:
 *               type: string
 *               enum: [personal, organization]
 *               description: Indicates if the user is in 'personal' or 'organization' mode.
 *               example: organization
 */
/**
 * Allows an authenticated user to switch their active tenant context or revert to personal mode.
 * A new JWT is generated with the updated `currentTenantId` (or null for personal mode) and a list of all user's tenants.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const switchTenant = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?._id;
  const userRole = req.user?.role;
  let { tenantId } = req.body;

  // Handle personal mode switching
  const isPersonalMode =
    !tenantId || tenantId === 'personal' || tenantId === 'null';

  if (isPersonalMode) {
    tenantId = null;
  }

  const result = await tenantService.switchTenant(userId, tenantId);

  // Fetch all user's tenants for the token payload
  // Optimization: Added .lean() for performance as the result is read-only and not modified.
  // Indexing Recommendation: Consider adding a compound index on `TenantMember` model for `{ userId: 1, status: 1 }`
  // to optimize this query.
  const tenantMemberships = await TenantMember.find({
    userId,
    status: 'active',
  }).select('tenantId role').lean();

  const tenants = tenantMemberships.map((membership) => ({
    tenantId: membership.tenantId,
    role: membership.role,
  }));

  // Generate new access token with currentTenantId in payload (null for personal mode)
  const accessToken = jwtHelpers.createToken(
    {
      _id: userId,
      role: userRole,
      currentTenantId: tenantId,
      tenants: tenants,
    },
    config.jwt.access_token,
    config.jwt.access_expires_in
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: isPersonalMode
      ? 'Switched to personal mode successfully'
      : 'Tenant switched successfully',
    data: {
      ...result,
      accessToken,
      mode: isPersonalMode ? 'personal' : 'organization',
    },
  });
});

/**
 * @swagger
 * /api/v1/tenants/{tenantId}/members:
 *   get:
 *     summary: Get a list of members for a specific tenant
 *     description: Retrieves a paginated list of all active members for a given tenant. If no tenantId is provided in path, it defaults to the user's current active tenant. Requires the user to be a member of the tenant or a global admin.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional. The ID of the tenant to retrieve members from. If not provided, uses the current active tenant.
 *         example: 652a8c3d7b9f1d001a000001
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: The page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 20
 *         description: The number of items per page.
 *     responses:
 *       200:
 *         description: Tenant members retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TenantMembersResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 * components:
 *   schemas:
 *     TenantMember:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: 652a8c3d7b9f1d001a000003
 *         userId:
 *           type: string
 *           example: 652a8c3d7b9f1d001a000002
 *         tenantId:
 *           type: string
 *           example: 652a8c3d7b9f1d001a000001
 *         role:
 *           type: string
 *           example: member
 *         status:
 *           type: string
 *           example: active
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               example: 652a8c3d7b9f1d001a000002
 *             email:
 *               type: string
 *               example: user@example.com
 *             name:
 *               type: string
 *               example: John Doe
 *     TenantMembersResponse:
 *       type: object
 *       properties:
 *         statusCode:
 *           type: number
 *           example: 200
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Tenant members retrieved successfully
 *         data:
 *           type: object
 *           properties:
 *             data:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TenantMember'
 *             meta:
 *               type: object
 *               properties:
 *                 page:
 *                   type: number
 *                   example: 1
 *                 limit:
 *                   type: number
 *                   example: 20
 *                 total:
 *                   type: number
 *                   example: 5
 */
/**
 * Handles the retrieval of a paginated list of members for a specified tenant.
 * If `tenantId` is not provided in the path, it defaults to the `currentTenantId` from the user's JWT.
 * Requires the authenticated user to be an active member of the tenant or a global admin.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const getTenantMembers = catchAsync(async (req, res) => {
  const tenantId = req.params.tenantId || req.user?.currentTenantId || req.user?.tenantId;
  const { page = 1, limit = 20 } = req.query;

  // Verify membership if not a global admin
  if (req.user?.role !== 'admin') {
    const userId = req.user?.id || req.user?._id;
    // Optimization: Added .lean() for performance as the result is read-only and only checked for existence.
    // Indexing Recommendation: Consider adding a compound index on `TenantMember` model for `{ userId: 1, tenantId: 1, status: 1 }`
    // to optimize this query.
    const isMember = await TenantMember.findOne({
      userId,
      tenantId,
      status: 'active',
    }).lean();
    if (!isMember) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'Forbidden: You are not a member of this tenant',
      });
    }
  }

  const result = await tenantService.getTenantMembers(tenantId, {
    page,
    limit,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant members retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenants/current/members/invite:
 *   post:
 *     summary: Invite a new member to the current tenant
 *     description: Sends an invitation to a user's email to join the currently active tenant with a specified role. Requires appropriate permissions within the tenant.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address of the user to invite.
 *                 example: new.member@example.com
 *               role:
 *                 type: string
 *                 description: The role to assign to the invited member (e.g., 'member', 'admin').
 *                 example: member
 *     responses:
 *       201:
 *         description: Invitation sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Invitation sent successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: 652a8c3d7b9f1d001a000004
 *                     tenantId:
 *                       type: string
 *                       example: 652a8c3d7b9f1d001a000001
 *                     email:
 *                       type: string
 *                       example: new.member@example.com
 *                     role:
 *                       type: string
 *                       example: member
 *                     status:
 *                       type: string
 *                       example: pending
 *                     invitedBy:
 *                       type: string
 *                       example: 652a8c3d7b9f1d001a000002
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
/**
 * Handles inviting a new member to the currently active tenant.
 * The `tenantId` is derived from the authenticated user's `currentTenantId`.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const inviteMember = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const userId = req.user?.id || req.user?._id;
  const { email, role } = req.body;

  const result = await tenantService.inviteMember({
    tenantId,
    email,
    role,
    invitedBy: userId,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Invitation sent successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenants/current/members/{userId}/role:
 *   patch:
 *     summary: Update a member's role within the current tenant
 *     description: Changes the role of an existing member within the currently active tenant. Requires appropriate administrative permissions.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user whose role is to be updated.
 *         example: 652a8c3d7b9f1d001a000003
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
 *                 description: The new role for the member (e.g., 'member', 'admin').
 *                 example: admin
 *     responses:
 *       200:
 *         description: Member role updated successfully.
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
 *                   example: Member role updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/TenantMember'
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
 * Handles updating an existing member's role within the currently active tenant.
 * The `tenantId` is derived from the authenticated user's `currentTenantId`.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const updateMemberRole = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const { userId } = req.params;
  const { role } = req.body;
  const updaterId = req.user?.id || req.user?._id;

  const result = await tenantService.updateMemberRole(tenantId, userId, role, updaterId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Member role updated successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenants/current/members/{userId}:
 *   delete:
 *     summary: Remove a member from the current tenant
 *     description: Removes an existing member from the currently active tenant. Requires appropriate administrative permissions.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to remove from the tenant.
 *         example: 652a8c3d7b9f1d001a000003
 *     responses:
 *       200:
 *         description: Member removed successfully.
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
 *                   example: Member removed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: 652a8c3d7b9f1d001a000003
 *                     status:
 *                       type: string
 *                       example: removed
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Handles removing an existing member from the currently active tenant.
 * The `tenantId` is derived from the authenticated user's `currentTenantId`.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const removeMember = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const { userId } = req.params;
  const removedBy = req.user._id;

  const result = await tenantService.removeMember(tenantId, userId, removedBy);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Member removed successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenants/current/usage:
 *   get:
 *     summary: Get usage statistics for the current tenant
 *     description: Retrieves various usage statistics (e.g., storage, API calls, active users) for the currently active tenant.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
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
 *                     storageUsedBytes:
 *                       type: number
 *                       example: 1024000
 *                     apiCallsMonth:
 *                       type: number
 *                       example: 500
 *                     activeUsers:
 *                       type: number
 *                       example: 5
 *                     projectsCount:
 *                       type: number
 *                       example: 3
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Handles the retrieval of usage statistics for the currently active tenant.
 * The `tenantId` is derived from the authenticated user's `currentTenantId`.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const getTenantUsage = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;

  const result = await tenantService.getTenantUsage(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant usage retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenants/current/limits:
 *   get:
 *     summary: Get current limits for the tenant based on its plan
 *     description: Retrieves the resource limits (e.g., max members, storage, features) applicable to the currently active tenant's subscription plan.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant limits retrieved successfully.
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
 *                   example: Tenant limits retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     maxMembers:
 *                       type: number
 *                       example: 10
 *                     maxStorageGB:
 *                       type: number
 *                       example: 5
 *                     features:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["featureA", "featureB"]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Handles the retrieval of resource limits for the currently active tenant, based on its subscription plan.
 * The `tenantId` is derived from the authenticated user's `currentTenantId`.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const getTenantLimits = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;

  const result = await tenantService.getTenantLimits(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant limits retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenants/check-subdomain:
 *   get:
 *     summary: Check if a subdomain is available for a new tenant
 *     description: Verifies if a given subdomain string is unique and available for use when creating a new tenant.
 *     tags:
 *       - Tenant Management
 *     parameters:
 *       - in: query
 *         name: subdomain
 *         required: true
 *         schema:
 *           type: string
 *         description: The subdomain string to check for availability.
 *         example: mynewsubdomain
 *     responses:
 *       200:
 *         description: Subdomain availability status.
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
 *                   example: Subdomain 'mynewsubdomain' is available.
 *                 data:
 *                   type: object
 *                   properties:
 *                     isAvailable:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: Subdomain 'mynewsubdomain' is available.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
/**
 * Handles checking the availability of a subdomain for a new tenant.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const checkSubdomainAvailability = catchAsync(async (req, res) => {
  const { subdomain } = req.query;

  const result = await tenantService.checkSubdomainAvailability(subdomain);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenants/my-tenants:
 *   get:
 *     summary: Get all tenants the logged-in user is a member of
 *     description: Retrieves a list of all tenants (organizations) that the currently authenticated user is an active member of.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's tenants retrieved successfully.
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
 *                   example: User tenants retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tenantId:
 *                         type: string
 *                         example: 652a8c3d7b9f1d001a000001
 *                       name:
 *                         type: string
 *                         example: My Company
 *                       role:
 *                         type: string
 *                         example: admin
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
/**
 * Handles the retrieval of all tenants that the authenticated user is a member of.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const getUserTenants = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?._id;

  const result = await tenantService.getUserTenants(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User tenants retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenants/{tenantId}:
 *   get:
 *     summary: Get tenant details by ID
 *     description: Retrieves the full details of a specific tenant using its ID. Requires appropriate permissions (e.g., being a member of the tenant or a global admin).
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tenant to retrieve.
 *         example: 652a8c3d7b9f1d001a000001
 *     responses:
 *       200:
 *         description: Tenant retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TenantDetailsResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Handles the retrieval of a tenant's details by its ID.
 * Requires the authenticated user to be a member of the tenant or a global admin.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const getTenantById = catchAsync(async (req, res) => {
  const { tenantId } = req.params;

  const result = await tenantService.getTenantById(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/tenants/{tenantId}/user-count:
 *   get:
 *     summary: Get the total count of active users in a specific tenant
 *     description: Retrieves the number of active members associated with a given tenant ID. Requires appropriate permissions.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tenant to count users for.
 *         example: 652a8c3d7b9f1d001a000001
 *     responses:
 *       200:
 *         description: Tenant user count retrieved successfully.
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
 *                   example: Tenant user count retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: number
 *                       example: 5
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
/**
 * Handles the retrieval of the total count of active users within a specific tenant.
 * Requires the authenticated user to have appropriate permissions for the tenant.
 *
 * @param {import('express').Request & { user?: AuthUser }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const getTenantUserCount = catchAsync(async (req, res) => {
  const { tenantId } = req.params;

  const result = await tenantService.getTenantUserCount(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant user count retrieved successfully',
    data: result,
  });
});

/**
 * @typedef {object} TenantController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} createTenant - Controller for creating a new tenant.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getCurrentTenant - Controller for getting the current user's active tenant.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getTenantById - Controller for getting a tenant by its ID.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getTenantUserCount - Controller for getting the count of users in a tenant.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} updateTenantSettings - Controller for updating current tenant settings.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} deleteTenant - Controller for deleting a tenant (admin only).
 * @property {function(import('express').Request, import('express').Response): Promise<void>} switchTenant - Controller for switching the active tenant or entering personal mode.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getTenantMembers - Controller for getting a list of tenant members.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getUserTenants - Controller for getting all tenants a user is a member of.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} inviteMember - Controller for inviting a user to the current tenant.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} updateMemberRole - Controller for updating a tenant member's role.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} removeMember - Controller for removing a member from the current tenant.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getTenantUsage - Controller for getting tenant usage statistics.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getTenantLimits - Controller for getting tenant resource limits.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} checkSubdomainAvailability - Controller for checking subdomain availability.
 */
export const tenantController = {
  createTenant,
  getCurrentTenant,
  getTenantById,
  getTenantUserCount,
  updateTenantSettings,
  deleteTenant,
  switchTenant,
  getTenantMembers,
  getUserTenants,
  inviteMember,
  updateMemberRole,
  removeMember,
  getTenantUsage,
  getTenantLimits,
  checkSubdomainAvailability,
};