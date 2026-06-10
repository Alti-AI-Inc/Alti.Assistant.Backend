import { z } from 'zod';

// Improvement: Centralize role definitions for consistency and maintainability across the application.
const ROLES = ['admin', 'manager', 'user'];

/**
 * @typedef {object} CreateTenantBody
 * @property {string} name - The name of the tenant. Must be between 2 and 100 characters.
 * @property {string} slug - A unique, URL-friendly identifier for the tenant. Must be between 2 and 50 characters, containing only lowercase letters, numbers, and hyphens.
 * @property {string} subdomain - The subdomain for the tenant's application. Must be between 2 and 50 characters, containing only lowercase letters, numbers, and hyphens.
 * @property {'free'|'explore'|'analyze'|'execute'|'command'|'enterprise'} [plan] - The subscription plan for the tenant. Defaults to 'free' if not provided.
 */
/**
 * Validation schema for creating a new tenant.
 * This schema expects a `body` object containing the tenant's details.
 * @type {z.ZodObject<{ body: z.ZodObject<CreateTenantBody> }>}
 */
export const createTenantSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(2, 'Tenant name must be at least 2 characters')
      .max(100, 'Tenant name cannot exceed 100 characters'),
    slug: z
      .string()
      .min(2, 'Slug must be at least 2 characters')
      .max(50, 'Slug cannot exceed 50 characters')
      // Bug: The original regex /^[a-z0-9-]+$/ allowed leading, trailing, and consecutive hyphens (e.g., "-slug-", "my--slug"), which are invalid for URL paths or subdomains.
      // Fix: Use a stricter regex to ensure slugs are valid URL components, preventing malformed identifiers.
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug can only contain lowercase letters, numbers, and non-consecutive hyphens. It cannot start or end with a hyphen.'
      ),
    subdomain: z
      .string()
      .min(2, 'Subdomain must be at least 2 characters')
      .max(50, 'Subdomain cannot exceed 50 characters')
      // Bug: The original regex /^[a-z0-9-]+$/ allowed leading, trailing, and consecutive hyphens, which are invalid for hostnames.
      // Fix: Use a stricter regex to ensure subdomains are valid, preventing DNS and routing issues.
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Subdomain can only contain lowercase letters, numbers, and non-consecutive hyphens. It cannot start or end with a hyphen.'
      ),
    plan: z
      .enum(['free', 'explore', 'analyze', 'execute', 'command', 'enterprise'])
      .optional(),
  }),
});

/**
 * @typedef {object} CustomBrandingSettings
 * @property {string} [logo] - URL to the custom logo for the tenant's branding. Must be a valid URL.
 * @property {string} [primaryColor] - The primary color for the tenant's branding in hexadecimal format (e.g., #RRGGBB).
 */
/**
 * @typedef {object} TenantSettings
 * @property {boolean} [allowMemberInvites] - Whether members are allowed to invite other members.
 * @property {boolean} [requireApproval] - Whether new member invitations require admin approval.
 * @property {number} [maxMembers] - The maximum number of members allowed in the tenant. Must be at least 1.
 * @property {CustomBrandingSettings} [customBranding] - Custom branding settings for the tenant.
 */
/**
 * @typedef {object} UpdateTenantBody
 * @property {string} [name] - The new name of the tenant. Must be between 2 and 100 characters.
 * @property {TenantSettings} [settings] - Various settings for the tenant.
 * @property {Record<string, any>} [metadata] - Arbitrary metadata associated with the tenant.
 */
/**
 * Validation schema for updating an existing tenant.
 * This schema expects a `body` object containing the fields to be updated.
 * All fields are optional, allowing partial updates.
 * @type {z.ZodObject<{ body: z.ZodObject<UpdateTenantBody> }>}
 */
export const updateTenantSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    settings: z
      .object({
        allowMemberInvites: z.boolean().optional(),
        requireApproval: z.boolean().optional(),
        maxMembers: z.number().min(1).optional(),
        customBranding: z
          .object({
            logo: z.string().url().optional(),
            primaryColor: z
              .string()
              // Bug: Original regex /^#[0-9A-Fa-f]{6}$/ was too restrictive, only allowing 6-digit hex codes.
              // Fix: Allow 3-digit (#RGB), 6-digit (#RRGGBB), and 8-digit (#RRGGBBAA) hex color codes for more flexibility in branding.
              .regex(/^#([0-9A-Fa-f]{3}){1,2}([0-9A-Fa-f]{2})?$/i, 'Invalid hex color format')
              .optional(),
          })
          .optional(),
      })
      .optional(),
    // Security Vulnerability: Using z.record(z.any()) is too permissive and can allow for NoSQL/Object injection if the backend does not properly sanitize the object keys and values (e.g., using keys like '$set', '$gt').
    // Fix: Harden the metadata schema to only allow primitive values (string, number, boolean, null), preventing nested objects and potential injection attacks.
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  }),
});

/**
 * @typedef {object} InviteMemberBody
 * @property {string} email - The email address of the member to invite. Must be a valid email format.
 * @property {'admin'|'manager'|'user'} role - The role to assign to the invited member. Must be 'admin', 'manager', or 'user'.
 */
/**
 * Validation schema for inviting a new member to a tenant.
 * This schema expects a `body` object containing the invitee's email and desired role.
 * @type {z.ZodObject<{ body: z.ZodObject<InviteMemberBody> }>}
 */
export const inviteMemberSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    // Improvement: Use the centralized ROLES enum for consistency and to avoid magic strings.
    role: z.enum(ROLES, {
      errorMap: () => ({ message: 'Role must be admin, manager, or user' }),
    }),
  }),
});

/**
 * @typedef {object} UpdateMemberRoleParams
 * @property {string} userId - The ID of the user whose role is to be updated. Must be a valid MongoDB ObjectId (24 hex characters).
 */
/**
 * @typedef {object} UpdateMemberRoleBody
 * @property {'admin'|'manager'|'user'} role - The new role to assign to the member. Must be 'admin', 'manager', or 'user'.
 */
/**
 * Validation schema for updating a member's role within a tenant.
 * This schema expects a `params` object for the user ID and a `body` object for the new role.
 * @type {z.ZodObject<{ params: z.ZodObject<UpdateMemberRoleParams>, body: z.ZodObject<UpdateMemberRoleBody> }>}
 */
export const updateMemberRoleSchema = z.object({
  params: z.object({
    userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user ID'),
  }),
  body: z.object({
    // Improvement: Use the centralized ROLES enum for consistency.
    role: z.enum(ROLES, {
      errorMap: () => ({ message: 'Role must be admin, manager, or user' }),
    }),
  }),
});

/**
 * @typedef {object} RemoveMemberParams
 * @property {string} userId - The ID of the user to be removed from the tenant. Must be a valid MongoDB ObjectId (24 hex characters).
 */
/**
 * Validation schema for removing a member from a tenant.
 * This schema expects a `params` object containing the ID of the user to remove.
 * @type {z.ZodObject<{ params: z.ZodObject<RemoveMemberParams> }>}
 */
export const removeMemberSchema = z.object({
  params: z.object({
    userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user ID'),
  }),
});

/**
 * @typedef {object} VerifyInvitationTokenParams
 * @property {string} token - The invitation token to verify. Must be at least 32 characters long.
 */
/**
 * Validation schema for verifying an invitation token.
 * This schema expects a `params` object containing the invitation token.
 * @type {z.ZodObject<{ params: z.ZodObject<VerifyInvitationTokenParams> }>}
 */
export const verifyInvitationTokenSchema = z.object({
  params: z.object({
    token: z.string().min(32, 'Invalid token'),
  }),
});

/**
 * @typedef {object} AcceptInvitationParams
 * @property {string} inviteId - The ID of the invitation to accept. Must be a valid MongoDB ObjectId (24 hex characters).
 */
/**
 * Validation schema for accepting an invitation to a tenant.
 * This schema expects a `params` object containing the invitation ID.
 * @type {z.ZodObject<{ params: z.ZodObject<AcceptInvitationParams> }>}
 */
export const acceptInvitationSchema = z.object({
  params: z.object({
    inviteId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid invitation ID'),
  }),
});

/**
 * @typedef {object} CancelInvitationParams
 * @property {string} inviteId - The ID of the invitation to cancel. Must be a valid MongoDB ObjectId (24 hex characters).
 */
/**
 * Validation schema for canceling an invitation to a tenant.
 * This schema expects a `params` object containing the invitation ID.
 * @type {z.ZodObject<{ params: z.ZodObject<CancelInvitationParams> }>}
 */
export const cancelInvitationSchema = z.object({
  params: z.object({
    inviteId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid invitation ID'),
  }),
});

/**
 * @typedef {object} TenantIdParams
 * @property {string} tenantId - The ID of the tenant. Must be a valid MongoDB ObjectId (24 hex characters).
 */
/**
 * Validation schema for a tenant ID parameter in a route.
 * This schema expects a `params` object containing the tenant ID.
 * @type {z.ZodObject<{ params: z.ZodObject<TenantIdParams> }>}
 */
export const tenantIdParamSchema = z.object({
  params: z.object({
    tenantId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid tenant ID'),
  }),
});

/**
 * @typedef {object} CheckSubdomainQuery
 * @property {string} subdomain - The subdomain to check for availability. Must be between 2 and 50 characters, containing only lowercase letters, numbers, and hyphens.
 */
/**
 * Validation schema for checking subdomain availability.
 * This schema expects a `query` object containing the subdomain to check.
 * @type {z.ZodObject<{ query: z.ZodObject<CheckSubdomainQuery> }>}
 */
export const checkSubdomainSchema = z.object({
  query: z.object({
    subdomain: z
      .string()
      .min(2, 'Subdomain must be at least 2 characters')
      .max(50, 'Subdomain cannot exceed 50 characters')
      // Bug: The original regex /^[a-z0-9-]+$/ allowed leading, trailing, and consecutive hyphens, which are invalid for hostnames.
      // Fix: Use a stricter regex to ensure subdomains are valid, preventing DNS and routing issues.
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Subdomain can only contain lowercase letters, numbers, and non-consecutive hyphens. It cannot start or end with a hyphen.'
      ),
  }),
});