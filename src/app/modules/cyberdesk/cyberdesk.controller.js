import { cyberdeskService } from './cyberdesk.service.js';

/**
 * Helper to verify if a user has access to a specific desktop based on tenant boundaries and roles.
 * Enforces strict tenant isolation and role-based access control (RBAC).
 */
const verifyDesktopAccess = async (user, desktopId) => {
  const desktop = await cyberdeskService.getDesktopInfo(desktopId);
  if (!desktop) {
    return { valid: false, status: 404, message: 'Desktop not found.' };
  }

  // Super admin / Platform owner has global access across all tenants
  if (user.role === 'super_admin') {
    return { valid: true, desktop };
  }

  // Enforce tenant context boundary
  if (desktop.tenantId !== user.tenantId) {
    return { valid: false, status: 403, message: 'Access denied: Tenant boundary violation.' };
  }

  // Workspace owners (admin) and managers can access resources within their tenant
  if (user.role === 'admin' || user.role === 'manager') {
    return { valid: true, desktop };
  }

  // Standard users can only access their own assigned desktops
  if (user.role === 'user' && desktop.userId !== user.id) {
    return { valid: false, status: 403, message: 'Access denied: You do not own this desktop.' };
  }

  return { valid: true, desktop };
};

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
    console.error('Error launching desktop:', err);
    res.status(500).json({ error: 'Failed to launch desktop.' });
  }
};

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
    console.error(`Error getting info for desktop ID ${id}:`, err);
    res.status(500).json({ error: 'Failed to retrieve desktop information.' });
  }
};

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
    console.error(`Error clicking mouse for desktop ID ${id} at (${x}, ${y}):`, err);
    res.status(500).json({ error: 'Failed to perform mouse click.' });
  }
};

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
    console.error(`Error executing bash command for desktop ID ${id}: "${command}"`, err);
    res.status(500).json({ error: 'Failed to execute bash command.' });
  }
};

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
    console.error(`Error terminating desktop ID ${id}:`, err);
    res.status(500).json({ error: 'Failed to terminate desktop.' });
  }
};

export const cyberdeskController = {
  launch,
  info,
  click,
  bash,
  terminate,
};