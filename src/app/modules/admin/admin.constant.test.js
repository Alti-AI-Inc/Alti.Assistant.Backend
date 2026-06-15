import { describe, it, expect } from 'vitest';
import {
  paginationFields,
  USER_ROLES,
  INVITATION_STATUS,
  INVITATION_EXPIRATION_DAYS,
  WORKSPACE_LIMITS,
  MANAGER_PERMISSIONS,
  OWNER_PERMISSIONS,
  MANAGER_ASSIGNABLE_ROLES,
  MANAGER_UNMODIFIABLE_ROLES
} from './admin.constant.js';

describe('Admin Constants', () => {
  describe('USER_ROLES', () => {
    it('should define roles with specific, hierarchical levels', () => {
      expect(USER_ROLES.OWNER.level).toBe(3);
      expect(USER_ROLES.MANAGER.level).toBe(2);
      expect(USER_ROLES.MEMBER.level).toBe(1);
    });

    it('should maintain the hierarchy: OWNER > MANAGER > MEMBER', () => {
      expect(USER_ROLES.OWNER.level).toBeGreaterThan(USER_ROLES.MANAGER.level);
      expect(USER_ROLES.MANAGER.level).toBeGreaterThan(USER_ROLES.MEMBER.level);
    });

    it('should have unique levels for each role to prevent ambiguity', () => {
      const levels = Object.values(USER_ROLES).map(role => role.level);
      const uniqueLevels = new Set(levels);
      expect(uniqueLevels.size).toBe(levels.length);
    });

    it('should have unique names for each role', () => {
      const names = Object.values(USER_ROLES).map(role => role.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('Permissions', () => {
    it('OWNER_PERMISSIONS should be a strict superset of MANAGER_PERMISSIONS', () => {
      const managerPermissionsSet = new Set(MANAGER_PERMISSIONS);
      const ownerPermissionsSet = new Set(OWNER_PERMISSIONS);

      // Check that all manager permissions are included in owner permissions
      managerPermissionsSet.forEach(perm => {
        expect(ownerPermissionsSet.has(perm), `Owner should have manager permission: ${perm}`).toBe(true);
      });

      // Check that owner has additional, exclusive permissions
      expect(ownerPermissionsSet.size).toBeGreaterThan(managerPermissionsSet.size);
      const ownerOnlyPermissions = OWNER_PERMISSIONS.filter(
        perm => !managerPermissionsSet.has(perm)
      );
      expect(ownerOnlyPermissions).toEqual([
        'ACCESS_BILLING',
        'UPDATE_BILLING_PLAN',
        'DELETE_WORKSPACE',
        'TRANSFER_OWNERSHIP'
      ]);
    });

    it('should not have duplicate permissions within any single role set', () => {
      const managerPermsSet = new Set(MANAGER_PERMISSIONS);
      expect(managerPermsSet.size).toBe(MANAGER_PERMISSIONS.length);

      const ownerPermsSet = new Set(OWNER_PERMISSIONS);
      expect(ownerPermsSet.size).toBe(OWNER_PERMISSIONS.length);
    });
  });

  describe('Manager Role Context Boundaries', () => {
    it('MANAGER_ASSIGNABLE_ROLES should only contain roles with a level strictly lower than a Manager', () => {
      const managerLevel = USER_ROLES.MANAGER.level;
      const allRoles = Object.values(USER_ROLES);

      expect(MANAGER_ASSIGNABLE_ROLES.length).toBeGreaterThan(0);

      MANAGER_ASSIGNABLE_ROLES.forEach(assignableRoleName => {
        const role = allRoles.find(r => r.name === assignableRoleName);
        expect(role, `Role '${assignableRoleName}' not found in USER_ROLES`).toBeDefined();
        expect(role.level).toBeLessThan(managerLevel);
      });
    });

    it('MANAGER_ASSIGNABLE_ROLES should prevent privilege escalation by not including Manager or Owner roles', () => {
      expect(MANAGER_ASSIGNABLE_ROLES).not.toContain(USER_ROLES.MANAGER.name);
      expect(MANAGER_ASSIGNABLE_ROLES).not.toContain(USER_ROLES.OWNER.name);
      expect(MANAGER_ASSIGNABLE_ROLES).toContain(USER_ROLES.MEMBER.name);
    });

    it('MANAGER_UNMODIFIABLE_ROLES should prevent managers from altering higher-level or same-level roles', () => {
      const managerLevel = USER_ROLES.MANAGER.level;
      const allRoles = Object.values(USER_ROLES);

      expect(MANAGER_UNMODIFIABLE_ROLES.length).toBeGreaterThan(0);

      MANAGER_UNMODIFIABLE_ROLES.forEach(unmodifiableRoleName => {
        const role = allRoles.find(r => r.name === unmodifiableRoleName);
        expect(role, `Role '${unmodifiableRoleName}' not found in USER_ROLES`).toBeDefined();
        // A manager cannot modify roles with a level equal to or greater than their own.
        expect(role.level).toBeGreaterThanOrEqual(managerLevel);
      });
    });

    it('MANAGER_UNMODIFIABLE_ROLES should explicitly include the Owner role', () => {
      expect(MANAGER_UNMODIFIABLE_ROLES).toContain(USER_ROLES.OWNER.name);
    });
  });

  describe('Static Configuration Values', () => {
    it('should have the correct pagination fields', () => {
      expect(paginationFields).toEqual(['page', 'limit', 'sortBy', 'sortOrder']);
    });

    it('should have the correct invitation statuses', () => {
      expect(INVITATION_STATUS).toEqual({
        PENDING: 'pending',
        ACCEPTED: 'accepted',
        REJECTED: 'rejected',
        EXPIRED: 'expired'
      });
    });

    it('should have a positive integer for invitation expiration days', () => {
      expect(INVITATION_EXPIRATION_DAYS).toBe(7);
      expect(Number.isInteger(INVITATION_EXPIRATION_DAYS)).toBe(true);
      expect(INVITATION_EXPIRATION_DAYS).toBeGreaterThan(0);
    });

    it('should have defined and valid workspace limits for all tiers', () => {
      const tiers = ['FREE', 'PRO', 'ENTERPRISE'];
      tiers.forEach(tier => {
        expect(WORKSPACE_LIMITS[tier]).toBeDefined();
        expect(WORKSPACE_LIMITS[tier].MAX_MEMBERS).toBeGreaterThan(0);
        expect(Number.isInteger(WORKSPACE_LIMITS[tier].MAX_MEMBERS)).toBe(true);
        expect(WORKSPACE_LIMITS[tier].MAX_PROJECTS).toBeGreaterThan(0);
        expect(Number.isInteger(WORKSPACE_LIMITS[tier].MAX_PROJECTS)).toBe(true);
      });
    });

    it('should have a logical progression of limits across tiers', () => {
      expect(WORKSPACE_LIMITS.PRO.MAX_MEMBERS).toBeGreaterThan(WORKSPACE_LIMITS.FREE.MAX_MEMBERS);
      expect(WORKSPACE_LIMITS.ENTERPRISE.MAX_MEMBERS).toBeGreaterThan(WORKSPACE_LIMITS.PRO.MAX_MEMBERS);

      expect(WORKSPACE_LIMITS.PRO.MAX_PROJECTS).toBeGreaterThan(WORKSPACE_LIMITS.FREE.MAX_PROJECTS);
      expect(WORKSPACE_LIMITS.ENTERPRISE.MAX_PROJECTS).toBeGreaterThan(WORKSPACE_LIMITS.PRO.MAX_PROJECTS);
    });
  });
});