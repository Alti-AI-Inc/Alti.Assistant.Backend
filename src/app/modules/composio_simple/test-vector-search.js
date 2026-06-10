/**
 * Manager Dashboard API Routes
 *
 * This file defines the API endpoints for manager-specific functionalities,
 * including team management, member invitations, role updates, and viewing
 * workspace metrics.
 *
 * All routes are protected and require the user to be an authenticated manager
 * of the specified workspace.
 */

import { Router } from 'express';
import { body, param } from 'express-validator';

// In a real application, these would be imported from their respective files.
// For this example, they represent the controller and middleware logic.
import * as managerController from '../controllers/manager.controller.js';
import { isAuthenticated, isWorkspaceManager } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validation.middleware.js';
import { checkPlanLimits } from '../middleware/plan.middleware.js';

const router = Router();

// This middleware chain applies to all routes defined in this file.
// 1. `isAuthenticated`: Ensures the user is logged in.
// 2. `param('workspaceId').isMongoId()`: Validates the workspace ID format.
// 3. `validateRequest`: Handles any validation errors from the previous step.
// 4. `isWorkspaceManager`: Verifies that the authenticated user has a 'manager' or 'owner' role
//    for the workspace specified by `:workspaceId`. This is the primary authorization check.
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

// GET /api/manager/:workspaceId/team
// Fetches all members of the workspace. The controller ensures that sensitive
// user data is not exposed, returning only necessary information like id, name, email, and role.
router.get('/:workspaceId/team', managerController.getTeamMembers);

// PATCH /api/manager/:workspaceId/team/:memberId
// Updates the role of a specific team member.
// The controller logic must prevent a manager from changing their own role
// or the role of the workspace owner to ensure system integrity.
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

// DELETE /api/manager/:workspaceId/team/:memberId
// Removes a member from the workspace.
// The controller must include logic to prevent a manager from removing themselves
// or the workspace owner.
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

// POST /api/manager/:workspaceId/invitations
// Invites a new member to the workspace by email.
// The `checkPlanLimits` middleware is crucial here. It runs before the controller
// to verify that adding a new member will not exceed the workspace's subscription plan limits.
// If the limit is reached, it will return an error and prevent the invitation.
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

// GET /api/manager/:workspaceId/invitations
// Lists all pending invitations for the workspace, allowing managers to see
// who has been invited but has not yet joined.
router.get('/:workspaceId/invitations', managerController.getPendingInvitations);

// DELETE /api/manager/:workspaceId/invitations/:invitationId
// Revokes a pending invitation. This is useful if an invitation was sent
// in error or is no longer needed.
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

// GET /api/manager/:workspaceId/metrics
// Retrieves key performance and usage metrics for the workspace.
// This endpoint is strictly for operational metrics (e.g., API calls used,
// active projects, storage consumed). It is designed to NEVER expose any
// billing, subscription, or payment information, ensuring a secure separation
// of concerns between management and billing roles.
router.get('/:workspaceId/metrics', managerController.getWorkspaceMetrics);

export default router;