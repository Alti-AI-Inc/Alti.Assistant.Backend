import { z } from 'zod';

/**
 * Validation schema for creating a tenant
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
      .regex(
        /^[a-z0-9-]+$/,
        'Slug can only contain lowercase letters, numbers, and hyphens'
      ),
    subdomain: z
      .string()
      .min(2, 'Subdomain must be at least 2 characters')
      .max(50, 'Subdomain cannot exceed 50 characters')
      .regex(
        /^[a-z0-9-]+$/,
        'Subdomain can only contain lowercase letters, numbers, and hyphens'
      ),
    plan: z
      .enum(['free', 'explore', 'analyze', 'execute', 'command', 'enterprise'])
      .optional(),
  }),
});

/**
 * Validation schema for updating tenant
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
              .regex(/^#[0-9A-Fa-f]{6}$/)
              .optional(),
          })
          .optional(),
      })
      .optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

/**
 * Validation schema for inviting a member
 */
export const inviteMemberSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    role: z.enum(['admin', 'member'], {
      errorMap: () => ({ message: 'Role must be either admin or member' }),
    }),
  }),
});

/**
 * Validation schema for updating member role
 */
export const updateMemberRoleSchema = z.object({
  params: z.object({
    userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user ID'),
  }),
  body: z.object({
    role: z.enum(['admin', 'member', 'owner'], {
      errorMap: () => ({ message: 'Role must be admin, member, or owner' }),
    }),
  }),
});

/**
 * Validation schema for removing a member
 */
export const removeMemberSchema = z.object({
  params: z.object({
    userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user ID'),
  }),
});

/**
 * Validation schema for verifying invitation token
 */
export const verifyInvitationTokenSchema = z.object({
  params: z.object({
    token: z.string().min(32, 'Invalid token'),
  }),
});

/**
 * Validation schema for accepting invitation
 */
export const acceptInvitationSchema = z.object({
  params: z.object({
    inviteId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid invitation ID'),
  }),
});

/**
 * Validation schema for canceling invitation
 */
export const cancelInvitationSchema = z.object({
  params: z.object({
    inviteId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid invitation ID'),
  }),
});

/**
 * Validation schema for tenant ID param
 */
export const tenantIdParamSchema = z.object({
  params: z.object({
    tenantId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid tenant ID'),
  }),
});

/**
 * Validation schema for checking subdomain availability
 */
export const checkSubdomainSchema = z.object({
  query: z.object({
    subdomain: z
      .string()
      .min(2, 'Subdomain must be at least 2 characters')
      .max(50, 'Subdomain cannot exceed 50 characters')
      .regex(
        /^[a-z0-9-]+$/,
        'Subdomain can only contain lowercase letters, numbers, and hyphens'
      ),
  }),
});
