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
 * @constant {Object<string, string>} USER_ROLES - Defines the available roles within the workspace.
 * The roles are hierarchical: OWNER > MANAGER > MEMBER.
 */
export const USER_ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  MEMBER: 'member'
};

/**
 * @constant {Object<string, string>} INVITATION_STATUS - Defines the status of workspace invitations.
 */
export const INVITATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

/**
 * @constant {Object} WORKSPACE_LIMITS - Default limits for workspaces based on subscription tiers.
 * Used to enforce plan limits when managers invite new members or create projects.
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
  'INVITE_MEMBER',
  'REMOVE_MEMBER',
  'UPDATE_MEMBER_ROLE',
  'VIEW_TEAM_MEMBERS'
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
 * This is a critical security measure to prevent privilege escalation. A manager cannot promote a member
 * to an Owner, nor can they demote an existing Owner.
 */
export const MANAGER_ASSIGNABLE_ROLES = [USER_ROLES.MANAGER, USER_ROLES.MEMBER];