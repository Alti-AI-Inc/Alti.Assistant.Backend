import express from 'express';
import { body, param, validationResult } from 'express-validator';

// In a real application, these would be implemented to handle authentication,
// authorization, and database interactions. We assume they exist for this file.
import { authMiddleware, checkManagerRole } from '../middleware/auth.js';
import WorkspaceService from '../services/workspaceService.js';
import TeamService from '../services/teamService.js';
import InvitationService from '../services/invitationService.js';

/**
 * Express router for handling Manager Dashboard features.
 * This router is scoped to a manager's capabilities within their own workspace,
 * covering team management, invitations, and metrics.
 * @type {express.Router}
 */
const router = express.Router();

// Apply authentication and role-checking middleware to all routes in this file.
// This ensures that only authenticated users with a 'manager' role can access these endpoints.
router.use(authMiddleware, checkManagerRole);

/**
 * A helper middleware to centralize handling of validation errors from express-validator.
 * @param {express.Request} req - The request object.
 * @param {express.Response} res - The response object.
 * @param {express.NextFunction} next - The next middleware function.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

/**
 * @swagger
 * /api/manager/team:
 *   get:
 *     summary: Retrieve the list of team members in the manager's workspace.
 *     description: Fetches all users associated with the authenticated manager's workspace.
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of team members.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 team:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       role:
 *                         type: string
 *       403:
 *         description: Forbidden. User is not a manager or does not have access to the workspace.
 *       500:
 *         description: Internal server error.
 */
router.get('/team', async (req, res) => {
  try {
    // The manager's workspaceId is attached to the request object by the auth middleware.
    const { workspaceId } = req.user;
    const teamMembers = await TeamService.getTeamMembers(workspaceId);

    // The TeamService should handle projecting the data to ensure sensitive
    // information (e.g., password hashes) is not returned.
    res.json({ success: true, team: teamMembers });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve team members.' });
  }
});

/**
 * @swagger
 * /api/manager/invitations:
 *   post:
 *     summary: Invite a new member to the workspace.
 *     description: Sends an invitation email to a new user and adds them to the team, respecting plan limits.
 *     tags:
 *       - Manager Dashboard
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
 *                 description: The email of the user to invite.
 *                 example: "new.member@example.com"
 *               role:
 *                 type: string
 *                 description: The role to assign to the new member ('member' or 'manager').
 *                 enum: [member, manager]
 *                 example: "member"
 *     responses:
 *       201:
 *         description: Invitation sent successfully.
 *       400:
 *         description: Invalid input (e.g., bad email format, invalid role).
 *       403:
 *         description: Plan limit exceeded. Cannot add more members.
 *       409:
 *         description: User is already a member of the workspace.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/invitations',
  [
    body('email').isEmail().normalizeEmail().withMessage('A valid email is required.'),
    body('role').isIn(['member', 'manager']).withMessage("Role must be either 'member' or 'manager'."),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, role } = req.body;
      const { workspaceId, id: inviterId } = req.user;

      // Critical check: Verify the workspace's current plan allows for more members.
      // This prevents managers from exceeding their subscribed plan limits.
      const canAddMember = await WorkspaceService.checkPlanLimits(workspaceId);
      if (!canAddMember) {
        return res.status(403).json({
          success: false,
          error: 'Plan limit reached. Please upgrade your plan to add more members.',
        });
      }

      // Proceed with the invitation logic, handled by a dedicated service.
      const invitation = await InvitationService.createAndSendInvitation({
        workspaceId,
        email,
        role,
        inviterId,
      });

      res.status(201).json({ success: true, message: 'Invitation sent successfully.', invitation });
    } catch (error) {
      console.error('Error sending invitation:', error);
      // Handle specific, expected errors, like a user already being in the workspace.
      if (error.name === 'ConflictError') {
        return res.status(409).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: 'Failed to send invitation.' });
    }
  }
);

/**
 * @swagger
 * /api/manager/team/{memberId}/role:
 *   put:
 *     summary: Update a team member's role.
 *     description: Changes the role of an existing member within the manager's workspace.
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the team member to update.
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
 *                 description: The new role for the member ('member' or 'manager').
 *                 enum: [member, manager]
 *                 example: "manager"
 *     responses:
 *       200:
 *         description: Role updated successfully.
 *       400:
 *         description: Invalid input (e.g., invalid memberId or role).
 *       403:
 *         description: Forbidden. A manager cannot change their own role via this endpoint.
 *       404:
 *         description: Team member not found in the workspace.
 *       500:
 *         description: Internal server error.
 */
router.put(
  '/team/:memberId/role',
  [
    param('memberId').isMongoId().withMessage('A valid member ID is required.'),
    body('role').isIn(['member', 'manager']).withMessage("Role must be either 'member' or 'manager'."),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { memberId } = req.params;
      const { role } = req.body;
      const { workspaceId, id: managerId } = req.user;

      // Security check: A manager cannot change their own role.
      if (memberId === managerId) {
        return res.status(403).json({ success: false, error: 'Managers cannot change their own role.' });
      }

      const updatedMember = await TeamService.updateMemberRole(workspaceId, memberId, role);

      if (!updatedMember) {
        return res.status(404).json({ success: false, error: 'Team member not found in this workspace.' });
      }

      res.json({ success: true, message: 'Member role updated successfully.', member: updatedMember });
    } catch (error) {
      console.error('Error updating member role:', error);
      res.status(500).json({ success: false, error: 'Failed to update member role.' });
    }
  }
);

/**
 * @swagger
 * /api/manager/team/{memberId}:
 *   delete:
 *     summary: Remove a team member from the workspace.
 *     description: Deletes a user's association with the workspace. This is a permanent action.
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the team member to remove.
 *     responses:
 *       200:
 *         description: Member removed successfully.
 *       400:
 *         description: Invalid memberId.
 *       403:
 *         description: Forbidden. Cannot remove yourself from the workspace.
 *       404:
 *         description: Team member not found in the workspace.
 *       500:
 *         description: Internal server error.
 */
router.delete(
  '/team/:memberId',
  [param('memberId').isMongoId().withMessage('A valid member ID is required.')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { memberId } = req.params;
      const { workspaceId, id: managerId } = req.user;

      // Security check: A manager cannot remove themselves.
      if (memberId === managerId) {
        return res.status(403).json({ success: false, error: 'You cannot remove yourself from the workspace.' });
      }

      const result = await TeamService.removeMember(workspaceId, memberId);

      if (!result.success) {
        return res.status(404).json({ success: false, error: 'Team member not found in this workspace.' });
      }

      res.json({ success: true, message: 'Team member removed successfully.' });
    } catch (error) {
      console.error('Error removing team member:', error);
      res.status(500).json({ success: false, error: 'Failed to remove team member.' });
    }
  }
);

/**
 * @swagger
 * /api/manager/metrics:
 *   get:
 *     summary: Retrieve key metrics for the workspace.
 *     description: Fetches non-sensitive, operational metrics for the manager's dashboard. This endpoint explicitly avoids exposing any billing or payment information.
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workspace metrics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 metrics:
 *                   type: object
 *                   properties:
 *                     totalMembers:
 *                       type: integer
 *                     activeMembersLast30Days:
 *                       type: integer
 *                     conversationsThisMonth:
 *                       type: integer
 *                     apiCallsThisMonth:
 *                       type: integer
 *       500:
 *         description: Internal server error.
 */
router.get('/metrics', async (req, res) => {
  try {
    const { workspaceId } = req.user;

    // Fetch metrics from a dedicated service. This service is responsible for
    // aggregating data and ensuring no sensitive or billing-related information is exposed.
    const metrics = await WorkspaceService.getDashboardMetrics(workspaceId);

    res.json({ success: true, metrics });
  } catch (error) {
    console.error('Error fetching workspace metrics:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve workspace metrics.' });
  }
});

/**
 * Exports the Express router for Manager Dashboard API routes.
 * @exports router
 */
export default router;