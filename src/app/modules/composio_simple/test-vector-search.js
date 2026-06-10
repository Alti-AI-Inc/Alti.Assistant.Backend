/**
 * Manager Dashboard API Routes
 *
 * This file defines the API endpoints for manager-specific functionalities,
 * including team management, member invitations, role updates, and viewing
 * workspace metrics.
 *
 * All routes are protected and require the user to be an authenticated manager
 * of the specified workspace.
 * @module routes/manager
 */

import { Router } from 'express';
import { body, param } from 'express-validator';
// SEC-PATCH: Import security middleware for setting security headers and rate limiting.
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// In a real application, these would be imported from their respective files.
// For this example, they represent the controller and middleware logic.
import * as managerController from '../controllers/manager.controller.js';
import { isAuthenticated, isWorkspaceManager } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validation.middleware.js';
import { checkPlanLimits } from '../middleware/plan.middleware.js';

/**
 * Express router to handle manager-specific API requests.
 * @type {import('express').Router}
 */
const router = Router();

// SEC-PATCH: Apply essential security headers (e.g., X-XSS-Protection, Strict-Transport-Security).
router.use(helmet());

// SEC-PATCH: Configure rate limiting to prevent brute-force and denial-of-service attacks.
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 200, // Limit each IP to 200 requests per window
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
	message: { status: 429, message: 'Too many requests from this IP, please try again after 15 minutes.' },
});

// SEC-PATCH: Stricter rate limiter for sensitive actions like creating invitations to prevent abuse.
const inviteLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 20, // Limit each IP to 20 invitations per hour
	standardHeaders: true,
	legacyHeaders: false,
	message: { status: 429, message: 'Too many invitations created from this IP, please try again after an hour.' },
});

// SEC-PATCH: Apply the general rate limiter to all manager routes.
router.use(apiLimiter);

/**
 * @name /api/manager/:workspaceId
 * @description Middleware stack for all routes in this module. It ensures that the user is authenticated,
 * the workspace ID is valid, and the user has a 'manager' or 'owner' role for the specified workspace.
 * This provides a multi-tenant context and role-based access control for all subsequent routes.
 * @property {string} workspaceId - The MongoDB ObjectId of the workspace.
 * @middleware isAuthenticated - Ensures the user is logged in.
 * @middleware param('workspaceId').isMongoId() - Validates the workspace ID format.
 * @middleware validateRequest - Handles validation errors.
 * @middleware isWorkspaceManager - Verifies the user's manager/owner role for the workspace.
 */
router.use(
  '/:workspaceId',
  isAuthenticated,
  // SEC-PATCH: Sanitize path parameter to prevent XSS if it is ever reflected in a response.
  param('workspaceId').isMongoId().withMessage('Invalid workspace ID format.').escape(),
  validateRequest,
  isWorkspaceManager
);

/**
 * =================================================================
 * Team & Member Management
 *
 * Endpoints for viewing and managing team members within a workspace.
 * =================================================================
 */

/**
 * @openapi
 * /api/manager/{workspaceId}/team:
 *   get:
 *     summary: Get Team Members
 *     description: Fetches a list of all members in the specified workspace. Requires manager-level permissions.
 *     tags:
 *       - Manager - Team
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the workspace.
 *     responses:
 *       '200':
 *         description: A list of team members.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   role:
 *                     type: string
 *       '401':
 *         description: Unauthorized - User is not authenticated.
 *       '403':
 *         description: Forbidden - User is not a manager of this workspace.
 *       '404':
 *         description: Not Found - The workspace does not exist.
 *       '429':
 *         description: Too Many Requests.
 */
router.get('/:workspaceId/team', managerController.getTeamMembers);

/**
 * @openapi
 * /api/manager/{workspaceId}/team/{memberId}:
 *   patch:
 *     summary: Update Member Role
 *     description: >
 *       Updates the role of a specific team member.
 *       Requires manager-level permissions.
 *       A manager cannot change their own role or the role of the workspace owner.
 *     tags:
 *       - Manager - Team
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the workspace.
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the member to update.
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
 *                 enum: [admin, member]
 *                 description: The new role for the team member.
 *     responses:
 *       '200':
 *         description: The member's role was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 role:
 *                   type: string
 *       '400':
 *         description: Bad Request - Invalid role, invalid member ID, or attempt to change owner/self role.
 *       '401':
 *         description: Unauthorized - User is not authenticated.
 *       '403':
 *         description: Forbidden - User is not a manager of this workspace.
 *       '404':
 *         description: Not Found - The workspace or member does not exist.
 *       '429':
 *         description: Too Many Requests.
 */
router.patch(
  '/:workspaceId/team/:memberId',
  [
    // SEC-PATCH: Sanitize path parameter to prevent XSS.
    param('memberId').isMongoId().withMessage('Invalid member ID format.').escape(),
    body('role')
      .notEmpty()
      .isIn(['admin', 'member']) // Example roles; should match the application's role schema.
      .withMessage('Invalid role specified. Must be one of: admin, member.')
      .escape(), // SEC-PATCH: Sanitize role input as a defense-in-depth measure.
  ],
  validateRequest,
  managerController.updateMemberRole
);

/**
 * @openapi
 * /api/manager/{workspaceId}/team/{memberId}:
 *   delete:
 *     summary: Remove Team Member
 *     description: >
 *       Removes a member from the workspace.
 *       Requires manager-level permissions.
 *       A manager cannot remove themselves or the workspace owner.
 *     tags:
 *       - Manager - Team
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the workspace.
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the member to remove.
 *     responses:
 *       '204':
 *         description: The member was removed successfully.
 *       '400':
 *         description: Bad Request - Attempt to remove owner or self.
 *       '401':
 *         description: Unauthorized - User is not authenticated.
 *       '403':
 *         description: Forbidden - User is not a manager of this workspace.
 *       '404':
 *         description: Not Found - The workspace or member does not exist.
 *       '429':
 *         description: Too Many Requests.
 */
router.delete(
  '/:workspaceId/team/:memberId',
  // SEC-PATCH: Sanitize path parameter to prevent XSS.
  param('memberId').isMongoId().withMessage('Invalid member ID format.').escape(),
  validateRequest,
  managerController.removeMember
);

/**
 * =================================================================
 * Invitations
 *
 * Endpoints for inviting new members and managing pending invitations.
 * =================================================================
 */

/**
 * @openapi
 * /api/manager/{workspaceId}/invitations:
 *   post:
 *     summary: Invite New Member
 *     description: >
 *       Invites a new member to the workspace by email.
 *       Requires manager-level permissions.
 *       This action is subject to the workspace's subscription plan limits.
 *     tags:
 *       - Manager - Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the workspace.
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
 *               role:
 *                 type: string
 *                 enum: [admin, member]
 *                 description: The role to assign to the new member upon joining.
 *     responses:
 *       '201':
 *         description: Invitation sent successfully.
 *       '400':
 *         description: Bad Request - Invalid email/role, or user is already a member/invited.
 *       '401':
 *         description: Unauthorized - User is not authenticated.
 *       '403':
 *         description: Forbidden - User is not a manager or plan limit has been reached.
 *       '404':
 *         description: Not Found - The workspace does not exist.
 *       '429':
 *         description: Too Many Requests.
 */
router.post(
  '/:workspaceId/invitations',
  inviteLimiter, // SEC-PATCH: Apply stricter rate limiting to this sensitive endpoint.
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('A valid email address is required.')
      .escape(), // SEC-PATCH: Sanitize email input to prevent XSS if it's ever reflected to a client.
    body('role')
      .isIn(['admin', 'member'])
      .withMessage('Invalid role specified. Must be one of: admin, member.')
      .escape(), // SEC-PATCH: Sanitize role input as a defense-in-depth measure.
  ],
  validateRequest,
  checkPlanLimits('teamMembers'), // Middleware verifies plan limits before attempting to invite.
  managerController.inviteMember
);

/**
 * @openapi
 * /api/manager/{workspaceId}/invitations:
 *   get:
 *     summary: Get Pending Invitations
 *     description: >
 *       Lists all pending invitations for the workspace.
 *       Requires manager-level permissions.
 *     tags:
 *       - Manager - Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the workspace.
 *     responses:
 *       '200':
 *         description: A list of pending invitations.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   email:
 *                     type: string
 *                   role:
 *                     type: string
 *                   status:
 *                     type: string
 *                     example: pending
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *       '401':
 *         description: Unauthorized - User is not authenticated.
 *       '403':
 *         description: Forbidden - User is not a manager of this workspace.
 *       '404':
 *         description: Not Found - The workspace does not exist.
 *       '429':
 *         description: Too Many Requests.
 */
router.get('/:workspaceId/invitations', managerController.getPendingInvitations);

/**
 * @openapi
 * /api/manager/{workspaceId}/invitations/{invitationId}:
 *   delete:
 *     summary: Revoke Invitation
 *     description: >
 *       Revokes a pending invitation, making it invalid.
 *       Requires manager-level permissions.
 *     tags:
 *       - Manager - Invitations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the workspace.
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the invitation to revoke.
 *     responses:
 *       '204':
 *         description: The invitation was revoked successfully.
 *       '401':
 *         description: Unauthorized - User is not authenticated.
 *       '403':
 *         description: Forbidden - User is not a manager of this workspace.
 *       '404':
 *         description: Not Found - The workspace or invitation does not exist.
 *       '429':
 *         description: Too Many Requests.
 */
router.delete(
  '/:workspaceId/invitations/:invitationId',
  // SEC-PATCH: Sanitize path parameter to prevent XSS.
  param('invitationId').isMongoId().withMessage('Invalid invitation ID format.').escape(),
  validateRequest,
  managerController.revokeInvitation
);

/**
 * =================================================================
 * Workspace Metrics
 *
 * Endpoint for retrieving workspace-specific usage and activity data.
 * =================================================================
 */

/**
 * @openapi
 * /api/manager/{workspaceId}/metrics:
 *   get:
 *     summary: Get Workspace Metrics
 *     description: >
 *       Retrieves key performance and usage metrics for the workspace.
 *       This endpoint is strictly for operational metrics (e.g., API calls used,
 *       active projects, storage consumed) and does NOT expose any billing or
 *       subscription information. Requires manager-level permissions.
 *     tags:
 *       - Manager - Metrics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the workspace.
 *     responses:
 *       '200':
 *         description: An object containing workspace metrics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apiCallsUsed:
 *                   type: integer
 *                 storageConsumed:
 *                   type: integer
 *                 activeProjects:
 *                   type: integer
 *       '401':
 *         description: Unauthorized - User is not authenticated.
 *       '403':
 *         description: Forbidden - User is not a manager of this workspace.
 *       '404':
 *         description: Not Found - The workspace does not exist.
 *       '429':
 *         description: Too Many Requests.
 */
router.get('/:workspaceId/metrics', managerController.getWorkspaceMetrics);

export default router;