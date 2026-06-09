import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { tenantController } from './tenant.controller.js';
import { tenantInvitationController } from './tenantInvitation.controller.js';
import * as tenantValidation from './tenant.validation.js';
import { checkUserLimit } from '../../middlewares/tenant/checkTenantLimits.js';

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     Tenant:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: The unique identifier for the tenant.
 *           example: 654c6a1b0b7e2c001f8e4a1b
 *         name:
 *           type: string
 *           description: The name of the tenant.
 *           example: My Company
 *         subdomain:
 *           type: string
 *           description: The subdomain associated with the tenant.
 *           example: mycompany
 *         owner:
 *           type: string
 *           description: The ID of the user who owns the tenant.
 *           example: 654c6a1b0b7e2c001f8e4a1c
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The date and time the tenant was created.
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: The date and time the tenant was last updated.
 *     TenantMember:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: The unique identifier for the tenant member record.
 *           example: 654c6a1b0b7e2c001f8e4a1d
 *         user:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *               example: 654c6a1b0b7e2c001f8e4a1e
 *             email:
 *               type: string
 *               example: member@example.com
 *             name:
 *               type: string
 *               example: John Doe
 *           description: The user object of the member.
 *         tenant:
 *           type: string
 *           description: The ID of the tenant this member belongs to.
 *           example: 654c6a1b0b7e2c001f8e4a1b
 *         role:
 *           type: string
 *           enum: [user, admin, owner]
 *           description: The role of the member within the tenant.
 *           example: user
 *         status:
 *           type: string
 *           enum: [active, inactive, pending]
 *           description: The status of the member's association with the tenant.
 *           example: active
 *     TenantInvitation:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: The unique identifier for the invitation.
 *           example: 654c6a1b0b7e2c001f8e4a1f
 *         tenant:
 *           type: string
 *           description: The ID of the tenant the user is invited to.
 *           example: 654c6a1b0b7e2c001f8e4a1b
 *         email:
 *           type: string
 *           format: email
 *           description: The email address of the invited user.
 *           example: invitee@example.com
 *         role:
 *           type: string
 *           enum: [user, admin]
 *           description: The role assigned to the invited user.
 *           example: user
 *         token:
 *           type: string
 *           description: The unique token for accepting the invitation.
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           description: The expiration date of the invitation token.
 *         status:
 *           type: string
 *           enum: [pending, accepted, cancelled, expired]
 *           description: The current status of the invitation.
 *           example: pending
 *     Error:
 *       type: object
 *       properties:
 *         statusCode:
 *           type: number
 *           example: 400
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
 *                 example: email
 *               message:
 *                 type: string
 *                 example: Email is required
 *   parameters:
 *     tenantIdParam:
 *       name: tenantId
 *       in: path
 *       required: true
 *       description: The ID of the tenant.
 *       schema:
 *         type: string
 *         example: 654c6a1b0b7e2c001f8e4a1b
 *     userIdParam:
 *       name: userId
 *       in: path
 *       required: true
 *       description: The ID of the user.
 *       schema:
 *         type: string
 *         example: 654c6a1b0b7e2c001f8e4a1e
 *     inviteIdParam:
 *       name: inviteId
 *       in: path
 *       required: true
 *       description: The ID of the tenant invitation.
 *       schema:
 *         type: string
 *         example: 654c6a1b0b7e2c001f8e4a1f
 */

/**
 * @description Express router for handling tenant-related API routes.
 * @constant
 * @type {express.Router}
 */
const router = express.Router();

// ============= Tenant CRUD Routes =============

/**
 * @swagger
 * /api/v1/tenant/all:
 *   get:
 *     summary: Get all tenants for the logged-in user
 *     description: Retrieves a list of all tenants that the currently authenticated user is a member of.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved all tenants.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Tenants retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Tenant'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/all',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getUserTenants
);

/**
 * @swagger
 * /api/v1/tenant/details/{tenantId}:
 *   get:
 *     summary: Get tenant details by ID
 *     description: Retrieves detailed information for a specific tenant by its ID. The user must be a member of the tenant.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/tenantIdParam'
 *     responses:
 *       200:
 *         description: Successfully retrieved tenant details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Tenant details retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/Tenant'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/details/:tenantId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getTenantById
);

/**
 * @swagger
 * /api/v1/tenant/user/{tenantId}:
 *   get:
 *     summary: Get tenant active user/member count
 *     description: Retrieves the count of active users/members for a specific tenant.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/tenantIdParam'
 *     responses:
 *       200:
 *         description: Successfully retrieved tenant user count.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
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
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/user/:tenantId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getTenantUserCount
);

/**
 * @swagger
 * /api/v1/tenant/switch:
 *   post:
 *     summary: Switch to a different tenant or personal mode
 *     description: Allows the logged-in user to switch their active context to a different tenant or back to personal mode.
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
 *               tenantId:
 *                 type: string
 *                 nullable: true
 *                 description: The ID of the tenant to switch to. Pass `null` or "personal" to switch to personal mode.
 *                 example: 654c6a1b0b7e2c001f8e4a1b
 *             required:
 *               - tenantId
 *     responses:
 *       200:
 *         description: Successfully switched tenant.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Tenant switched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     currentTenantId:
 *                       type: string
 *                       nullable: true
 *                       example: 654c6a1b0b7e2c001f8e4a1b
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/switch',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.switchTenant
);

/**
 * @swagger
 * /api/v1/tenant/create:
 *   post:
 *     summary: Create a new tenant
 *     description: Creates a new tenant for the authenticated user. The user will automatically become the owner of the new tenant.
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
 *                 description: The name of the new tenant.
 *                 example: My New Startup
 *               subdomain:
 *                 type: string
 *                 description: An optional unique subdomain for the tenant.
 *                 example: newstartup
 *             required:
 *               - name
 *     responses:
 *       201:
 *         description: Tenant created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 message:
 *                   type: string
 *                   example: Tenant created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Tenant'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/create',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.createTenantSchema),
  tenantController.createTenant
);

/**
 * @swagger
 * /api/v1/tenant/check-subdomain:
 *   get:
 *     summary: Check if subdomain is available
 *     description: Checks the availability of a given subdomain.
 *     tags:
 *       - Tenant Management
 *     parameters:
 *       - name: subdomain
 *         in: query
 *         required: true
 *         description: The subdomain to check for availability.
 *         schema:
 *           type: string
 *           example: myuniquesubdomain
 *     responses:
 *       200:
 *         description: Subdomain availability status.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Subdomain availability checked successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     available:
 *                       type: boolean
 *                       description: True if the subdomain is available, false otherwise.
 *                       example: true
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/check-subdomain', tenantController.checkSubdomainAvailability);

/**
 * @swagger
 * /api/v1/tenant/current:
 *   get:
 *     summary: Get current user's tenant
 *     description: Retrieves the details of the tenant that the current user is actively working in. Returns null if in personal mode.
 *     tags:
 *       - Tenant Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved current tenant details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Current tenant retrieved successfully
 *                 data:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/Tenant'
 *                     - type: 'null'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/current',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getCurrentTenant
);

/**
 * @swagger
 * /api/v1/tenant/settings:
 *   patch:
 *     summary: Update tenant settings
 *     description: Updates the settings for the current active tenant. Only tenant owners or admins can perform this action.
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
 *                 description: The new name for the tenant.
 *                 example: My Updated Company Name
 *               subdomain:
 *                 type: string
 *                 description: The new subdomain for the tenant. Must be unique.
 *                 example: updatedcompany
 *             minProperties: 1
 *     responses:
 *       200:
 *         description: Tenant settings updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Tenant settings updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Tenant'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.patch(
  '/settings',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.updateTenantSchema),
  tenantController.updateTenantSettings
);

// ============= Member Management Routes =============

/**
 * @swagger
 * /api/v1/tenant/members:
 *   get:
 *     summary: Get all members of the current tenant
 *     description: Retrieves a list of all members belonging to the current active tenant.
 *     tags:
 *       - Tenant Members
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved tenant members.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Tenant members retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TenantMember'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/members',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getTenantMembers
);

/**
 * @swagger
 * /api/v1/tenant/members/{tenantId}:
 *   get:
 *     summary: Get all members of a specific tenant
 *     description: Retrieves a list of all members belonging to a specific tenant by its ID. The user must be a member of the tenant.
 *     tags:
 *       - Tenant Members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/tenantIdParam'
 *     responses:
 *       200:
 *         description: Successfully retrieved tenant members.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Tenant members retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TenantMember'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/members/:tenantId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getTenantMembers
);

/**
 * @swagger
 * /api/v1/tenant/members/invite:
 *   post:
 *     summary: Invite a user to join the tenant
 *     description: Sends an invitation to a user's email to join the current active tenant. Only tenant owners or admins can invite members.
 *     tags:
 *       - Tenant Members
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address of the user to invite.
 *                 example: newmember@example.com
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 description: The role to assign to the invited user. Defaults to 'user'.
 *                 example: user
 *             required:
 *               - email
 *     responses:
 *       201:
 *         description: Invitation sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 message:
 *                   type: string
 *                   example: Invitation sent successfully
 *                 data:
 *                   $ref: '#/components/schemas/TenantInvitation'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/members/invite',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  checkUserLimit, // Check if tenant can add more users
  validateRequest(tenantValidation.inviteMemberSchema),
  tenantController.inviteMember
);

/**
 * @swagger
 * /api/v1/tenant/members/invitations:
 *   get:
 *     summary: Get all pending invitations for the tenant
 *     description: Retrieves a list of all pending invitations for the current active tenant. Only tenant owners or admins can view invitations.
 *     tags:
 *       - Tenant Members
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved tenant invitations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Tenant invitations retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TenantInvitation'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/members/invitations',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantInvitationController.getTenantInvitations
);

/**
 * @swagger
 * /api/v1/tenant/members/invitations/{token}/verify:
 *   post:
 *     summary: Verify an invitation token
 *     description: Verifies if an invitation token is valid and not expired. This endpoint does not require authentication.
 *     tags:
 *       - Tenant Members
 *     parameters:
 *       - name: token
 *         in: path
 *         required: true
 *         description: The unique invitation token to verify.
 *         schema:
 *           type: string
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Invitation token is valid.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Invitation token verified successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tenantName:
 *                       type: string
 *                       example: My Company
 *                     invitedEmail:
 *                       type: string
 *                       example: invitee@example.com
 *                     role:
 *                       type: string
 *                       example: user
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/members/invitations/:token/verify',
  validateRequest(tenantValidation.verifyInvitationTokenSchema),
  tenantInvitationController.verifyInvitationToken
);

/**
 * @swagger
 * /api/v1/tenant/members/invitations/{inviteId}/accept:
 *   post:
 *     summary: Accept an invitation
 *     description: Allows an authenticated user to accept a pending tenant invitation.
 *     tags:
 *       - Tenant Members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/inviteIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: The invitation token received via email.
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *             required:
 *               - token
 *     responses:
 *       200:
 *         description: Invitation accepted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Invitation accepted successfully
 *                 data:
 *                   $ref: '#/components/schemas/TenantMember'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/members/invitations/:inviteId/accept',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.acceptInvitationSchema),
  tenantInvitationController.acceptInvitation
);

/**
 * @swagger
 * /api/v1/tenant/members/invitations/{inviteId}:
 *   delete:
 *     summary: Cancel an invitation
 *     description: Cancels a pending tenant invitation. Only tenant owners or admins can cancel invitations.
 *     tags:
 *       - Tenant Members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/inviteIdParam'
 *     responses:
 *       200:
 *         description: Invitation cancelled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Invitation cancelled successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete(
  '/members/invitations/:inviteId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.cancelInvitationSchema),
  tenantInvitationController.cancelInvitation
);

/**
 * @swagger
 * /api/v1/tenant/members/invitations/{inviteId}/resend:
 *   post:
 *     summary: Resend an invitation email
 *     description: Resends the invitation email for a pending invitation. Only tenant owners or admins can resend invitations.
 *     tags:
 *       - Tenant Members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/inviteIdParam'
 *     responses:
 *       200:
 *         description: Invitation email resent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Invitation email resent successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/members/invitations/:inviteId/resend',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.cancelInvitationSchema), // Reusing schema as it only needs inviteId
  tenantInvitationController.resendInvitation
);

/**
 * @swagger
 * /api/v1/tenant/members/{userId}/role:
 *   patch:
 *     summary: Update a member's role
 *     description: Updates the role of a specific member within the current active tenant. Only tenant owners or admins can modify roles.
 *     tags:
 *       - Tenant Members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/userIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 description: The new role for the member.
 *                 example: admin
 *             required:
 *               - role
 *     responses:
 *       200:
 *         description: Member role updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Member role updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/TenantMember'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.patch(
  '/members/:userId/role',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.updateMemberRoleSchema),
  tenantController.updateMemberRole
);

/**
 * @swagger
 * /api/v1/tenant/members/{userId}:
 *   delete:
 *     summary: Remove a member from the tenant
 *     description: Removes a specific member from the current active tenant. Only tenant owners or admins can remove members.
 *     tags:
 *       - Tenant Members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/userIdParam'
 *     responses:
 *       200:
 *         description: Member removed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Member removed successfully
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete(
  '/members/:userId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.removeMemberSchema),
  tenantController.removeMember
);

/**
 * @swagger
 * /api/v1/tenant/usage:
 *   get:
 *     summary: Get tenant usage statistics
 *     description: Retrieves usage statistics for the current active tenant, such as storage, API calls, etc.
 *     tags:
 *       - Tenant Billing & Usage
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved tenant usage statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Tenant usage retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     storageUsedGB:
 *                       type: number
 *                       example: 1.5
 *                     apiCallsThisMonth:
 *                       type: number
 *                       example: 12345
 *                     activeUsers:
 *                       type: number
 *                       example: 5
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/usage',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getTenantUsage
);

/**
 * @swagger
 * /api/v1/tenant/limits:
 *   get:
 *     summary: Get tenant plan limits
 *     description: Retrieves the current plan limits for the active tenant, such as max users, max storage, etc.
 *     tags:
 *       - Tenant Billing & Usage
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved tenant plan limits.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Tenant limits retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     maxUsers:
 *                       type: number
 *                       example: 10
 *                     maxStorageGB:
 *                       type: number
 *                       example: 50
 *                     maxApiCallsPerMonth:
 *                       type: number
 *                       example: 100000
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/limits',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  tenantController.getTenantLimits
);

/**
 * @swagger
 * /api/v1/tenant/{tenantId}:
 *   delete:
 *     summary: Delete a tenant (Admin only)
 *     description: Deletes a tenant by its ID. This operation is restricted to users with ADMIN role.
 *     tags:
 *       - Admin Operations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/tenantIdParam'
 *     responses:
 *       200:
 *         description: Tenant deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Tenant deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete(
  '/:tenantId',
  auth(ENUM_USER_ROLE.ADMIN),
  validateRequest(tenantValidation.tenantIdParamSchema),
  tenantController.deleteTenant
);

/**
 * @description Exports the tenant router for use in the main application.
 * @constant
 * @type {express.Router}
 */
export const tenantRoutes = router;