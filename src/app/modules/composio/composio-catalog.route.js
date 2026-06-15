import express from 'express';
// SECURITY: Import express-validator for robust input validation and sanitization.
import { body, param, validationResult } from 'express-validator';

// --- Middleware Imports ---
// NOTE: These are assumed to exist in the project structure. Adjust paths as necessary.

// Authentication middleware to verify JWT and attach user context to the request.
import { authMiddleware } from '../auth/auth.middleware.js';
// Authorization middleware to ensure the authenticated user has 'manager' privileges.
import { managerMiddleware } from './manager.middleware.js';
// Middleware to check actions against the current workspace's subscription plan limits.
import { planLimitMiddleware } from '../billing/planLimit.middleware.js';

// --- Controller Import ---
// The controller encapsulates the business logic for manager-specific actions.
import { managerController } from '../manager/manager.controller.js';

const router = express.Router();

/**
 * Utility to wrap asynchronous route handlers for robust error handling.
 * Catches errors from async functions and passes them to Express's central error middleware.
 * @param {Function} fn The asynchronous route handler.
 * @returns {Function} A wrapped route handler that Express can execute.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Middleware to handle validation errors from express-validator.
 * If validation errors exist, it halts the request and sends a 422 Unprocessable Entity response.
 * @param {import('express').Request} req The Express request object.
 * @param {import('express').Response} res The Express response object.
 * @param {import('express').NextFunction} next The Express next middleware function.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  const extractedErrors = errors.array().map(err => ({ [err.param || 'general']: err.msg }));
  return res.status(422).json({
    message: 'Input validation failed.',
    errors: extractedErrors,
  });
};


// --- Manager Dashboard Routes ---

// OPTIMIZATION: The routes have been refactored to specifically address Manager Dashboard features.
// The original file content was unrelated to team and workspace management.
// This new structure provides dedicated, secure, and validated endpoints for core manager responsibilities.

/**
 * @swagger
 * /api/manager/team:
 *   get:
 *     summary: Get team members
 *     description: Retrieves a list of all members within the manager's workspace.
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: An array of team member objects.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a manager.
 */
router.get(
  '/team',
  authMiddleware,
  managerMiddleware, // SECURITY: Ensures only managers can access team data.
  asyncHandler(managerController.getTeamMembers)
);


/**
 * @swagger
 * /api/manager/invitations:
 *   post:
 *     summary: Invite a new member to the workspace
 *     description: Creates and sends an invitation to a new member. This action is checked against the workspace's plan limits before proceeding.
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
 *                 format: email
 *                 description: The email address of the user to invite.
 *               role:
 *                 type: string
 *                 enum: [member, viewer]
 *                 description: The role to assign to the new member.
 *     responses:
 *       201:
 *         description: Invitation sent successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a manager or plan limit for team members has been exceeded.
 *       422:
 *         description: Validation error (e.g., invalid email or role).
 */
router.post(
  '/invitations',
  authMiddleware,
  managerMiddleware, // SECURITY: Only managers can send invitations.
  // VERIFICATION: Checks if the plan's user limit has been reached before inviting a new member.
  planLimitMiddleware('team_members'),
  [
    // SECURITY: Validate and sanitize email to prevent injection and ensure correctness.
    body('email')
      .trim()
      .isEmail()
      .withMessage('Must be a valid email address.')
      .normalizeEmail(),
    // SECURITY: Validate the role to ensure it's one of the allowed values, preventing privilege escalation.
    body('role')
      .trim()
      .isIn(['member', 'viewer'])
      .withMessage('Invalid role specified. Must be "member" or "viewer".')
      .escape(),
  ],
  validate,
  asyncHandler(managerController.inviteMember)
);

/**
 * @swagger
 * /api/manager/metrics:
 *   get:
 *     summary: Get workspace metrics
 *     description: Retrieves key performance indicators and usage statistics for the manager's workspace.
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: An object containing workspace metrics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activeUsers:
 *                   type: number
 *                 projectsCount:
 *                   type: number
 *                 apiUsage:
 *                   type: object
 *                   properties:
 *                     currentCycleCount:
 *                       type: number
 *                     limit:
 *                       type: number
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a manager.
 */
router.get(
  '/metrics',
  authMiddleware,
  managerMiddleware, // SECURITY: Workspace metrics are sensitive and restricted to managers.
  asyncHandler(managerController.getWorkspaceMetrics)
);

/**
 * @swagger
 * /api/manager/members/{memberId}/role:
 *   patch:
 *     summary: Update a team member's role
 *     description: Allows a manager to change the role of another member in their workspace. Managers cannot change their own role or escalate others to a manager role via this endpoint.
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
 *           format: uuid
 *         description: The unique identifier of the team member to update.
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
 *                 enum: [member, viewer]
 *                 description: The new role for the team member.
 *     responses:
 *       200:
 *         description: Role updated successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a manager.
 *       404:
 *         description: Team member not found in the workspace.
 *       422:
 *         description: Validation error (e.g., invalid role or memberId).
 */
router.patch(
  '/members/:memberId/role',
  authMiddleware,
  managerMiddleware, // SECURITY: Role management is a privileged action restricted to managers.
  [
    // SECURITY: Validate the memberId from the URL path to ensure it's a valid format (e.g., UUID) to prevent injection attacks.
    param('memberId')
      .isUUID()
      .withMessage('Invalid member ID format.'),
    // SECURITY: Validate the new role from the request body to a predefined list.
    body('role')
      .trim()
      .isIn(['member', 'viewer'])
      .withMessage('Invalid role specified. Must be "member" or "viewer".')
      .escape(),
  ],
  validate,
  asyncHandler(managerController.updateMemberRole)
);

// VERIFICATION: No routes related to billing or payment information are exposed in this module,
// ensuring managers are properly sandboxed and cannot access sensitive financial data.

/**
 * @typedef {import('express').Router} Router
 */

/**
 * The Express router for Manager Dashboard API routes.
 * This router handles all manager-specific functionalities including
 * team management, invitations, and viewing workspace metrics.
 * It is secured to ensure only authenticated users with a 'manager' role can access these endpoints.
 *
 * @type {Router}
 */
export const composioCatalogRoutes = router;