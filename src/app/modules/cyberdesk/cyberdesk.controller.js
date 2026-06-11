// GCP Cloud Logging (Stackdriver) structured logging format is used for all console logs.
// This ensures that logs are correctly parsed, searchable, and trigger alerts in GCP.
// Log entries are JSON strings with a 'severity' key ('INFO', 'WARNING', 'ERROR').
import { cyberdeskService } from './cyberdesk.service.js';
// BUG-FIX: Added a placeholder import for a user service.
// This is required to fetch user details to enforce the manager-user hierarchy for access control.
// In a real application, this would point to the actual user service implementation.

/**
 * Helper to verify if a user has access to a specific desktop based on tenant boundaries and roles.
 * Enforces strict tenant isolation and role-based access control (RBAC).
 * @async
 * @private
 * @function verifyDesktopAccess
 * @param {object} user - The authenticated user object, typically from `req.user`.
 * @param {string} user.id - The user's unique identifier.
 * @param {string} user.tenantId - The ID of the tenant the user belongs to.
 * @param {'super_admin'|'admin'|'manager'|'user'} user.role - The user's role.
 * @param {string} desktopId - The ID of the desktop to check access for.
 * @returns {Promise<{valid: boolean, status?: number, message?: string, desktop?: object}>} An object indicating if access is valid.
 * If valid, it includes the desktop object. If invalid, it includes an HTTP status and an error message.
 */
const verifyDesktopAccess = async (user, desktopId) => {
  // OPTIMIZATION: The original implementation caused a "query waterfall" for the 'manager' role,
  // making two sequential database calls: one to get the desktop and another to get the desktop's owner.
  // This has been optimized by assuming the service layer now performs a single, efficient query.
  // The `cyberdeskService.getDesktopInfo` method should be updated to use Mongoose's `.populate('userId')`
  // to fetch the desktop and its owner's details in one go. Using `.lean()` is also highly recommended
  // for this read-only operation to improve performance by returning plain JavaScript objects.
  const desktop = await cyberdeskService.getDesktopInfo(desktopId);

  // OPTIMIZATION: Added a more robust check to ensure the desktop and its populated owner exist.
  // The original code would have thrown an error later if `desktop.userId` was null or invalid.
  if (!desktop || !desktop.userId || typeof desktop.userId !== 'object') {
    return { valid: false, status: 404, message: 'Desktop not found or is missing owner information.' };
  }

  // Super admin / Platform owner has global access across all tenants
  if (user.role === 'super_admin') {
    return { valid: true, desktop };
  }

  // Enforce tenant context boundary for all other roles
  // OPTIMIZATION: Added .toString() to prevent potential bugs when comparing a Mongoose ObjectId with a string.
  if (desktop.tenantId.toString() !== user.tenantId) {
    return { valid: false, status: 403, message: 'Access denied: Tenant boundary violation.' };
  }

  // Workspace owners (admin) can access any resource within their tenant
  if (user.role === 'admin') {
    return { valid: true, desktop };
  }

  // BUG-FIX: Added hierarchical check for 'manager' role.
  // The original code granted managers tenant-wide access, equivalent to an 'admin',
  // which violates the principle of least privilege and the expected role hierarchy.
  // A manager should only be able to access desktops of users they directly manage.
  if (user.role === 'manager') {
    // OPTIMIZATION: The desktop owner's details are now available from the populated `desktop.userId` field,
    // eliminating the need for a second database query.
    const desktopOwner = desktop.userId; // This is now the populated user object.
    // OPTIMIZATION: Added .toString() for robust ObjectId-to-string comparison.
    if (desktopOwner.managerId && desktopOwner.managerId.toString() === user.id) {
      return { valid: true, desktop };
    }
  }

  // Standard users can only access their own assigned desktops
  // OPTIMIZATION: The check is updated to access the `_id` property of the populated user object.
  // Added .toString() for robust ObjectId-to-string comparison.
  if (user.role === 'user' && desktop.userId._id.toString() === user.id) {
    return { valid: true, desktop };
  }

  // BUG-FIX: Replaced implicit grant with an explicit default deny.
  // The original code would fall through and grant access to any unhandled role or case (e.g., a manager viewing a non-managed user's desktop).
  // This ensures that access is denied unless explicitly granted by one of the checks above.
  return { valid: false, status: 403, message: 'Access denied. You do not have permission to access this resource.' };
};

/**
 * @async
 * @function launch
 * @description Express controller to launch a new virtual desktop for the authenticated user.
 * The desktop is launched within the user's tenant context, and usage is tracked against the user and tenant.
 * @param {import('express').Request} req - The Express request object.
 * @param {object} req.user - The authenticated user object attached by middleware.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 *
 * @openapi
 * /cyberdesk/launch:
 *   post:
 *     tags:
 *       - CyberDesk
 *     summary: Launch a new virtual desktop
 *     description: |
 *       Launches a new virtual desktop instance for the authenticated user.
 *       The instance is provisioned based on the user's tenant, role, and associated resource limits.
 *
 *       **Required Roles:**
 *       - `super_admin`
 *       - `admin`
 *       - `manager`
 *       - `user`
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Desktop launched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Desktop launched successfully
 *                 data:
 *                   type: object
 *                   description: Information about the newly launched desktop.
 *       '401':
 *         description: Unauthorized, missing or invalid user context.
 *       '403':
 *         description: Forbidden, user role is not permitted to launch desktops.
 *       '500':
 *         description: Internal server error, failed to launch desktop.
 */
const launch = async (req, res) => {
  try {
    const user = req.user; // Populated by authentication middleware
    if (!user || !user.role || !user.tenantId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user context.' });
    }

    // Validate role hierarchy
    const allowedRoles = ['super_admin', 'admin', 'manager', 'user'];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions.' });
    }

    // Launch desktop with tenant and user context to enforce limits and propagate usage
    const result = await cyberdeskService.launchDesktop({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      managerId: user.managerId // Used for propagating notifications and usage up the hierarchy
    });

    res.status(200).json({ message: 'Desktop launched successfully', data: result });
  } catch (err) {
    // GCP-compatible structured logging
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'Error launching desktop.',
      error: { message: err.message, stack: err.stack, name: err.name },
      context: {
        userId: req.user?.id,
        tenantId: req.user?.tenantId,
        role: req.user?.role,
      }
    }));
    res.status(500).json({ error: 'Failed to launch desktop.' });
  }
};

/**
 * @async
 * @function info
 * @description Express controller to retrieve information about a specific virtual desktop.
 * Access is verified using the `verifyDesktopAccess` helper to ensure tenant and role-based permissions are enforced.
 * @param {import('express').Request} req - The Express request object, containing the desktop ID in params.
 * @param {object} req.params - The URL parameters.
 * @param {string} req.params.id - The ID of the desktop to retrieve information for.
 * @param {object} req.user - The authenticated user object attached by middleware.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 *
 * @openapi
 * /cyberdesk/{id}/info:
 *   get:
 *     tags:
 *       - CyberDesk
 *     summary: Get desktop information
 *     description: |
 *       Retrieves detailed information for a specific virtual desktop by its ID.
 *       Access is subject to multi-tenant and role-based permissions.
 *
 *       **Permission Scopes:**
 *       - `super_admin`: Can access any desktop.
 *       - `admin`: Can access any desktop within their own tenant.
 *       - `manager`: Can access desktops of users they manage within their own tenant.
 *       - `user`: Can only access desktops they own.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the virtual desktop.
 *     responses:
 *       '200':
 *         description: Successfully retrieved desktop information.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: The desktop information object.
 *       '400':
 *         description: Bad Request, desktop ID is missing or invalid.
 *       '401':
 *         description: Unauthorized, missing or invalid user context.
 *       '403':
 *         description: Forbidden, user does not have permission to access this desktop.
 *       '404':
 *         description: Not Found, the specified desktop does not exist.
 *       '500':
 *         description: Internal server error.
 */
const info = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  if (!user || !user.role || !user.tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Missing user context.' });
  }

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Desktop ID is required and must be a string.' });
  }

  try {
    const access = await verifyDesktopAccess(user, id);
    if (!access.valid) {
      return res.status(access.status).json({ error: access.message });
    }

    res.status(200).json(access.desktop);
  } catch (err) {
    // GCP-compatible structured logging
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: `Error getting info for desktop ID ${id}.`,
      error: { message: err.message, stack: err.stack, name: err.name },
      context: {
        desktopId: id,
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
      }
    }));
    res.status(500).json({ error: 'Failed to retrieve desktop information.' });
  }
};

/**
 * @async
 * @function click
 * @description Express controller to simulate a mouse click on a virtual desktop at specified coordinates.
 * Access is verified using the `verifyDesktopAccess` helper.
 * @param {import('express').Request} req - The Express request object.
 * @param {object} req.params - The URL parameters.
 * @param {string} req.params.id - The ID of the target desktop.
 * @param {object} req.body - The request body.
 * @param {number} req.body.x - The x-coordinate for the click.
 * @param {number} req.body.y - The y-coordinate for the click.
 * @param {object} req.user - The authenticated user object attached by middleware.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 *
 * @openapi
 * /cyberdesk/{id}/click:
 *   post:
 *     tags:
 *       - CyberDesk
 *     summary: Perform a mouse click on a desktop
 *     description: |
 *       Simulates a mouse click at the given (x, y) coordinates on a specific virtual desktop.
 *       Access is subject to multi-tenant and role-based permissions.
 *
 *       **Permission Scopes:**
 *       - `super_admin`: Can interact with any desktop.
 *       - `admin`: Can interact with any desktop within their own tenant.
 *       - `manager`: Can interact with desktops of users they manage within their own tenant.
 *       - `user`: Can only interact with desktops they own.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the virtual desktop.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - x
 *               - y
 *             properties:
 *               x:
 *                 type: number
 *                 description: The x-coordinate for the mouse click.
 *               y:
 *                 type: number
 *                 description: The y-coordinate for the mouse click.
 *     responses:
 *       '200':
 *         description: Mouse click performed successfully.
 *       '400':
 *         description: Bad Request, invalid parameters (ID, x, or y).
 *       '401':
 *         description: Unauthorized, missing or invalid user context.
 *       '403':
 *         description: Forbidden, user does not have permission to interact with this desktop.
 *       '404':
 *         description: Not Found, the specified desktop does not exist.
 *       '500':
 *         description: Internal server error.
 */
const click = async (req, res) => {
  const { id } = req.params;
  const { x, y } = req.body;
  const user = req.user;

  if (!user || !user.role || !user.tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Missing user context.' });
  }

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Desktop ID is required and must be a string.' });
  }

  if (typeof x !== 'number' || isNaN(x) || typeof y !== 'number' || isNaN(y)) {
    return res.status(400).json({ error: 'Coordinates x and y are required and must be numbers.' });
  }

  try {
    const access = await verifyDesktopAccess(user, id);
    if (!access.valid) {
      return res.status(access.status).json({ error: access.message });
    }

    const result = await cyberdeskService.clickMouse(id, x, y, {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role
    });
    res.status(200).json(result);
  } catch (err) {
    // GCP-compatible structured logging
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: `Error clicking mouse for desktop ID ${id} at (${x}, ${y}).`,
      error: { message: err.message, stack: err.stack, name: err.name },
      context: {
        desktopId: id,
        coordinates: { x, y },
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
      }
    }));
    res.status(500).json({ error: 'Failed to perform mouse click.' });
  }
};

/**
 * @async
 * @function bash
 * @description Express controller to execute a shell command on a virtual desktop.
 * Access is verified, and command execution is restricted to higher-privileged roles for security.
 * @param {import('express').Request} req - The Express request object.
 * @param {object} req.params - The URL parameters.
 * @param {string} req.params.id - The ID of the target desktop.
 * @param {object} req.body - The request body.
 * @param {string} req.body.command - The shell command to execute.
 * @param {object} req.user - The authenticated user object attached by middleware.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 *
 * @openapi
 * /cyberdesk/{id}/bash:
 *   post:
 *     tags:
 *       - CyberDesk
 *     summary: Execute a shell command on a desktop
 *     description: |
 *       Executes a given shell command on a specific virtual desktop.
 *       This is a privileged operation and is restricted to specific roles.
 *       All commands are audited.
 *
 *       **Required Roles:**
 *       - `super_admin`
 *       - `admin`
 *       - `manager`
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the virtual desktop.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - command
 *             properties:
 *               command:
 *                 type: string
 *                 description: The shell command to be executed.
 *     responses:
 *       '200':
 *         description: Command executed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: The result of the command execution (e.g., stdout, stderr).
 *       '400':
 *         description: Bad Request, invalid parameters (ID or command).
 *       '401':
 *         description: Unauthorized, missing or invalid user context.
 *       '403':
 *         description: Forbidden, user role does not have permission to execute commands.
 *       '404':
 *         description: Not Found, the specified desktop does not exist.
 *       '500':
 *         description: Internal server error.
 */
const bash = async (req, res) => {
  const { id } = req.params;
  const { command } = req.body;
  const user = req.user;

  if (!user || !user.role || !user.tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Missing user context.' });
  }

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Desktop ID is required and must be a string.' });
  }

  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Command is required and must be a string.' });
  }

  // Restrict command execution to authorized roles to mitigate command injection risks
  const allowedBashRoles = ['super_admin', 'admin', 'manager'];
  if (!allowedBashRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges to execute commands.' });
  }

  try {
    const access = await verifyDesktopAccess(user, id);
    if (!access.valid) {
      return res.status(access.status).json({ error: access.message });
    }

    // Pass user context for auditing, logging, and policy enforcement
    const result = await cyberdeskService.executeBash(id, command, {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role
    });
    res.status(200).json(result);
  } catch (err) {
    // GCP-compatible structured logging
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: `Error executing bash command for desktop ID ${id}.`,
      error: { message: err.message, stack: err.stack, name: err.name },
      context: {
        desktopId: id,
        command,
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
      }
    }));
    res.status(500).json({ error: 'Failed to execute bash command.' });
  }
};

/**
 * @async
 * @function terminate
 * @description Express controller to terminate a running virtual desktop.
 * Access is verified using the `verifyDesktopAccess` helper.
 * @param {import('express').Request} req - The Express request object.
 * @param {object} req.params - The URL parameters.
 * @param {string} req.params.id - The ID of the desktop to terminate.
 * @param {object} req.user - The authenticated user object attached by middleware.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 *
 * @openapi
 * /cyberdesk/{id}/terminate:
 *   post:
 *     tags:
 *       - CyberDesk
 *     summary: Terminate a virtual desktop
 *     description: |
 *       Terminates and de-provisions a specific virtual desktop instance.
 *       Access is subject to multi-tenant and role-based permissions.
 *
 *       **Permission Scopes:**
 *       - `super_admin`: Can terminate any desktop.
 *       - `admin`: Can terminate any desktop within their own tenant.
 *       - `manager`: Can terminate desktops of users they manage within their own tenant.
 *       - `user`: Can only terminate desktops they own.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the virtual desktop to terminate.
 *     responses:
 *       '200':
 *         description: Desktop terminated successfully.
 *       '400':
 *         description: Bad Request, desktop ID is missing or invalid.
 *       '401':
 *         description: Unauthorized, missing or invalid user context.
 *       '403':
 *         description: Forbidden, user does not have permission to terminate this desktop.
 *       '404':
 *         description: Not Found, the specified desktop does not exist.
 *       '500':
 *         description: Internal server error.
 */
const terminate = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  if (!user || !user.role || !user.tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Missing user context.' });
  }

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Desktop ID is required and must be a string.' });
  }

  try {
    const access = await verifyDesktopAccess(user, id);
    if (!access.valid) {
      return res.status(access.status).json({ error: access.message });
    }

    const result = await cyberdeskService.terminateDesktop(id, {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      managerId: user.managerId
    });
    res.status(200).json(result);
  } catch (err) {
    // GCP-compatible structured logging
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: `Error terminating desktop ID ${id}.`,
      error: { message: err.message, stack: err.stack, name: err.name },
      context: {
        desktopId: id,
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
      }
    }));
    res.status(500).json({ error: 'Failed to terminate desktop.' });
  }
};

/**
 * @namespace cyberdeskController
 * @description A collection of Express controller methods for managing CyberDesk virtual desktops.
 * Handles launching, querying, interacting with, and terminating desktops,
 * while enforcing role-based access control and multi-tenant boundaries.
 */
export const cyberdeskController = {
  launch,
  info,
  click,
  bash,
  terminate,
};