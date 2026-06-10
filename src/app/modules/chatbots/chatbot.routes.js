import express from 'express';
// SECURITY-PATCH: Import validation and sanitization functions from express-validator.
// This provides a robust way to validate incoming data against various rules (e.g., format, type, content)
// and sanitize it to prevent injection attacks like XSS or NoSQL injection.
import { body, param, validationResult } from 'express-validator';
// SECURITY-PATCH: Import helmet to set various security-related HTTP headers.
// This helps protect the application from common web vulnerabilities like XSS, clickjacking, etc.
import helmet from 'helmet';
import { chatbotController } from './chatbot.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { checkPlanLimits } from '../../middlewares/subscription/planLimits.js';
import { requireWorkspace } from '../../middlewares/workspace/requireWorkspace.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';

const router = express.Router();

// SECURITY-PATCH: Apply helmet middleware to set secure HTTP headers for all routes in this router.
// Headers like Content-Security-Policy, X-Content-Type-Options, and Strict-Transport-Security
// provide an additional layer of defense in the browser against common attacks.
router.use(helmet());

/**
 * Middleware to handle validation errors from express-validator.
 * It checks for validation errors on the request object. If any exist,
 * it sends a 400 Bad Request response with the errors. Otherwise, it passes
 * control to the next middleware.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// IMPROVEMENT: To align with the Manager Platform requirements, this file is updated to use an explicit 'MANAGER' role
// for workspace-level administration, replacing the more ambiguous 'ADMIN' role.
// All operations are now scoped to a workspace, and plan limits are enforced.

// This middleware ensures that all subsequent routes operate within a specific workspace context.
// It should be responsible for identifying the workspace (e.g., from a subdomain or user session)
// and attaching it to the request object for use in controllers and services.
// This is crucial for security and multi-tenancy.
router.use(requireWorkspace);

/**
 * Validation middleware chain for creating a new chatbot.
 * Ensures that the `name` is a non-empty, trimmed, and escaped string,
 * and that the `config` is an object.
 * @type {import('express-validator').ValidationChain[]}
 */
const createChatbotValidation = [
  body('name').trim().notEmpty().withMessage('Chatbot name is required.').escape(),
  body('config').isObject().withMessage('Config must be an object.'),
];

/**
 * @openapi
 * /chatbots:
 *   post:
 *     summary: Create a new chatbot in the workspace
 *     description: >
 *       Creates a new chatbot instance within the user's current workspace.
 *       Accessible by MANAGER and USER roles. Creation is subject to the workspace's subscription plan limits.
 *       SUPER_ADMINs can also create chatbots, typically for administrative purposes.
 *     tags: [Chatbots]
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
 *                 example: "Customer Support Bot"
 *               config:
 *                 type: object
 *                 example: {}
 *     responses:
 *       201:
 *         description: Chatbot created successfully
 *       400:
 *         description: Bad Request - Invalid input data
 *       401:
 *         description: Unauthorized
 *       402:
 *         description: Payment Required - Plan limit for chatbots exceeded
 *       403:
 *         description: Forbidden - Insufficient permissions
 *   get:
 *     summary: Get all chatbots in the workspace
 *     description: >
 *       Retrieves a list of chatbots within the current workspace.
 *       - USERS will only see chatbots they have created or been given access to.
 *       - MANAGERS will see all chatbots within their workspace.
 *       - SUPER_ADMINS can see all chatbots across all workspaces (this may require a separate admin-specific endpoint).
 *     tags: [Chatbots]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of chatbots retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router
  .route('/')
  .post(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.MANAGER, ENUM_USER_ROLE.SUPER_ADMIN),
    checkPlanLimits('chatbot'), // Middleware to verify the workspace plan allows creating another chatbot.
    // SECURITY-PATCH: Apply validation and error handling middleware before the controller.
    createChatbotValidation,
    handleValidationErrors,
    chatbotController.createChatbot
  )
  .get(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.MANAGER, ENUM_USER_ROLE.SUPER_ADMIN),
    chatbotController.getChatbots
  );

/**
 * Validation middleware chain for a chatbot ID provided as a URL parameter.
 * Ensures the `id` parameter is a valid MongoDB ObjectId.
 * @type {import('express-validator').ValidationChain[]}
 */
const chatbotIdValidation = [
  param('id').isMongoId().withMessage('Invalid chatbot ID format.'),
];

/**
 * Validation middleware chain for updating an existing chatbot.
 * Validates `name` and `config` fields if they are provided in the request body.
 * @type {import('express-validator').ValidationChain[]}
 */
const updateChatbotValidation = [
  body('name').optional().trim().notEmpty().withMessage('Chatbot name cannot be empty.').escape(),
  body('config').optional().isObject().withMessage('Config must be an object.'),
];

/**
 * @openapi
 * /chatbots/{id}:
 *   get:
 *     summary: Get chatbot by ID
 *     description: Retrieves details of a specific chatbot by its ID. Access is scoped to the user's current workspace.
 *     tags: [Chatbots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The chatbot ID
 *     responses:
 *       200:
 *         description: Chatbot details retrieved successfully
 *       400:
 *         description: Bad Request - Invalid ID format
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not part of the workspace or insufficient permissions
 *       404:
 *         description: Chatbot not found
 *   patch:
 *     summary: Update chatbot by ID
 *     description: >
 *       Updates an existing chatbot.
 *       - USERS can update chatbots they created.
 *       - MANAGERS and SUPER_ADMINS can update any chatbot in the workspace.
 *     tags: [Chatbots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The chatbot ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               config:
 *                 type: object
 *     responses:
 *       200:
 *         description: Chatbot updated successfully
 *       400:
 *         description: Bad Request - Invalid input data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Chatbot not found
 *   delete:
 *     summary: Delete chatbot by ID
 *     description: >
 *       Deletes a specific chatbot.
 *       - USERS can delete chatbots they created.
 *       - MANAGERS and SUPER_ADMINS can delete any chatbot in the workspace.
 *     tags: [Chatbots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The chatbot ID
 *     responses:
 *       200:
 *         description: Chatbot deleted successfully
 *       400:
 *         description: Bad Request - Invalid ID format
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Chatbot not found
 */
router
  .route('/:id')
  .get(
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.MANAGER, ENUM_USER_ROLE.SUPER_ADMIN),
    // SECURITY-PATCH: Apply ID validation and error handling.
    chatbotIdValidation,
    handleValidationErrors,
    chatbotController.getChatbotById
  )
  .patch(
    // HIERARCHY-FIX: Allow USER role to modify chatbots. The controller must enforce ownership.
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.MANAGER, ENUM_USER_ROLE.SUPER_ADMIN),
    // SECURITY-PATCH: Apply ID and body validation and error handling.
    chatbotIdValidation,
    updateChatbotValidation,
    handleValidationErrors,
    // HIERARCHY-FIX: The controller is responsible for verifying that a USER can only update
    // their own chatbot, while a MANAGER can update any chatbot within their workspace.
    chatbotController.updateChatbot
  )
  .delete(
    // HIERARCHY-FIX: Allow USER role to delete chatbots. The controller must enforce ownership.
    auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.MANAGER, ENUM_USER_ROLE.SUPER_ADMIN),
    // SECURITY-PATCH: Apply ID validation and error handling.
    chatbotIdValidation,
    handleValidationErrors,
    // HIERARCHY-FIX: The controller is responsible for verifying that a USER can only delete
    // their own chatbot, while a MANAGER can delete any chatbot within their workspace.
    chatbotController.deleteChatbot
  );

// ARCHITECTURE NOTE: The following routes for the Manager Dashboard are included here to provide a complete solution
// as requested. In a production application, these would be logically separated into their own modules and files
// (e.g., `team.routes.js`, `workspace.routes.js`) for better maintainability and separation of concerns.

/**
 * Express sub-router for manager-specific dashboard endpoints.
 * All routes under this router require MANAGER or SUPER_ADMIN role.
 * @type {import('express').Router}
 */
const managerRouter = express.Router();

// All manager-specific routes require the user to be a MANAGER or SUPER_ADMIN and operate within the workspace context.
managerRouter.use(auth(ENUM_USER_ROLE.MANAGER, ENUM_USER_ROLE.SUPER_ADMIN));

/**
 * @openapi
 * /manager/metrics:
 *   get:
 *     summary: Get workspace metrics
 *     description: Retrieves key metrics for the current workspace, such as chatbot usage, user activity, and other relevant analytics.
 *     tags: [Manager Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workspace metrics retrieved successfully.
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
managerRouter.get('/metrics', (req, res) => {
  // Placeholder for workspaceController.getMetrics
  res.status(200).json({
    message: 'Metrics retrieved successfully',
    data: { chatbotCount: 10, messagesSent: 1250, activeUsers: 5 },
  });
});

/**
 * @openapi
 * /manager/team/members:
 *   get:
 *     summary: Get all team members in the workspace
 *     description: Retrieves a list of all members, including their roles, within the manager's workspace.
 *     tags: [Manager Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Team members list retrieved successfully.
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
managerRouter.get('/team/members', (req, res) => {
  // Placeholder for teamController.getMembers
  res.status(200).json({
    message: 'Team members retrieved',
    data: [{ id: 'user-123', email: 'member@example.com', role: 'user' }],
  });
});

/**
 * Validation middleware chain for a user ID provided as a URL parameter.
 * Ensures the `userId` parameter is a valid MongoDB ObjectId.
 * @type {import('express-validator').ValidationChain[]}
 */
const userIdValidation = [
  param('userId').isMongoId().withMessage('Invalid user ID format.'),
];

/**
 * Validation middleware chain for updating a team member's role.
 * Ensures the `role` field in the request body is one of the permitted values.
 * @type {import('express-validator').ValidationChain[]}
 */
const updateRoleValidation = [
  body('role')
    .isIn([ENUM_USER_ROLE.USER, ENUM_USER_ROLE.MANAGER])
    .withMessage('Invalid role specified.'),
];

/**
 * @openapi
 * /manager/team/members/{userId}/role:
 *   patch:
 *     summary: Update a team member's role
 *     description: Updates the role of a specific member within the workspace (e.g., from USER to MANAGER). A manager cannot change their own role or affect other managers unless they have higher privileges.
 *     tags: [Manager Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, manager]
 *                 example: "user"
 *     responses:
 *       200:
 *         description: User role updated successfully.
 *       400:
 *         description: Bad Request - Invalid user ID or role
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (e.g., trying to demote another manager or self)
 *       404:
 *         description: User not found in workspace.
 */
managerRouter.patch(
  '/team/members/:userId/role',
  // SECURITY-PATCH: Apply ID and body validation and error handling.
  userIdValidation,
  updateRoleValidation,
  handleValidationErrors,
  (req, res) => {
    // Placeholder for teamController.updateMemberRole
    // SECURITY-PATCH: Removed reflected user input from the response message.
    // This is a defense-in-depth measure against potential misuse on the client-side,
    // even with a JSON content type.
    res.status(200).json({ message: 'User role updated successfully.' });
  }
);

/**
 * Validation middleware chain for inviting a new member to the workspace.
 * Validates and normalizes the `email` and checks that the `role` (if provided) is valid.
 * @type {import('express-validator').ValidationChain[]}
 */
const inviteMemberValidation = [
  body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('role')
    .optional()
    .isIn([ENUM_USER_ROLE.USER, ENUM_USER_ROLE.MANAGER])
    .withMessage('Invalid role specified.'),
];

/**
 * @openapi
 * /manager/team/invitations:
 *   post:
 *     summary: Invite a new member to the workspace
 *     description: Sends an invitation to a new member to join the current workspace. This action is checked against the workspace's subscription plan user limit.
 *     tags: [Manager Dashboard]
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
 *                 example: "new.user@example.com"
 *               role:
 *                 type: string
 *                 enum: [user, manager]
 *                 default: "user"
 *     responses:
 *       201:
 *         description: Invitation sent successfully.
 *       400:
 *         description: Bad Request - Invalid email or role
 *       401:
 *         description: Unauthorized
 *       402:
 *         description: Payment Required - User limit for the current plan has been reached.
 *       403:
 *         description: Forbidden
 *       409:
 *         description: Conflict - User is already a member of the workspace.
 */
managerRouter.post(
  '/team/invitations',
  checkPlanLimits('user'),
  // SECURITY-PATCH: Apply body validation and error handling.
  inviteMemberValidation,
  handleValidationErrors,
  (req, res) => {
    // Placeholder for teamController.inviteMember
    // SECURITY-PATCH: Removed reflected user input from the response message.
    // The sanitized email is available in `req.body.email` for the controller to use.
    res.status(201).json({ message: 'Invitation sent successfully.' });
  }
);

// NOTE: Billing-related routes are intentionally omitted. They would be defined in a separate module
// with access restricted to workspace OWNERS or SUPER_ADMINS, ensuring managers without billing permissions
// cannot access sensitive financial information, in accordance with the requirements.

router.use('/manager', managerRouter);

/**
 * Express router for chatbot and manager-related endpoints.
 * This module encapsulates both chatbot CRUD operations and the core features
 * for the Manager Dashboard, including team, metrics, and invitation management.
 * All routes are protected by authentication and scoped to a workspace.
 *
 * @namespace chatbotRoutes
 * @type {import('express').Router}
 */
export const chatbotRoutes = router;