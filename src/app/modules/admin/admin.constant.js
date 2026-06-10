/**
 * @constant {string[]} paginationFields - An array of strings representing the valid fields that can be used for pagination queries.
 * These fields are typically extracted from query parameters to control the pagination behavior (e.g., current page, number of items per page, sorting criteria).
 */
export const paginationFields = ['page', 'limit', 'sortBy', 'sortOrder'];

/**
 * @constant {Object} USER_ROLES - Defines the available roles within the workspace.
 */
export const USER_ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  MEMBER: 'member'
};

/**
 * @constant {Object} INVITATION_STATUS - Defines the status of workspace invitations.
 */
export const INVITATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

/**
 * @constant {Object} WORKSPACE_LIMITS - Default limits for workspaces based on subscription tiers.
 * Prevents managers from exceeding plan limits during team management.
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
 * Explicitly excludes billing management to ensure security.
 */
export const MANAGER_PERMISSIONS = [
  'VIEW_WORKSPACE_METRICS',
  'INVITE_MEMBER',
  'REMOVE_MEMBER',
  'UPDATE_MEMBER_ROLE',
  'VIEW_TEAM_MEMBERS'
];

/**
 * @constant {string[]} RESTRICTED_MANAGER_ACTIONS - Actions that managers are strictly forbidden from performing.
 */
export const RESTRICTED_MANAGER_ACTIONS = [
  'ACCESS_BILLING',
  'UPDATE_BILLING_PLAN',
  'DELETE_WORKSPACE'
];