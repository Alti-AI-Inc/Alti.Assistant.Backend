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
  param('workspaceId').isMongoId().withMessage('Invalid workspace ID format.'),
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
 */
router.patch(
  '/:workspaceId/team/:memberId',
  [
    param('memberId').isMongoId().withMessage('Invalid member ID format.'),
    body('role')
      .notEmpty()
      .isIn(['admin', 'member']) // Example roles; should match the application's role schema.
      .withMessage('Invalid role specified. Must be one of: admin, member.'),
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
 */
router.delete(
  '/:workspaceId/team/:memberId',
  param('memberId').isMongoId().withMessage('Invalid member ID format.'),
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
 */
router.post(
  '/:workspaceId/invitations',
  [
    body('email').isEmail().normalizeEmail().withMessage('A valid email address is required.'),
    body('role')
      .isIn(['admin', 'member'])
      .withMessage('Invalid role specified. Must be one of: admin, member.'),
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
 */
router.delete(
  '/:workspaceId/invitations/:invitationId',
  param('invitationId').isMongoId().withMessage('Invalid invitation ID format.'),
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
 */
router.get('/:workspaceId/metrics', managerController.getWorkspaceMetrics);

export default router;