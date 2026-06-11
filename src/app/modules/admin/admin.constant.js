/**
 * @fileoverview This file contains constants used across the admin and workspace management modules.
 * It defines roles, permissions, limits, and statuses to ensure consistent and secure business logic.
 * @module app/modules/admin/admin.constant
 */

/**
 * @constant {string[]} paginationFields - An array of strings representing the valid fields for pagination queries.
 * These fields control pagination behavior (e.g., page, limit, sortBy, sortOrder).
 */
export const paginationFields = ['page', 'limit', 'sortBy', 'sortOrder'];

/**
 * @typedef {Object} Role
 * @property {string} name - The string identifier for the role (e.g., 'owner').
 * @property {number} level - A numeric value representing the role's position in the hierarchy. Higher is more powerful.
 */

/**
 * @constant {Object<string, Role>} USER_ROLES - Defines the available roles within the workspace.
 * The roles include a numeric level to facilitate programmatic hierarchy checks, preventing privilege escalation.
 * Hierarchy: OWNER > MANAGER > MEMBER.
 */
export const USER_ROLES = {
  OWNER: { name: 'owner', level: 3 },
  MANAGER: { name: 'manager', level: 2 },
  MEMBER: { name: 'member', level: 1 }
};

/**
 * @constant {Object<string, string>} INVITATION_STATUS - Defines the possible statuses of a workspace invitation.
 * @property {string} PENDING - The invitation has been sent but not yet responded to.
 * @property {string} ACCEPTED - The invitation has been accepted by the user.
 * @property {string} REJECTED - The invitation has been declined by the user.
 * @property {string} EXPIRED - The invitation was not responded to within the allowed timeframe.
 */
export const INVITATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

/**
 * @constant {number} INVITATION_EXPIRATION_DAYS - The number of days an invitation is valid before it expires.
 * This ensures that pending invitations do not remain open indefinitely.
 */
export const INVITATION_EXPIRATION_DAYS = 7;

/**
 * @typedef {Object} PlanLimits
 * @property {number} MAX_MEMBERS - The maximum number of members allowed in the workspace for this plan.
 * @property {number} MAX_PROJECTS - The maximum number of projects allowed in the workspace for this plan.
 */

/**
 * @constant {Object<string, PlanLimits>} WORKSPACE_LIMITS
 * @description Default limits for workspaces based on subscription tiers (e.g., FREE, PRO, ENTERPRISE).
 * These limits are used to enforce resource constraints, such as the number of members that can be invited
 * or the number of projects that can be created within a workspace.
 * @property {PlanLimits} FREE - Limits for the 'Free' subscription tier.
 * @property {PlanLimits} PRO - Limits for the 'Pro' subscription tier.
 * @property {PlanLimits} ENTERPRISE - Limits for the 'Enterprise' subscription tier.
 */
export const WORKSPACE_LIMITS = {
  FREE: {
    MAX_MEMBERS: 5,
    MAX_PROJECTS: 3
  },
  PRO: {
    MAX_MEMBERS: 20,
    MAX_PROJECTS: 15
  },
  ENTERPRISE: {
    MAX_MEMBERS: 100,
    MAX_PROJECTS: 100
  }
};

/**
 * @constant {string[]} MANAGER_PERMISSIONS - Actions a Manager is authorized to perform.
 * This set defines the scope of a manager's capabilities, focusing on team and workspace operations
 * while explicitly excluding sensitive owner-level actions like billing or workspace deletion.
 */
export const MANAGER_PERMISSIONS = [
  'VIEW_WORKSPACE_METRICS',
  'VIEW_TEAM_MEMBERS',
  'INVITE_MEMBER',
  'CANCEL_INVITATION',
  'REMOVE_MEMBER',
  'UPDATE_MEMBER_ROLE'
];

/**
 * @constant {string[]} OWNER_PERMISSIONS - Actions an Owner is authorized to perform.
 * This is a superset of manager permissions, including critical administrative and billing tasks
 * that are restricted from managers.
 */
export const OWNER_PERMISSIONS = [
  ...MANAGER_PERMISSIONS,
  'ACCESS_BILLING',
  'UPDATE_BILLING_PLAN',
  'DELETE_WORKSPACE',
  'TRANSFER_OWNERSHIP'
];

/**
 * @constant {string[]} MANAGER_ASSIGNABLE_ROLES - Defines the roles a Manager can assign to other members.
 * This is a critical security measure to prevent privilege escalation. A manager cannot promote anyone
 * to a role equal to or higher than their own.
 */
export const MANAGER_ASSIGNABLE_ROLES = [USER_ROLES.MANAGER.name, USER_ROLES.MEMBER.name];

/**
 * @constant {string[]} MANAGER_UNMODIFIABLE_ROLES - Defines roles that a Manager cannot modify.
 * This prevents a manager from demoting or otherwise altering the role of an Owner, ensuring the integrity
 * of the workspace hierarchy. This should be checked before any role update operation.
 */
export const MANAGER_UNMODIFIABLE_ROLES = [USER_ROLES.OWNER.name];