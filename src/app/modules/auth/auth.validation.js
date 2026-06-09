import * as zod from 'zod';
const { z } = zod;

/**
 * @constant {string[]} userRoleValues
 * @description Defines the allowed user roles within the application.
 */
const userRoleValues = ['tenant', 'landlord', 'admin', 'unauthorized'];

/**
 * @constant {z.ZodObject} UserValidationSchema
 * @description Zod schema for validating user registration or creation data.
 * It includes validation for email, password strength, password confirmation,
 * user role, and optional fields related to profile, confirmation tokens,
 * tenant invitations, and invitation tokens.
 *
 * @property {object} body - The request body containing user data.
 * @property {string} body.email - The user's email address. Must be a valid email format.
 * @property {string} body.password - The user's password. Must be at least 8 characters,
 *   at most 128 characters, and include at least one uppercase letter, one lowercase letter,
 *   one number, and one special character.
 * @property {string} body.confirmPassword - The password confirmation. Must match the `password` field.
 * @property {('tenant'|'landlord'|'admin'|'unauthorized')} [body.role='unauthorized'] - The user's role.
 *   Defaults to 'unauthorized' if not provided.
 * @property {string} [body.profile] - Optional. A string representing the user's profile information.
 * @property {string} [body.confirmationToken] - Optional. A token used for email confirmation.
 * @property {Date} [body.confirmationTokenExpires] - Optional. The expiration date for the confirmation token.
 * @property {string} [body.tenantId] - Optional. The ID of the tenant for invitation-based registration.
 * @property {string} [body.invitationToken] - Optional. A token to auto-accept an invitation upon signup.
 */
const UserValidationSchema = z.object({
  body: z
    .object({
      email: z
        .string()
        .email(), // z.string() already implies the value must be a string and not undefined.
      password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be at most 128 characters')
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~])/,
          'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character'
        ), // z.string() already implies the value must be a string and not undefined.
      confirmPassword: z.string(),
      role: z.enum(userRoleValues).default('unauthorized'),
      profile: z.string().optional(),
      confirmationToken: z.string().optional(),
      confirmationTokenExpires: z.date().optional(),
      tenantId: z.string().optional(), // For invitation-based registration
      invitationToken: z.string().optional(), // Auto-accept invitation on signup
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
 * @property {string} [body.tenantId] - Optional. The ID of the tenant for invitation-based login.
 * @property {string} [body.invitationToken] - Optional. A token to auto-accept an invitation upon login.
 */
const loginZodSchema = z.object({
  body: z.object({
    email: z.string({
      required_error: 'Email is required',
    }),
    password: z.string({
      required_error: 'Password is required',
    }),
    tenantId: z.string().optional(), // For invitation-based login
    invitationToken: z.string().optional(), // Auto-accept invitation on login
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
 * @property {z.ZodObject} UserValidationSchema - Schema for user registration/creation.
 * @property {z.ZodObject} loginZodSchema - Schema for user login.
 * @property {z.ZodObject} refreshTokenZodSchema - Schema for refresh token validation.
 */
export const AuthValidation = {
  UserValidationSchema,
  loginZodSchema,
  refreshTokenZodSchema,
};