import * as zod from 'zod';
const { z } = zod;

/**
 * @constant {string[]} userRoleValues
 * @description Defines the allowed user roles within the application, reflecting the hierarchy.
 * - super_admin: Platform owner with unrestricted access.
 * - admin: Workspace/tenant owner, manages users and settings within their tenant.
 * - manager: Manages teams and projects, has more permissions than a standard user.
 * - user: Standard user with basic permissions.
 */
const userRoleValues = ['super_admin', 'admin', 'manager', 'user'];

/**
 * @constant {z.ZodObject} UserValidationSchema
 * @description Zod schema for validating public user registration data.
 * This schema is intended for endpoints where users sign themselves up.
 * It intentionally omits 'role' and other sensitive fields to prevent privilege escalation.
 * Role assignment for self-registered users should be handled server-side (e.g., defaulting to 'user').
 *
 * @property {object} body - The request body containing user data.
 * @property {string} body.email - The user's email address. Must be a valid email format.
 * @property {string} body.password - The user's password. Must meet strength requirements.
 * @property {string} body.confirmPassword - The password confirmation. Must match the `password` field.
 * @property {string} [body.profile] - Optional. A string representing the user's profile information.
 * @property {string} [body.tenantId] - Optional. The ID of the tenant for invitation-based registration.
 * @property {string} [body.invitationToken] - Optional. A token to auto-accept an invitation upon signup.
 */
const UserValidationSchema = z.object({
  body: z
    .object({
      email: z
        .string({ required_error: 'Email is required' })
        .email('Invalid email address')
        .trim()
        .toLowerCase(),
      password: z
        .string({ required_error: 'Password is required' })
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be at most 128 characters')
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~])/,
          'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character',
        ),
      confirmPassword: z.string({
        required_error: 'Password confirmation is required',
      }),
      // Security Patch: Sanitize profile input to prevent stored XSS by stripping HTML tags.
      // This is a defense-in-depth measure. Output encoding on the client-side is still essential.
      profile: z
        .string()
        .optional()
        .transform(val => (val ? val.replace(/<[^>]*>?/gm, '') : val)),
      // For invitation-based registration to a specific workspace/tenant.
      // The token's validity and association with the tenantId must be verified server-side.
      tenantId: z.string().optional(),
      invitationToken: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.password !== data.confirmPassword) {
        ctx.addIssue({
          path: ['confirmPassword'],
          code: z.ZodIssueCode.custom,
          message: 'Passwords do not match',
        });
      }
    }),
});

/**
 * @constant {z.ZodObject} AdminCreateUserValidationSchema
 * @description Zod schema for validating user creation data when performed by an admin.
 * This schema is for protected endpoints and allows specifying a role for the new user.
 *
 * @property {object} body - The request body containing user data.
 * @property {string} body.email - The new user's email address.
 * @property {string} body.password - The new user's initial password.
 * @property {string} body.confirmPassword - The password confirmation.
 * @property {('admin'|'manager'|'user')} body.role - The role to assign to the new user.
 *   'super_admin' is intentionally excluded to prevent privilege escalation by tenant admins.
 * @property {string} [body.profile] - Optional. Profile information for the new user.
 */
const AdminCreateUserValidationSchema = z.object({
  body: z
    .object({
      email: z
        .string({ required_error: 'Email is required' })
        .email('Invalid email address')
        .trim()
        .toLowerCase(),
      password: z
        .string({ required_error: 'Password is required' })
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be at most 128 characters')
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~])/,
          'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character',
        ),
      confirmPassword: z.string({
        required_error: 'Password confirmation is required',
      }),
      // Role assignment by an authorized admin.
      // Super admin creation should be a separate, highly-secured process.
      role: z.enum(['admin', 'manager', 'user'], {
        required_error: 'Role is required',
        invalid_type_error: "Role must be one of 'admin', 'manager', or 'user'",
      }),
      // Security Patch: Sanitize profile input to prevent stored XSS by stripping HTML tags.
      // This is a defense-in-depth measure. Output encoding on the client-side is still essential.
      profile: z
        .string()
        .optional()
        .transform(val => (val ? val.replace(/<[^>]*>?/gm, '') : val)),
    })
    .superRefine((data, ctx) => {
      if (data.password !== data.confirmPassword) {
        ctx.addIssue({
          path: ['confirmPassword'],
          code: z.ZodIssueCode.custom,
          message: 'Passwords do not match',
        });
      }
    }),
});

/**
 * @constant {z.ZodObject} loginZodSchema
 * @description Zod schema for validating user login credentials.
 *
 * @property {object} body - The request body containing login data.
 * @property {string} body.email - The user's email address. Required.
 * @property {string} body.password - The user's password. Required.
 * @property {string} [body.tenantId] - Optional. The ID of the tenant for context-specific login or invitation acceptance.
 * @property {string} [body.invitationToken] - Optional. A token to auto-accept an invitation upon login.
 */
const loginZodSchema = z.object({
  body: z.object({
    email: z
      .string({
        required_error: 'Email is required',
      })
      .email('Invalid email address')
      .trim()
      .toLowerCase(),
    password: z.string({
      required_error: 'Password is required',
    }),
    // Optional fields for workflows like accepting an invitation upon first login.
    // Server-side logic must validate the token and associate the user with the tenant.
    tenantId: z.string().optional(),
    invitationToken: z.string().optional(),
  }),
});

/**
 * @constant {z.ZodObject} refreshTokenZodSchema
 * @description Zod schema for validating the presence of a refresh token in cookies.
 *
 * @property {object} cookies - The request cookies.
 * @property {string} cookies.refreshToken - The refresh token. Required.
 */
const refreshTokenZodSchema = z.object({
  cookies: z.object({
    refreshToken: z.string({
      required_error: 'Refresh Token is required',
    }),
  }),
});

/**
 * @exports {object} AuthValidation
 * @description An object containing all authentication-related Zod validation schemas.
 * These schemas are used to validate incoming request data for various authentication
 * operations like user registration, login, and token refreshing.
 *
 * @property {z.ZodObject} UserValidationSchema - Schema for public user registration.
 * @property {z.ZodObject} AdminCreateUserValidationSchema - Schema for user creation by an admin.
 * @property {z.ZodObject} loginZodSchema - Schema for user login.
 * @property {z.ZodObject} refreshTokenZodSchema - Schema for refresh token validation.
 */
export const AuthValidation = {
  UserValidationSchema,
  AdminCreateUserValidationSchema,
  loginZodSchema,
  refreshTokenZodSchema,
};