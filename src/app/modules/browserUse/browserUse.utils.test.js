import { describe, it, expect } from 'vitest';
import { filterBrowserDataByRole, generateSummaryReport } from './browserUse.utils.js';

// Mock data for tests
const mockBrowserData = [
  // Organization 1
  { userId: 'user-regular-1', organizationId: 'org-1', browser: 'Chrome' },
  { userId: 'manager-1', organizationId: 'org-1', browser: 'Firefox' },
  { userId: 'team-member-A', organizationId: 'org-1', browser: 'Chrome' },
  { userId: 'team-member-B', organizationId: 'org-1', browser: 'Safari' },
  { userId: 'admin-1', organizationId: 'org-1', browser: 'Edge' },

  // Organization 2
  { userId: 'user-regular-2', organizationId: 'org-2', browser: 'Chrome' },
  { userId: 'admin-2', organizationId: 'org-2', browser: 'Firefox' },

  // System-level user (no org)
  { userId: 'super-admin-id', organizationId: null, browser: 'Brave' },
];

describe('browserUse.utils.js', () => {
  describe('filterBrowserDataByRole', () => {
    // --- Input Validation Tests ---
    it('should throw an error if the user object is null or undefined', () => {
      expect(() => filterBrowserDataByRole(null, mockBrowserData)).toThrow('Invalid user object provided.');
      expect(() => filterBrowserDataByRole(undefined, mockBrowserData)).toThrow('Invalid user object provided.');
    });

    it('should throw an error if the user object is missing a role', () => {
      const userWithoutRole = { id: 'test-id' };
      expect(() => filterBrowserDataByRole(userWithoutRole, mockBrowserData)).toThrow('Invalid user object provided.');
    });

    it('should throw an error if allBrowserData is not an array', () => {
      const user = { id: 'test-id', role: 'user' };
      expect(() => filterBrowserDataByRole(user, null)).toThrow('Invalid data format: allBrowserData must be an array.');
      expect(() => filterBrowserDataByRole(user, {})).toThrow('Invalid data format: allBrowserData must be an array.');
      expect(() => filterBrowserDataByRole(user, 'not-an-array')).toThrow('Invalid data format: allBrowserData must be an array.');
    });

    // --- Role: super_admin ---
    describe('when user is super_admin', () => {
      it('should return all browser data records', () => {
        const superAdminUser = { id: 'super-admin-id', role: 'super_admin' };
        const result = filterBrowserDataByRole(superAdminUser, mockBrowserData);
        expect(result).toHaveLength(mockBrowserData.length);
        expect(result).toEqual(mockBrowserData);
      });
    });

    // --- Role: admin ---
    describe('when user is admin', () => {
      it("should return data only for the admin's organization", () => {
        const adminUser = { id: 'admin-1', role: 'admin', organizationId: 'org-1' };
        const result = filterBrowserDataByRole(adminUser, mockBrowserData);
        const expectedLength = mockBrowserData.filter(d => d.organizationId === 'org-1').length;
        
        expect(result).toHaveLength(expectedLength);
        expect(result.every(d => d.organizationId === 'org-1')).toBe(true);
      });

      it("should return an empty array if no data matches the admin's organization", () => {
        const adminUser = { id: 'admin-3', role: 'admin', organizationId: 'org-3' };
        const result = filterBrowserDataByRole(adminUser, mockBrowserData);
        expect(result).toHaveLength(0);
      });

      it('should throw an error if an admin user is missing an organizationId', () => {
        const adminWithoutOrg = { id: 'admin-no-org', role: 'admin' };
        expect(() => filterBrowserDataByRole(adminWithoutOrg, mockBrowserData)).toThrow('Admin must have an organizationId.');
      });
    });

    // --- Role: manager ---
    describe('when user is manager', () => {
      it('should return data for managed users and the manager themselves', () => {
        const managerUser = {
          id: 'manager-1',
          role: 'manager',
          organizationId: 'org-1',
          managedUserIds: ['team-member-A', 'team-member-B'],
        };
        const result = filterBrowserDataByRole(managerUser, mockBrowserData);
        
        expect(result).toHaveLength(3);
        const resultUserIds = result.map(d => d.userId);
        expect(resultUserIds).toContain('manager-1');
        expect(resultUserIds).toContain('team-member-A');
        expect(resultUserIds).toContain('team-member-B');
      });

      it("should return only the manager's own data if managedUserIds is empty", () => {
        const managerWithoutTeam = {
          id: 'manager-1',
          role: 'manager',
          organizationId: 'org-1',
          managedUserIds: [],
        };
        const result = filterBrowserDataByRole(managerWithoutTeam, mockBrowserData);
        expect(result).toHaveLength(1);
        expect(result[0].userId).toBe('manager-1');
      });

      it('should throw an error if a manager user is missing the managedUserIds array', () => {
        const managerWithoutManagedIds = { id: 'manager-1', role: 'manager', organizationId: 'org-1' };
        expect(() => filterBrowserDataByRole(managerWithoutManagedIds, mockBrowserData)).toThrow('Manager must have a managedUserIds array.');
      });
    });

    // --- Role: user ---
    describe('when user is a standard user', () => {
      it('should return only the data for that specific user', () => {
        const standardUser = { id: 'user-regular-1', role: 'user', organizationId: 'org-1' };
        const result = filterBrowserDataByRole(standardUser, mockBrowserData);
        expect(result).toHaveLength(1);
        expect(result[0].userId).toBe('user-regular-1');
      });

      it('should return an empty array if there is no data for that user', () => {
        const userWithNoData = { id: 'user-no-data', role: 'user', organizationId: 'org-1' };
        const result = filterBrowserDataByRole(userWithNoData, mockBrowserData);
        expect(result).toHaveLength(0);
      });
    });

    // --- Unknown Role ---
    it('should throw an error for an unknown user role', () => {
      const unknownRoleUser = { id: 'guest-id', role: 'guest' };
      expect(() => filterBrowserDataByRole(unknownRoleUser, mockBrowserData)).toThrow('Unknown user role: guest');
    });
  });

  describe('generateSummaryReport', () => {
    it('should allow a super_admin to generate a report', () => {
        const user = { role: 'super_admin' };
        const report = generateSummaryReport(user);
        expect(report).toBe('Summary report generated by super_admin.');
    });

    it('should allow an admin to generate a report', () => {
        const user = { role: 'admin' };
        const report = generateSummaryReport(user);
        expect(report).toBe('Summary report generated by admin.');
    });

    it('should allow a manager to generate a report', () => {
        const user = { role: 'manager' };
        const report = generateSummaryReport(user);
        expect(report).toBe('Summary report generated by manager.');
    });

    it('should throw an error if a user with role "user" tries to generate a report', () => {
        const user = { role: 'user' };
        expect(() => generateSummaryReport(user)).toThrow('Unauthorized: You do not have permission to generate reports.');
    });

    it('should throw an error for an invalid or missing user object', () => {
        expect(() => generateSummaryReport(null)).toThrow('Unauthorized: You do not have permission to generate reports.');
        expect(() => generateSummaryReport({})).toThrow('Unauthorized: You do not have permission to generate reports.');
    });
  });
});