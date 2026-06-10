import { describe, it, expect } from 'vitest';
import {
  createTenantSchema,
  updateTenantSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  removeMemberSchema,
  verifyInvitationTokenSchema,
  acceptInvitationSchema,
  cancelInvitationSchema,
  tenantIdParamSchema,
  checkSubdomainSchema,
} from './tenant.validation.js';

// Helper to generate a mock MongoDB ObjectId
const mockObjectId = '60d5ec49e052e334a4a4f4a4';

describe('tenant.validation.js', () => {
  describe('createTenantSchema', () => {
    const validData = {
      body: {
        name: 'Valid Tenant Name',
        slug: 'valid-tenant-slug',
        subdomain: 'valid-subdomain',
        plan: 'free',
      },
    };

    it('should pass with valid data', () => {
      const result = createTenantSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should pass with optional plan omitted', () => {
      const data = { ...validData, body: { ...validData.body } };
      delete data.body.plan;
      const result = createTenantSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail if name is too short', () => {
      const data = { ...validData, body: { ...validData.body, name: 'a' } };
      const result = createTenantSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('at least 2 characters');
    });

    it('should fail if slug is invalid (leading hyphen)', () => {
      const data = { ...validData, body: { ...validData.body, slug: '-invalid' } };
      const result = createTenantSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('cannot start or end with a hyphen');
    });

    it('should fail if slug is invalid (trailing hyphen)', () => {
      const data = { ...validData, body: { ...validData.body, slug: 'invalid-' } };
      const result = createTenantSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('cannot start or end with a hyphen');
    });

    it('should fail if slug is invalid (consecutive hyphens)', () => {
      const data = { ...validData, body: { ...validData.body, slug: 'in--valid' } };
      const result = createTenantSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('non-consecutive hyphens');
    });

    it('should fail if subdomain is invalid (uppercase)', () => {
      const data = { ...validData, body: { ...validData.body, subdomain: 'Invalid' } };
      const result = createTenantSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should fail if plan is not in the enum', () => {
      const data = { ...validData, body: { ...validData.body, plan: 'invalid-plan' } };
      const result = createTenantSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should fail if required fields are missing', () => {
      const data = { body: {} };
      const result = createTenantSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues.length).toBe(3); // name, slug, subdomain
    });
  });

  describe('updateTenantSchema', () => {
    it('should pass with a valid partial update (name)', () => {
      const data = { body: { name: 'New Tenant Name' } };
      const result = updateTenantSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should pass with a valid partial update (settings)', () => {
      const data = {
        body: {
          settings: {
            allowMemberInvites: false,
            maxMembers: 50,
          },
        },
      };
      const result = updateTenantSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should pass with valid custom branding (3, 6, 8 digit hex)', () => {
      const data3digit = { body: { settings: { customBranding: { primaryColor: '#F0C' } } } };
      const data6digit = { body: { settings: { customBranding: { primaryColor: '#FF00CC' } } } };
      const data8digit = { body: { settings: { customBranding: { primaryColor: '#FF00CC80' } } } };
      expect(updateTenantSchema.safeParse(data3digit).success).toBe(true);
      expect(updateTenantSchema.safeParse(data6digit).success).toBe(true);
      expect(updateTenantSchema.safeParse(data8digit).success).toBe(true);
    });

    it('should pass with a valid logo URL', () => {
      const data = { body: { settings: { customBranding: { logo: 'https://example.com/logo.png' } } } };
      expect(updateTenantSchema.safeParse(data).success).toBe(true);
    });

    it('should pass with valid metadata', () => {
      const data = {
        body: {
          metadata: {
            key1: 'value1',
            key2: 123,
            key3: true,
            key4: null,
          },
        },
      };
      const result = updateTenantSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should pass with an empty body', () => {
      const data = { body: {} };
      const result = updateTenantSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail if name is too short', () => {
      const data = { body: { name: 'a' } };
      const result = updateTenantSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should fail if maxMembers is less than 1', () => {
      const data = { body: { settings: { maxMembers: 0 } } };
      const result = updateTenantSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should fail if logo is not a valid URL', () => {
      const data = { body: { settings: { customBranding: { logo: 'not-a-url' } } } };
      const result = updateTenantSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should fail if primaryColor is an invalid hex code', () => {
      const data = { body: { settings: { customBranding: { primaryColor: '#GGG' } } } };
      const result = updateTenantSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid hex color format');
    });

    it('should fail if metadata contains a nested object', () => {
      const data = {
        body: {
          metadata: {
            key1: { nested: 'not-allowed' },
          },
        },
      };
      const result = updateTenantSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('inviteMemberSchema', () => {
    const validData = {
      body: {
        email: 'test@example.com',
        role: 'user',
      },
    };

    it('should pass with valid data for all roles', () => {
      const roles = ['admin', 'manager', 'user'];
      roles.forEach(role => {
        const data = { body: { email: 'test@example.com', role } };
        const result = inviteMemberSchema.safeParse(data);
        expect(result.success, `Role ${role} should be valid`).toBe(true);
      });
    });

    it('should fail with an invalid email', () => {
      const data = { ...validData, body: { ...validData.body, email: 'invalid-email' } };
      const result = inviteMemberSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid email address');
    });

    it('should fail with an invalid role', () => {
      const data = { ...validData, body: { ...validData.body, role: 'guest' } };
      const result = inviteMemberSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Role must be admin, manager, or user');
    });
  });

  describe('updateMemberRoleSchema', () => {
    const validData = {
      params: { userId: mockObjectId },
      body: { role: 'manager' },
    };

    it('should pass with valid data', () => {
      const result = updateMemberRoleSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail with an invalid userId', () => {
      const data = { ...validData, params: { userId: 'invalid-id' } };
      const result = updateMemberRoleSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid user ID');
    });

    it('should fail with an invalid role', () => {
      const data = { ...validData, body: { role: 'super_admin' } };
      const result = updateMemberRoleSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Role must be admin, manager, or user');
    });
  });

  describe('removeMemberSchema', () => {
    it('should pass with a valid userId', () => {
      const data = { params: { userId: mockObjectId } };
      const result = removeMemberSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail with an invalid userId', () => {
      const data = { params: { userId: '123' } };
      const result = removeMemberSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid user ID');
    });
  });

  describe('verifyInvitationTokenSchema', () => {
    it('should pass with a valid token (32 chars)', () => {
      const data = { params: { token: 'a'.repeat(32) } };
      const result = verifyInvitationTokenSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should pass with a valid token (more than 32 chars)', () => {
      const data = { params: { token: 'a'.repeat(64) } };
      const result = verifyInvitationTokenSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail with a token that is too short', () => {
      const data = { params: { token: 'short' } };
      const result = verifyInvitationTokenSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid token');
    });
  });

  describe('acceptInvitationSchema', () => {
    it('should pass with a valid inviteId', () => {
      const data = { params: { inviteId: mockObjectId } };
      const result = acceptInvitationSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail with an invalid inviteId', () => {
      const data = { params: { inviteId: 'invalid' } };
      const result = acceptInvitationSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid invitation ID');
    });
  });

  describe('cancelInvitationSchema', () => {
    it('should pass with a valid inviteId', () => {
      const data = { params: { inviteId: mockObjectId } };
      const result = cancelInvitationSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail with an invalid inviteId', () => {
      const data = { params: { inviteId: 'invalid' } };
      const result = cancelInvitationSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid invitation ID');
    });
  });

  describe('tenantIdParamSchema', () => {
    it('should pass with a valid tenantId', () => {
      const data = { params: { tenantId: mockObjectId } };
      const result = tenantIdParamSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail with an invalid tenantId', () => {
      const data = { params: { tenantId: 'invalid' } };
      const result = tenantIdParamSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid tenant ID');
    });
  });

  describe('checkSubdomainSchema', () => {
    const validData = {
      query: {
        subdomain: 'valid-subdomain',
      },
    };

    it('should pass with a valid subdomain', () => {
      const result = checkSubdomainSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail if subdomain is too short', () => {
      const data = { query: { subdomain: 'a' } };
      const result = checkSubdomainSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('at least 2 characters');
    });

    it('should fail if subdomain has leading hyphen', () => {
      const data = { query: { subdomain: '-invalid' } };
      const result = checkSubdomainSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('cannot start or end with a hyphen');
    });

    it('should fail if subdomain has trailing hyphen', () => {
      const data = { query: { subdomain: 'invalid-' } };
      const result = checkSubdomainSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('cannot start or end with a hyphen');
    });

    it('should fail if subdomain has consecutive hyphens', () => {
      const data = { query: { subdomain: 'in--valid' } };
      const result = checkSubdomainSchema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('non-consecutive hyphens');
    });

    it('should fail if subdomain has invalid characters', () => {
      const data = { query: { subdomain: 'Invalid!' } };
      const result = checkSubdomainSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});