import * as zod from 'zod';
const { z } = zod;


const userRoleValues = ['tenant', 'landlord', 'admin', 'unauthorized'];

const UserValidationSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email()
      .refine(value => value !== undefined, {
        message: 'Please provide a unique email',
      }),
    password: z
      .string()
      .refine(value => value !== undefined, {
        message: 'Please provide a password',
      }),
    confirmPassword: z.string(),
    role: z.enum(userRoleValues).default('unauthorized'),
    profile: z.string().optional(),
    confirmationToken: z.string().optional(),
    confirmationTokenExpires: z.date().optional(),
    tenantId: z.string().optional(), // For invitation-based registration
    invitationToken: z.string().optional(), // Auto-accept invitation on signup
  }).superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        path: ['confirmPassword'],
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
      });
    }
  })
});
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

const refreshTokenZodSchema = z.object({
  cookies: z.object({
    refreshToken: z.string({
      required_error: 'Refresh Token is required',
    }),
  }),
});

export const AuthValidation = {
  UserValidationSchema,
  loginZodSchema,
  refreshTokenZodSchema,
};
